import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MarketComparisonGaugeProps {
  ecart: "normal" | "elevé" | "tres_elevé" | "inferieur" | null;
  prixDevis?: number | null;
  prixMinMarche?: number | null;
  prixMaxMarche?: number | null;
}

const MarketComparisonGauge = ({ 
  ecart, 
  prixDevis, 
  prixMinMarche, 
  prixMaxMarche 
}: MarketComparisonGaugeProps) => {
  // Calculate position percentage (0-100)
  // 0-33: inférieur, 33-66: normal, 66-100: supérieur
  let position = 50; // Default to middle
  let gradientColors = "";
  
  switch (ecart) {
    case "inferieur":
      position = 15;
      gradientColors = "from-score-green via-score-green to-score-green";
      break;
    case "normal":
      position = 50;
      gradientColors = "from-score-green via-score-green to-score-orange";
      break;
    case "elevé":
      position = 75;
      gradientColors = "from-score-green via-score-orange to-score-orange";
      break;
    case "tres_elevé":
      position = 92;
      gradientColors = "from-score-green via-score-orange to-score-red";
      break;
    default:
      position = 50;
      gradientColors = "from-score-green via-score-orange to-score-red";
  }

  const getIcon = () => {
    switch (ecart) {
      case "inferieur":
        return <TrendingDown className="h-4 w-4 text-score-green" />;
      case "normal":
        return <Minus className="h-4 w-4 text-score-green" />;
      case "elevé":
        return <TrendingUp className="h-4 w-4 text-score-orange" />;
      case "tres_elevé":
        return <TrendingUp className="h-4 w-4 text-score-red" />;
      default:
        return null;
    }
  };

  const getLabel = () => {
    switch (ecart) {
      case "inferieur":
        return "Inférieur au marché";
      case "normal":
        return "Dans la fourchette";
      case "elevé":
        return "Au-dessus du marché";
      case "tres_elevé":
        return "Très au-dessus";
      default:
        return "Comparaison marché";
    }
  };

  const getPositionColor = () => {
    switch (ecart) {
      case "inferieur":
      case "normal":
        return "bg-score-green";
      case "elevé":
        return "bg-score-orange";
      case "tres_elevé":
        return "bg-score-red";
      default:
        return "bg-primary";
    }
  };

  return (
    <div className="p-4 bg-background/50 rounded-xl border border-border">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-foreground">Position prix vs marché</span>
        <div className="flex items-center gap-1.5">
          {getIcon()}
          <span className={`text-sm font-medium ${
            ecart === "inferieur" || ecart === "normal" ? "text-score-green" :
            ecart === "elevé" ? "text-score-orange" :
            ecart === "tres_elevé" ? "text-score-red" : "text-muted-foreground"
          }`}>
            {getLabel()}
          </span>
        </div>
      </div>
      
      {/* Gauge bar */}
      <div className="relative h-6 rounded-full bg-gradient-to-r from-score-green via-score-orange to-score-red overflow-hidden">
        {/* Zone labels background */}
        <div className="absolute inset-0 flex">
          <div className="flex-1 border-r border-white/20" />
          <div className="flex-1 border-r border-white/20" />
          <div className="flex-1" />
        </div>
        
        {/* Position indicator */}
        <div 
          className="absolute top-1/2 -translate-y-1/2 transition-all duration-500 ease-out"
          style={{ left: `${position}%` }}
        >
          <div className={`relative -ml-3 w-6 h-6 rounded-full ${getPositionColor()} border-2 border-white shadow-lg flex items-center justify-center`}>
            <div className="w-2 h-2 bg-white rounded-full" />
          </div>
          {/* Arrow pointing down */}
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white" />
        </div>
      </div>
      
      {/* Zone labels */}
      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
        <span>Moins cher</span>
        <span>Marché</span>
        <span>Plus cher</span>
      </div>
      
      {/* Optional: show price range if available */}
      {(prixMinMarche || prixMaxMarche) && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Fourchette marché :</span>
            <span className="font-medium text-foreground">
              {prixMinMarche ? `${prixMinMarche.toLocaleString('fr-FR')} €` : '?'} 
              {' - '}
              {prixMaxMarche ? `${prixMaxMarche.toLocaleString('fr-FR')} €` : '?'}
            </span>
          </div>
          {prixDevis && (
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-muted-foreground">Prix du devis :</span>
              <span className={`font-medium ${
                ecart === "inferieur" || ecart === "normal" ? "text-score-green" :
                ecart === "elevé" ? "text-score-orange" :
                ecart === "tres_elevé" ? "text-score-red" : "text-foreground"
              }`}>
                {prixDevis.toLocaleString('fr-FR')} €
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MarketComparisonGauge;
