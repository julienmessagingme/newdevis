import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// ========================================
// CONTRAT API N8N STRICT - VERSION DÉFINITIVE
// ========================================
// Le front n'a PAS le droit de calculer ou deviner des prix.
// Toutes les valeurs affichées DOIVENT venir directement de l'API.

/**
 * Réponse brute du webhook n8n
 * N8N renvoie un TABLEAU d'objets. On utilise le premier élément.
 * Champs de prix: total_min_ht, total_avg_ht, total_max_ht (tous en HT)
 */
export interface N8NApiResponseItem {
  row_number?: number;
  job_type?: string;
  comparable?: boolean;
  currency?: string;
  source?: string;
  message?: string;
  suggestion?: string;

  // Prix unitaires HT
  price_min_unit_ht?: number | null;
  price_avg_unit_ht?: number | null;
  price_max_unit_ht?: number | null;

  // Prix fixes HT
  fixed_min_ht?: number | null;
  fixed_avg_ht?: number | null;
  fixed_max_ht?: number | null;

  // Prix totaux HT - SEULS champs autorisés pour l'affichage
  total_min_ht?: number | null;
  total_avg_ht?: number | null;
  total_max_ht?: number | null;

  // Quantité et unité
  qty_total?: number | null;
  unit?: string | null;
  label?: string | null;
  zip_scope?: string;
  notes?: string;

  // Analyse du devis
  analysis?: {
    devis_ht?: number | null;
    price_position?: string | null;
    price_note?: string | null;
  };

  // Warnings de l'API
  warnings?: string[];

  // Erreurs
  errors?: string[];
}

/** La réponse peut être un tableau ou un objet unique */
export type N8NApiResponse = N8NApiResponseItem[] | N8NApiResponseItem;

/**
 * Résultat transformé pour le composant UI
 * Respect strict: on ne fait AUCUN calcul, on passe les valeurs telles quelles
 */
export interface MarketPriceResult {
  // Status
  ok: boolean;
  comparable: boolean;
  
  // Prix HT - AUCUN recalcul autorisé
  totalMinHT: number | null;
  totalAvgHT: number | null;
  totalMaxHT: number | null;
  
  // Quantité/unité de l'API
  qtyTotal: number | null;
  unit: string | null;
  label: string | null;
  
  // Montant du devis HT (si fourni par l'API dans details)
  montantDevisHT: number | null;
  
  // Warnings
  warnings: string[];
  
  // Message d'info (si non comparable)
  message: string | null;
  suggestion: string | null;
  
  // Métadonnées
  source: string;
  currency: string;
}

export interface MarketPriceDebug {
  apiUrl: string | null;
  apiParams: Record<string, unknown> | null;
  httpStatus: number | null;
  apiResponse: unknown;
  valuesRead: {
    total_min_ht: number | null;
    total_avg_ht: number | null;
    total_max_ht: number | null;
    qty_total: number | null;
    unit: string | null;
    label: string | null;
  } | null;
  error: string | null;
}

export interface UseMarketPriceAPIParams {
  workType?: string;
  codePostal?: string;
  filePath?: string;
  enabled?: boolean;
  cachedN8NData?: unknown;
}

// ========================================
// PROCESS N8N ITEM - shared logic for cached & live data
// ========================================

function processN8NItem(
  rawResponse: N8NApiResponse,
  debugObj: MarketPriceDebug,
): { result: MarketPriceResult; debug: MarketPriceDebug } {
  // N8N renvoie un tableau — on prend le premier élément
  const item: N8NApiResponseItem | undefined = Array.isArray(rawResponse)
    ? rawResponse[0]
    : rawResponse;

  // Validation: réponse vide ou non comparable
  if (!item || item.comparable === false) {
    debugObj.valuesRead = {
      total_min_ht: null,
      total_avg_ht: null,
      total_max_ht: null,
      qty_total: null,
      unit: null,
      label: null,
    };
    return {
      result: {
        ok: false,
        comparable: false,
        totalMinHT: null,
        totalAvgHT: null,
        totalMaxHT: null,
        qtyTotal: null,
        unit: null,
        label: null,
        montantDevisHT: null,
        warnings: Array.isArray(item?.warnings) ? item.warnings : [],
        message: item?.message || null,
        suggestion: item?.suggestion || null,
        source: item?.source || "n8n",
        currency: item?.currency || "EUR",
      },
      debug: debugObj,
    };
  }

  // Extraction STRICTE des champs - AUCUNE transformation ou calcul
  const totalMinHT = item.total_min_ht !== undefined && item.total_min_ht !== null
    ? Number(item.total_min_ht)
    : null;
  const totalAvgHT = item.total_avg_ht !== undefined && item.total_avg_ht !== null
    ? Number(item.total_avg_ht)
    : null;
  const totalMaxHT = item.total_max_ht !== undefined && item.total_max_ht !== null
    ? Number(item.total_max_ht)
    : null;
  const qtyTotal = item.qty_total !== undefined && item.qty_total !== null
    ? Number(item.qty_total)
    : null;
  const unit = item.unit || null;
  const label = item.label || null;

  // Montant du devis HT depuis analysis.devis_ht (format réel N8N)
  const montantDevisHT = item.analysis?.devis_ht !== undefined
    && item.analysis?.devis_ht !== null
    ? Number(item.analysis.devis_ht)
    : null;

  debugObj.valuesRead = {
    total_min_ht: totalMinHT,
    total_avg_ht: totalAvgHT,
    total_max_ht: totalMaxHT,
    qty_total: qtyTotal,
    unit,
    label,
  };

  return {
    result: {
      ok: true,
      comparable: item.comparable ?? true,
      totalMinHT,
      totalAvgHT,
      totalMaxHT,
      qtyTotal,
      unit,
      label,
      montantDevisHT,
      warnings: Array.isArray(item.warnings) ? item.warnings : [],
      message: item.message || null,
      suggestion: item.suggestion || null,
      source: item.source || "n8n",
      currency: item.currency || "EUR",
    },
    debug: debugObj,
  };
}

// ========================================
// MAIN HOOK - API DRIVEN ONLY
// ========================================

export const useMarketPriceAPI = ({
  workType,
  codePostal,
  filePath,
  enabled = true,
  cachedN8NData,
}: UseMarketPriceAPIParams) => {
  // If cachedN8NData is available, start with loading=false (instant display)
  const hasCachedData = cachedN8NData !== undefined && cachedN8NData !== null;
  const [loading, setLoading] = useState(!hasCachedData && enabled && !!filePath);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MarketPriceResult | null>(() => {
    // Process cached data synchronously for immediate display
    if (hasCachedData) {
      try {
        const rawResponse = cachedN8NData as N8NApiResponse;
        const debugObj: MarketPriceDebug = {
          apiUrl: "cached_from_analyze_quote",
          apiParams: null,
          httpStatus: null,
          apiResponse: rawResponse,
          valuesRead: null,
          error: null,
        };
        const processed = processN8NItem(rawResponse, debugObj);
        return processed.result;
      } catch {
        // Fall through to null, will trigger live fetch
        return null;
      }
    }
    return null;
  });
  const [debug, setDebug] = useState<MarketPriceDebug>(() => {
    if (hasCachedData) {
      try {
        const rawResponse = cachedN8NData as N8NApiResponse;
        const debugObj: MarketPriceDebug = {
          apiUrl: "cached_from_analyze_quote",
          apiParams: null,
          httpStatus: null,
          apiResponse: rawResponse,
          valuesRead: null,
          error: null,
        };
        const processed = processN8NItem(rawResponse, debugObj);
        return processed.debug;
      } catch {
        return { apiUrl: null, apiParams: null, httpStatus: null, apiResponse: null, valuesRead: null, error: "cached_parse_failed" };
      }
    }
    return { apiUrl: null, apiParams: null, httpStatus: null, apiResponse: null, valuesRead: null, error: null };
  });

  useEffect(() => {
    // Skip live fetch if we have valid cached data
    if (hasCachedData) {
      return;
    }

    if (!enabled || !filePath) {
      setResult(null);
      setDebug({
        apiUrl: null,
        apiParams: null,
        httpStatus: null,
        apiResponse: null,
        valuesRead: null,
        error: !enabled ? "disabled" : "no_file_path"
      });
      return;
    }

    const fetchMarketPrice = async () => {
      setLoading(true);
      setError(null);

      const newDebug: MarketPriceDebug = {
        apiUrl: null,
        apiParams: null,
        httpStatus: null,
        apiResponse: null,
        valuesRead: null,
        error: null,
      };

      try {
        const apiUrl = "https://n8n.messagingme.app/webhook/d1cfedb7-0ebb-44ca-bb2b-543ee84b0075";

        // Paramètres envoyés à n8n via formDataFields
        const formDataFields: Record<string, unknown> = {
          job_type: workType || "",
          zip: codePostal || "",
          qty: 1, // Défaut, n8n calcule depuis le PDF
        };

        newDebug.apiUrl = apiUrl;
        newDebug.apiParams = formDataFields;

        // Appel via edge function (multipart/form-data avec PDF)
        const requestBody = {
          url: apiUrl,
          method: "POST",
          formDataFields,
          filePath,
        };

        const { data, error: fnError } = await supabase.functions.invoke("test-webhook", {
          body: requestBody,
        });

        newDebug.httpStatus = data?.status || null;
        newDebug.apiResponse = data?.data || data;

        if (fnError) {
          throw new Error(fnError.message || "Erreur lors de l'appel API");
        }

        if (!data?.success) {
          throw new Error(data?.error || "L'API a retourné une erreur");
        }

        const rawResponse = data.data as N8NApiResponse;

        const processed = processN8NItem(rawResponse, newDebug);
        setResult(processed.result);
        setDebug(processed.debug);

      } catch (err) {
        console.error("[useMarketPriceAPI] Error:", err);
        const errorMsg = err instanceof Error ? err.message : "Prix marché indisponible";
        setError(errorMsg);
        newDebug.error = errorMsg;
        setDebug(newDebug);
        setResult(null);
      } finally {
        setLoading(false);
      }
    };

    fetchMarketPrice();
  }, [workType, codePostal, filePath, enabled, hasCachedData]);

  return {
    loading,
    error,
    result,
    debug,
  };
};
