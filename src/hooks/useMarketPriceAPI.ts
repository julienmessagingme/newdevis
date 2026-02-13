import { useState } from "react";

// ========================================
// TYPES — New hierarchical job type format
// ========================================

export interface N8NPriceLine {
  row_number?: number;
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

/** A devis line within a job type */
export interface DevisLineDisplay {
  index: number;
  description: string;
  amountHT: number | null;
  quantity: number | null;
  unit: string | null;
}

/** One job type row for display — hierarchical card */
export interface JobTypeDisplayRow {
  jobTypeLabel: string;
  catalogJobTypes: string[];
  mainUnit: string;
  mainQuantity: number;
  devisLines: DevisLineDisplay[];
  devisTotalHT: number | null;
  theoreticalMinHT: number;
  theoreticalAvgHT: number;
  theoreticalMaxHT: number;
  prices: N8NPriceLine[];
  verdict: string | null;
  vsAvgPct: number | null;
}

// ========================================
// LEGACY TYPES — Kept for retrocompatibility
// ========================================

export interface WorkItemWithPrices {
  description: string;
  category: string | null;
  amount_ht: number | null;
  quantity: number | null;
  unit_devis: string | null;
  prices: N8NPriceLine[];
}

export interface MarketPriceTableRow {
  description: string;
  category: string | null;
  amountHT: number | null;
  quantity: number | null;
  unitDevis: string | null;
  jobType: string;
  label: string;
  unit: string;
  priceMinUnitHT: number;
  priceAvgUnitHT: number;
  priceMaxUnitHT: number;
  fixedMinHT: number;
  fixedAvgHT: number;
  fixedMaxHT: number;
  totalMinHT: number;
  totalAvgHT: number;
  totalMaxHT: number;
  zipScope: string;
  notes: string;
  verdict: string | null;
  vsAvgPct: number | null;
}

export interface UseMarketPriceAPIParams {
  workType?: string;
  codePostal?: string;
  filePath?: string;
  enabled?: boolean;
  cachedN8NData?: unknown;
}

// ========================================
// VERDICT LOGIC (shared)
// ========================================

function computeVerdict(devisHT: number | null, theoreticalAvgHT: number): { verdict: string | null; vsAvgPct: number | null } {
  if (devisHT === null || devisHT <= 0 || theoreticalAvgHT <= 0) {
    return { verdict: null, vsAvgPct: null };
  }
  const vsAvgPct = (devisHT - theoreticalAvgHT) / theoreticalAvgHT;
  let verdict: string;
  if (vsAvgPct < -0.25) verdict = "Bien placé";
  else if (vsAvgPct < -0.10) verdict = "Inférieur à la moyenne";
  else if (vsAvgPct <= 0.10) verdict = "Dans la norme";
  else if (vsAvgPct <= 0.25) verdict = "Légèrement élevé";
  else verdict = "Plutôt cher";
  return { verdict, vsAvgPct };
}

// ========================================
// NEW FORMAT — Process hierarchical job types
// ========================================

function isNewFormat(data: unknown): boolean {
  if (!data || !Array.isArray(data) || data.length === 0) return false;
  const first = data[0];
  return typeof first === "object" && first !== null && "job_type_label" in first;
}

export function processJobTypes(data: unknown): JobTypeDisplayRow[] {
  if (!data || !Array.isArray(data)) return [];

  const rows: JobTypeDisplayRow[] = [];

  for (const item of data) {
    const prices: N8NPriceLine[] = item.prices || [];

    const mainQuantity = typeof item.main_quantity === "number" && item.main_quantity > 0
      ? item.main_quantity : 1;

    // Calculate theoretical prices (0 if no catalog match)
    let theoreticalMinHT = 0;
    let theoreticalAvgHT = 0;
    let theoreticalMaxHT = 0;

    for (const price of prices) {
      theoreticalMinHT += price.price_min_unit_ht * mainQuantity + (price.fixed_min_ht || 0);
      theoreticalAvgHT += price.price_avg_unit_ht * mainQuantity + (price.fixed_avg_ht || 0);
      theoreticalMaxHT += price.price_max_unit_ht * mainQuantity + (price.fixed_max_ht || 0);
    }

    const devisTotalHT = typeof item.devis_total_ht === "number" ? item.devis_total_ht : null;
    // No verdict if no catalog prices matched
    const { verdict, vsAvgPct } = prices.length > 0
      ? computeVerdict(devisTotalHT, theoreticalAvgHT)
      : { verdict: null, vsAvgPct: null };

    // Build devis lines
    const devisLines: DevisLineDisplay[] = (item.devis_lines || []).map((line: {
      index: number;
      description: string;
      amount_ht: number | null;
      quantity: number | null;
      unit: string | null;
    }) => ({
      index: line.index,
      description: line.description,
      amountHT: line.amount_ht ?? null,
      quantity: line.quantity ?? null,
      unit: line.unit ?? null,
    }));

    rows.push({
      jobTypeLabel: item.job_type_label || "Sans catégorie",
      catalogJobTypes: item.catalog_job_types || item.job_types || [],
      mainUnit: item.main_unit || "unité",
      mainQuantity,
      devisLines,
      devisTotalHT,
      theoreticalMinHT,
      theoreticalAvgHT,
      theoreticalMaxHT,
      prices,
      verdict,
      vsAvgPct,
    });
  }

  return rows;
}

// ========================================
// LEGACY FORMAT — Process old flat work items
// ========================================

function processLegacyWorkItems(data: unknown): MarketPriceTableRow[] {
  if (!data || !Array.isArray(data)) return [];

  const rows: MarketPriceTableRow[] = [];

  for (const item of data as WorkItemWithPrices[]) {
    if (!item.prices || !Array.isArray(item.prices) || item.prices.length === 0) {
      continue;
    }

    const qty = (item.quantity !== null && item.quantity > 0) ? item.quantity : 1;

    let totalMinHT = 0;
    let totalAvgHT = 0;
    let totalMaxHT = 0;

    for (const price of item.prices) {
      totalMinHT += price.price_min_unit_ht * qty + (price.fixed_min_ht || 0);
      totalAvgHT += price.price_avg_unit_ht * qty + (price.fixed_avg_ht || 0);
      totalMaxHT += price.price_max_unit_ht * qty + (price.fixed_max_ht || 0);
    }

    const combinedLabel = item.prices.map(p => p.label).join(" + ");
    const combinedNotes = item.prices.map(p => p.notes).filter(Boolean).join(" / ");
    const firstPrice = item.prices[0];

    const { verdict, vsAvgPct } = computeVerdict(item.amount_ht, totalAvgHT);

    rows.push({
      description: item.description,
      category: item.category,
      amountHT: item.amount_ht,
      quantity: item.quantity,
      unitDevis: item.unit_devis,
      jobType: item.prices.map(p => p.job_type).join("+"),
      label: combinedLabel,
      unit: firstPrice.unit,
      priceMinUnitHT: 0,
      priceAvgUnitHT: 0,
      priceMaxUnitHT: 0,
      fixedMinHT: 0,
      fixedAvgHT: 0,
      fixedMaxHT: 0,
      totalMinHT,
      totalAvgHT,
      totalMaxHT,
      zipScope: firstPrice.zip_scope,
      notes: combinedNotes,
      verdict,
      vsAvgPct,
    });
  }

  return rows;
}

// ========================================
// MAIN HOOK
// ========================================

export const useMarketPriceAPI = ({
  cachedN8NData,
}: UseMarketPriceAPIParams) => {
  const hasCachedData = cachedN8NData !== undefined && cachedN8NData !== null;

  const [result] = useState(() => {
    if (!hasCachedData) {
      return { rows: [] as MarketPriceTableRow[], jobTypeRows: [] as JobTypeDisplayRow[], isNewFormat: false };
    }
    try {
      if (isNewFormat(cachedN8NData)) {
        return {
          rows: [] as MarketPriceTableRow[],
          jobTypeRows: processJobTypes(cachedN8NData),
          isNewFormat: true,
        };
      }
      return {
        rows: processLegacyWorkItems(cachedN8NData),
        jobTypeRows: [] as JobTypeDisplayRow[],
        isNewFormat: false,
      };
    } catch {
      return { rows: [] as MarketPriceTableRow[], jobTypeRows: [] as JobTypeDisplayRow[], isNewFormat: false };
    }
  });

  return {
    loading: false,
    error: hasCachedData ? null : "Comparaison de prix en attente",
    rows: result.rows,
    jobTypeRows: result.jobTypeRows,
    isNewFormat: result.isNewFormat,
  };
};
