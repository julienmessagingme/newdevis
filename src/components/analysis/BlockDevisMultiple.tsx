import { CheckCircle2, AlertCircle, XCircle, Receipt, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface PriceAnalysisItem {
  categorie: string;
  libelle: string;
  score: "VERT" | "ORANGE" | "ROUGE";
  prixUnitaireDevis: number;
  fourchetteBasse: number;
  fourchetteHaute: number;
  unite: string;
  zoneType: string;
  explication: string;
}

interface BlockDevisMultipleProps {
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

const getTrendIcon = (score: string | null) => {
  switch (score) {
    case "VERT": return <Minus className="h-4 w-4 text-score-green" />;
    case "ORANGE": return <TrendingUp className="h-4 w-4 text-score-orange" />;
    case "ROUGE": return <TrendingUp className="h-4 w-4 text-score-red" />;
    default: return null;
  }
};

// Parse price analysis items from points_ok and alertes
const extractPriceItems = (pointsOk: string[], alertes: string[]): PriceAnalysisItem[] => {
  const items: PriceAnalysisItem[] = [];
  const allPoints = [...pointsOk, ...alertes];
  
  for (const point of allPoints) {
    const lower = point.toLowerCase();
    
    // Pattern: "✓ Category: prix cohérent (X€/unit)" or "⚠️ Category: prix élevé (X€/unit vs Y€-Z€)"
    // Enhanced pattern to capture category label and price details
    const pricePattern = /(?:✓|⚠️|🚨)\s*(.+?):\s*prix\s*(cohérent|bas|élevé|anormalement bas|excessif)\s*\((\d+(?:[.,]\d+)?)\s*€\/(\w+)(?:\s*vs\s*(\d+(?:[.,]\d+)?)\s*€\s*-\s*(\d+(?:[.,]\d+)?)\s*€)?\)/i;
    const match = point.match(pricePattern);
    
    if (match) {
      const libelle = match[1].trim();
      const appreciation = match[2].toLowerCase();
      const prixUnitaire = parseFloat(match[3].replace(",", "."));
      const unite = match[4];
      const fourchetteBasse = match[5] ? parseFloat(match[5].replace(",", ".")) : 0;
      const fourchetteHaute = match[6] ? parseFloat(match[6].replace(",", ".")) : 0;
      
      let score: "VERT" | "ORANGE" | "ROUGE" = "VERT";
      if (appreciation.includes("excessif") || appreciation.includes("anormalement")) {
        score = "ROUGE";
      } else if (appreciation.includes("élevé") || appreciation.includes("bas")) {
        score = "ORANGE";
      }
      
      items.push({
        categorie: libelle.toLowerCase().replace(/\s+/g, "_"),
        libelle,
        score,
        prixUnitaireDevis: prixUnitaire,
        fourchetteBasse,
        fourchetteHaute,
        unite,
        zoneType: "",
        explication: ""
      });
    }
  }
  
  return items;
};

// Calculate global score from items
const calculateGlobalScore = (items: PriceAnalysisItem[]): "VERT" | "ORANGE" | "ROUGE" => {
  if (items.length === 0) return "VERT";
  
  const redCount = items.filter(i => i.score === "ROUGE").length;
  const orangeCount = items.filter(i => i.score === "ORANGE").length;
  
  if (redCount > 0) return "ROUGE";
  if (orangeCount >= 2 || (orangeCount === 1 && items.length <= 2)) return "ORANGE";
  return "VERT";
};

// Function to filter out price-related items from points_ok/alertes
export const filterOutPriceItems = (items: string[]): string[] => {
  return items.filter(item => {
    const lower = item.toLowerCase();
    const hasPricePattern = /(?:✓|⚠️|🚨)\s*.+?:\s*prix\s*(cohérent|bas|élevé|anormalement|excessif)/i.test(item);
    return !hasPricePattern && 
           !lower.includes("analyse des prix") &&
           !(lower.includes("prix") && (lower.includes("fourchette") || lower.includes("marché")));
  });
};

const BlockDevisMultiple = ({ pointsOk, alertes }: BlockDevisMultipleProps) => {
  const items = extractPriceItems(pointsOk, alertes);
  
  // If no multi-price items found, return null (let BlockDevis handle it)
  if (items.length <= 1) return null;
  
  const globalScore = calculateGlobalScore(items);
  
  return (
    <div className={`border-2 rounded-2xl p-6 mb-6 ${getScoreBgClass(globalScore)}`}>
      <div className="flex items-start gap-4">
        <div className="p-3 bg-background/50 rounded-xl flex-shrink-0">
          <Receipt className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-bold text-foreground text-xl">BLOC 2 — Analyse des prix par type de travaux</h2>
            {getScoreIcon(globalScore, "h-6 w-6")}
          </div>
          
          <p className="text-sm text-muted-foreground mb-4">
            Ce devis comprend {items.length} types de travaux distincts. Chaque catégorie est analysée indépendamment.
          </p>
          
          {/* Price cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {items.map((item, index) => (
              <div 
                key={index} 
                className={`p-4 rounded-xl border-2 ${getScoreBgClass(item.score)}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-medium text-foreground text-sm">{item.libelle}</h3>
                  {getScoreIcon(item.score, "h-5 w-5")}
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Prix devis</span>
                    <span className={`font-semibold ${getScoreTextClass(item.score)}`}>
                      {item.prixUnitaireDevis.toFixed(2)}€/{item.unite}
                    </span>
                  </div>
                  
                  {item.fourchetteBasse > 0 && item.fourchetteHaute > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Fourchette marché</span>
                      <span className="text-xs text-muted-foreground">
                        {item.fourchetteBasse.toFixed(0)}€ - {item.fourchetteHaute.toFixed(0)}€/{item.unite}
                      </span>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-1 mt-2">
                    {getTrendIcon(item.score)}
                    <span className={`text-xs font-medium ${getScoreTextClass(item.score)}`}>
                      {item.score === "VERT" && "Prix cohérent"}
                      {item.score === "ORANGE" && "À surveiller"}
                      {item.score === "ROUGE" && "Hors normes"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {/* Summary */}
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className={`text-sm font-medium ${getScoreTextClass(globalScore)}`}>
              {globalScore === "VERT" && `✓ Les ${items.length} types de travaux présentent des prix cohérents avec le marché.`}
              {globalScore === "ORANGE" && `⚠️ Certains postes méritent une attention particulière.`}
              {globalScore === "ROUGE" && `⚠️ Des écarts significatifs ont été détectés sur certains postes.`}
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

export default BlockDevisMultiple;
