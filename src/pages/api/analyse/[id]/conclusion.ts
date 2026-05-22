export const prerender = false;
export const config = { maxDuration: 60 };

/**
 * POST /api/analyse/[id]/conclusion
 *
 * Génère (ou retourne le cache de) la conclusion experte IA d'une analyse de devis.
 * Appelle Gemini pour produire :
 *   - Une phrase de verdict global
 *   - La liste des anomalies avec prix unitaires et surcoûts
 *   - La justification du reste du devis
 *
 * Stocke le résultat JSON dans analyses.conclusion_ia pour éviter de refacturer.
 */

import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";
import { jsonOk, jsonError, optionsResponse } from "@/lib/api/apiHelpers";

// Version du moteur de scoring — incrémenter à chaque changement de logique pour
// invalider automatiquement le cache `conclusion_ia` des analyses existantes.
const ENGINE_VERSION = "3.4.28";

// ──────────────────────────────────────────────────────────────────────────────
// Matérialité du surcoût serveur — triple garde alignée sur computeVerdict V3.1
// ──────────────────────────────────────────────────────────────────────────────
// Un surcoût n'est "matériel" (= digne d'escalader le verdict ou de bannir les
// wordings positifs) que si :
//   1. son montant absolu dépasse un seuil (sinon "ridicule de renégocier")
//   2. son poids relatif sur le devis dépasse un seuil (sinon noise statistique)
//
// Exemples :
//   - Devis 48 000 € + surcout 180 €  → 0.4% → NON MATÉRIEL → pas d'escalade
//   - Devis 48 000 € + surcout 1 500 € → 3.1% → MATÉRIEL → escalade
//   - Devis 16 000 € + surcout 3 400 € → 21%  → MATÉRIEL → escalade (Kern)
//   - Devis 100 000 € + surcout 2 000 € → 2%  → NON MATÉRIEL → pas d'escalade
//
// Sans cette double garde, on recrée le bug inverse (faux orange sur micro-écarts).
const MATERIAL_SURCOUT_EUR_THRESHOLD = 1000;   // €
const MATERIAL_SURCOUT_PCT_THRESHOLD = 0.03;   // 3% du total devis

function isMaterialServerSurcout(
  surcoutMax: unknown,
  totalDevis: unknown,
  fallbackTotal?: unknown,
): boolean {
  if (typeof surcoutMax !== "number" || surcoutMax <= MATERIAL_SURCOUT_EUR_THRESHOLD) return false;
  // V3.3 — accepte un fallback (typiquement marketPosition.totalDevis) quand le totalHT
  // principal n'a pas été extrait par Gemini. Sans ce fallback, la garde de cohérence
  // était inopérante sur les devis qui stockent en format legacy.
  const effectiveTotal = (typeof totalDevis === "number" && totalDevis > 0)
    ? totalDevis
    : (typeof fallbackTotal === "number" && fallbackTotal > 0 ? fallbackTotal : 0);
  if (effectiveTotal <= 0) return false;
  const ratio = surcoutMax / effectiveTotal;
  return ratio > MATERIAL_SURCOUT_PCT_THRESHOLD;
}

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

import type { AnomalieConclusion, ConclusionData } from "@/lib/analyse/conclusionTypes";
export type { AnomalieConclusion, ConclusionData } from "@/lib/analyse/conclusionTypes";
import {
  computeVerdict, computeMarketBounds, countMajorAnomalies,
  extractFlagsFromCriteria, extractCompanyRisk, generateVerdictReasons,
  extractCompanyStatusFromCriteria, computeWeightedAnomalies,
} from "@/lib/analyse/verdictEngine";

// ── Helpers ───────────────────────────────────────────────────────────────────

// "f" et "fft" = abréviations françaises de "forfait" courantes dans les devis BTP
const FORFAIT_UNIT_KEYWORDS = ["forfait", "global", "prestation", "ensemble", "installation complète", "f", "fft", "ff", "ens"];

// Postes dont la comparaison marché se fait en m² mais que l'artisan peut facturer en U/forfait
const SURFACE_WORK_KEYWORDS = [
  "cloison", "doublage", "contre-cloison", "peinture", "enduit", "lasure",
  "carrelage", "faïence", "parquet", "plancher", "ragréage", "chape",
  "isolation", "isol", "plafond", "toile de verre", "papier peint",
  "revêtement sol", "revêtement mur", "sol stratifié", "moquette",
];
// Équipements/appareils vendus naturellement à l'unité → jamais en m²
const EQUIPMENT_KEYWORDS = [
  "chauffe-eau", "chauffe eau", "cumulus", "ballon",
  "climatisation", "climatiseur", "clim", "split",
  "pompe à chaleur", "pompe a chaleur", "pac",
  "radiateur", "convecteur", "sèche-serviette", "seche serviette",
  "chaudière", "chaudiere", "poêle", "poele",
  "ventilation", "vmc", "extracteur",
  "robinet", "mitigeur", "sanitaire", "wc", "toilette",
  "porte", "fenêtre", "fenetre", "baie", "volet",
  "tableau électrique", "tableau electrique", "disjoncteur",
];
const M2_UNITS = ["m²", "m2", "m ²", "mètre carré", "metre carre", "m2 ht", "m² ht"];
const UNIT_LIKE = ["u", "unité", "unité", "unite", "forfait", "ens", "ensemble",
                   "prestation", "pce", "pièce", "piece", "lot", "global", "art", "article"];

/**
 * Extrait la surface totale en m² connue depuis les lignes du groupe.
 * Cherche les lignes ayant une unité m² avec une quantité positive.
 * Retourne null si aucune surface explicite trouvée.
 */
function extractKnownSurface(lines: any[]): number | null {
  let total = 0;
  for (const l of lines) {
    const u = (l.unit || l.unite || "").toLowerCase().trim();
    const qty = typeof l.quantity === "number" ? l.quantity
      : typeof l.quantite === "number" ? l.quantite : 0;
    if (qty > 0 && M2_UNITS.some(m => u.includes(m))) {
      total += qty;
    }
  }
  return total > 0 ? total : null;
}

function hasSurfaceUnitMismatch(group: Record<string, any>): boolean {
  const label = (group.job_type_label || "").toLowerCase();
  const unit  = (group.main_unit || "").toLowerCase().trim();
  const lines: any[] = group.devis_lines || [];

  // Exclure les équipements vendus à l'unité par nature
  if (EQUIPMENT_KEYWORDS.some(kw => label.includes(kw))) return false;
  // Vérifier aussi dans les lignes du groupe (au cas où le label Gemini est générique)
  const allDescriptions = lines.map((l: any) => (l.description || "").toLowerCase()).join(" ");
  if (EQUIPMENT_KEYWORDS.some(kw => allDescriptions.includes(kw))) return false;

  // Le poste doit être de nature surfacique (label OU lignes)
  const isSurfaceWork = SURFACE_WORK_KEYWORDS.some(kw => label.includes(kw)) ||
    lines.some((l: any) => SURFACE_WORK_KEYWORDS.some(kw =>
      (l.description || "").toLowerCase().includes(kw)
    ));
  if (!isSurfaceWork) return false;

  // L'unité ne doit PAS être m²
  const isM2 = M2_UNITS.some(u => unit.includes(u));
  const isUnitLike = UNIT_LIKE.some(u => unit === u || unit.startsWith(u + " "));
  if (!(!isM2 && isUnitLike)) return false;

  // Si la surface est explicitement connue via une ligne m² dans le groupe, pas de mismatch
  const knownSurface = extractKnownSurface(lines);
  if (knownSurface !== null) return false;

  return true;
}

/**
 * V3.2.3 — Score de confiance pour le mismatch surface/unité, retourné dans [0, 1].
 *
 * `hasSurfaceUnitMismatch` retourne un bool brut basé sur des heuristiques qui peuvent
 * se tromper (extraction Gemini défaillante sur l'unité, label ambigu). Si la fonction
 * retourne `true` à tort, on injecte une action "Demandez la surface en m²" qui est
 * **ridicule pour le user** (il sait déjà sa surface, c'est juste qu'on ne l'a pas extraite).
 *
 * Ce score additionne plusieurs signaux convergents et permet d'appliquer un SEUIL ÉLEVÉ
 * avant de générer l'action. On préfère rater quelques mismatches réels que produire
 * des actions absurdes — la crédibilité passe avant l'exhaustivité.
 *
 * Échelle :
 *   0.00–0.60 : signal faible — ne pas générer d'action surface
 *   0.60–0.80 : signal moyen — déclenchement optionnel
 *   0.80–1.00 : signal fort — déclenchement recommandé
 *
 * Seuil recommandé pour générer une action : >= 0.70 (cf. emitSurfaceActions).
 */
function surfaceMismatchConfidence(group: Record<string, any>): number {
  // Pré-condition : le mismatch heuristique de base doit déjà tenir
  if (!hasSurfaceUnitMismatch(group)) return 0;

  const label = (group.job_type_label || "").toLowerCase();
  const unit  = (group.main_unit || "").toLowerCase().trim();
  const lines: any[] = group.devis_lines || [];
  const descriptions: string[] = lines.map((l: any) => (l.description || "").toLowerCase());

  let confidence = 0;

  // (1) Le label match un mot-clé surface → +0.30 (signal fort, label vient de Gemini groupement)
  if (SURFACE_WORK_KEYWORDS.some(kw => label.includes(kw))) {
    confidence += 0.30;
  }

  // (2) Une description match un mot-clé surface → +0.20 (signal fort)
  //     Plusieurs descriptions matchent → +0.10 supplémentaire (renforce la conviction)
  const matchingDescCount = descriptions.filter(d =>
    SURFACE_WORK_KEYWORDS.some(kw => d.includes(kw))
  ).length;
  if (matchingDescCount >= 1) confidence += 0.20;
  if (matchingDescCount >= 2) confidence += 0.10;

  // (3) L'unité est explicitement dans UNIT_LIKE (pas vide ou ambiguë) → +0.20
  //     Une unité bien identifiée renforce le diagnostic. Une unité vide affaiblit.
  if (unit.length > 0 && UNIT_LIKE.some(u => unit === u || unit.startsWith(u + " "))) {
    confidence += 0.20;
  }

  // (4) Aucune ligne m² dans le groupe → +0.15 (déjà vérifié par hasSurfaceUnitMismatch,
  //     mais on le récompense explicitement pour aligner avec le narratif "surface non
  //     précisée"). Si une description CONTIENT "m²" en texte libre sans être l'unité
  //     officielle de la ligne → on baisse la confiance (Gemini a peut-être loupé l'extraction).
  const knownSurface = extractKnownSurface(lines);
  if (knownSurface === null) {
    confidence += 0.15;
    // Soft penalty : si une description mentionne "m²" en texte libre, c'est suspect
    const hasM2InDescription = descriptions.some(d => /\bm[²2]\b/.test(d));
    if (hasM2InDescription) confidence -= 0.15;
  }

  // (5) Quantité = 1 ou 2 (cohérent avec un forfait) → +0.05
  //     Une quantité plus élevée évoque un U comptable (5 portes, 10 cloisons), pas un forfait.
  const mainQty = typeof group.main_quantity === "number" ? group.main_quantity : 0;
  if (mainQty >= 1 && mainQty <= 2) confidence += 0.05;

  return Math.max(0, Math.min(1, confidence));
}

// Seuil au-dessus duquel on génère une action "Demandez la surface". En dessous,
// on s'abstient pour ne pas demander au user de fournir une info qu'il a déjà donnée.
const SURFACE_MISMATCH_ACTION_THRESHOLD = 0.70;

/**
 * Calcule le surcoût total côté serveur depuis les données brutes priceData,
 * en utilisant la même formule que quoteGlobalAnalysis.ts (côté client).
 * Garantit la cohérence entre GlobalAnalysisCard et ConclusionIA.
 *
 * Surcoût = Σ (devis_total_ht − theoreticalMaxHT) pour les postes où devis > max
 * theoreticalMaxHT = Σ (price_max_unit_ht × qty + fixed_max_ht)
 */
function computeServerSurcout(priceData: unknown[]): { min: number; max: number } {
  if (!Array.isArray(priceData)) return { min: 0, max: 0 };

  let surcoutEstime = 0;

  for (const g of priceData) {
    if (!g || typeof g !== "object") continue;
    const group = g as Record<string, any>;

    if (group.job_type_label === "Autre") continue;

    const devisTotal: number = typeof group.devis_total_ht === "number" ? group.devis_total_ht : 0;
    if (devisTotal <= 0) continue;

    const prices: any[] = Array.isArray(group.prices) ? group.prices : [];
    if (prices.length === 0) continue;

    // Exclure les forfaits et les mismatches surface/unité (comparaison non fiable)
    const unit = ((group.main_unit as string) || "").toLowerCase().trim();
    if (FORFAIT_UNIT_KEYWORDS.some((kw) => unit === kw || unit.startsWith(kw))) continue;
    if (hasSurfaceUnitMismatch(group)) continue;
    // V3.4.1 — exclure aussi les groupes hétérogènes : leur prix unitaire calculé
    // n'a pas de sens face au max marché du domaine principal détecté.
    // Sans ce filtre, on additionnait des "surcouts" qui venaient de groupes
    // contenant chape + primaire + dalle + acier comptés comme du carrelage seul.
    if (isLikelyHeterogeneousGroup(group)) continue;

    const qty: number = typeof group.main_quantity === "number" && group.main_quantity > 0
      ? group.main_quantity : 1;

    // Calcule theoreticalMaxHT (identique à useMarketPriceAPI.ts)
    let theoreticalMaxHT = 0;
    for (const p of prices) {
      theoreticalMaxHT +=
        (typeof p.price_max_unit_ht === "number" ? p.price_max_unit_ht : 0) * qty +
        (typeof p.fixed_max_ht      === "number" ? p.fixed_max_ht      : 0);
    }
    if (theoreticalMaxHT <= 0) continue;

    if (devisTotal > theoreticalMaxHT) {
      surcoutEstime += devisTotal - theoreticalMaxHT;
    }
  }

  return {
    min: Math.round(surcoutEstime * 0.7),
    max: Math.round(surcoutEstime * 1.3),
  };
}
// ── Sanitisation texte LLM ───────────────────────────────────────────────────

/**
 * Supprime les formulations contradictoires avec le verdict dans les textes générés par Gemini.
 * Appelé AVANT toute persistance ou affichage.
 *
 * V3.2 (2026-05-11) — Sanitization en 2 niveaux :
 * - ALWAYS_FORBIDDEN : phrases bannies QUEL QUE SOIT le verdict, parce qu'elles ont
 *   systématiquement créé des contradictions à l'écran (ex: "prix attractif sous la
 *   moyenne" sur un devis avec +5 000 € détectés en surcoût postes).
 * - CONDITIONAL_FORBIDDEN : phrases bannies seulement si verdict ≠ signer.
 *
 * Cette double protection sert de filet de sécurité ultime — même si le LLM contourne
 * les règles du prompt, on neutralise les contradictions avant persistance.
 */
function sanitizeLLMText(
  text: string,
  verdict: "signer" | "a_negocier" | "refuser",
  hasServerSurcout: boolean = false,
): string {
  if (!text) return text;

  let result = text;

  // ── Niveau 1 — toujours interdit (anti-hallucination universelle) ────────────
  // Ces termes sont systématiquement source de contradiction à l'écran.
  // Bug Kern Terrassement : "Prix attractif — 6 k€ sous la moyenne" affiché alors que
  // computeServerSurcout retournait +3 400 € sur les postes. Impossible.
  const ALWAYS_FORBIDDEN: Array<[RegExp, string]> = [
    [/\bprix attractif[fs]?\b/gi,                           "prix à examiner poste par poste"],
    [/\b(très )?bon (rapport )?qualité[- ]?prix\b/gi,       "ratio à vérifier"],
    [/\bdevis (compétitif|attractif)\b/gi,                  "devis à examiner"],
    [/\bsous la moyenne du marché\b/gi,                     "à comparer poste par poste"],
    [/\binférieur au marché( global)?\b/gi,                 "à examiner poste par poste"],
    [/\bglobalement cohérent[es]? (avec |au )?(le |la )?marché\b/gi,
                                                            "à examiner poste par poste"],
    [/\bglobalement conforme[s]? (avec |au )?(le |la )?marché\b/gi,
                                                            "à examiner poste par poste"],
    [/\bdans la norme du marché\b/gi,                       "à comparer poste par poste"],
    [/\bcohérent[es]? avec les prix du marché\b/gi,         "à examiner poste par poste"],
    // V3.4.6 (2026-05-12) — Patterns observés sur multi-devis SALLEM
    // qui contredisaient le hero "+18 600€" + verdict ORANGE.
    [/\bcohérent[es]? avec (les )?(attentes|fourchettes|estimations) (du )?marché\b/gi,
                                                            "à examiner poste par poste"],
    [/\b(le )?montant (global )?(du )?devis (est |reste |semble |paraît )?(cohérent|conforme|raisonnable|normal)\b/gi,
                                                            "le montant global présente des écarts vs marché"],
    [/\bsans surcoût significatif( identifié)?( sur les postes comparables)?\b/gi,
                                                            "avec des écarts vs marché à examiner"],
    [/\b(au|dans le) niveau (du |des )?(prix )?marché\b/gi, "à examiner vs fourchettes marché"],
  ];

  for (const [pattern, replacement] of ALWAYS_FORBIDDEN) {
    result = result.replace(pattern, replacement);
  }

  // ── Niveau 2 — interdit seulement si verdict ≠ signer ────────────────────────
  if (verdict !== "signer") {
    const CONDITIONAL_FORBIDDEN: Array<[RegExp, string]> = [
      [/vous pouvez (signer|procéder|valider)/gi,  "vous pouvez négocier ce devis"],
      [/\bbon devis\b/gi,                           "devis à vérifier"],
      [/\bdevis (est |semble |paraît )?(correct|acceptable|conforme|cohérent)\b/gi,
                                                    "devis présente des écarts"],
      [/\bprix (est |semble |paraît )?(correct|acceptable|conforme|cohérent|dans la norme)\b/gi,
                                                    "prix présente des écarts"],
      [/\b(est |semble |paraît )(correct|acceptable|conforme|cohérent)\b/gi,
                                                    "présente des écarts"],
      [/\bprix (est |reste )?(justifié|raisonnable|normal)\b/gi,
                                                    "prix est à négocier"],
      [/\bpas d['']anomalie\b/gi,                   "des points à vérifier"],
      [/\baucune anomalie\b/gi,                     "des points à vérifier"],
    ];

    for (const [pattern, replacement] of CONDITIONAL_FORBIDDEN) {
      result = result.replace(pattern, replacement);
    }
  }

  // ── Niveau 3 — anti-hallucination "prix bas" si le serveur a détecté un surcoût ─
  // Si computeServerSurcout > 0, le LLM ne peut JAMAIS dire que le prix est avantageux.
  if (hasServerSurcout) {
    const POSITIVE_PRICE_TERMS: Array<[RegExp, string]> = [
      [/\b(prix )?avantageux\b/gi,                          "prix à examiner"],
      [/\bbonne affaire\b/gi,                               "devis à examiner"],
      [/\beconom[a-z]+ par rapport au marché\b/gi,          "à examiner par rapport au marché"],
    ];
    for (const [pattern, replacement] of POSITIVE_PRICE_TERMS) {
      result = result.replace(pattern, replacement);
    }
  }

  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// Détection des groupes hétérogènes (V3.4 — Niveaux 1 + 2 combinés)
//
// Logique extraite dans le module partagé `src/lib/analyse/groupHomogeneity.ts`
// pour être réutilisée côté client (quoteGlobalAnalysis.ts). Voir ce module pour
// la documentation détaillée de l'algorithme et du référentiel mots-clés.
// ──────────────────────────────────────────────────────────────────────────────

import { isLikelyHeterogeneousGroup, cleanJobTypeLabel, detectRoomMismatch } from "@/lib/analyse/groupHomogeneity";

// (Bloc inline supprimé — voir src/lib/analyse/groupHomogeneity.ts pour la logique.)

// ──────────────────────────────────────────────────────────────────────────────
// TODO Niveau 3 — Refonte du prompt Gemini de groupement (chantier majeur)
// ──────────────────────────────────────────────────────────────────────────────
//
// Le problème de fond : Gemini groupe trop large parce que le prompt actuel
// n'est pas assez explicite sur les frontières des groupes.
//
// Objectif : que Gemini produise des groupes HOMOGÈNES par construction.
//
// Plan :
//   1. Auditer `supabase/functions/analyze-quote/market-prices.ts` (prompt
//      groupement actuel) — identifier ce qui pousse Gemini à fusionner.
//   2. Renforcer les règles d'exclusivité :
//      - "Chape ciment" ne peut JAMAIS être dans un groupe carrelage
//      - "Primaire d'accrochage" est un préparation, pas un revêtement
//      - "IP14 / IPE / IPN" = structure acier, jamais dans un groupe revêtement
//      - "Coupe des dalles" peut accompagner le carrelage si forfait du même poste
//   3. Ajouter exemples explicites dans le prompt (few-shot)
//   4. Tester sur les 4 PDFs du Desktop : Kern, Zitelec, multi-devis, SDB.
//   5. Test de non-régression sur les 200+ analyses passées (chercher les groupes
//      qui changent de composition après refonte).
//
// Estimation : 2-3 jours dev + 1 semaine de tests / validation.
// Risque : régression sur d'autres cas que les 4 PDFs. Faire en feature flag.
//
// Bénéfice à terme : élimine la cause RACINE des faux positifs, pas juste les
// symptômes. Niveau 1 et 2 deviennent moins critiques (mais restent comme
// défense en profondeur).
// ──────────────────────────────────────────────────────────────────────────────

const FORFAIT_DESC_KEYWORDS = ["forfait", "forfait global", "prestation globale", "au forfait", "tout compris"];

function isForfaitGroup(g: any): boolean {
  const unit = (g.main_unit || "").toLowerCase().trim();
  if (FORFAIT_UNIT_KEYWORDS.some((kw) => unit === kw || unit.startsWith(kw))) return true;
  const lines: any[] = g.devis_lines || [];
  if (lines.length === 0) return false;
  const forfaitLines = lines.filter((l: any) => {
    const desc = (l.description || "").toLowerCase();
    const lineUnit = (l.unit || "").toLowerCase();
    return (
      FORFAIT_DESC_KEYWORDS.some((kw) => desc.includes(kw)) ||
      FORFAIT_UNIT_KEYWORDS.some((kw) => lineUnit === kw || lineUnit.startsWith(kw))
    );
  });
  return forfaitLines.length >= Math.ceil(lines.length * 0.6);
}

interface MarketPosition {
  isBelowAverage: boolean;
  isAboveMax: boolean;
  globalLabel: "inférieur_au_marché" | "dans_la_norme" | "au_dessus_de_la_moyenne" | "au_dessus_du_max" | "hors_catalogue";
  totalDevis: number;
  totalMarketMin: number;
  totalMarketAvg: number;
  totalMarketMax: number;
}

function computeServerMarketPosition(priceData: unknown[]): MarketPosition {
  if (!Array.isArray(priceData)) return { isBelowAverage: false, isAboveMax: false, globalLabel: "hors_catalogue", totalDevis: 0, totalMarketMin: 0, totalMarketAvg: 0, totalMarketMax: 0 };

  let totalDevis = 0;
  let totalMarketMin = 0;
  let totalMarketAvg = 0;
  let totalMarketMax = 0;
  let hasMarketData = false;

  for (const g of priceData) {
    if (!g || typeof g !== "object") continue;
    const group = g as Record<string, any>;
    if (group.job_type_label === "Autre") continue;
    if (isForfaitGroup(group)) continue;
    if (hasSurfaceUnitMismatch(group)) continue;
    // V3.4.1 — exclure les groupes hétérogènes du calcul du positionnement global.
    // Sans ça, un groupe carrelage mal regroupé (incluant chape+primaire+acier)
    // gonflait le "totalDevis" comparable et faussait la position vs marché.
    if (isLikelyHeterogeneousGroup(group)) continue;

    const devisTotal: number = typeof group.devis_total_ht === "number" ? group.devis_total_ht : 0;
    if (devisTotal <= 0) continue;

    const prices: any[] = Array.isArray(group.prices) ? group.prices : [];
    if (prices.length === 0) continue;

    const qty: number = typeof group.main_quantity === "number" && group.main_quantity > 0 ? group.main_quantity : 1;

    let minHT = 0;
    let maxHT = 0;
    for (const p of prices) {
      minHT += (typeof p.price_min_unit_ht === "number" ? p.price_min_unit_ht : 0) * qty + (typeof p.fixed_min_ht === "number" ? p.fixed_min_ht : 0);
      maxHT += (typeof p.price_max_unit_ht === "number" ? p.price_max_unit_ht : 0) * qty + (typeof p.fixed_max_ht === "number" ? p.fixed_max_ht : 0);
    }
    if (maxHT <= 0) continue;

    hasMarketData = true;
    totalDevis     += devisTotal;
    totalMarketMin += minHT;
    totalMarketMax += maxHT;
    totalMarketAvg += (minHT + maxHT) / 2;
  }

  if (!hasMarketData || totalMarketMax <= 0) {
    return { isBelowAverage: false, isAboveMax: false, globalLabel: "hors_catalogue", totalDevis, totalMarketMin, totalMarketAvg, totalMarketMax };
  }

  const isBelowAverage = totalDevis < totalMarketAvg;
  const isBelowMin     = totalDevis < totalMarketMin;
  const isAboveMax     = totalDevis > totalMarketMax;
  const isAboveAvg     = totalDevis > totalMarketAvg;

  let globalLabel: MarketPosition["globalLabel"];
  if (isBelowMin || isBelowAverage) globalLabel = "inférieur_au_marché";
  else if (isAboveMax)               globalLabel = "au_dessus_du_max";
  else if (isAboveAvg)               globalLabel = "au_dessus_de_la_moyenne";
  else                               globalLabel = "dans_la_norme";

  return { isBelowAverage, isAboveMax, globalLabel, totalDevis, totalMarketMin, totalMarketAvg, totalMarketMax };
}

function buildGroupSummary(priceData: unknown[]): string {
  if (!Array.isArray(priceData) || priceData.length === 0) return "Aucune donnée de poste disponible.";

  return priceData
    .filter((g: any) => g.job_type_label !== "Autre" && g.devis_total_ht > 0)
    .map((g: any) => {
      const qty: number = g.main_quantity || 1;
      const unit: string = g.main_unit || "unité";
      const total: number = g.devis_total_ht || 0;
      const unitPrice: number = qty > 0 ? total / qty : 0;
      const prices: any[] = g.prices || [];
      const forfait = isForfaitGroup(g);

      const lignes: string = (g.devis_lines || [])
        .slice(0, 4)
        .map((l: any) => `"${l.description}"${l.amount_ht ? ` (${l.amount_ht}€)` : ""}`)
        .join(" | ");

      // V3.4.5 — Label nettoyé pour le LLM (retire mot-pièce si room mismatch).
      // Évite que le LLM produise des wordings du type "Demandez le détail du poste
      // 'Raccordements électricité cuisine'" alors que le devis ne parle pas de cuisine.
      const displayLabel = cleanJobTypeLabel(String(g.job_type_label || ""), g);
      const roomMismatch = detectRoomMismatch(g);

      // Pour les forfaits globaux, on ne calcule PAS de fourchette unitaire
      // car la comparaison est non pertinente (prix global ≠ prix unitaire catalogue)
      if (forfait) {
        return [
          `POSTE: ${displayLabel} [FORFAIT GLOBAL — comparaison unitaire NON APPLICABLE]`,
          `  Facturation: forfait global`,
          `  Total devis: ${total.toFixed(0)} €`,
          `  Note: Ce poste est facturé en forfait. Le prix unitaire marché ne s'applique PAS ici.`,
          `  Lignes: ${lignes || "—"}`,
        ].join("\n");
      }

      // Mismatch surface/unité : l'artisan a facturé en U/forfait un poste normalement en m²
      // → la comparaison unitaire est impossible, on signale explicitement
      if (hasSurfaceUnitMismatch(g)) {
        return [
          `POSTE: ${displayLabel} [⚠️ MISMATCH UNITÉ — comparaison impossible]`,
          `  Facturation: ${qty} ${unit} (mais le catalogue raisonne en m²)`,
          `  Total devis: ${total.toFixed(0)} €`,
          `  ⚠️ IMPORTANT: L'unité "${unit}" est incompatible avec le catalogue m². NE PAS signaler ce poste comme anomalie de prix. Action requise : demander la surface en m² à l'artisan pour pouvoir comparer.`,
          `  Lignes: ${lignes || "—"}`,
        ].join("\n");
      }

      // Poste à prix unitaire : calcul normal
      let minHT = 0;
      let maxHT = 0;
      let unitMin = 0;
      let unitMax = 0;
      for (const p of prices) {
        minHT  += (p.price_min_unit_ht || 0) * qty + (p.fixed_min_ht || 0);
        maxHT  += (p.price_max_unit_ht || 0) * qty + (p.fixed_max_ht || 0);
        unitMin += p.price_min_unit_ht || 0;
        unitMax += p.price_max_unit_ht || 0;
      }
      const avgHT = (minHT + maxHT) / 2;

      const hasMarket = prices.length > 0 && maxHT > 0;
      const ecartVsAvg = hasMarket && avgHT > 0
        ? `${total > avgHT ? "+" : ""}${Math.round(((total - avgHT) / avgHT) * 100)}% vs moyenne`
        : "hors catalogue";
      // V3.3.4 Niveau 1 + V3.4.5 — tag prioritaire sur tout autre tag.
      // - Groupe hétérogène (mal regroupé) → ne pas pointer comme anomalie.
      // - Room mismatch (catalogue mal matché par pièce) → comparaison marché suspecte.
      const heterogeneous = isLikelyHeterogeneousGroup(g);
      const positionLabel = roomMismatch
        ? ` [⚠️ ROOM MISMATCH — le job_type catalogue mentionne "${roomMismatch}" mais aucune ligne ne parle de cette pièce. Fourchette marché probablement non pertinente. NE PAS pointer comme anomalie de prix.]`
        : heterogeneous
          ? " [⚠️ GROUPE PROBABLEMENT HÉTÉROGÈNE — prix unitaire calculé aberrant, ne PAS pointer comme anomalie de prix]"
          : hasMarket
            ? total < minHT ? " [TRÈS BAS — sous le min marché]"
              : total < avgHT ? " [BAS — sous la moyenne marché]"
              : total > maxHT ? " [ÉLEVÉ — au-dessus du max marché]"
              : total > avgHT ? " [LÉGÈREMENT ÉLEVÉ — au-dessus de la moyenne]"
              : ""
            : "";

      return [
        `POSTE: ${displayLabel}${positionLabel}`,
        `  Quantité: ${qty} ${unit}`,
        `  Prix unitaire devis: ${unitPrice.toFixed(2)} €/${unit}`,
        `  Total devis: ${total.toFixed(0)} €`,
        hasMarket
          ? `  Référence marché unitaire: ${unitMin.toFixed(0)}–${unitMax.toFixed(0)} €/${unit} (total: ${minHT.toFixed(0)}–${maxHT.toFixed(0)} €, moyenne: ${avgHT.toFixed(0)} €)`
          : "  Référence marché: hors catalogue",
        `  Écart vs moyenne: ${ecartVsAvg}`,
        `  Lignes: ${lignes || "—"}`,
      ].join("\n");
    })
    .join("\n\n");
}

// ── Main route ────────────────────────────────────────────────────────────────

export const POST: APIRoute = async ({ params, request }) => {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "").trim();
  if (!token) return jsonError("Non autorisé", 401);

  const supabaseUrl   = import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceKey    = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  const googleApiKey  = import.meta.env.GOOGLE_API_KEY;

  if (!supabaseUrl || !serviceKey) return jsonError("Configuration serveur manquante", 500);
  if (!googleApiKey) return jsonError("Clé IA manquante", 500);

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return jsonError("Non autorisé", 401);

  const analysisId = params.id!;

  // ── Récupère l'analyse ────────────────────────────────────────────────────
  const { data: analysis } = await (supabase as any)
    .from("analyses")
    .select("id, user_id, raw_text, resume, work_type, score, conclusion_ia")
    .eq("id", analysisId)
    .single();

  if (!analysis) return jsonError("Analyse introuvable", 404);
  if (analysis.user_id !== user.id) return jsonError("Accès refusé", 403);

  // ── Cache hit (sauf si force=true dans le body) ───────────────────────────
  let forceRegen = false;
  try {
    const body = await request.json().catch(() => ({}));
    forceRegen = body?.force === true;
  } catch { /* body vide ou non-JSON */ }

  if (!forceRegen && analysis.conclusion_ia) {
    try {
      const cached: ConclusionData = JSON.parse(analysis.conclusion_ia);
      // V3.2 — invalidation automatique si engine_version désuète.
      // Ainsi, dès qu'on déploie une version corrigée du moteur, toutes les analyses
      // existantes sont régénérées à la prochaine visite sans intervention utilisateur.
      const cachedVersion = (cached as any).engine_version as string | undefined;
      if (cached.phrase_intro && cached.verdict_global && cached.verdict_decisionnel && cachedVersion === ENGINE_VERSION) {
        return jsonOk({ conclusion: cached, cached: true });
      }
      console.log(`[conclusion] cache invalidé — version cachée=${cachedVersion ?? "(absente)"} attendue=${ENGINE_VERSION}`);
      // Sinon : régénère automatiquement avec le moteur courant
    } catch {
      // JSON corrompu → régénère
    }
  }

  // ── Parse raw_text ────────────────────────────────────────────────────────
  let priceData: unknown[] = [];
  let extractedData: Record<string, unknown> = {};
  // V3.3 — capture aussi le format legacy `extracted` (utilisé par certaines anciennes
  // analyses) pour permettre le fallback de totalHT plus bas. Sans ça, les analyses
  // pré-format-actuel sortent totalHT=null → garde de cohérence inopérante.
  let extractedLegacy: Record<string, unknown> = {};
  let isMultipleQuotes = false;
  let segmentAnalyses: Array<Record<string, unknown>> = [];
  let globalMetricsRaw: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(analysis.raw_text || "{}");
    priceData       = Array.isArray(parsed.n8n_price_data) ? parsed.n8n_price_data : [];
    extractedData   = (parsed.extracted_data as Record<string, unknown>) || {};
    extractedLegacy = (parsed.extracted as Record<string, unknown>) || {};
    // Multi-devis : lire segment_analyses + global_metrics pré-calculés
    const docDet    = parsed.document_detection as Record<string, unknown> | undefined;
    isMultipleQuotes = docDet?.multiple_quotes === true && Array.isArray(parsed.segment_analyses) && parsed.segment_analyses.length > 1;
    if (isMultipleQuotes) {
      segmentAnalyses  = parsed.segment_analyses as Array<Record<string, unknown>>;
      globalMetricsRaw = parsed.global_metrics as Record<string, unknown> | null ?? null;
    }
  } catch {
    // raw_text invalide
  }

  // ── V3.4.24 (2026-05-21) — Filtre des groupes massivement hallucinés ────────
  // Cf. `useMarketPriceAPI.ts:processJobTypes` (même garde côté front). On
  // duplique côté serveur pour que le verdict + le surcoût + la pastille de
  // répartition ne soient pas pollués par les groupes hallucinés. Sans cette
  // garde serveur, le verdict resterait basé sur le mauvais comptage pour
  // les analyses fraîchement générées (et le cache `conclusion_ia` figerait
  // le bug).
  //
  // Cas d'origine "devis placo TCE" : Gemini avait inventé "Peinture salle de
  // bain (pièce)" auquel il avait attribué tous les 13 totaux par pièce du
  // devis (26 040 € au lieu des 9584 € de la VRAIE section peinture).
  if (Array.isArray(priceData) && priceData.length > 0) {
    const before = priceData.length;
    priceData = priceData.filter((g) => {
      if (!g || typeof g !== "object") return true;
      const group = g as Record<string, unknown>;
      const devisTotal = typeof group.devis_total_ht === "number" ? group.devis_total_ht : null;
      const prices = Array.isArray(group.prices) ? group.prices as Array<Record<string, unknown>> : [];
      const lines  = Array.isArray(group.devis_lines) ? group.devis_lines : [];
      const mainQty = typeof group.main_quantity === "number" && group.main_quantity > 0 ? group.main_quantity : 1;

      // Recompute theoreticalMinHT / theoreticalMaxHT (même formule que useMarketPriceAPI)
      let theoreticalMinHT = 0;
      let theoreticalMaxHT = 0;
      for (const p of prices) {
        const min = typeof p.price_min_unit_ht === "number" ? p.price_min_unit_ht : 0;
        const max = typeof p.price_max_unit_ht === "number" ? p.price_max_unit_ht : 0;
        const fxMin = typeof p.fixed_min_ht === "number" ? p.fixed_min_ht : 0;
        const fxMax = typeof p.fixed_max_ht === "number" ? p.fixed_max_ht : 0;
        theoreticalMinHT += min * mainQty + fxMin;
        theoreticalMaxHT += max * mainQty + fxMax;
      }

      // Détection forfait : si toutes prices ont unit "forfait" / "u" implicite,
      // on n'applique pas la garde (les fourchettes forfaitaires ont leur logique propre).
      const isForfait = prices.length > 0 && prices.every((p) => {
        const u = String(p.unit ?? "").toLowerCase();
        return u === "forfait" || u === "ff" || u === "fft";
      });

      // V3.4.24 — groupes massivement hallucinés (devis >> marché_max)
      if (
        theoreticalMaxHT > 0 &&
        devisTotal !== null &&
        devisTotal > theoreticalMaxHT * 8 &&
        lines.length >= 5 &&
        mainQty <= lines.length &&
        !isForfait
      ) {
        console.warn(
          `[conclusion] V3.4.24 groupe halluciné filtré — "${group.job_type_label ?? "?"}" : ` +
            `devis_total=${devisTotal} € vs marché_max=${theoreticalMaxHT.toFixed(0)} € ` +
            `(ratio ${(devisTotal / theoreticalMaxHT).toFixed(1)}×, ${lines.length} lignes, ` +
            `main_qty=${mainQty})`,
        );
        return false;
      }

      // V3.4.28 (2026-05-22) — matchs catalogue manifestement faux (devis << marché_min).
      // Cas devis vélo : "Nettoyage pédalier 38€" → catalogue "Chaudière fioul 2500-7000€".
      if (
        theoreticalMinHT >= 200 &&
        devisTotal !== null &&
        devisTotal >= 5 &&
        devisTotal < theoreticalMinHT * 0.10 &&
        !isForfait
      ) {
        console.warn(
          `[conclusion] V3.4.28 match catalogue faux filtré (ratio inverse) — "${group.job_type_label ?? "?"}" : ` +
            `devis=${devisTotal} € vs marché_min=${theoreticalMinHT.toFixed(0)} € ` +
            `(ratio ${((devisTotal / theoreticalMinHT) * 100).toFixed(1)}% << seuil 10%)`,
        );
        return false;
      }
      return true;
    });
    if (priceData.length !== before) {
      console.log(`[conclusion] V3.4.24 — ${before - priceData.length} groupe(s) filtré(s) sur ${before}`);
    }
  }

  // ── V3.4.14 (2026-05-16) — Bypass complet si devis étranger ─────────────────
  //
  // Le catalogue marché (`market_prices`), les vérifications SIRET/RGE/RNE et
  // l'analyse financière sont tous calibrés sur la réglementation FRANÇAISE.
  // Comparer un devis belge (TVA 6% réno, IBAN BE86, prix posés en BE) au
  // catalogue FR produit des +1500€ fantômes et des verdicts incohérents.
  //
  // Quand `is_foreign_quote=true` (détecté par extract.ts / country.ts), on :
  //   1. Bypass Gemini conclusion (gain ~2-4s + 0 token consommé)
  //   2. Bypass verdictEngine (verdict déterministe = signer_avec_negociation)
  //   3. Bypass comparaison catalogue (surcout=0, comparison_indicative=true)
  //   4. Génère un wording dédié + champ foreign_quote pour la bannière UI
  //
  // La sécurité paiement (IBAN, acompte, modes) ET les sections sanitaires
  // RESTENT visibles via BlockSecurite — uniquement le scoring prix est désactivé.
  //
  // Lecture de is_foreign_quote depuis 2 emplacements (compatibilité format) :
  //   - parsed.extracted (format actuel — V3.4.14+)
  //   - parsed.extracted_data (format legacy)
  // ────────────────────────────────────────────────────────────────────────
  try {
    const parsed = JSON.parse(analysis.raw_text || "{}");
    const extractedActuel = parsed.extracted as Record<string, unknown> | undefined;
    const extractedLegacy2 = parsed.extracted_data as Record<string, unknown> | undefined;
    const isForeign =
      (extractedActuel?.is_foreign_quote === true) ||
      (extractedLegacy2?.is_foreign_quote === true);

    if (isForeign) {
      const countryCode =
        (extractedActuel?.country_code as string | undefined) ||
        (extractedLegacy2?.country_code as string | undefined) ||
        "OTHER";
      const countryLabel =
        (extractedActuel?.country_label as string | undefined) ||
        (extractedLegacy2?.country_label as string | undefined) ||
        "étranger";

      console.log(`[conclusion] FOREIGN QUOTE bypass — country=${countryCode} (${countryLabel}) — pas d'appel Gemini, pas de matching catalogue`);

      const foreignConclusion: ConclusionData & { engine_version: string } = {
        verdict_global:      "eleve_justifie",
        phrase_intro:        `Ce devis provient d'une entreprise située en ${countryLabel}. L'outil VerifierMonDevis est calibré sur la réglementation et les tarifs français — la comparaison automatique au marché, les vérifications SIRET/RGE et les ratios financiers ne s'appliquent pas. La sécurité paiement (IBAN, modalités) et les anomalies de structure restent vérifiables.`,
        anomalies:           [],
        justifications:      `Vérifications hors comparaison prix : examinez manuellement les tarifs auprès d'un comparateur local ${countryLabel}, vérifiez l'inscription au registre du commerce du pays (BCE pour la Belgique, RCS Luxembourg, etc.), et demandez 1-2 devis concurrents locaux pour valider le niveau de prix.`,
        has_anomalies:       false,
        verdict_decisionnel: "signer_avec_negociation",
        surcout_global:      { min: 0, max: 0 },
        niveau_risque:       "modéré",
        actions_avant_signature: [
          `Comparer le prix à 1-2 devis concurrents locaux (${countryLabel}) — le tarif marché diffère du marché français.`,
          `Vérifier l'inscription officielle de l'entreprise au registre du commerce local (BCE pour la Belgique, RCS Luxembourg, ZEFIX pour la Suisse, Handelsregister pour l'Allemagne).`,
          "Vérifier l'IBAN affiché dans la section paiement — pour un virement international, contrôler aussi le BIC/SWIFT.",
        ],
        verdict_reasons: {
          summary: `Comparaison prix non applicable — entreprise située en ${countryLabel}`,
          reasons: [
            `Le catalogue de prix de référence (475+ postes) est constitué de tarifs français — pas pertinent pour un devis ${countryLabel}.`,
            `Les vérifications réglementaires (SIRET, RGE, RNE/Pappers, sinistres financiers) sont basées sur les API publiques françaises — pas accessibles pour ${countryLabel}.`,
          ],
          context: [
            "Les sections Sécurité paiement (IBAN, acompte, modes) et anomalies de structure restent valides quelle que soit la nationalité du devis.",
          ],
        },
        comparison_indicative: true,
        foreign_quote: {
          country_code: countryCode,
          country_label: countryLabel,
        },
        generated_at: new Date().toISOString(),
        engine_version: ENGINE_VERSION,
      };

      await (supabase as any)
        .from("analyses")
        .update({ conclusion_ia: JSON.stringify(foreignConclusion) })
        .eq("id", analysisId);

      return jsonOk({ conclusion: foreignConclusion, cached: false });
    }
  } catch {
    // raw_text invalide — continue avec le flow normal (qui re-tentera lui aussi le parse)
  }

  // ── V3.4.20 (2026-05-19) — BYPASS ESTIMATION COURTIER ────────────────────────
  // Quand le doc est une estimation courtier (Renovation Man, Ootravaux, Hellio,
  // etc.), il n'y a PAS d'artisan dans le doc — le courtier proposera un artisan
  // PLUS TARD. Toutes les vérifications artisan (SIRET, RGE, finances, IBAN…)
  // sont donc inapplicables. Cas d'origine : devis Renovation Man pour Jules
  // Duval → VMD cherchait "Renovation Man" sur INSEE → 6 homonymes dont 3
  // RADIÉS → bloc ROUGE faux + verdict REFUSER mensonger.
  //
  // Idem au foreign bypass : on bypass Gemini + verdictEngine + matching marché,
  // on génère un wording dédié + le champ estimation_courtier pour la bannière UI.
  try {
    const parsed = JSON.parse(analysis.raw_text || "{}");
    const extractedActuel = parsed.extracted as Record<string, unknown> | undefined;
    const extractedLegacy2 = parsed.extracted_data as Record<string, unknown> | undefined;
    const typeDoc =
      (extractedActuel?.type_document as string | undefined) ||
      (extractedLegacy2?.type_document as string | undefined);
    const isCourtier = typeDoc === "estimation_courtier";

    if (isCourtier) {
      const courtierNom =
        (extractedActuel?.courtier_nom as string | null | undefined) ||
        (extractedLegacy2?.courtier_nom as string | null | undefined) ||
        null;
      const courtierLabel = courtierNom || "un courtier travaux";

      console.log(`[conclusion] COURTIER BYPASS — courtier="${courtierLabel}" — pas d'appel Gemini, pas de matching catalogue, pas de bloc Entreprise`);

      const courtierConclusion: ConclusionData & { engine_version: string } = {
        verdict_global:      "eleve_justifie",
        phrase_intro:        `Ce document est une ESTIMATION émise par ${courtierLabel} (courtier/intermédiaire travaux), pas un devis d'artisan signé. Le vrai artisan sera désigné plus tard dans le process — il n'y a donc personne à vérifier ici (pas de SIRET artisan, pas d'assurance décennale à contrôler, pas d'IBAN). Cette estimation vous donne une fourchette de prix marché utile pour cadrer votre projet, mais ce n'est PAS encore le devis sur lequel vous vous engagez.`,
        anomalies:           [],
        justifications:      `Une fois que ${courtierLabel} vous proposera le VRAI devis signé par l'artisan partenaire désigné, re-uploadez-le sur VerifierMonDevis pour qu'on vérifie l'identité, l'ancienneté, la santé financière et la conformité réglementaire de cet artisan. Vous bénéficierez alors de l'analyse complète.`,
        has_anomalies:       false,
        verdict_decisionnel: "signer_avec_negociation",
        surcout_global:      { min: 0, max: 0 },
        niveau_risque:       "modéré",
        actions_avant_signature: [
          `Demander à ${courtierLabel} le nom et le SIRET de l'artisan partenaire qui réalisera les travaux.`,
          `Demander une copie de l'assurance décennale et de la RC pro de cet artisan, ainsi qu'un exemple de chantier récent.`,
          `Re-uploader le devis signé de l'artisan (pas l'estimation) sur VerifierMonDevis pour bénéficier de la vérification SIRET + analyse de fiabilité.`,
          `Comparer cette estimation à 1-2 devis directs d'artisans indépendants (sans courtier) pour mesurer les frais de service du courtier vs un devis direct.`,
        ],
        verdict_reasons: {
          summary: `Estimation ${courtierLabel} — pas d'artisan à vérifier, attendez le vrai devis`,
          reasons: [
            `Le document est une estimation marché émise par un courtier travaux, pas un devis d'artisan engageant.`,
            `Aucune vérification d'identité d'artisan (SIRET, RGE, finances, assurance) n'est applicable à ce stade — l'artisan sera désigné après acceptation de l'estimation.`,
          ],
          context: [
            `${courtierLabel} ajoute généralement des "frais de service" (5-15% du total travaux) en contrepartie de la mise en relation, du suivi et de la sécurisation des paiements. Vérifiez le détail de ces frais dans le document.`,
            `Une fois l'artisan désigné, re-uploadez son devis sur VerifierMonDevis pour une analyse complète.`,
          ],
        },
        comparison_indicative: true,
        estimation_courtier: {
          courtier_nom: courtierNom,
        },
        generated_at: new Date().toISOString(),
        engine_version: ENGINE_VERSION,
      };

      await (supabase as any)
        .from("analyses")
        .update({ conclusion_ia: JSON.stringify(courtierConclusion) })
        .eq("id", analysisId);

      return jsonOk({ conclusion: courtierConclusion, cached: false });
    }
  } catch {
    // raw_text invalide — continue avec le flow normal (qui re-tentera lui aussi le parse)
  }

  // ── V3.4.28 (2026-05-22) — BYPASS DEVIS HORS-SCOPE BTP ──────────────────────
  // VMD est dédié aux devis BTP/rénovation/aménagement immobilier. Si le user
  // upload un devis de réparation vélo, voiture, électroménager, prestation
  // médicale, etc. → on bypass complet (pas de matching catalogue marché, pas
  // de bloc Entreprise vérifié comme un artisan BTP, pas de score) et on
  // affiche un message explicite "ce devis n'est pas dans notre périmètre".
  //
  // Cas d'origine "devis vélo" (2026-05-22) : devis réparation Trek Emonda par
  // Cycle Service Lyon → analyse passait → matcher catalogue inventait
  // "Remplacement chaudière fioul" pour des opérations vélo (3 unités 114€
  // vs marché 2500-7000€) → résultat absurde.
  try {
    const parsed = JSON.parse(analysis.raw_text || "{}");
    const extractedActuel  = parsed.extracted as Record<string, unknown> | undefined;
    const extractedLegacy2 = parsed.extracted_data as Record<string, unknown> | undefined;
    const typeDoc =
      (extractedActuel?.type_document as string | undefined) ||
      (extractedLegacy2?.type_document as string | undefined);

    if (typeDoc === "hors_scope") {
      const horsScopeCat =
        (extractedActuel?.hors_scope_categorie as string | null | undefined) ||
        (extractedLegacy2?.hors_scope_categorie as string | null | undefined) ||
        "autre";

      const HORS_SCOPE_LABELS: Record<string, string> = {
        reparation_vehicule:      "réparation de véhicule (auto, moto, vélo, …)",
        reparation_electromenager: "réparation d'électroménager",
        achat_biens:              "achat de biens (mobilier, équipement, …)",
        service_personnel:        "service personnel (formation, conseil, …)",
        medical:                  "prestation médicale ou paramédicale",
        veterinaire:              "prestation vétérinaire",
        autre:                    "prestation hors du périmètre BTP",
      };
      const horsScopeLabel = HORS_SCOPE_LABELS[horsScopeCat] || HORS_SCOPE_LABELS.autre;

      console.log(`[conclusion] HORS-SCOPE BYPASS — categorie="${horsScopeCat}" — pas de matching catalogue BTP, message dédié`);

      const horsScopeConclusion: ConclusionData & { engine_version: string } = {
        verdict_global:      "eleve_justifie", // valeur neutre — pas de vrai verdict possible
        phrase_intro:        `Ce devis concerne une ${horsScopeLabel} — il n'est pas dans le périmètre de VerifierMonDevis, qui est dédié aux devis de TRAVAUX BTP (rénovation, aménagement, construction sur un bâtiment immobilier). Nous n'avons pas de référentiel prix marché pour ce type de prestation, et les vérifications artisan BTP (RGE, qualification, etc.) ne s'appliquent pas.`,
        anomalies:           [],
        justifications:      `Pour les devis hors BTP, nous vous recommandons des comparateurs spécialisés (ex: AlloVoisin pour les services à la personne, des sites comparateurs auto/moto pour la mécanique). Si vous pensez qu'il s'agit d'une erreur de détection (ex: ce devis contient bien des travaux BTP), n'hésitez pas à nous le signaler — on regardera ensemble.`,
        has_anomalies:       false,
        verdict_decisionnel: "signer_avec_negociation",
        surcout_global:      { min: 0, max: 0 },
        niveau_risque:       "modéré",
        actions_avant_signature: [
          `Comparer ce devis à 1-2 autres devis du même type pour avoir un ordre de prix de marché.`,
          `Demander au prestataire une facture détaillée poste par poste (matériel/main d'œuvre/déplacement) plutôt qu'un forfait global.`,
          `Vérifier les conditions de garantie (durée, conditions, exclusions) écrites sur le devis avant signature.`,
        ],
        verdict_reasons: {
          summary: `Devis hors-scope (${horsScopeLabel}) — pas d'analyse BTP applicable`,
          reasons: [
            `Le devis ne décrit pas des travaux BTP/rénovation/aménagement sur un bâtiment.`,
            `Notre référentiel prix marché et nos contrôles artisan (RGE, ADEME, finances) sont calibrés pour le BTP uniquement.`,
          ],
          context: [
            `Si c'est une erreur de détection (ex: votre devis contient bien des travaux BTP), recliquez sur "Régénérer" — le moteur peut affiner sa décision.`,
          ],
        },
        comparison_indicative: true,
        hors_scope: {
          categorie: (horsScopeCat as "reparation_vehicule" | "reparation_electromenager" | "achat_biens" | "service_personnel" | "medical" | "veterinaire" | "autre"),
        },
        generated_at: new Date().toISOString(),
        engine_version: ENGINE_VERSION,
      };

      await (supabase as any)
        .from("analyses")
        .update({ conclusion_ia: JSON.stringify(horsScopeConclusion) })
        .eq("id", analysisId);

      return jsonOk({ conclusion: horsScopeConclusion, cached: false });
    }
  } catch {
    // raw_text invalide — continue
  }

  // ── Parse scoring (critères rouges + oranges pour verdictEngine) ────────────
  let criteres_rouges: string[]  = [];
  let criteres_oranges: string[] = [];
  let entreprise_radiee = false;
  try {
    const scoreData = typeof analysis.score === "string"
      ? JSON.parse(analysis.score)
      : (analysis.score as Record<string, unknown>) || {};
    criteres_rouges  = Array.isArray(scoreData.criteres_rouges)  ? scoreData.criteres_rouges  : [];
    criteres_oranges = Array.isArray(scoreData.criteres_oranges) ? scoreData.criteres_oranges : [];
    entreprise_radiee = criteres_rouges.some((r: string) => r.toLowerCase().includes("radié"));
  } catch {
    // score invalide
  }

  const client   = (extractedData.client  as Record<string, unknown>) || {};
  const totaux   = (extractedData.totaux  as Record<string, unknown>) || {};
  const entreprise = (extractedData.entreprise as Record<string, unknown>) || {};
  const dates    = (extractedData.dates   as Record<string, unknown>) || {};

  const ville      = (client.ville      as string) || "";
  const codePostal = (client.code_postal as string) || "";

  // ──────────────────────────────────────────────────────────────────────────
  // totalHT — résolution robuste avec fallbacks alignés sur le client (V3.3)
  //
  // Bug observé sur Kern Terrassement : la garde de cohérence retournait false
  // parce que totaux.ht était null. Sans totalHT, isMaterialServerSurcout ne peut
  // pas calculer le ratio relatif → pas d'escalade → bandeau "Vous pouvez signer"
  // affiché malgré +5 900 € de surcoût (36% du devis).
  //
  // 3 niveaux de résolution :
  //   1. extracted_data.totaux.ht (format actuel)
  //   2. extracted.totaux.ht (format legacy — fallback aligné sur AnalysisResult.tsx)
  //   3. somme des devis_total_ht de priceData (proxy fiable si tous postes extraits)
  //
  // Si les 3 niveaux échouent, totalHT reste null et on log un warning.
  // ──────────────────────────────────────────────────────────────────────────
  const totalHT: number | null = (() => {
    // V3.4.18 (2026-05-19) — Priorité absolue à `totaux.ht` MAIS avec garde
    // de cohérence vs `totaux.ttc`. Avant, on prenait `totaux.ht` aveuglément
    // même quand Gemini l'avait mal extrait → ratio surcoût faussé (cas user :
    // "17% du devis" affiché alors que le vrai ratio est 13.3% sur un devis
    // 11 292€ HT extrait à 8 800€).
    //
    // Garde de cohérence : si HT < (TTC × 0.7) → on suspecte Gemini de l'avoir
    // mal extrait (HT est censé être 80-95% du TTC selon le taux TVA). On
    // reconstitue alors via `TTC / (1 + tauxTVA/100)` si on a les 2.
    const rawHt = typeof totaux.ht === "number" && totaux.ht > 0 ? totaux.ht : null;
    const rawTtc = typeof totaux.ttc === "number" && totaux.ttc > 0 ? totaux.ttc : null;
    const rawTaux = typeof totaux.taux_tva === "number" && totaux.taux_tva > 0 ? totaux.taux_tva : null;

    // (1) HT et TTC tous les deux présents → on vérifie cohérence
    if (rawHt && rawTtc) {
      if (rawHt < rawTtc * 0.7) {
        // HT clairement faux → reconstituer depuis TTC
        const reconstructed = rawTaux ? rawTtc / (1 + rawTaux / 100) : rawTtc / 1.10;
        console.warn(`[conclusion] V3.4.18 totalHT (${rawHt}€) incohérent vs TTC (${rawTtc}€) — reconstitué via TTC/TVA = ${reconstructed.toFixed(0)}€`);
        return Math.round(reconstructed);
      }
      return rawHt;
    }

    // (2) Seul HT présent (cas FR standard, TVA appliquée mais TTC manquant)
    if (rawHt) return rawHt;

    // (3) Seul TTC présent → reconstituer HT
    if (rawTtc) {
      const tva = rawTaux ?? 10; // défaut 10% (rénovation FR la plus fréquente)
      const reconstructed = rawTtc / (1 + tva / 100);
      console.warn(`[conclusion] V3.4.18 totalHT absent — reconstitué depuis TTC (${rawTtc}€) avec TVA ${tva}% = ${reconstructed.toFixed(0)}€`);
      return Math.round(reconstructed);
    }

    // (4) Fallback 1 : format legacy
    const legacyTotaux = (extractedLegacy.totaux as Record<string, unknown> | undefined);
    if (legacyTotaux && typeof legacyTotaux.ht === "number" && legacyTotaux.ht > 0) {
      console.warn("[conclusion] totalHT issu du format legacy extracted.totaux.ht");
      return legacyTotaux.ht;
    }

    // (5) Fallback ultime : somme des postes du priceData
    // ⚠️ Souvent imprécis (Gemini ne groupe pas TOUT le devis dans priceData)
    // → utilisé seulement si rien d'autre. Les wordings basés dessus
    // mentionnent "estimé sur les postes analysés".
    if (Array.isArray(priceData) && priceData.length > 0) {
      const sumPostes = (priceData as Array<Record<string, unknown>>).reduce((acc, g) => {
        const t = typeof g?.devis_total_ht === "number" ? g.devis_total_ht : 0;
        return acc + t;
      }, 0);
      if (sumPostes > 0) {
        console.warn(`[conclusion] totalHT déduit de la somme priceData : ${sumPostes} € (peut être imprécis si certaines lignes ne sont pas groupées)`);
        return sumPostes;
      }
    }
    console.warn("[conclusion] totalHT introuvable — garde de cohérence relative inopérante");
    return null;
  })();
  const totalTTC   = typeof totaux.ttc === "number" ? totaux.ttc : null;
  const tauxTVA    = typeof totaux.taux_tva === "number" ? totaux.taux_tva : null;
  const workType   = (analysis.work_type as string) || "";
  const resume     = (analysis.resume   as string) || "";
  const nomEntreprise = (entreprise.nom as string) || "";

  // Devis ancien : calcul âge pour avertissement
  let devisAgeWarning = "";
  const dateDevis = typeof dates.date_devis === "string" ? dates.date_devis : null;
  if (dateDevis) {
    const devisDate = new Date(dateDevis);
    const now = new Date();
    const ageMonths = (now.getFullYear() - devisDate.getFullYear()) * 12 + (now.getMonth() - devisDate.getMonth());
    if (ageMonths > 12) {
      devisAgeWarning = `⚠️ DEVIS ANCIEN : ce devis date de ${devisDate.getFullYear()} (${Math.floor(ageMonths / 12)} an${Math.floor(ageMonths / 12) > 1 ? "s" : ""} environ). Les prix des matériaux et de la main d'œuvre ont évolué depuis — la comparaison au marché est indicative, pas définitive. Mentionner ce point explicitement dans la conclusion.`;
    }
  }

  const groupsSummary  = buildGroupSummary(priceData);
  const marketPosition = computeServerMarketPosition(priceData);

  // V3.5.0 Phase C — Log mode vectoriel (utile pour traquer le shadow run + debug)
  const vectorialDetected = Array.isArray(priceData) &&
    priceData.some((g: any) => g && typeof g === "object" && g.vectorial);
  if (vectorialDetected) {
    console.log(`[conclusion] V3.5 vectorial mode detected (${priceData.length} lines from RPC search_market_prices_v2)`);
  }

  // ── Verdict déterministe PRÉ-CALCULÉ (injecté dans le prompt) ───────────────
  // RÈGLE 5 — Le moteur tourne AVANT Gemini pour contraindre le LLM, pas après.
  // En mode multi-devis : utilise global_metrics pré-calculé (source de vérité unique).
  // En mode mono-devis : calcul normal via verdictEngine.

  const preFlags         = extractFlagsFromCriteria(criteres_rouges, criteres_oranges);
  const preRisk          = extractCompanyRisk(criteres_rouges, criteres_oranges);
  const preCompanyStatus = extractCompanyStatusFromCriteria(criteres_rouges);

  let preEngine: ReturnType<typeof computeVerdict>;
  // NOTE: déclaré ici (scope externe) car utilisé après le bloc if/else à la ligne ~875
  let preMajorAnomalies = 0;

  if (isMultipleQuotes && globalMetricsRaw) {
    // Multi-devis : construire un VerdictResult factice depuis global_metrics
    // Le verdict réel est déjà dans global_metrics.verdict_global
    const gVerdict = String(globalMetricsRaw.verdict_global ?? "signer") as "signer" | "a_negocier" | "refuser";
    const gOverpricePct = typeof globalMetricsRaw.overprice_pct === "number" ? globalMetricsRaw.overprice_pct : 0;
    const gOverprice    = typeof globalMetricsRaw.overprice_total === "number" ? globalMetricsRaw.overprice_total : 0;
    const gRouge        = typeof globalMetricsRaw.segments_rouge === "number" ? globalMetricsRaw.segments_rouge : 0;
    preMajorAnomalies   = gRouge; // segments en rouge = anomalies majeures en mode multi
    preEngine = {
      verdict:               gVerdict,
      color:                 gVerdict === "refuser" ? "red" : gVerdict === "a_negocier" ? "orange" : "green",
      score_legacy:          gVerdict === "refuser" ? "ROUGE" : gVerdict === "a_negocier" ? "ORANGE" : "VERT",
      overprice:             gOverprice,
      overprice_pct:         gOverpricePct,
      anomalies_major_count: gRouge,
      is_hard_block:         preFlags.entreprise_radiee || preFlags.siret_invalide || preFlags.absence_assurance || preFlags.paiement_cash_suspect || preFlags.iban_suspect,
      has_market_data:       (typeof globalMetricsRaw.total_marche_max === "number" ? globalMetricsRaw.total_marche_max : 0) > 0,
      price_label:           gVerdict === "refuser" ? "🛑 Devis anormal" : gVerdict === "a_negocier" ? "⚠️ À négocier" : "✅ Juste prix",
      threshold_ok:          0.08,
      threshold_refuse:      0.20,
      market_dispersion_pct: 0,
      chantier_complexity:   "medium",
    };
  } else {
    // Mono-devis : calcul normal
    const preMarketBounds   = computeMarketBounds(priceData);
    preMajorAnomalies       = countMajorAnomalies(priceData);
    const weightedAnomalies = computeWeightedAnomalies(priceData, typeof totalHT === "number" ? totalHT : 0);
    const preAvgMarket = (preMarketBounds.min + preMarketBounds.max) / 2;
    const preDispersion = preAvgMarket > 0
      ? (preMarketBounds.max - preMarketBounds.min) / preAvgMarket : 0;

    preEngine = computeVerdict({
      total_amount:          typeof totalHT === "number" ? totalHT : 0,
      market_estimate_min:   preMarketBounds.min,
      market_estimate_max:   preMarketBounds.max,
      anomalies_major_count: preMajorAnomalies,
      anomalies_total_count: preMajorAnomalies,
      company_risk:          preRisk,
      flags:                 preFlags,
      market_dispersion_pct: preDispersion,
      company_status:        preCompanyStatus ?? undefined,
      weighted_anomalies:    weightedAnomalies,
    });

    // ────────────────────────────────────────────────────────────────────────
    // V3.4.15 (2026-05-18) — Escalade verdict sur "postes suspects" (surface
    // mismatch + ratio prix élevé). Empêche le bug observé devis-2026-05-DEV16
    // où le user voyait 4 "Anomalies marché" en rouge mais verdict VERT.
    //
    // Logique : si ≥ 2 postes sont (a) en surface mismatch ET (b) facturés
    // > 3× la fourchette marché max (signal très fort qu'il y a un problème
    // même si on ne peut pas l'affirmer avec certitude au €/m²), on escalade
    // le verdict en `a_negocier` (orange minimum). Ces postes apparaissent en
    // front avec le badge jaune "Surface à vérifier" — l'escalade verdict
    // garantit que le bandeau global reste cohérent.
    //
    // Hard block company_status (refuser) NON affecté — il reste prioritaire.
    // ────────────────────────────────────────────────────────────────────────
    // On réutilise la fonction `surfaceMismatchConfidence` locale (définie plus haut
    // dans ce fichier) — pas de dynamic import, signatures équivalentes au helper
    // partagé src/lib/analyse/surfaceUtils.ts.
    let suspectGroupsCount = 0;
    for (const g of priceData as Array<Record<string, any>>) {
      if (!g || typeof g !== "object") continue;
      if (surfaceMismatchConfidence(g) < SURFACE_MISMATCH_ACTION_THRESHOLD) continue;
      const devisTotal = typeof g.devis_total_ht === "number" ? g.devis_total_ht : 0;
      const marketMax  = typeof g.theoretical_max_ht === "number" ? g.theoretical_max_ht
                       : typeof g.fourchette_max_ht === "number" ? g.fourchette_max_ht
                       : 0;
      // Ratio > 3× → signal très fort (4× pour rester sous le bruit catalogue)
      if (marketMax > 0 && devisTotal > marketMax * 3) {
        suspectGroupsCount++;
      }
    }
    if (suspectGroupsCount >= 2 && preEngine.verdict === "signer" && !preEngine.is_hard_block) {
      console.log(`[conclusion] V3.4.15 escalade verdict signer → a_negocier — ${suspectGroupsCount} postes suspects (surface mismatch + ratio > 3x)`);
      preEngine = {
        ...preEngine,
        verdict:      "a_negocier",
        color:        "orange",
        score_legacy: "ORANGE",
        price_label:  "⚠️ À négocier",
      };
    }
  }

  // Mapping engine verdict → labels lisibles dans le prompt LLM
  const ENGINE_DECISION_LABEL: Record<string, string> = {
    signer:    "signer",
    a_negocier: "signer_avec_negociation",
    refuser:   "ne_pas_signer",
  };
  const ENGINE_GLOBAL_LABEL: Record<string, string> = {
    signer:    "dans_la_norme",
    a_negocier: "a_negocier",
    refuser:   "a_risque",
  };
  const imposedDecision = ENGINE_DECISION_LABEL[preEngine.verdict] ?? "signer_avec_negociation";
  const imposedGlobal   = ENGINE_GLOBAL_LABEL[preEngine.verdict]   ?? "a_negocier";

  // Bloc analyse pondérée V3 pour le LLM
  const wa = preEngine.weighted_anomalies;
  const weightedBlock = wa
    ? `\nANALYSE PONDÉRÉE DES ANOMALIES (V3 — source de vérité):
- Postes surdévalués (> +30% médiane marché): ${wa.anomalies_count} sur ${wa.total_analyzed} postes comparables
- Poids de ces postes dans le devis: ${Math.round(wa.poids_anomalies * 100)}%
- Surcoût réel issu de ces postes: ${wa.surcout_total > 0 ? `+${wa.surcout_total.toLocaleString("fr-FR")} € (+${Math.round(wa.surcout_pct * 100)}% du total)` : "aucun"}
- Impact global des anomalies: ${wa.impact_anomalies.toUpperCase()}${wa.impact_anomalies === "faible" ? " (< 20% du total — anomalies isolées)" : wa.impact_anomalies === "modéré" ? " (20–50% du total)" : " (≥ 50% du total)"}`
    : "";

  const verdictImposedBlock = `
VERDICT IMPOSÉ PAR LE MOTEUR DÉTERMINISTE:
- verdict_decisionnel: "${imposedDecision}"
- verdict_global: "${imposedGlobal}"
- Surcoût estimé: ${preEngine.overprice > 0 ? `+${Math.round(preEngine.overprice_pct * 100)}% vs moyenne marché (${Math.round(preEngine.overprice).toLocaleString("fr-FR")} €)` : "dans la norme ou sous la moyenne"}
- Seuil de tolérance appliqué: ${Math.round(preEngine.threshold_ok * 100)}%${preEngine.hard_block_reason === "company_status" ? `\n- HARD BLOCK PRIORITÉ 0 : STATUT JURIDIQUE À RISQUE (${preCompanyStatus ?? "cessation/liquidation/redressement/radiée"}) — verdict REFUSER forcé indépendamment du prix` : preEngine.is_hard_block ? "\n- HARD BLOCK ACTIF (entreprise radiée ou paiement suspect)" : ""}${weightedBlock}

RÈGLES ABSOLUES (ne pas déroger):
1. Tu DOIS produire exactement verdict_decisionnel="${imposedDecision}" et verdict_global="${imposedGlobal}".
2. INTERDIT de contredire ce verdict dans phrase_intro, justifications ou actions_avant_signature.
3. Si verdict_decisionnel="ne_pas_signer" → INTERDIT d'écrire des phrases comme "vous pouvez signer", "le devis est acceptable", "le prix est cohérent", "prix attractif", "bon rapport qualité-prix", "devis compétitif". Le prix peut être bas ET le verdict refuser (ex: entreprise en cessation) — ne jamais valoriser le prix dans ce cas.
4. Si verdict_decisionnel="signer" → INTERDIT de recommander de "négocier le prix" ou de "demander une réduction".
5. Si verdict_decisionnel="signer_avec_negociation" → INTERDIT d'écrire "vous pouvez signer en confiance" ou "aucune anomalie". Il y a au moins un poste trop élevé.
6. Ton rôle : EXPLIQUER et JUSTIFIER ce verdict factuel, pas le recalculer.
7. INTERDIT ABSOLU dans TOUS les champs textuels (phrase_intro, justifications, actions) :
   - "prix attractif", "prix attractive", "très bon prix", "excellent prix"
   - "sous la moyenne du marché", "inférieur au marché global", "devis compétitif"
   - "globalement cohérent", "globalement conforme", "dans la norme du marché"
   Ces wordings créent des contradictions avec le surcoût détecté poste par poste.
   Même si le total cumulé est sous la moyenne marché (compensation entre postes),
   tu dois nommer les postes problématiques au lieu de présenter le devis comme attractif.

8bis. INTERDIT ABSOLU dans actions_avant_signature : demander à l'utilisateur de
   vérifier l'IMMATRICULATION, le SIRET, le statut juridique, l'ancienneté, les
   obligations légales, le régime fiscal (article 293B), le code APE, ou
   l'inscription au RCS de l'entreprise. CES VÉRIFICATIONS SONT DÉJÀ FAITES PAR
   NOTRE SYSTÈME via Pappers/INSEE et affichées dans le bloc "Entreprise &
   Fiabilité" juste en dessous du verdict. Demander à l'utilisateur de les
   refaire (sur Infogreffe, Societe.com, Pappers, etc.) casse la promesse
   produit et perd la crédibilité. Si tu veux proposer une action liée à
   l'entreprise, propose plutôt :
   - "Demandez à l'artisan une attestation d'assurance RC Pro et décennale en cours de validité"
   - "Demandez à l'artisan des références de chantiers similaires (3 minimum) avec coordonnées"
   - "Demandez à l'artisan une garantie écrite (durée, conditions, exclusions)"${wa?.impact_anomalies === "faible" ? `
8. IMPACT ANOMALIES FAIBLE (${Math.round((wa?.poids_anomalies ?? 0) * 100)}% du total) — RÈGLES DE WORDING :
   - INTERDIT : "surcoût massif", "devis très au-dessus du marché"
   - OBLIGATOIRE : mentionner les postes élevés comme négociation locale, pas comme rejet global
   - phrase_intro doit rester factuelle (montant + ville + type) sans qualificatif positif global` : ""}`;

  // Si hard block (company_status ou flags), ne pas contextualiser le prix comme "attractif"
  const pricePositionLabel = (() => {
    if (preEngine.is_hard_block) return "NON PERTINENT — blocage juridique/sécurité prioritaire";
    switch (marketPosition.globalLabel) {
      case "inférieur_au_marché":    return "INFÉRIEUR À LA MOYENNE — le devis est sous les prix du marché";
      case "au_dessus_du_max":       return "AU-DESSUS DU MAX — prix anormalement élevé";
      case "au_dessus_de_la_moyenne": return "AU-DESSUS DE LA MOYENNE";
      default:                       return "DANS LA NORME";
    }
  })();
  const marketPositionContext = marketPosition.globalLabel !== "hors_catalogue"
    ? `\nPOSITIONNEMENT GLOBAL DU DEVIS vs MARCHÉ:
- Total devis (postes comparables): ${marketPosition.totalDevis.toFixed(0)} €
- Fourchette marché totale: ${marketPosition.totalMarketMin.toFixed(0)} – ${marketPosition.totalMarketMax.toFixed(0)} € (moyenne: ${marketPosition.totalMarketAvg.toFixed(0)} €)
- Position: ${pricePositionLabel}`
    : "";

  // ── Prompt Gemini ─────────────────────────────────────────────────────────
  const critiquesBlock = criteres_rouges.length > 0
    ? `\nALERTES CRITIQUES DÉTECTÉES (facteurs bloquants) :\n${criteres_rouges.map(r => `🔴 ${r}`).join("\n")}\n⚠️ CES ALERTES PRIMENT sur l'analyse de prix. Si l'entreprise est radiée ou en procédure collective, la conclusion DOIT être "ne_pas_signer" et "a_risque", indépendamment du positionnement tarifaire.`
    : "";

  // ── Bloc multi-devis (RÈGLE 5) ───────────────────────────────────────────────
  const multiDevisBlock = isMultipleQuotes && segmentAnalyses.length > 0 ? (() => {
    const segLines = segmentAnalyses.map((seg, i) => {
      const v = String(seg.verdict ?? "signer");
      const emoji = v === "refuser" ? "🔴" : v === "a_negocier" ? "🟠" : "🟢";
      const totalHtSeg = typeof seg.total_ht === "number" ? `${seg.total_ht.toLocaleString("fr-FR")} € HT` : "montant inconnu";
      const marketMin = typeof seg.market_min === "number" ? seg.market_min : 0;
      const marketMax = typeof seg.market_max === "number" ? seg.market_max : 0;
      const hasMarket = typeof seg.has_market_data === "boolean" ? seg.has_market_data : marketMax > 0;
      const marketStr = hasMarket ? `fourchette marché ${marketMin.toLocaleString("fr-FR")}–${marketMax.toLocaleString("fr-FR")} €` : "hors catalogue marché";
      const anomalies = typeof seg.anomalies_count === "number" ? seg.anomalies_count : 0;
      const overpricePct = typeof seg.overprice_pct === "number" ? `${seg.overprice_pct >= 0 ? "+" : ""}${Math.round(seg.overprice_pct * 100)}%` : "";
      return `  ${emoji} Artisan ${i + 1}: ${String(seg.entreprise_nom ?? "Inconnu")} (${String(seg.lot_type ?? "lot")})
     Total: ${totalHtSeg} | Verdict: ${v.toUpperCase()} | ${marketStr}${overpricePct ? ` | Écart marché: ${overpricePct}` : ""}${anomalies > 0 ? ` | ${anomalies} anomalie(s)` : ""}`;
    }).join("\n");

    const artisansARisque = segmentAnalyses
      .filter(s => String(s.verdict) === "refuser" || String(s.verdict) === "a_negocier")
      .map(s => `${String(s.entreprise_nom ?? "?")} (${String(s.verdict ?? "?")})`);

    const globalV = String(globalMetricsRaw?.verdict_global ?? "signer");
    const globalTotal = typeof globalMetricsRaw?.total_devis_ht === "number"
      ? `${(globalMetricsRaw.total_devis_ht as number).toLocaleString("fr-FR")} € HT`
      : "montant total inconnu";

    return `
⚠️ MODE MULTI-DEVIS — PDF contenant ${segmentAnalyses.length} artisans distincts.
RÈGLE ABSOLUE : chaque artisan est analysé INDÉPENDAMMENT. Ne jamais mélanger leurs données.

VERDICTS PAR ARTISAN (pré-calculés — NE PAS recalculer) :
${segLines}

VERDICT GLOBAL : ${globalV.toUpperCase()} | Total chantier : ${globalTotal}
${artisansARisque.length > 0 ? `ARTISANS À RISQUE : ${artisansARisque.join(", ")}` : "Aucun artisan à risque."}

CONTRAINTES ABSOLUES MULTI-DEVIS (RÈGLE 5) :
1. INTERDIT d'écrire "le devis est cohérent" ou "vous pouvez signer" si verdict_global ≠ signer.
2. INTERDIT d'écrire "le devis est acceptable" si ≥ 1 artisan a verdict refuser ou a_negocier.
3. Si un artisan a verdict REFUSER → mentionner explicitement son nom et la raison.
4. Ton rôle : expliquer et justifier global_verdict="${globalV}", pas le recalculer.
5. La phrase_intro DOIT mentionner le nombre d'artisans et le verdict global.
6. Les anomalies et actions doivent être attribuées à l'artisan concerné (indiquer le nom).`;
  })() : "";

  const userPrompt = `Tu es un expert en rénovation immobilière. Analyse ce devis et aide un particulier à décider s'il doit signer ou non.
${verdictImposedBlock}
${multiDevisBlock}

CONTEXTE DU DEVIS:
- Entreprise: ${isMultipleQuotes ? `${segmentAnalyses.length} artisans (voir détail ci-dessus)` : nomEntreprise || "inconnue"}
- Montant HT: ${totalHT ? `${totalHT.toLocaleString("fr-FR")} €` : "inconnu"}
- Montant TTC: ${totalTTC ? `${totalTTC.toLocaleString("fr-FR")} €` : "inconnu"}
- TVA: ${tauxTVA ? `${tauxTVA}%` : "inconnue"}
- Ville: ${ville || "inconnue"}${codePostal ? ` (${codePostal})` : ""}
- Type de travaux: ${workType || "rénovation"}
- Résumé du devis: ${resume || "non disponible"}${marketPositionContext}${critiquesBlock}
${devisAgeWarning ? `\n${devisAgeWarning}` : ""}

ANALYSE PAR POSTE (déjà calculée):
${groupsSummary}

MISSION — produis 6 éléments :

1. ANOMALIES RÉELLES : postes dont le prix unitaire est > 2× le max marché, ou incohérence description/prix flagrante (ex: "carrelage 30×30 standard" facturé au prix d'un carrelage premium).
   → Pour chaque anomalie : prix unitaire exact, fourchette attendue, surcoût estimé, explication courte.

2. JUSTIFICATIONS : en 1-2 phrases, ce qui explique le reste du prix (matériaux premium cohérents, complexité, étage, TVA réduite, etc.)

3. VERDICT DÉCISIONNEL (choisir UNE seule option) :
   - "signer" → prix cohérent, aucune anomalie réelle, risque faible, le particulier peut signer en confiance
   - "signer_avec_negociation" → 1 anomalie isolée OU quelques postes élevés mais le reste du devis est acceptable — la négociation suffit à corriger l'écart
   - "ne_pas_signer" → UNIQUEMENT si : 2 anomalies ou plus ET non justifiées, OU surcoût > 30% du total HT, OU incohérences majeures sur plusieurs postes. UNE seule anomalie isolée ne justifie PAS "ne_pas_signer" sauf si elle représente à elle seule > 50% du total HT.

4. SURCOÛT GLOBAL (fourchette min/max en €) :
   - Formule : Σ (total_devis_poste − total_fourchette_max_marché) pour chaque poste anormal.
   - IMPORTANT : utilise les TOTAUX HT (chiffre entre parenthèses "total: X–Y €"), PAS les prix unitaires.
   - Exemple : poste à 12 275€ avec fourchette marché total 900–2800€ → surcoût = 12 275 − 2 800 = 9 475€.
   - min = somme brute × 0.7 (hypothèse basse), max = somme brute × 1.3 (hypothèse haute).
   - Si aucune anomalie → min: 0, max: 0.

5. NIVEAU DE RISQUE — DOIT être cohérent avec verdict_global (règle stricte) :
   - verdict_global "dans_la_norme" → niveau_risque: "faible"
   - verdict_global "eleve_justifie" → niveau_risque: "modéré"
   - verdict_global "a_negocier"    → niveau_risque: "modéré"
   - verdict_global "a_risque"      → niveau_risque: "élevé" (OBLIGATOIRE)

6. ACTIONS AVANT SIGNATURE (exactement 3 actions concrètes, formulées pour un particulier) :
   - Actions réalistes et actionnables IMMÉDIATEMENT (appel, email, demande de document)
   - Adaptées aux anomalies et au niveau de risque détectés
   - Ex: "Demandez à l'entreprise une facture fournisseur pour le carrelage CHICCO pour justifier le prix"
   - Si aucune anomalie, les actions portent sur les bonnes pratiques contractuelles

RÈGLES STRICTES:
- ALERTES CRITIQUES EN TÊTE : si des "ALERTES CRITIQUES DÉTECTÉES" figurent dans le contexte (entreprise radiée, procédure collective), le verdict DOIT être "a_risque" + "ne_pas_signer". L'analyse de prix reste secondaire. La phrase_intro et les justifications doivent mentionner explicitement le problème (ex: "entreprise radiée des registres officiels").
- DEVIS ANCIEN : si un avertissement "DEVIS ANCIEN" figure dans le contexte, la phrase_intro doit mentionner l'année du devis et préciser que les prix sont susceptibles d'avoir évolué. Les justifications doivent noter que la comparaison au marché actuel est indicative.
- DISTINCTION CRITIQUE entre "a_negocier" et "eleve_justifie" :
  → "a_negocier" signifie que le prix EST réellement trop élevé et que le particulier DOIT négocier à la baisse. N'utilise ce verdict QUE s'il y a au moins une anomalie réelle non justifiée.
  → "eleve_justifie" signifie que le prix est au-dessus de la moyenne du marché MAIS s'explique par la complexité, la nature spécifique de la mission, des matériaux premium ou une zone géographique chère. Le particulier N'A PAS à négocier le prix — il doit vérifier les qualifications et clauses. Le badge affiché sera "Élevé mais justifié", PAS "À négocier".
  → RÈGLE : Si tes justifications expliquent pourquoi le prix est normal → utilise "eleve_justifie", pas "a_negocier". Ces deux verdicts ne peuvent PAS coexister dans le même raisonnement.
  → RÈGLE : Si la référence marché est marquée "Comparaison indicative" (référence peu fiable pour ce type de prestation), ne pas utiliser "a_negocier" uniquement à cause de l'écart de prix — ce serait une fausse anomalie basée sur une mauvaise référence. Utilise "eleve_justifie" si le prix s'explique par la prestation, ou "dans_la_norme" si l'analyse ne permet pas de conclure.
- PRIX ATTRACTIF : si le POSITIONNEMENT GLOBAL est "INFÉRIEUR À LA MOYENNE", c'est une bonne affaire. Sauf anomalie réelle (prix unitaire > 2× le max OU incohérence flagrante), le verdict doit être "signer". Ne jamais recommander de "négocier le prix" dans les actions quand le devis est déjà sous la moyenne du marché — c'est incohérent. Les actions doivent porter sur les vérifications qualité, assurances, et clauses contractuelles.
- Des variations de prix ENTRE LIGNES du même type (ex: volets à des prix différents selon dimensions/options) ne sont PAS des anomalies si le total global est dans ou sous la fourchette marché.
- INTERDIT : signaler un poste marqué [FORFAIT GLOBAL] comme anomalie de prix. Un forfait global ne peut PAS être comparé à un prix unitaire catalogue. Ces postes sont à commenter uniquement si le montant total semble disproportionné au regard de la prestation décrite.
- MISMATCH D'UNITÉ : un poste marqué [⚠️ MISMATCH UNITÉ] (ex: cloison ou peinture facturé en U plutôt qu'en m²) ne peut PAS être comparé au catalogue marché — n'inclure AUCUNE anomalie de prix pour ces postes. Dans les actions_avant_signature, inclure UNE action du type : "Demandez la surface exacte en m² pour [nom du poste] — facturé en U sans surface indiquée, impossible de comparer au marché. Si < 8 m² le prix est élevé, négociez ; si > 12 m² le prix est cohérent."
- GROUPE HÉTÉROGÈNE : un poste marqué [⚠️ GROUPE PROBABLEMENT HÉTÉROGÈNE] contient des lignes de devis hétérogènes (ex: chape + primaire + dalle + acier mis ensemble dans un seul "Carrelage"). Le prix unitaire calculé est donc ABERRANT et ne reflète PAS le vrai prix de la prestation principale. INTERDIT ABSOLU de pointer ce poste comme anomalie de prix. Au lieu de ça, dans les actions_avant_signature, inclure UNE action du type : "Demandez à l'artisan le détail ligne par ligne du poste '[nom du poste]' — plusieurs prestations différentes semblent regroupées, ce qui empêche une comparaison juste au marché."
- ROOM MISMATCH : un poste marqué [⚠️ ROOM MISMATCH] signale que notre matching automatique a choisi une fourchette marché spécifique à une pièce (cuisine, sdb, chambre...) qui n'apparaît PAS dans le devis. La comparaison vs marché n'est donc PAS fiable. INTERDIT ABSOLU de pointer ce poste comme anomalie de prix ni de citer la pièce du label dans tes commentaires. Dans phrase_intro / justifications / actions, NE JAMAIS mentionner le mot "cuisine", "salle de bain", "chambre" si ce mot ne vient pas explicitement des descriptions du devis.
- NE PAS signaler comme anomalie ce qui s'explique par la localisation, l'étage, des matériaux premium COHÉRENTS, ou une complexité technique réelle.
- Surcoût = total_devis_poste − total_fourchette_max_marché (TOTAUX, jamais prix unitaires). Jamais négatif, 0 si dans la fourchette. Pour les forfaits : surcoût = 0 sauf incohérence flagrante sur le montant total.
- COHÉRENCE OBLIGATOIRE : verdict_global et niveau_risque DOIVENT être alignés (voir règle 5). Ne jamais retourner "a_risque" avec niveau_risque "modéré" ou "faible".
- Si aucune anomalie → anomalies: [], has_anomalies: false, verdict_decisionnel: "signer" ou "signer_avec_negociation".
- Les 3 actions doivent être différentes et couvrir l'essentiel : vérification prix + négociation + protection juridique/technique.
- Sois factuel, direct, écris pour un particulier non-expert.

RÉPONDS UNIQUEMENT avec ce JSON (pas de texte avant ou après) :
{
  "verdict_global": "dans_la_norme | eleve_justifie | a_negocier | a_risque",
  "phrase_intro": "phrase complète d'une ligne : montant + ville + type projet + verdict (ex: '110 404 € HT pour une rénovation complète à Rennes — dans la fourchette haute du marché')",
  "anomalies": [
    {
      "poste": "nom exact du poste",
      "ligne_devis": "libellé exact de la ligne concernée",
      "prix_unitaire_devis": 27.72,
      "unite": "m²",
      "fourchette_min": 8,
      "fourchette_max": 12,
      "surcout_estime": 250,
      "explication": "explication courte (1 ligne max)"
    }
  ],
  "justifications": "phrase courte expliquant ce qui justifie le prix global",
  "has_anomalies": true,
  "verdict_decisionnel": "signer | signer_avec_negociation | ne_pas_signer",
  "surcout_global": { "min": 1200, "max": 2000 },
  "niveau_risque": "faible | modéré | élevé",
  "actions_avant_signature": [
    "Action 1 concrète et actionnable",
    "Action 2 concrète et actionnable",
    "Action 3 concrète et actionnable"
  ]
}`;

  // ── Appel Gemini ──────────────────────────────────────────────────────────
  let conclusionData: ConclusionData;
  try {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 80_000); // 80s — Gemini 2.5 peut prendre 45-60s

    const aiResponse = await fetch(GEMINI_URL, {
      method:  "POST",
      signal:  controller.signal,
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${googleApiKey}`,
      },
      body: JSON.stringify({
        model:       "gemini-2.5-flash",
        messages:    [{ role: "user", content: userPrompt }],
        max_tokens:  16384,
        temperature: 0.1,
      }),
    });
    clearTimeout(timeoutId);

    if (!aiResponse.ok) {
      const details = await aiResponse.text().catch(() => "");
      const safe = details.replace(/Bearer\s+[a-zA-Z0-9_.-]+/gi, "Bearer ***").substring(0, 200);
      console.error("[conclusion] Gemini error:", aiResponse.status, safe);
      return jsonError("Le service d'analyse est temporairement indisponible", 502);
    }

    const aiResult  = await aiResponse.json();
    const content   = aiResult.choices?.[0]?.message?.content;
    if (!content) return jsonError("Réponse IA vide", 502);

    // Nettoyage robuste JSON
    let jsonStr = content.trim();
    const blockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (blockMatch) jsonStr = blockMatch[1].trim();
    const start = jsonStr.indexOf("{");
    const end   = jsonStr.lastIndexOf("}");
    if (start !== -1 && end > start) jsonStr = jsonStr.slice(start, end + 1);

    // Vérification troncature (JSON mal fermé = max_tokens atteint)
    if (!jsonStr.endsWith("}")) {
      console.error("[conclusion] JSON tronqué — max_tokens probablement atteint. Longueur:", jsonStr.length);
      return jsonError("La réponse IA est incomplète. Réessayez.", 502);
    }

    const parsed = JSON.parse(jsonStr);

    // ── Normalisation & sanitisation ─────────────────────────────────────────
    const validVerdicts    = ["dans_la_norme", "eleve_justifie", "a_negocier", "a_risque"] as const;
    const validDecisions   = ["signer", "signer_avec_negociation", "ne_pas_signer"] as const;
    const validRisques     = ["faible", "modéré", "élevé"] as const;

    // ──────────────────────────────────────────────────────────────────────────
    // V3.3.4 Niveau 1 — Identifier les groupes hétérogènes (mal groupés par Gemini)
    // pour pouvoir filtrer les anomalies LLM qui pointent ces groupes à tort.
    //
    // Le prompt instruit Gemini de ne PAS pointer ces groupes — mais en défense en
    // profondeur, on filtre aussi en aval au cas où il persisterait.
    // ──────────────────────────────────────────────────────────────────────────
    const heterogeneousLabels = new Set<string>();
    if (Array.isArray(priceData)) {
      for (const g of priceData as Record<string, any>[]) {
        if (g && typeof g === "object" && isLikelyHeterogeneousGroup(g)) {
          const label = (g.job_type_label as string | undefined)?.trim().toLowerCase();
          if (label) heterogeneousLabels.add(label);
        }
      }
    }
    if (heterogeneousLabels.size > 0) {
      console.warn(`[conclusion] ${heterogeneousLabels.size} groupe(s) hétérogène(s) détecté(s) — anomalies LLM correspondantes filtrées : ${Array.from(heterogeneousLabels).join(", ")}`);
    }

    const sanitizedAnomalies: AnomalieConclusion[] = Array.isArray(parsed.anomalies)
      ? parsed.anomalies
          .filter((a: any) => a && typeof a === "object" && a.poste)
          // V3.3.4 — filtre les anomalies sur des groupes hétérogènes (Niveau 1)
          .filter((a: any) => {
            const poste = String(a.poste || "").trim().toLowerCase();
            const ligne = String(a.ligne_devis || "").trim().toLowerCase();
            // Une anomalie est filtrée si son `poste` matche un label hétérogène
            // (fuzzy match : on vérifie inclusion bidirectionnelle pour tolérer
            // les variantes de wording type "Carrelage (fourni+posé)" vs "Carrelage").
            for (const hetLabel of heterogeneousLabels) {
              if (poste.includes(hetLabel) || hetLabel.includes(poste)) {
                console.warn(`[conclusion] anomalie LLM filtrée (groupe hétérogène "${hetLabel}") : ${a.poste} — ${a.ligne_devis ?? ""}`);
                return false;
              }
              if (ligne && (ligne.includes(hetLabel) || hetLabel.includes(ligne))) {
                console.warn(`[conclusion] anomalie LLM filtrée (groupe hétérogène "${hetLabel}") via ligne : ${a.poste}`);
                return false;
              }
            }
            return true;
          })
          .map((a: any): AnomalieConclusion => ({
            poste:               String(a.poste        || ""),
            ligne_devis:         String(a.ligne_devis  || a.poste || ""),
            prix_unitaire_devis: typeof a.prix_unitaire_devis === "number" ? a.prix_unitaire_devis : 0,
            unite:               String(a.unite        || "unité"),
            fourchette_min:      typeof a.fourchette_min  === "number" ? a.fourchette_min  : null,
            fourchette_max:      typeof a.fourchette_max  === "number" ? a.fourchette_max  : null,
            surcout_estime:      typeof a.surcout_estime  === "number" ? a.surcout_estime  : null,
            explication:         typeof a.explication     === "string" ? a.explication.trim() : null,
          }))
      : [];

    // ──────────────────────────────────────────────────────────────────────
    // V3.4.17 (2026-05-19) — Gardes globales préalables au scoring.
    //
    // Avant V3.4.17, le moteur tentait de scorer même quand :
    //   (a) les Qté du devis n'avaient pas d'unité explicite (m², ml, U…),
    //       rendant la comparaison aux prix marché (en €/m²) non fiable.
    //   (b) les groupes Gemini avaient des totaux mathématiquement incohérents
    //       avec leurs lignes (devis_total_ht ≠ Σ devis_lines.amount_ht).
    //
    // Désormais on détecte ces 2 conditions EN AMONT et on bascule le verdict
    // en `comparison_indicative` + on ajoute une action explicite. Le user
    // voit "comparaison globale indicative" au lieu d'un faux verdict VERT
    // basé sur des données pourries.
    // ──────────────────────────────────────────────────────────────────────
    let unitMissingRatio = 0;
    let totalLinesCount = 0;
    let linesWithoutUnitCount = 0;
    if (Array.isArray(priceData)) {
      for (const g of priceData as Array<Record<string, any>>) {
        const lines = Array.isArray(g.devis_lines) ? g.devis_lines : [];
        for (const l of lines) {
          totalLinesCount++;
          const unit = String(l?.unit ?? "").trim().toLowerCase();
          // "" / null / qty as unit (regex digits) = unité manquante
          if (unit.length === 0 || /^\d+([.,]\d+)?$/.test(unit)) {
            linesWithoutUnitCount++;
          }
        }
      }
      if (totalLinesCount > 0) {
        unitMissingRatio = linesWithoutUnitCount / totalLinesCount;
      }
    }
    const hasUnitsMissing = unitMissingRatio > 0.50;

    // V3.5.0 Phase C — Détection mode vectoriel
    // Si le matcher vectoriel a tourné, chaque "groupe" contient une seule ligne
    // devis (1 ligne = 1 match catalogue). Du coup la garde "groupement invalide"
    // V3.4.17 n'a aucun sens (sumLines == groupTotal par construction) et le
    // mix confidence devient un meilleur signal d'incertitude que les anciennes
    // gardes basées sur le groupement Gemini.
    const isVectorialMode = Array.isArray(priceData) &&
      priceData.some((g: any) => g && typeof g === "object" && g.vectorial);

    let invalidGroupingsCount = 0;
    if (Array.isArray(priceData) && !isVectorialMode) {
      for (const g of priceData as Array<Record<string, any>>) {
        const groupTotal = typeof g.devis_total_ht === "number" ? g.devis_total_ht : 0;
        const lines = Array.isArray(g.devis_lines) ? g.devis_lines : [];
        if (groupTotal <= 0 || lines.length === 0) continue;
        const sumLines = lines.reduce((acc: number, l: any) => {
          const a = typeof l?.amount_ht === "number" ? l.amount_ht : 0;
          return acc + a;
        }, 0);
        if (sumLines <= 0) continue;
        const delta = Math.abs(groupTotal - sumLines);
        const deltaRatio = delta / groupTotal;
        if (delta > 50 && deltaRatio > 0.10) {
          invalidGroupingsCount++;
          console.warn(
            `[conclusion] V3.4.17 groupement invalide — "${g.job_type_label ?? "?"}" : ` +
            `total=${groupTotal} € vs Σ lignes=${sumLines.toFixed(0)} € (delta ${delta.toFixed(0)} €, ${(deltaRatio * 100).toFixed(0)}%)`
          );
        }
      }
    }
    const hasInvalidGroupings = invalidGroupingsCount >= 1;

    // V3.5.0 Phase C — Mix confidence vectoriel
    // En mode vectoriel, si le mix de matchs est trop incertain (>30% no_match
    // OU >50% low/no_match), on bascule en `comparison_indicative=true` pour
    // dire honnêtement "matching imprécis" plutôt que de fabriquer un verdict
    // alarmiste depuis des correspondances faibles.
    let vectorialUncertaintyTriggered = false;
    if (isVectorialMode && Array.isArray(priceData)) {
      const counts = { high: 0, medium: 0, low: 0, no_match: 0 };
      for (const g of priceData as Array<Record<string, any>>) {
        const tier = g?.vectorial?.confidence ?? "no_match";
        if (tier in counts) counts[tier as keyof typeof counts]++;
      }
      const total = counts.high + counts.medium + counts.low + counts.no_match;
      if (total > 0) {
        const noMatchRatio = counts.no_match / total;
        const weakRatio = (counts.low + counts.no_match) / total;
        vectorialUncertaintyTriggered = noMatchRatio > 0.30 || weakRatio > 0.50;
        console.log(
          `[conclusion] V3.5 vectorial mix — high=${counts.high} medium=${counts.medium} low=${counts.low} no_match=${counts.no_match} ` +
            `(noMatchRatio=${(noMatchRatio * 100).toFixed(0)}% weakRatio=${(weakRatio * 100).toFixed(0)}%) ` +
            `${vectorialUncertaintyTriggered ? "→ comparaison indicative" : "→ OK"}`,
        );
      }
    }

    if (hasUnitsMissing) {
      console.log(`[conclusion] V3.4.17 unités manquantes ${(unitMissingRatio * 100).toFixed(0)}% (${linesWithoutUnitCount}/${totalLinesCount}) → comparaison globale indicative`);
    }
    if (hasInvalidGroupings) {
      console.log(`[conclusion] V3.4.17 ${invalidGroupingsCount} groupement(s) invalide(s) → comparaison globale indicative`);
    }

    // Surcoût global — source de vérité : calcul serveur (miroir de quoteGlobalAnalysis.ts)
    // Le calcul serveur est plus fiable que Gemini qui confond prix unitaires et totaux.
    const serverSurcout = computeServerSurcout(priceData);
    const surcoutMin = serverSurcout.max > 0
      ? serverSurcout.min
      : (() => {
          const rawSurcout = parsed.surcout_global;
          return (rawSurcout && typeof rawSurcout.min === "number" && rawSurcout.min >= 0)
            ? rawSurcout.min
            : Math.round(sanitizedAnomalies.reduce((s, a) => s + (a.surcout_estime ?? 0), 0) * 0.7);
        })();
    const surcoutMax = serverSurcout.max > 0
      ? serverSurcout.max
      : (() => {
          const rawSurcout = parsed.surcout_global;
          return (rawSurcout && typeof rawSurcout.max === "number" && rawSurcout.max >= 0)
            ? rawSurcout.max
            : Math.round(sanitizedAnomalies.reduce((s, a) => s + (a.surcout_estime ?? 0), 0) * 1.3);
        })();

    // Actions : garde exactement 3, complète avec des valeurs par défaut si nécessaire
    // V3.4.26 (2026-05-21) — Filtre des actions absurdes type "Vérifier l'existence
    // légale sur Infogreffe/Societe.com/Pappers". Ces vérifications sont DÉJÀ
    // faites par VMD (bloc Entreprise) — demander à l'utilisateur de les refaire
    // sur un site externe casse la promesse produit et perd la crédibilité.
    // Cas d'origine devis AS COUVERTURE 2026-05-21.
    const EXTERNAL_VERIF_PATTERNS: RegExp[] = [
      // Pointage vers services externes (infogreffe, pappers, etc.)
      /v[ée]rifi(er|ez|cation)[^.]{0,80}(infogreffe|societe\.com|soci[eé]t[eé]\.com|pappers|insee|sirene)/i,
      /(consult|recherch|cherch)(er|ez|é|e)[^.]{0,80}(infogreffe|societe\.com|soci[eé]t[eé]\.com|pappers|insee|sirene)/i,
      // Vérif d'existence / ancienneté / statut juridique
      /v[ée]rifi(er|ez)\s+l['']?(existence|anciennet[eé]|statut)\s+(l[eé]gal|juridique|d['' ]?l['' ]?entreprise)/i,
      // V3.4.27 — Vérif d'immatriculation / obligations légales / SIRET
      // (VMD fait déjà ces vérifs via Pappers/INSEE, cf. bloc Entreprise & Fiabilité)
      /v[ée]rifi(er|ez|cation)[^.]{0,120}\b(immatricul|inscrit\s+au\s+rcs|en\s+r[eè]gle|obligations\s+l[eé]gales|\s+jour\s+de\s+ses)/i,
      /(assurez[- ]vous|s['']?assurer)[^.]{0,120}\b(immatricul|en\s+r[eè]gle|obligations\s+l[eé]gales|\s+jour\s+de\s+ses)/i,
      /v[ée]rifi(er|ez)[^.]{0,120}\b(article\s+293\s*b|r[eé]gime\s+micro[- ]entrepr|tva\s+non\s+applicable)/i,
      /v[ée]rifi(er|ez)[^.]{0,120}\b(num[eé]ro\s+siret|num[eé]ro\s+siren|num[eé]ro\s+ape|code\s+ape)/i,
    ];
    const isAbsurdExternalVerifAction = (a: string): boolean =>
      EXTERNAL_VERIF_PATTERNS.some((p) => p.test(a));

    const geminiActions: string[] = Array.isArray(parsed.actions_avant_signature)
      ? parsed.actions_avant_signature
          .filter((a: unknown) => typeof a === "string" && a.trim().length > 0)
          .map((a: string) => a.trim())
          .filter((a: string) => {
            if (isAbsurdExternalVerifAction(a)) {
              console.warn(`[conclusion] V3.4.26 action absurde filtrée — "${a.slice(0, 120)}"`);
              return false;
            }
            return true;
          })
          .slice(0, 3)
      : [];

    // Détection mismatch surface/unité — injecte une action spécifique SI confidence suffisante.
    // V3.2.3 — On filtre désormais sur un score de confiance >= 0.70 (au lieu d'un bool brut).
    // Risque sans seuil : une mauvaise extraction d'unité par Gemini déclenchait l'action
    // "Demandez la surface en m²" alors que le user AVAIT déjà fourni la surface — message
    // ridicule pour le user, perte de crédibilité.
    //
    // V3.2 : déduplication par job_type_label (un seul message par type de poste, max 2).
    const surfaceMismatchCandidates = Array.isArray(priceData)
      ? (priceData as Record<string, any>[])
          .filter(g => g && typeof g === "object" && g.job_type_label !== "Autre")
          .map(g => ({ group: g, confidence: surfaceMismatchConfidence(g) }))
          .filter(({ confidence }) => confidence >= SURFACE_MISMATCH_ACTION_THRESHOLD)
          // Si plusieurs groupes ex-aequo, on garde ceux de plus haute confiance en premier
          .sort((a, b) => b.confidence - a.confidence)
      : [];

    // Dédupliquer par job_type_label (un seul message par type de poste, max 2 messages au total)
    const seenLabels = new Set<string>();
    const surfaceActions: string[] = [];
    for (const { group: g, confidence } of surfaceMismatchCandidates) {
      const posteName = (g.job_type_label as string) || "ce poste";
      const normalizedLabel = posteName.toLowerCase().trim();
      if (seenLabels.has(normalizedLabel)) continue;
      seenLabels.add(normalizedLabel);
      const unitUsedRaw = (g.main_unit as string) || "";
      // V3.4.18 (2026-05-19) — Wording "facturé en X" retiré quand X est un
      // label non-significatif côté user. Avant : "facturé en Article sans
      // précision de surface" — "Article" n'est pas une vraie unité, c'est
      // le header de la colonne du tableau Gemini → wording confus.
      // Désormais : on ne mentionne l'unité QUE si c'est une vraie unité de
      // mesure (m², ml, U, forfait, ens, lot, h, jour). Sinon on omet.
      const REAL_UNITS = new Set([
        "u", "unité", "unite", "forfait", "ens", "ensemble",
        "prestation", "pce", "pièce", "piece", "lot", "global",
        "m2", "m²", "ml", "h", "heure", "jour", "j",
      ]);
      const unitNorm = unitUsedRaw.toLowerCase().trim();
      const showUnit = REAL_UNITS.has(unitNorm);
      const unitPhrase = showUnit
        ? `facturé en ${unitUsedRaw} sans précision de surface`
        : "facturé sans précision de surface";
      console.log(`[conclusion] surface mismatch confirmé pour "${posteName}" — confidence=${confidence.toFixed(2)} unitRaw="${unitUsedRaw}" showUnit=${showUnit}`);
      // V3.4.15 (2026-05-18) — Bug fix : retrait du seuil arbitraire "8/12 m²".
      // Avant : "Si < 8 m² le prix est élevé, négociez ; si > 12 m² le prix est cohérent."
      // Problème : ces seuils étaient hardcodés pour TOUS les postes (peinture,
      // doublage, ragréage, carrelage...) alors qu'ils ont des seuils m² très
      // différents. Faux/paternaliste. On garde uniquement la demande factuelle
      // de surface — c'est le user (et son artisan) qui jugent ensuite.
      surfaceActions.push(
        `Demandez la surface exacte en m² pour "${posteName}" — ${unitPhrase}, impossible de comparer au marché.`
      );
      if (surfaceActions.length >= 2) break; // max 2 actions surface différentes
    }

    // V3.4.17 — Action prioritaire si unités manquantes globales OU groupements
    // invalides. Cette action remonte EN TÊTE, avant les actions Gemini et surface.
    const v3417Actions: string[] = [];
    if (hasUnitsMissing) {
      v3417Actions.push(
        `Demandez à l'artisan un devis détaillé avec UNITÉS PRÉCISÉES (m², ml, U ou forfait) pour CHAQUE ligne — ${linesWithoutUnitCount} ligne${linesWithoutUnitCount > 1 ? "s" : ""} sur ${totalLinesCount} n'${linesWithoutUnitCount > 1 ? "ont" : "a"} pas d'unité explicite, la comparaison aux prix du marché n'est pas fiable sans cette précision.`
      );
    }
    if (hasInvalidGroupings && !hasUnitsMissing) {
      // Si on a déjà mentionné les unités, on évite la redondance (groupement
      // invalide est souvent une conséquence des unités manquantes).
      v3417Actions.push(
        `Demandez à l'artisan de regrouper les prestations par lot de travaux (plomberie, menuiserie, peinture…) avec un sous-total par lot — certaines lignes ont été mal regroupées et faussent la comparaison.`
      );
    }

    // Merge : actions V3.4.17 en tête (priorité), puis surface, puis Gemini, puis défauts
    const mergedActions: string[] = [...v3417Actions, ...surfaceActions, ...geminiActions];
    const DEFAULT_ACTIONS = [
      "Vérifiez les assurances décennale et RC Pro de l'entreprise avant de signer.",
      "Demandez un échéancier de paiement détaillé et ne versez pas plus de 30 % à la commande.",
      "Faites inscrire dans le contrat la date de début et la durée prévisionnelle des travaux.",
    ];
    while (mergedActions.length < 3) mergedActions.push(DEFAULT_ACTIONS[mergedActions.length % DEFAULT_ACTIONS.length]);

    // ── Sanitisation texte LLM — supprime les contradictions avec le verdict ─────
    // V3.2.1 : `hasServerSurcout` utilise la triple garde matérielle (montant absolu
    // > 1 000€ ET poids relatif > 3% du devis) pour éviter de bannir "avantageux"
    // sur un devis 48k€ avec 180€ de surcoût (faux positif de sanitization).
    const sanitizeVerdict = preEngine.verdict; // "signer" | "a_negocier" | "refuser"
    const hasServerSurcout = isMaterialServerSurcout(surcoutMax, totalHT, marketPosition.totalDevis);

    const phraseIntro    = sanitizeLLMText(
      typeof parsed.phrase_intro  === "string" ? parsed.phrase_intro.trim()   : "",
      sanitizeVerdict,
      hasServerSurcout,
    );
    const justifications = sanitizeLLMText(
      typeof parsed.justifications === "string" ? parsed.justifications.trim() : "",
      sanitizeVerdict,
      hasServerSurcout,
    );
    // Sanitise les explications des anomalies
    sanitizedAnomalies.forEach(a => {
      if (a.explication) a.explication = sanitizeLLMText(a.explication, sanitizeVerdict, hasServerSurcout);
    });
    // Sanitise les actions (évite "vous pouvez signer" dans les actions quand verdict ≠ signer)
    const rawActions = mergedActions.slice(0, 3).map(a => sanitizeLLMText(a, sanitizeVerdict, hasServerSurcout));

    // ── Note contextuelle marché (seuils adaptatifs UX) ──────────────────────────
    // Affichée dans ConclusionIA quand le moteur a assoupli les seuils.
    const marketContextParts: string[] = [];
    if (preEngine.market_dispersion_pct > 0.4) {
      marketContextParts.push("Marché avec forte variation de prix — tolérance ajustée");
    }
    if (preEngine.chantier_complexity === "high") {
      marketContextParts.push("Travaux complexes — variation de prix normale");
    }
    const market_context_note = marketContextParts.length > 0
      ? marketContextParts.join(" · ")
      : undefined;

    // ── Verdict déterministe — appliqué depuis preEngine (calculé avant Gemini) ──
    // Le LLM génère uniquement les explications textuelles.
    // preEngine est la source de vérité absolue pour le verdict final.
    const DECISION_MAP: Record<string, ConclusionData["verdict_decisionnel"]> = {
      signer:    "signer",
      a_negocier: "signer_avec_negociation",
      refuser:   "ne_pas_signer",
    };
    const GLOBAL_MAP: Record<string, ConclusionData["verdict_global"]> = {
      signer:    "dans_la_norme",
      a_negocier: "a_negocier",
      refuser:   "a_risque",
    };

    let verdictGlobal: ConclusionData["verdict_global"]        = GLOBAL_MAP[preEngine.verdict]   ?? "a_negocier";
    let verdictDecision: ConclusionData["verdict_decisionnel"] = DECISION_MAP[preEngine.verdict] ?? "signer_avec_negociation";

    // ──────────────────────────────────────────────────────────────────────────
    // GARDE DE COHÉRENCE FINALE (V3.2.1 — 2026-05-11)
    //
    // Source de vérité ultime : `computeServerSurcout` (déterministe).
    // Si le serveur a détecté un surcoût MATÉRIEL (cf. isMaterialServerSurcout :
    // > 1 000€ ABSOLU ET > 3% du devis RELATIF) mais que preEngine.verdict === "signer"
    // (parce que `weighted_anomalies` a raté les anomalies), on ESCALADE
    // automatiquement en "signer_avec_negociation".
    //
    // ⚠️ La triple garde (absolu + relatif) est CRITIQUE pour éviter le bug inverse :
    //   - 48 000€ + 180€ surcout → 0.4% → PAS MATÉRIEL → pas d'escalade (verdict reste signer)
    //   - 16 390€ + 3 400€ surcout → 21% → MATÉRIEL → escalade (cas Kern Terrassement)
    //
    // Sans ces deux conditions, on créerait un faux orange "à négocier pour 0.4% du devis"
    // qui briserait à nouveau la crédibilité — exactement le piège inverse de Kern.
    // ──────────────────────────────────────────────────────────────────────────
    // V3.4.17 — Escalade verdict si gardes "unités manquantes" ou "groupement
    // invalide" actives et qu'on était en "signer". Les variables `hasUnitsMissing`
    // et `hasInvalidGroupings` sont calculées plus haut (avant la section actions).
    let v3417Escalated = false;
    if ((hasUnitsMissing || hasInvalidGroupings) && preEngine.verdict === "signer" && !preEngine.is_hard_block) {
      verdictGlobal = "a_negocier";
      verdictDecision = "signer_avec_negociation";
      v3417Escalated = true;
      console.warn(`[conclusion] V3.4.17 escalade signer → a_negocier (unités=${hasUnitsMissing}, groupements=${hasInvalidGroupings})`);
    }

    let coherenceEscalated = false;
    if (preEngine.verdict === "signer" && isMaterialServerSurcout(surcoutMax, totalHT, marketPosition.totalDevis)) {
      const ratioPct = typeof totalHT === "number" && totalHT > 0
        ? Math.round((surcoutMax / totalHT) * 100)
        : 0;
      console.warn(
        `[conclusion] GARDE COHÉRENCE déclenchée — preEngine="signer" mais computeServerSurcout=` +
        `${surcoutMin}-${surcoutMax}€ (${ratioPct}% du devis) → escalade auto en "signer_avec_negociation".`
      );
      verdictGlobal   = "a_negocier";
      verdictDecision = "signer_avec_negociation";
      coherenceEscalated = true;
    }

    // ── Raisons du verdict (section "Pourquoi ce verdict ?") ─────────────────────
    // V3.2.2 — On ne falsifie PLUS les données métier (anomalies_count, surcout_total)
    // pour forcer une cohérence affichée. On passe les VRAIES valeurs au moteur, et
    // si la garde de cohérence a escaladé le verdict (divergence inexpliquée entre
    // computeServerSurcout et weighted_anomalies), on PREPEND une raison HONNÊTE
    // qui nomme explicitement la divergence — au lieu d'inventer 2 anomalies fictives.
    //
    // Raison du changement : injecter `anomalies_count = 2` artificiellement ferait
    // afficher "2 postes au-dessus du marché" sans pouvoir les nommer. Si un user
    // demande lesquels, on est nu. Mieux vaut admettre la divergence.
    const finalVerdictForReasons: "signer" | "a_negocier" | "refuser" =
      verdictDecision === "ne_pas_signer" ? "refuser"
      : verdictDecision === "signer_avec_negociation" ? "a_negocier"
      : "signer";

    // V3.3.2 — surcout mid serveur passé pour aligner le wording reasons sur le hero
    const serverSurcoutMid = (typeof surcoutMin === "number" && typeof surcoutMax === "number" && surcoutMax > 0)
      ? Math.round((surcoutMin + surcoutMax) / 2)
      : undefined;

    // V3.3.3 — compteur d'anomalies aligné sur ce qui est AFFICHÉ dans le rapport
    // (sanitizedAnomalies.length, source de la section "Anomalies détectées" et du sublabel
    // bandeau). Évite l'incohérence "2 postes" (bandeau) ≠ "3 postes" (reasons).
    const displayAnomaliesCount = sanitizedAnomalies.length;

    const verdict_reasons = generateVerdictReasons({
      verdict:               finalVerdictForReasons,
      overprice:             preEngine.overprice,
      overprice_pct:         preEngine.overprice_pct,
      anomalies_major_count: preMajorAnomalies,                    // vraie valeur, pas boostée
      company_risk:          preRisk,
      flags:                 preFlags,
      has_market_data:       preEngine.has_market_data,
      market_dispersion_pct: preEngine.market_dispersion_pct,
      chantier_complexity:   preEngine.chantier_complexity,
      threshold_ok:          preEngine.threshold_ok,
      weighted_anomalies:    preEngine.weighted_anomalies,         // vraie valeur, pas boostée
      server_surcout_mid:    serverSurcoutMid,                     // cohérence avec hero
      display_anomalies_count: displayAnomaliesCount,              // cohérence avec bandeau + liste
    });

    // ──────────────────────────────────────────────────────────────────────────
    // Honnêteté en cas de divergence — V3.2.2
    //
    // Si la garde de cohérence a déclenché l'escalade SANS que le moteur ne voie
    // d'anomalies (cas où preEngine.verdict était "signer" mais computeServerSurcout
    // a vu un surcoût matériel), on ajoute une raison qui DIT la divergence au lieu
    // de l'inventer.
    //
    // Cas concret : devis avec compensation globale (gros postes correctement chiffrés
    // qui tirent le total vers le bas + petits postes très au-dessus du marché qui
    // ne pèsent pas assez dans le poids cumulé pour franchir le seuil V3.1).
    // Dans ce cas, le user mérite l'info brute, pas une narration fabriquée.
    //
    // L'engagement honnête est aussi plus crédible commercialement : "voici ce qu'on
    // a vu, à toi d'arbitrer avec l'artisan" > "voici 2 anomalies (qui n'existent pas)".
    // ──────────────────────────────────────────────────────────────────────────
    const hasAnomaliesIdentified = preMajorAnomalies > 0 ||
      (preEngine.weighted_anomalies && preEngine.weighted_anomalies.anomalies_count > 0);

    if (coherenceEscalated && !hasAnomaliesIdentified) {
      const refTotal = (typeof totalHT === "number" && totalHT > 0)
        ? totalHT
        : (marketPosition.totalDevis > 0 ? marketPosition.totalDevis : 0);
      const ratioPct = refTotal > 0 ? Math.round((surcoutMax / refTotal) * 100) : 0;
      const surcoutMid = Math.round((surcoutMin + surcoutMax) / 2);
      const divergenceReason =
        `⚠️ Écart détecté : l'estimation serveur indique un surcoût d'environ ${surcoutMid.toLocaleString("fr-FR")} € ` +
        `(${ratioPct}% du devis) sur les postes comparables au marché, mais l'analyse poste par poste n'a pas identifié ` +
        `de ligne anormalement chère. À approfondir avec l'artisan pour comprendre la composition.`;

      // PREPEND : le message de divergence devient la raison #1, cap à 3 raisons au total
      verdict_reasons.reasons = [divergenceReason, ...verdict_reasons.reasons].slice(0, 3);
      // Summary cohérent avec le message
      verdict_reasons.summary = "Écart détecté — analyse à approfondir avec l'artisan";
    }

    // ── Sanitization finale du verdict_reasons (V3.3) ─────────────────────────
    // Le summary et les reasons sont générés par `generateVerdictReasons` (déterministe),
    // mais l'évolution des wordings au fil du temps peut laisser passer des phrases
    // contradictoires (ex: "cohérent avec les prix du marché" sur un devis avec surcoût).
    // On les fait passer par sanitizeLLMText comme dernier filet de sécurité, en réutilisant
    // les règles ALWAYS_FORBIDDEN (anti-contradiction universelle).
    const finalSanitizeVerdict: "signer" | "a_negocier" | "refuser" = finalVerdictForReasons;
    if (verdict_reasons.summary) {
      verdict_reasons.summary = sanitizeLLMText(verdict_reasons.summary, finalSanitizeVerdict, hasServerSurcout);
    }
    if (Array.isArray(verdict_reasons.reasons)) {
      verdict_reasons.reasons = verdict_reasons.reasons.map(r =>
        sanitizeLLMText(r, finalSanitizeVerdict, hasServerSurcout)
      );
    }

    // ── Cohérence forcée : niveau_risque DOIT correspondre à verdict_global ──
    const RISQUE_FORCED: Record<string, "faible" | "modéré" | "élevé"> = {
      dans_la_norme:  "faible",
      eleve_justifie: "modéré",
      a_negocier:     "modéré",
      a_risque:       "élevé",
    };
    const niveauRisque: "faible" | "modéré" | "élevé" = RISQUE_FORCED[verdictGlobal] ?? "modéré";

    // V3.4.13 (2026-05-16) — Détection catalogue sous-couvrant (overprice > +50%
    // SANS anomalie poste par poste identifiée). Quand ce flag est set, le hero
    // accusatoire "+X €" est masqué côté UI au profit d'un encadré "Comparaison
    // indicative". Cf. ConclusionIA.tsx pour le rendu.
    // V3.4.17 (2026-05-19) — `hasUnitsMissing` OU `hasInvalidGroupings` activent
    // aussi le flag : on ne peut PAS donner un verdict prix fiable si > 50% des
    // lignes n'ont pas d'unité explicite OU si des groupes Gemini sont
    // mathématiquement incohérents avec leurs lignes.
    // V3.5.0 Phase C (2026-05-21) — `vectorialUncertaintyTriggered` active aussi
    // le flag quand le mix confidence vectoriel est trop incertain (>30% no_match
    // OU >50% low/no_match).
    const comparisonIndicative = (
      (preEngine.overprice_pct ?? 0) > 0.50
      && sanitizedAnomalies.length === 0
      && (wa?.anomalies_count ?? 0) === 0
    ) || hasUnitsMissing || hasInvalidGroupings || vectorialUncertaintyTriggered;

    conclusionData = {
      verdict_global:          verdictGlobal,
      phrase_intro:            phraseIntro,
      anomalies:               sanitizedAnomalies,
      justifications,
      has_anomalies:           sanitizedAnomalies.length > 0 || hasServerSurcout,
      verdict_decisionnel:     verdictDecision as "signer" | "signer_avec_negociation" | "ne_pas_signer",
      surcout_global:          { min: surcoutMin, max: surcoutMax },
      niveau_risque:           niveauRisque,
      actions_avant_signature: rawActions,
      verdict_reasons,
      ...(market_context_note     ? { market_context_note } : {}),
      ...(comparisonIndicative    ? { comparison_indicative: true } : {}),
      generated_at:            new Date().toISOString(),
      // V3.2 — version du moteur, permet l'invalidation automatique du cache lors d'un futur fix.
      engine_version:          ENGINE_VERSION,
      // Trace si la garde de cohérence a été déclenchée (utile pour debug / monitoring)
      ...(coherenceEscalated ? { coherence_escalated: true } : {}),
    } as ConclusionData & { engine_version: string; coherence_escalated?: boolean };

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    if (msg.includes("abort") || msg.includes("AbortError")) {
      return jsonError("L'analyse a pris trop de temps. Réessayez.", 504);
    }
    if (msg.includes("JSON") || msg.includes("SyntaxError") || msg.includes("parse")) {
      console.error("[conclusion] JSON parse error:", msg);
      return jsonError("La réponse IA était malformée. Réessayez.", 502);
    }
    console.error("[conclusion] Unexpected error:", msg);
    return jsonError("Erreur inattendue. Réessayez.", 502);
  }

  // ── Persistance ───────────────────────────────────────────────────────────
  await (supabase as any)
    .from("analyses")
    .update({ conclusion_ia: JSON.stringify(conclusionData) })
    .eq("id", analysisId);

  return jsonOk({ conclusion: conclusionData, cached: false });
};

export const OPTIONS: APIRoute = () => optionsResponse("POST,OPTIONS");
