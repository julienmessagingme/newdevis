import { CheckCircle2, AlertCircle, XCircle, Ruler, Building2, ClipboardCheck, HardHat } from "lucide-react";

interface BlockArchitecteProps {
  pointsOk: string[];
  alertes: string[];
  recommandations: string[];
}

const getScoreIcon = (score: string | null, className: string = "h-5 w-5") => {
  switch (score) {
    case "VERT": return <CheckCircle2 className={`${className} text-score-green`} />;
    case "ORANGE": return <AlertCircle className={`${className} text-score-orange`} />;
    case "ROUGE": return <XCircle className={`${className} text-score-red`} />;
    default: return null;
  }
};

const getScoreBgClass = (score: string | null) => {
  switch (score) {
    case "VERT": return "bg-score-green-bg border-score-green/30";
    case "ORANGE": return "bg-score-orange-bg border-score-orange/30";
    case "ROUGE": return "bg-score-red-bg border-score-red/30";
    default: return "bg-muted border-border";
  }
};

const getScoreTextClass = (score: string | null) => {
  switch (score) {
    case "VERT": return "text-score-green";
    case "ORANGE": return "text-score-orange";
    case "ROUGE": return "text-score-red";
    default: return "text-muted-foreground";
  }
};

interface ArchitecteInfo {
  detecte: boolean;
  type: "architecte" | "maitre_oeuvre" | null;
  nom: string | null;
  pourcentage_honoraires: number | null;
  missions: string[];
  score: "VERT" | "ORANGE" | "ROUGE";
  specificPoints: string[];
  specificAlertes: string[];
  specificRecommandations: string[];
}

// Extract architect/MOE info from points and alertes
const extractArchitecteInfo = (pointsOk: string[], alertes: string[], recommandations: string[]): ArchitecteInfo => {
  const info: ArchitecteInfo = {
    detecte: false,
    type: null,
    nom: null,
    pourcentage_honoraires: null,
    missions: [],
    score: "VERT",
    specificPoints: [],
    specificAlertes: [],
    specificRecommandations: []
  };
  
  // Check for architect indicators
  for (const point of pointsOk) {
    const lower = point.toLowerCase();
    
    if (lower.includes("architecte") || lower.includes("maître d'œuvre") || lower.includes("maitre d'oeuvre")) {
      info.detecte = true;
      
      if (lower.includes("architecte") && !lower.includes("maître d'œuvre") && !lower.includes("maitre d'oeuvre")) {
        info.type = "architecte";
      } else if (lower.includes("maître d'œuvre") || lower.includes("maitre d'oeuvre") || lower.includes("moe")) {
        info.type = "maitre_oeuvre";
      }
      
      // Extract name if present
      const nameMatch = point.match(/\(([^)]+)\)/);
      if (nameMatch) {
        info.nom = nameMatch[1];
      }
      
      // Check for honoraires percentage
      const honorairesMatch = point.match(/(\d+(?:[.,]\d+)?)\s*%/);
      if (honorairesMatch) {
        info.pourcentage_honoraires = parseFloat(honorairesMatch[1].replace(",", "."));
      }
      
      info.specificPoints.push(point);
    }
    
    // Check for mission indicators
    if (lower.includes("mission complète") || lower.includes("conception") || lower.includes("suivi")) {
      if (lower.includes("conception")) info.missions.push("conception");
      if (lower.includes("suivi")) info.missions.push("suivi_chantier");
      if (lower.includes("coordination")) info.missions.push("coordination");
      
      if (!info.specificPoints.includes(point)) {
        info.specificPoints.push(point);
      }
    }
    
    // Check for code of ethics
    if (lower.includes("déontologie") || lower.includes("assurance professionnelle")) {
      if (!info.specificPoints.includes(point)) {
        info.specificPoints.push(point);
      }
    }
    
    // Check for honoraires in norms
    if (lower.includes("honoraires") && lower.includes("normes")) {
      info.specificPoints.push(point);
    }
  }
  
  // Check alertes for architect-related issues
  for (const alerte of alertes) {
    const lower = alerte.toLowerCase();
    
    if (lower.includes("honoraires") && (lower.includes("architecte") || lower.includes("maître d'œuvre") || lower.includes("maitre d'oeuvre"))) {
      info.detecte = true;
      info.specificAlertes.push(alerte);
      info.score = "ORANGE";
      
      // Extract percentage
      const honorairesMatch = alerte.match(/(\d+(?:[.,]\d+)?)\s*%/);
      if (honorairesMatch) {
        info.pourcentage_honoraires = parseFloat(honorairesMatch[1].replace(",", "."));
      }
    }
  }
  
  // Check recommandations
  for (const rec of recommandations) {
    const lower = rec.toLowerCase();
    
    if (lower.includes("architecte") || lower.includes("maître d'œuvre") || lower.includes("maitre d'oeuvre") || lower.includes("ordre des architectes")) {
      info.specificRecommandations.push(rec);
    }
  }
  
  return info;
};

// Filter out architect-related items from general lists
export const filterOutArchitecteItems = (items: string[]): string[] => {
  return items.filter(item => {
    const lower = item.toLowerCase();
    return !lower.includes("architecte") &&
           !lower.includes("maître d'œuvre") &&
           !lower.includes("maitre d'oeuvre") &&
           !lower.includes("moe") &&
           !(lower.includes("honoraires") && (lower.includes("%") || lower.includes("mission")));
  });
};

const getMissionIcon = (mission: string) => {
  switch (mission) {
    case "conception":
      return <Ruler className="h-4 w-4 text-primary" />;
    case "suivi_chantier":
      return <HardHat className="h-4 w-4 text-primary" />;
    case "coordination":
      return <ClipboardCheck className="h-4 w-4 text-primary" />;
    default:
      return null;
  }
};

const getMissionLabel = (mission: string) => {
  switch (mission) {
    case "conception":
      return "Conception";
    case "suivi_chantier":
      return "Suivi de chantier";
    case "coordination":
      return "Coordination";
    default:
      return mission;
  }
};

const BlockArchitecte = ({ pointsOk, alertes, recommandations }: BlockArchitecteProps) => {
  const info = extractArchitecteInfo(pointsOk, alertes, recommandations);
  
  // Don't render if no architect/MOE detected
  if (!info.detecte) return null;
  
  const typeLabel = info.type === "architecte" ? "Architecte" : "Maître d'œuvre";
  const typeDescription = info.type === "architecte" 
    ? "Ce devis est émis par un architecte, professionnel réglementé inscrit à l'Ordre des Architectes."
    : "Ce devis est émis par un maître d'œuvre, professionnel coordonnant les travaux.";
  
  return (
    <div className={`border-2 rounded-2xl p-6 mb-6 ${getScoreBgClass(info.score)}`}>
      <div className="flex items-start gap-4">
        <div className="p-3 bg-background/50 rounded-xl flex-shrink-0">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-bold text-foreground text-xl">
              {info.type === "architecte" ? "Devis d'Architecte" : "Devis de Maître d'œuvre"}
            </h2>
            {getScoreIcon(info.score, "h-6 w-6")}
          </div>
          
          <p className="text-sm text-muted-foreground mb-4">
            {typeDescription}
          </p>
          
          {/* Info grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Professional info */}
            <div className="p-3 bg-background/30 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Professionnel</p>
              <p className="font-medium text-foreground">
                {info.nom ? `${typeLabel} - ${info.nom}` : typeLabel}
              </p>
            </div>
            
            {/* Honoraires */}
            {info.pourcentage_honoraires !== null && (
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Honoraires</p>
                <p className={`font-medium ${getScoreTextClass(info.score)}`}>
                  {info.pourcentage_honoraires}% du montant des travaux
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {info.type === "architecte" 
                    ? "Fourchette habituelle : 8-15%"
                    : "Fourchette habituelle : 5-12%"
                  }
                </p>
              </div>
            )}
          </div>
          
          {/* Missions */}
          {info.missions.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-muted-foreground mb-2">Missions identifiées</p>
              <div className="flex flex-wrap gap-2">
                {info.missions.map((mission, idx) => (
                  <div 
                    key={idx}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-background/50 rounded-lg border border-border"
                  >
                    {getMissionIcon(mission)}
                    <span className="text-sm font-medium text-foreground">{getMissionLabel(mission)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Specific points */}
          {info.specificPoints.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-muted-foreground mb-2">Points positifs</p>
              <ul className="space-y-2">
                {info.specificPoints.slice(0, 3).map((point, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-score-green mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-foreground">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Specific alertes */}
          {info.specificAlertes.length > 0 && (
            <div className="mb-4 p-3 bg-background/50 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground mb-2">Points de vigilance</p>
              <ul className="space-y-2">
                {info.specificAlertes.map((alerte, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-score-orange mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-foreground">{alerte}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Specific recommendations */}
          {info.specificRecommandations.length > 0 && (
            <div className="mt-4 p-3 bg-primary/5 rounded-lg border border-primary/20">
              <p className="text-xs font-medium text-primary mb-2">💡 Conseils spécifiques</p>
              <ul className="space-y-1">
                {info.specificRecommandations.map((rec, idx) => (
                  <li key={idx} className="text-sm text-foreground">{rec}</li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Score explanation */}
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className={`text-sm font-medium ${getScoreTextClass(info.score)}`}>
              {info.score === "VERT" && `✓ Le devis ${info.type === "architecte" ? "d'architecte" : "de maître d'œuvre"} présente des conditions conformes aux usages de la profession.`}
              {info.score === "ORANGE" && `⚠️ Certains éléments du devis méritent une vérification.`}
              {info.score === "ROUGE" && `⚠️ Des anomalies ont été détectées sur ce devis.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlockArchitecte;
