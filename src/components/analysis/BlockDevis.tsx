import { CheckCircle2, AlertCircle, XCircle, Receipt } from "lucide-react";

interface BlockDevisProps {
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

interface DevisInfo {
  prixTotal: string | null;
  comparaisonMarche: string | null;
  prixMarcheFourchette: string | null;
  ecart: "normal" | "elevé" | "tres_elevé" | null;
  detailMoDoeuvre: boolean | null;
  detailMateriaux: boolean | null;
  tvaApplicable: string | null;
  acomptePourcentage: number | null;
  score: "VERT" | "ORANGE" | "ROUGE";
  explanations: string[];
}

const extractDevisData = (pointsOk: string[], alertes: string[]): DevisInfo => {
  const allPoints = [...pointsOk, ...alertes];
  
  let prixTotal: string | null = null;
  let comparaisonMarche: string | null = null;
  let prixMarcheFourchette: string | null = null;
  let ecart: "normal" | "elevé" | "tres_elevé" | null = null;
  let detailMoDoeuvre: boolean | null = null;
  let detailMateriaux: boolean | null = null;
  let tvaApplicable: string | null = null;
  let acomptePourcentage: number | null = null;
  let positiveCount = 0;
  let alertCount = 0;
  const explanations: string[] = [];
  
  for (const point of allPoints) {
    const lowerPoint = point.toLowerCase();
    
    // Extract prix total
    const prixMatch = point.match(/(?:prix|montant|total)[^\d]*([\d\s,\.]+)\s*€/i);
    if (prixMatch && !lowerPoint.includes("marché") && !lowerPoint.includes("fourchette")) {
      prixTotal = prixMatch[1].trim() + " €";
    }
    
    // Extract comparaison marché
    if (lowerPoint.includes("marché") || lowerPoint.includes("fourchette") || lowerPoint.includes("prix de référence")) {
      if (lowerPoint.includes("conforme") || lowerPoint.includes("dans la fourchette") || lowerPoint.includes("cohérent")) {
        comparaisonMarche = "Conforme au marché";
        ecart = "normal";
        positiveCount++;
      } else if (lowerPoint.includes("supérieur") || lowerPoint.includes("élevé")) {
        if (lowerPoint.includes("très") || lowerPoint.includes("significativement")) {
          comparaisonMarche = "Très supérieur au marché";
          ecart = "tres_elevé";
          alertCount += 2;
          explanations.push("Le prix est significativement supérieur aux références du marché pour ce type de travaux.");
        } else {
          comparaisonMarche = "Supérieur au marché";
          ecart = "elevé";
          alertCount++;
          explanations.push("Le prix est supérieur à la moyenne du marché. Il peut être justifié par des spécificités du chantier.");
        }
      } else if (lowerPoint.includes("inférieur")) {
        comparaisonMarche = "Inférieur au marché";
        positiveCount++;
      }
      
      // Try to extract fourchette
      const fourchetteMatch = point.match(/([\d\s,\.]+)\s*€?\s*[-–à]\s*([\d\s,\.]+)\s*€/);
      if (fourchetteMatch) {
        prixMarcheFourchette = `${fourchetteMatch[1].trim()} € - ${fourchetteMatch[2].trim()} €`;
      }
    }
    
    // Extract main d'oeuvre/matériaux details
    if (lowerPoint.includes("main d'œuvre") || lowerPoint.includes("main-d'œuvre") || lowerPoint.includes("main d'oeuvre")) {
      detailMoDoeuvre = lowerPoint.includes("détaillé") || lowerPoint.includes("indiqué") || pointsOk.includes(point);
      if (detailMoDoeuvre) positiveCount++;
    }
    
    if (lowerPoint.includes("matériau") || lowerPoint.includes("fourniture")) {
      detailMateriaux = lowerPoint.includes("détaillé") || lowerPoint.includes("indiqué") || pointsOk.includes(point);
      if (detailMateriaux) positiveCount++;
    }
    
    // Extract TVA
    if (lowerPoint.includes("tva")) {
      const tvaMatch = point.match(/(\d+(?:[\.,]\d+)?)\s*%/);
      if (tvaMatch) {
        tvaApplicable = tvaMatch[1] + " %";
      }
      if (pointsOk.includes(point)) positiveCount++;
    }
    
    // Extract acompte
    if (lowerPoint.includes("acompte") && !lowerPoint.includes("iban") && !lowerPoint.includes("virement")) {
      const acompteMatch = point.match(/(\d+)\s*%/);
      if (acompteMatch) {
        acomptePourcentage = parseInt(acompteMatch[1], 10);
      }
    }
  }
  
  // Determine overall score
  let score: "VERT" | "ORANGE" | "ROUGE";
  if (alertCount >= 2 || ecart === "tres_elevé") {
    score = "ROUGE";
  } else if (alertCount > 0 || positiveCount < 2) {
    score = "ORANGE";
  } else {
    score = "VERT";
  }
  
  return {
    prixTotal,
    comparaisonMarche,
    prixMarcheFourchette,
    ecart,
    detailMoDoeuvre,
    detailMateriaux,
    tvaApplicable,
    acomptePourcentage,
    score,
    explanations
  };
};

// Function to filter out devis-related items from points_ok/alertes
export const filterOutDevisItems = (items: string[]): string[] => {
  return items.filter(item => {
    const lower = item.toLowerCase();
    return !lower.includes("prix") && 
           !lower.includes("montant") &&
           !lower.includes("marché") &&
           !lower.includes("fourchette") &&
           !lower.includes("main d'œuvre") &&
           !lower.includes("main-d'œuvre") &&
           !lower.includes("main d'oeuvre") &&
           !lower.includes("matériau") &&
           !lower.includes("fourniture") &&
           !lower.includes("tva") &&
           !(lower.includes("acompte") && !lower.includes("iban") && !lower.includes("virement"));
  });
};

const BlockDevis = ({ pointsOk, alertes }: BlockDevisProps) => {
  const info = extractDevisData(pointsOk, alertes);
  
  // Check if we have any meaningful data
  const hasData = info.prixTotal || info.comparaisonMarche || info.detailMoDoeuvre !== null || 
                  info.detailMateriaux !== null || info.tvaApplicable || info.acomptePourcentage !== null;
  
  if (!hasData) return null;
  
  return (
    <div className={`border-2 rounded-2xl p-6 mb-6 ${getScoreBgClass(info.score)}`}>
      <div className="flex items-start gap-4">
        <div className="p-3 bg-background/50 rounded-xl flex-shrink-0">
          <Receipt className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-bold text-foreground text-xl">BLOC 2 — Devis & Cohérence financière</h2>
            {getScoreIcon(info.score, "h-6 w-6")}
          </div>
          
          <p className="text-sm text-muted-foreground mb-4">
            Vérifier la clarté et la cohérence du devis par rapport au marché.
          </p>
          
          {/* Info grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Prix total */}
            {info.prixTotal && (
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Prix total TTC</p>
                <p className="font-medium text-foreground text-lg">{info.prixTotal}</p>
              </div>
            )}
            
            {/* Comparaison marché */}
            {info.comparaisonMarche && (
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Comparaison marché</p>
                <p className={`font-medium ${
                  info.ecart === "normal" ? "text-score-green" :
                  info.ecart === "elevé" ? "text-score-orange" :
                  info.ecart === "tres_elevé" ? "text-score-red" : "text-foreground"
                }`}>
                  {info.comparaisonMarche}
                </p>
                {info.prixMarcheFourchette && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Fourchette : {info.prixMarcheFourchette}
                  </p>
                )}
              </div>
            )}
            
            {/* Détail main d'oeuvre */}
            {info.detailMoDoeuvre !== null && (
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Détail main d'œuvre</p>
                <p className={`font-medium ${info.detailMoDoeuvre ? "text-score-green" : "text-score-orange"}`}>
                  {info.detailMoDoeuvre ? "Détaillé" : "Non détaillé"}
                </p>
              </div>
            )}
            
            {/* Détail matériaux */}
            {info.detailMateriaux !== null && (
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Détail matériaux</p>
                <p className={`font-medium ${info.detailMateriaux ? "text-score-green" : "text-score-orange"}`}>
                  {info.detailMateriaux ? "Détaillé" : "Non détaillé"}
                </p>
              </div>
            )}
            
            {/* TVA */}
            {info.tvaApplicable && (
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">TVA applicable</p>
                <p className="font-medium text-foreground">{info.tvaApplicable}</p>
              </div>
            )}
            
            {/* Acompte */}
            {info.acomptePourcentage !== null && (
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Acompte demandé</p>
                <p className={`font-medium ${
                  info.acomptePourcentage <= 30 ? "text-score-green" :
                  info.acomptePourcentage <= 50 ? "text-score-orange" : "text-score-red"
                }`}>
                  {info.acomptePourcentage}%
                </p>
              </div>
            )}
          </div>
          
          {/* Explanations for ORANGE/ROUGE */}
          {info.explanations.length > 0 && (info.score === "ORANGE" || info.score === "ROUGE") && (
            <div className="mb-4 p-3 bg-background/50 rounded-lg border border-border">
              <p className="text-sm font-medium text-foreground mb-2">💡 Explications :</p>
              {info.explanations.map((exp, idx) => (
                <p key={idx} className="text-sm text-muted-foreground">{exp}</p>
              ))}
            </div>
          )}
          
          {/* Score explanation */}
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className={`text-sm font-medium ${getScoreTextClass(info.score)}`}>
              {info.score === "VERT" && "✓ Le devis présente une cohérence financière satisfaisante."}
              {info.score === "ORANGE" && "⚠️ Certains éléments du devis méritent une attention particulière."}
              {info.score === "ROUGE" && "⚠️ Des écarts significatifs ont été détectés sur ce devis."}
            </p>
          </div>
          
          <p className="text-xs text-muted-foreground/70 mt-3 italic">
            Comparaison effectuée avec les prix de référence du marché, ajustés selon la zone géographique. Ces données sont indicatives.
          </p>
        </div>
      </div>
    </div>
  );
};

export default BlockDevis;
