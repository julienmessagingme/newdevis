import { useState } from "react";
import { cleanJobTypeLabel, detectRoomMismatch, type HomogeneityGroupInput } from "@/lib/analyse/groupHomogeneity";

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
  /** True when the group is a lump-sum / forfait — price comparison is indicative only */
  isForfait: boolean;
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
// FORFAIT DETECTION
// ========================================

const FORFAIT_UNIT_KEYWORDS = ["forfait", "global", "prestation", "ensemble", "installation complète"];
const FORFAIT_DESC_KEYWORDS = ["forfait", "forfait global", "prestation globale", "au forfait", "tout compris"];

// NEW — detect custom / bespoke work that makes unit-price comparison unreliable
const CUSTOM_WORK_KEYWORDS = ["sur mesure", "fabrication sur mesure", "fabriqué sur mesure", "fabrication et pose", "fabrication & pose"];

function detectForfait(item: {
  main_unit?: string;
  devis_lines?: Array<{ description?: string; unit?: string | null }>;
}): boolean {
  // 1. Unit declared by Gemini or the catalog is explicitly "forfait"
  const unit = (item.main_unit || "").toLowerCase().trim();
  if (FORFAIT_UNIT_KEYWORDS.some((kw) => unit === kw || unit.startsWith(kw))) return true;

  // 2. Majority of devis lines carry forfait-like description or unit
  const lines = item.devis_lines || [];
  if (lines.length === 0) return false;
  const forfaitLines = lines.filter((l) => {
    const desc = (l.description || "").toLowerCase();
    const lineUnit = (l.unit || "").toLowerCase();
    return (
      FORFAIT_DESC_KEYWORDS.some((kw) => desc.includes(kw)) ||
      FORFAIT_UNIT_KEYWORDS.some((kw) => lineUnit === kw || lineUnit.startsWith(kw))
    );
  });
  if (forfaitLines.length >= Math.ceil(lines.length * 0.6)) return true;

  // 3. Description of any line explicitly mentions custom fabrication / bespoke work
  const allDescs = (item.devis_lines || []).map((l: any) => (l.description || "").toLowerCase());
  const hasCustomWork = allDescs.some((d: string) =>
    CUSTOM_WORK_KEYWORDS.some((kw) => d.includes(kw))
  );
  if (hasCustomWork) return true;

  return false;
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

// V3.4.12 (2026-05-13) — Patterns de lignes récapitulatives à filtrer côté front.
// Couvre les analyses existantes (avant le fix server V3.4.11) en DB qui
// contenaient ces lignes dans `analysis_work_items`.
const RECAP_LINE_PATTERNS: RegExp[] = [
  /^montant\s+(total|sous[- ]?total|tva|ht|ttc|acompte|solde|net|brut)/i,
  /^(total|sous[- ]?total)\s*(ht|ttc|tva|général|general)?\s*:?$/i,
  /^tva(\s|$|:|\s+\d)/i,
  /^(montant\s+)?net\s+(a|à)\s+payer/i,
  /^(remise|rabais|ristourne|escompte)\b/i,
  /^(prime|aide)\s+(cee|effy|maprime|anah)/i,
  /^(reste|montant)\s+(a|à)\s+(facturer|r[ée]gler|payer)/i,
  /^(versement|paiement|acompte)\s+(à|a|au|de|du)/i,
];

function isRecapLineDescription(desc: string | undefined | null): boolean {
  if (!desc) return false;
  const trimmed = String(desc).trim();
  return RECAP_LINE_PATTERNS.some(p => p.test(trimmed));
}

export function processJobTypes(data: unknown): JobTypeDisplayRow[] {
  if (!data || !Array.isArray(data)) return [];

  const rows: JobTypeDisplayRow[] = [];

  for (const item of data) {
    // V3.4.12 (2026-05-13) — Filtre des LIGNES récap au sein du groupe.
    // Couvre les anciennes analyses (pré V3.4.11) où Gemini avait inclus
    // "Montant Total HT", "Montant TVA", "Montant TTC" comme lignes devis.
    // Ces 3 lignes sommées = 2× le total réel → affichage absurde "11 294 €"
    // sur un devis à 5 647 €.
    if (Array.isArray(item.devis_lines)) {
      const cleanedLines = item.devis_lines.filter(
        (l: { description?: string }) => !isRecapLineDescription(l?.description)
      );
      if (cleanedLines.length !== item.devis_lines.length) {
        // Recompute devis_total_ht as the sum of remaining lines' amount_ht
        const recomputedTotal = cleanedLines.reduce(
          (sum: number, l: { amount_ht?: number | null }) =>
            sum + (typeof l.amount_ht === "number" ? l.amount_ht : 0),
          0,
        );
        item.devis_lines = cleanedLines;
        // Override devis_total_ht only if at least one line was dropped AND
        // recomputed total is plausible (> 0). Sinon laisse l'original (cas edge).
        if (recomputedTotal > 0) {
          item.devis_total_ht = recomputedTotal;
        } else {
          // Plus aucune ligne valable → marquer comme groupe vide pour skip downstream
          item.devis_total_ht = null;
        }
      }
    }

    // V3.4.10 (2026-05-13) — Filtre des groupes hallucinés.
    // Observé sur "devis maitre d oeuvre.pdf" : Gemini a inventé 3 groupes
    // ("Local technique piscine", "Rénovation électricité 80m²") avec
    // devis_total_ht=null et aucune ligne devis correspondante, mais des
    // fourchettes marché renvoyées par le catalogue. Affichage absurde
    // sur la page (Devis : —, Marché : 1 625-3 375 €) qui décrédibilise
    // l'analyse.
    //
    // Critère : un groupe SANS montant devis ET SANS aucune ligne devis
    // avec amount_ht > 0 est une hallucination → skip silencieux.
    const rawDevisLines: Array<{ amount_ht?: number | null }> = item.devis_lines || [];
    const hasDevisAmount = typeof item.devis_total_ht === "number" && item.devis_total_ht > 0;
    const hasDevisLines  = rawDevisLines.length > 0 && rawDevisLines.some(
      (l) => typeof l.amount_ht === "number" && l.amount_ht > 0,
    );
    if (!hasDevisAmount && !hasDevisLines) {
      continue;
    }

    const prices: N8NPriceLine[] = item.prices || [];

    // Start with Gemini's main_quantity
    let mainQuantity = typeof item.main_quantity === "number" && item.main_quantity > 0
      ? item.main_quantity : 1;

    // Auto-recompute from devis lines when multiple lines share the same unit.
    // Corrects analyses where Gemini returned main_quantity=1 for groups with several unit-based
    // lines (e.g., 3 volets roulants each with qty=1 → should give mainQuantity=3, not 1).
    const rawLines: Array<{ quantity?: number | null; unit?: string | null }> = item.devis_lines || [];
    const linesWithQty = rawLines.filter(
      (l) => l.quantity !== null && l.quantity !== undefined && (l.quantity as number) > 0 && l.unit,
    );
    if (linesWithQty.length > 1) {
      const uniqueUnits = new Set(linesWithQty.map((l) => l.unit));
      if (uniqueUnits.size === 1) {
        const sumQty = linesWithQty.reduce((sum, l) => sum + ((l.quantity as number) || 0), 0);
        if (sumQty > 0) {
          mainQuantity = sumQty;
        }
      }
    }

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
    const isForfait = detectForfait(item);

    // V3.4.24 (2026-05-21) — Filtre des groupes massivement hallucinés.
    // Cas d'origine "devis placo TCE" : Gemini a inventé un groupe "Peinture
    // salle de bain (pièce)" auquel il a attribué TOUTES les sections par pièce
    // du devis (Couloir 720€ + SDB 900€ + Chambre 1350€ + Salon 3630€ + …) =
    // 26 040 € pour 13 « unités », alors que le marché de la peinture SDB est
    // 330-870 €/pièce. Le groupe halluciné fausse la pastille de répartition,
    // peut faire basculer le verdict, et choque visuellement l'utilisateur.
    //
    // Heuristique conservative — on ne filtre QUE quand TOUS ces signaux sont
    // présents simultanément (très peu de faux positifs) :
    //   - `theoreticalMaxHT > 0` (on a un catalogue de comparaison)
    //   - `devis_total_ht / theoreticalMaxHT > 8` (extrêmement au-dessus du
    //     marché — un vrai surcoût atteint 1.5-3×, pas 8×)
    //   - `devis_lines.length >= 5` (groupe avec plusieurs lignes — un poste
    //     isolé légitimement cher ne déclenche pas)
    //   - `mainQuantity <= devis_lines.length` (l'agrégation a probablement
    //     pris le nb de pièces comme « unité » alors que c'est la cardinalité
    //     du regroupement halluciné)
    //
    // Action : skip silencieux du groupe ET log warning pour audit.
    // Le poste réel sera quand même visible dans les autres groupes (celui-ci
    // double-comptait des lignes déjà classées correctement ailleurs).
    const rawDevisLinesCount = Array.isArray(item.devis_lines) ? item.devis_lines.length : 0;
    if (
      theoreticalMaxHT > 0 &&
      typeof devisTotalHT === "number" &&
      devisTotalHT > theoreticalMaxHT * 8 &&
      rawDevisLinesCount >= 5 &&
      mainQuantity <= rawDevisLinesCount &&
      !isForfait
    ) {
      console.warn(
        `[V3.4.24] groupe halluciné filtré — "${item.job_type_label ?? "?"}" : ` +
          `devis_total=${devisTotalHT} € vs marché_max=${theoreticalMaxHT.toFixed(0)} € ` +
          `(ratio ${(devisTotalHT / theoreticalMaxHT).toFixed(1)}×, ${rawDevisLinesCount} lignes, ` +
          `main_qty=${mainQuantity})`,
      );
      continue;
    }

    // No verdict if no catalog prices matched
    // For forfait groups: keep vsAvgPct for the gauge but override the label
    let { verdict, vsAvgPct } = prices.length > 0
      ? computeVerdict(devisTotalHT, theoreticalAvgHT)
      : { verdict: null, vsAvgPct: null };

    if (isForfait && verdict !== null) {
      verdict = "Comparaison indicative";
    }

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

    // V3.4.5 — Détection room mismatch : si le job_type_label contient une pièce
    // qui n'apparaît dans AUCUNE description, on (a) nettoie le label affiché,
    // (b) force le verdict en "Comparaison indicative" car la fourchette marché
    // utilisée est probablement celle d'une autre pièce (≠ travaux réels).
    const homogeneityInput: HomogeneityGroupInput = {
      job_type_label: item.job_type_label,
      devis_lines: (item.devis_lines || []).map((l: { description?: string; amount_ht?: number | null }) => ({
        description: l.description,
        amount_ht: typeof l.amount_ht === "number" ? l.amount_ht : undefined,
      })),
    };
    const rawLabel = item.job_type_label || "Sans catégorie";
    const cleanedLabel = cleanJobTypeLabel(rawLabel, homogeneityInput);
    const hasRoomMismatch = detectRoomMismatch(homogeneityInput) !== null;
    if (hasRoomMismatch && verdict !== null) {
      verdict = "Comparaison indicative";
    }

    rows.push({
      jobTypeLabel: cleanedLabel,
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
      isForfait,
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
