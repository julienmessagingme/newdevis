import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// Mapping des catégories de devis vers les job_types de l'API n8n
const CATEGORY_TO_JOB_TYPE: Record<string, string> = {
  // Peinture
  "peinture": "peinture_murs",
  "peinture murs": "peinture_murs",
  "peinture murale": "peinture_murs",
  "peinture plafond": "peinture_plafond",
  "peinture_murs": "peinture_murs",
  "peinture_plafond": "peinture_plafond",
  
  // Sols
  "carrelage": "carrelage_sol",
  "carrelage sol": "carrelage_sol",
  "carrelage_sol": "carrelage_sol",
  "parquet": "parquet_flottant",
  "parquet flottant": "parquet_flottant",
  "parquet_flottant": "parquet_flottant",
  
  // Terrassement
  "terrassement": "demolition",
  "démolition": "demolition",
  "demolition": "demolition",
  "terrassement / vrd": "demolition",
  
  // Enduit
  "enduit": "enduit_lissage",
  "enduit lissage": "enduit_lissage",
  "enduit_lissage": "enduit_lissage",
  "lissage": "enduit_lissage",
};

// Mapping depuis work_type (format "categorie:sous_type")
const WORK_TYPE_TO_JOB_TYPE: Record<string, string> = {
  "interieur:peinture_murs": "peinture_murs",
  "interieur:peinture_plafond": "peinture_plafond",
  "interieur:carrelage_sol": "carrelage_sol",
  "interieur:parquet_flottant": "parquet_flottant",
  "interieur:enduit_lissage": "enduit_lissage",
  "interieur:demolition": "demolition",
  "exterieur:terrassement": "demolition",
};

export interface TravauxItem {
  libelle: string;
  categorie?: string;
  montant_ht?: number;
  quantite?: number;
  unite?: string;
  zone_type?: string;
}

export interface MarketPriceResult {
  prixMini: number;
  prixAvg: number;
  prixMax: number;
  minTotal: number;
  avgTotal: number;
  maxTotal: number;
  surface: number;
  jobType: string;
  jobTypeLabel: string;
}

export interface UseMarketPriceAPIParams {
  typesTravaux?: TravauxItem[];
  workType?: string;
  codePostal?: string;
  enabled?: boolean;
}

/**
 * Extrait le job_type depuis les données du devis
 */
const extractJobType = (typesTravaux?: TravauxItem[], workType?: string): string | null => {
  // Priorité 1: work_type sélectionné par l'utilisateur
  if (workType) {
    const mapped = WORK_TYPE_TO_JOB_TYPE[workType.toLowerCase()];
    if (mapped) return mapped;
  }
  
  // Priorité 2: catégories des lignes de travaux
  if (typesTravaux && typesTravaux.length > 0) {
    for (const travail of typesTravaux) {
      const categorie = travail.categorie?.toLowerCase();
      if (categorie) {
        const mapped = CATEGORY_TO_JOB_TYPE[categorie];
        if (mapped) return mapped;
      }
      
      // Chercher dans le libellé
      const libelle = travail.libelle?.toLowerCase();
      if (libelle) {
        for (const [key, value] of Object.entries(CATEGORY_TO_JOB_TYPE)) {
          if (libelle.includes(key)) return value;
        }
      }
    }
  }
  
  return null;
};

/**
 * Extrait la surface totale (m²) depuis les lignes du devis
 */
const extractSurface = (typesTravaux?: TravauxItem[]): number | null => {
  if (!typesTravaux || typesTravaux.length === 0) return null;
  
  // Chercher les lignes avec unité m² ou M²
  const surfaceLines = typesTravaux.filter(t => 
    t.unite?.toLowerCase() === 'm²' || 
    t.unite?.toLowerCase() === 'm2' ||
    t.unite?.toUpperCase() === 'M²'
  );
  
  if (surfaceLines.length === 0) return null;
  
  // Prendre la plus grande surface (souvent la surface principale)
  const maxSurface = Math.max(...surfaceLines.map(t => t.quantite || 0));
  
  // Si pas de quantité individuelle, essayer de sommer
  if (maxSurface <= 0) {
    const totalSurface = surfaceLines.reduce((sum, t) => sum + (t.quantite || 0), 0);
    return totalSurface > 0 ? totalSurface : null;
  }
  
  return maxSurface > 0 ? maxSurface : null;
};

/**
 * Retourne le label français pour un job_type
 */
const getJobTypeLabel = (jobType: string): string => {
  const labels: Record<string, string> = {
    "peinture_murs": "Peinture murs",
    "peinture_plafond": "Peinture plafond",
    "carrelage_sol": "Carrelage sol",
    "parquet_flottant": "Parquet flottant",
    "demolition": "Démolition",
    "enduit_lissage": "Enduit lissage",
  };
  return labels[jobType] || jobType;
};

/**
 * Hook pour appeler l'API n8n et récupérer les prix marché
 */
export const useMarketPriceAPI = ({
  typesTravaux,
  workType,
  codePostal,
  enabled = true,
}: UseMarketPriceAPIParams) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MarketPriceResult | null>(null);
  const [extractedJobType, setExtractedJobType] = useState<string | null>(null);
  const [extractedSurface, setExtractedSurface] = useState<number | null>(null);

  useEffect(() => {
    const jobType = extractJobType(typesTravaux, workType);
    const surface = extractSurface(typesTravaux);
    
    setExtractedJobType(jobType);
    setExtractedSurface(surface);
    
    // Ne pas appeler l'API si désactivé ou données manquantes
    if (!enabled || !jobType || !surface || surface <= 0) {
      setResult(null);
      return;
    }

    const fetchMarketPrice = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const baseUrl = "https://n8n.messagingme.app/webhook/d1cfedb7-0ebb-44ca-bb2b-543ee84b0075";
        const queryParams = new URLSearchParams({
          job_type: jobType,
          surface: surface.toString(),
          zip: codePostal || "",
        }).toString();
        
        const { data, error: fnError } = await supabase.functions.invoke("test-webhook", {
          body: {
            url: `${baseUrl}?${queryParams}`,
            method: "GET",
          },
        });
        
        if (fnError) {
          throw new Error(fnError.message || "Erreur lors de l'appel API");
        }

        if (!data?.success) {
          throw new Error(data?.error || "L'API a retourné une erreur");
        }

        // Parse response avec clés françaises
        const apiResponse = data.data;
        
        if (apiResponse && typeof apiResponse === "object" && 
            apiResponse["prix mini"] !== undefined &&
            apiResponse["prix avg"] !== undefined &&
            apiResponse["prix max"] !== undefined) {
          
          const prixMini = Number(apiResponse["prix mini"]);
          const prixAvg = Number(apiResponse["prix avg"]);
          const prixMax = Number(apiResponse["prix max"]);
          
          setResult({
            prixMini,
            prixAvg,
            prixMax,
            minTotal: prixMini * surface,
            avgTotal: prixAvg * surface,
            maxTotal: prixMax * surface,
            surface,
            jobType,
            jobTypeLabel: getJobTypeLabel(jobType),
          });
        } else {
          throw new Error("Prix marché indisponible pour ce type de travaux");
        }
      } catch (err) {
        console.error("Market price API error:", err);
        setError(err instanceof Error ? err.message : "Prix marché indisponible");
      } finally {
        setLoading(false);
      }
    };

    fetchMarketPrice();
  }, [typesTravaux, workType, codePostal, enabled]);

  return {
    loading,
    error,
    result,
    extractedJobType,
    extractedSurface,
  };
};
