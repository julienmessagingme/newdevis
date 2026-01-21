import { Receipt, MapPin, Clock, TrendingUp, TrendingDown, Minus, HelpCircle, Info, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  parseWorkTypeValue,
  getSousTypeByKey,
  isHorsCategorie,
  getZoneCoefficient,
  calculateAdjustedPriceRange,
  calculateLaborTime,
  calculatePricePosition,
  type SousType,
} from "@/lib/workTypeReferentiel";

// =======================
// TYPES & INTERFACES
// =======================

interface BlockPrixMarcheProps {
  montantTotalHT?: number;
  zoneType?: string;
  codePostal?: string;
  selectedWorkType?: string;
  quantiteDetectee?: number; // Surface m² max détectée du devis (uniquement pour unités m²)
}

// =======================
// SURFACE DETECTION HELPERS
// =======================

/**
 * RÈGLE CRITIQUE: Pour les catégories en m², on doit avoir une surface fiable.
 * - Interdit d'utiliser "1 unité" ou "1 forfait" comme surface
 * - Interdit de comparer un prix global à un prix unitaire
 */
const isValidM2Surface = (surface: number | undefined, unite: string): boolean => {
  // Si l'unité n'est pas m², pas de validation requise
  if (unite !== 'm²') return true;
  
  // Pour m², on doit avoir une surface > 1 (pas de fallback à 1)
  return surface !== undefined && surface > 1;
};

/**
 * Calcule le prix réel au m² : montant_total / surface_reference
 */
const calculatePrixM2 = (montantTotal: number, surface: number): number => {
  if (surface <= 0) return 0;
  return montantTotal / surface;
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
  prixUnitaire: number; // Prix au m² ou à l'unité calculé
  fourchette: { min: number; max: number }; // Fourchette en prix unitaire
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
  // Clamp position between 0 and 100 for display, but keep original for label
  const displayPosition = Math.max(0, Math.min(100, positionPct));
  const isM2 = sousType.unite === 'm²';
  
  // Format pour afficher le prix unitaire
  const formatPrixUnitaire = (prix: number) => {
    return new Intl.NumberFormat('fr-FR', { 
      style: 'currency', 
      currency: 'EUR',
      maximumFractionDigits: 0 
    }).format(prix) + '/' + sousType.unite;
  };
  
  return (
    <div className="p-5 bg-background/80 rounded-xl border border-border mb-4">
      {/* Header with category and surface */}
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
      
      {/* Visual Gauge - affiche fourchette en €/unité */}
      <div className="relative mb-4">
        {/* Price labels on ends - prix unitaires */}
        <div className="flex justify-between text-sm mb-2">
          <span className="text-muted-foreground">{formatPrixUnitaire(fourchette.min)}</span>
          <span className="text-muted-foreground">{formatPrixUnitaire(fourchette.max)}</span>
        </div>
        
        {/* Gauge bar */}
        <div className="relative h-8 rounded-full bg-gradient-to-r from-blue-400 via-emerald-400 to-amber-400 overflow-hidden">
          {/* Grid lines */}
          <div className="absolute inset-0 flex">
            <div className="flex-1 border-r border-white/30" />
            <div className="flex-1 border-r border-white/30" />
            <div className="flex-1" />
          </div>
          
          {/* Position indicator */}
          <div 
            className="absolute top-1/2 -translate-y-1/2 transition-all duration-500 ease-out z-10"
            style={{ left: `${displayPosition}%` }}
          >
            <div className="relative -ml-4 w-8 h-8 rounded-full bg-white border-3 border-foreground shadow-lg flex items-center justify-center">
              <div className="w-3 h-3 bg-foreground rounded-full" />
            </div>
          </div>
        </div>
        
        {/* Your quote value display - prix unitaire calculé */}
        <div className="mt-3 text-center">
          <span className="text-sm text-muted-foreground">Votre prix : </span>
          <span className="font-bold text-lg text-foreground">{formatPrixUnitaire(prixUnitaire)}</span>
          <span className="text-sm text-muted-foreground ml-2">(total : {formatPrice(montant)})</span>
        </div>
      </div>
      
      {/* Pedagogical text */}
      <div className="space-y-3 pt-3 border-t border-border/50">
        {/* Price range explanation */}
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Fourchette marché estimée</strong><br />
            Entre {formatPrixUnitaire(fourchette.min)} et {formatPrixUnitaire(fourchette.max)}
            {isM2 && ` pour du ${sousType.label.toLowerCase()}`}
            {" "}selon les prix moyens observés en France (zone {zoneLabel} incluse).
          </p>
        </div>
        
        {/* Labor time estimation - calculé depuis le sous-type */}
        <div className="flex items-start gap-2">
          <Clock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Temps de main-d'œuvre estimé</strong><br />
            Entre {Math.round(tempsEstime.min)} h et {Math.round(tempsEstime.max)} h pour {quantite} {sousType.unite}.
          </p>
        </div>
        
        {/* Position explanation */}
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
// NO SURFACE COMPONENT (for m² categories without valid surface)
// =======================

const NoSurfaceBlock = () => (
  <div className="p-5 bg-amber-500/10 rounded-xl border border-amber-500/20">
    <div className="flex items-start gap-3">
      <div className="p-2 bg-amber-500/20 rounded-lg">
        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
      </div>
      <div>
        <p className="text-sm leading-relaxed">
          <strong className="text-foreground">Aucune surface m² fiable n'a été détectée dans le devis.</strong><br />
          <span className="text-muted-foreground">
            Pour les travaux au m², la jauge ne peut s'afficher que si une surface de référence est identifiée 
            (ex : 192 m² de géotextile). Un forfait ou une quantité unitaire ne peut pas servir de base de calcul.
          </span>
        </p>
      </div>
    </div>
  </div>
);

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

/**
 * RÈGLE ABSOLUE: La jauge de prix ne doit JAMAIS être calculée à partir du texte du devis seul.
 * Elle utilise TOUJOURS une catégorie métier choisie par l'utilisateur (format "categorie:soustype").
 * 
 * RÈGLE CRITIQUE pour les catégories en m² :
 * - Extraire la surface m² max détectée dans le devis
 * - prix_m2 = montant_total_HT / surface_reference
 * - Comparer prix_m2 à la fourchette métier
 * - INTERDIT d'utiliser "1 unité" ou "1 forfait" comme surface
 */
const BlockPrixMarche = ({ 
  montantTotalHT, 
  zoneType, 
  codePostal,
  selectedWorkType,
  quantiteDetectee
}: BlockPrixMarcheProps) => {
  const zoneLabel = getZoneLabel(zoneType);
  
  // Parse le workType pour extraire catégorie et sous-type
  const parsed = parseWorkTypeValue(selectedWorkType || "");
  
  // Récupérer les infos du sous-type
  const sousTypeInfo = parsed ? getSousTypeByKey(parsed.sousTypeKey) : null;
  
  // Déterminer l'état d'affichage
  const isHorsRef = isHorsCategorie(selectedWorkType);
  const hasValidSelection = parsed !== null && sousTypeInfo !== null;
  const hasMontant = montantTotalHT !== undefined && montantTotalHT > 0;
  
  // Vérifier si on a une surface valide pour les catégories m²
  const sousType = sousTypeInfo?.sousType;
  const isM2Category = sousType?.unite === 'm²';
  const hasValidSurface = isValidM2Surface(quantiteDetectee, sousType?.unite || '');
  
  // Calculs uniquement si on a une sélection valide ET une surface valide pour m²
  let fourchettePrixUnitaire = { min: 0, max: 0 };
  let tempsEstime = { min: 0, max: 0 };
  let positionPct = 50;
  let prixUnitaire = 0;
  let quantite = quantiteDetectee || 1;
  
  if (hasValidSelection && sousType && hasMontant) {
    // Pour les forfaits, quantité = 1
    if (sousType.unite === 'forfait') {
      quantite = 1;
    }
    
    // Pour les unités, on utilise la quantité détectée ou 1
    if (sousType.unite === 'unité') {
      quantite = quantiteDetectee || 1;
    }
    
    // Calcul du prix unitaire réel : montant_total / quantité
    prixUnitaire = calculatePrixM2(montantTotalHT, quantite);
    
    // Fourchette en prix UNITAIRE (pas multiplié par quantité)
    const zoneCoef = getZoneCoefficient(zoneType);
    fourchettePrixUnitaire = {
      min: Math.round(sousType.prixMin * zoneCoef),
      max: Math.round(sousType.prixMax * zoneCoef)
    };
    
    // Temps estimé basé sur la quantité
    tempsEstime = calculateLaborTime(sousType, quantite);
    
    // Position basée sur le prix unitaire vs fourchette unitaire
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
          
          {/* Zone indicator */}
          {(codePostal || zoneType) && (
            <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>Zone de référence : {zoneLabel}{codePostal && ` (${codePostal})`}</span>
            </div>
          )}
          
          {/* Total amount */}
          {hasMontant && (
            <div className="mb-6 p-3 bg-background/50 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Montant total HT du devis</p>
              <p className="text-xl font-bold text-foreground">{formatPrice(montantTotalHT!)}</p>
            </div>
          )}
          
          {/* Affichage conditionnel */}
          {isHorsRef ? (
            // Catégorie "autres" = hors référentiel
            <NoReferenceBlock />
          ) : !hasValidSelection ? (
            // Pas de sous-type sélectionné
            <NoSelectionBlock />
          ) : !hasMontant ? (
            // Pas de montant détecté
            <div className="p-5 bg-muted/30 rounded-xl border border-border">
              <p className="text-sm text-muted-foreground">
                Aucun montant n'a été détecté dans le devis. La comparaison de prix n'est pas disponible.
              </p>
            </div>
          ) : isM2Category && !hasValidSurface ? (
            // Catégorie m² mais pas de surface fiable détectée
            <NoSurfaceBlock />
          ) : (
            // Affichage de la jauge
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
          
          {/* Legal disclaimer */}
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
