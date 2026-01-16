import { CheckCircle2, AlertCircle, XCircle, Star, Building2, Globe } from "lucide-react";
import InfoTooltip from "./InfoTooltip";
import PedagogicExplanation from "./PedagogicExplanation";

interface ReputationOnline {
  rating?: number;
  reviews_count?: number;
  score: "VERT" | "ORANGE" | "ROUGE";
  explanation: string;
  status: "found" | "uncertain" | "not_found" | "not_searched";
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
  let lookupStatus: "ok" | "not_found" | "error" | "skipped" | null = null;
  
  // Track if we found any reputation-related info
  let reputationSearched = false;
  
  // Helper: Check if point is informational (ℹ️) - these NEVER count as alerts
  const isInformational = (point: string): boolean => {
    return point.includes("ℹ️") || 
           point.toLowerCase().includes("non concluante") ||
           point.toLowerCase().includes("indisponible temporairement") ||
           point.toLowerCase().includes("n'indique pas un problème") ||
           point.toLowerCase().includes("n'indique pas un risque");
  };
  
  for (const point of allPoints) {
    const lowerPoint = point.toLowerCase();
    
    // CRITICAL: Detect lookup status from messages
    if (lowerPoint.includes("vérification registre non concluante") || 
        lowerPoint.includes("recherche non concluante")) {
      lookupStatus = "not_found";
    } else if (lowerPoint.includes("vérification registre indisponible")) {
      lookupStatus = "error";
    } else if (lowerPoint.includes("entreprise identifiée")) {
      lookupStatus = "ok";
    }
    
    // Extract SIREN/SIRET
    if (lowerPoint.includes("siret") || lowerPoint.includes("siren")) {
      const match = point.match(/(\d{9,14})/);
      if (match) {
        siren_siret = match[1];
      }
      // CRITICAL: Informational points (ℹ️) NEVER count as alerts
      if (isInformational(point)) {
        // Neutral - no impact on score
      } else if (lowerPoint.includes("valide") || pointsOk.includes(point)) {
        positiveCount++;
      } else if (alertes.includes(point) && !isInformational(point)) {
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
    
    // Extract reputation - Case A: Rating found
    const ratingMatch = point.match(/[rR]éputation en ligne.*?(\d+(?:[.,]\d+)?)\s*\/\s*5.*?\((\d+)\s*avis/i);
    if (ratingMatch) {
      reputationSearched = true;
      const rating = parseFloat(ratingMatch[1].replace(',', '.'));
      const reviewsCount = parseInt(ratingMatch[2], 10);
      
      // IMPORTANT: Reputation NEVER triggers ROUGE
      // It's informational only - never a critical criterion
      let score: "VERT" | "ORANGE";
      if (rating >= 4.0) {
        score = "VERT";
        positiveCount++;
      } else {
        // Any rating < 4.0 is just ORANGE (informational)
        // Does NOT increment alertCount - reputation is not critical
        score = "ORANGE";
      }
      
      reputation = {
        rating,
        reviews_count: reviewsCount,
        score,
        explanation: point,
        status: "found"
      };
    } 
    // Case B: Uncertain match - ALWAYS show but never critical
    else if (lowerPoint.includes("réputation en ligne") && (lowerPoint.includes("correspondance incertaine") || lowerPoint.includes("incertaine") || lowerPoint.includes("à confirmer"))) {
      reputationSearched = true;
      reputation = {
        score: "ORANGE",
        explanation: "Note non affichée (correspondance à confirmer)",
        status: "uncertain"
      };
    }
    // Case C: Not found but searched - not a negative factor
    else if (lowerPoint.includes("réputation en ligne") && (lowerPoint.includes("aucun avis") || lowerPoint.includes("non trouvé") || lowerPoint.includes("non disponible"))) {
      reputationSearched = true;
      reputation = {
        score: "ORANGE",
        explanation: point,
        status: "not_found"
      };
    }
  }
  
  // ALWAYS show reputation block if company is identifiable (has SIREN/SIRET)
  // If not found in points, create default - NEVER critical
  if (!reputation) {
    if (siren_siret) {
      // Company is identifiable - show reputation section
      reputation = {
        score: "ORANGE",
        explanation: reputationSearched ? "Recherche effectuée" : "Recherche en attente",
        status: reputationSearched ? "not_found" : "not_searched"
      };
    } else {
      // Company not identifiable - still show section but note it
      reputation = {
        score: "ORANGE",
        explanation: "Entreprise non identifiable avec certitude",
        status: "not_searched"
      };
    }
  }
  
  // ============================================================
  // SCORING RULES FOR ENTREPRISE BLOC
  // ============================================================
  // ROUGE: ONLY for CONFIRMED critical issues:
  //   - procedureCollective === true (confirmed)
  //   - Capitaux propres négatifs (confirmed from alertes with 🔴)
  //   - Entreprise radiée (confirmed status, not 404)
  // ORANGE: Minor vigilance points
  // VERT: No issues
  // 
  // CRITICAL: not_found / error / informational → NEVER ROUGE
  // ============================================================
  
  // Count only REAL critical alerts (🔴 in alertes, not informational)
  const criticalAlertCount = alertes.filter(a => 
    a.includes("🔴") && 
    !isInformational(a) &&
    (a.toLowerCase().includes("procédure collective") ||
     a.toLowerCase().includes("capitaux propres négatifs") ||
     a.toLowerCase().includes("radiée") ||
     a.toLowerCase().includes("cessation") ||
     a.toLowerCase().includes("dissoute") ||
     a.toLowerCase().includes("liquidation"))
  ).length;
  
  let score: "VERT" | "ORANGE" | "ROUGE";
  if (procedureCollective === true || criticalAlertCount > 0) {
    // Only explicit critical issues trigger ROUGE
    score = "ROUGE";
  } else if (alertCount > 0 && lookupStatus !== "not_found" && lookupStatus !== "error") {
    // Minor alerts (not from lookup failures) → ORANGE
    score = "ORANGE";
  } else if (positiveCount < 2 && lookupStatus !== "ok") {
    // Not enough positive data, but NOT failure → ORANGE (neutral zone)
    score = "ORANGE";
  } else if (positiveCount >= 2) {
    score = "VERT";
  } else {
    // Default to ORANGE for neutral/unknown cases, NEVER ROUGE
    score = "ORANGE";
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
           !lower.includes("avis google") &&
           !lower.includes("entreprise identifiée") &&
           !lower.includes("entreprise établie") &&
           !lower.includes("entreprise récente") &&
           !lower.includes("vérification registre") &&
           !lower.includes("recherche non concluante") &&
           !lower.includes("societe.com") &&
           !lower.includes("infogreffe") &&
           !lower.includes("établissement non trouvé") &&
           !lower.includes("qualification rge") &&
           !lower.includes("qualibat");
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
            <h2 className="font-bold text-foreground text-xl">Entreprise & Fiabilité</h2>
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
          
          {/* Réputation en ligne - ALWAYS VISIBLE */}
          <div className={`p-4 rounded-lg border ${getScoreBgClass(info.reputation?.score || "ORANGE")}`}>
            <div className="flex items-center gap-3 mb-2">
              <Globe className="h-5 w-5 text-primary" />
              <span className="font-medium text-foreground">Réputation en ligne (Google)</span>
              <InfoTooltip
                title="Pourquoi la note Google est prise en compte ?"
                content="Les avis clients permettent d'identifier des tendances générales (ponctualité, relation client, SAV, communication), sans jamais constituer une preuve à eux seuls. Une note inférieure au seuil de confort invite simplement à consulter le détail des avis pour se faire sa propre opinion."
              />
              {getScoreIcon(info.reputation?.score || "ORANGE")}
            </div>
            
            {/* Case A: Rating found */}
            {info.reputation?.status === "found" && info.reputation.rating !== undefined && info.reputation.reviews_count !== undefined ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
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
                    {info.reputation.rating.toFixed(1).replace('.', ',')}/5
                  </span>
                  <span className="text-muted-foreground text-sm">
                    ({info.reputation.reviews_count} avis)
                  </span>
                  <span className="text-xs text-muted-foreground/70 ml-2">
                    Source: Google
                  </span>
                </div>
                {/* Explication pédagogique si note < 4/5 (score ORANGE) */}
                {info.reputation.rating < 4.0 && (
                  <PedagogicExplanation type="info" className="mt-3">
                    <p className="mb-2">
                      La note moyenne observée est inférieure au seuil de confort généralement constaté pour ce type de prestation.
                    </p>
                    <p className="mb-2">
                      <strong>Ce que cela signifie :</strong> Ce critère est un indicateur parmi d'autres. Il ne constitue ni un jugement ni une preuve d'un problème.
                    </p>
                    <p className="mb-2">
                      <strong>Ce que vous pouvez faire :</strong> Consultez le détail des avis (leur contenu, leur ancienneté et leur récurrence) pour vous faire votre propre opinion.
                    </p>
                    <p className="text-xs text-muted-foreground/80 italic">
                      La réputation en ligne est utilisée comme un indicateur complémentaire parmi d'autres critères objectifs.
                    </p>
                  </PedagogicExplanation>
                )}
                {/* Message positif si note >= 4/5 */}
                {info.reputation.rating >= 4.0 && (
                  <p className="text-sm text-score-green mt-2">
                    ✓ La note Google est au-dessus du seuil de confort habituellement observé.
                  </p>
                )}
              </div>
            ) : info.reputation?.status === "uncertain" ? (
              /* Case B: Uncertain match */
              <PedagogicExplanation type="info">
                <p className="font-medium text-foreground mb-1">
                  Note Google : non affichée (correspondance à confirmer)
                </p>
                <p>
                  La recherche Google a été effectuée mais l'établissement trouvé ne correspond peut-être pas exactement à cette entreprise. 
                  Ce critère n'est pas pris en compte dans le score.
                </p>
              </PedagogicExplanation>
            ) : (
              /* Case C: Not found or not searched */
              <PedagogicExplanation type="info">
                <p className="font-medium text-foreground mb-1">
                  Note Google : information non exploitée automatiquement
                </p>
                <p>
                  {info.reputation?.status === "not_found" 
                    ? "La recherche d'avis a été effectuée mais aucun résultat exploitable n'a été trouvé pour cet établissement. Cela n'indique pas un problème en soi — de nombreux artisans fiables n'ont pas de présence en ligne."
                    : "La recherche d'avis a été effectuée. L'absence de données en ligne n'affecte pas le score global."}
                </p>
              </PedagogicExplanation>
            )}
          </div>
          
          {/* Score explanation with pedagogic message */}
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className={`text-sm font-medium ${getScoreTextClass(info.score)}`}>
              {info.score === "VERT" && "✓ Entreprise avec des indicateurs de fiabilité positifs."}
              {info.score === "ORANGE" && "ℹ️ Certains indicateurs invitent à une vérification complémentaire."}
              {info.score === "ROUGE" && "⚠️ Certains indicateurs nécessitent une attention particulière."}
            </p>
            {info.score === "ORANGE" && (
              <p className="text-xs text-muted-foreground mt-2">
                Aucun élément critique n'a été détecté. Les points signalés sont des invitations à vérifier, non des alertes.
              </p>
            )}
          </div>
          
          {/* Disclaimer - harmonized */}
          <div className="mt-3 p-2 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground/70 italic">
              ℹ️ Analyse automatisée à partir de sources publiques (Infogreffe, BODACC, Google). 
              Ces informations constituent une aide à la décision et ne portent aucun jugement sur l'artisan.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlockEntreprise;
