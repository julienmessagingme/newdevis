import { MapPin, AlertTriangle, FileWarning, Info } from "lucide-react";

interface SiteContextResult {
  postal_code: string | null;
  insee_code: string | null;
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
  error: string | null;
}

interface BlockContexteProps {
  siteContext?: SiteContextResult | null;
  pointsOk: string[];
  alertes: string[];
}

// Extract site context from points_ok/alertes if not provided directly
const extractSiteContextFromPoints = (pointsOk: string[], alertes: string[]): Partial<SiteContextResult> | null => {
  const allPoints = [...pointsOk, ...alertes];
  
  let hasContextInfo = false;
  const risks: Array<{ risk_type: string; level: string; description: string }> = [];
  let postalCode: string | null = null;
  
  for (const point of allPoints) {
    const lowerPoint = point.toLowerCase();
    
    // Check for postal code
    const postalMatch = point.match(/(\d{5})/);
    if (postalMatch) {
      postalCode = postalMatch[1];
    }
    
    // Check for risk mentions
    if (lowerPoint.includes("inondation") || lowerPoint.includes("flood")) {
      hasContextInfo = true;
      const levelMatch = point.match(/niveau\s*:?\s*(\w+)/i) || point.match(/(faible|moyen|élevé|fort)/i);
      risks.push({
        risk_type: "Inondation",
        level: levelMatch ? levelMatch[1] : "À vérifier",
        description: point
      });
    }
    
    if (lowerPoint.includes("sism") || lowerPoint.includes("séism")) {
      hasContextInfo = true;
      const levelMatch = point.match(/zone\s*(\d)/i) || point.match(/(faible|moyen|modéré)/i);
      risks.push({
        risk_type: "Sismicité",
        level: levelMatch ? `Zone ${levelMatch[1]}` : "À vérifier",
        description: point
      });
    }
    
    if (lowerPoint.includes("mouvement") && lowerPoint.includes("terrain")) {
      hasContextInfo = true;
      risks.push({
        risk_type: "Mouvements de terrain",
        level: "À vérifier",
        description: point
      });
    }
    
    if (lowerPoint.includes("argile") || lowerPoint.includes("retrait-gonflement")) {
      hasContextInfo = true;
      risks.push({
        risk_type: "Retrait-gonflement des argiles",
        level: "À vérifier",
        description: point
      });
    }
  }
  
  if (!hasContextInfo) return null;
  
  return {
    postal_code: postalCode,
    risks,
    error: null
  };
};

// Filter out context-related items
export const filterOutContexteItems = (items: string[]): string[] => {
  return items.filter(item => {
    const lower = item.toLowerCase();
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
  if (lowerLevel.includes("faible") || lowerLevel.includes("zone 1") || lowerLevel.includes("très faible")) {
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

const BlockContexte = ({ siteContext, pointsOk, alertes }: BlockContexteProps) => {
  // Try to get context from siteContext prop or extract from points
  const contextData = siteContext || extractSiteContextFromPoints(pointsOk, alertes);
  
  // If no context data at all, don't render
  if (!contextData || ((!contextData.risks || contextData.risks.length === 0) && !contextData.seismic_zone && !contextData.urbanisme)) {
    return null;
  }
  
  return (
    <div className="bg-card border-2 border-border rounded-2xl p-6 mb-6">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-primary/10 rounded-xl flex-shrink-0">
          <MapPin className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-bold text-foreground text-xl">BLOC 4 — Contexte du chantier</h2>
            <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
              <Info className="h-3 w-3 inline mr-1" />
              Informatif
            </span>
          </div>
          
          <p className="text-sm text-muted-foreground mb-4">
            Informations sur le contexte réglementaire et environnemental du chantier.
          </p>
          
          {/* Location info */}
          {contextData.postal_code && (
            <div className="mb-4 p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-foreground">
                <span className="font-medium">Zone analysée :</span> Code postal {contextData.postal_code}
                {contextData.insee_code && ` (INSEE: ${contextData.insee_code})`}
              </p>
            </div>
          )}
          
          {/* Risques naturels */}
          {contextData.risks && contextData.risks.length > 0 && (
            <div className="mb-4">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-score-orange" />
                Risques naturels identifiés
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {contextData.risks.map((risk, idx) => (
                  <div key={idx} className="p-3 bg-muted/30 rounded-lg border border-border">
                    <p className="font-medium text-foreground text-sm">{risk.risk_type}</p>
                    <p className={`text-sm font-medium ${getRiskLevelColor(risk.level)}`}>
                      Niveau : {risk.level}
                    </p>
                    {risk.description && risk.description !== risk.risk_type && (
                      <p className="text-xs text-muted-foreground mt-1">{risk.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Zone sismique */}
          {contextData.seismic_zone && (
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
          {contextData.urbanisme && (
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
          
          {/* Error message */}
          {contextData.error && (
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
