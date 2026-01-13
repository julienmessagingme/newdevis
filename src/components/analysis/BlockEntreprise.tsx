import { CheckCircle2, AlertCircle, XCircle, Star, Building2, Globe } from "lucide-react";

interface ReputationOnline {
  rating?: number;
  reviews_count?: number;
  score: "VERT" | "ORANGE" | "ROUGE";
  explanation: string;
}

interface BlockEntrepriseProps {
  pointsOk: string[];
  alertes: string[];
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

interface EntrepriseInfo {
  siren_siret: string | null;
  anciennete: string | null;
  bilansDisponibles: boolean | null;
  capitauxPropres: string | null;
  procedureCollective: boolean | null;
  reputation: ReputationOnline | null;
  score: "VERT" | "ORANGE" | "ROUGE";
}

const extractEntrepriseData = (pointsOk: string[], alertes: string[]): EntrepriseInfo => {
  const allPoints = [...pointsOk, ...alertes];
  
  let siren_siret: string | null = null;
  let anciennete: string | null = null;
  let bilansDisponibles: boolean | null = null;
  let capitauxPropres: string | null = null;
  let procedureCollective: boolean | null = null;
  let reputation: ReputationOnline | null = null;
  let positiveCount = 0;
  let alertCount = 0;
  
  for (const point of allPoints) {
    const lowerPoint = point.toLowerCase();
    
    // Extract SIREN/SIRET
    if (lowerPoint.includes("siret") || lowerPoint.includes("siren")) {
      const match = point.match(/(\d{9,14})/);
      if (match) {
        siren_siret = match[1];
      }
      if (lowerPoint.includes("valide") || pointsOk.includes(point)) {
        positiveCount++;
      } else if (alertes.includes(point)) {
        alertCount++;
      }
    }
    
    // Extract ancienneté
    if (lowerPoint.includes("ancienneté") || lowerPoint.includes("anciennete") || lowerPoint.includes("créée") || lowerPoint.includes("immatriculée")) {
      const yearMatch = point.match(/(\d{4})/);
      const durationMatch = point.match(/(\d+)\s*an/i);
      if (yearMatch) {
        anciennete = `Depuis ${yearMatch[1]}`;
      } else if (durationMatch) {
        anciennete = `${durationMatch[1]} ans d'activité`;
      }
      if (pointsOk.includes(point)) {
        positiveCount++;
      }
    }
    
    // Extract bilans
    if (lowerPoint.includes("bilan") || lowerPoint.includes("comptes")) {
      bilansDisponibles = lowerPoint.includes("disponible") || lowerPoint.includes("publiés");
      if (bilansDisponibles && pointsOk.includes(point)) {
        positiveCount++;
      } else if (!bilansDisponibles && alertes.includes(point)) {
        alertCount++;
      }
    }
    
    // Extract capitaux propres
    if (lowerPoint.includes("capitaux propres") || lowerPoint.includes("capital")) {
      const match = point.match(/([\d\s]+)\s*€/);
      if (match) {
        capitauxPropres = match[1].trim() + " €";
      }
      if (lowerPoint.includes("négatif") || lowerPoint.includes("insuffisant")) {
        alertCount++;
      } else if (pointsOk.includes(point)) {
        positiveCount++;
      }
    }
    
    // Extract procedure collective
    if (lowerPoint.includes("procédure collective") || lowerPoint.includes("redressement") || lowerPoint.includes("liquidation")) {
      procedureCollective = !lowerPoint.includes("aucune") && !lowerPoint.includes("néant");
      if (procedureCollective) {
        alertCount += 2;
      } else {
        positiveCount++;
      }
    }
    
    // Extract reputation
    const ratingMatch = point.match(/[rR]éputation en ligne.*?(\d+(?:\.\d+)?)\s*\/\s*5.*?\((\d+)\s*avis/i);
    if (ratingMatch) {
      const rating = parseFloat(ratingMatch[1]);
      const reviewsCount = parseInt(ratingMatch[2], 10);
      
      let score: "VERT" | "ORANGE" | "ROUGE";
      if (rating > 4.5) {
        score = "VERT";
        positiveCount++;
      } else if (rating >= 4.0) {
        score = "ORANGE";
      } else {
        score = "ROUGE";
        alertCount++;
      }
      
      reputation = {
        rating,
        reviews_count: reviewsCount,
        score,
        explanation: point
      };
    } else if (lowerPoint.includes("réputation en ligne") && (lowerPoint.includes("aucun avis") || lowerPoint.includes("non trouvé"))) {
      reputation = {
        score: "ORANGE",
        explanation: point
      };
    }
  }
  
  // Determine overall score
  let score: "VERT" | "ORANGE" | "ROUGE";
  if (alertCount >= 2 || procedureCollective) {
    score = "ROUGE";
  } else if (alertCount > 0 || positiveCount < 3) {
    score = "ORANGE";
  } else {
    score = "VERT";
  }
  
  return {
    siren_siret,
    anciennete,
    bilansDisponibles,
    capitauxPropres,
    procedureCollective,
    reputation,
    score
  };
};

// Function to filter out entreprise-related items from points_ok/alertes
export const filterOutEntrepriseItems = (items: string[]): string[] => {
  return items.filter(item => {
    const lower = item.toLowerCase();
    return !lower.includes("siret") && 
           !lower.includes("siren") &&
           !lower.includes("ancienneté") &&
           !lower.includes("anciennete") &&
           !lower.includes("créée") &&
           !lower.includes("immatriculée") &&
           !lower.includes("bilan") &&
           !lower.includes("comptes publiés") &&
           !lower.includes("capitaux propres") &&
           !lower.includes("capital social") &&
           !lower.includes("procédure collective") &&
           !lower.includes("redressement") &&
           !lower.includes("liquidation") &&
           !lower.includes("réputation en ligne") &&
           !lower.includes("avis google");
  });
};

const BlockEntreprise = ({ pointsOk, alertes }: BlockEntrepriseProps) => {
  const info = extractEntrepriseData(pointsOk, alertes);
  
  // Check if we have any meaningful data
  const hasData = info.siren_siret || info.anciennete || info.bilansDisponibles !== null || 
                  info.capitauxPropres || info.procedureCollective !== null || info.reputation;
  
  if (!hasData) return null;
  
  return (
    <div className={`border-2 rounded-2xl p-6 mb-6 ${getScoreBgClass(info.score)}`}>
      <div className="flex items-start gap-4">
        <div className="p-3 bg-background/50 rounded-xl flex-shrink-0">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-bold text-foreground text-xl">BLOC 1 — Entreprise & Fiabilité</h2>
            {getScoreIcon(info.score, "h-6 w-6")}
          </div>
          
          <p className="text-sm text-muted-foreground mb-4">
            Identifier à qui vous avez affaire.
          </p>
          
          {/* Info grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* SIREN/SIRET */}
            {info.siren_siret && (
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Immatriculation</p>
                <p className="font-medium text-foreground">{info.siren_siret}</p>
              </div>
            )}
            
            {/* Ancienneté */}
            {info.anciennete && (
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Ancienneté</p>
                <p className="font-medium text-foreground">{info.anciennete}</p>
              </div>
            )}
            
            {/* Bilans */}
            {info.bilansDisponibles !== null && (
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Bilans</p>
                <p className={`font-medium ${info.bilansDisponibles ? "text-score-green" : "text-score-orange"}`}>
                  {info.bilansDisponibles ? "Disponibles" : "Non disponibles"}
                </p>
              </div>
            )}
            
            {/* Capitaux propres */}
            {info.capitauxPropres && (
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Capitaux propres</p>
                <p className="font-medium text-foreground">{info.capitauxPropres}</p>
              </div>
            )}
            
            {/* Procédure collective */}
            {info.procedureCollective !== null && (
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Procédure collective</p>
                <p className={`font-medium ${info.procedureCollective ? "text-score-red" : "text-score-green"}`}>
                  {info.procedureCollective ? "En cours" : "Aucune"}
                </p>
              </div>
            )}
          </div>
          
          {/* Réputation en ligne */}
          {info.reputation && (
            <div className={`p-4 rounded-lg border ${getScoreBgClass(info.reputation.score)}`}>
              <div className="flex items-center gap-3 mb-2">
                <Globe className="h-5 w-5 text-primary" />
                <span className="font-medium text-foreground">Réputation en ligne</span>
                {getScoreIcon(info.reputation.score)}
              </div>
              
              {info.reputation.rating !== undefined && info.reputation.reviews_count !== undefined ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`h-4 w-4 ${
                          star <= Math.round(info.reputation!.rating!)
                            ? "text-yellow-400 fill-yellow-400"
                            : "text-muted-foreground/30"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="font-bold text-foreground">
                    {info.reputation.rating}/5
                  </span>
                  <span className="text-muted-foreground text-sm">
                    ({info.reputation.reviews_count} avis Google)
                  </span>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {info.reputation.explanation.includes("non trouvé") 
                    ? "Établissement non trouvé sur Google"
                    : "Aucun avis disponible"}
                </p>
              )}
            </div>
          )}
          
          {/* Score explanation */}
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className={`text-sm font-medium ${getScoreTextClass(info.score)}`}>
              {info.score === "VERT" && "✓ Entreprise avec des indicateurs de fiabilité positifs."}
              {info.score === "ORANGE" && "⚠️ Certains indicateurs nécessitent une vigilance."}
              {info.score === "ROUGE" && "⚠️ Plusieurs indicateurs de vigilance détectés."}
            </p>
          </div>
          
          <p className="text-xs text-muted-foreground/70 mt-3 italic">
            Informations issues de sources publiques (Infogreffe, BODACC, Google). Ce bloc ne porte aucun jugement sur l'artisan.
          </p>
        </div>
      </div>
    </div>
  );
};

export default BlockEntreprise;
