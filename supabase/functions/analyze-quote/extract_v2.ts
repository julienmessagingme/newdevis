/**
 * supabase/functions/analyze-quote/extract_v2.ts
 *
 * 🟢 Phase 3.1 (2026-06-24) — Nouveau pipeline d'extraction "structure d'abord"
 *
 * Refonte de extract.ts selon docs/refonte/PHASE3-ARCHITECTURE.md :
 *
 *   • UN SEUL appel Gemini 2.5-flash avec sortie JSON strict
 *   • Le prompt est en 2 sections solidaires :
 *       A. CARTOGRAPHIE (faite UNE FOIS) — colonnes, schéma numérotation, devise...
 *       B. LIGNES (rempl. la carte) — type ligne_travaux | sous_total | total | titre_section,
 *                                      avec id_hierarchique, qty, unite, prix_unitaire,
 *                                      montant_total, tags_nature[], texte_brut
 *   • Réconciliation arithmétique côté CODE (module reconciliation.ts) :
 *       qty × prix_u ≈ montant — calcule le 3e si 2 connus
 *       sous_total ≈ Σ lignes filles
 *       total ≈ Σ sous_totaux − remise
 *   • Confiance par champ (lu / calcule / deduit / absent)
 *   • Confiance globale du devis (certifie / indicatif / non_comparable)
 *   • Tags nature par ligne (ancre_surfacique / annexe_correlee / ligne_transverse)
 *     → prérequis Phase 4 (rattachement annexes au coût unitaire)
 *
 * RUSTINES MÉTIER CONSERVÉES (6) :
 *   R1  detectIncompleteQuote — devis résumé par lot
 *   R2  PHYSICAL_UNIT_NAMES étendu
 *   R4  detectQuoteCountry — devis étranger
 *   R7  whitelist enum estimation_courtier
 *   R8  whitelist enum hors_scope + hors_scope_categorie
 *   R10 validation clauses_litigieuses
 *
 * RUSTINES EXTRACTION RETIRÉES (4) :
 *   R3  sanitizeEntrepriseNom — couvert par cartographie en-tête
 *   R5  RECAP_PATTERNS — couvert par type ∈ {sous_total, total}
 *   R6  Filtre titres section — couvert par type=titre_section
 *   R9  Swap HT/TTC inversé — couvert par réconciliation arithmétique
 *
 * STATUT : code mort tant que pas appelé. Pas de risque prod.
 * À activer via feature flag EXTRACT_V2_ENABLED (Phase 3.2 shadow run).
 */

import type { ExtractedData, ClauseLitigieuse, DocumentType } from "./types.ts";
import { PipelineError, repairTruncatedJson } from "./utils.ts";
import { detectQuoteCountry } from "./country.ts";
import {
  reconcileDevis,
  type LigneInput,
  type SectionInput,
  type DevisReconcilie,
  type ConfianceGlobale,
  type TagNature,
} from "./reconciliation.ts";

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

const GEMINI_FILES_URL = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const GEMINI_GENERATE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const UPLOAD_TIMEOUT_MS = 10_000;
const GENERATE_TIMEOUT_MS = 80_000;

// R2 KEPT — PHYSICAL_UNIT_NAMES utilisé par detectIncompleteQuote
const PHYSICAL_UNIT_NAMES = new Set<string>([
  "m2",
  "m²",
  "ml",
  "kg",
  "h",
  "m3",
  "m³",
  "l",
  "t",
  "u",
  "u.",
  "pce",
  "pcs",
  "p.",
  "piece",
  "pièce",
]);

// R10 KEPT — types de clauses litigieuses
const CLAUSE_TYPES_WHITELIST = new Set([
  "devis_facture_si_non_signe",
  "pas_de_retractation",
  "penalite_annulation_excessive",
  "soustraitance_libre",
  "modification_unilaterale",
]);

// R7 + R8 KEPT — whitelist enum type_document
const TYPE_DOCUMENT_WHITELIST: DocumentType[] = [
  "devis_travaux",
  "facture",
  "diagnostic_immobilier",
  "estimation_courtier",
  "autre",
];
// On accepte aussi "hors_scope" mais on le map vers "autre" pour la rétrocompat
// (le champ hors_scope_categorie est conservé pour distinguer)
const HORS_SCOPE_CATEGORIES_WHITELIST = new Set([
  "reparation_vehicule",
  "reparation_electromenager",
  "achat_biens",
  "service_personnel",
  "medical",
  "veterinaire",
  "autre",
]);

// ──────────────────────────────────────────────────────────────────────────────
// Types V2 — structure de sortie du nouveau prompt
// ──────────────────────────────────────────────────────────────────────────────

export type LigneType = "ligne_travaux" | "sous_total" | "total" | "titre_section";

export interface LigneV2 {
  id_hierarchique: string;
  type: LigneType;
  libelle: string;
  quantite: number | null;
  unite: string | null;
  prix_unitaire: number | null;
  montant_total: number | null;
  tags_nature: TagNature[];
  texte_brut: string;
  page?: number;
}

export interface SectionV2 {
  id_hierarchique: string;
  libelle: string;
  sous_total_lu: number | null;
  lignes: LigneV2[];
}

export interface CartographieV2 {
  colonnes: string[];
  schema_numerotation: "N" | "N.M" | "N.M.K" | "absent";
  devise: string;
  sous_totaux_presents: boolean;
  multi_devis: boolean;
  pages_total: number | null;
}

/**
 * Sortie enrichie V2 : étend ExtractedData v1 (rétrocompat conclusion.ts)
 * avec les métadonnées V2 nécessaires à Phase 4.
 */
export interface ExtractedDataV2 extends ExtractedData {
  /** Cartographie de la grille du devis (Section A du prompt) */
  cartographie: CartographieV2;
  /** Sections structurées avec hiérarchie + lignes typées */
  sections_v2: SectionV2[];
  /** Devis après réconciliation arithmétique côté code */
  reconciliation: DevisReconcilie;
  /** Confiance globale calculée — pondère le verdict Phase 4 */
  confiance_globale: ConfianceGlobale;
  /** Stamp pour identifier qu'on est sur v2 */
  extract_engine: "v2";
}

// ──────────────────────────────────────────────────────────────────────────────
// Prompt v2 — structure d'abord
// ──────────────────────────────────────────────────────────────────────────────

function buildPromptV2(): string {
  return `Tu es un OCR de devis BTP français. Tu lis un PDF de devis et tu retournes un JSON STRICT.

Le devis est un tableau structuré avec colonnes (numéro, désignation, unité, quantité, prix unitaire, montant, TVA).
Avant TOUTE extraction de ligne, tu cartographies le tableau UNE FOIS. Puis tu remplis cette carte avec les lignes.

═══════════════════════════════════════════════════════════════════════════════
SECTION A — CARTOGRAPHIE (à faire UNE FOIS, avant la section B)
═══════════════════════════════════════════════════════════════════════════════

Observe le tableau principal du devis et remplis le champ "cartographie" du JSON :

  "cartographie": {
    "colonnes": [...],                // liste ordonnée des colonnes du tableau
                                       // valeurs possibles : "numero", "designation", "unite",
                                       // "quantite", "prix_unitaire", "montant_ht", "tva", "remise"
    "schema_numerotation": "...",      // "N" (1, 2, 3) | "N.M" (1.1, 1.2) | "N.M.K" (1.1.1) | "absent"
    "devise": "EUR",                   // ISO code (EUR, CHF, ...)
    "sous_totaux_presents": true,      // true s'il y a des lignes "Sous-total X" entre sections
    "multi_devis": false,              // true si le PDF contient plusieurs devis (artisans différents)
    "pages_total": 2                   // nombre de pages du devis (peut être null si inconnu)
  }

Cette cartographie est OBLIGATOIRE. Toutes les extractions de la section B s'y réfèrent.

═══════════════════════════════════════════════════════════════════════════════
SECTION B — LIGNES STRUCTURÉES (remplit la carte ci-dessus)
═══════════════════════════════════════════════════════════════════════════════

Les sections du devis sont remplies dans le champ "sections" du JSON :

  "sections": [
    {
      "id_hierarchique": "1",
      "libelle": "Salle de bain",        // Titre de la section (lu sur le devis)
      "sous_total_lu": 7330,              // Sous-total HT lu s'il est affiché, sinon null
      "lignes": [
        {
          "id_hierarchique": "1.1",       // Numéro de ligne du devis tel qu'écrit
          "type": "ligne_travaux",        // OU "sous_total" OU "total" OU "titre_section"
          "libelle": "Pose carrelage sol",// TEXTE EXACT depuis la colonne désignation
          "quantite": 85,                  // Depuis la colonne quantité (null si cellule vide)
          "unite": "m2",                   // Depuis la colonne unité (null si absent)
          "prix_unitaire": 30,            // Depuis la colonne prix_unitaire (null si absent)
          "montant_total": 2550,          // Depuis la colonne montant_ht
          "tags_nature": ["ancre_surfacique"],  // au choix : ancre_surfacique | annexe_correlee | ligne_transverse
          "texte_brut": "1.1 Pose carrelage sol  85 m²  30,00  2550,00",  // Ligne entière telle qu'écrite
          "page": 1                        // n° de page (1-indexed) où la ligne apparaît
        }
      ]
    }
  ]

═══════════════════════════════════════════════════════════════════════════════
RÈGLES ABSOLUES (à respecter sans exception)
═══════════════════════════════════════════════════════════════════════════════

1. **JAMAIS de mélange description / montant entre lignes du tableau.**
   Si la cellule "Désignation" s'étend sur plusieurs lignes physiques du PDF (texte qui passe
   sur 2-3 lignes dans la même cellule), regroupe TOUT le texte de la cellule dans le même
   "libelle" et le même "texte_brut". Le "montant_total" vient de la même position (même cellule
   "Montant"). NE JAMAIS prendre un montant d'une autre cellule sous prétexte qu'elle est plus proche.

2. **type="titre_section"** quand la ligne est un titre N seul (pas N.M) sans qty/prix/montant
   propres, et son montant éventuel = somme des sous-lignes. Ces titres ne sont PAS des prestations
   à compter dans les calculs.

3. **type="sous_total" ou "total"** quand la ligne est explicitement marquée "Sous-total X",
   "Total HT", "TVA Y %", "Total TTC", "Net à payer". Mets-les dans "sections[].lignes" avec
   leur type. JAMAIS dans une ligne "ligne_travaux".

4. **prix_unitaire OBLIGATOIRE si la colonne existe**. Si tu vois "30 €/m²" ou "30 EUR/m²" ou
   un nombre dans la colonne prix_unitaire, c'est prix_unitaire=30. Si la cellule est vraiment
   vide, mets null.

5. **Unité = celle de la ligne courante UNIQUEMENT**. Ne JAMAIS recopier l'unité d'une ligne voisine.
   Si la cellule unité est vide, mets unite=null. Unités acceptées : m2, m², ml, kg, m3, m³, h, l, t,
   forfait, u, pce, unite, unité, pièce. Si tu vois une chaîne qui n'est pas une unité (ex: prix dans
   la colonne unité par erreur), mets unite=null.

6. **tags_nature[]** est OBLIGATOIRE sur chaque "ligne_travaux" :
   - "ancre_surfacique" : poste avec unité m²/ml/m³ qui constitue un ouvrage principal
     (ex: "Pose carrelage sol", "Pose faïence murale", "Peinture murs intérieurs")
   - "annexe_correlee" : poste sans unité propre qui dépend d'un ancrage du même métier
     (ex: "Ragréage chape", "Primaire d'accrochage", "Joints silicone périphérie", "Dépose carrelage")
   - "ligne_transverse" : poste qui s'applique à tout le chantier
     (ex: "Nettoyage fin chantier", "Évacuation déchets", "Échafaudage location", "Mise à disposition")
   Plusieurs tags possibles. Mets [] si vraiment inclassable.

7. **Multi-devis** : si tu vois plusieurs blocs avec des numéros de devis différents OU des
   entreprises différentes en en-tête, retourne multi_devis=true et tu structures comme des
   sections distinctes (id_hierarchique préfixé du nom de l'artisan).

═══════════════════════════════════════════════════════════════════════════════
AUTRES CHAMPS DU JSON (en plus de cartographie + sections)
═══════════════════════════════════════════════════════════════════════════════

  "type_document": "devis_travaux | facture | diagnostic_immobilier | estimation_courtier | hors_scope | autre"
  "courtier_nom": "Renovation Man | Ootravaux | ..." (si estimation_courtier, sinon null)
  "hors_scope_categorie": "reparation_vehicule | reparation_electromenager | achat_biens |
                           service_personnel | medical | veterinaire | autre" (si hors_scope)

  "entreprise": {
    "nom": "Nom commercial exact (pas un fragment de phrase légale)",
    "siret": "14 chiffres sans espaces (ou SIREN 9 si SIRET pas trouvé)",
    "adresse": "Adresse complète si présente",
    "iban": "Format 2 LETTRES + 12-30 alphanum SANS ESPACES NI TIRETS (ex: FR7630066108770002097520110)",
    "tva_intracom": "Format 2 lettres pays + chiffres (ex: FR12345678901)",
    "assurance_decennale_mentionnee": true | false | null,
    "assurance_rc_pro_mentionnee": true | false | null,
    "certifications_mentionnees": ["RGE", "Qualibat", ...]
  }

  "client": {
    "adresse_chantier": "..." | null,
    "code_postal": "5 chiffres" | null,
    "ville": "..." | null
  }

  "paiement": {
    "acompte_pct": 30 | null,
    "acompte_avant_travaux_pct": 60 | null,
    "modes": ["virement", "cheque", "carte_bancaire", "especes"],
    "echeancier_detecte": true | false,
    "modalites_paiement": [
      { "etape": "signature | demarrage | intermediaire | livraison_materiaux | revue_chantier | fin_travaux | reception | autre",
        "pct": 30,
        "description": "30 % à la signature du devis (texte exact si possible, max 200 chars)" }
    ],
    "conditions_paiement": [
      { "type": "acompte | progress | solde",
        "percentage": 30 | null,
        "amount": null | <number>,
        "due_type": "date | delay | milestone | null",
        "due_date": "YYYY-MM-DD" | null,
        "delay_days": null | <number>,
        "label": "Texte EXACT depuis le devis" }
    ]
  }

  "dates": {
    "date_devis": "YYYY-MM-DD" | null,
    "date_validite": "YYYY-MM-DD" | null,
    "date_execution_max": "YYYY-MM-DD" | null
  }

  "totaux": {
    "ht": <number> | null,
    "tva": <number> | null,
    "ttc": <number> | null,
    "taux_tva": 10 | 20 | 5.5 | null,
    "remise_globale": <number> | 0
  }

  "clauses_litigieuses": [
    { "type": "devis_facture_si_non_signe | pas_de_retractation | penalite_annulation_excessive |
              soustraitance_libre | modification_unilaterale",
      "citation": "Texte EXACT mot pour mot depuis le devis (au moins 10 caractères)",
      "gravite": "rouge | orange" }
  ]

  "resume_factuel": "Description factuelle courte du devis (1-2 phrases sans interprétation)"

═══════════════════════════════════════════════════════════════════════════════
RÈGLES MÉTIER (extraction stricte, jamais d'invention)
═══════════════════════════════════════════════════════════════════════════════

- type_document="estimation_courtier" si AU MOINS 2 signaux convergents :
  (1) Nom de marque connu dans en-tête / logo / pied :
      - Courtiers travaux : Renovation Man, Ootravaux, Hellio, Travaux.com, Effy,
        IZI by EDF, Tucoenergie, La Maison Saint-Gobain, Bricoleur du Coin,
        Mes Travaux Solidaires, HomeServe, Quelle Energie, Heero.
      - Syndics de copropriété qui émettent des packs travaux pour leurs
        copropriétaires : FONCIA, Nexity, Citya, Square Habitat, Sergic,
        Imodirect, Lamy.
  (2) Mention explicite "estimation" (et non "devis") dans le titre/corps.
  (3) Phrases types : "estimation à partir des prix du marché", "sera vérifiée
      sur place par un professionnel partenaire", "nous identifions le meilleur
      artisan", "mise en relation", "pack travaux copropriété".
  (4) Ligne "Frais de service [NomCourtier]" ou "Commission" séparée du total
      travaux.
  (5) Méthodologie en étapes affichée où l'artisan est désigné PLUS TARD.
  Ne PAS confondre avec un devis d'artisan classique qui peut mentionner
  "Renovation" dans son nom (ex: "AEB Rénovation" est une vraie entreprise
  individuelle, pas un courtier).

- type_document="hors_scope" si > 50 % des lignes décrivent du non-BTP :
  réparation véhicule, réparation électroménager, achat de biens mobiliers, services personnels,
  prestations médicales/paramédicales, vétérinaires.

- Clauses litigieuses : retourne UNIQUEMENT si la citation existe TEXTUELLEMENT dans le PDF.
  JAMAIS d'invention. Maximum 5 clauses.

- SIRET : 14 chiffres, sans espaces. Si tu vois une séquence 14 chiffres dans le pied de page
  ou tampon (avec ou sans label "SIRET"), restitue-la. Si 13 chiffres, ajoute un 0 dans le NIC
  (ex: 8312285800021 → 83122858000021). Si seulement 9 chiffres (RCS XXX XXX XXX), restitue
  ces 9 chiffres comme SIREN.

- IBAN : cherche sur TOUTES les pages, surtout la dernière. Format 2 lettres pays + 2 chiffres +
  12-30 ALPHANUMÉRIQUES (lettres ET chiffres mélangés sont valides — certaines banques
  françaises comme Crédit Mutuel-CIC mettent des lettres dans le numéro de compte).
  Les séparateurs (espaces, tirets, points) sont à RETIRER : restitue en CONTINU.
  Ex 1 : "FR76-3006-6108-7700-0209-7520-110" → "FR7630066108770002097520110".
  Ex 2 (avec lettre, NE PAS REJETER) : "FR36 3000 2004 5500 0044 5891 W40" →
       "FR3630002004550000445891W40".
  Ex 3 (IBAN belge avec lettres) : "BE68 539 0075 470 34" → "BE68539007547034".
  Règle absolue : NE JAMAIS écarter un IBAN parce qu'il contient une lettre au milieu.
  Restitue exactement ce qui est imprimé, lettres comprises.

═══════════════════════════════════════════════════════════════════════════════
RÉSUMÉ DU FORMAT JSON ATTENDU
═══════════════════════════════════════════════════════════════════════════════

{
  "type_document": "...",
  "courtier_nom": null,
  "hors_scope_categorie": null,
  "cartographie": { ... },
  "sections": [ { id_hierarchique, libelle, sous_total_lu, lignes: [ { ... } ] } ],
  "entreprise": { ... },
  "client": { ... },
  "paiement": { ... },
  "dates": { ... },
  "totaux": { ht, tva, ttc, taux_tva, remise_globale },
  "clauses_litigieuses": [ ... ],
  "resume_factuel": "..."
}

Retourne UNIQUEMENT le JSON. Pas de markdown. Pas de commentaire. Pas de \\\`\\\`\\\` blocs.`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers — upload + appel Gemini
// ──────────────────────────────────────────────────────────────────────────────

async function uploadToGeminiFilesV2(
  fileBytes: Uint8Array,
  mimeType: string,
  googleApiKey: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(`${GEMINI_FILES_URL}?key=${googleApiKey}`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": mimeType,
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Header-Content-Length": fileBytes.length.toString(),
      "X-Goog-Upload-Header-Content-Type": mimeType,
    },
    body: fileBytes,
  });
  if (!response.ok) {
    const txt = await response.text().catch(() => "");
    throw new Error(`Files API upload failed (${response.status}): ${txt.substring(0, 200)}`);
  }
  const result = await response.json();
  const uri: string | undefined = result.file?.uri;
  if (!uri) throw new Error("Files API: no file URI in response");
  return uri;
}

async function callGeminiV2(
  fileUri: string,
  mimeType: string,
  prompt: string,
  googleApiKey: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(`${GEMINI_GENERATE_URL}?key=${googleApiKey}`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { fileData: { fileUri, mimeType } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 32768,
        temperature: 0,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (response.status === 402) {
      throw new PipelineError(
        "AI_PAYMENT_REQUIRED",
        "Crédit IA insuffisant",
        body.substring(0, 200),
      );
    }
    if (response.status === 429) {
      throw new PipelineError(
        "AI_RATE_LIMIT",
        "Modèle IA surchargé",
        body.substring(0, 200),
      );
    }
    throw new PipelineError(
      "AI_GATEWAY_ERROR",
      `Gemini error ${response.status}`,
      body.substring(0, 200),
    );
  }

  const data = await response.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new PipelineError("AI_EMPTY_RESPONSE", "Réponse IA vide");
  return text;
}

// ──────────────────────────────────────────────────────────────────────────────
// Parsing JSON robuste
// ──────────────────────────────────────────────────────────────────────────────

function parseGeminiJsonV2(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch (_e) {
    // Tentative de cleanup
    let cleaned = raw.trim();
    // Strip markdown
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) cleaned = fenceMatch[1].trim();
    // Extract first JSON object
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
    // Trim trailing commas before } or ]
    cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1");
    // Repair truncated JSON
    cleaned = repairTruncatedJson(cleaned);
    try {
      return JSON.parse(cleaned);
    } catch (e2) {
      throw new PipelineError(
        "AI_JSON_PARSE_FAILED",
        "JSON malformé",
        e2 instanceof Error ? e2.message : String(e2),
      );
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// R1 KEPT — Détection devis incomplet
// ──────────────────────────────────────────────────────────────────────────────

function detectIncompleteV2(lignes: LigneV2[]): { is_incomplete: boolean; reason: string } {
  const travauxLignes = lignes.filter((l) => l.type === "ligne_travaux");
  if (travauxLignes.length < 5) {
    return { is_incomplete: false, reason: "" };
  }
  const sansUnite = travauxLignes.filter((l) => {
    const u = (l.unite ?? "").toLowerCase().trim();
    return u === "" || !PHYSICAL_UNIT_NAMES.has(u);
  }).length;
  const qtyTriviale = travauxLignes.filter(
    (l) => l.quantite === null || l.quantite === 1,
  ).length;

  const ratioSansUnite = sansUnite / travauxLignes.length;
  const ratioQtyTriviale = qtyTriviale / travauxLignes.length;

  if (ratioSansUnite >= 0.7 && ratioQtyTriviale >= 0.7) {
    return {
      is_incomplete: true,
      reason: `Devis résumé par lot : ${travauxLignes.length} lignes, ${Math.round(ratioSansUnite * 100)}% sans unité physique, ${Math.round(ratioQtyTriviale * 100)}% qty triviale (1 ou null). Demander à l'artisan un devis détaillé.`,
    };
  }
  return { is_incomplete: false, reason: "" };
}

// ──────────────────────────────────────────────────────────────────────────────
// R10 KEPT — Validation clauses litigieuses
// ──────────────────────────────────────────────────────────────────────────────

function validateClausesV2(raw: any): ClauseLitigieuse[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c) => {
      if (!c || typeof c !== "object") return false;
      if (!CLAUSE_TYPES_WHITELIST.has(c.type)) return false;
      const cit = typeof c.citation === "string" ? c.citation.trim() : "";
      if (cit.length < 10) return false;
      const grav = c.gravite;
      if (grav !== "rouge" && grav !== "orange") return false;
      return true;
    })
    .slice(0, 5)
    .map((c) => ({
      type: c.type,
      citation: String(c.citation).trim().slice(0, 300),
      gravite: c.gravite,
    }));
}

// ──────────────────────────────────────────────────────────────────────────────
// R7 + R8 KEPT — Whitelist enums
// ──────────────────────────────────────────────────────────────────────────────

function validateTypeDocumentV2(raw: any): DocumentType {
  if (typeof raw !== "string") return "autre";
  // Cas spécial : "hors_scope" map vers "autre" pour rétrocompat (mais on garde le champ
  // hors_scope_categorie pour distinguer)
  if (raw === "hors_scope") return "autre";
  if ((TYPE_DOCUMENT_WHITELIST as readonly string[]).includes(raw)) {
    return raw as DocumentType;
  }
  return "autre";
}

function validateHorsScopeCategorieV2(raw: any): string | null {
  if (typeof raw !== "string") return null;
  return HORS_SCOPE_CATEGORIES_WHITELIST.has(raw) ? raw : null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Mapping V2 → ExtractedData (legacy) pour conclusion.ts
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Construit la liste plate "travaux[]" (format legacy) depuis les sections V2.
 * Filtre par défaut : on garde uniquement les lignes type="ligne_travaux".
 * Les sous_total / total / titre_section sont exclus (couvert nativement par v2).
 */
function flattenTravauxLegacy(sections: SectionV2[]): ExtractedData["travaux"] {
  const out: ExtractedData["travaux"] = [];
  for (const s of sections) {
    for (const l of s.lignes) {
      if (l.type !== "ligne_travaux") continue;
      out.push({
        libelle: l.libelle,
        categorie: s.libelle || "travaux",
        montant: l.montant_total,
        quantite: l.quantite,
        unite: l.unite,
      });
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// Orchestrateur principal V2
// ──────────────────────────────────────────────────────────────────────────────

export interface ExtractV2Input {
  /** Bytes du PDF (depuis Storage) */
  fileBytes: Uint8Array;
  /** Mime type — généralement "application/pdf" */
  mimeType: string;
  /** Clé API Gemini */
  googleApiKey: string;
  /** AbortSignal optionnel (pour timeout global) */
  signal?: AbortSignal;
}

export interface ExtractV2Result {
  success: boolean;
  data?: ExtractedDataV2;
  raw_text?: string;
  error?: string;
  errorCode?: string;
}

/**
 * Extraction v2 complète d'un devis PDF.
 *
 * Pipeline :
 *   1. Upload PDF vers Gemini Files API
 *   2. Appel Gemini avec prompt structure-d'abord (responseMimeType=json)
 *   3. Parse JSON (avec repair fallback)
 *   4. Validation enums + clauses (R7, R8, R10 KEPT)
 *   5. Détection incomplete (R1 KEPT)
 *   6. Détection pays (R4 KEPT)
 *   7. Réconciliation arithmétique côté code → confiance globale
 *   8. Construction ExtractedData legacy + ExtractedDataV2 enrichi
 *
 * Conserve le format ExtractedData de v1 pour rétrocompat conclusion.ts.
 * Enrichit avec cartographie, sections_v2, reconciliation, confiance_globale.
 */
export async function extractDataFromDocumentV2(input: ExtractV2Input): Promise<ExtractV2Result> {
  const { fileBytes, mimeType, googleApiKey, signal } = input;

  // 1. Upload
  let fileUri: string;
  try {
    const uploadCtrl = new AbortController();
    const uploadTimer = setTimeout(() => uploadCtrl.abort(), UPLOAD_TIMEOUT_MS);
    try {
      fileUri = await uploadToGeminiFilesV2(
        fileBytes,
        mimeType,
        googleApiKey,
        signal ?? uploadCtrl.signal,
      );
    } finally {
      clearTimeout(uploadTimer);
    }
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Upload failed",
      errorCode: "AI_UPLOAD_FAILED",
    };
  }

  // 2. Appel Gemini
  let rawResponse: string;
  try {
    const genCtrl = new AbortController();
    const genTimer = setTimeout(() => genCtrl.abort(), GENERATE_TIMEOUT_MS);
    try {
      rawResponse = await callGeminiV2(
        fileUri,
        mimeType,
        buildPromptV2(),
        googleApiKey,
        signal ?? genCtrl.signal,
      );
    } finally {
      clearTimeout(genTimer);
    }
  } catch (e) {
    if (e instanceof PipelineError) {
      return { success: false, error: e.message, errorCode: e.code };
    }
    if (e instanceof Error && e.name === "AbortError") {
      return {
        success: false,
        error: "Extraction Gemini a dépassé le délai",
        errorCode: "AI_TIMEOUT",
      };
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : "Gemini call failed",
      errorCode: "AI_GATEWAY_ERROR",
    };
  }

  // 3. Parse
  let parsed: any;
  try {
    parsed = parseGeminiJsonV2(rawResponse);
  } catch (e) {
    if (e instanceof PipelineError) {
      return { success: false, error: e.message, errorCode: e.code, raw_text: rawResponse };
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : "JSON parse failed",
      errorCode: "AI_JSON_PARSE_FAILED",
      raw_text: rawResponse,
    };
  }

  // 4. Validations métier (R7, R8, R10 KEPT)
  const type_document = validateTypeDocumentV2(parsed.type_document);
  const hors_scope_categorie = validateHorsScopeCategorieV2(parsed.hors_scope_categorie);
  const courtier_nom =
    parsed.type_document === "estimation_courtier" && typeof parsed.courtier_nom === "string"
      ? parsed.courtier_nom.trim().slice(0, 100)
      : null;
  const clauses_litigieuses = validateClausesV2(parsed.clauses_litigieuses);

  // 5. Structure sections V2 (avec types lignes)
  const sectionsV2: SectionV2[] = Array.isArray(parsed.sections)
    ? parsed.sections.map((s: any) => ({
        id_hierarchique: String(s.id_hierarchique ?? ""),
        libelle: String(s.libelle ?? "").trim(),
        sous_total_lu: typeof s.sous_total_lu === "number" ? s.sous_total_lu : null,
        lignes: Array.isArray(s.lignes)
          ? s.lignes.map((l: any) => ({
              id_hierarchique: String(l.id_hierarchique ?? ""),
              type:
                l.type === "sous_total" ||
                l.type === "total" ||
                l.type === "titre_section" ||
                l.type === "ligne_travaux"
                  ? l.type
                  : "ligne_travaux",
              libelle: String(l.libelle ?? "").trim(),
              quantite: typeof l.quantite === "number" ? l.quantite : null,
              unite: typeof l.unite === "string" ? l.unite.trim() : null,
              prix_unitaire: typeof l.prix_unitaire === "number" ? l.prix_unitaire : null,
              montant_total: typeof l.montant_total === "number" ? l.montant_total : null,
              tags_nature: Array.isArray(l.tags_nature)
                ? l.tags_nature.filter(
                    (t: any) =>
                      t === "ancre_surfacique" ||
                      t === "annexe_correlee" ||
                      t === "ligne_transverse",
                  )
                : [],
              texte_brut: String(l.texte_brut ?? "").slice(0, 1000),
              page: typeof l.page === "number" ? l.page : undefined,
            }))
          : [],
      }))
    : [];

  // Lignes plates (pour R1 detection + legacy mapping)
  const allLignesV2: LigneV2[] = sectionsV2.flatMap((s) => s.lignes);

  // 6. Détection incomplete (R1 KEPT)
  const { is_incomplete, reason: incompleteReason } = detectIncompleteV2(allLignesV2);

  // 7. Cartographie
  const cartographie: CartographieV2 = {
    colonnes: Array.isArray(parsed.cartographie?.colonnes)
      ? parsed.cartographie.colonnes.map((c: any) => String(c)).filter(Boolean)
      : [],
    schema_numerotation:
      parsed.cartographie?.schema_numerotation === "N" ||
      parsed.cartographie?.schema_numerotation === "N.M" ||
      parsed.cartographie?.schema_numerotation === "N.M.K" ||
      parsed.cartographie?.schema_numerotation === "absent"
        ? parsed.cartographie.schema_numerotation
        : "absent",
    devise:
      typeof parsed.cartographie?.devise === "string"
        ? parsed.cartographie.devise.toUpperCase()
        : "EUR",
    sous_totaux_presents: Boolean(parsed.cartographie?.sous_totaux_presents),
    multi_devis: Boolean(parsed.cartographie?.multi_devis),
    pages_total:
      typeof parsed.cartographie?.pages_total === "number"
        ? parsed.cartographie.pages_total
        : null,
  };

  // 8. Réconciliation arithmétique côté code
  const reconciliationInput = {
    sections: sectionsV2.map(
      (s): SectionInput => ({
        id_hierarchique: s.id_hierarchique,
        libelle: s.libelle,
        sous_total_lu: s.sous_total_lu,
        lignes: s.lignes
          .filter((l) => l.type === "ligne_travaux")
          .map(
            (l): LigneInput => ({
              id_hierarchique: l.id_hierarchique,
              libelle: l.libelle,
              quantite: l.quantite,
              unite: l.unite,
              prix_unitaire: l.prix_unitaire,
              montant_total: l.montant_total,
              tags_nature: l.tags_nature,
              texte_brut: l.texte_brut,
            }),
          ),
      }),
    ),
    total_ht_lu: typeof parsed.totaux?.ht === "number" ? parsed.totaux.ht : null,
    total_tva_lu: typeof parsed.totaux?.tva === "number" ? parsed.totaux.tva : null,
    total_ttc_lu: typeof parsed.totaux?.ttc === "number" ? parsed.totaux.ttc : null,
    remise_appliquee:
      typeof parsed.totaux?.remise_globale === "number" ? parsed.totaux.remise_globale : 0,
  };
  const reconciliation = reconcileDevis(reconciliationInput);
  const confiance_globale: ConfianceGlobale = reconciliation.confiance_globale;

  // 9. R4 KEPT — Détection pays
  const country = detectQuoteCountry({
    entreprise: {
      iban: parsed.entreprise?.iban ?? null,
      tva_intracom: parsed.entreprise?.tva_intracom ?? null,
      adresse: parsed.entreprise?.adresse ?? null,
    },
    totaux: {
      taux_tva: parsed.totaux?.taux_tva ?? null,
    },
  });

  // 10. Construction ExtractedData (legacy compat conclusion.ts)
  const extractedLegacy: ExtractedData = {
    type_document,
    entreprise: {
      nom:
        typeof parsed.entreprise?.nom === "string" ? parsed.entreprise.nom.trim() || null : null,
      siret:
        typeof parsed.entreprise?.siret === "string"
          ? parsed.entreprise.siret.replace(/\s+/g, "") || null
          : null,
      adresse:
        typeof parsed.entreprise?.adresse === "string" ? parsed.entreprise.adresse.trim() : null,
      iban:
        typeof parsed.entreprise?.iban === "string"
          ? parsed.entreprise.iban.replace(/[\s\-–—._]/g, "").toUpperCase()
          : null,
      assurance_decennale_mentionnee:
        typeof parsed.entreprise?.assurance_decennale_mentionnee === "boolean"
          ? parsed.entreprise.assurance_decennale_mentionnee
          : null,
      assurance_rc_pro_mentionnee:
        typeof parsed.entreprise?.assurance_rc_pro_mentionnee === "boolean"
          ? parsed.entreprise.assurance_rc_pro_mentionnee
          : null,
      certifications_mentionnees: Array.isArray(parsed.entreprise?.certifications_mentionnees)
        ? parsed.entreprise.certifications_mentionnees.map((c: any) => String(c)).filter(Boolean)
        : [],
    },
    client: {
      adresse_chantier:
        typeof parsed.client?.adresse_chantier === "string"
          ? parsed.client.adresse_chantier.trim() || null
          : null,
      code_postal:
        typeof parsed.client?.code_postal === "string"
          ? parsed.client.code_postal.trim() || null
          : null,
      ville: typeof parsed.client?.ville === "string" ? parsed.client.ville.trim() || null : null,
    },
    travaux: flattenTravauxLegacy(sectionsV2),
    paiement: {
      acompte_pct:
        typeof parsed.paiement?.acompte_pct === "number" ? parsed.paiement.acompte_pct : null,
      acompte_avant_travaux_pct:
        typeof parsed.paiement?.acompte_avant_travaux_pct === "number"
          ? parsed.paiement.acompte_avant_travaux_pct
          : null,
      modes: Array.isArray(parsed.paiement?.modes)
        ? parsed.paiement.modes.map((m: any) => String(m).toLowerCase()).filter(Boolean)
        : [],
      echeancier_detecte: Boolean(parsed.paiement?.echeancier_detecte),
      modalites_paiement: Array.isArray(parsed.paiement?.modalites_paiement)
        ? parsed.paiement.modalites_paiement
            .filter((m: any) => m && typeof m === "object")
            .map((m: any) => ({
              etape: m.etape ?? "autre",
              pct: typeof m.pct === "number" ? Math.max(0, Math.min(100, m.pct)) : 0,
              description: String(m.description ?? "").slice(0, 200),
            }))
        : [],
      conditions_paiement: Array.isArray(parsed.paiement?.conditions_paiement)
        ? parsed.paiement.conditions_paiement
            .filter((c: any) => c && typeof c === "object")
            .map((c: any) => ({
              type:
                c.type === "acompte" || c.type === "progress" || c.type === "solde"
                  ? c.type
                  : "acompte",
              percentage: typeof c.percentage === "number" ? c.percentage : null,
              amount: typeof c.amount === "number" ? c.amount : null,
              due_type:
                c.due_type === "date" || c.due_type === "delay" || c.due_type === "milestone"
                  ? c.due_type
                  : null,
              due_date: typeof c.due_date === "string" ? c.due_date : null,
              delay_days: typeof c.delay_days === "number" ? c.delay_days : null,
              label: String(c.label ?? "").slice(0, 200),
            }))
        : [],
    },
    dates: {
      date_devis: typeof parsed.dates?.date_devis === "string" ? parsed.dates.date_devis : null,
      date_validite:
        typeof parsed.dates?.date_validite === "string" ? parsed.dates.date_validite : null,
      date_execution_max:
        typeof parsed.dates?.date_execution_max === "string"
          ? parsed.dates.date_execution_max
          : null,
    },
    totaux: {
      ht: typeof parsed.totaux?.ht === "number" ? parsed.totaux.ht : null,
      tva: typeof parsed.totaux?.tva === "number" ? parsed.totaux.tva : null,
      ttc: typeof parsed.totaux?.ttc === "number" ? parsed.totaux.ttc : null,
      taux_tva: typeof parsed.totaux?.taux_tva === "number" ? parsed.totaux.taux_tva : null,
    },
    anomalies_detectees: Array.isArray(parsed.anomalies_detectees)
      ? parsed.anomalies_detectees.map((a: any) => String(a)).filter(Boolean)
      : [],
    resume_factuel:
      typeof parsed.resume_factuel === "string"
        ? parsed.resume_factuel.slice(0, 500)
        : "",
    tva_non_applicable:
      typeof parsed.tva_non_applicable === "boolean" ? parsed.tva_non_applicable : null,
    devis_manuscrit:
      typeof parsed.devis_manuscrit === "boolean" ? parsed.devis_manuscrit : null,
    materiaux_fournis_client:
      typeof parsed.materiaux_fournis_client === "boolean"
        ? parsed.materiaux_fournis_client
        : null,
    multiple_quotes: cartographie.multi_devis || Boolean(parsed.multiple_quotes),
    devis_list: undefined, // construction multi-devis détaillée reportée à 3.1.b
    country_code: country?.country_code,
    country_label: country?.country_label,
    // FIX 2026-06-30 : detectQuoteCountry retourne `is_foreign` (cf. country.ts CountryDetectionResult),
    // pas `is_foreign_quote`. Bug de copie V1->V2 qui faisait perdre le bypass devis étranger.
    // Cas test : invoice (48).pdf Stone Gardens BE — V2 lisait IBAN BE mais is_foreign=false.
    is_foreign_quote: country?.is_foreign ?? false,
    courtier_nom,
    hors_scope_categorie,
    is_incomplete_quote: is_incomplete,
    incomplete_quote_reason: is_incomplete ? incompleteReason : null,
    clauses_litigieuses,
  };

  // 11. Sortie enrichie V2
  const dataV2: ExtractedDataV2 = {
    ...extractedLegacy,
    cartographie,
    sections_v2: sectionsV2,
    reconciliation,
    confiance_globale,
    extract_engine: "v2",
  };

  return {
    success: true,
    data: dataV2,
    raw_text: rawResponse,
  };
}
