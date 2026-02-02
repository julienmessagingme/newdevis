import { Receipt, MapPin, Info, AlertTriangle, Loader2, ExternalLink } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMarketPriceAPI, type MarketPriceResult, type MarketPriceDebug } from "@/hooks/useMarketPriceAPI";

// =======================
// TYPES
// =======================

interface BlockPrixMarcheProps {
  montantTotalHT?: number;
  codePostal?: string;
  selectedWorkType?: string;
  filePath?: string; // Chemin du PDF pour envoi multipart à n8n
}

// =======================
// HELPERS
// =======================

const formatCurrency = (value: number) => 
  new Intl.NumberFormat('fr-FR', { 
    style: 'currency', 
    currency: 'EUR', 
    maximumFractionDigits: 0 
  }).format(value);

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
}

const ErrorBlock = ({ error }: ErrorBlockProps) => (
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
      </div>
    </div>
  </div>
);

// =======================
// NO DATA STATE
// =======================

const NoDataBlock = () => (
  <div className="p-5 bg-muted/30 rounded-xl border border-border mb-4">
    <div className="flex items-start gap-3">
      <div className="p-2 bg-muted rounded-lg">
        <Info className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Prix marché non détectés</strong><br />
          L'analyse n'a pas pu extraire de données de prix pour ce devis.
        </p>
      </div>
    </div>
  </div>
);

// =======================
// MARKET PRICE RESULT BLOCK - API DRIVEN
// =======================

interface MarketPriceResultBlockProps {
  result: MarketPriceResult;
  montantDevis?: number;
}

const MarketPriceResultBlock = ({ result, montantDevis }: MarketPriceResultBlockProps) => {
  // Fourchette réaliste = ±25% autour de total_avg (comme défini dans le contrat UI)
  const realisticMin = Math.round(result.totalAvg * 0.75);
  const realisticMax = Math.round(result.totalAvg * 1.25);
  
  // Position du devis sur la fourchette réaliste
  const calculatePosition = () => {
    if (!montantDevis) return null;
    if (realisticMax <= realisticMin) return 50;
    const position = ((montantDevis - realisticMin) / (realisticMax - realisticMin)) * 100;
    return Math.max(0, Math.min(100, position));
  };
  
  const position = calculatePosition();
  
  const getPositionLabel = (pos: number | null): string => {
    if (pos === null) return "";
    if (pos < 0) return "en dessous de la fourchette estimée";
    if (pos <= 33) return "dans la partie basse de l'estimation";
    if (pos <= 66) return "dans la moyenne estimée";
    if (pos <= 100) return "dans la partie haute de l'estimation";
    return "au-dessus de la fourchette estimée";
  };

  // Affichage des lignes détaillées
  const validLines = result.lines.filter(line => 
    line.line_total_avg > 0 && !line.needs_user_qty
  );

  return (
    <div className="p-5 bg-emerald-500/10 rounded-xl border border-emerald-500/20 mb-4">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 bg-emerald-500/20 rounded-lg">
          <ExternalLink className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-foreground">Prix Marché (source externe)</h4>
          {result.qtyTotal && result.qtyTotal > 0 && (
            <p className="text-xs text-muted-foreground">
              {result.qtyTotal} éléments détectés
            </p>
          )}
        </div>
      </div>
      
      {/* Warning quantité si needs_user_qty = true */}
      {result.needsUserQty && (
        <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 mb-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Quantité non détectée</strong><br />
              L'estimation est basée sur les prix moyens du marché.
            </p>
          </div>
        </div>
      )}
      
      {/* Warnings de l'API */}
      {result.warnings.length > 0 && (
        <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 mb-4">
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

      {/* Fourchette de prix */}
      <div className="space-y-3">
        {/* Fourchette réaliste (±25% de avg) */}
        <div className="p-4 bg-background/60 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-muted-foreground">Estimation marché :</span>
            <span className="font-bold text-foreground">
              {formatCurrency(realisticMin)} – {formatCurrency(realisticMax)} HT
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Prix moyen estimé :</span>
            <span className="font-semibold text-primary">
              {formatCurrency(result.totalAvg)} HT
            </span>
          </div>
        </div>

        {/* Comparaison avec le devis */}
        {montantDevis && position !== null && (
          <div className="p-4 bg-background/60 rounded-lg">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-muted-foreground">Votre devis :</span>
              <span className="font-bold text-foreground">{formatCurrency(montantDevis)} HT</span>
            </div>
            
            {/* Gauge visuelle */}
            <div className="relative h-6 rounded-full bg-gradient-to-r from-blue-400 via-emerald-400 to-amber-400 overflow-hidden mb-2">
              <div 
                className="absolute top-1/2 -translate-y-1/2 transition-all duration-500 ease-out z-10"
                style={{ left: `${position}%` }}
              >
                <div className="relative -ml-3 w-6 h-6 rounded-full bg-white border-2 border-foreground shadow-lg flex items-center justify-center">
                  <div className="w-2 h-2 bg-foreground rounded-full" />
                </div>
              </div>
            </div>
            
            <p className="text-sm text-center text-muted-foreground">
              Votre devis se situe <strong className="text-foreground">{getPositionLabel(position)}</strong>
            </p>
          </div>
        )}

        {/* Détail des lignes si disponibles */}
        {validLines.length > 0 && (
          <details className="group">
            <summary className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors py-2">
              <Info className="h-3 w-3" />
              <span>Voir le détail par poste ({validLines.length} lignes)</span>
            </summary>
            <div className="mt-2 space-y-2">
              {validLines.map((line, idx) => (
                <div key={idx} className="p-3 bg-muted/30 rounded-lg border border-border/50">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground truncate max-w-[60%]">{line.label_raw}</span>
                    <span className="font-medium text-foreground">
                      {formatCurrency(line.line_total_avg)} HT
                    </span>
                  </div>
                  {line.qty && line.qty > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {line.qty} {line.unit} × {formatCurrency(line.price_avg_unit_ht)}/{line.unit}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Fourchette extrême (info avancée) */}
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors py-2">
            <Info className="h-3 w-3" />
            <span>Voir la fourchette extrême du marché</span>
          </summary>
          <div className="mt-2 p-3 bg-muted/30 rounded-lg border border-border/50">
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground">Fourchette extrême :</span>
              <span className="font-medium text-foreground">
                {formatCurrency(result.totalMin)} – {formatCurrency(result.totalMax)} HT
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2 italic">
              Cette fourchette représente les cas extrêmes observés sur le marché. 
              L'estimation ±25% autour du prix moyen est plus représentative.
            </p>
          </div>
        </details>
      </div>
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
    debug,
  } = useMarketPriceAPI({
    workType: selectedWorkType,
    codePostal,
    filePath,
    enabled: hasMontant && !!filePath,
  });
  
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
          
          {hasMontant && (
            <div className="mb-6 p-3 bg-background/50 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Montant total HT du devis</p>
              <p className="text-xl font-bold text-foreground">{formatCurrency(montantTotalHT!)}</p>
            </div>
          )}
          
          {/* États de rendu */}
          {loading ? (
            <LoadingBlock />
          ) : error ? (
            <ErrorBlock error={error} />
          ) : !result ? (
            <NoDataBlock />
          ) : (
            <MarketPriceResultBlock 
              result={result} 
              montantDevis={montantTotalHT} 
            />
          )}
          
          {/* Disclaimer obligatoire */}
          <div className="mt-6 p-4 bg-muted/30 rounded-xl border border-border/50">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">⚠️ Mention obligatoire :</strong> Les fourchettes de prix affichées sont purement indicatives. 
              Elles sont basées sur des moyennes observées sur le marché français et ne tiennent pas compte des spécificités de votre projet 
              (matériaux, contraintes techniques, finitions). Un devis au-dessus ou en dessous de la fourchette n'est pas nécessairement anormal. 
              Cette analyse ne se substitue pas à un avis professionnel.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlockPrixMarche;
