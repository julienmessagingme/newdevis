#!/usr/bin/env tsx
/**
 * scripts/phase1-audit-catalogue.ts
 *
 * 🟢 REFONTE Phase 1.3 (2026-06-23) — Audit + pré-classement du catalogue
 *
 * Fetch les 911 entrées de `market_prices`, applique une classification
 * automatique par parsing du `label` (métier, nature_prix, gamme,
 * multiplicateur_couches), détecte les doublons, génère 3 fichiers :
 *
 *   docs/refonte/catalogue-classement/audit-911-raw.csv         (export brut)
 *   docs/refonte/catalogue-classement/audit-911-classified.csv  (avec mes propositions)
 *   docs/refonte/catalogue-classement/RAPPORT-AUDIT.md          (synthèse)
 *
 * USAGE :
 *   npx tsx scripts/phase1-audit-catalogue.ts
 *
 * ENV VARS REQUISES (.env à la racine du projet) :
 *   SUPABASE_URL (ou PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Le script ne MUTE PAS la DB — il fetch en lecture seule.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUTPUT_DIR = join(ROOT, "docs", "refonte", "catalogue-classement");

// ──────────────────────────────────────────────────────────────────────────────
// .env loader (zéro dep)
// ──────────────────────────────────────────────────────────────────────────────
function loadEnv(): void {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Env vars manquantes. Requis dans .env :");
  console.error("   - SUPABASE_URL (ou PUBLIC_SUPABASE_URL)");
  console.error("   - SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────
interface MarketRow {
  id: number;
  job_type: string;
  label: string;
  unit: string | null;
  price_min_unit_ht: number | null;
  price_avg_unit_ht: number | null;
  price_max_unit_ht: number | null;
  fixed_min_ht: number | null;
  fixed_avg_ht: number | null;
  fixed_max_ht: number | null;
  variability_ratio: number | null;
  confidence: string | null;
  sample_size: number | null;
  source: string | null;
  notes: string | null;
  room_specific: boolean | null;
  required_room: string[] | null;
  generic_family: string | null;
}

interface Classified extends MarketRow {
  metier_propose: string;
  nature_prix_proposee: "pose_seule" | "fourniture_pose" | "fourniture_seule" | "non_applicable" | "inconnu";
  multiplicateur_couches_applicable: boolean;
  gamme_proposee: string;
  niveau_doute: "auto" | "doute" | "conflit" | "doublon_probable" | "inclassable";
  notes_auto: string[];
  commentaire_julien: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Règles de classement métier (mots-clés en priorité descendante)
// ──────────────────────────────────────────────────────────────────────────────
// L'ordre compte : la PREMIÈRE règle qui matche détermine le métier.
// Donc les règles spécifiques (forfait rénovation, diagnostic, cuisine) AVANT
// les règles générales (plomberie, peinture, etc.).

const METIER_RULES: { name: string; rx: RegExp }[] = [
  // Forfaits rénovation globale — TRÈS spécifique, doit passer en premier
  { name: "forfait_renovation_globale", rx: /\b(r[ée]novation\s+(compl[èe]te|énergétique\s+globale|salle\s+de\s+bain)|am[ée]nagement\s+(combles|sous[\s-]?sol)|sur[ée]l[ée]vation\s+maison|cr[ée]ation\s+(salle\s+de\s+bain|pi[èe]ce\s+suppl[ée]mentaire)|extension)/i },

  // Diagnostics réglementaires
  { name: "diagnostic_reglementaire", rx: /\b(diagnostic|audit\s+[ée]nerg[ée]tique|[ée]tude\s+thermique|expertise|pack\s+diagnostic|loi\s+(carrez|boutin)|dpe|erp|esris)/i },

  // Ouvrages spécialisés (volume faible → famille dédiée)
  { name: "ouvrages_piscine", rx: /\bpiscine|spa|bassin|filtration\s+piscine|local\s+technique\s+piscine\b/i },
  { name: "ouvrages_photovoltaique", rx: /\b(photovolta|panneau.*solaire|onduleur|batterie\s+(de\s+stockage\s+)?solaire|kwc)\b/i },
  { name: "ouvrages_anc", rx: /\b(anc|assainissement|fosse\s+septique|micro[\s-]?station|[ée]puration|phyto[ée]puration|tertre\s+infiltration|fili[èe]re\s+(filtre|[ée]pandage))\b/i },
  { name: "ouvrages_geothermie", rx: /\bg[ée]othermie|capteurs?\s+g[ée]othermiques?\b/i },
  { name: "ouvrages_paysagisme", rx: /\b(paysag|jardin|plantation|arbre|haie|engazon|gazon|pelouse|[ée]lagage|dessouchage|arrosage\s+automatique)\b/i },
  { name: "ouvrages_ascenseur", rx: /\b(ascenseur|monte[\s-]?(escalier|charge)|pmr|[ée]l[ée]vateur)\b/i },
  { name: "ouvrages_vrd", rx: /\b(vrd|terrasse[ment]?|pav[ée]|enrob[ée]|all[ée]e|caniveau|drainage\s+(p[ée]riph[ée]rique|fran[çc]ais|pied\s+de\s+mur)|grave|stabilis[ée])\b/i },

  // Cuisine / agencement cuisine
  { name: "cuisine_agencement", rx: /\b(cuisine|plan\s+de\s+travail|cr[ée]dence|hotte|four\s+encastr|lave[\s-]?vaisselle|plaque\s+(de\s+)?cuisson|[ée]vier|[ée]lectrom[ée]nager|placard|dressing|biblioth[èe]que)\b/i },

  // Chauffage (avant CVC pour ne pas confondre)
  { name: "chauffage", rx: /\b(chauffage|chaudi[èe]re|radiateur|plancher\s+chauffant|po[êe]le|insert|granul[ée]|pellet|tubage|ramonage|cumulus|chauffe[\s-]?eau|ballon\s+(ecs|thermodynamique)|calorifugeage|plinthe\s+chauffant)\b/i },

  // CVC / ventilation
  { name: "cvc_ventilation", rx: /\b(climatisation|clim\b|pac|pompe.*chaleur|vmc|ventilation|extracteur|gaine\s+ventilation|hotte\s+conduit)\b/i },

  // Toiture
  { name: "toiture_couverture", rx: /\b(toiture|couverture|tuile|ardoise|zinguerie|gouttière|gouttiere|chevron|ch[ée]neau|fa[îi]tage|noue|shingle|bac\s+acier|membrane\s+epdm|[ée]tanch[ée]it[ée]\s+toiture|sous[\s-]?toiture|nettoyage\s+toiture|d[ée]moussage\s+toiture|hydrofuge\s+toiture|descente\s+ep|regard\s+ep|skylight)\b/i },

  // Menuiserie / vitrages
  { name: "menuiserie_vitrages", rx: /\b(menuiserie|porte|fen[êe]tre|baie\s+vitr[ée]e|volet|escalier|velux|verri[èe]re|puits\s+de\s+lumi[èe]re|moustiquaire|chassis|marquise|vitrage|cylindre|poign[ée]e|verrou|serrure|garde[\s-]?corps|bloc[\s-]?porte|portail|portillon)\b/i },

  // Métallerie / serrurerie
  { name: "metallerie_serrurerie", rx: /\b(serrur|cl[ôo]ture|grille|grillage|garde[\s-]?corps\s+(inox|verre|m[ée]tal)|blindage)\b/i },

  // Plomberie / sanitaires
  { name: "plomberie_sanitaires", rx: /\b(plomberie|wc|robinet|mitigeur|sanitaire|baignoire|douche|lavabo|vasque|s[èe]che[\s-]?serviette|adoucisseur|filtre\s+(anti[\s-]?calcaire|eau)|d[ée]bouchage|fuite\s+eau|lave[\s-]?mains|pompe\s+(de\s+)?relevage|siphon|canalisation|colonne\s+(fonte|plomberie)|alimentation\s+(eau|ef\/ec)|évacuation\s+(pvc|usées)|raccordement\s+(lave|r[ée]seau)|paroi\s+douche|colonne\s+de\s+douche|receveur|station\s+relevage|cumulus\s+(d[ée]tartrage|groupe)|robinetterie|bain[\s-]?douche\s+conversion)\b/i },

  // Électricité
  { name: "electricite", rx: /\b([ée]lectric|tableau\s+[ée]lec|prise|interrupteur|disjoncteur|c[âa]ble|gaine|spot|luminaire|[ée]clairage|ruban\s+led|bande\s+led|cablage|borne\s+(de\s+)?recharge|irve|wallbox|d[ée]tecteur\s+(fum[ée]e|co\s+monoxyde)|interphone|alarme\s+(intrusion|maison)|cam[ée]ra\s+surveillance|domotique|mise\s+aux?\s+normes?\s+[ée]lec|mise\s+en\s+conformit[ée]\s+[ée]lec|mise\s+[àa]\s+la\s+terre|saign[ée]es|tirage\s+ligne|thermostat|parafoudre|coffret\s+gtl|installation\s+elec)\b/i },

  // Domotique / sécurité (souvent corrélé électricité mais distinct)
  { name: "domotique_securite", rx: /\b(domotique|alarme\b|cam[ée]ra|interphone\s+vid[ée]o|automatisme|portail.*motoris|contr[ôo]le\s+d[''](']?acc[èe]s|serrure\s+connect|thermostat\s+connect)\b/i },

  // Carrelage / faïence / mosaïque (avant peinture pour les enduits sur sols)
  { name: "carrelage_faience", rx: /\b(carrelage|fa[ïi]ence|gr[èe]s|mosa[ïi]que|nez\s+de\s+marche|carreaux\s+ciment|terrazzo|joint\s+carrelage)\b/i },

  // Sols durs (marbre, pierre, micro-ciment, béton ciré sol)
  { name: "sols_durs", rx: /\b(marbre\s+sol|pierre\s+naturelle\s+(int[ée]rieur|sol|interieur)|dallage\s+pierre|marches?\s+en\s+pierre|b[ée]ton\s+(cir[ée]\s+sol|poli|d[ée]sactiv[ée])|micro[\s-]?ciment\s+sol|terrazzo|microtopping\s+sol|r[ée]sine\s+(epoxy|[ée]poxy)\s+sol)\b/i },

  // Sols souples (parquet, stratifié, vinyl, lino, moquette)
  { name: "sols_souples", rx: /\b(parquet|plancher\s+(flottant|massif|chevrons|hongrie)|stratifi[ée]|moquette|lino|sol\s+pvc|vinyle?|lambris\s+(bois|pvc)|li[èe]ge|ragr[ée]age|po[nç]?[çc]age\s+parquet|plinthes?\b|baguettes?\s+finition|seuils?|sous[\s-]?couche\s+sol|barres?\s+de\s+jonction|revetement\s+sol)\b/i },

  // Peinture / revêtements muraux
  { name: "peinture_revetements", rx: /\b(peinture|enduit\s+(lissage|chaux|d[ée]coratif|fa[çc]ade|monocouche|gratt[ée]|talo[cç]h[ée]|finition)|ratissage|lessivage|sous[\s-]?couche|toile\s+(de\s+)?verre|fibre\s+verre|papier\s+peint|stuc|tadelakt|a[ée]rogommage|cristallisation\s+marbre|reprise\s+(platre|fissures)|d[ée]collement\s+papier\s+peint|imperm[ée]abilisant\s+fa[çc]ade|rafraichissement\s+peinture|b[ée]ton\s+cir[ée]\s+mur|ravalement)\b/i },

  // Maçonnerie / structure
  { name: "maconnerie_structure", rx: /\b(ma[çc]onnerie|b[ée]ton|brique|parpaing|dalle\s+b[ée]ton|chape|gros[\s-]?(œuvre|oeuvre)|fondation|mur\s+(soutènement|porteur)|ipn|hea|micropieux|cuvelage|[ée]tanch[ée]it[ée]\s+(sous[\s-]?sol|sdb)|traitement\s+(humidit[ée]|pont\s+thermique)|anti[\s-]?humidit[ée]|d[ée]samiantage|injection\s+r[ée]sine|reprise\s+en\s+sous[\s-]?(œuvre|oeuvre)|cr[ée]ation\s+(muret|ouverture)|ouverture\s+(mur\s+porteur|non\s+porteur|porte)|agglo\s+b[ée]ton|extension\s+(ma[çc]onnerie|ossature\s+bois))\b/i },

  // Démolition / dépose
  { name: "demolition_depose", rx: /\b(d[ée]molition|d[ée]pose|[ée]vacuation\s+(gravats|d[ée]chets)|curage|d[ée]m[ée]nagement)\b/i },

  // Placo / isolation / cloisons
  { name: "placo_isolation", rx: /\b(placo|ba\s*13|isolation|cloison|laine|pare[\s-]?vapeur|bandes?\s+(joints?\s+)?placo|doublage|faux\s+plafond|ite|iti|ouate\s+cellulose|mousse\s+projet[ée]e|soufflage\s+laine|panneaux?\s+osb|flocage|laine\s+de\s+bois|lambris\s+plafond)\b/i },

  // Stores / occultation
  { name: "stores_occultation", rx: /\b(store(?!ur)|volet\s+roulant|tablier\s+volet|sangle|motorisation\s+volet|moteur\s+volet|claustra|abri\s+voiture|carport|pergola|v[ée]randa)\b/i },

  // Charpente / bois
  { name: "charpente_bois", rx: /\b(charpente|combles|ossature\s+bois|traitement\s+charpente|poutre)\b/i },

  // Logistique de chantier
  { name: "logistique_chantier", rx: /\b(logistique|livraison|nettoyage\s+(chantier|fin\s+chantier|facade)|mise.*disposition|protection\s+chantier|[ée]chafaudage|nacelle|benne|d[ée]placement)\b/i },

  // Bardage extérieur (compté à part — souvent mal classé en peinture/iso)
  { name: "bardage_exterieur", rx: /\bbardage\b/i },

  // Façade / ravalement (vu plus haut en peinture mais à clarifier)
  { name: "facade_ravalement", rx: /\b(fa[çc]ade|ravalement|cr[ée]pi|nettoyage\s+fa[çc]ade)\b/i },

  // Énergies / cuves / batteries
  { name: "energie_environnement", rx: /\b(cuve\s+(eau\s+pluie|r[ée]cup[ée]ration)|panneau\s+solaire\s+thermique|onduleur)\b/i },

  // Prestations intellectuelles (architecte, MOE, taux horaire)
  { name: "prestations_intellectuelles", rx: /\b(moe|ma[îi]tre.*[œo]euvre|maitrise.*oeuvre|architecte|[ée]tude(?!\s+thermique)|conseil|amo|opc|ing[ée]nierie|taux\s+horaire|main[\s-]?(d[''']?)?(œuvre|oeuvre)|heure\s+(de\s+)?(travail|main)|d[ée]placement\s+forfait)\b/i },

  // Catch-all : trappe d'accès, joints silicone, etc.
  { name: "petits_ouvrages_divers", rx: /\b(trappe\s+acc[èe]s|joints?\s+silicone|miroir|cristallisation)\b/i },
];

function classifyMetier(label: string): { metier: string; conflits: string[] } {
  const matches: string[] = [];
  for (const rule of METIER_RULES) {
    if (rule.rx.test(label)) matches.push(rule.name);
  }
  if (matches.length === 0) return { metier: "non_classable", conflits: [] };
  // Le premier match (priorité descendante) est la réponse.
  // Les suivants sont des conflits potentiels à signaler.
  return { metier: matches[0], conflits: matches.slice(1) };
}

// ──────────────────────────────────────────────────────────────────────────────
// Règles nature_prix (depuis le label, ratio_main_oeuvre non fiable)
// ──────────────────────────────────────────────────────────────────────────────
function classifyNaturePrix(label: string): Classified["nature_prix_proposee"] {
  const L = label.toLowerCase();

  // Diagnostics, audits, études → non_applicable (pas de notion fourniture/pose)
  if (/diagnostic|audit\s+[ée]nerg[ée]tique|[ée]tude\s+thermique|mesurage|expertise/i.test(label)) {
    return "non_applicable";
  }

  // Ramonage, maintenance, débouchage, nettoyage = services → non_applicable
  if (/ramonage|maintenance|d[ée]bouchage|nettoyage|d[ée]moussage|vidange|détection\s+fuite|sav|test\s+eau|protection\s+chantier|évacuation\s+(gravats|d[ée]chets)|location\s+(nacelle|benne)|[ée]chafaudage/i.test(label)) {
    return "non_applicable";
  }

  // pose seule explicite
  if (/\(\s*mo\s*\)|\(\s*main[\s-]?d[''']?(œuvre|oeuvre)\s*\)|\(hors\s+fourniture\)|pose\s+(uniquement|seule|seul)|\(\s*pose\s*\)/i.test(label)) {
    return "pose_seule";
  }

  // fourniture+pose explicite
  if (/\(\s*fourni\s*\+?\s*pos[ée]\s*\)|fourniture\s+et\s+pose|fourniture\s+\+\s+pose|\(fp\)/i.test(label)) {
    return "fourniture_pose";
  }

  // fourniture seule (rare) — commence par "Fourniture" mais sans "pos"
  if (/^fourniture/i.test(label) && !/pos[ée]?/i.test(label)) {
    return "fourniture_seule";
  }

  return "inconnu";
}

// ──────────────────────────────────────────────────────────────────────────────
// Détection multiplicateur_couches
// ──────────────────────────────────────────────────────────────────────────────
function detectMultiplicateurCouches(label: string, metier: string): boolean {
  if (!["peinture_revetements", "facade_ravalement"].includes(metier)) return false;
  return /couche|passe(?!\s+de\s+temps)|voile|lasure/i.test(label);
}

// ──────────────────────────────────────────────────────────────────────────────
// Détection gamme
// ──────────────────────────────────────────────────────────────────────────────
function classifyGamme(label: string): string {
  const L = label.toLowerCase();
  if (/\bpremium\b|haut[\s-]?(de\s+)?gamme|luxe|grand\s+format/i.test(label)) return "premium";
  if (/\bstandard\b/i.test(label)) return "standard";
  if (/entr[ée]e\s+(de\s+)?gamme|bas[\s-]?(de\s+)?gamme/i.test(label)) return "entree_gamme";
  if (/(chantier\s+difficile|complexe|urgence)/i.test(label)) return "variante_complexite";
  return "—";
}

// ──────────────────────────────────────────────────────────────────────────────
// Doublons : normalisation du label
// ──────────────────────────────────────────────────────────────────────────────
function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // retire accents
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

// ──────────────────────────────────────────────────────────────────────────────
// CSV utils
// ──────────────────────────────────────────────────────────────────────────────
function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[,;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv<T extends Record<string, unknown>>(rows: T[], columns: (keyof T)[]): string {
  const header = columns.map((c) => csvEscape(c)).join(",");
  const lines = rows.map((r) => columns.map((c) => csvEscape(r[c])).join(","));
  return [header, ...lines].join("\n");
}

// ──────────────────────────────────────────────────────────────────────────────
// Fetch all
// ──────────────────────────────────────────────────────────────────────────────
async function fetchAll(): Promise<MarketRow[]> {
  // Page de 1000 pour être sûr de tout chopper en 1 call
  const { data, error } = await supabase
    .from("market_prices")
    .select(
      "id,job_type,label,unit,price_min_unit_ht,price_avg_unit_ht,price_max_unit_ht,fixed_min_ht,fixed_avg_ht,fixed_max_ht,variability_ratio,confidence,sample_size,source,notes,room_specific,required_room,generic_family",
    )
    .order("label", { ascending: true })
    .limit(2000);

  if (error) {
    console.error("❌ Erreur fetch market_prices :", error.message);
    process.exit(1);
  }
  return (data ?? []) as MarketRow[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log("🟢 Phase 1.3 — Audit catalogue market_prices");
  console.log("");

  const rows = await fetchAll();
  console.log(`✓ ${rows.length} entrées fetchées depuis market_prices\n`);

  // Map de comptage des labels normalisés (pour détection doublons)
  const labelCounts = new Map<string, number>();
  for (const r of rows) {
    const norm = normalizeLabel(r.label);
    labelCounts.set(norm, (labelCounts.get(norm) ?? 0) + 1);
  }

  // Classement
  const classified: Classified[] = rows.map((r) => {
    const { metier, conflits } = classifyMetier(r.label);
    const nature_prix = classifyNaturePrix(r.label);
    const multi_couches = detectMultiplicateurCouches(r.label, metier);
    const gamme = classifyGamme(r.label);

    const notes_auto: string[] = [];

    // Doute si nature_prix inconnu ET pas un service
    let niveau_doute: Classified["niveau_doute"] = "auto";
    if (metier === "non_classable") {
      niveau_doute = "inclassable";
      notes_auto.push("aucune règle métier ne match");
    } else if (conflits.length > 0) {
      niveau_doute = "conflit";
      notes_auto.push(`conflit avec : ${conflits.join(", ")}`);
    } else if (nature_prix === "inconnu") {
      niveau_doute = "doute";
      notes_auto.push("nature_prix ambiguë (label sans (fourni+posé)/(MO)/(hors fourniture))");
    }

    if ((labelCounts.get(normalizeLabel(r.label)) ?? 0) > 1) {
      niveau_doute = "doublon_probable";
      notes_auto.push("label identique à au moins une autre entrée");
    }

    return {
      ...r,
      metier_propose: metier,
      nature_prix_proposee: nature_prix,
      multiplicateur_couches_applicable: multi_couches,
      gamme_proposee: gamme,
      niveau_doute,
      notes_auto,
      commentaire_julien: "",
    };
  });

  // ── CSV brut ───────────────────────────────────────────────────────────────
  const rawCols: (keyof MarketRow)[] = [
    "id",
    "job_type",
    "label",
    "unit",
    "price_min_unit_ht",
    "price_avg_unit_ht",
    "price_max_unit_ht",
    "fixed_min_ht",
    "fixed_avg_ht",
    "fixed_max_ht",
    "variability_ratio",
    "confidence",
    "sample_size",
    "source",
    "notes",
    "room_specific",
    "required_room",
    "generic_family",
  ];
  writeFileSync(join(OUTPUT_DIR, "audit-911-raw.csv"), toCsv(rows, rawCols), "utf-8");

  // ── CSV classé (trié par metier → niveau_doute → label) ────────────────────
  const sorted = [...classified].sort((a, b) => {
    if (a.metier_propose !== b.metier_propose) return a.metier_propose.localeCompare(b.metier_propose);
    if (a.niveau_doute !== b.niveau_doute) return a.niveau_doute.localeCompare(b.niveau_doute);
    return a.label.localeCompare(b.label);
  });

  const classifiedCols: (keyof Classified)[] = [
    "id",
    "job_type",
    "label",
    "unit",
    "metier_propose",
    "nature_prix_proposee",
    "multiplicateur_couches_applicable",
    "gamme_proposee",
    "niveau_doute",
    "notes_auto",
    "price_min_unit_ht",
    "price_max_unit_ht",
    "fixed_min_ht",
    "fixed_max_ht",
    "variability_ratio",
    "confidence",
    "sample_size",
    "notes",
    "commentaire_julien",
  ];

  // notes_auto est un array → on le joint en string pour CSV
  const sortedForCsv = sorted.map((r) => ({ ...r, notes_auto: r.notes_auto.join(" | ") }));
  writeFileSync(
    join(OUTPUT_DIR, "audit-911-classified.csv"),
    toCsv(sortedForCsv as any, classifiedCols as any),
    "utf-8",
  );

  // ── Rapport markdown ───────────────────────────────────────────────────────
  const byMetier = new Map<string, Classified[]>();
  for (const c of classified) {
    if (!byMetier.has(c.metier_propose)) byMetier.set(c.metier_propose, []);
    byMetier.get(c.metier_propose)!.push(c);
  }
  const metierStats = [...byMetier.entries()]
    .map(([m, entries]) => ({
      metier: m,
      nb: entries.length,
      nb_auto: entries.filter((e) => e.niveau_doute === "auto").length,
      nb_doute: entries.filter((e) => e.niveau_doute === "doute").length,
      nb_conflit: entries.filter((e) => e.niveau_doute === "conflit").length,
      nb_doublon: entries.filter((e) => e.niveau_doute === "doublon_probable").length,
      nb_inclassable: entries.filter((e) => e.niveau_doute === "inclassable").length,
    }))
    .sort((a, b) => b.nb - a.nb);

  const totalAuto = classified.filter((c) => c.niveau_doute === "auto").length;
  const totalDoute = classified.filter((c) => c.niveau_doute === "doute").length;
  const totalConflit = classified.filter((c) => c.niveau_doute === "conflit").length;
  const totalDoublon = classified.filter((c) => c.niveau_doute === "doublon_probable").length;
  const totalInclassable = classified.filter((c) => c.niveau_doute === "inclassable").length;

  const naturePrixStats = new Map<string, number>();
  for (const c of classified) {
    naturePrixStats.set(c.nature_prix_proposee, (naturePrixStats.get(c.nature_prix_proposee) ?? 0) + 1);
  }

  // Top doublons
  const doublonsTop = [...labelCounts.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  const rapport = `# Rapport audit catalogue — Phase 1.3

**Date** : ${new Date().toISOString().slice(0, 10)}
**Source** : script \`scripts/phase1-audit-catalogue.ts\`
**Inputs** : ${rows.length} entrées de \`market_prices\`

---

## Synthèse

| Statut | Nb entrées | % |
|---|---|---|
| 🟢 \`auto\` (consensuel, à valider d'un œil) | ${totalAuto} | ${((totalAuto / rows.length) * 100).toFixed(1)}% |
| 🟡 \`doute\` (nature_prix ambiguë) | ${totalDoute} | ${((totalDoute / rows.length) * 100).toFixed(1)}% |
| 🟠 \`conflit\` (capté par plusieurs familles) | ${totalConflit} | ${((totalConflit / rows.length) * 100).toFixed(1)}% |
| 🔴 \`doublon_probable\` (label identique) | ${totalDoublon} | ${((totalDoublon / rows.length) * 100).toFixed(1)}% |
| ⚫ \`inclassable\` (aucune règle métier ne match) | ${totalInclassable} | ${((totalInclassable / rows.length) * 100).toFixed(1)}% |

---

## Distribution par métier proposé

| Métier | Total | 🟢 auto | 🟡 doute | 🟠 conflit | 🔴 doublon | ⚫ inclassable |
|---|---:|---:|---:|---:|---:|---:|
${metierStats
  .map(
    (s) =>
      `| \`${s.metier}\` | ${s.nb} | ${s.nb_auto} | ${s.nb_doute} | ${s.nb_conflit} | ${s.nb_doublon} | ${s.nb_inclassable} |`,
  )
  .join("\n")}

---

## Distribution nature_prix proposée

| Nature prix | Nb entrées | Note |
|---|---:|---|
${[...naturePrixStats.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([n, c]) => `| \`${n}\` | ${c} | ${n === "inconnu" ? "→ à arbitrer manuellement" : ""} |`)
  .join("\n")}

---

## Top 20 doublons (label normalisé)

| Label | Nb |
|---|---:|
${doublonsTop.map(([l, n]) => `| ${l} | ${n} |`).join("\n")}

---

## Comment relire le CSV \`audit-911-classified.csv\`

Le CSV est **trié par métier proposé**, puis par niveau de doute, puis par label.

**Stratégie de relecture rapide** :
1. **Filtre sur \`niveau_doute = inclassable\`** (${totalInclassable} lignes) → c'est là qu'il y a le plus de boulot
2. **Filtre sur \`niveau_doute = conflit\`** (${totalConflit} lignes) → arbitrer entre 2 familles
3. **Filtre sur \`niveau_doute = doublon_probable\`** (${totalDoublon} lignes) → décider quoi fusionner / expliciter
4. **Filtre sur \`niveau_doute = doute\`** (${totalDoute} lignes) → souvent juste préciser la nature_prix
5. **Les ${totalAuto} \`auto\` ne nécessitent QU'un coup d'œil rapide** par métier (relecture en bloc)

**Colonnes à remplir si nécessaire** :
- \`commentaire_julien\` : correction métier proposé OU nature_prix OU notes libres

**Une fois le CSV relu**, je reprends la version validée pour générer la migration SQL Phase 1.4 (ALTER TABLE market_prices + UPDATE en bloc).

---

## Prochaines actions

1. ⏳ Julien relit \`audit-911-classified.csv\` (~2-4h)
2. 🟡 Génération de la migration SQL Phase 1.4 depuis le CSV validé
3. 🟡 Recalibrage fourchettes vs prix réels observés dans \`analyses\` (Phase 1.5)
4. 🟡 Régénération embeddings après modif libellés (Phase 1.6)
`;

  writeFileSync(join(OUTPUT_DIR, "RAPPORT-AUDIT.md"), rapport, "utf-8");

  console.log("✓ 3 fichiers générés :");
  console.log(`  - ${join(OUTPUT_DIR, "audit-911-raw.csv")}`);
  console.log(`  - ${join(OUTPUT_DIR, "audit-911-classified.csv")}`);
  console.log(`  - ${join(OUTPUT_DIR, "RAPPORT-AUDIT.md")}`);
  console.log("");
  console.log(`📊 Synthèse :`);
  console.log(`   ${totalAuto} auto · ${totalDoute} doute · ${totalConflit} conflit · ${totalDoublon} doublon · ${totalInclassable} inclassable`);
  console.log("");
  console.log("👉 Étape suivante : relire docs/refonte/catalogue-classement/audit-911-classified.csv");
}

main().catch((err) => {
  console.error("❌ Erreur :", err);
  process.exit(1);
});
