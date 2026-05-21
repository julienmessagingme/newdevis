import type { DomainConfig } from "./domain-config.ts";
import { fetchGeminiWithRetry } from "../_shared/gemini-fetch.ts";
import {
  matchMarketCategory,
  logMatchResult,
  validateSignature,
  type SemanticSignature,
  type MarketCatalogRow,
  type MatchResult,
} from "./market-matcher.ts";
import {
  lookupMarketPricesVectorial,
  type VectorialMatchMeta,
} from "./market-matcher-vectorial.ts";

/**
 * V3.6 — Feature flags pour le déploiement contrôlé.
 *
 * MARKET_MATCHER_V36 (parsing strict, valeurs inconnues = warn + shadow par défaut) :
 *   - "v35_only" | "false" | "0" → V3.5 only (rollback complet)
 *   - "shadow"   | absent          → SHADOW mode (DÉFAUT) avec sampling
 *   - "v36_only" | "true"  | "1"   → V3.6 visible (après validation shadow)
 *
 * V36_SHADOW_SAMPLE_RATE :
 *   - Pourcentage [0.0, 1.0] des analyses sur lesquelles le shadow tourne
 *   - DÉFAUT 0.2 (20%) — réduit le coût Gemini ×0.2 vs full shadow
 *   - Set à 1.0 pour shadow exhaustif (déconseillé en early validation)
 *   - Set à 0.0 pour désactiver le shadow sans toucher au mode
 *
 * Pourquoi sampling : en shadow, V3.6 déclenche un 2e appel Gemini par analyse.
 * Sampling à 20% maintient la collecte de données KPI tout en divisant par 5
 * le surcoût Gemini. Sur 500 analyses/jour : 100 shadows × ~4s Gemini = budget
 * acceptable. Validation possible dès ~100 observations (5-7 jours à 20%).
 */
type MatcherMode = "v35_only" | "shadow" | "v36_only";

const MATCHER_MODE: MatcherMode = (() => {
  let raw: string | undefined;
  try {
    raw = typeof Deno !== "undefined" ? Deno.env.get("MARKET_MATCHER_V36") : undefined;
  } catch {
    raw = undefined;
  }
  if (raw === undefined || raw === null || raw === "") return "shadow";
  const normalized = String(raw).toLowerCase().trim();

  // Parsing explicite (whitelist)
  if (normalized === "v35_only" || normalized === "false" || normalized === "0") return "v35_only";
  if (normalized === "v36_only" || normalized === "true"  || normalized === "1") return "v36_only";
  if (normalized === "shadow") return "shadow";

  // Valeur non reconnue → warn + fallback shadow safe
  console.warn(`[MarketPrices] MARKET_MATCHER_V36="${raw}" not recognized (expected: v35_only|shadow|v36_only|true|false). Falling back to "shadow".`);
  return "shadow";
})();

const V36_SHADOW_SAMPLE_RATE: number = (() => {
  let raw: string | undefined;
  try {
    raw = typeof Deno !== "undefined" ? Deno.env.get("V36_SHADOW_SAMPLE_RATE") : undefined;
  } catch {
    raw = undefined;
  }
  if (raw === undefined || raw === null || raw === "") return 0.2; // default 20%
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    console.warn(`[MarketPrices] V36_SHADOW_SAMPLE_RATE="${raw}" invalid (expected float 0.0-1.0). Falling back to 0.2.`);
    return 0.2;
  }
  return n;
})();

// ============================================================
// MARKET PRICES LOOKUP — Hierarchical job type system
// 1. Fetches market_prices catalog from Supabase
// 2. Asks Gemini to identify job types, determine qty/unit,
//    and assign each devis line to ONE job type
// 3. Builds detailed results per job type with devis lines
// 4. Returns hierarchical results for frontend display
// ============================================================

// ─────────────────────────────────────────────────────────────────────────────
// Startup log — affiché une fois au chargement de l'instance edge function.
// ─────────────────────────────────────────────────────────────────────────────
console.log(`[MarketPrices] startup — matcher_mode=${MATCHER_MODE} shadow_sample_rate=${V36_SHADOW_SAMPLE_RATE}`);

// ─────────────────────────────────────────────────────────────────────────────
// AUTO KILL SWITCH pour shadow (V3.6 hardening)
//
// Si trop d'erreurs shadow sur une fenêtre temporelle → on désactive le shadow
// pour le reste de la vie de l'instance edge function. Empêche que des erreurs
// runtime répétées dégradent la plateforme (logs spammés, latence dégradée).
//
// État en mémoire par instance edge function. Reset au redémarrage de l'instance
// (acceptable pour ce cas d'usage — le kill switch est une protection court terme).
//
// Seuils paramétrables via env :
//   V36_SHADOW_KILL_THRESHOLD : nombre max d'erreurs avant kill (default 20)
//   V36_SHADOW_KILL_WINDOW_MS : fenêtre temporelle ms (default 1h)
// ─────────────────────────────────────────────────────────────────────────────

const SHADOW_KILL_THRESHOLD: number = (() => {
  try {
    const raw = typeof Deno !== "undefined" ? Deno.env.get("V36_SHADOW_KILL_THRESHOLD") : undefined;
    if (!raw) return 20;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 20;
  } catch { return 20; }
})();

const SHADOW_KILL_WINDOW_MS: number = (() => {
  try {
    const raw = typeof Deno !== "undefined" ? Deno.env.get("V36_SHADOW_KILL_WINDOW_MS") : undefined;
    if (!raw) return 3_600_000; // 1h par défaut
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 3_600_000;
  } catch { return 3_600_000; }
})();

interface ShadowKillState {
  errors: number[];      // timestamps ms d'erreurs récentes
  killedAt: number | null; // si non null, shadow désactivé depuis ce timestamp
}

const shadowKillState: ShadowKillState = { errors: [], killedAt: null };

/**
 * Enregistre une erreur shadow. Si seuil dépassé sur la fenêtre → kill switch.
 * Appelé après chaque [V36_SHADOW_ERROR] significatif.
 */
function recordShadowError(): void {
  const now = Date.now();
  shadowKillState.errors.push(now);
  // Garde uniquement les erreurs dans la fenêtre
  shadowKillState.errors = shadowKillState.errors.filter(t => now - t < SHADOW_KILL_WINDOW_MS);
  if (shadowKillState.errors.length >= SHADOW_KILL_THRESHOLD && shadowKillState.killedAt === null) {
    shadowKillState.killedAt = now;
    console.warn(`[V36_SHADOW_KILLED] error_count=${shadowKillState.errors.length} threshold=${SHADOW_KILL_THRESHOLD} window_ms=${SHADOW_KILL_WINDOW_MS} → shadow DISABLED on this instance for safety`);
  }
}

/**
 * Indique si le shadow doit être skippé suite à un kill switch.
 */
function isShadowKilled(): boolean {
  return shadowKillState.killedAt !== null;
}

console.log(`[MarketPrices] startup — kill_switch_threshold=${SHADOW_KILL_THRESHOLD} window_ms=${SHADOW_KILL_WINDOW_MS}`);

// ─────────────────────────────────────────────────────────────────────────────
// V3.5.0 PHASE C — Feature flag VECTORIEL
//
// Si MARKET_MATCHER_VECTORIAL="true" (ou "1") → lookupMarketPrices délègue
// entièrement à `lookupMarketPricesVectorial` (similarity search ligne-par-
// ligne via Gemini gemini-embedding-001 + RPC search_market_prices_v2).
//
// Si absent / "false" / "0" / "shadow" → pipeline V3.6 actuel intact (le flag
// "shadow" reste réservé pour Phase C.5 — logging en parallèle sans bascule).
//
// Différent de MARKET_MATCHER_V36 :
//   - MARKET_MATCHER_V36 contrôle V3.5 vs V3.6 (groupement Gemini avant matching)
//   - MARKET_MATCHER_VECTORIAL court-circuite les deux et part sur la
//     similarity search vectorielle pure (1 ligne devis = 1 match catalogue).
//
// Par défaut DÉSACTIVÉ → prod 100% V3.6 inchangée tant qu'on ne flip pas.
// ─────────────────────────────────────────────────────────────────────────────
type VectorialMode = "off" | "shadow" | "on";

const VECTORIAL_MODE: VectorialMode = (() => {
  let raw: string | undefined;
  try {
    raw = typeof Deno !== "undefined" ? Deno.env.get("MARKET_MATCHER_VECTORIAL") : undefined;
  } catch {
    raw = undefined;
  }
  if (!raw) return "off";
  const normalized = String(raw).toLowerCase().trim();
  if (normalized === "true" || normalized === "1" || normalized === "on") return "on";
  if (normalized === "shadow") return "shadow";
  return "off";
})();

console.log(`[MarketPrices] startup — vectorial_mode=${VECTORIAL_MODE}`);

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface WorkItemFull {
  description: string;
  category: string | null;
  amount_ht: number | null;
  quantity: number | null;
  unit: string | null;
}

interface MarketPriceRow {
  job_type: string;
  label: string;
  unit: string;
  price_min_unit_ht: number;
  price_avg_unit_ht: number;
  price_max_unit_ht: number;
  fixed_min_ht: number;
  fixed_avg_ht: number;
  fixed_max_ht: number;
  zip_scope: string;
  notes: string;
}

/** What Gemini returns (new hierarchical format) */
interface GeminiJobType {
  job_type_label: string;
  job_types: string[];
  main_unit: string;
  main_quantity: number;
  work_items: number[]; // 1-indexed from Gemini
}

/** Detail of a devis line within a job type */
export interface DevisLineDetail {
  index: number; // 0-indexed
  description: string;
  amount_ht: number | null;
  quantity: number | null;
  unit: string | null;
}

/** What we return to index.ts (new hierarchical format) */
export interface JobTypePriceResult {
  job_type_label: string;
  catalog_job_types: string[];
  main_unit: string;
  main_quantity: number;
  devis_lines: DevisLineDetail[];
  devis_total_ht: number | null;
  prices: MarketPriceRow[];
  workItemIndices: number[];
  /**
   * V3.5.0 Phase C — méta vectorielle attachée quand
   * MARKET_MATCHER_VECTORIAL=on. Absent en mode V3.5/V3.6 (groupement Gemini).
   * Le front (Phase D) détecte la présence pour basculer en affichage
   * "1 ligne = 1 carte" + badge confidence.
   */
  vectorial?: VectorialMatchMeta;
}

/** Debug info stored in raw_text for diagnosis */
export interface MarketPriceDebug {
  catalog_size_full: number;
  catalog_size_filtered: number;
  detected_domains: string[];
  gemini_groups: Array<{ label: string; job_types: string[]; matched: string[] }>;
  groups_matched: number;
  groups_autre: number;
}

// ============================================================
// CATALOG PRE-FILTER
// With 470+ catalog entries, Gemini (gemini-2.0-flash) cannot reliably
// match identifiers when the full catalog is sent. Pre-filtering to
// ~20-80 relevant entries based on devis content dramatically improves
// accuracy. Falls back to full catalog if no relevant domain is detected.
// ============================================================

// Domains that must appear in work DESCRIPTIONS (not just categories) to avoid false positives
// from company headers leaking into the category field.
const DESCRIPTION_ONLY_DOMAINS = new Set(["piscine"]);

const DOMAIN_TRIGGERS: Record<string, string[]> = {
  carrelage: ["carrel", "faienc", "ceramiqu", "gres", "mosaiqu", "faïenc"],
  parquet: ["parquet", "stratifie", "plancher", "lame", "vinyle", "sol souple"],
  peinture: ["peint", "enduit", "ravalement", "façade", "facade", "lasure", "vernis"],
  plomberie: ["plombi", "sanitaire", "tuyau", "robinet", "chauffe-eau", "cumulus",
              "wc", "toilette", "évacuation", "evacuation", "siphon", "mitigeur"],
  electricite: ["electri", "tableau", "câble", "cable", "prise", "luminaire",
                "spot", "interrupteur", "disjoncteur", "gaine", "VMC", "vmc"],
  maconnerie: ["maçon", "macon", "beton", "parpaing", "agglo", "plot", "chape",
               "ragre", "reprise", "linteau", "enduit facade"],
  isolation: ["isolat", "thermique", "acoustiqu", "laine", "rigide", "comble",
              "mousse", "souffl"],
  toiture: ["toiture", "toit", "tuile", "ardoise", "couvert", "charpent",
            "zinguerie", "gouttiere", "gouttière", "noue", "faitiere"],
  menuiserie: ["fenetre", "fenêtre", "porte-fenetre", "porte fenetre", "volet",
               "baie vitree", "baie vitrée", "chassis", "châssis", "vitrage",
               "menuiserie", "alu", "pvc", "bois"],
  porte: ["porte blind", "porte int", "porte ext", "bloc porte", "huisserie"],
  escalier: ["escalier", "marche", "contremarche", "garde-corps", "rampe"],
  chauffage: ["chauffag", "chaudier", "chaudiere", "radiateur", "plancher chauffant",
              "PAC", "pompe a chaleur", "ballon", "poele", "insert"],
  clim: ["climatisation", "clim", "split", "gainable", "reversible", "multisplit"],
  terrassement: ["terrassement", "deblai", "remblai", "fouille", "excavat"],
  vrd: ["vrd", "enrobe", "bitume", "voirie", "chemin", "allee"],
  placo: ["placo", "cloison", "doublage", "platre", "plâtre", "BA13", "ba13"],
  salle_bain: ["salle de bain", "sdb", "salle d eau", "douche", "baignoire",
               "jacuzzi", "hammam"],
  cuisine: ["cuisin"],
  piscine: ["piscine", "bassin", "liner", "margelle"],
  amenagement: ["amenagement", "aménagement", "terasse", "terrasse", "pergola",
                "portail", "cloture", "clôture", "grillage", "dallage"],
  nettoyage: ["nettoyage", "debarras"],
};

/**
 * Pre-filter catalog to relevant entries based on devis content.
 * Reduces from 470+ to ~20-80 entries, improving Gemini matching accuracy.
 */
/** Strip combining diacritical marks (accents) from a normalized NFD string */
function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function filterRelevantPrices(allPrices: MarketPriceRow[], workItems: WorkItemFull[]): MarketPriceRow[] {
  // For most domains: check descriptions + categories
  const allText = stripAccents(
    workItems.map((w) => `${w.description} ${w.category || ""}`).join(" ").toLowerCase()
  );
  // For description-only domains: check only descriptions to avoid false positives from
  // company headers leaking into the category field (e.g. "Entreprise de Piscine" header
  // causing piscine domain to fire on a pavage devis).
  const descOnlyText = stripAccents(
    workItems.map((w) => w.description).join(" ").toLowerCase()
  );

  const relevantDomains = new Set<string>();
  for (const [domain, triggers] of Object.entries(DOMAIN_TRIGGERS)) {
    const textToSearch = DESCRIPTION_ONLY_DOMAINS.has(domain) ? descOnlyText : allText;
    if (triggers.some((t) => textToSearch.includes(stripAccents(t.toLowerCase())))) {
      relevantDomains.add(domain);
    }
  }

  console.log(`[MarketPrices] Detected domains: [${[...relevantDomains].join(", ")}]`);

  if (relevantDomains.size === 0) {
    console.log("[MarketPrices] No domain detected — using full catalog");
    return allPrices;
  }

  // Some domains use different prefixes in job_type than the domain name itself
  // e.g. salle_bain → entries are "douche_*", "bain_*", "carrelage_sdb_*"
  const DOMAIN_JT_PATTERNS: Record<string, string[]> = {
    salle_bain: ["douche", "bain", "sdb", "salle_bain"],
    chauffage: ["chauffage", "chaudiere", "chaudier", "radiateur", "plancher_ch", "pac_", "ballon"],
    clim: ["clim", "split", "gainable", "multisplit", "maintenance_clim"],
    vrd: ["vrd", "enrobe", "voirie", "bitume"],
    porte: ["porte_", "bloc_porte"],
    terrassement: ["terrassement", "terrassier", "deblai"],
    amenagement: ["terrasse", "portail", "cloture", "pergola", "allee", "amenagement"],
    // "piscine" retiré intentionnellement de amenagement — les entrées catalogue piscine ne doivent
    // entrer que si le domaine "piscine" est déclenché directement (descriptions only, pas categories).
    // Sinon, une entreprise "Aménagement / Piscine" pollue le catalogue même sur un devis de pavage.
    placo: ["placo", "cloison", "doublage"],
  };

  const filtered = allPrices.filter((p) => {
    const jt = p.job_type.toLowerCase();
    return [...relevantDomains].some((domain) => {
      // Standard: job_type starts with domain or contains _domain_ or domain_
      if (jt.startsWith(domain) || jt.includes(`_${domain}`) || jt.includes(`${domain}_`)) return true;
      // Extended: check domain-specific catalog key patterns
      const patterns = DOMAIN_JT_PATTERNS[domain] || [];
      return patterns.some((pat) => jt.startsWith(pat) || jt.includes(pat));
    });
  });

  if (filtered.length < 8) {
    console.log(`[MarketPrices] Filtered too small (${filtered.length}) — using full catalog`);
    return allPrices;
  }

  // ── Post-filter : PISCINE hard block ────────────────────────────────────────
  // Piscine catalog entries are only kept if at least one work item DESCRIPTION
  // (never category — too easily contaminated by company header) explicitly mentions
  // actual piscine construction/equipment keywords.
  // This is the last line of defence against hallucinated "Pompe + filtre piscine"
  // groups on pavage/carrelage devis from companies that list "Piscine" in their header.
  const PISCINE_WORK_KEYWORDS = ["bassin", "liner", "margelle", "filtration", "piscine", "nage", "pompe de piscine", "robot piscine"];
  const hasPiscineWork = workItems.some((w) =>
    PISCINE_WORK_KEYWORDS.some((kw) => stripAccents(w.description.toLowerCase()).includes(stripAccents(kw)))
  );
  const piscineEntries = filtered.filter((p) => p.job_type.toLowerCase().includes("piscine"));
  if (!hasPiscineWork && piscineEntries.length > 0) {
    console.log(`[MarketPrices] Post-filter: removing ${piscineEntries.length} piscine entries — no piscine work in descriptions`);
    const cleaned = filtered.filter((p) => !p.job_type.toLowerCase().includes("piscine"));
    // Re-check minimum size after removing piscine entries
    if (cleaned.length >= 8) return cleaned;
    console.log(`[MarketPrices] Post-filter: cleaned catalog too small (${cleaned.length}), keeping non-piscine + full fallback`);
    return allPrices.filter((p) => !p.job_type.toLowerCase().includes("piscine"));
  }

  console.log(`[MarketPrices] Catalog pre-filtered: ${allPrices.length} → ${filtered.length} entries`);
  return filtered;
}

/**
 * Build the catalog string for the Gemini prompt:
 * one line per unique job_type with its label.
 */
function buildCatalog(prices: MarketPriceRow[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const p of prices) {
    if (seen.has(p.job_type)) continue;
    seen.add(p.job_type);
    lines.push(`- ${p.job_type} : ${p.label}`);
  }
  return lines.join("\n");
}

/**
 * Level 5: semantic keyword matching — completely independent of Gemini's identifier compliance.
 * Scores each catalog entry by how many of its tokens appear in the group's text
 * (group label + work item descriptions + categories).
 * Used as final fallback when all 4 identifier-based levels fail.
 */
function findCatalogMatchByKeywords(
  groupLabel: string,
  workItems: WorkItemFull[],
  relevantPrices: MarketPriceRow[],
): string | null {
  const allText = stripAccents(
    [groupLabel, ...workItems.map((w) => `${w.description} ${w.category || ""}`)].join(" ").toLowerCase()
  );

  let bestJobType: string | null = null;
  let bestScore = 0;

  const seen = new Set<string>();
  for (const price of relevantPrices) {
    if (seen.has(price.job_type)) continue;
    seen.add(price.job_type);

    // Score: sum of lengths of matching tokens (prefer longer/more specific matches)
    const tokens = [
      ...price.job_type.split("_"),
      ...stripAccents(price.label.toLowerCase()).split(/[\s,()/-]+/),
    ].filter((t) => t.length >= 4); // skip very short tokens

    let score = 0;
    for (const token of tokens) {
      if (allText.includes(token)) {
        score += token.length;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestJobType = price.job_type;
    }
  }

  // Require a minimum score to avoid spurious matches on very generic tokens
  return bestScore >= 12 ? bestJobType : null;
}

/**
 * Ask Gemini to identify job types, determine quantity/unit,
 * and assign each devis line to exactly one job type.
 */
async function groupWithGemini(
  workItems: WorkItemFull[],
  catalog: string,
  googleApiKey: string,
  expertPrompt: string,
): Promise<GeminiJobType[]> {
  const totalItems = workItems.length;
  const itemsList = workItems
    .map((item, i) => {
      const parts = [`${i + 1}. "${item.description}"`];
      if (item.amount_ht !== null) parts.push(`${item.amount_ht} € HT`);
      if (item.quantity !== null && item.unit) parts.push(`${item.quantity} ${item.unit}`);
      else if (item.quantity !== null) parts.push(`qté: ${item.quantity}`);
      return parts.join(" — ");
    })
    .join("\n");

  const prompt = `${expertPrompt}

POSTES DU DEVIS (${totalItems} postes numérotés de 1 à ${totalItems}) :
${itemsList}

CATALOGUE DE PRIX MARCHÉ (identifiants autorisés) :
${catalog}

OBJECTIF : Regroupe les ${totalItems} postes du devis en quelques GRANDS types de travaux (typiquement 3 à 7 groupes). Chaque groupe doit correspondre à UN identifiant du catalogue ci-dessus.

RÈGLES DE REGROUPEMENT :
- REGROUPE LARGEMENT : préparation, fournitures, accessoires, finitions → même groupe que le travail principal.
  Exemple : ragréage + pose carrelage + joints + plinthes = UN seul groupe "carrelage".
  Exemple : dépose + fourniture + pose peinture + sous-couche = UN seul groupe "peinture".
- Les frais de déplacement, appro chantier, nettoyage, divers → rattache-les au groupe principal le plus gros OU mets-les dans un groupe "job_types": [].
- Vise le MINIMUM de groupes possible. NE CRÉE PAS un groupe par ligne.

RÈGLES CATALOGUE :
- Pour "job_types", COPIE-COLLE un identifiant EXACTEMENT tel qu'il apparaît dans le catalogue (avant le " : ").
- Si aucun identifiant ne correspond → "job_types": [].
- N'INVENTE JAMAIS un identifiant.
- Fourniture incluse → version AVEC fourniture. Main d'œuvre seule → version "hors fourniture". Jamais les deux.

AFFECTATION :
- TOUS les ${totalItems} postes (1 à ${totalItems}) doivent apparaître dans un work_items. Aucun oubli.
- Chaque poste dans EXACTEMENT un groupe.

CALCUL DE main_quantity :
- main_unit = l'unité principale du groupe (m2, ml, u, forfait, etc.)
- main_quantity = la quantité PHYSIQUE totale du groupe, c'est-à-dire la surface ou le nombre d'éléments RÉELS.

RÈGLE CRITIQUE — éviter le double comptage :
Quand plusieurs opérations s'appliquent à la MÊME surface physique (ex: "Enduisage 56.7 m²" + "Peinture 56.7 m²" sur le même mur), cette surface ne compte QU'UNE SEULE FOIS.
La main_quantity = somme des surfaces DISTINCTES, pas la somme de toutes les lignes.
→ [enduisage cuisine 56.7m² + peinture cuisine 56.7m²] + [enduisage salon 54m² + peinture salon 54m²] = 56.7 + 54 = 110.7 m² ✓ (PAS 56.7+56.7+54+54 = 221.4 m² ✗)

Comment identifier les lignes sur la MÊME surface : elles ont une quantité identique ou très proche ET se rapportent au même poste/pièce (préparation + finition sur même zone).

Exemples :
- 3 lignes à 1 fft = main_quantity 1 (forfait global, pas de somme)
- 14 radiateurs × 1U chacun → main_quantity = 14U (items distincts, on somme)
- Enduisage 25.7m² + Peinture 25.7m² (même plafond) → main_quantity = 25.7m² (même surface, PAS 51.4)
- Peinture cuisine 56.7m² + Peinture salon 54m² + Peinture chambre 36.4m² → main_quantity = 147.1m² (surfaces distinctes, on somme)
- Si le groupe est un forfait global sans quantité explicite, main_quantity = 1.
- CAS VRD/TERRASSEMENT/PAVAGE/DALLAGE (règle clé) : Quand plusieurs opérations successives s'appliquent à la MÊME surface physique avec la même quantité (ou très proche), ne compter cette surface QU'UNE SEULE FOIS.
  Exemple TERRASSEMENT : fond de forme 65m² + concassé 65m² + pavé 65m² + sablage 65m² = même surface de 65m² → main_quantity = 65m² (PAS 260m²).
  Exemple ENROBÉ : nivellement 96m² + évacuation 96m² + préparation 96m² + enrobé 96m² → main_quantity = 96m² (PAS 384m²).
  Règle générale : pour un groupe de travaux sur une même zone (préparation + fourniture + pose + finition), la main_quantity = surface de la zone, pas la somme de toutes les lignes.
  Cas particulier : si le groupe contient à la fois des lignes en m² ET une ligne en ml (bordure, caniveau), la main_quantity = surface m² principale, en ignorant le ml (unité différente).

Réponds UNIQUEMENT en JSON (pas de markdown) :
[
  {
    "job_type_label": "label exact du catalogue",
    "job_types": ["identifiant_exact_du_catalogue"],
    "main_unit": "m2",
    "main_quantity": 30,
    "work_items": [1, 2, 3, 4, 5]
  }
]`;

  try {
    const response = await fetchGeminiWithRetry(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${googleApiKey}`,
        },
        body: JSON.stringify({
          model: "gemini-2.0-flash",
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
          max_tokens: 4096,
        }),
      },
      { timeoutMs: 20000, maxAttempts: 3, logPrefix: "[MarketPrices]" },
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.warn("[MarketPrices] Gemini API error:", response.status, response.statusText, errText.substring(0, 200));
      return [];
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || "";

    // Log the raw Gemini response for diagnosis (first 500 chars)
    console.log("[MarketPrices] Gemini raw response (500 chars):", text.substring(0, 500));

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn("[MarketPrices] Could not parse JSON from Gemini:", text.substring(0, 300));
      return [];
    }

    const parsed: GeminiJobType[] = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      console.warn("[MarketPrices] Gemini response is not an array");
      return [];
    }

    // Convert 1-indexed work_items to 0-indexed and sanitize
    for (const group of parsed) {
      group.work_items = (group.work_items || [])
        .map((n) => (typeof n === "number" ? n - 1 : -1))
        .filter((n) => n >= 0 && n < workItems.length);
      group.job_types = (group.job_types || []).filter(
        (jt) => typeof jt === "string" && jt.length > 0,
      );
      group.main_quantity = typeof group.main_quantity === "number" && group.main_quantity > 0
        ? group.main_quantity
        : 1;
      group.main_unit = typeof group.main_unit === "string" && group.main_unit.length > 0
        ? group.main_unit
        : "unité";
    }

    console.log(
      "[MarketPrices] Gemini job types:",
      parsed.map((g) => `"${g.job_type_label}" → [${g.job_types.join(", ")}] items:[${g.work_items.join(",")}] ${g.main_quantity} ${g.main_unit}`).join(" | "),
    );

    return parsed;
  } catch (err) {
    console.warn("[MarketPrices] Gemini grouping error:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

/**
 * V3.6 — Groupement Gemini avec extraction de signature sémantique (PAS de catalogue).
 *
 * Gemini reçoit uniquement la liste des postes + le `marketSignatureExpertPrompt`
 * et retourne pour chaque groupe une `SemanticSignature` neutre. Le matching
 * catalogue est ensuite fait côté backend par `matchMarketCategory()`.
 *
 * Différences vs `groupWithGemini` (V3.5) :
 *   - PAS de catalogue envoyé à Gemini → token budget réduit
 *   - PAS de risque d'hallucination de job_type
 *   - Sortie : `signature` au lieu de `job_types`
 *   - Matching catalogue : déterministe backend (auditabilité)
 */
async function groupWithGeminiSignature(
  workItems: WorkItemFull[],
  googleApiKey: string,
  signatureExpertPrompt: string,
): Promise<Array<{
  job_type_label: string;
  signature: SemanticSignature;
  main_unit: string;
  main_quantity: number;
  work_items: number[];
}>> {
  const totalItems = workItems.length;
  const itemsList = workItems
    .map((item, i) => {
      const parts = [`${i + 1}. "${item.description}"`];
      if (item.amount_ht !== null) parts.push(`${item.amount_ht} € HT`);
      if (item.quantity !== null && item.unit) parts.push(`${item.quantity} ${item.unit}`);
      else if (item.quantity !== null) parts.push(`qté: ${item.quantity}`);
      return parts.join(" — ");
    })
    .join("\n");

  const prompt = `${signatureExpertPrompt}

POSTES DU DEVIS (${totalItems} postes numérotés de 1 à ${totalItems}) :
${itemsList}

OBJECTIF : Regroupe les ${totalItems} postes en 3 à 7 groupes (un par grand type de travaux du devis) et produis pour chacun une signature sémantique structurée selon les règles ci-dessus. TOUS les postes (1 à ${totalItems}) doivent apparaître dans un groupe.`;

  try {
    const response = await fetchGeminiWithRetry(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${googleApiKey}`,
        },
        body: JSON.stringify({
          model: "gemini-2.0-flash",
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
          max_tokens: 4096,
        }),
      },
      { timeoutMs: 20000, maxAttempts: 3, logPrefix: "[MarketPricesV36]" },
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.warn("[MarketPricesV36] Gemini API error:", response.status, response.statusText, errText.substring(0, 200));
      return [];
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || "";
    console.log("[MarketPricesV36] Gemini raw response (500 chars):", text.substring(0, 500));

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn("[MarketPricesV36] Could not parse JSON from Gemini:", text.substring(0, 300));
      return [];
    }

    type RawGroup = {
      job_type_label?: unknown;
      signature?: {
        domain?: unknown;
        subcategory?: unknown;
        room?: unknown;
        unit?: unknown;
        keywords?: unknown;
      };
      main_unit?: unknown;
      main_quantity?: unknown;
      work_items?: unknown;
    };
    const parsed: RawGroup[] = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      console.warn("[MarketPricesV36] Gemini response is not an array");
      return [];
    }

    // Normaliser et valider chaque groupe
    const normalized = parsed.map((group): {
      job_type_label: string;
      signature: SemanticSignature;
      main_unit: string;
      main_quantity: number;
      work_items: number[];
    } => {
      const sig = group.signature || {};
      const signature: SemanticSignature = {
        domain:      typeof sig.domain === "string" ? sig.domain.toLowerCase().trim() : "autre",
        subcategory: typeof sig.subcategory === "string" ? sig.subcategory.toLowerCase().trim() : "",
        room:        typeof sig.room === "string" && sig.room.trim().length > 0 ? sig.room.toLowerCase().trim() : null,
        unit:        typeof sig.unit === "string" ? sig.unit.toLowerCase().trim() : "u",
        keywords:    Array.isArray(sig.keywords)
          ? (sig.keywords as unknown[]).filter((k): k is string => typeof k === "string" && k.length > 0).map(k => k.toLowerCase().trim())
          : [],
      };
      const workItemIndices = Array.isArray(group.work_items)
        ? (group.work_items as unknown[])
            .map((n) => (typeof n === "number" ? n - 1 : -1))
            .filter((n) => n >= 0 && n < workItems.length)
        : [];
      return {
        job_type_label: typeof group.job_type_label === "string" && group.job_type_label.length > 0
          ? group.job_type_label : "Travaux",
        signature,
        main_unit: typeof group.main_unit === "string" && group.main_unit.length > 0
          ? group.main_unit : signature.unit,
        main_quantity: typeof group.main_quantity === "number" && group.main_quantity > 0
          ? group.main_quantity : 1,
        work_items: workItemIndices,
      };
    });

    console.log(
      "[MarketPricesV36] Gemini signatures:",
      normalized.map(g => `"${g.job_type_label}" sig={${g.signature.domain}/${g.signature.subcategory}/room=${g.signature.room ?? "null"}/${g.signature.unit}} items=[${g.work_items.join(",")}]`).join(" | "),
    );

    return normalized;
  } catch (err) {
    console.warn("[MarketPricesV36] Gemini grouping error:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

/**
 * V3.6 SHADOW MODE — exécute V3.6 en parallèle de V3.5 et logge la comparaison.
 *
 * Objectif : mesurer les différences entre les deux systèmes sur des analyses
 * réelles, sans impact UX (V3.5 reste la source visible). Permet de valider
 * V3.6 avant activation prod (PHASE 6 KPI).
 *
 * Log structuré [V36_SHADOW] avec :
 *   - signature_v36, matched_job_type_v35, matched_job_type_v36
 *   - same_match, strategy, confidence
 *   - tous loggés en JSON pour parsing ultérieur
 */
async function runShadowComparison(
  workItems: WorkItemFull[],
  googleApiKey: string,
  signatureExpertPrompt: string,
  catalog: MarketCatalogRow[],
  legacyJobTypes: GeminiJobType[],
): Promise<void> {
  // ── Outer guard : tout throw remonté ici ne propage jamais. ──────────────
  // L'analyse user a déjà été retournée à ce stade — on est purement en
  // background task. Un throw ici DOIT être silencieux pour l'user.
  try {
    // ── Step 1 — appel Gemini signature ──────────────────────────────────
    // Failure ici = pas de shadow data pour cette analyse, mais V3.5 a déjà
    // produit son résultat → user not impacted.
    let sigGroups: Awaited<ReturnType<typeof groupWithGeminiSignature>>;
    try {
      sigGroups = await groupWithGeminiSignature(workItems, googleApiKey, signatureExpertPrompt);
    } catch (err) {
      console.warn(`[V36_SHADOW_ERROR] gemini_signature_call_failed: ${err instanceof Error ? err.message : String(err)}`);
      recordShadowError();
      return;
    }

    if (!Array.isArray(sigGroups) || sigGroups.length === 0) {
      console.log(`[V36_SHADOW] gemini returned 0 groups (legacy=${legacyJobTypes.length} groups)`);
      return;
    }

    // ── Step 2 — pour chaque groupe, comparer V3.5 et V3.6 ────────────────
    // Chaque itération est isolée : si un groupe throw, les autres continuent.
    let okCount = 0;
    let errCount = 0;

    for (const v36Group of sigGroups) {
      try {
        const v36Items = new Set(v36Group.work_items);

        // Trouve le groupe V3.5 avec le plus d'overlap d'items
        let bestLegacyMatch: GeminiJobType | null = null;
        let bestOverlap = 0;
        for (const legacy of legacyJobTypes) {
          const overlap = legacy.work_items.filter(idx => v36Items.has(idx)).length;
          if (overlap > bestOverlap) {
            bestOverlap = overlap;
            bestLegacyMatch = legacy;
          }
        }

        // Validation + matching V3.6 (chacun isolé)
        let validation: ReturnType<typeof validateSignature>;
        try {
          validation = validateSignature(v36Group.signature);
        } catch (err) {
          console.warn(`[V36_SHADOW_ERROR] validate_signature_threw: ${err instanceof Error ? err.message : String(err)}`);
          errCount++;
          continue;
        }

        let v36MatchResult: MatchResult | null = null;
        if (validation.valid && validation.signature) {
          try {
            v36MatchResult = matchMarketCategory(validation.signature, catalog);
          } catch (err) {
            console.warn(`[V36_SHADOW_ERROR] match_market_category_threw: ${err instanceof Error ? err.message : String(err)}`);
            errCount++;
            continue;
          }
        }

        // Construit et logge le log structuré
        const legacyJobType = bestLegacyMatch?.job_types[0] || null;
        const v36JobType = v36MatchResult?.matched ? v36MatchResult.job_type : null;
        const sameMatch = legacyJobType === v36JobType;

        const shadowLog = {
          v36_group_label: v36Group.job_type_label,
          v36_work_items_count: v36Group.work_items.length,
          items_overlap_with_legacy: bestOverlap,
          legacy: {
            job_type: legacyJobType,
            job_type_label: bestLegacyMatch?.job_type_label || null,
          },
          v36: validation.valid && validation.signature ? {
            signature: {
              domain: validation.signature.domain,
              subcategory: validation.signature.subcategory,
              room: validation.signature.room,
              unit: validation.signature.unit,
              keywords: validation.signature.keywords.slice(0, 5),
            },
            matched_job_type: v36JobType,
            strategy: v36MatchResult?.match_strategy ?? "no_match",
            confidence: v36MatchResult?.confidence ?? 0,
          } : {
            signature_invalid: true,
            errors: validation.errors,
          },
          diff: {
            same_match: sameMatch,
            v36_has_match: v36JobType !== null,
            legacy_has_match: legacyJobType !== null,
            v36_no_match_v35_did: legacyJobType !== null && v36JobType === null,
            v35_no_match_v36_did: legacyJobType === null && v36JobType !== null,
          },
        };

        try {
          console.log(`[V36_SHADOW] ${JSON.stringify(shadowLog)}`);
          okCount++;
        } catch (err) {
          // Si JSON.stringify échoue (circular ref?) → fallback log minimal
          console.warn(`[V36_SHADOW_ERROR] log_serialize_failed: ${err instanceof Error ? err.message : String(err)} | group=${v36Group.job_type_label}`);
          errCount++;
        }
      } catch (err) {
        // Catch ultime par itération
        console.warn(`[V36_SHADOW_ERROR] group_iteration_failed: ${err instanceof Error ? err.message : String(err)}`);
        errCount++;
      }
    }

    console.log(`[V36_SHADOW_SUMMARY] groups_compared=${okCount} errors=${errCount} total_v36=${sigGroups.length} total_v35=${legacyJobTypes.length}`);
  } catch (err) {
    // Outer guard final
    console.warn(`[V36_SHADOW_ERROR] outer_guard: ${err instanceof Error ? err.message : String(err)}`);
    recordShadowError();
  }
}

/**
 * Main entry point: identify job types and look up market prices.
 */
export async function lookupMarketPrices(
  supabase: SupabaseClient,
  workItems: WorkItemFull[],
  googleApiKey: string,
  config: DomainConfig,
): Promise<JobTypePriceResult[]> {
  if (!workItems || workItems.length === 0) {
    return [];
  }

  // ─── V3.5.0 Phase C — Bypass vectoriel (court-circuit groupement + matching) ─
  // Si flag VECTORIAL=on → on délègue tout à la similarity search vectorielle.
  // Aucun appel au catalogue par domaine, aucun groupement Gemini. Le résultat
  // est déjà au shape JobTypePriceResult (étendu avec `vectorial`) → drop-in.
  if (VECTORIAL_MODE === "on") {
    console.log(`[MarketPrices] vectorial=on → lookupMarketPricesVectorial (${workItems.length} lines)`);
    try {
      const vectorialResults = await lookupMarketPricesVectorial(
        supabase,
        workItems,
        googleApiKey,
      );
      // Le shape VectorialJobTypePriceResult étend JobTypePriceResult avec `vectorial`
      // — cast safe puisqu'il ajoute uniquement un champ optionnel.
      return vectorialResults as JobTypePriceResult[];
    } catch (err) {
      // Garde anti-régression : si le pipeline vectoriel crash, on log et
      // on retombe sur V3.6 plutôt que de planter l'analyse entière.
      console.warn(
        `[MarketPrices] vectorial pipeline CRASHED, fallback to V3.6: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      // Continue vers le pipeline V3.6 ci-dessous (no early return)
    }
  }

  // 1. Fetch market prices filtered by domain
  const { data: allPrices, error } = await supabase
    .from("market_prices")
    .select(
      "job_type, label, unit, price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht, fixed_min_ht, fixed_avg_ht, fixed_max_ht, zip_scope, notes",
    )
    .eq("domain", config.domain);

  if (error || !allPrices || allPrices.length === 0) {
    console.warn("[MarketPrices] Failed to fetch:", error?.message);
    return [];
  }

  console.log("[MarketPrices] Loaded", allPrices.length, "price rows");

  // 2. Pre-filter catalog to relevant entries (reduces from 470+ to ~20-80)
  const relevantPrices = filterRelevantPrices(allPrices as MarketPriceRow[], workItems);

  // Build set of valid job_type identifiers + label lookup from FULL catalog
  // (used for validation — we validate against ALL catalog entries, not just filtered)
  const validJobTypes = new Set<string>();
  const catalogLabels = new Map<string, string>();
  // Normalized (lowercase + trim) → canonical job_type, for fuzzy fallback
  const normalizedToCanonical = new Map<string, string>();
  for (const p of allPrices as MarketPriceRow[]) {
    validJobTypes.add(p.job_type);
    normalizedToCanonical.set(p.job_type.toLowerCase().trim(), p.job_type);
    if (!catalogLabels.has(p.job_type)) {
      catalogLabels.set(p.job_type, p.label);
    }
  }

  // 3. Identifier les job types — 3 modes possibles
  //    (cf. MATCHER_MODE et cahier des charges PHASE 1 SHADOW DEPLOYMENT) :
  //    - "v35_only"  : V3.5 seule (rollback)
  //    - "shadow"    : V3.5 visible + V3.6 silencieuse en parallèle (DÉFAUT)
  //    - "v36_only"  : V3.6 visible (après validation shadow)
  let jobTypes: GeminiJobType[];
  console.log(`[MarketPrices] mode=${MATCHER_MODE}`);

  // Catalogue complet typé pour V3.6 matcher (utilisé en shadow ou v36_only)
  const fullCatalog: MarketCatalogRow[] = (allPrices as MarketCatalogRow[]);

  if (MATCHER_MODE === "v36_only" && config.marketSignatureExpertPrompt) {
    // ─── V3.6 visible utilisateur — avec fallback V3.5 si crash ──────────
    let v36Success = false;
    try {
      const sigGroups = await groupWithGeminiSignature(
        workItems,
        googleApiKey,
        config.marketSignatureExpertPrompt,
      );
      if (Array.isArray(sigGroups) && sigGroups.length > 0) {
        jobTypes = sigGroups.map((g) => {
          const validation = validateSignature(g.signature);
          if (!validation.valid || !validation.signature) {
            console.warn(`[V36_INVALID_SIGNATURE] group "${g.job_type_label}" — fallback to no-catalog`);
            return {
              job_type_label: g.job_type_label,
              job_types: [],
              main_unit: g.main_unit,
              main_quantity: g.main_quantity,
              work_items: g.work_items,
            };
          }
          const matchResult = matchMarketCategory(validation.signature, fullCatalog);
          logMatchResult(matchResult, { groupLabel: g.job_type_label });
          return {
            job_type_label: matchResult.matched && matchResult.label ? matchResult.label : g.job_type_label,
            job_types: matchResult.matched && matchResult.job_type ? [matchResult.job_type] : [],
            main_unit: g.main_unit,
            main_quantity: g.main_quantity,
            work_items: g.work_items,
          };
        });
        v36Success = true;
        console.log(`[MarketPrices] V3.6 — ${jobTypes.length} groups (${jobTypes.filter(jt => jt.job_types.length > 0).length} matched)`);
      } else {
        console.warn(`[V36_PROD_FALLBACK] V3.6 returned 0 groups, falling back to V3.5`);
      }
    } catch (err) {
      console.warn(`[V36_PROD_FALLBACK] V3.6 threw: ${err instanceof Error ? err.message : String(err)} — falling back to V3.5`);
    }

    // Failsafe : si V3.6 a échoué (catch ou 0 groups), bascule sur V3.5
    if (!v36Success) {
      const catalog = buildCatalog(relevantPrices);
      jobTypes = await groupWithGemini(workItems, catalog, googleApiKey, config.marketPriceExpertPrompt);
      console.log(`[MarketPrices] V3.5 fallback (post-V3.6 fail) — ${jobTypes.length} groups`);
    }
  } else {
    // ─── V3.5 visible (modes "v35_only" ET "shadow") ─────────────────────
    const catalog = buildCatalog(relevantPrices);
    jobTypes = await groupWithGemini(workItems, catalog, googleApiKey, config.marketPriceExpertPrompt);
    console.log(`[MarketPrices] V3.5 visible — ${workItems.length} work items, ${jobTypes.length} job types`);

    // ─── SHADOW MODE — V3.6 en parallèle silencieux ──────────────────────
    //
    // GARANTIES :
    //   1. Sampling : seules ~20% des analyses déclenchent un shadow (réduit
    //      le coût du 2e appel Gemini par 5).
    //   2. Background task via EdgeRuntime.waitUntil : la fonction continue
    //      après envoi de la réponse, MAIS Deno Deploy garantit que la promise
    //      finit avant de tuer la fonction (vs un fire-and-forget classique
    //      qui peut être interrompu — cf. CLAUDE.md "Fire-and-forget sur
    //      serverless ne marche pas").
    //   3. Latence user inchangée (l'attente du shadow se fait AVANT la
    //      réponse HTTP, mais on n'awaite PAS le shadow ici).
    //   4. Failsafe complet : aucune exception ne peut casser l'analyse user
    //      (V3.5 a déjà retourné jobTypes avant cette branche).
    if (MATCHER_MODE === "shadow"
        && config.marketSignatureExpertPrompt
        && V36_SHADOW_SAMPLE_RATE > 0
        && !isShadowKilled()
        && Math.random() < V36_SHADOW_SAMPLE_RATE) {
      const shadowPromise = runShadowComparison(
        workItems,
        googleApiKey,
        config.marketSignatureExpertPrompt,
        fullCatalog,
        jobTypes,
      ).catch(err => {
        // Failsafe ultime : tout error est logguée mais jamais propagée.
        console.warn(`[V36_SHADOW_ERROR] runShadowComparison threw: ${err instanceof Error ? err.message : String(err)}`);
        recordShadowError();
      });

      // EdgeRuntime.waitUntil — Supabase Edge Functions / Deno Deploy API
      // qui permet à une promesse de continuer en background APRÈS l'envoi de
      // la réponse HTTP, sans risque d'interruption.
      // Cf. https://supabase.com/docs/guides/functions/background-tasks
      try {
        const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
        if (er && typeof er.waitUntil === "function") {
          er.waitUntil(shadowPromise);
        }
        // Sinon : la promise tourne en fire-and-forget (best effort).
        // En local Deno la promise complete naturellement.
      } catch {
        // EdgeRuntime non disponible — fallback fire-and-forget silencieux.
      }
    }
  }

  // 3b-bis. FOURNITURE vs HORS-FOURNITURE override (server-side guard).
  // If Gemini picked a "_mo" / "hors_fourniture" catalog entry but the work item descriptions
  // clearly mention "fourniture" + "pose", switch to the equivalent "_fourniture_pose" entry.
  // This guard is independent of prompt instructions and fires even when Gemini ignores the rule.
  for (const jt of jobTypes) {
    if (!jt.job_types || jt.job_types.length === 0) continue;
    const groupWorkItems = jt.work_items.map((idx) => workItems[idx]).filter(Boolean) as WorkItemFull[];
    const allDesc = stripAccents(groupWorkItems.map((w) => w.description.toLowerCase()).join(" "));
    const hasFourniturePose = allDesc.includes("fourniture") && (allDesc.includes("pose") || allDesc.includes("posa"));

    if (!hasFourniturePose) continue;

    const overridden: string[] = [];
    for (const jtype of jt.job_types) {
      const normalized = jtype.toLowerCase();
      // Detect "_mo", "_hors_fourniture", "_pose_seule", "_pose_only" suffixes/patterns
      const isMoOnly = /_mo$/.test(normalized) || normalized.includes("hors_fourniture") || normalized.includes("pose_seule");
      if (!isMoOnly) { overridden.push(jtype); continue; }

      // Try to find equivalent fourniture_pose entry in full catalog
      const basePart = normalized.replace(/_mo$/, "").replace(/_hors_fourniture$/, "").replace(/_pose_seule$/, "");
      const fpCandidate = `${basePart}_fourniture_pose`;
      const fpCanonical = [...validJobTypes].find((v) => v.toLowerCase() === fpCandidate);
      if (fpCanonical) {
        console.log(`[MarketPrices] fourniture-override: "${jtype}" → "${fpCanonical}" (group "${jt.job_type_label}")`);
        overridden.push(fpCanonical);
      } else {
        // Keep as-is if no fourniture_pose variant exists
        overridden.push(jtype);
      }
    }
    jt.job_types = overridden;
  }

  // 3c. Override main_quantity UNIQUEMENT pour les items dénombrables (U/unité/pce).
  // Corrige le cas où Gemini retourne main_quantity=1 pour N éléments distincts (ex: 3 volets roulants × 1U → doit être 3).
  // NE PAS appliquer aux surfaces (m², ml) : Gemini gère le déduplication préparation+finition sur même surface.
  const SURFACE_UNITS = new Set(["m2", "m²", "ml", "ML", "m", "M", "m3", "m³"]);
  // Unités forfait françaises — NE PAS auto-corriger la quantité pour ces unités
  // ("F" et "fft" sont des abréviations courantes de "forfait" dans les devis BTP)
  const FORFAIT_UNITS = new Set(["f", "fft", "ff", "ens", "forfait", "global", "prestation", "ensemble"]);
  for (const jt of jobTypes) {
    const lines = jt.work_items.map((idx) => workItems[idx]).filter(Boolean);
    const linesWithQty = lines.filter(
      (l) => l !== undefined && l.quantity !== null && l.quantity !== undefined && l.quantity > 0 && l.unit,
    );
    if (linesWithQty.length > 1) {
      const uniqueUnits = new Set(linesWithQty.map((l) => l.unit));
      const unit = linesWithQty[0].unit as string;
      // Seulement pour les unités dénombrables, pas les surfaces
      if (uniqueUnits.size === 1 && !SURFACE_UNITS.has(unit) && !FORFAIT_UNITS.has(unit.toLowerCase())) {
        const sumQty = linesWithQty.reduce((sum, l) => sum + (l.quantity || 0), 0);
        if (sumQty > 0 && sumQty !== jt.main_quantity) {
          console.log(
            `[MarketPrices] Auto-correcting main_quantity (countable) for "${jt.job_type_label}": Gemini=${jt.main_quantity} → sum=${sumQty} ${unit}`,
          );
          jt.main_quantity = sumQty;
          jt.main_unit = unit;
        }
      }
    }
  }

  // 4. Build results: groups WITH valid catalog match → keep; others → merge into "Autre"
  const results: JobTypePriceResult[] = [];
  const assignedIndices = new Set<number>();

  // Lines from groups that have NO valid catalog match → collected into "Autre"
  const autreLines: DevisLineDetail[] = [];
  let autreTotal = 0;
  let autreHasAmount = false;
  const autreIndices: number[] = [];

  for (const jt of jobTypes) {
    if (jt.work_items.length === 0) continue;

    // Validate job_types against catalog — 4-level fallback
    const originalJobTypes = [...jt.job_types];
    const validatedJobTypes: string[] = [];
    for (const jtype of jt.job_types) {
      // Level 1: exact match (with trim — guards against leading/trailing spaces)
      const jtypeTrimmed = jtype.trim();
      if (validJobTypes.has(jtypeTrimmed)) {
        validatedJobTypes.push(jtypeTrimmed);
        continue;
      }

      const normalized = jtypeTrimmed.toLowerCase().replace(/\s+/g, "_");

      // Level 2: normalized exact match (case + spaces)
      const canonicalExact = normalizedToCanonical.get(normalized);
      if (canonicalExact) {
        console.log(`[MarketPrices] L2 exact-normalized "${jtype}" → "${canonicalExact}"`);
        validatedJobTypes.push(canonicalExact);
        continue;
      }

      // Level 3: prefix match (bidirectional)
      // e.g. "carrelage_sol" → "carrelage_sol_fourniture_pose" (Gemini shorter than catalog)
      // e.g. "carrelage_sol_fourniture_pose" → "carrelage_sol" (Gemini longer, catalog is prefix)
      let bestMatch: string | null = null;
      let bestScore = 0;
      for (const [catalogNorm, catalogCanonical] of normalizedToCanonical.entries()) {
        if (catalogNorm.startsWith(normalized + "_") || catalogNorm === normalized) {
          if (normalized.length > bestScore) { bestScore = normalized.length; bestMatch = catalogCanonical; }
        } else if (normalized.startsWith(catalogNorm + "_")) {
          if (catalogNorm.length > bestScore) { bestScore = catalogNorm.length; bestMatch = catalogCanonical; }
        }
      }
      if (bestMatch) {
        console.log(`[MarketPrices] L3 prefix "${jtype}" → "${bestMatch}"`);
        validatedJobTypes.push(bestMatch);
        continue;
      }

      // Level 4: token-boundary substring match (handles "pose_carrelage_sol_fourniture" → "carrelage_sol")
      // Catalog key must contain at least 1 underscore (multi-word) to avoid false positives.
      // Uses token-boundary regex: catalog key must appear surrounded by _ or start/end.
      let l4Match: string | null = null;
      let l4Score = 0;
      for (const [catalogNorm, catalogCanonical] of normalizedToCanonical.entries()) {
        if (!catalogNorm.includes("_")) continue; // skip single-word keys
        try {
          const pattern = new RegExp(`(?:^|_)${catalogNorm}(?:_|$)`);
          if (pattern.test(normalized) && catalogNorm.length > l4Score) {
            l4Score = catalogNorm.length;
            l4Match = catalogCanonical;
          }
        } catch {
          // skip if regex fails (special chars in key)
        }
      }
      if (l4Match) {
        console.log(`[MarketPrices] L4 token-boundary "${jtype}" → "${l4Match}"`);
        validatedJobTypes.push(l4Match);
        continue;
      }

      // Level 5: semantic keyword matching — independent of Gemini identifier compliance
      // Uses group label + work item descriptions to find best catalog match by token overlap
      const groupWorkItems = jt.work_items.map((idx) => workItems[idx]).filter(Boolean) as WorkItemFull[];
      const l5Match = findCatalogMatchByKeywords(jt.job_type_label, groupWorkItems, relevantPrices);
      if (l5Match) {
        console.log(`[MarketPrices] L5 semantic "${jtype}" → "${l5Match}" (via group "${jt.job_type_label}")`);
        validatedJobTypes.push(l5Match);
        continue;
      }

      console.warn(`[MarketPrices] ALL 5 LEVELS FAILED for "${jtype}" in group "${jt.job_type_label}"`);
    }

    // Group-level L5 fallback: if job_types was empty [] OR all identifiers failed matching,
    // directly try semantic match on group label + work items (no jtype loop needed)
    if (validatedJobTypes.length === 0) {
      const groupWorkItems2 = jt.work_items.map((idx) => workItems[idx]).filter(Boolean) as WorkItemFull[];
      const groupL5 = findCatalogMatchByKeywords(jt.job_type_label, groupWorkItems2, relevantPrices);
      if (groupL5) {
        console.log(`[MarketPrices] Group-L5 semantic for "${jt.job_type_label}" → "${groupL5}"`);
        validatedJobTypes.push(groupL5);
      } else {
        console.warn(`[MarketPrices] Group-L5 also failed for "${jt.job_type_label}" — going to Autre`);
      }
    }

    const invalidJobTypes = originalJobTypes.filter((jtype) => !validatedJobTypes.includes(jtype) && !validJobTypes.has(jtype));
    if (invalidJobTypes.length > 0) {
      console.warn(`[MarketPrices] FILTERED invented job_types for "${jt.job_type_label}":`, invalidJobTypes);
    }

    // Build devis lines for this group
    const devisLines: DevisLineDetail[] = [];
    let devisTotalHT = 0;
    let hasAmount = false;

    for (const idx of jt.work_items) {
      const item = workItems[idx];
      if (!item) continue;

      assignedIndices.add(idx);
      const line: DevisLineDetail = {
        index: idx,
        description: item.description,
        amount_ht: item.amount_ht,
        quantity: item.quantity,
        unit: item.unit,
      };
      devisLines.push(line);

      if (item.amount_ht !== null) {
        devisTotalHT += item.amount_ht;
        hasAmount = true;
      }
    }

    // Look up matched prices from catalog
    const matchedPrices = validatedJobTypes.length > 0
      ? (allPrices as MarketPriceRow[]).filter((p) => validatedJobTypes.includes(p.job_type))
      : [];

    // If NO valid catalog match → send lines to "Autre" instead of creating a separate group
    if (matchedPrices.length === 0) {
      console.log(`[MarketPrices] "${jt.job_type_label}" has NO catalog match → lines go to "Autre"`);
      for (const line of devisLines) {
        autreLines.push(line);
        autreIndices.push(line.index);
        if (line.amount_ht !== null) {
          autreTotal += line.amount_ht;
          autreHasAmount = true;
        }
      }
      continue;
    }

    // Valid catalog match → keep as a normal group
    // Use catalog label instead of Gemini's invented label
    const catalogLabel = catalogLabels.get(validatedJobTypes[0]) || jt.job_type_label;
    results.push({
      job_type_label: catalogLabel,
      catalog_job_types: validatedJobTypes,
      main_unit: jt.main_unit,
      main_quantity: jt.main_quantity,
      devis_lines: devisLines,
      devis_total_ht: hasAmount ? devisTotalHT : null,
      prices: matchedPrices,
      workItemIndices: jt.work_items,
    });

    console.log(
      `[MarketPrices] JobType "${catalogLabel}" (gemini: "${jt.job_type_label}"): ${devisLines.length} lines, ${hasAmount ? devisTotalHT + "€" : "no amount"}, ${jt.main_quantity} ${jt.main_unit}, ${matchedPrices.length} catalog prices [${validatedJobTypes.join(",")}]`,
    );
  }

  // 5. Collect orphan lines (not assigned by Gemini at all) → also into "Autre"
  console.log(`[MarketPrices] Gemini assigned ${assignedIndices.size}/${workItems.length} work items`);

  for (let i = 0; i < workItems.length; i++) {
    if (assignedIndices.has(i)) continue;
    const item = workItems[i];
    console.log(`[MarketPrices] ORPHAN line #${i}: "${item.description.substring(0, 60)}"`);
    autreLines.push({
      index: i,
      description: item.description,
      amount_ht: item.amount_ht,
      quantity: item.quantity,
      unit: item.unit,
    });
    autreIndices.push(i);
    if (item.amount_ht !== null) {
      autreTotal += item.amount_ht;
      autreHasAmount = true;
    }
  }

  // 6. Create the "Autre" catch-all group if there are any lines
  if (autreLines.length > 0) {
    console.log(`[MarketPrices] "Autre" group: ${autreLines.length} lines (unmatched groups + orphans)`);
    results.push({
      job_type_label: "Autre",
      catalog_job_types: [],
      main_unit: "forfait",
      main_quantity: 1,
      devis_lines: autreLines,
      devis_total_ht: autreHasAmount ? autreTotal : null,
      prices: [],
      workItemIndices: autreIndices,
    });
  }

  const matchedGroups = results.filter((r) => r.prices.length > 0).length;
  console.log(`[MarketPrices] Final: ${results.length} groups (${matchedGroups} with prices), lines: ${results.reduce((s, r) => s + r.devis_lines.length, 0)}/${workItems.length}`);

  // ── EMERGENCY FALLBACK ───────────────────────────────────────────────────────
  // If Gemini returned 0 groups (API fail, timeout, bad JSON) OR all groups ended
  // up in "Autre" (0 matched), fall back to direct per-item semantic matching.
  // Groups work items by category field from extraction (already classified by Gemini Phase 1).
  if (matchedGroups === 0) {
    console.warn("[MarketPrices] 0 matched groups — activating emergency semantic fallback");
    const byCat = new Map<string, WorkItemFull[]>();
    for (const item of workItems) {
      const cat = (item.category || "autre").toLowerCase().trim();
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(item);
    }

    const fallbackResults: JobTypePriceResult[] = [];
    for (const [cat, items] of byCat.entries()) {
      if (cat === "autre") continue;
      const bestJobType = findCatalogMatchByKeywords(cat, items, relevantPrices);
      if (!bestJobType) continue;
      const matchedPrices = (allPrices as MarketPriceRow[]).filter((p) => p.job_type === bestJobType);
      if (matchedPrices.length === 0) continue;

      let total = 0; let hasAmt = false;
      for (const item of items) { if (item.amount_ht !== null) { total += item.amount_ht; hasAmt = true; } }

      const catalogLabel = catalogLabels.get(bestJobType) || cat;
      console.log(`[MarketPrices] Emergency fallback: cat="${cat}" → "${bestJobType}" (${items.length} items)`);
      fallbackResults.push({
        job_type_label: catalogLabel,
        catalog_job_types: [bestJobType],
        main_unit: items[0]?.unit || "forfait",
        main_quantity: items.reduce((s, i) => s + (i.quantity || 0), 0) || 1,
        devis_lines: items.map((item, idx) => ({
          index: workItems.indexOf(item),
          description: item.description,
          amount_ht: item.amount_ht,
          quantity: item.quantity,
          unit: item.unit,
        })),
        devis_total_ht: hasAmt ? total : null,
        prices: matchedPrices,
        workItemIndices: items.map((item) => workItems.indexOf(item)),
      });
    }

    if (fallbackResults.length > 0) {
      console.log(`[MarketPrices] Emergency fallback produced ${fallbackResults.length} groups`);
      maybeRunVectorialShadow(supabase, workItems, googleApiKey, fallbackResults);
      return fallbackResults;
    }
    console.warn("[MarketPrices] Emergency fallback also produced 0 groups");
  }

  maybeRunVectorialShadow(supabase, workItems, googleApiKey, results);
  return results;
}

/**
 * V3.5.0 Phase C.5 — Shadow run du pipeline vectoriel en parallèle du V3.6.
 *
 * Quand MARKET_MATCHER_VECTORIAL=shadow, on lance `lookupMarketPricesVectorial`
 * en background (via EdgeRuntime.waitUntil) ET on logge la comparaison avec ce
 * que V3.6 a produit. Aucun impact sur la réponse HTTP — c'est du data
 * collection pour préparer la bascule Phase F.
 *
 * Métriques loggées (cherchables via [V35_VECTORIAL_SHADOW] dans Supabase
 * Functions logs) :
 *   - nb lignes devis embeddées
 *   - mix confidence (high/medium/low/no_match)
 *   - nb groupes V3.6 vs nb lignes vectoriel (pour mesurer la « dispersion »)
 *   - top-1 jobs catalogue vectoriel pour chaque ligne (pour audit manuel)
 *   - top-1 jobs catalogue V3.6 par groupe (pour comparaison)
 *
 * Les erreurs sont silencieuses — un crash du shadow ne doit JAMAIS dégrader
 * l'analyse user-visible.
 */
function maybeRunVectorialShadow(
  supabase: SupabaseClient,
  workItems: WorkItemFull[],
  googleApiKey: string,
  v36Results: JobTypePriceResult[],
): void {
  if (VECTORIAL_MODE !== "shadow") return;
  if (!workItems || workItems.length === 0) return;
  if (isShadowKilled()) {
    console.log(`[V35_VECTORIAL_SHADOW] skipped — kill switch active (V36 shadow killed)`);
    return;
  }

  const shadowPromise = (async () => {
    const startTs = Date.now();
    try {
      const vectorialResults = await lookupMarketPricesVectorial(supabase, workItems, googleApiKey);

      // Mix confidence
      const tiers = { high: 0, medium: 0, low: 0, no_match: 0 };
      const vectorialTopJobs: string[] = [];
      for (const r of vectorialResults) {
        const t = r.vectorial?.confidence ?? "no_match";
        if (t in tiers) tiers[t as keyof typeof tiers]++;
        vectorialTopJobs.push(r.catalog_job_types[0] ?? "—");
      }

      // V3.6 top jobs par groupe (pour comparaison)
      const v36TopJobs = v36Results.map((g) => g.catalog_job_types[0] ?? "—");

      const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
      console.log(
        `[V35_VECTORIAL_SHADOW] elapsed=${elapsed}s | lines=${workItems.length} ` +
          `v36_groups=${v36Results.length} vec_results=${vectorialResults.length} | ` +
          `high=${tiers.high} medium=${tiers.medium} low=${tiers.low} no_match=${tiers.no_match}`,
      );
      console.log(`[V35_VECTORIAL_SHADOW] v36_top_jobs=${JSON.stringify(v36TopJobs)}`);
      console.log(`[V35_VECTORIAL_SHADOW] vec_top_jobs=${JSON.stringify(vectorialTopJobs)}`);
    } catch (err) {
      // Silencieux : on n'enregistre pas dans le kill switch V36, c'est un autre flux.
      console.warn(
        `[V35_VECTORIAL_SHADOW_ERROR] ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  })();

  try {
    const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (er && typeof er.waitUntil === "function") {
      er.waitUntil(shadowPromise);
    }
    // Sinon fire-and-forget (best effort, OK en dev local).
  } catch {
    // EdgeRuntime indispo — fire-and-forget silencieux.
  }
}
