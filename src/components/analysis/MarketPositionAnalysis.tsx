import { TrendingDown, TrendingUp, Minus, Info, AlertCircle } from "lucide-react";

interface MarketPositionAnalysisProps {
  quote_total_ht: number | null;
  market_min_ht: number | null;
  market_avg_ht: number | null;
  market_max_ht: number | null;
  position_ratio?: number | null;
  vs_avg_pct?: number | null;
  verdict?: string | null;
  verdict_short?: string | null;
}

const formatPrice = (price: number | null | undefined): string => {
  if (price === null || price === undefined) return "—";
  return price.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
};

// ============================================================
// RÈGLES STRICTES DE POSITIONNEMENT
// ============================================================

type PositionCategory = "below_market" | "well_positioned" | "above_average" | "above_market";

interface PositionInfo {
  category: PositionCategory;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
}

function computePosition(
  devis_ht: number,
  total_min_ht: number,
  total_avg_ht: number,
  total_max_ht: number
): PositionInfo {
  // En dessous du marché: devis_ht < total_min_ht
  if (devis_ht < total_min_ht) {
    return {
      category: "below_market",
      label: "En dessous du marché",
      color: "text-score-orange",
      bgColor: "bg-score-orange/10",
      borderColor: "border-score-orange/30",
      icon: <TrendingDown className="h-5 w-5 text-score-orange" />,
    };
  }

  // Bien positionné: devis_ht >= total_min_ht ET devis_ht <= total_avg_ht
  if (devis_ht >= total_min_ht && devis_ht <= total_avg_ht) {
    return {
      category: "well_positioned",
      label: "Bien positionné",
      color: "text-score-green",
      bgColor: "bg-score-green/10",
      borderColor: "border-score-green/30",
      icon: <Minus className="h-5 w-5 text-score-green" />,
    };
  }

  // Au-dessus de la moyenne: devis_ht > total_avg_ht ET devis_ht <= total_max_ht
  if (devis_ht > total_avg_ht && devis_ht <= total_max_ht) {
    return {
      category: "above_average",
      label: "Au-dessus de la moyenne",
      color: "text-score-orange",
      bgColor: "bg-score-orange/10",
      borderColor: "border-score-orange/30",
      icon: <TrendingUp className="h-5 w-5 text-score-orange" />,
    };
  }

  // Au-dessus du marché: devis_ht > total_max_ht
  return {
    category: "above_market",
    label: "Au-dessus du marché",
    color: "text-score-red",
    bgColor: "bg-score-red/10",
    borderColor: "border-score-red/30",
    icon: <TrendingUp className="h-5 w-5 text-score-red" />,
  };
}

// ============================================================
// COMPOSANT DE JAUGE VISUELLE
// ============================================================

interface PositionGaugeProps {
  devis_ht: number;
  total_min_ht: number;
  total_avg_ht: number;
  total_max_ht: number;
  positionInfo: PositionInfo;
}

const PositionGauge = ({ 
  devis_ht,
  total_min_ht,
  total_avg_ht,
  total_max_ht,
  positionInfo,
}: PositionGaugeProps) => {
  // Calculer la position du curseur (0-100%)
  // On étend la jauge de 15% en dessous du min et 15% au-dessus du max pour les cas extrêmes
  const range = total_max_ht - total_min_ht;
  const extendedMin = total_min_ht - range * 0.15;
  const extendedMax = total_max_ht + range * 0.15;
  const extendedRange = extendedMax - extendedMin;
  
  let position = ((devis_ht - extendedMin) / extendedRange) * 100;
  position = Math.max(2, Math.min(98, position)); // Limiter entre 2% et 98%
  
  // Positions des bornes sur la jauge
  const minPosition = ((total_min_ht - extendedMin) / extendedRange) * 100;
  const avgPosition = ((total_avg_ht - extendedMin) / extendedRange) * 100;
  const maxPosition = ((total_max_ht - extendedMin) / extendedRange) * 100;

  // Couleur du curseur selon la position
  const getCursorColor = () => {
    switch (positionInfo.category) {
      case "well_positioned":
        return "bg-score-green";
      case "below_market":
      case "above_average":
        return "bg-score-orange";
      case "above_market":
        return "bg-score-red";
      default:
        return "bg-primary";
    }
  };

  return (
    <div className="mt-6 pt-4 border-t border-border/50">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-foreground">Position du devis</span>
        <div className="flex items-center gap-2">
          {positionInfo.icon}
          <span className={`text-sm font-semibold ${positionInfo.color}`}>
            {positionInfo.label}
          </span>
        </div>
      </div>
      
      {/* Jauge principale */}
      <div className="relative h-10 rounded-full bg-gradient-to-r from-score-green via-score-orange to-score-red overflow-visible shadow-inner">
        {/* Marqueurs des bornes */}
        <div 
          className="absolute top-0 bottom-0 w-0.5 bg-white/70 z-10"
          style={{ left: `${minPosition}%` }}
        >
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground whitespace-nowrap">
            Min
          </div>
        </div>
        <div 
          className="absolute top-0 bottom-0 w-0.5 bg-white/90 z-10"
          style={{ left: `${avgPosition}%` }}
        >
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-medium text-foreground whitespace-nowrap">
            Moyenne
          </div>
        </div>
        <div 
          className="absolute top-0 bottom-0 w-0.5 bg-white/70 z-10"
          style={{ left: `${maxPosition}%` }}
        >
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground whitespace-nowrap">
            Max
          </div>
        </div>
        
        {/* Curseur du devis */}
        <div 
          className="absolute top-1/2 -translate-y-1/2 transition-all duration-500 ease-out z-20"
          style={{ left: `${position}%` }}
        >
          <div className={`relative -ml-5 w-10 h-10 rounded-full ${getCursorColor()} border-4 border-white shadow-xl flex items-center justify-center`}>
            <div className="w-3 h-3 bg-white rounded-full" />
          </div>
          {/* Étiquette du prix */}
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs font-bold text-foreground whitespace-nowrap bg-background px-2 py-0.5 rounded shadow-sm border border-border">
            {formatPrice(devis_ht)}
          </div>
        </div>
      </div>
      
      {/* Légendes des prix */}
      <div className="flex justify-between mt-8 text-xs">
        <div className="text-left">
          <span className="block font-medium text-score-green">Min marché</span>
          <span className="text-muted-foreground">{formatPrice(total_min_ht)}</span>
        </div>
        <div className="text-center">
          <span className="block font-medium text-score-orange">Moyenne marché</span>
          <span className="text-muted-foreground">{formatPrice(total_avg_ht)}</span>
        </div>
        <div className="text-right">
          <span className="block font-medium text-score-red">Max marché</span>
          <span className="text-muted-foreground">{formatPrice(total_max_ht)}</span>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// MESSAGE "NON DISPONIBLE"
// ============================================================

const UnavailableMessage = () => (
  <div className="p-4 rounded-xl border bg-muted/30 border-border">
    <div className="flex items-start gap-3">
      <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
      <p className="text-sm text-muted-foreground">
        <strong className="text-foreground">Comparaison marché non disponible</strong><br />
        Données de prix insuffisantes pour effectuer une comparaison.
      </p>
    </div>
  </div>
);

// ============================================================
// DISCLAIMER OBLIGATOIRE (SAFE JURIDIQUE)
// ============================================================

const LegalDisclaimer = () => (
  <div className="mt-4 p-3 bg-muted/40 rounded-lg border border-border/50">
    <p className="text-xs text-muted-foreground leading-relaxed">
      <strong className="text-foreground">⚠️ Mention importante :</strong> Les fourchettes de prix sont indicatives. 
      Elles reposent sur des moyennes de marché observées et ne tiennent pas compte des spécificités du chantier 
      (matériaux, contraintes techniques, finitions). Un écart n'est pas nécessairement anormal. 
      Cette analyse ne constitue pas un avis professionnel.
    </p>
  </div>
);

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================

const MarketPositionAnalysis = ({
  quote_total_ht,
  market_min_ht,
  market_avg_ht,
  market_max_ht,
}: MarketPositionAnalysisProps) => {
  // RÈGLE STRICTE: Afficher la jauge UNIQUEMENT si:
  // - quote_total_ht (devis_ht) est un nombre > 0
  // - ET total_min_ht, total_avg_ht, total_max_ht sont tous présents
  
  const hasValidQuote = quote_total_ht !== null && quote_total_ht !== undefined && quote_total_ht > 0;
  const hasValidMarketData = 
    market_min_ht !== null && market_min_ht !== undefined &&
    market_avg_ht !== null && market_avg_ht !== undefined &&
    market_max_ht !== null && market_max_ht !== undefined;

  // Si les données sont insuffisantes, afficher le message d'indisponibilité
  if (!hasValidQuote || !hasValidMarketData) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Info className="h-5 w-5 text-primary" />
          Analyse du positionnement prix
        </h3>
        <UnavailableMessage />
      </div>
    );
  }

  // Typage strict après validation
  const devis_ht = quote_total_ht as number;
  const total_min_ht = market_min_ht as number;
  const total_avg_ht = market_avg_ht as number;
  const total_max_ht = market_max_ht as number;

  // Calculer la position selon les règles strictes
  const positionInfo = computePosition(devis_ht, total_min_ht, total_avg_ht, total_max_ht);

  return (
    <div className="space-y-4">
      {/* Titre */}
      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <Info className="h-5 w-5 text-primary" />
        Analyse du positionnement prix
      </h3>

      {/* Bloc principal avec jauge */}
      <div className={`p-5 rounded-xl border ${positionInfo.bgColor} ${positionInfo.borderColor}`}>
        {/* Récapitulatif des prix */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Prix du devis</span>
            <span className={`text-xl font-bold ${positionInfo.color}`}>
              {formatPrice(devis_ht)} HT
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Fourchette de marché</span>
            <span className="text-sm font-medium text-foreground">
              {formatPrice(total_min_ht)} → {formatPrice(total_max_ht)} HT
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Moyenne du marché</span>
            <span className="text-sm font-medium text-foreground">
              {formatPrice(total_avg_ht)} HT
            </span>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <span className="text-sm text-muted-foreground">Verdict</span>
            <div className="flex items-center gap-2">
              {positionInfo.icon}
              <span className={`font-semibold ${positionInfo.color}`}>
                {positionInfo.label}
              </span>
            </div>
          </div>
        </div>

        {/* Jauge visuelle */}
        <PositionGauge
          devis_ht={devis_ht}
          total_min_ht={total_min_ht}
          total_avg_ht={total_avg_ht}
          total_max_ht={total_max_ht}
          positionInfo={positionInfo}
        />
      </div>

      {/* Disclaimer obligatoire */}
      <LegalDisclaimer />
    </div>
  );
};

export default MarketPositionAnalysis;
