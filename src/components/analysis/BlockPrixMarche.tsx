import { useState, useEffect } from "react";
import { Receipt, MapPin, Clock, TrendingUp, TrendingDown, Minus, HelpCircle, Info, AlertTriangle, Edit3, CheckCircle, Loader2, ExternalLink } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  parseWorkTypeValue,
  getSousTypeByKey,
  isHorsCategorie,
  getZoneCoefficient,
  calculateLaborTime,
  calculatePricePosition,
  type SousType,
} from "@/lib/workTypeReferentiel";
import { useMarketPriceAPI, type TravauxItem, type MarketPriceLine } from "@/hooks/useMarketPriceAPI";

// =======================
// TYPES & INTERFACES
// =======================

interface QtyRefCandidate {
  value: number;
  unit: string;
  confidence: number;
  source: string;
  evidence_line?: string;
}

interface BlockPrixMarcheProps {
  montantTotalHT?: number;
  zoneType?: string;
  codePostal?: string;
  selectedWorkType?: string;
  quantiteDetectee?: number;
  uniteDetectee?: string;
  manualQuantity?: number | null;
  onManualQuantityChange?: (quantity: number | null) => void;
  qtyRefCandidates?: QtyRefCandidate[];
  qtyRefSource?: string;
  qtyRefDetected?: boolean;
  typesTravaux?: TravauxItem[]; // Ajout pour extraction auto
  filePath?: string; // Chemin du PDF pour envoi multipart à n8n
}


// =======================
// QUANTITY VALIDATION HELPERS
// =======================

const isValidQuantity = (quantity: number | undefined | null, unite: string): boolean => {
  if (quantity === undefined || quantity === null) return false;
  if (unite === 'forfait') return quantity === 1;
  return quantity > 0;
};

const isUnitCategory = (unite: string): boolean => {
  return unite === 'unité' || unite === 'unit';
};

const isSurfaceCategory = (unite: string): boolean => {
  return unite === 'm²' || unite === 'ml';
};

const calculatePrixUnitaire = (montantTotal: number, quantite: number): number => {
  if (quantite <= 0) return 0;
  return montantTotal / quantite;
};

// =======================
// HELPERS
// =======================

const getZoneLabel = (zoneType?: string): string => {
  switch (zoneType) {
    case "grande_ville": return "grande ville";
    case "ville_moyenne": return "ville moyenne";
    case "province": return "zone rurale";
    default: return "zone standard";
  }
};

const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('fr-FR', { 
    style: 'currency', 
    currency: 'EUR',
    maximumFractionDigits: 0 
  }).format(price);
};

const getPositionLabel = (position: number): string => {
  if (position < 0) return "en dessous de la fourchette";
  if (position <= 33) return "dans la partie basse du marché";
  if (position <= 66) return "dans la moyenne du marché";
  if (position <= 100) return "dans la partie haute du marché";
  return "au-dessus de la fourchette";
};

const getPositionIcon = (position: number) => {
  if (position < 33) return <TrendingDown className="h-4 w-4 text-blue-500" />;
  if (position <= 66) return <Minus className="h-4 w-4 text-foreground" />;
  return <TrendingUp className="h-4 w-4 text-amber-500" />;
};

// =======================
// GAUGE COMPONENT
// =======================

interface PriceGaugeProps {
  label: string;
  sousType: SousType;
  montant: number;
  prixUnitaire: number;
  fourchette: { min: number; max: number };
  tempsEstime: { min: number; max: number };
  positionPct: number;
  zoneLabel: string;
  quantite: number;
}

const PriceGauge = ({ 
  label, 
  sousType,
  montant, 
  prixUnitaire,
  fourchette, 
  tempsEstime,
  positionPct,
  zoneLabel,
  quantite
}: PriceGaugeProps) => {
  const displayPosition = Math.max(0, Math.min(100, positionPct));
  
  const formatPrixUnitaire = (prix: number) => {
    return new Intl.NumberFormat('fr-FR', { 
      style: 'currency', 
      currency: 'EUR',
      maximumFractionDigits: 0 
    }).format(prix) + '/' + sousType.unite;
  };
  
  return (
    <div className="p-5 bg-background/80 rounded-xl border border-border mb-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold text-foreground text-lg">
          {label}
          <span className="text-muted-foreground font-normal ml-2">
            – {quantite} {sousType.unite}
          </span>
        </h4>
        <div className="flex items-center gap-2">
          {getPositionIcon(positionPct)}
          <span className="text-sm font-medium text-foreground">
            {getPositionLabel(positionPct)}
          </span>
        </div>
      </div>
      
      <div className="relative mb-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-muted-foreground">{formatPrixUnitaire(fourchette.min)}</span>
          <span className="text-muted-foreground">{formatPrixUnitaire(fourchette.max)}</span>
        </div>
        
        <div className="relative h-8 rounded-full bg-gradient-to-r from-blue-400 via-emerald-400 to-amber-400 overflow-hidden">
          <div className="absolute inset-0 flex">
            <div className="flex-1 border-r border-white/30" />
            <div className="flex-1 border-r border-white/30" />
            <div className="flex-1" />
          </div>
          
          <div 
            className="absolute top-1/2 -translate-y-1/2 transition-all duration-500 ease-out z-10"
            style={{ left: `${displayPosition}%` }}
          >
            <div className="relative -ml-4 w-8 h-8 rounded-full bg-white border-3 border-foreground shadow-lg flex items-center justify-center">
              <div className="w-3 h-3 bg-foreground rounded-full" />
            </div>
          </div>
        </div>
        
        <div className="mt-3 text-center">
          <span className="text-sm text-muted-foreground">Votre prix : </span>
          <span className="font-bold text-lg text-foreground">{formatPrixUnitaire(prixUnitaire)}</span>
          <span className="text-sm text-muted-foreground ml-2">(total : {formatPrice(montant)})</span>
        </div>
      </div>
      
      <div className="space-y-3 pt-3 border-t border-border/50">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Fourchette marché estimée</strong><br />
            Entre {formatPrixUnitaire(fourchette.min)} et {formatPrixUnitaire(fourchette.max)}
            {sousType.unite === 'm²' && ` pour du ${sousType.label.toLowerCase()}`}
            {" "}selon les prix moyens observés en France (zone {zoneLabel} incluse).
          </p>
        </div>
        
        <div className="flex items-start gap-2">
          <Clock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Temps de main-d'œuvre estimé</strong><br />
            Entre {Math.round(tempsEstime.min)} h et {Math.round(tempsEstime.max)} h pour {quantite} {sousType.unite}.
          </p>
        </div>
        
        <p className="text-sm text-muted-foreground italic">
          Votre devis ({formatPrixUnitaire(prixUnitaire)}) se situe {getPositionLabel(positionPct)}
          {positionPct > 66 && ", ce qui peut s'expliquer par la qualité des matériaux, les découpes, la complexité ou la finition."}
          {positionPct < 33 && ", ce qui peut refléter un choix de matériaux standards ou des conditions de chantier favorables."}
        </p>
      </div>
    </div>
  );
};

// =======================
// NO SELECTION COMPONENT
// =======================

const NoSelectionBlock = () => (
  <div className="p-5 bg-amber-500/10 rounded-xl border border-amber-500/20">
    <div className="flex items-start gap-3">
      <div className="p-2 bg-amber-500/20 rounded-lg">
        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
      </div>
      <div>
        <p className="text-sm leading-relaxed">
          <strong className="text-foreground">Veuillez sélectionner le type exact de travaux pour activer l'analyse de prix.</strong><br />
          <span className="text-muted-foreground">
            La jauge de prix nécessite une catégorie et un sous-type métier pour afficher une comparaison fiable.
          </span>
        </p>
      </div>
    </div>
  </div>
);

// =======================
// QUANTITY CONFIRMATION COMPONENT (pre-filled)
// =======================

interface QuantityConfirmationBlockProps {
  unite: string;
  suggestedValue: number | null;
  suggestedSource: string | null;
  onManualQuantityChange?: (quantity: number | null) => void;
}

const QuantityConfirmationBlock = ({ 
  unite, 
  suggestedValue, 
  suggestedSource,
  onManualQuantityChange 
}: QuantityConfirmationBlockProps) => {
  const [inputValue, setInputValue] = useState(suggestedValue?.toString() || "");
  const [isConfirmed, setIsConfirmed] = useState(false);
  
  useEffect(() => {
    if (suggestedValue) {
      setInputValue(suggestedValue.toString());
    }
  }, [suggestedValue]);
  
  const unitLabel = unite === 'm²' || unite === 'm2' ? 'surface (m²)' : 
                   unite === 'ml' ? 'longueur (ml)' : 
                   unite === 'unité' || unite === 'unit' ? "nombre d'équipements" : 'quantité';
  
  const getSourceLabel = (source: string | null): string => {
    switch (source) {
      case "count_product_lines": return "estimé à partir du nombre de lignes produit";
      case "sum_product_units": return "calculé à partir des quantités détectées";
      case "price_consistency": return "déduit par cohérence PU × Qté = Total";
      case "job_specific:pose_tablier_line": return "détecté via la ligne de pose";
      case "job_specific:tablier_count": return "calculé à partir des tabliers";
      case "job_specific:raw_text_match": return "détecté dans le texte du devis";
      case "job_specific:line_items_mode": return "valeur la plus fréquente";
      default: 
        if (source?.startsWith("job_specific:")) {
          return "détecté automatiquement";
        }
        return "suggéré";
    }
  };
  
  const handleConfirm = () => {
    const value = parseFloat(inputValue.replace(',', '.'));
    if (!isNaN(value) && value > 0) {
      onManualQuantityChange?.(value);
      setIsConfirmed(true);
    }
  };
  
  const handleEdit = () => {
    setIsConfirmed(false);
    onManualQuantityChange?.(null);
  };

  if (isConfirmed) {
    return (
      <div className="p-5 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-emerald-500/20 rounded-lg">
            <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <p className="text-sm">
                <strong className="text-foreground">Quantité confirmée : {inputValue} {unite === 'unit' ? 'unités' : unite}</strong>
              </p>
              <Button variant="ghost" size="sm" onClick={handleEdit}>
                <Edit3 className="h-3 w-3 mr-1" />
                Modifier
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 bg-amber-500/10 rounded-xl border border-amber-500/20">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-amber-500/20 rounded-lg">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm leading-relaxed mb-4">
            <strong className="text-foreground">La quantité n'est pas lisible dans le devis transmis.</strong><br />
            <span className="text-muted-foreground">
              {suggestedValue ? (
                <>Une valeur de <strong>{suggestedValue}</strong> a été {getSourceLabel(suggestedSource)}. Confirmez ou corrigez ci-dessous pour afficher la jauge.</>
              ) : (
                <>Ajoutez la {unitLabel} concernée pour afficher la jauge de prix.</>
              )}
            </span>
          </p>
          
          {onManualQuantityChange && (
            <div className="flex items-end gap-3">
              <div className="flex-1 max-w-xs">
                <Label htmlFor="manual-qty" className="text-xs text-muted-foreground mb-1 block">
                  {unitLabel.charAt(0).toUpperCase() + unitLabel.slice(1)}
                </Label>
                <Input
                  id="manual-qty"
                  type="text"
                  inputMode="decimal"
                  placeholder={unite === 'm²' || unite === 'm2' ? "Ex: 45" : unite === 'unité' || unite === 'unit' ? "Ex: 6" : "Ex: 12"}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  className="bg-background"
                />
              </div>
              <Button 
                onClick={handleConfirm}
                size="sm"
                disabled={!inputValue || isNaN(parseFloat(inputValue.replace(',', '.')))}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Confirmer
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// =======================
// QUANTITY EDITABLE HINT (shown after gauge for auto-detected qty)
// =======================

interface QuantityEditableHintProps {
  currentValue: number;
  unite: string;
  source?: string;
  onManualQuantityChange: (quantity: number | null) => void;
}

const QuantityEditableHint = ({ currentValue, unite, source, onManualQuantityChange }: QuantityEditableHintProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(currentValue.toString());
  
  const getSourceLabel = (src: string | undefined): string => {
    if (!src) return "détectée automatiquement";
    if (src.includes("pose_tablier")) return "via la ligne de pose";
    if (src.includes("tablier_count")) return "via le comptage des tabliers";
    if (src.includes("job_specific")) return "détectée automatiquement";
    return "détectée automatiquement";
  };
  
  const handleSave = () => {
    const value = parseFloat(inputValue.replace(',', '.'));
    if (!isNaN(value) && value > 0) {
      onManualQuantityChange(value);
      setIsEditing(false);
    }
  };
  
  if (isEditing) {
    return (
      <div className="mt-3 p-3 bg-muted/30 rounded-lg border border-border/50 flex items-center gap-3">
        <span className="text-xs text-muted-foreground">Modifier la quantité :</span>
        <Input
          type="text"
          inputMode="decimal"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="w-20 h-8 text-sm"
        />
        <span className="text-xs text-muted-foreground">{unite}</span>
        <Button size="sm" variant="default" onClick={handleSave}>
          <CheckCircle className="h-3 w-3 mr-1" />
          OK
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
          Annuler
        </Button>
      </div>
    );
  }
  
  return (
    <div className="mt-3 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20 flex items-center justify-between">
      <p className="text-xs text-muted-foreground">
        <span className="text-blue-400">ℹ️</span> Quantité {getSourceLabel(source)} : <strong className="text-foreground">{currentValue} {unite}</strong>
      </p>
      <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)} className="text-xs">
        <Edit3 className="h-3 w-3 mr-1" />
        Modifier
      </Button>
    </div>
  );
};

// =======================
// NO REFERENCE COMPONENT
// =======================

const NoReferenceBlock = () => (
  <div className="p-5 bg-muted/30 rounded-xl border border-border">
    <div className="flex items-start gap-3">
      <div className="p-2 bg-muted rounded-lg">
        <HelpCircle className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Nous n'avons pas de fourchette fiable pour ce type de travaux.</strong><br />
          Cette prestation est hors des catégories standard (produits très spécifiques ou prestation atypique).
        </p>
      </div>
    </div>
  </div>
);

// =======================
// N8N MARKET PRICE COMPONENT
// =======================

interface MarketPriceN8NProps {
  loading: boolean;
  error: string | null;
  result: {
    prixMini: number;
    prixAvg: number;
    prixMax: number;
    minTotal: number;
    avgTotal: number;
    maxTotal: number;
    multiplier: number;
    jobType: string;
    jobTypeLabel: string;
    unitLabel: string;
    isUnitBased: boolean;
    qtyTotal: number | null;
    needsUserQty: boolean;
    lines: MarketPriceLine[];
    warnings: string[];
  } | null;
  debug?: {
    jobTypeDetected: string | null;
    jobTypeSource: string;
    multiplier: number | null;
    multiplierSource: string;
    apiUrl: string | null;
    apiParams: Record<string, string> | null;
    apiResponse: unknown;
    error: string | null;
  };
  needsUserInput?: "qty" | "surface" | null;
  montantDevis?: number;
}

// =======================
// QUANTITY CALCULATION HELPERS
// =======================

/**
 * Vérifie si une ligne est une ligne de pose/main d'œuvre (à exclure du comptage qty)
 */
const isLaborLine = (labelRaw?: string): boolean => {
  if (!labelRaw) return false;
  const laborPatterns = /pose|main d['']œuvre|main d['']oeuvre|installation|dépose|repose/i;
  return laborPatterns.test(labelRaw);
};

/**
 * Calcule displayQty selon les règles :
 * - Somme des lines[].qty pour lignes où job_type === jobTypeAffiché ET needs_user_qty === false
 * - Exclure les lignes de pose/main d'œuvre du comptage
 */
const calculateDisplayQty = (lines: MarketPriceLine[], jobType: string): number => {
  return lines
    .filter(line => {
      // Filtre 1: job_type doit correspondre
      if (line.job_type && line.job_type !== jobType) return false;
      // Filtre 2: needs_user_qty doit être false
      if (line.needs_user_qty === true) return false;
      // Filtre 3: Exclure les lignes de pose/main d'œuvre
      if (isLaborLine(line.label_raw)) return false;
      // Filtre 4: qty doit être présent et > 0
      if (!line.qty || line.qty <= 0) return false;
      return true;
    })
    .reduce((sum, line) => sum + (line.qty || 0), 0);
};

/**
 * Détermine si le warning quantité doit s'afficher :
 * - Si warnings.length > 0
 * - OU si lines.some(l => l.needs_user_qty || l.qty == null)
 * - SAUF si unit !== m² et qty est présent
 */
const shouldShowQtyWarning = (
  lines: MarketPriceLine[], 
  warnings: string[], 
  unitLabel: string,
  displayQty: number
): boolean => {
  // Règle 1: Si warnings de l'API
  if (warnings.length > 0) return true;
  
  // Règle 2: Si certaines lignes ont besoin d'input utilisateur ou qty null
  const hasProblematicLines = lines.some(l => l.needs_user_qty === true || l.qty == null);
  if (hasProblematicLines) return true;
  
  // Exception: Si unit !== m² et displayQty > 0, ne pas afficher le warning
  if (unitLabel !== "m²" && displayQty > 0) return false;
  
  return false;
};

const MarketPriceN8NBlock = ({ loading, error, result, debug, needsUserInput, montantDevis }: MarketPriceN8NProps) => {
  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);

  // Calcul de la position du devis par rapport à la fourchette marché
  const calculatePosition = () => {
    if (!result || !montantDevis) return null;
    const { minTotal, maxTotal } = result;
    if (maxTotal <= minTotal) return 50;
    const position = ((montantDevis - minTotal) / (maxTotal - minTotal)) * 100;
    return Math.max(0, Math.min(100, position));
  };

  const position = calculatePosition();

  const getPositionLabel = (pos: number | null): string => {
    if (pos === null) return "";
    if (pos < 0) return "en dessous de la fourchette marché";
    if (pos <= 33) return "dans la partie basse du marché";
    if (pos <= 66) return "dans la moyenne du marché";
    if (pos <= 100) return "dans la partie haute du marché";
    return "au-dessus de la fourchette marché";
  };

  if (loading) {
    return (
      <div className="p-5 bg-blue-500/10 rounded-xl border border-blue-500/20 mb-4">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
          <span className="text-sm text-muted-foreground">Récupération des prix marché...</span>
        </div>
      </div>
    );
  }

  // ========================================
  // RÈGLE UI PRIX MARCHÉ
  // ========================================
  // Si n8n renvoie total_min, total_avg, total_max (nombres > 0) :
  // - Afficher fourchette = total_min → total_max
  // - Afficher prix moyen = total_avg
  // - available = true
  // - NE JAMAIS recalculer depuis qty/surface
  // - qty sert uniquement pour affichage détail lignes
  // ========================================
  
  // NE PLUS BLOQUER sur needsUserInput - on affiche les totaux n8n quand même

  // Vérifier si on a des totaux n8n valides (> 0)
  const hasValidN8NTotals = result && 
    result.minTotal > 0 && 
    result.avgTotal > 0 && 
    result.maxTotal > 0;

  // Si erreur ET pas de totaux valides => afficher erreur
  if ((error || !debug?.jobTypeDetected) && !hasValidN8NTotals) {
    const reason = !debug?.jobTypeDetected 
      ? "Type de travaux non reconnu pour la comparaison marché"
      : error || "Prix marché indisponible";

    return (
      <div className="p-5 bg-muted/30 rounded-xl border border-border mb-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-muted rounded-lg">
            <Info className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Comparaison marché externe non disponible</strong><br />
              {reason}
            </p>
            {debug?.jobTypeDetected && debug?.multiplier && (
              <p className="text-xs text-muted-foreground mt-2">
                Données détectées : {debug.jobTypeDetected} • {debug.multiplier} {result?.unitLabel || 'm²'}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  // Si on a des totaux valides, on affiche même si qty/surface manquante

  // Calcul de displayQty selon les nouvelles règles :
  // - Somme des lines[].qty pour lignes où job_type === jobTypeAffiché ET needs_user_qty === false
  // - Exclure les lignes de pose/main d'œuvre du comptage
  const displayQty = result ? calculateDisplayQty(result.lines, result.jobType) : 0;
  
  // Règle d'affichage du warning quantité :
  // - Si warnings.length > 0
  // - OU si lines.some(l => l.needs_user_qty || l.qty == null)
  // - SAUF si unit !== m² et qty est présent
  const showQtyWarning = result ? shouldShowQtyWarning(
    result.lines, 
    result.warnings, 
    result.unitLabel, 
    displayQty
  ) : false;

  return (
    <div className="p-5 bg-emerald-500/10 rounded-xl border border-emerald-500/20 mb-4">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 bg-emerald-500/20 rounded-lg">
          <ExternalLink className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-foreground">Prix Marché (source externe)</h4>
          {/* Afficher qty seulement si disponible et pas de warning */}
          <p className="text-xs text-muted-foreground">
            {result.jobTypeLabel}
            {!showQtyWarning && displayQty > 0 && <> • {displayQty} {result.unitLabel}{displayQty > 1 ? 's' : ''}</>}
          </p>
        </div>
      </div>
      
      {/* Warning quantité - seulement si nécessaire */}
      {showQtyWarning && (
        <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 mb-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">La quantité n'est pas lisible dans le devis transmis.</strong><br />
              L'estimation est basée sur les prix moyens du marché. Pour une comparaison plus précise, renseignez la quantité ci-dessus.
            </p>
          </div>
        </div>
      )}

      {/* Fourchette de prix - ±25% autour de avg par défaut */}
      <div className="space-y-3">
        {(() => {
          // Fourchette réaliste = ±25% autour de total_avg
          const realisticMin = Math.round(result.avgTotal * 0.75);
          const realisticMax = Math.round(result.avgTotal * 1.25);
          
          // Position recalculée sur fourchette réaliste
          const realisticPosition = montantDevis 
            ? Math.max(0, Math.min(100, ((montantDevis - realisticMin) / (realisticMax - realisticMin)) * 100))
            : null;
          
          const getRealisticPositionLabel = (pos: number | null): string => {
            if (pos === null) return "";
            if (pos < 0) return "en dessous de la fourchette estimée";
            if (pos <= 33) return "dans la partie basse de l'estimation";
            if (pos <= 66) return "dans la moyenne estimée";
            if (pos <= 100) return "dans la partie haute de l'estimation";
            return "au-dessus de la fourchette estimée";
          };
          
          return (
            <>
              {/* Fourchette réaliste (par défaut) */}
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
                    {formatCurrency(result.avgTotal)} HT
                  </span>
                </div>
                {/* Afficher détail qty uniquement si qtyTotal disponible et pas de warning */}
                {!showQtyWarning && displayQty > 0 && result.prixAvg > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Détail : {displayQty} {result.unitLabel}{displayQty > 1 ? 's' : ''} × {formatCurrency(result.prixAvg)}/{result.unitLabel} HT
                  </p>
                )}
              </div>

              {/* Comparaison avec le devis - sur fourchette réaliste */}
              {montantDevis && realisticPosition !== null && (
                <div className="p-4 bg-background/60 rounded-lg">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm text-muted-foreground">Votre devis :</span>
                    <span className="font-bold text-foreground">{formatCurrency(montantDevis)} HT</span>
                  </div>
                  
                  {/* Gauge visuelle */}
                  <div className="relative h-6 rounded-full bg-gradient-to-r from-blue-400 via-emerald-400 to-amber-400 overflow-hidden mb-2">
                    <div 
                      className="absolute top-1/2 -translate-y-1/2 transition-all duration-500 ease-out z-10"
                      style={{ left: `${realisticPosition}%` }}
                    >
                      <div className="relative -ml-3 w-6 h-6 rounded-full bg-white border-2 border-foreground shadow-lg flex items-center justify-center">
                        <div className="w-2 h-2 bg-foreground rounded-full" />
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-sm text-center text-muted-foreground">
                    Votre devis se situe <strong className="text-foreground">{getRealisticPositionLabel(realisticPosition)}</strong>
                  </p>
                </div>
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
                      {formatCurrency(result.minTotal)} – {formatCurrency(result.maxTotal)} HT
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 italic">
                    Cette fourchette représente les cas extrêmes observés sur le marché. 
                    L'estimation ±25% autour du prix moyen est plus représentative.
                  </p>
                </div>
              </details>
            </>
          );
        })()}
      </div>
    </div>
  );
};


// =======================

const BlockPrixMarche = ({ 
  montantTotalHT, 
  zoneType, 
  codePostal,
  selectedWorkType,
  quantiteDetectee,
  uniteDetectee,
  manualQuantity,
  onManualQuantityChange,
  qtyRefCandidates,
  qtyRefSource,
  qtyRefDetected,
  typesTravaux, // Nouvelle prop pour extraction auto
  filePath, // Chemin du PDF pour envoi multipart à n8n
}: BlockPrixMarcheProps) => {
  const zoneLabel = getZoneLabel(zoneType);
  
  const parsed = parseWorkTypeValue(selectedWorkType || "");
  const sousTypeInfo = parsed ? getSousTypeByKey(parsed.sousTypeKey) : null;
  const sousType = sousTypeInfo?.sousType;
  
  const isHorsRef = isHorsCategorie(selectedWorkType);
  const hasValidSelection = parsed !== null && sousTypeInfo !== null;
  const hasMontant = montantTotalHT !== undefined && montantTotalHT > 0;
  
  // Appel API n8n pour récupérer les prix marché externes
  const { 
    loading: marketLoading, 
    error: marketError, 
    result: marketResult,
    debug: marketDebug,
    needsUserInput: marketNeedsUserInput,
  } = useMarketPriceAPI({
    typesTravaux,
    workType: selectedWorkType,
    codePostal,
    filePath, // Envoi du PDF pour multipart/form-data
    enabled: hasMontant, // Activer uniquement si on a un montant
  });
  
  // Priorité: manualQuantity > quantiteDetectee
  const effectiveQuantity = manualQuantity ?? quantiteDetectee;
  const unite = sousType?.unite || 'm²';
  
  const hasValidQuantity = isValidQuantity(effectiveQuantity, unite);
  
  // Find best suggestion from candidates if no auto-detected qty
  const getBestSuggestion = (): { value: number; source: string } | null => {
    if (!qtyRefCandidates || qtyRefCandidates.length === 0) return null;
    
    // Find highest confidence candidate
    const sorted = [...qtyRefCandidates].sort((a, b) => b.confidence - a.confidence);
    const best = sorted[0];
    
    if (best && best.value > 0) {
      return { value: best.value, source: best.source };
    }
    return null;
  };
  
  const suggestion = !hasValidQuantity ? getBestSuggestion() : null;
  
  // Show confirmation block if no valid qty but we have a suggestion
  const requiresConfirmation = hasValidSelection && hasMontant && !hasValidQuantity && unite !== 'forfait';
  
  // Calculs uniquement si on a une sélection valide ET une quantité valide
  let fourchettePrixUnitaire = { min: 0, max: 0 };
  let tempsEstime = { min: 0, max: 0 };
  let positionPct = 50;
  let prixUnitaire = 0;
  let quantite = effectiveQuantity || 1;
  
  if (hasValidSelection && sousType && hasMontant && hasValidQuantity) {
    if (sousType.unite === 'forfait') {
      quantite = 1;
    } else {
      quantite = effectiveQuantity!;
    }
    
    prixUnitaire = calculatePrixUnitaire(montantTotalHT!, quantite);
    
    const zoneCoef = getZoneCoefficient(zoneType);
    fourchettePrixUnitaire = {
      min: Math.round(sousType.prixMin * zoneCoef),
      max: Math.round(sousType.prixMax * zoneCoef)
    };
    
    tempsEstime = calculateLaborTime(sousType, quantite);
    positionPct = calculatePricePosition(prixUnitaire, fourchettePrixUnitaire);
  }
  
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
                    Ces fourchettes sont indicatives et basées sur des moyennes nationales ajustées à votre zone géographique. 
                    Elles ne constituent pas une évaluation de la qualité du prestataire.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          
          {(codePostal || zoneType) && (
            <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>Zone de référence : {zoneLabel}{codePostal && ` (${codePostal})`}</span>
            </div>
          )}
          
          {hasMontant && (
            <div className="mb-6 p-3 bg-background/50 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Montant total HT du devis</p>
              <p className="text-xl font-bold text-foreground">{formatPrice(montantTotalHT!)}</p>
            </div>
          )}
          
          {/* Bloc prix marché n8n - extraction automatique */}
          <MarketPriceN8NBlock
            loading={marketLoading}
            error={marketError}
            result={marketResult}
            debug={marketDebug}
            needsUserInput={marketNeedsUserInput}
            montantDevis={montantTotalHT}
          />
          
          {isHorsRef ? (
            <NoReferenceBlock />
          ) : !hasValidSelection ? (
            <NoSelectionBlock />
          ) : !hasMontant ? (
            <div className="p-5 bg-muted/30 rounded-xl border border-border">
              <p className="text-sm text-muted-foreground">
                Aucun montant n'a été détecté dans le devis. La comparaison de prix n'est pas disponible.
              </p>
            </div>
          ) : requiresConfirmation ? (
            <QuantityConfirmationBlock 
              unite={unite}
              suggestedValue={suggestion?.value || null}
              suggestedSource={suggestion?.source || null}
              onManualQuantityChange={onManualQuantityChange}
            />
          ) : (
            <>
              <PriceGauge
                label={sousTypeInfo!.sousType.label}
                sousType={sousTypeInfo!.sousType}
                montant={montantTotalHT!}
                prixUnitaire={prixUnitaire}
                fourchette={fourchettePrixUnitaire}
                tempsEstime={tempsEstime}
                positionPct={positionPct}
                zoneLabel={zoneLabel}
                quantite={quantite}
              />
              
              {/* If quantity was auto-detected (not manually set), show edit option */}
              {manualQuantity === null && quantiteDetectee && onManualQuantityChange && (
                <QuantityEditableHint
                  currentValue={quantiteDetectee}
                  unite={unite}
                  source={qtyRefSource}
                  onManualQuantityChange={onManualQuantityChange}
                />
              )}
            </>
          )}
          
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
