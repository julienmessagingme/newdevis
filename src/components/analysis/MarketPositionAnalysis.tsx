import { TrendingDown, TrendingUp, Minus, Info } from "lucide-react";
import PedagogicExplanation from "./PedagogicExplanation";

interface MarketPositionAnalysisProps {
  quote_total_ht: number | null;
  market_min_ht: number | null;
  market_avg_ht: number | null;
  market_max_ht: number | null;
  position_ratio?: number | null; // 0 = min, 1 = max
  vs_avg_pct?: number | null; // ex: -0.42 = 42% en dessous
  verdict?: string | null; // "bien placé", "dans la norme", "plutôt cher", "cher"
  verdict_short?: string | null; // phrase courte explicative
}

const formatPrice = (price: number | null | undefined): string => {
  if (price === null || price === undefined) return "—";
  return price.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
};

// Composant de jauge visuelle
const PositionGauge = ({ 
  position_ratio, 
  quote_total_ht,
  market_min_ht,
  market_max_ht,
  market_avg_ht 
}: {
  position_ratio: number | null | undefined;
  quote_total_ht: number | null;
  market_min_ht: number | null;
  market_max_ht: number | null;
  market_avg_ht: number | null;
}) => {
  // Calculer la position si non fournie
  let position = 50; // Défaut au milieu
  
  if (position_ratio !== null && position_ratio !== undefined) {
    position = Math.max(0, Math.min(100, position_ratio * 100));
  } else if (quote_total_ht && market_min_ht !== null && market_max_ht !== null && market_max_ht > market_min_ht) {
    const ratio = (quote_total_ht - market_min_ht) / (market_max_ht - market_min_ht);
    position = Math.max(0, Math.min(100, ratio * 100));
  }

  // Déterminer la couleur selon la position
  const getPositionColor = () => {
    if (position <= 40) return "bg-score-green";
    if (position <= 65) return "bg-score-orange";
    return "bg-score-red";
  };

  // Position du prix moyen sur la jauge (si disponible)
  const avgPosition = market_avg_ht !== null && market_min_ht !== null && market_max_ht !== null && market_max_ht > market_min_ht
    ? ((market_avg_ht - market_min_ht) / (market_max_ht - market_min_ht)) * 100
    : 50;

  return (
    <div className="mt-4 pt-4 border-t border-border/50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">Position dans la fourchette</span>
      </div>
      
      {/* Jauge principale */}
      <div className="relative h-8 rounded-full bg-gradient-to-r from-score-green via-score-orange to-score-red overflow-hidden shadow-inner">
        {/* Marqueurs de zones */}
        <div className="absolute inset-0 flex">
          <div className="flex-1 border-r border-white/20" />
          <div className="flex-1 border-r border-white/20" />
          <div className="flex-1" />
        </div>
        
        {/* Indicateur du prix moyen */}
        <div 
          className="absolute top-0 bottom-0 w-0.5 bg-white/60"
          style={{ left: `${avgPosition}%` }}
        >
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground whitespace-nowrap">
            Moy.
          </div>
        </div>
        
        {/* Indicateur de position du devis */}
        <div 
          className="absolute top-1/2 -translate-y-1/2 transition-all duration-500 ease-out z-10"
          style={{ left: `${position}%` }}
        >
          <div className={`relative -ml-4 w-8 h-8 rounded-full ${getPositionColor()} border-3 border-white shadow-lg flex items-center justify-center`}>
            <div className="w-2.5 h-2.5 bg-white rounded-full" />
          </div>
          {/* Étiquette du prix */}
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-medium text-foreground whitespace-nowrap bg-background/80 px-1 rounded">
            Devis
          </div>
        </div>
      </div>
      
      {/* Légendes */}
      <div className="flex justify-between mt-6 text-xs text-muted-foreground">
        <div className="text-left">
          <span className="block font-medium text-score-green">Moins cher</span>
          <span className="text-[10px]">{formatPrice(market_min_ht)}</span>
        </div>
        <div className="text-center">
          <span className="block font-medium text-score-orange">Marché</span>
          <span className="text-[10px]">{formatPrice(market_avg_ht)}</span>
        </div>
        <div className="text-right">
          <span className="block font-medium text-score-red">Plus cher</span>
          <span className="text-[10px]">{formatPrice(market_max_ht)}</span>
        </div>
      </div>
    </div>
  );
};

const MarketPositionAnalysis = ({
  quote_total_ht,
  market_min_ht,
  market_avg_ht,
  market_max_ht,
  position_ratio,
  vs_avg_pct,
  verdict,
  verdict_short,
}: MarketPositionAnalysisProps) => {
  // Déterminer le style selon le verdict
  const getVerdictStyle = () => {
    const v = verdict?.toLowerCase() || "";
    if (v.includes("bien placé") || v.includes("inférieur")) {
      return {
        color: "text-score-green",
        bg: "bg-score-green-bg",
        border: "border-score-green/30",
        icon: <TrendingDown className="h-5 w-5 text-score-green" />,
        type: "positive" as const,
      };
    }
    if (v.includes("norme") || v.includes("normal") || v.includes("moyen")) {
      return {
        color: "text-score-green",
        bg: "bg-score-green-bg",
        border: "border-score-green/30",
        icon: <Minus className="h-5 w-5 text-score-green" />,
        type: "positive" as const,
      };
    }
    if (v.includes("plutôt cher") || v.includes("élevé")) {
      return {
        color: "text-score-orange",
        bg: "bg-score-orange-bg",
        border: "border-score-orange/30",
        icon: <TrendingUp className="h-5 w-5 text-score-orange" />,
        type: "vigilance" as const,
      };
    }
    if (v.includes("cher") || v.includes("très")) {
      return {
        color: "text-score-red",
        bg: "bg-score-red-bg",
        border: "border-score-red/30",
        icon: <TrendingUp className="h-5 w-5 text-score-red" />,
        type: "vigilance" as const,
      };
    }
    return {
      color: "text-muted-foreground",
      bg: "bg-muted/50",
      border: "border-border",
      icon: <Info className="h-5 w-5 text-muted-foreground" />,
      type: "info" as const,
    };
  };

  const style = getVerdictStyle();

  // Générer l'interprétation
  const getInterpretation = (): string => {
    if (!quote_total_ht || !market_avg_ht) {
      return "Les données disponibles ne permettent pas une comparaison complète avec les prix du marché.";
    }

    const ecartPct = vs_avg_pct !== null && vs_avg_pct !== undefined 
      ? Math.abs(vs_avg_pct * 100).toFixed(0) 
      : null;
    
    if (vs_avg_pct !== null && vs_avg_pct !== undefined) {
      if (vs_avg_pct < -0.25) {
        return `Le montant de ${formatPrice(quote_total_ht)} HT se situe nettement en dessous du prix moyen observé sur le marché (${ecartPct} % de moins). Cela suggère un devis bien positionné, tout en restant dans des niveaux cohérents pour ce type de prestation.`;
      }
      if (vs_avg_pct < -0.10) {
        return `Le montant de ${formatPrice(quote_total_ht)} HT est légèrement inférieur au prix moyen du marché (${ecartPct} % de moins). Le positionnement tarifaire apparaît compétitif.`;
      }
      if (vs_avg_pct <= 0.10) {
        return `Le montant de ${formatPrice(quote_total_ht)} HT se situe dans la moyenne des prix observés sur le marché. Ce positionnement est cohérent avec les tarifs habituels pour ce type de travaux.`;
      }
      if (vs_avg_pct <= 0.25) {
        return `Le montant de ${formatPrice(quote_total_ht)} HT est légèrement supérieur au prix moyen du marché (${ecartPct} % de plus). Cela reste dans une fourchette acceptable selon les conditions du chantier.`;
      }
      return `Le montant de ${formatPrice(quote_total_ht)} HT est sensiblement supérieur au prix moyen du marché (${ecartPct} % de plus). Il peut être utile de demander des précisions sur les éléments justifiant ce tarif.`;
    }

    if (verdict_short) {
      return verdict_short;
    }

    return `Le montant de ${formatPrice(quote_total_ht)} HT a été comparé aux références de marché disponibles.`;
  };

  const hasMarketData = market_min_ht !== null || market_avg_ht !== null || market_max_ht !== null;
  
  if (!hasMarketData && !quote_total_ht) {
    return null;
  }

  const showGauge = hasMarketData && quote_total_ht !== null;

  return (
    <div className="space-y-4">
      {/* Titre */}
      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <Info className="h-5 w-5 text-primary" />
        Analyse du positionnement prix
      </h3>

      {/* Bloc 1 – Résumé clair + Jauge */}
      <div className={`p-4 rounded-xl border ${style.bg} ${style.border}`}>
        <div className="space-y-3">
          {quote_total_ht !== null && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Prix du devis</span>
              <span className="text-lg font-bold text-foreground">
                {formatPrice(quote_total_ht)} HT
              </span>
            </div>
          )}

          {hasMarketData && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Fourchette de marché</span>
              <span className="text-sm font-medium text-foreground">
                {formatPrice(market_min_ht)} → {formatPrice(market_max_ht)} HT
              </span>
            </div>
          )}

          {market_avg_ht !== null && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Prix moyen du marché</span>
              <span className="text-sm font-medium text-foreground">
                {formatPrice(market_avg_ht)} HT
              </span>
            </div>
          )}

          {verdict && (
            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <span className="text-sm text-muted-foreground">Verdict</span>
              <div className="flex items-center gap-2">
                {style.icon}
                <span className={`font-semibold ${style.color}`}>
                  {verdict.charAt(0).toUpperCase() + verdict.slice(1)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Jauge visuelle */}
        {showGauge && (
          <PositionGauge
            position_ratio={position_ratio}
            quote_total_ht={quote_total_ht}
            market_min_ht={market_min_ht}
            market_max_ht={market_max_ht}
            market_avg_ht={market_avg_ht}
          />
        )}
      </div>

      {/* Bloc 2 – Interprétation */}
      <PedagogicExplanation type={style.type} title="Interprétation">
        {getInterpretation()}
      </PedagogicExplanation>

      {/* Bloc 3 – Message de prudence */}
      <PedagogicExplanation type="info" title="À noter">
        Cette analyse est indicative et basée sur des moyennes de marché. 
        Les prix peuvent varier selon le contexte spécifique du chantier : 
        complexité des travaux, qualité des matériaux, urgence, zone géographique, 
        ou conditions d'accès au site.
      </PedagogicExplanation>
    </div>
  );
};

export default MarketPositionAnalysis;
