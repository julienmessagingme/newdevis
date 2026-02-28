import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { processJobTypes, type JobTypeDisplayRow } from "./useMarketPriceAPI";

interface MarketPriceOverrides {
  quantity_overrides: Record<string, number>;
  line_reassignments: Record<string, string>;
  validated_at: string;
}

interface UseMarketPriceEditorParams {
  analysisId: string | undefined;
  initialData: unknown;
  savedOverrides?: MarketPriceOverrides | null;
}

export interface UseMarketPriceEditorReturn {
  rows: JobTypeDisplayRow[];
  moveLineToJobType: (lineIndex: number, fromJobType: string, toJobType: string) => void;
  updateQuantity: (jobTypeLabel: string, qty: number) => void;
  isDirty: boolean;
  isValidated: boolean;
  validate: () => Promise<void>;
  saving: boolean;
  reset: () => void;
  editAssignment: () => void;
}

/**
 * Apply overrides (quantity changes and line reassignments) to raw API data,
 * then reprocess into display rows.
 */
function applyOverrides(
  rawData: unknown,
  overrides: MarketPriceOverrides | null,
): unknown {
  if (!overrides || !rawData || !Array.isArray(rawData)) return rawData;

  // Deep clone to avoid mutating the original
  const data = JSON.parse(JSON.stringify(rawData));

  // Apply quantity overrides
  for (const item of data) {
    const label = item.job_type_label;
    if (label && overrides.quantity_overrides[label] !== undefined) {
      item.main_quantity = overrides.quantity_overrides[label];
    }
  }

  // Apply line reassignments: move lines between job types
  for (const [lineIndexStr, targetJobType] of Object.entries(overrides.line_reassignments)) {
    const lineIndex = parseInt(lineIndexStr, 10);
    if (isNaN(lineIndex)) continue;

    let sourceLine = null;
    let sourceJobTypeIdx = -1;
    let sourceLineIdx = -1;

    // Find the line in its current job type
    for (let i = 0; i < data.length; i++) {
      const lines = data[i].devis_lines || [];
      for (let j = 0; j < lines.length; j++) {
        if (lines[j].index === lineIndex) {
          sourceLine = lines[j];
          sourceJobTypeIdx = i;
          sourceLineIdx = j;
          break;
        }
      }
      if (sourceLine) break;
    }

    if (!sourceLine || sourceJobTypeIdx === -1) continue;

    // Find target job type
    const targetIdx = data.findIndex((item: { job_type_label: string }) => item.job_type_label === targetJobType);
    if (targetIdx === -1 || targetIdx === sourceJobTypeIdx) continue;

    // Move line
    data[sourceJobTypeIdx].devis_lines.splice(sourceLineIdx, 1);
    data[targetIdx].devis_lines.push(sourceLine);

    // Recalculate devis_total_ht for both
    for (const idx of [sourceJobTypeIdx, targetIdx]) {
      const lines = data[idx].devis_lines || [];
      let total = 0;
      let hasAmount = false;
      for (const line of lines) {
        if (line.amount_ht !== null && line.amount_ht !== undefined) {
          total += line.amount_ht;
          hasAmount = true;
        }
      }
      data[idx].devis_total_ht = hasAmount ? total : null;
    }
  }

  return data;
}

export function useMarketPriceEditor({
  analysisId,
  initialData,
  savedOverrides,
}: UseMarketPriceEditorParams): UseMarketPriceEditorReturn {
  const rawDataRef = useRef(initialData);

  const [overrides, setOverrides] = useState<MarketPriceOverrides>(() => {
    if (savedOverrides) return savedOverrides;
    return {
      quantity_overrides: {},
      line_reassignments: {},
      validated_at: "",
    };
  });

  const [saving, setSaving] = useState(false);

  // isValidated: true if user already validated (saved with validated_at)
  // or if they just clicked validate in this session
  const [localValidated, setLocalValidated] = useState(
    () => !!savedOverrides?.validated_at
  );

  // Compute display rows from raw data + current overrides
  const hasOverrides = Object.keys(overrides.quantity_overrides).length > 0
    || Object.keys(overrides.line_reassignments).length > 0;

  const rows: JobTypeDisplayRow[] = (() => {
    const dataWithOverrides = hasOverrides
      ? applyOverrides(rawDataRef.current, overrides)
      : rawDataRef.current;
    return processJobTypes(dataWithOverrides);
  })();

  const isDirty = hasOverrides && overrides.validated_at === "";
  const isValidated = localValidated;

  const moveLineToJobType = useCallback((lineIndex: number, fromJobType: string, toJobType: string) => {
    if (fromJobType === toJobType) return;

    setOverrides((prev) => ({
      ...prev,
      line_reassignments: {
        ...prev.line_reassignments,
        [String(lineIndex)]: toJobType,
      },
      validated_at: "",
    }));
    setLocalValidated(false);
  }, []);

  const updateQuantity = useCallback((jobTypeLabel: string, qty: number) => {
    if (qty <= 0 || isNaN(qty)) return;

    setOverrides((prev) => ({
      ...prev,
      quantity_overrides: {
        ...prev.quantity_overrides,
        [jobTypeLabel]: qty,
      },
      validated_at: "",
    }));
    setLocalValidated(false);
  }, []);

  const validate = useCallback(async () => {
    if (!analysisId) {
      // No analysisId = just validate locally
      setLocalValidated(true);
      return;
    }

    setSaving(true);
    try {
      const toSave: MarketPriceOverrides = {
        ...overrides,
        validated_at: new Date().toISOString(),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("analyses") as any)
        .update({ market_price_overrides: toSave })
        .eq("id", analysisId);

      if (error) {
        console.error("[MarketPriceEditor] Save error:", error);
        toast.error("Erreur lors de la sauvegarde");
        return;
      }

      // Update price_observations with corrected data (batch in parallel)
      const correctedData = applyOverrides(rawDataRef.current, toSave);
      if (Array.isArray(correctedData)) {
        const updatePromises: Promise<unknown>[] = [];
        for (const jt of correctedData) {
          if (!jt.job_type_label || !jt.catalog_job_types?.length) continue;
          const lines = (jt.devis_lines || []).map((l: { description: string; amount_ht: number | null; quantity: number | null; unit: string | null }) => ({
            description: l.description,
            amount_ht: l.amount_ht,
            quantity: l.quantity,
            unit: l.unit,
          }));
          let totalHt: number | null = null;
          let hasAmount = false;
          for (const l of jt.devis_lines || []) {
            if (l.amount_ht != null) {
              totalHt = (totalHt || 0) + l.amount_ht;
              hasAmount = true;
            }
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          updatePromises.push(
            (supabase.from("price_observations") as any)
              .update({
                main_quantity: jt.main_quantity,
                devis_total_ht: hasAmount ? totalHt : jt.devis_total_ht,
                line_count: lines.length,
                devis_lines: lines,
              })
              .eq("analysis_id", analysisId)
              .eq("job_type_label", jt.job_type_label)
          );
        }
        await Promise.all(updatePromises);
      }

      setOverrides(toSave);
      setLocalValidated(true);
    } finally {
      setSaving(false);
    }
  }, [analysisId, overrides]);

  const reset = useCallback(() => {
    setOverrides({
      quantity_overrides: {},
      line_reassignments: {},
      validated_at: "",
    });
    setLocalValidated(false);
  }, []);

  const editAssignment = useCallback(() => {
    setLocalValidated(false);
  }, []);

  return {
    rows,
    moveLineToJobType,
    updateQuantity,
    isDirty,
    isValidated,
    validate,
    saving,
    reset,
    editAssignment,
  };
}
