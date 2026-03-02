import { CheckCircle2, Receipt, TrendingUp, TrendingDown, Minus, HelpCircle, MapPin, FileText, List, Calculator } from "lucide-react";
import { getScoreIcon, getScoreBgClass } from "@/lib/scoreUtils";
import PedagogicExplanation from "./PedagogicExplanation";

// Interface for structured work type data from database
export interface TravauxItem {
  categorie: string;
  libelle: string;
  quantite: number | null;
  unite: string;
  montant_ht: number | null;
  score_prix?: "VERT" | "ORANGE" | "ROUGE";
  fourchette_min?: number;
  fourchette_max?: number;
  zone_type?: string;
  explication?: string;
  categorie_metier?: string;
}

interface BlockDevisMultipleProps {
  typesTravaux?: TravauxItem[];
  pointsOk: string[];
  alertes: string[];
  montantTotalHT?: number;
  codePostal?: string;
  zoneType?: string;
  selectedWorkType?: string; // Type de travaux sélectionné lors de l'upload
}

// Position dans la fourchette
type PricePosition = "low" | "middle" | "high" | "above" | "below" | "unknown";

// ========================
// BIBLE DE PRIX V1.0 (OBLIGATOIRE)
// Fourchettes indicatives constatées en France
// ========================
interface OfficialCategory {
  key: string;
  label: string;
  // Fourchettes selon la Bible de Prix V1.0
  prixBas: number;
  prixMedian: number;
  prixHaut: number;
  unite: string;
}

// Catégories officielles avec Bible de Prix V1.0
const OFFICIAL_CATEGORIES: OfficialCategory[] = [
  { 
    key: "carrelage", 
    label: "Carrelage / Faïence (pose seule)", 
    prixBas: 35, prixMedian: 55, prixHaut: 80, unite: "€/m²"
  },
  { 
    key: "menuiserie", 
    label: "Menuiserie & Fermetures", 
    prixBas: 600, prixMedian: 900, prixHaut: 1300, unite: "forfait / élément"
  },
  { 
    key: "plomberie", 
    label: "Plomberie", 
    prixBas: 150, prixMedian: 300, prixHaut: 600, unite: "forfait"
  },
  { 
    key: "electricite", 
    label: "Électricité", 
    prixBas: 60, prixMedian: 90, prixHaut: 130, unite: "€/m²"
  },
  { 
    key: "chauffage", 
    label: "Chauffage / PAC / Chaudière", 
    prixBas: 8000, prixMedian: 11000, prixHaut: 15000, unite: "forfait"
  },
  { 
    key: "salle_de_bain", 
    label: "Salle de bain – rénovation", 
    prixBas: 6000, prixMedian: 9000, prixHaut: 14000, unite: "forfait"
  },
  { 
    key: "cuisine", 
    label: "Cuisine – pose / rénovation", 
    prixBas: 5000, prixMedian: 8000, prixHaut: 13000, unite: "forfait"
  },
  { 
    key: "peinture", 
    label: "Peinture", 
    prixBas: 20, prixMedian: 35, prixHaut: 55, unite: "€/m²"
  },
  { 
    key: "isolation", 
    label: "Isolation", 
    prixBas: 25, prixMedian: 45, prixHaut: 70, unite: "€/m²"
  },
  { 
    key: "toiture", 
    label: "Toiture / Couverture", 
    prixBas: 90, prixMedian: 140, prixHaut: 220, unite: "€/m²"
  },
  { 
    key: "maconnerie", 
    label: "Maçonnerie / Gros œuvre", 
    prixBas: 2000, prixMedian: 4500, prixHaut: 9000, unite: "forfait"
  },
  { 
    key: "terrasse", 
    label: "Terrasse / Aménagements extérieurs", 
    prixBas: 40, prixMedian: 70, prixHaut: 120, unite: "€/m²"
  },
  { 
    key: "piscine", 
    label: "Piscine & équipements", 
    prixBas: 300, prixMedian: 600, prixHaut: 1200, unite: "forfait"
  },
  { 
    key: "diagnostic", 
    label: "Diagnostics immobiliers", 
    prixBas: 290, prixMedian: 365, prixHaut: 440, unite: "forfait"
  },
  { 
    key: "autres", 
    label: "Autre / Hors catégorie", 
    prixBas: 0, prixMedian: 0, prixHaut: 0, unite: ""
  }
];

// Calculate price position in range
const calculatePricePosition = (
  unitPrice: number | undefined | null, 
  min: number | undefined | null, 
  max: number | undefined | null
): PricePosition => {
  if (unitPrice == null || min == null || max == null || min <= 0 || max <= 0) {
    return "unknown";
  }
  
  if (unitPrice < min) {
    return "below";
  }
  
  if (unitPrice > max) {
    return "above";
  }
  
  // Calculate position within range (0-100%)
  const range = max - min;
  const position = ((unitPrice - min) / range) * 100;
  
  if (position <= 33) {
    return "low";
  } else if (position <= 66) {
    return "middle";
  } else {
    return "high";
  }
};

// Get position label - NOUVEAUX LIBELLÉS SELON SPEC
const getPositionLabel = (position: PricePosition): string => {
  switch (position) {
    case "low":
    case "below":
      return "Proche de la fourchette basse";
    case "middle":
      return "Dans la moyenne";
    case "high":
    case "above":
      return "Proche de la fourchette haute";
    default:
      return "Position indéterminée";
  }
};

// Get position icon
const getPositionIcon = (position: PricePosition, className: string = "h-4 w-4") => {
  switch (position) {
    case "low":
    case "below":
      return <TrendingDown className={`${className} text-blue-500`} />;
    case "middle":
      return <Minus className={`${className} text-gray-500`} />;
    case "high":
    case "above":
      return <TrendingUp className={`${className} text-amber-500`} />;
    default:
      return <HelpCircle className={`${className} text-muted-foreground`} />;
  }
};

// Get position color class
const getPositionColorClass = (position: PricePosition): string => {
  switch (position) {
    case "low":
    case "below":
      return "text-blue-600";
    case "middle":
      return "text-foreground";
    case "high":
    case "above":
      return "text-amber-600";
    default:
      return "text-muted-foreground";
  }
};

const formatPrice = (price: number | null | undefined): string => {
  if (price === null || price === undefined) return "—";
  return new Intl.NumberFormat('fr-FR', { 
    style: 'currency', 
    currency: 'EUR',
    maximumFractionDigits: 0 
  }).format(price);
};

const formatPricePerUnit = (price: number | null | undefined): string => {
  if (price === null || price === undefined) return "—";
  return new Intl.NumberFormat('fr-FR', { 
    maximumFractionDigits: 0 
  }).format(price) + " €";
};

const getZoneLabel = (zoneType: string | undefined): string => {
  switch (zoneType) {
    case "grande_ville": return "Grande ville";
    case "ville_moyenne": return "Ville moyenne";
    case "province": return "Zone rurale";
    default: return "Zone standard";
  }
};

// Apply zone coefficient - MODIFICATEUR GÉOGRAPHIQUE (OBLIGATOIRE)
// Grande ville / métropole : +20%
// Ville moyenne : 0%
// Zone rurale : -10%
const applyZoneCoefficient = (price: number, zoneType: string | undefined): number => {
  switch (zoneType) {
    case "grande_ville": return price * 1.20; // +20%
    case "ville_moyenne": return price * 1.00; // 0%
    case "province": 
    case "rural": return price * 0.90; // -10%
    default: return price; // Par défaut, pas d'ajustement
  }
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

// DÉTECTION AUTOMATIQUE DÉSACTIVÉE
// La comparaison de prix doit UNIQUEMENT s'appuyer sur la catégorie sélectionnée par l'utilisateur
const detectCategory = (_items: TravauxItem[]): OfficialCategory | null => {
  // Toujours retourner null pour forcer la sélection manuelle
  return null;
};

// Calculate fourchette with zone adjustment using Bible de Prix V1.0
const calculateFourchette = (category: OfficialCategory, zoneType: string | undefined) => {
  const min = applyZoneCoefficient(category.prixBas, zoneType);
  const median = applyZoneCoefficient(category.prixMedian, zoneType);
  const max = applyZoneCoefficient(category.prixHaut, zoneType);
  return { min, median, max, unite: category.unite };
};

// State types - comparaison basée sur le type sélectionné à l'upload
type ComparisonState = "no_selection" | "confirmed" | "hors_categorie";

const BlockDevisMultiple = ({ typesTravaux, pointsOk, alertes, montantTotalHT, codePostal, zoneType, selectedWorkType }: BlockDevisMultipleProps) => {
  const items = typesTravaux && typesTravaux.length > 0 ? typesTravaux : [];
  
  // Get first zone type if available
  const displayZoneType = zoneType || items.find(i => i.zone_type)?.zone_type;
  
  // Find active category based on selectedWorkType from props (selected during upload)
  let comparisonState: ComparisonState;
  let activeCategory: OfficialCategory | null = null;
  
  if (selectedWorkType) {
    // Mapping direct - les clés correspondent maintenant à la Bible de Prix V1.0
    activeCategory = OFFICIAL_CATEGORIES.find(c => c.key === selectedWorkType) || null;
    
    if (!activeCategory || activeCategory.key === "autres") {
      comparisonState = "hors_categorie";
    } else {
      comparisonState = "confirmed";
    }
  } else {
    // Pas de type sélectionné - ne pas afficher de comparaison
    comparisonState = "no_selection";
  }
  
  // Calculate fourchette if we have an active category
  const fourchette = activeCategory && activeCategory.key !== "autres" 
    ? calculateFourchette(activeCategory, displayZoneType)
    : null;
  
  // Calculate price position for the total
  const pricePosition = fourchette && montantTotalHT
    ? calculatePricePosition(montantTotalHT, fourchette.min, fourchette.max)
    : "unknown";
  
  // If no items and no total, don't render
  if (items.length === 0 && !montantTotalHT) return null;
  
  // GLOBAL SCORE - TOUJOURS VERT OU NULL (jamais ORANGE/ROUGE pour les prix)
  const globalScore = items.length > 0 || montantTotalHT ? "VERT" : null;
  
  return (
    <div className={`border-2 rounded-2xl p-3 sm:p-6 mb-6 ${getScoreBgClass(globalScore)}`}>
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="p-2 sm:p-3 bg-background/50 rounded-xl flex-shrink-0">
          <Receipt className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-bold text-foreground text-xl">Devis & Cohérence financière</h2>
            {globalScore && getScoreIcon(globalScore, "h-6 w-6")}
          </div>
          
          {/* Zone géographique */}
          {(codePostal || displayZoneType) && (
            <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>
                Zone de référence : {getZoneLabel(displayZoneType)}
                {codePostal && ` (${codePostal})`}
              </span>
            </div>
          )}
          
          {/* Montant total */}
          {montantTotalHT && (
            <div className="mb-6 p-3 bg-background/50 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Montant total HT du devis</p>
              <p className="text-xl font-bold text-foreground">{formatPrice(montantTotalHT)}</p>
            </div>
          )}
          
          {/* ======================== */}
          {/* ÉTAT 1: AUCUN TYPE SÉLECTIONNÉ À L'UPLOAD */}
          {/* ======================== */}
          {comparisonState === "no_selection" && (
            <div className="p-4 bg-muted/30 rounded-xl border border-border">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Aucun type de travaux n'a été renseigné lors de l'envoi du devis. 
                    La comparaison de prix n'est pas disponible.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* ======================== */}
          {/* ÉTAT 2: CATÉGORIE CONFIRMÉE (avec fourchette) */}
          {/* ======================== */}
          {comparisonState === "confirmed" && activeCategory && fourchette && (
            <div className="space-y-4">
              <div className="p-4 bg-primary/5 rounded-xl border border-primary/20">
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-base font-medium text-foreground">
                      Type de travaux : {activeCategory.label}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Comparaison basée sur les prix moyens du marché pour cette catégorie.
                    </p>
                  </div>
                </div>
                
                {/* Fourchettes */}
                <div className="bg-background/50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Fourchette basse</span>
                    <span className="font-medium text-foreground">{formatPrice(fourchette.min)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Fourchette médiane</span>
                    <span className="font-medium text-foreground">{formatPrice(fourchette.median)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Fourchette haute</span>
                    <span className="font-medium text-foreground">{formatPrice(fourchette.max)}</span>
                  </div>
                  
                  {/* Position du devis */}
                  {montantTotalHT && pricePosition !== "unknown" && (
                    <div className="pt-3 border-t border-border/50">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Votre devis ({formatPrice(montantTotalHT)})</span>
                        <div className="flex items-center gap-2">
                          {getPositionIcon(pricePosition, "h-4 w-4")}
                          <span className={`font-medium ${getPositionColorClass(pricePosition)}`}>
                            {getPositionLabel(pricePosition)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* ======================== */}
          {/* ÉTAT 3: HORS RÉFÉRENTIEL (Autres travaux) */}
          {/* ======================== */}
          {comparisonState === "hors_categorie" && (
            <div className="p-4 bg-muted/30 rounded-xl border border-border">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Nous ne disposons pas de références de prix fiables pour ce type de travaux. Aucune comparaison de marché n'a pu être réalisée.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* ======================== */}
          {/* DÉTAIL DES LIGNES DU DEVIS (si disponibles) */}
          {/* ======================== */}
          {items.length > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
                <List className="h-4 w-4 text-primary" />
                Détail des postes du devis
              </h3>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="p-3 bg-background/50 rounded-lg border border-border/50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-foreground">
                        {item.libelle || item.categorie}
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {item.montant_ht ? formatPrice(item.montant_ht) : "—"}
                      </span>
                    </div>
                    {item.quantite && item.unite && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Quantité : {item.quantite} {item.unite}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* ======================== */}
          {/* TEXTE LÉGAL OBLIGATOIRE */}
          {/* ======================== */}
          <div className="mt-6 p-4 bg-muted/30 rounded-xl border border-border">
            <div className="flex items-start gap-3">
              <span className="text-lg">⚖️</span>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Les fourchettes de prix sont fournies à titre indicatif, sur la base de moyennes constatées.
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Elles ne constituent ni une expertise, ni une évaluation du travail de l'artisan.
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Les spécificités du chantier, les matériaux et le contexte local peuvent justifier des écarts.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlockDevisMultiple;
