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
          temperature: 0.1,
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

  // 2. Build set of valid job_type identifiers + label lookup from catalog
  const validJobTypes = new Set<string>();
  const catalogLabels = new Map<string, string>();
  for (const p of allPrices as MarketPriceRow[]) {
    validJobTypes.add(p.job_type);
    if (!catalogLabels.has(p.job_type)) {
      catalogLabels.set(p.job_type, p.label);
    }
  }

  // 3. Ask Gemini to identify job types and assign lines
  const catalog = buildCatalog(allPrices as MarketPriceRow[]);
  const jobTypes = await groupWithGemini(workItems, catalog, googleApiKey, config.marketPriceExpertPrompt);

  console.log(`[MarketPrices] ${workItems.length} work items, ${jobTypes.length} job types from Gemini`);

  // 3b. Override main_quantity with actual sum from devis lines when all lines share the same unit.
  // Fixes cases where Gemini returns main_quantity=1 for groups with multiple unit-based lines
  // (e.g., 3 volets roulants each with qty=1 → Gemini sometimes says 1 instead of 3).
  for (const jt of jobTypes) {
    const lines = jt.work_items.map((idx) => workItems[idx]).filter(Boolean);
    const linesWithQty = lines.filter(
      (l) => l !== undefined && l.quantity !== null && l.quantity !== undefined && l.quantity > 0 && l.unit,
    );
    if (linesWithQty.length > 1) {
      const uniqueUnits = new Set(linesWithQty.map((l) => l.unit));
      if (uniqueUnits.size === 1) {
        const sumQty = linesWithQty.reduce((sum, l) => sum + (l.quantity || 0), 0);
        if (sumQty > 0 && sumQty !== jt.main_quantity) {
          console.log(
            `[MarketPrices] Auto-correcting main_quantity for "${jt.job_type_label}": Gemini=${jt.main_quantity} → devis lines sum=${sumQty} ${linesWithQty[0].unit}`,
          );
          jt.main_quantity = sumQty;
          jt.main_unit = linesWithQty[0].unit as string;
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

    // Validate job_types against catalog — filter out invented ones
    const originalJobTypes = [...jt.job_types];
    const validatedJobTypes = jt.job_types.filter((jtype) => validJobTypes.has(jtype));
    const invalidJobTypes = originalJobTypes.filter((jtype) => !validJobTypes.has(jtype));
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

  console.log(`[MarketPrices] Final: ${results.length} groups, total lines: ${results.reduce((s, r) => s + r.devis_lines.length, 0)}/${workItems.length}`);

  return results;
}
