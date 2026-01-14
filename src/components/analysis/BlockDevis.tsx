import { CheckCircle2, AlertCircle, XCircle, Receipt } from "lucide-react";
import MarketComparisonGauge from "./MarketComparisonGauge";
import PedagogicExplanation from "./PedagogicExplanation";

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
  prixTotalNumber: number | null;
  comparaisonMarche: string | null;
  prixMarcheFourchette: string | null;
  prixMinMarche: number | null;
  prixMaxMarche: number | null;
  ecart: "normal" | "elevé" | "tres_elevé" | "inferieur" | null;
  detailMoDoeuvre: boolean | null;
  detailMateriaux: boolean | null;
  tvaApplicable: string | null;
  acomptePourcentage: number | null;
  score: "VERT" | "ORANGE" | "ROUGE";
  explanations: string[];
  hasDevisRelatedInfo: boolean;
}

const extractDevisData = (pointsOk: string[], alertes: string[]): DevisInfo => {
  const allPoints = [...pointsOk, ...alertes];
  
  let prixTotal: string | null = null;
  let prixTotalNumber: number | null = null;
  let comparaisonMarche: string | null = null;
  let prixMarcheFourchette: string | null = null;
  let prixMinMarche: number | null = null;
  let prixMaxMarche: number | null = null;
  let ecart: "normal" | "elevé" | "tres_elevé" | "inferieur" | null = null;
  let detailMoDoeuvre: boolean | null = null;
  let detailMateriaux: boolean | null = null;
  let tvaApplicable: string | null = null;
  let acomptePourcentage: number | null = null;
  let positiveCount = 0;
  let alertCount = 0;
  const explanations: string[] = [];
  let hasDevisRelatedInfo = false;

  const parsePrice = (priceStr: string): number | null => {
    const cleaned = priceStr.replace(/\s/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  };
  
  for (const point of allPoints) {
    const lowerPoint = point.toLowerCase();
    
    // Detect if there's any devis-related content
    if (lowerPoint.includes("prix") || lowerPoint.includes("montant") || 
        lowerPoint.includes("devis") || lowerPoint.includes("total") ||
        lowerPoint.includes("ht") || lowerPoint.includes("ttc") ||
        lowerPoint.includes("calcul") || lowerPoint.includes("cohéren") ||
        lowerPoint.includes("main d'œuvre") || lowerPoint.includes("main-d'œuvre") ||
        lowerPoint.includes("main d'oeuvre") || lowerPoint.includes("matéri") ||
        lowerPoint.includes("fourniture") || lowerPoint.includes("tva") ||
        lowerPoint.includes("remise") || lowerPoint.includes("tarif")) {
      hasDevisRelatedInfo = true;
    }
    
    // Extract prix total
    const prixMatch = point.match(/(?:prix|montant|total)[^\d]*([\d\s,\.]+)\s*€/i);
    if (prixMatch && !lowerPoint.includes("marché") && !lowerPoint.includes("fourchette")) {
      prixTotal = prixMatch[1].trim() + " €";
      prixTotalNumber = parsePrice(prixMatch[1]);
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
        ecart = "inferieur";
        positiveCount++;
      }
      
      // Try to extract fourchette
      const fourchetteMatch = point.match(/([\d\s,\.]+)\s*€?\s*[-–à]\s*([\d\s,\.]+)\s*€/);
      if (fourchetteMatch) {
        prixMarcheFourchette = `${fourchetteMatch[1].trim()} € - ${fourchetteMatch[2].trim()} €`;
        prixMinMarche = parsePrice(fourchetteMatch[1]);
        prixMaxMarche = parsePrice(fourchetteMatch[2]);
      }
    }
    
    // Extract main d'oeuvre/matériaux details
    if (lowerPoint.includes("main d'œuvre") || lowerPoint.includes("main-d'œuvre") || lowerPoint.includes("main d'oeuvre")) {
      if (lowerPoint.includes("détaillé") || lowerPoint.includes("indiqué") || lowerPoint.includes("détaille")) {
        detailMoDoeuvre = true;
        if (pointsOk.includes(point)) positiveCount++;
      } else if (lowerPoint.includes("succinct") || lowerPoint.includes("pas détail") || lowerPoint.includes("imprécis")) {
        detailMoDoeuvre = false;
        if (alertes.includes(point)) {
          alertCount++;
          explanations.push("Le détail de la main d'œuvre n'est pas suffisamment précis.");
        }
      }
    }
    
    if (lowerPoint.includes("matériau") || lowerPoint.includes("fourniture") || lowerPoint.includes("matéri")) {
      if (lowerPoint.includes("détaillé") || lowerPoint.includes("indiqué") || lowerPoint.includes("référence")) {
        detailMateriaux = true;
        if (pointsOk.includes(point)) positiveCount++;
      } else if (lowerPoint.includes("pas détail") || lowerPoint.includes("imprécis")) {
        detailMateriaux = false;
        if (alertes.includes(point)) alertCount++;
      }
    }
    
    // Detect pricing/calculation issues from alertes
    if (alertes.includes(point)) {
      if (lowerPoint.includes("incohéren") && (lowerPoint.includes("prix") || lowerPoint.includes("calcul"))) {
        alertCount++;
        if (!explanations.some(e => e.includes("calcul"))) {
          explanations.push("Des incohérences ont été détectées dans le calcul des prix.");
        }
      }
      if (lowerPoint.includes("structure") && lowerPoint.includes("prix") && lowerPoint.includes("confus")) {
        alertCount++;
        if (!explanations.some(e => e.includes("structure"))) {
          explanations.push("La structure tarifaire du devis manque de clarté.");
        }
      }
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
  } else if (alertCount > 0 || (hasDevisRelatedInfo && positiveCount < 2)) {
    score = "ORANGE";
  } else if (positiveCount >= 2) {
    score = "VERT";
  } else {
    score = "ORANGE";
  }
  
  return {
    prixTotal,
    prixTotalNumber,
    comparaisonMarche,
    prixMarcheFourchette,
    prixMinMarche,
    prixMaxMarche,
    ecart,
    detailMoDoeuvre,
    detailMateriaux,
    tvaApplicable,
    acomptePourcentage,
    score,
    explanations,
    hasDevisRelatedInfo
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
           !lower.includes("calcul") &&
           !lower.includes("structure") && 
           !lower.includes("tarif") &&
           !lower.includes("ht") &&
           !lower.includes("ttc") &&
           !(lower.includes("acompte") && !lower.includes("iban") && !lower.includes("virement"));
  });
};

const BlockDevis = ({ pointsOk, alertes }: BlockDevisProps) => {
  const info = extractDevisData(pointsOk, alertes);
  
  // Check if we have any meaningful data or devis-related info in alerts
  const hasData = info.prixTotal || info.comparaisonMarche || info.detailMoDoeuvre !== null || 
                  info.detailMateriaux !== null || info.tvaApplicable || info.acomptePourcentage !== null ||
                  info.hasDevisRelatedInfo || info.explanations.length > 0;
  
  if (!hasData) return null;
  
  return (
    <div className={`border-2 rounded-2xl p-6 mb-6 ${getScoreBgClass(info.score)}`}>
      <div className="flex items-start gap-4">
        <div className="p-3 bg-background/50 rounded-xl flex-shrink-0">
          <Receipt className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-bold text-foreground text-xl">Devis & Cohérence financière</h2>
            {getScoreIcon(info.score, "h-6 w-6")}
          </div>
          
          <p className="text-sm text-muted-foreground mb-4">
            Vérifier la clarté et la cohérence du devis par rapport au marché.
          </p>
          
          {/* Market Comparison Gauge */}
          {info.ecart && (
            <div className="mb-4">
              <MarketComparisonGauge 
                ecart={info.ecart}
                prixDevis={info.prixTotalNumber}
                prixMinMarche={info.prixMinMarche}
                prixMaxMarche={info.prixMaxMarche}
              />
            </div>
          )}
          
          {/* Info grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Prix total */}
            {info.prixTotal && (
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Prix total TTC</p>
                <p className="font-medium text-foreground text-lg">{info.prixTotal}</p>
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
          
          {/* Explanations for ORANGE/ROUGE with pedagogic framing */}
          {info.explanations.length > 0 && (info.score === "ORANGE" || info.score === "ROUGE") && (
            <PedagogicExplanation type="info" title="Points observés" className="mb-4">
              {info.explanations.map((exp, idx) => (
                <p key={idx} className="mb-1">{exp}</p>
              ))}
              <p className="text-xs text-muted-foreground/80 mt-2 italic">
                Ces éléments sont des observations qui invitent à une vérification, non des alertes critiques.
              </p>
            </PedagogicExplanation>
          )}
          
          {/* Score explanation - harmonized */}
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className={`text-sm font-medium ${getScoreTextClass(info.score)}`}>
              {info.score === "VERT" && "✓ Le devis présente une cohérence financière satisfaisante."}
              {info.score === "ORANGE" && "ℹ️ Certains éléments du devis invitent à une vérification complémentaire."}
              {info.score === "ROUGE" && "⚠️ Certains écarts nécessitent une attention particulière."}
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
              ℹ️ Analyse automatisée. Les comparaisons de prix sont indicatives et ajustées selon la zone géographique. 
              L'objectif est d'aider à la compréhension et à la vigilance, pas de fixer un "bon prix".
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlockDevis;
