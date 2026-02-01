import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// ========================================
// TYPES
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
  label: string;
  label_raw?: string;
  job_type?: string;
  qty?: number;
  unit?: string;
  unit_price_min?: number;
  unit_price_avg?: number;
  unit_price_max?: number;
  needs_user_qty?: boolean;
}

export interface MarketPriceResult {
  prixMini: number;
  prixAvg: number;
  prixMax: number;
  minTotal: number;
  avgTotal: number;
  maxTotal: number;
  multiplier: number;
  jobType: string;
  jobTypeLabel: string;
  unitLabel: string; // "m²" ou "unité"
  isUnitBased: boolean;
  // Nouveaux champs n8n pour gestion du warning quantité
  qtyTotal: number | null;
  needsUserQty: boolean;
  // Lignes détaillées pour calcul qty
  lines: MarketPriceLine[];
  // Warnings de l'API
  warnings: string[];
}

export interface MarketPriceDebug {
  jobTypeDetected: string | null;
  jobTypeSource: string;
  multiplier: number | null;
  multiplierSource: string;
  apiUrl: string | null;
  apiParams: Record<string, string> | null;
  apiResponse: unknown;
  error: string | null;
}

export interface UseMarketPriceAPIParams {
  typesTravaux?: TravauxItem[];
  rawText?: string;
  workType?: string;
  codePostal?: string;
  quoteTotalHt?: number;
  filePath?: string; // Path to PDF in Supabase storage for multipart upload
  enabled?: boolean;
}

// ========================================
// JOB TYPE CONFIGURATION
// ========================================

interface JobTypeConfig {
  key: string;
  label: string;
  isUnitBased: boolean;
  keywords: string[];
}

const JOB_TYPE_CONFIGS: JobTypeConfig[] = [
  // Unit-based (équipements)
  { key: "tablier_volet_roulant", label: "Tablier volet roulant", isUnitBased: true, keywords: ["tablier", "volet roulant", "lames volet"] },
  { key: "volet_roulant", label: "Volet roulant", isUnitBased: true, keywords: ["volet roulant", "volet électrique", "motorisation volet"] },
  { key: "fenetre", label: "Fenêtre", isUnitBased: true, keywords: ["fenêtre", "fenetre", "double vitrage", "menuiserie pvc", "menuiserie alu"] },
  { key: "porte", label: "Porte", isUnitBased: true, keywords: ["porte d'entrée", "porte entrée", "porte intérieure", "bloc porte"] },
  { key: "radiateur", label: "Radiateur", isUnitBased: true, keywords: ["radiateur", "convecteur", "chauffage électrique"] },
  { key: "portail", label: "Portail", isUnitBased: true, keywords: ["portail", "motorisation portail"] },
  { key: "pompe_chaleur", label: "Pompe à chaleur", isUnitBased: true, keywords: ["pompe à chaleur", "pac", "climatisation"] },
  { key: "chaudiere", label: "Chaudière", isUnitBased: true, keywords: ["chaudière", "chaudiere"] },
  { key: "ballon_eau_chaude", label: "Ballon eau chaude", isUnitBased: true, keywords: ["ballon", "chauffe-eau", "cumulus"] },
  
  // Surface-based (m²)
  { key: "peinture_murs", label: "Peinture murs", isUnitBased: false, keywords: ["peinture mur", "peinture murale", "peinture"] },
  { key: "peinture_plafond", label: "Peinture plafond", isUnitBased: false, keywords: ["peinture plafond"] },
  { key: "carrelage_sol", label: "Carrelage sol", isUnitBased: false, keywords: ["carrelage", "carrelage sol", "faïence", "ceramique"] },
  { key: "parquet_flottant", label: "Parquet flottant", isUnitBased: false, keywords: ["parquet", "parquet flottant", "sol stratifié"] },
  { key: "enduit_lissage", label: "Enduit lissage", isUnitBased: false, keywords: ["enduit", "lissage", "ragréage"] },
  { key: "demolition", label: "Démolition", isUnitBased: false, keywords: ["démolition", "demolition", "terrassement"] },
  { key: "isolation", label: "Isolation", isUnitBased: false, keywords: ["isolation", "laine de verre", "isolant"] },
  { key: "placo", label: "Placo / Cloison", isUnitBased: false, keywords: ["placo", "cloison", "placoplatre", "ba13"] },
];

// Mapping depuis work_type (format "categorie:sous_type")
const WORK_TYPE_TO_JOB_TYPE: Record<string, string> = {
  // Intérieur
  "interieur:peinture_murs": "peinture_murs",
  "interieur:peinture_plafond": "peinture_plafond",
  "interieur:carrelage_sol": "carrelage_sol",
  "interieur:carrelage_mural": "carrelage_sol",
  "interieur:parquet_flottant": "parquet_flottant",
  "interieur:enduit_lissage": "enduit_lissage",
  "interieur:demolition": "demolition",
  // Extérieur
  "exterieur:terrassement": "terrassement",
  "exterieur:allee_voirie": "allee_voirie",
  "exterieur:cloture": "cloture",
  "exterieur:portail": "portail",
  "exterieur:maconnerie_exterieure": "maconnerie_exterieure",
  // Menuiseries
  "menuiseries:volet_roulant": "volet_roulant",
  "menuiseries:fenetre": "fenetre",
  "menuiseries:porte": "porte",
  // Chauffage
  "chauffage:radiateur": "radiateur",
  "chauffage:pompe_chaleur": "pompe_chaleur",
  "chauffage:chaudiere": "chaudiere",
};

// ========================================
// DETECTION FUNCTIONS
// ========================================

/**
 * Détecte le job_type depuis les données du devis
 */
const detectJobType = (
  typesTravaux?: TravauxItem[], 
  rawText?: string,
  workType?: string
): { jobType: string | null; source: string } => {
  // Priorité 1: work_type sélectionné par l'utilisateur
  if (workType) {
    const mapped = WORK_TYPE_TO_JOB_TYPE[workType.toLowerCase()];
    if (mapped) {
      return { jobType: mapped, source: "work_type_user_selection" };
    }
  }
  
  // Priorité 2: Analyse du texte brut (rawText) pour patterns spécifiques
  const textToSearch = rawText?.toLowerCase() || "";
  
  for (const config of JOB_TYPE_CONFIGS) {
    for (const keyword of config.keywords) {
      if (textToSearch.includes(keyword.toLowerCase())) {
        return { jobType: config.key, source: `keyword_match: "${keyword}"` };
      }
    }
  }
  
  // Priorité 3: catégories des lignes de travaux
  if (typesTravaux && typesTravaux.length > 0) {
    for (const travail of typesTravaux) {
      const searchText = `${travail.categorie || ""} ${travail.libelle || ""}`.toLowerCase();
      
      for (const config of JOB_TYPE_CONFIGS) {
        for (const keyword of config.keywords) {
          if (searchText.includes(keyword.toLowerCase())) {
            return { jobType: config.key, source: `travaux_ligne: "${travail.libelle}"` };
          }
        }
      }
    }
  }
  
  return { jobType: null, source: "not_detected" };
};

/**
 * Obtient la configuration d'un job_type
 */
const getJobTypeConfig = (jobType: string): JobTypeConfig | undefined => {
  return JOB_TYPE_CONFIGS.find(c => c.key === jobType);
};

/**
 * Extraction qty pour équipements (volets, etc.)
 * Règle 1: Lignes de pose/installation
 * Règle 2: Comptage d'items
 * Règle 3: Fallback utilisateur
 */
const extractQuantityForUnits = (
  typesTravaux?: TravauxItem[],
  rawText?: string
): { qty: number | null; source: string } => {
  // Règle 1: Chercher lignes de pose/installation
  const poseKeywords = ["pose", "installation", "dépose", "remplacement", "main d'œuvre", "main d'oeuvre", "montage"];
  
  if (typesTravaux && typesTravaux.length > 0) {
    for (const travail of typesTravaux) {
      const libelleLower = travail.libelle?.toLowerCase() || "";
      
      // Vérifier si c'est une ligne de pose
      const isPoseLine = poseKeywords.some(kw => libelleLower.includes(kw));
      
      if (isPoseLine && travail.quantite && travail.quantite > 0) {
        return { qty: travail.quantite, source: `règle_1_pose_ligne: "${travail.libelle}"` };
      }
    }
  }
  
  // Règle 2: Compter les items individuels dans les lignes
  if (typesTravaux && typesTravaux.length > 0) {
    // Compter les lignes qui ressemblent à des items (excluant pose, total, etc.)
    const excludeKeywords = ["pose", "installation", "total", "sous-total", "remise", "tva", "forfait", "déplacement"];
    const itemLines = typesTravaux.filter(t => {
      const libelle = t.libelle?.toLowerCase() || "";
      return !excludeKeywords.some(kw => libelle.includes(kw)) && t.quantite && t.quantite > 0;
    });
    
    if (itemLines.length > 0) {
      // Prendre la quantité la plus élevée parmi les lignes d'items
      const maxQty = Math.max(...itemLines.map(t => t.quantite || 0));
      if (maxQty > 0 && maxQty <= 50) { // Limite raisonnable
        return { qty: maxQty, source: `règle_2_max_qty_items: ${maxQty}` };
      }
      
      // Sinon compter le nombre de lignes distinctes
      if (itemLines.length <= 20) {
        return { qty: itemLines.length, source: `règle_2_count_items: ${itemLines.length} lignes` };
      }
    }
  }
  
  // Règle 2bis: Chercher dans le texte brut des patterns numériques
  if (rawText) {
    // Pattern: "3 tabliers", "2 volets", etc.
    const patterns = [
      /(\d+)\s*(?:tablier|volet|fenêtre|porte|radiateur)/gi,
      /(?:qté|quantité|qty)[:\s]*(\d+)/gi,
    ];
    
    for (const pattern of patterns) {
      const match = pattern.exec(rawText);
      if (match && match[1]) {
        const qty = parseInt(match[1], 10);
        if (qty > 0 && qty <= 50) {
          return { qty, source: `règle_2_regex: "${match[0]}"` };
        }
      }
    }
  }
  
  // Règle 3: Non détecté - nécessite input utilisateur
  return { qty: null, source: "règle_3_user_input_required" };
};

/**
 * Extraction surface (m²) pour travaux surfaciques
 */
const extractSurfaceForArea = (
  typesTravaux?: TravauxItem[],
  rawText?: string
): { surface: number | null; source: string } => {
  // Priorité 1: Lignes avec unité m²
  if (typesTravaux && typesTravaux.length > 0) {
    const surfaceLines = typesTravaux.filter(t => 
      t.unite?.toLowerCase() === 'm²' || 
      t.unite?.toLowerCase() === 'm2' ||
      t.unite?.toUpperCase() === 'M²'
    );
    
    if (surfaceLines.length > 0) {
      // Prendre la plus grande surface (souvent la surface principale)
      const maxSurface = Math.max(...surfaceLines.map(t => t.quantite || 0));
      if (maxSurface > 0) {
        const ligne = surfaceLines.find(t => t.quantite === maxSurface);
        return { surface: maxSurface, source: `ligne_m²: "${ligne?.libelle}"` };
      }
    }
  }
  
  // Priorité 2: Chercher patterns m² dans le texte
  if (rawText) {
    const pattern = /(\d+(?:[.,]\d+)?)\s*m[²2]/gi;
    const matches = [...rawText.matchAll(pattern)];
    
    if (matches.length > 0) {
      // Prendre la plus grande surface trouvée
      const surfaces = matches.map(m => parseFloat(m[1].replace(',', '.')));
      const maxSurface = Math.max(...surfaces);
      if (maxSurface > 0) {
        return { surface: maxSurface, source: `regex_m²: ${maxSurface}` };
      }
    }
  }
  
  // Non détecté
  return { surface: null, source: "user_input_required" };
};

// ========================================
// MAIN HOOK
// ========================================

export const useMarketPriceAPI = ({
  typesTravaux,
  rawText,
  workType,
  codePostal,
  quoteTotalHt,
  filePath,
  enabled = true,
}: UseMarketPriceAPIParams) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MarketPriceResult | null>(null);
  const [debug, setDebug] = useState<MarketPriceDebug>({
    jobTypeDetected: null,
    jobTypeSource: "",
    multiplier: null,
    multiplierSource: "",
    apiUrl: null,
    apiParams: null,
    apiResponse: null,
    error: null,
  });
  const [needsUserInput, setNeedsUserInput] = useState<"qty" | "surface" | null>(null);

  useEffect(() => {
    // Detect job_type
    const { jobType, source: jobTypeSource } = detectJobType(typesTravaux, rawText, workType);
    
    const newDebug: MarketPriceDebug = {
      jobTypeDetected: jobType,
      jobTypeSource,
      multiplier: null,
      multiplierSource: "",
      apiUrl: null,
      apiParams: null,
      apiResponse: null,
      error: null,
    };
    
    if (!enabled || !jobType) {
      setDebug({ ...newDebug, error: !enabled ? "disabled" : "job_type_not_detected" });
      setResult(null);
      return;
    }

    const config = getJobTypeConfig(jobType);
    if (!config) {
      setDebug({ ...newDebug, error: "job_type_config_not_found" });
      setResult(null);
      return;
    }

    // ========================================
    // RÈGLE UI PRIX MARCHÉ
    // ========================================
    // qty/surface servent UNIQUEMENT à l'affichage détaillé
    // n8n renvoie des totaux déjà calculés (total_min/avg/max)
    // On ne bloque JAMAIS l'affichage si qty/surface manquante
    // ========================================
    
    let multiplier: number | null = null;
    let multiplierSource = "";
    
    if (config.isUnitBased) {
      const { qty, source } = extractQuantityForUnits(typesTravaux, rawText);
      multiplier = qty;
      multiplierSource = source;
    } else {
      const { surface, source } = extractSurfaceForArea(typesTravaux, rawText);
      multiplier = surface;
      multiplierSource = source;
    }

    // NE JAMAIS bloquer - qty/surface pour affichage uniquement
    setNeedsUserInput(null);
    newDebug.multiplier = multiplier;
    newDebug.multiplierSource = multiplierSource;

    const fetchMarketPrice = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const apiUrl = "https://n8n.messagingme.app/webhook/d1cfedb7-0ebb-44ca-bb2b-543ee84b0075";
        
        // Build form data fields
        const formDataFields: Record<string, unknown> = {
          job_type: jobType,
          zip: codePostal || "",
        };
        
        // Add surface or qty based on job type
        if (config.isUnitBased) {
          formDataFields.qty = multiplier;
        } else {
          formDataFields.surface = multiplier;
        }
        
        // Add quote total if available
        if (quoteTotalHt) {
          formDataFields.quote_total_ht = quoteTotalHt;
        }
        
        newDebug.apiUrl = apiUrl;
        newDebug.apiParams = formDataFields as Record<string, string>;
        
        // Use multipart/form-data with file if filePath is provided
        const requestBody: Record<string, unknown> = {
          url: apiUrl,
          method: "POST",
          formDataFields,
        };
        
        // Add filePath for multipart upload
        if (filePath) {
          requestBody.filePath = filePath;
          console.log("Sending PDF via multipart/form-data:", filePath);
        } else {
          // Fallback to JSON payload if no file
          requestBody.payload = {
            ...formDataFields,
            ocr_text: rawText || "",
          };
        }
        
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

        // ========================================
        // RÈGLE DE CALCUL DES PRIX MARCHÉ (source: n8n)
        // ========================================
        // - L'API n8n renvoie des totaux projet DÉJÀ CALCULÉS
        // - Les champs à utiliser: total_min, total_avg, total_max, lines[]
        // - L'interface NE DOIT JAMAIS recalculer de surface globale
        // - NE JAMAIS appliquer de multiplication à partir de qty
        // - Fourchette affichée: total_min → total_max
        // - Prix moyen marché: total_avg
        // - qty/unit servent UNIQUEMENT à l'affichage détaillé
        // - Si total_min/avg/max présents = comparaison disponible
        // ========================================
        
        const apiResponse = data.data;
        console.log("n8n API response:", apiResponse);
        
        if (apiResponse && typeof apiResponse === "object") {
          // Structure n8n avec total_min/avg/max et lines[]
          if (apiResponse.ok === true && apiResponse.total_min !== undefined) {
            // UTILISER DIRECTEMENT les totaux n8n - PAS DE RECALCUL
            const minTotal = Number(apiResponse.total_min);
            const avgTotal = Number(apiResponse.total_avg);
            const maxTotal = Number(apiResponse.total_max);
            
            // Nouveaux champs n8n pour gestion du warning quantité
            const qtyTotal = apiResponse.qty_total !== undefined ? Number(apiResponse.qty_total) : null;
            const needsUserQty = apiResponse.needs_user_qty === true;
            
            // Warnings de l'API
            const warnings: string[] = Array.isArray(apiResponse.warnings) ? apiResponse.warnings : [];
            
            console.log("n8n totaux directs (sans recalcul):", { minTotal, avgTotal, maxTotal, qtyTotal, needsUserQty, warnings });
            
            // lines[] pour affichage détaillé et calcul qty
            const lines: MarketPriceLine[] = Array.isArray(apiResponse.lines) 
              ? apiResponse.lines.map((l: Record<string, unknown>) => ({
                  label: String(l.label || ""),
                  label_raw: l.label_raw ? String(l.label_raw) : undefined,
                  job_type: l.job_type ? String(l.job_type) : undefined,
                  qty: typeof l.qty === "number" ? l.qty : undefined,
                  unit: l.unit ? String(l.unit) : undefined,
                  unit_price_min: typeof l.unit_price_min === "number" ? l.unit_price_min : undefined,
                  unit_price_avg: typeof l.unit_price_avg === "number" ? l.unit_price_avg : undefined,
                  unit_price_max: typeof l.unit_price_max === "number" ? l.unit_price_max : undefined,
                  needs_user_qty: l.needs_user_qty === true,
                }))
              : [];
            
            // Fallback: calculer qty_total depuis lines[].qty si non fourni
            let effectiveQtyTotal = qtyTotal;
            if (effectiveQtyTotal === null && lines.length > 0) {
              const sumQty = lines.reduce((acc: number, l: MarketPriceLine) => acc + (l.qty || 0), 0);
              if (sumQty > 0) {
                effectiveQtyTotal = sumQty;
              }
            }
            
            // Prix unitaires pour affichage (optionnel, jamais pour recalcul)
            // On les dérive des lignes si disponibles, sinon on laisse à 0
            let prixMini = 0;
            let prixAvg = 0;
            let prixMax = 0;
            
            if (lines.length > 0) {
              // Moyenne des prix unitaires des lignes pour affichage
              const validLines = lines.filter((l: MarketPriceLine) => l.unit_price_avg !== undefined);
              if (validLines.length > 0) {
                prixMini = validLines.reduce((acc: number, l: MarketPriceLine) => acc + (l.unit_price_min || 0), 0) / validLines.length;
                prixAvg = validLines.reduce((acc: number, l: MarketPriceLine) => acc + (l.unit_price_avg || 0), 0) / validLines.length;
                prixMax = validLines.reduce((acc: number, l: MarketPriceLine) => acc + (l.unit_price_max || 0), 0) / validLines.length;
              }
            }
            
            setResult({
              prixMini,
              prixAvg,
              prixMax,
              // TOTAUX DIRECTS depuis n8n - JAMAIS recalculés
              minTotal,
              avgTotal,
              maxTotal,
              // multiplier pour affichage uniquement (utiliser qtyTotal si dispo)
              multiplier: effectiveQtyTotal || multiplier || 0,
              jobType,
              jobTypeLabel: config.label,
              unitLabel: config.isUnitBased ? "unité" : "m²",
              isUnitBased: config.isUnitBased,
              // Nouveaux champs pour warning quantité
              qtyTotal: effectiveQtyTotal,
              needsUserQty,
              // Lignes et warnings
              lines,
              warnings,
            });
            setDebug(newDebug);
            return;
          }
          
          // Legacy fallback (anciens formats)
          if (apiResponse["prix mini"] !== undefined || apiResponse["price_min_unit_ht"] !== undefined) {
            const prixMini = Number(apiResponse["prix mini"] ?? apiResponse["price_min_unit_ht"]);
            const prixAvg = Number(apiResponse["prix avg"] ?? apiResponse["price_avg_unit_ht"]);
            const prixMax = Number(apiResponse["prix max"] ?? apiResponse["price_max_unit_ht"]);
            
            if (prixMini > 0 && multiplier && multiplier > 0) {
              setResult({
                prixMini,
                prixAvg,
                prixMax,
                minTotal: prixMini * multiplier,
                avgTotal: prixAvg * multiplier,
                maxTotal: prixMax * multiplier,
                multiplier,
                jobType,
                jobTypeLabel: config.label,
                unitLabel: config.isUnitBased ? "unité" : "m²",
                isUnitBased: config.isUnitBased,
                qtyTotal: multiplier,
                needsUserQty: false,
                lines: [],
                warnings: [],
              });
              setDebug(newDebug);
              return;
            }
          }
        }
        
        console.warn("n8n response has no valid prices:", apiResponse);
        throw new Error("Prix marché indisponible pour ce type de travaux");
      } catch (err) {
        console.error("Market price API error:", err);
        const errorMsg = err instanceof Error ? err.message : "Prix marché indisponible";
        setError(errorMsg);
        newDebug.error = errorMsg;
        setDebug(newDebug);
      } finally {
        setLoading(false);
      }
    };

    fetchMarketPrice();
  }, [typesTravaux, rawText, workType, codePostal, enabled]);

  return {
    loading,
    error,
    result,
    debug,
    needsUserInput,
  };
};
