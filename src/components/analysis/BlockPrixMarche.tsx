import { Receipt, MapPin, Info, AlertTriangle, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMarketPriceAPI, type MarketPriceResult } from "@/hooks/useMarketPriceAPI";
import MarketPositionAnalysis from "./MarketPositionAnalysis";

// =======================
// TYPES
// =======================

interface BlockPrixMarcheProps {
  montantTotalHT?: number;
  codePostal?: string;
  selectedWorkType?: string;
  filePath?: string;
}

// =======================
// LOADING STATE
// =======================

const LoadingBlock = () => (
  <div className="p-5 bg-blue-500/10 rounded-xl border border-blue-500/20 mb-4">
    <div className="flex items-center gap-3">
      <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
      <span className="text-sm text-muted-foreground">Récupération des prix marché...</span>
    </div>
  </div>
);

// =======================
// ERROR STATE
// =======================

interface ErrorBlockProps {
  error: string;
  suggestion?: string | null;
}

const ErrorBlock = ({ error, suggestion }: ErrorBlockProps) => (
  <div className="p-5 bg-muted/30 rounded-xl border border-border mb-4">
    <div className="flex items-start gap-3">
      <div className="p-2 bg-muted rounded-lg">
        <Info className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Comparaison marché non disponible</strong><br />
          {error}
        </p>
        {suggestion && (
          <p className="text-xs text-muted-foreground mt-2 italic">
            💡 {suggestion}
          </p>
        )}
      </div>
    </div>
  </div>
);

// =======================
// NOT COMPARABLE STATE
// =======================

interface NotComparableBlockProps {
  message: string | null;
  suggestion: string | null;
}

const NotComparableBlock = ({ message, suggestion }: NotComparableBlockProps) => (
  <div className="p-5 bg-muted/30 rounded-xl border border-border mb-4">
    <div className="flex items-start gap-3">
      <div className="p-2 bg-muted rounded-lg">
        <Info className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Comparaison marché non disponible</strong><br />
          {message || "Ce type de prestation n'est pas dans la base de références."}
        </p>
        {suggestion && (
          <p className="text-xs text-muted-foreground mt-2 italic">
            💡 {suggestion}
          </p>
        )}
      </div>
    </div>
  </div>
);

// =======================
// MISSING TOTALS STATE
// =======================

const MissingTotalsBlock = () => (
  <div className="p-5 bg-amber-500/10 rounded-xl border border-amber-500/20 mb-4">
    <div className="flex items-start gap-3">
      <div className="p-2 bg-amber-500/20 rounded-lg">
        <AlertTriangle className="h-5 w-5 text-amber-600" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Comparaison marché non disponible</strong><br />
          Totaux manquants dans la réponse API.
        </p>
      </div>
    </div>
  </div>
);

// =======================
// MARKET PRICE RESULT BLOCK - AVEC JAUGE VISUELLE
// =======================

interface MarketPriceResultBlockProps {
  result: MarketPriceResult;
}

const MarketPriceResultBlock = ({ result }: MarketPriceResultBlockProps) => {
  // VALIDATION: Les 3 totaux HT doivent être présents
  const hasValidTotals = 
    result.totalMinHT !== null && 
    result.totalAvgHT !== null && 
    result.totalMaxHT !== null;
  
  if (!hasValidTotals) {
    return <MissingTotalsBlock />;
  }
  
  // Typage strict après validation
  const totalMinHT = result.totalMinHT as number;
  const totalAvgHT = result.totalAvgHT as number;
  const totalMaxHT = result.totalMaxHT as number;
  
  // RÈGLE: Warning quantité UNIQUEMENT si qty_total est null ou 0
  const showQtyWarning = result.qtyTotal === null || result.qtyTotal === 0;
  
  // Affichage label + qty si disponibles
  const hasQtyInfo = result.qtyTotal !== null && result.qtyTotal > 0;

  // Calcul du verdict et des métriques pour MarketPositionAnalysis
  const quoteAmount = result.montantDevisHT;
  
  // Calcul position_ratio et vs_avg_pct
  let positionRatio: number | null = null;
  let vsAvgPct: number | null = null;
  let verdict: string | null = null;
  
  if (quoteAmount !== null && totalMaxHT > totalMinHT) {
    positionRatio = (quoteAmount - totalMinHT) / (totalMaxHT - totalMinHT);
    vsAvgPct = (quoteAmount - totalAvgHT) / totalAvgHT;
    
    // Déterminer le verdict
    if (vsAvgPct < -0.25) {
      verdict = "Bien placé";
    } else if (vsAvgPct < -0.10) {
      verdict = "Inférieur à la moyenne";
    } else if (vsAvgPct <= 0.10) {
      verdict = "Dans la norme";
    } else if (vsAvgPct <= 0.25) {
      verdict = "Légèrement élevé";
    } else {
      verdict = "Plutôt cher";
    }
  }

  return (
    <div className="space-y-4">
      {/* Warning quantité UNIQUEMENT si qty_total est null/0 */}
      {showQtyWarning && (
        <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Quantité non fournie</strong><br />
              Ajoutez la quantité pour affiner l'estimation.
            </p>
          </div>
        </div>
      )}
      
      {/* Warnings de l'API (autres) */}
      {result.warnings.length > 0 && (
        <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-muted-foreground">
              {result.warnings.map((warning, idx) => (
                <p key={idx}>{warning}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Info prestation si disponible */}
      {hasQtyInfo && (
        <div className="p-3 bg-muted/30 rounded-lg border border-border/50">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Prestation détectée :</strong>{" "}
            {result.label && <span>{result.label} • </span>}
            {result.qtyTotal} {result.unit || "unité(s)"}
          </p>
        </div>
      )}

      {/* Composant d'analyse de positionnement avec jauge */}
      <MarketPositionAnalysis
        quote_total_ht={quoteAmount}
        market_min_ht={totalMinHT}
        market_avg_ht={totalAvgHT}
        market_max_ht={totalMaxHT}
        position_ratio={positionRatio}
        vs_avg_pct={vsAvgPct}
        verdict={verdict}
      />
    </div>
  );
};

// =======================
// MAIN COMPONENT
// =======================

const BlockPrixMarche = ({ 
  montantTotalHT, 
  codePostal,
  selectedWorkType,
  filePath,
}: BlockPrixMarcheProps) => {
  
  const hasMontant = montantTotalHT !== undefined && montantTotalHT > 0;
  
  // Appel API n8n - SEULE source de vérité
  const { 
    loading, 
    error, 
    result,
  } = useMarketPriceAPI({
    workType: selectedWorkType,
    codePostal,
    filePath,
    enabled: hasMontant && !!filePath,
  });
  
  // Déterminer l'état d'affichage
  const renderContent = () => {
    if (loading) {
      return <LoadingBlock />;
    }
    
    if (error) {
      return <ErrorBlock error={error} />;
    }
    
    if (!result) {
      return (
        <ErrorBlock 
          error="L'analyse n'a pas pu extraire de données de prix pour ce devis." 
        />
      );
    }
    
    // Cas: ok !== true (non comparable ou erreur API)
    if (!result.ok) {
      return (
        <NotComparableBlock 
          message={result.message} 
          suggestion={result.suggestion} 
        />
      );
    }
    
    // Cas: ok === true mais totaux manquants
    if (result.totalMinHT === null || result.totalAvgHT === null || result.totalMaxHT === null) {
      return <MissingTotalsBlock />;
    }
    
    // Cas nominal: affichage des résultats
    return <MarketPriceResultBlock result={result} />;
  };
  
  return (
    <div className="border-2 rounded-2xl p-6 mb-6 bg-primary/5 border-primary/20">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-background/50 rounded-xl flex-shrink-0">
          <Receipt className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="font-bold text-foreground text-xl">Analyse Prix & Cohérence Marché</h2>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">
                    Ces fourchettes sont basées sur des données de marché externes. 
                    Elles ne constituent pas une évaluation de la qualité du prestataire.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          
          {codePostal && (
            <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>Zone de référence : {codePostal}</span>
            </div>
          )}
          
          {/* 
            IMPORTANT: Ne pas afficher le montant du devis ici car on ne sait pas 
            s'il est HT ou TTC. L'affichage du montant doit venir de l'API si disponible.
          */}
          
          {/* États de rendu */}
          {renderContent()}
          
          {/* Note: Le disclaimer obligatoire est maintenant intégré dans MarketPositionAnalysis */}
        </div>
      </div>
    </div>
  );
};

export default BlockPrixMarche;
