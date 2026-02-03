import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// ========================================
// CONTRAT API N8N STRICT - VERSION DÉFINITIVE
// ========================================
// Le front n'a PAS le droit de calculer ou deviner des prix.
// Toutes les valeurs affichées DOIVENT venir directement de l'API.

/**
 * Réponse brute du webhook n8n
 * Champs obligatoires: ok
 * Champs de prix: total_min_ht, total_avg_ht, total_max_ht (tous en HT)
 */
export interface N8NApiResponse {
  ok: boolean;
  comparable?: boolean;
  currency?: string;
  source?: string;
  message?: string;
  suggestion?: string;
  
  // Prix en HT - SEULS champs autorisés pour l'affichage
  total_min_ht?: number | null;
  total_avg_ht?: number | null;
  total_max_ht?: number | null;
  
  // Quantité et unité
  qty_total?: number | null;
  unit?: string | null;
  label?: string | null;
  
  // Warnings de l'API
  warnings?: string[];
  
  // Détails supplémentaires (optionnel)
  details?: {
    montant_devis_ht?: number | null;
    [key: string]: unknown;
  };
  
  // Erreurs
  errors?: string[];
}

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
    httpStatus: null,
    apiResponse: null,
    valuesRead: null,
    error: null,
  });

  useEffect(() => {
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
        
        // DEV ONLY: Log de la requête
        if (import.meta.env.DEV) {
          console.log("[useMarketPriceAPI] Envoi requête n8n:", requestBody);
        }
        
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

        const apiResponse = data.data as N8NApiResponse;
        
        // DEV ONLY: Log de la réponse
        if (import.meta.env.DEV) {
          console.log("[useMarketPriceAPI] HTTP status:", data.status);
          console.log("[useMarketPriceAPI] Body JSON reçu:", apiResponse);
        }
        
        // Validation: ok doit être true
        if (apiResponse.ok !== true) {
          // Non comparable ou erreur
          setResult({
            ok: false,
            comparable: apiResponse.comparable ?? false,
            totalMinHT: null,
            totalAvgHT: null,
            totalMaxHT: null,
            qtyTotal: null,
            unit: null,
            label: null,
            montantDevisHT: null,
            warnings: Array.isArray(apiResponse.warnings) ? apiResponse.warnings : [],
            message: apiResponse.message || null,
            suggestion: apiResponse.suggestion || null,
            source: apiResponse.source || "n8n",
            currency: apiResponse.currency || "EUR",
          });
          
          newDebug.valuesRead = {
            total_min_ht: null,
            total_avg_ht: null,
            total_max_ht: null,
            qty_total: null,
            unit: null,
            label: null,
          };
          setDebug(newDebug);
          return;
        }
        
        // Extraction STRICTE des champs - AUCUNE transformation ou calcul
        const totalMinHT = apiResponse.total_min_ht !== undefined && apiResponse.total_min_ht !== null 
          ? Number(apiResponse.total_min_ht) 
          : null;
        const totalAvgHT = apiResponse.total_avg_ht !== undefined && apiResponse.total_avg_ht !== null 
          ? Number(apiResponse.total_avg_ht) 
          : null;
        const totalMaxHT = apiResponse.total_max_ht !== undefined && apiResponse.total_max_ht !== null 
          ? Number(apiResponse.total_max_ht) 
          : null;
        const qtyTotal = apiResponse.qty_total !== undefined && apiResponse.qty_total !== null 
          ? Number(apiResponse.qty_total) 
          : null;
        const unit = apiResponse.unit || null;
        const label = apiResponse.label || null;
        
        // Montant du devis HT depuis details (si fourni par l'API)
        const montantDevisHT = apiResponse.details?.montant_devis_ht !== undefined 
          && apiResponse.details?.montant_devis_ht !== null
          ? Number(apiResponse.details.montant_devis_ht)
          : null;
        
        // DEV ONLY: Log des valeurs lues
        if (import.meta.env.DEV) {
          console.log("[useMarketPriceAPI] Valeurs lues:", {
            total_min_ht: totalMinHT,
            total_avg_ht: totalAvgHT,
            total_max_ht: totalMaxHT,
            qty_total: qtyTotal,
            unit,
            label,
          });
        }
        
        newDebug.valuesRead = {
          total_min_ht: totalMinHT,
          total_avg_ht: totalAvgHT,
          total_max_ht: totalMaxHT,
          qty_total: qtyTotal,
          unit,
          label,
        };
        
        // RENDU DIRECT - AUCUN recalcul
        setResult({
          ok: true,
          comparable: apiResponse.comparable ?? true,
          totalMinHT,
          totalAvgHT,
          totalMaxHT,
          qtyTotal,
          unit,
          label,
          montantDevisHT,
          warnings: Array.isArray(apiResponse.warnings) ? apiResponse.warnings : [],
          message: apiResponse.message || null,
          suggestion: apiResponse.suggestion || null,
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
