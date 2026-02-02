import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// ========================================
// TYPES - CONTRAT API N8N STRICT
// ========================================

export interface TravauxItem {
  libelle: string;
  categorie?: string;
  montant_ht?: number;
  quantite?: number;
  unite?: string;
  zone_type?: string;
}

export interface MarketPriceLine {
  job_type: string;
  label_raw: string;
  qty: number | null;
  unit: string;
  confidence: number;
  evidence: string;
  needs_user_qty: boolean;
  price_min_unit_ht: number;
  price_avg_unit_ht: number;
  price_max_unit_ht: number;
  fixed_min_ht: number;
  fixed_avg_ht: number;
  fixed_max_ht: number;
  line_total_min: number;
  line_total_avg: number;
  line_total_max: number;
}

// CONTRAT API N8N - structure exacte de la réponse
export interface N8NApiResponse {
  ok: boolean;
  currency: string;
  source: string;
  customer?: {
    name: string;
    address: string;
  };
  total_min: number;
  total_avg: number;
  total_max: number;
  qty_total: number | null;
  qty_by_job_type: Record<string, number>;
  needs_user_qty: boolean;
  lines: MarketPriceLine[];
  warnings: string[];
  errors?: string[];
}

export interface MarketPriceResult {
  // Totaux directs de l'API - JAMAIS recalculés
  totalMin: number;
  totalAvg: number;
  totalMax: number;
  // Quantités de l'API
  qtyTotal: number | null;
  qtyByJobType: Record<string, number>;
  needsUserQty: boolean;
  // Lignes détaillées
  lines: MarketPriceLine[];
  // Warnings de l'API
  warnings: string[];
  // Métadonnées
  source: string;
  currency: string;
}

export interface MarketPriceDebug {
  apiUrl: string | null;
  apiParams: Record<string, unknown> | null;
  apiResponse: unknown;
  error: string | null;
}

export interface UseMarketPriceAPIParams {
  workType?: string;
  codePostal?: string;
  filePath?: string; // Path to PDF in Supabase storage for multipart upload
  enabled?: boolean;
}

// ========================================
// MAIN HOOK - API DRIVEN ONLY
// ========================================

export const useMarketPriceAPI = ({
  workType,
  codePostal,
  filePath,
  enabled = true,
}: UseMarketPriceAPIParams) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MarketPriceResult | null>(null);
  const [debug, setDebug] = useState<MarketPriceDebug>({
    apiUrl: null,
    apiParams: null,
    apiResponse: null,
    error: null,
  });

  useEffect(() => {
    if (!enabled || !filePath) {
      setResult(null);
      setDebug({ apiUrl: null, apiParams: null, apiResponse: null, error: !enabled ? "disabled" : "no_file_path" });
      return;
    }

    const fetchMarketPrice = async () => {
      setLoading(true);
      setError(null);
      
      const newDebug: MarketPriceDebug = {
        apiUrl: null,
        apiParams: null,
        apiResponse: null,
        error: null,
      };
      
      try {
        const apiUrl = "https://n8n.messagingme.app/webhook/d1cfedb7-0ebb-44ca-bb2b-543ee84b0075";
        
        // Params envoyés à n8n
        const formDataFields: Record<string, unknown> = {
          job_type: workType || "",
          zip: codePostal || "",
          qty: 1, // Envoi qty=1, n8n calcule les totaux depuis le PDF
        };
        
        newDebug.apiUrl = apiUrl;
        newDebug.apiParams = formDataFields;
        
        // Use multipart/form-data with file
        const requestBody = {
          url: apiUrl,
          method: "POST",
          formDataFields,
          filePath, // PDF pour multipart upload
        };
        
        console.log("[useMarketPriceAPI] Envoi requête n8n:", requestBody);
        
        const { data, error: fnError } = await supabase.functions.invoke("test-webhook", {
          body: requestBody,
        });
        
        newDebug.apiResponse = data;
        
        if (fnError) {
          throw new Error(fnError.message || "Erreur lors de l'appel API");
        }

        if (!data?.success) {
          throw new Error(data?.error || "L'API a retourné une erreur");
        }

        const apiResponse = data.data as N8NApiResponse;
        console.log("[useMarketPriceAPI] Réponse n8n:", apiResponse);
        
        // Validation stricte du contrat API
        if (!apiResponse || apiResponse.ok !== true) {
          const errorMsg = apiResponse?.errors?.join(", ") || "Réponse API invalide";
          throw new Error(errorMsg);
        }
        
        // Vérifier présence des totaux obligatoires
        if (apiResponse.total_min === undefined || 
            apiResponse.total_avg === undefined || 
            apiResponse.total_max === undefined) {
          throw new Error("Totaux manquants dans la réponse API");
        }
        
        // RENDU DIRECT des données API - AUCUN recalcul
        setResult({
          totalMin: Number(apiResponse.total_min),
          totalAvg: Number(apiResponse.total_avg),
          totalMax: Number(apiResponse.total_max),
          qtyTotal: apiResponse.qty_total !== undefined ? Number(apiResponse.qty_total) : null,
          qtyByJobType: apiResponse.qty_by_job_type || {},
          needsUserQty: apiResponse.needs_user_qty === true,
          lines: Array.isArray(apiResponse.lines) ? apiResponse.lines : [],
          warnings: Array.isArray(apiResponse.warnings) ? apiResponse.warnings : [],
          source: apiResponse.source || "n8n",
          currency: apiResponse.currency || "EUR",
        });
        setDebug(newDebug);
        
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
  }, [workType, codePostal, filePath, enabled]);

  return {
    loading,
    error,
    result,
    debug,
  };
};
