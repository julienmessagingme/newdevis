import { useState, useEffect } from "react";
import { Receipt, MapPin, Clock, TrendingUp, TrendingDown, Minus, HelpCircle, Info, AlertTriangle, Edit3, CheckCircle } from "lucide-react";
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
      default: return "suggéré";
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
// MAIN COMPONENT
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
  qtyRefDetected
}: BlockPrixMarcheProps) => {
  const zoneLabel = getZoneLabel(zoneType);
  
  const parsed = parseWorkTypeValue(selectedWorkType || "");
  const sousTypeInfo = parsed ? getSousTypeByKey(parsed.sousTypeKey) : null;
  const sousType = sousTypeInfo?.sousType;
  
  const isHorsRef = isHorsCategorie(selectedWorkType);
  const hasValidSelection = parsed !== null && sousTypeInfo !== null;
  const hasMontant = montantTotalHT !== undefined && montantTotalHT > 0;
  
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
