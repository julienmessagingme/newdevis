import { MapPin, AlertTriangle, FileWarning, Info, CheckCircle2, Landmark, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SiteContextResult {
  postal_code: string | null;
  insee_code: string | null;
  address?: string | null;
  risks: Array<{
    risk_type: string;
    level: string;
    description: string;
  }>;
  seismic_zone: {
    zone: string;
    level: string;
  } | null;
  urbanisme: {
    has_constraints: boolean;
    documents: string[];
  } | null;
  patrimoine?: {
    status: "possible" | "non_detecte" | "inconnu";
    types: string[];
  } | null;
  error: string | null;
  status?: "data_found" | "no_data" | "address_incomplete" | "not_searched";
}

interface BlockContexteProps {
  siteContext?: SiteContextResult | null;
  pointsOk: string[];
  alertes: string[];
  chantierAddress?: string | null;
  rawText?: string | null;
}

// Extract address from AI analysis JSON
const extractAddressFromRawText = (rawText: string | null): string | null => {
  if (!rawText) return null;
  
  try {
    const parsed = JSON.parse(rawText);
    
    // Priority: adresse_chantier > code_postal_chantier > adresse_client
    if (parsed.adresse_chantier && typeof parsed.adresse_chantier === "string") {
      return parsed.adresse_chantier;
    }
    if (parsed.code_postal_chantier) {
      return `Code postal: ${parsed.code_postal_chantier}`;
    }
    if (parsed.adresse_client && typeof parsed.adresse_client === "string") {
      return parsed.adresse_client;
    }
  } catch {
    // Try regex extraction as fallback
    const addressMatch = rawText.match(/adresse_chantier[:\s]*["']([^"']+)["']/i);
    if (addressMatch) {
      return addressMatch[1];
    }
    
    const postalMatch = rawText.match(/code_postal_chantier[:\s]*["']?(\d{5})["']?/i);
    if (postalMatch) {
      return `Code postal: ${postalMatch[1]}`;
    }
  }
  
  return null;
};

// Extract site context from points_ok (from backend analysis)
const extractSiteContextFromPoints = (pointsOk: string[], alertes: string[]): Partial<SiteContextResult> | null => {
  const allPoints = [...pointsOk, ...alertes];
  
  const risks: Array<{ risk_type: string; level: string; description: string }> = [];
  let postalCode: string | null = null;
  let address: string | null = null;
  let commune: string | null = null;
  let seismicZone: string | null = null;
  let hasDataFromBackend = false;
  let patrimoine: { status: "possible" | "non_detecte" | "inconnu"; types: string[] } | null = null;
  
  for (const point of allPoints) {
    const lowerPoint = point.toLowerCase();
    
    // Check for backend site context markers (📍 prefix)
    if (point.startsWith("📍")) {
      hasDataFromBackend = true;
      
      // Extract commune from "Contexte chantier (Commune)"
      const communeMatch = point.match(/contexte chantier \(([^)]+)\)/i);
      if (communeMatch) {
        commune = communeMatch[1];
      }
      
      // Extract risks count and types
      const risksMatch = point.match(/(\d+) risque\(s\) naturel\(s\).*?:\s*(.+)/i);
      if (risksMatch) {
        const riskTypes = risksMatch[2].split(",").map(r => r.trim());
        for (const riskType of riskTypes) {
          risks.push({
            risk_type: riskType,
            level: "Identifié",
            description: point
          });
        }
      }
      
      // Extract seismic zone
      if (lowerPoint.includes("zone sismique")) {
        const seismicMatch = point.match(/zone sismique\s*:\s*(.+)/i);
        if (seismicMatch) {
          seismicZone = seismicMatch[1].trim();
        }
      }
      
      // Check for "no constraints" message
      if (lowerPoint.includes("aucune contrainte particulière")) {
        // This means no_data status
      }
      
      // Extract patrimoine / ABF status
      if (lowerPoint.includes("patrimoine") || lowerPoint.includes("abf")) {
        if (lowerPoint.includes("possible")) {
          // Extract types from parentheses if available
          const typesMatch = point.match(/\(([^)]+)\)/);
          const types = typesMatch ? typesMatch[1].split(",").map(t => t.trim()) : [];
          patrimoine = { status: "possible", types };
        } else if (lowerPoint.includes("non détecté") || lowerPoint.includes("non detecte")) {
          patrimoine = { status: "non_detecte", types: [] };
        } else if (lowerPoint.includes("inconnu")) {
          patrimoine = { status: "inconnu", types: [] };
        }
      }
    }
    
    // Legacy: Check for postal code
    const postalMatch = point.match(/(\d{5})/);
    if (postalMatch && !postalCode) {
      postalCode = postalMatch[1];
    }
    
    // Legacy: Check for address mentions
    if (lowerPoint.includes("adresse") || lowerPoint.includes("chantier")) {
      const addressMatch = point.match(/(?:adresse|chantier)[^:]*:\s*(.+)/i);
      if (addressMatch) {
        address = addressMatch[1].trim();
      }
    }
    
    // Legacy: Check for risk mentions
    if (lowerPoint.includes("inondation") || lowerPoint.includes("flood")) {
      const levelMatch = point.match(/niveau\s*:?\s*(\w+)/i) || point.match(/(faible|moyen|élevé|fort)/i);
      risks.push({
        risk_type: "Inondation",
        level: levelMatch ? levelMatch[1] : "À vérifier",
        description: point
      });
    }
    
    if ((lowerPoint.includes("sism") || lowerPoint.includes("séism")) && !point.startsWith("📍")) {
      const levelMatch = point.match(/zone\s*(\d)/i) || point.match(/(faible|moyen|modéré)/i);
      risks.push({
        risk_type: "Sismicité",
        level: levelMatch ? `Zone ${levelMatch[1]}` : "À vérifier",
        description: point
      });
    }
    
    if (lowerPoint.includes("mouvement") && lowerPoint.includes("terrain")) {
      risks.push({
        risk_type: "Mouvements de terrain",
        level: "À vérifier",
        description: point
      });
    }
    
    if (lowerPoint.includes("argile") || lowerPoint.includes("retrait-gonflement")) {
      risks.push({
        risk_type: "Retrait-gonflement des argiles",
        level: "À vérifier",
        description: point
      });
    }
  }
  
  // Build seismic zone object
  let seismicZoneObj: { zone: string; level: string } | null = null;
  if (seismicZone) {
    seismicZoneObj = {
      zone: seismicZone,
      level: seismicZone.includes("1") ? "Très faible" : 
             seismicZone.includes("2") ? "Faible" :
             seismicZone.includes("3") ? "Modéré" :
             seismicZone.includes("4") ? "Moyen" :
             seismicZone.includes("5") ? "Fort" : "Non déterminé"
    };
  }
  
  // Determine status
  let status: "data_found" | "no_data" | "address_incomplete" | "not_searched" = "not_searched";
  if (hasDataFromBackend) {
    if (risks.length > 0 || seismicZoneObj) {
      status = "data_found";
    } else if (commune) {
      status = "no_data";
    }
  } else if (postalCode || address) {
    status = risks.length > 0 ? "data_found" : "no_data";
  }
  
  return {
    postal_code: postalCode,
    address: address || (commune ? `${commune}` : null),
    risks,
    seismic_zone: seismicZoneObj,
    patrimoine,
    error: null,
    status
  };
};

// Filter out context-related items
export const filterOutContexteItems = (items: string[]): string[] => {
  return items.filter(item => {
    const lower = item.toLowerCase();
    // Filter out items that start with 📍 (backend context markers)
    if (item.startsWith("📍")) return false;
    
    return !lower.includes("inondation") && 
           !lower.includes("sism") &&
           !lower.includes("séism") &&
           !lower.includes("mouvement de terrain") &&
           !lower.includes("argile") &&
           !lower.includes("retrait-gonflement") &&
           !lower.includes("urbanisme") &&
           !lower.includes("plu") &&
           !lower.includes("zone protégée") &&
           !lower.includes("géorisques");
  });
};

const getRiskLevelColor = (level: string) => {
  const lowerLevel = level.toLowerCase();
  if (lowerLevel.includes("faible") || lowerLevel.includes("zone 1") || lowerLevel.includes("très faible") || lowerLevel.includes("identifié")) {
    return "text-score-green";
  }
  if (lowerLevel.includes("moyen") || lowerLevel.includes("modéré") || lowerLevel.includes("zone 2") || lowerLevel.includes("zone 3")) {
    return "text-score-orange";
  }
  if (lowerLevel.includes("élevé") || lowerLevel.includes("fort") || lowerLevel.includes("zone 4") || lowerLevel.includes("zone 5")) {
    return "text-score-red";
  }
  return "text-muted-foreground";
};

const BlockContexte = ({ siteContext, pointsOk, alertes, chantierAddress, rawText }: BlockContexteProps) => {
  // Try to get context from siteContext prop or extract from points
  const extractedContext = extractSiteContextFromPoints(pointsOk, alertes);
  const contextData = siteContext || extractedContext;
  
  // Try to find an address from multiple sources
  const addressFromRawText = extractAddressFromRawText(rawText || null);
  const detectedAddress = chantierAddress || contextData?.address || addressFromRawText || contextData?.postal_code;
  
  // Determine display status
  const hasRisks = contextData?.risks && contextData.risks.length > 0;
  const hasSeismicZone = !!contextData?.seismic_zone;
  const hasUrbanisme = !!contextData?.urbanisme;
  const hasPatrimoine = !!contextData?.patrimoine;
  const hasData = hasRisks || hasSeismicZone || hasUrbanisme || hasPatrimoine;
  
  // Determine the display case
  let displayCase: "data_found" | "no_data" | "address_incomplete";
  
  if (contextData?.status === "data_found" || hasData) {
    displayCase = "data_found";
  } else if (contextData?.status === "no_data" || (detectedAddress && !hasData)) {
    displayCase = "no_data";
  } else if (contextData?.status === "address_incomplete" || !detectedAddress) {
    displayCase = "address_incomplete";
  } else {
    // Default based on whether we have an address
    displayCase = detectedAddress ? "no_data" : "address_incomplete";
  }
  
  return (
    <div className="bg-card border-2 border-border rounded-2xl p-6 mb-6">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-primary/10 rounded-xl flex-shrink-0">
          <MapPin className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-bold text-foreground text-xl">Contexte du chantier</h2>
            <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
              <Info className="h-3 w-3 inline mr-1" />
              Informatif
            </span>
          </div>
          
          <p className="text-sm text-muted-foreground mb-4">
            Informations sur le contexte réglementaire et environnemental du chantier (sources : Géorisques, Géoportail de l'Urbanisme).
          </p>
          
          {/* Location info */}
          {detectedAddress && (
            <div className="mb-4 p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-foreground">
                <span className="font-medium">Zone analysée :</span> {detectedAddress}
                {contextData?.insee_code && ` (INSEE: ${contextData.insee_code})`}
              </p>
            </div>
          )}
          
          {/* CASE A: Data available */}
          {displayCase === "data_found" && (
            <>
              {/* Risques naturels */}
              {hasRisks && (
                <div className="mb-4">
                  <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-score-orange" />
                    Risques naturels identifiés
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {contextData?.risks?.map((risk, idx) => (
                      <div key={idx} className="p-3 bg-muted/30 rounded-lg border border-border">
                        <p className="font-medium text-foreground text-sm">{risk.risk_type}</p>
                        <p className={`text-sm font-medium ${getRiskLevelColor(risk.level)}`}>
                          Niveau : {risk.level}
                        </p>
                        {risk.description && risk.description !== risk.risk_type && !risk.description.startsWith("📍") && (
                          <p className="text-xs text-muted-foreground mt-1">{risk.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Zone sismique */}
              {hasSeismicZone && contextData?.seismic_zone && (
                <div className="mb-4">
                  <div className="p-3 bg-muted/30 rounded-lg border border-border">
                    <p className="font-medium text-foreground text-sm">Sismicité</p>
                    <p className={`text-sm font-medium ${getRiskLevelColor(contextData.seismic_zone.level)}`}>
                      {contextData.seismic_zone.zone} - {contextData.seismic_zone.level}
                    </p>
                  </div>
                </div>
              )}
              
              {/* Urbanisme */}
              {hasUrbanisme && contextData?.urbanisme && (
                <div className="mb-4">
                  <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                    <FileWarning className="h-4 w-4" />
                    Contraintes d'urbanisme
                  </h3>
                  
                  <div className="p-3 bg-muted/30 rounded-lg border border-border">
                    {contextData.urbanisme.has_constraints ? (
                      <>
                        <p className="text-sm text-score-orange font-medium mb-2">
                          Des contraintes d'urbanisme peuvent s'appliquer
                        </p>
                        {contextData.urbanisme.documents && contextData.urbanisme.documents.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Documents applicables : {contextData.urbanisme.documents.join(", ")}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Aucune contrainte particulière identifiée
                      </p>
                    )}
                  </div>
                </div>
              )}
              
              {/* Patrimoine / ABF */}
              {hasPatrimoine && contextData?.patrimoine && (
                <div className="mb-4">
                  <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-primary" />
                    Patrimoine / ABF
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-sm">
                            <strong>Pourquoi c'est utile ?</strong><br />
                            Dans certaines zones protégées, les travaux extérieurs (façade, toiture, ouvertures, clôtures, etc.) peuvent nécessiter une consultation patrimoniale. Vérifiez auprès de votre mairie / service urbanisme.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </h3>
                  
                  <div className={`p-3 rounded-lg border ${
                    contextData.patrimoine.status === "possible" 
                      ? "bg-score-orange-bg border-score-orange/20" 
                      : contextData.patrimoine.status === "non_detecte"
                        ? "bg-muted/30 border-border"
                        : "bg-muted/30 border-border"
                  }`}>
                    {contextData.patrimoine.status === "possible" && (
                      <>
                        <p className="text-sm text-score-orange font-medium mb-2">
                          POSSIBLE — le chantier semble situé dans une zone de protection patrimoniale (monument historique / abords ou site patrimonial remarquable).
                        </p>
                        {contextData.patrimoine.types.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Types détectés : {contextData.patrimoine.types.join(", ")}
                          </p>
                        )}
                      </>
                    )}
                    {contextData.patrimoine.status === "non_detecte" && (
                      <p className="text-sm text-muted-foreground">
                        NON DÉTECTÉ — aucune zone patrimoniale n'a été détectée autour de l'adresse du chantier à partir des données publiques disponibles.
                      </p>
                    )}
                    {contextData.patrimoine.status === "inconnu" && (
                      <p className="text-sm text-muted-foreground">
                        INCONNU — l'adresse du chantier n'a pas pu être géolocalisée, la vérification n'a pas pu être réalisée.
                      </p>
                    )}
                  </div>
                  
                  <p className="text-xs text-muted-foreground mt-2 italic">
                    Information indicative basée sur des sources publiques. Ne constitue pas un avis juridique. La règle applicable dépend du projet, de la nature des travaux et des décisions de l'autorité compétente.
                  </p>
                </div>
              )}
            </>
          )}
          
          {/* CASE B: No specific data detected */}
          {displayCase === "no_data" && (
            <div className="mb-4 p-4 bg-muted/30 rounded-lg border border-border">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-score-green mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">
                    Aucune contrainte particulière identifiée
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Aucune contrainte réglementaire ou risque naturel particulier n'a été identifié à partir des sources publiques pour cette zone.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* CASE C: Address incomplete or not exploitable */}
          {displayCase === "address_incomplete" && (
            <div className="mb-4 p-4 bg-score-orange-bg rounded-lg border border-score-orange/20">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-score-orange mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">
                    Adresse du chantier non exploitable
                  </p>
                  <p className="text-sm text-muted-foreground">
                    L'adresse du chantier est insuffisamment précise pour interroger les bases publiques (Géorisques, Géoportail de l'Urbanisme). 
                    Vérifiez que le devis comporte une adresse complète avec code postal.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* Error message from API */}
          {contextData?.error && displayCase !== "address_incomplete" && (
            <div className="mb-4 p-3 bg-score-orange-bg rounded-lg border border-score-orange/20">
              <p className="text-sm text-score-orange">
                ℹ️ {contextData.error}
              </p>
            </div>
          )}
          
          {/* Disclaimer */}
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground italic">
              ℹ️ Ces informations sont fournies à titre indicatif à partir de sources publiques officielles (Géoportail de l'Urbanisme et Géorisques) et peuvent être utiles pour anticiper certaines contraintes du chantier. Elles n'ont aucun impact sur le score global et ne constituent pas un avis juridique.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlockContexte;