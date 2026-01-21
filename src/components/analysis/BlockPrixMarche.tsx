import { Receipt, MapPin, Clock, TrendingUp, TrendingDown, Minus, HelpCircle, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// =======================
// TYPES & INTERFACES
// =======================

export interface CategorieAnalysee {
  categorie: string;
  label: string;
  surface_totale: number | null;
  unite: string;
  montant_total_ht: number;
  fourchette_min: number;
  fourchette_max: number;
  position_pct: number; // 0-100%
  temps_min_heures: number | null;
  temps_max_heures: number | null;
  explication_position: string;
}

interface BlockPrixMarcheProps {
  categories: CategorieAnalysee[];
  montantTotalHT?: number;
  zoneType?: string;
  codePostal?: string;
  selectedWorkType?: string;
}

// =======================
// BIBLE DE PRIX V2.0
// =======================
interface CategoryReference {
  key: string;
  label: string;
  prixBasM2: number;
  prixHautM2: number;
  tempsMinH: number; // heures par m² ou forfait
  tempsMaxH: number;
  unite: string;
  isForfait: boolean;
}

const PRICE_REFERENCE: CategoryReference[] = [
  { key: "isolation", label: "Isolation", prixBasM2: 25, prixHautM2: 70, tempsMinH: 0.3, tempsMaxH: 0.6, unite: "m²", isForfait: false },
  { key: "chauffage", label: "Chauffage", prixBasM2: 8000, prixHautM2: 15000, tempsMinH: 16, tempsMaxH: 40, unite: "forfait", isForfait: true },
  { key: "menuiserie", label: "Menuiseries & fermetures", prixBasM2: 600, prixHautM2: 1300, tempsMinH: 4, tempsMaxH: 8, unite: "élément", isForfait: true },
  { key: "carrelage", label: "Carrelage & sols", prixBasM2: 35, prixHautM2: 80, tempsMinH: 0.6, tempsMaxH: 1.2, unite: "m²", isForfait: false },
  { key: "salle_de_bain", label: "Salle de bain", prixBasM2: 6000, prixHautM2: 14000, tempsMinH: 40, tempsMaxH: 80, unite: "forfait", isForfait: true },
  { key: "cuisine", label: "Cuisine", prixBasM2: 5000, prixHautM2: 13000, tempsMinH: 24, tempsMaxH: 56, unite: "forfait", isForfait: true },
  { key: "plomberie", label: "Plomberie", prixBasM2: 150, prixHautM2: 600, tempsMinH: 4, tempsMaxH: 16, unite: "forfait", isForfait: true },
  { key: "electricite", label: "Électricité", prixBasM2: 60, prixHautM2: 130, tempsMinH: 0.5, tempsMaxH: 1, unite: "m²", isForfait: false },
  { key: "peinture", label: "Peinture", prixBasM2: 20, prixHautM2: 55, tempsMinH: 0.2, tempsMaxH: 0.4, unite: "m²", isForfait: false },
  { key: "toiture", label: "Toiture", prixBasM2: 90, prixHautM2: 220, tempsMinH: 0.8, tempsMaxH: 1.5, unite: "m²", isForfait: false },
  { key: "facade", label: "Façade", prixBasM2: 40, prixHautM2: 120, tempsMinH: 0.3, tempsMaxH: 0.7, unite: "m²", isForfait: false },
  { key: "terrasse", label: "Terrasse & extérieur", prixBasM2: 40, prixHautM2: 120, tempsMinH: 0.5, tempsMaxH: 1, unite: "m²", isForfait: false },
  { key: "piscine", label: "Piscine", prixBasM2: 15000, prixHautM2: 50000, tempsMinH: 80, tempsMaxH: 200, unite: "forfait", isForfait: true },
  { key: "diagnostic", label: "Diagnostic immobilier", prixBasM2: 290, prixHautM2: 440, tempsMinH: 2, tempsMaxH: 4, unite: "forfait", isForfait: true },
];

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

const getZoneCoefficient = (zoneType?: string): number => {
  switch (zoneType) {
    case "grande_ville": return 1.20;
    case "ville_moyenne": return 1.00;
    case "province": return 0.90;
    default: return 1.00;
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
  surface: number | null;
  unite: string;
  montant: number;
  fourchetteBas: number;
  fourchtteHaut: number;
  positionPct: number;
  tempsMin: number | null;
  tempsMax: number | null;
  zoneLabel: string;
}

const PriceGauge = ({ 
  label, 
  surface, 
  unite, 
  montant, 
  fourchetteBas, 
  fourchtteHaut, 
  positionPct,
  tempsMin,
  tempsMax,
  zoneLabel
}: PriceGaugeProps) => {
  // Clamp position between 0 and 100 for display, but keep original for label
  const displayPosition = Math.max(0, Math.min(100, positionPct));
  const isOutOfRange = positionPct < 0 || positionPct > 100;
  
  return (
    <div className="p-5 bg-background/80 rounded-xl border border-border mb-4">
      {/* Header with category and surface */}
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold text-foreground text-lg">
          {label}
          {surface && surface > 0 && (
            <span className="text-muted-foreground font-normal ml-2">
              – {surface} {unite}
            </span>
          )}
        </h4>
        <div className="flex items-center gap-2">
          {getPositionIcon(positionPct)}
          <span className="text-sm font-medium text-foreground">
            {getPositionLabel(positionPct)}
          </span>
        </div>
      </div>
      
      {/* Visual Gauge */}
      <div className="relative mb-4">
        {/* Price labels on ends */}
        <div className="flex justify-between text-sm mb-2">
          <span className="text-muted-foreground">{formatPrice(fourchetteBas)}</span>
          <span className="text-muted-foreground">{formatPrice(fourchtteHaut)}</span>
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
        
        {/* Your quote value display */}
        <div className="mt-3 text-center">
          <span className="text-sm text-muted-foreground">Votre devis : </span>
          <span className="font-bold text-lg text-foreground">{formatPrice(montant)}</span>
        </div>
      </div>
      
      {/* Pedagogical text */}
      <div className="space-y-3 pt-3 border-t border-border/50">
        {/* Price range explanation */}
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Fourchette marché estimée</strong><br />
            Entre {formatPrice(fourchetteBas)} et {formatPrice(fourchtteHaut)} 
            {surface && surface > 0 && ` pour ${surface} ${unite}`}
            {" "}selon les prix moyens observés en France (zone {zoneLabel} incluse).
          </p>
        </div>
        
        {/* Labor time estimation */}
        {tempsMin !== null && tempsMax !== null && (
          <div className="flex items-start gap-2">
            <Clock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Temps de main-d'œuvre estimé</strong><br />
              Entre {Math.round(tempsMin)} h et {Math.round(tempsMax)} h pour ce volume de travaux.
            </p>
          </div>
        )}
        
        {/* Position explanation */}
        <p className="text-sm text-muted-foreground italic">
          Votre devis se situe {getPositionLabel(positionPct)}
          {positionPct > 66 && ", ce qui peut s'expliquer par le format des matériaux, les découpes, la complexité ou la finition."}
          {positionPct < 33 && ", ce qui peut refléter un choix de matériaux standards ou des conditions de chantier favorables."}
        </p>
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
  categories, 
  montantTotalHT, 
  zoneType, 
  codePostal,
  selectedWorkType 
}: BlockPrixMarcheProps) => {
  const zoneLabel = getZoneLabel(zoneType);
  const zoneCoef = getZoneCoefficient(zoneType);
  
  // If no categories provided, try to build from selectedWorkType
  let displayCategories = categories;
  
  if ((!displayCategories || displayCategories.length === 0) && selectedWorkType && montantTotalHT) {
    const ref = PRICE_REFERENCE.find(r => r.key === selectedWorkType);
    if (ref) {
      const fourchetteBas = ref.prixBasM2 * zoneCoef;
      const fourchtteHaut = ref.prixHautM2 * zoneCoef;
      const range = fourchtteHaut - fourchetteBas;
      const position = range > 0 ? ((montantTotalHT - fourchetteBas) / range) * 100 : 50;
      
      displayCategories = [{
        categorie: ref.key,
        label: ref.label,
        surface_totale: ref.isForfait ? null : null, // We don't know surface without extraction
        unite: ref.unite,
        montant_total_ht: montantTotalHT,
        fourchette_min: fourchetteBas,
        fourchette_max: fourchtteHaut,
        position_pct: position,
        temps_min_heures: ref.tempsMinH,
        temps_max_heures: ref.tempsMaxH,
        explication_position: getPositionLabel(position),
      }];
    }
  }
  
  // Check if we have any categories to display
  const hasCategories = displayCategories && displayCategories.length > 0;
  const isHorsCategorie = selectedWorkType === "autres" || selectedWorkType === "autre";
  
  // If no work type selected at all
  if (!selectedWorkType && !hasCategories) {
    return (
      <div className="border-2 rounded-2xl p-6 mb-6 bg-muted/30 border-border">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-background/50 rounded-xl flex-shrink-0">
            <Receipt className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-foreground text-xl mb-4">Analyse Prix & Cohérence Marché</h2>
            <div className="p-4 bg-muted/30 rounded-xl border border-border">
              <p className="text-sm text-muted-foreground">
                Aucun type de travaux n'a été renseigné lors de l'envoi du devis. 
                La comparaison de prix n'est pas disponible.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
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
          {montantTotalHT && (
            <div className="mb-6 p-3 bg-background/50 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Montant total HT du devis</p>
              <p className="text-xl font-bold text-foreground">{formatPrice(montantTotalHT)}</p>
            </div>
          )}
          
          {/* Categories gauges */}
          {isHorsCategorie ? (
            <NoReferenceBlock />
          ) : hasCategories ? (
            <div className="space-y-4">
              {displayCategories.map((cat, idx) => (
                <PriceGauge
                  key={`${cat.categorie}-${idx}`}
                  label={cat.label}
                  surface={cat.surface_totale}
                  unite={cat.unite}
                  montant={cat.montant_total_ht}
                  fourchetteBas={cat.fourchette_min}
                  fourchtteHaut={cat.fourchette_max}
                  positionPct={cat.position_pct}
                  tempsMin={cat.temps_min_heures}
                  tempsMax={cat.temps_max_heures}
                  zoneLabel={zoneLabel}
                />
              ))}
            </div>
          ) : (
            <NoReferenceBlock />
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
