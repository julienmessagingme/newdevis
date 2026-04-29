import type { DomainConfig } from "./domain-config.ts";

// ============================================================
// MARKET PRICES LOOKUP — Hierarchical job type system
// 1. Fetches market_prices catalog from Supabase
// 2. Asks Gemini to identify job types, determine qty/unit,
//    and assign each devis line to ONE job type
// 3. Builds detailed results per job type with devis lines
// 4. Returns hierarchical results for frontend display
// ============================================================

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
  const allText = stripAccents(
    workItems.map((w) => `${w.description} ${w.category || ""}`).join(" ").toLowerCase()
  );

  const relevantDomains = new Set<string>();
  for (const [domain, triggers] of Object.entries(DOMAIN_TRIGGERS)) {
    if (triggers.some((t) => allText.includes(stripAccents(t.toLowerCase())))) {
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
    amenagement: ["terrasse", "portail", "cloture", "piscine", "pergola", "allee", "amenagement"],
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
- CAS VRD/TERRASSEMENT/ENROBÉ (règle clé) : NIVELLEMENT 96m² + ÉVACUATION DÉBLAIS 96m² + PRÉPARATION SUPPORT 96m² + REVÊTEMENT ENROBÉ 96m² → c'est la MÊME surface de 96m² avec 4 opérations successives → main_quantity = 96m² (PAS 384m²). Règle générale : quand plusieurs postes VRD/terrassement (préparation, évacuation, compactage, reprofilage, revêtement) ont une quantité identique en M2, ils travaillent tous sur la MÊME surface — utiliser la quantité UNE SEULE FOIS.

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
    const response = await fetch(
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

  // 3. Ask Gemini to identify job types and assign lines — using FILTERED catalog
  const catalog = buildCatalog(relevantPrices);
  const jobTypes = await groupWithGemini(workItems, catalog, googleApiKey, config.marketPriceExpertPrompt);

  console.log(`[MarketPrices] ${workItems.length} work items, ${jobTypes.length} job types from Gemini`);

  // 3b. Override main_quantity UNIQUEMENT pour les items dénombrables (U/unité/pce).
  // Corrige le cas où Gemini retourne main_quantity=1 pour N éléments distincts (ex: 3 volets roulants × 1U → doit être 3).
  // NE PAS appliquer aux surfaces (m², ml) : Gemini gère le déduplication préparation+finition sur même surface.
  const SURFACE_UNITS = new Set(["m2", "m²", "ml", "ML", "m", "M", "m3", "m³"]);
  for (const jt of jobTypes) {
    const lines = jt.work_items.map((idx) => workItems[idx]).filter(Boolean);
    const linesWithQty = lines.filter(
      (l) => l !== undefined && l.quantity !== null && l.quantity !== undefined && l.quantity > 0 && l.unit,
    );
    if (linesWithQty.length > 1) {
      const uniqueUnits = new Set(linesWithQty.map((l) => l.unit));
      const unit = linesWithQty[0].unit as string;
      // Seulement pour les unités dénombrables, pas les surfaces
      if (uniqueUnits.size === 1 && !SURFACE_UNITS.has(unit)) {
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
      return fallbackResults;
    }
    console.warn("[MarketPrices] Emergency fallback also produced 0 groups");
  }

  return results;
}
