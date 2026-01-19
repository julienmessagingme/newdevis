import { useState } from "react";
import { CheckCircle2, AlertCircle, XCircle, Receipt, TrendingUp, TrendingDown, Minus, HelpCircle, MapPin, FileText, List, Calculator, ChevronDown } from "lucide-react";
import PedagogicExplanation from "./PedagogicExplanation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
}

// Position dans la fourchette
type PricePosition = "low" | "middle" | "high" | "above" | "below" | "unknown";

// ========================
// CATÉGORIES OFFICIELLES (15)
// ========================
interface OfficialCategory {
  key: string;
  label: string;
  keywords: string[];
  // Fourchettes indicatives par m² ou unité (à titre illustratif)
  prixMinBase: number;
  prixMaxBase: number;
  unite: string;
}

const OFFICIAL_CATEGORIES: OfficialCategory[] = [
  { 
    key: "menuiserie_fermetures", 
    label: "Menuiserie & fermetures", 
    keywords: ["fenetre", "fenêtre", "porte", "volet", "menuiserie", "fermeture", "store", "vitrage", "chassis", "baie", "velux", "pergola", "portail", "grille", "porte-fenetre", "porte fenêtre"],
    prixMinBase: 250, prixMaxBase: 800, unite: "unité"
  },
  { 
    key: "carrelage_faience", 
    label: "Carrelage / faïence", 
    keywords: ["carrelage", "faience", "faïence", "carreau", "mosaïque", "mosaique"],
    prixMinBase: 40, prixMaxBase: 120, unite: "m²"
  },
  { 
    key: "peinture_revetements", 
    label: "Peinture & revêtements muraux", 
    keywords: ["peinture", "papier peint", "enduit", "crepi", "crépi", "revetement mural", "revêtement mural"],
    prixMinBase: 25, prixMaxBase: 60, unite: "m²"
  },
  { 
    key: "plomberie", 
    label: "Plomberie", 
    keywords: ["plomberie", "robinet", "tuyauterie", "canalisation", "evacuation", "évacuation", "vidange", "chauffe-eau", "cumulus", "ballon"],
    prixMinBase: 500, prixMaxBase: 2000, unite: "prestation"
  },
  { 
    key: "electricite", 
    label: "Électricité", 
    keywords: ["electri", "électri", "tableau", "prise", "interrupteur", "cable", "câble", "disjoncteur", "domotique", "eclairage", "éclairage", "spot", "luminaire"],
    prixMinBase: 80, prixMaxBase: 150, unite: "point"
  },
  { 
    key: "chauffage_pac", 
    label: "Chauffage / PAC / chaudière", 
    keywords: ["chauffage", "pac", "pompe à chaleur", "pompe a chaleur", "climatisation", "clim", "chaudiere", "chaudière", "radiateur", "plancher chauffant", "thermostat", "split", "gainable"],
    prixMinBase: 3000, prixMaxBase: 15000, unite: "installation"
  },
  { 
    key: "isolation", 
    label: "Isolation", 
    keywords: ["isolation", "isolant", "combles", "laine", "polystyrene", "polystyrène", "ite", "iti"],
    prixMinBase: 30, prixMaxBase: 100, unite: "m²"
  },
  { 
    key: "toiture_couverture", 
    label: "Toiture / couverture", 
    keywords: ["toiture", "toit", "ardoise", "tuile", "couverture", "charpente", "gouttiere", "gouttière", "zinguerie", "etancheite", "étanchéité"],
    prixMinBase: 80, prixMaxBase: 200, unite: "m²"
  },
  { 
    key: "maconnerie", 
    label: "Maçonnerie", 
    keywords: ["maconnerie", "maçonnerie", "facade", "façade", "ravalement", "terrassement", "dalle", "fondation", "mur", "cloture", "clôture", "beton", "béton", "agglo", "parpaing"],
    prixMinBase: 100, prixMaxBase: 300, unite: "m²"
  },
  { 
    key: "salle_de_bain", 
    label: "Salle de bain", 
    keywords: ["salle de bain", "sdb", "douche", "baignoire", "meuble vasque", "wc", "toilette", "sanitaire"],
    prixMinBase: 4000, prixMaxBase: 15000, unite: "pièce"
  },
  { 
    key: "cuisine", 
    label: "Cuisine", 
    keywords: ["cuisine", "electromenager", "électroménager", "plan de travail", "credence", "crédence", "evier", "évier", "hotte"],
    prixMinBase: 5000, prixMaxBase: 20000, unite: "pièce"
  },
  { 
    key: "piscine_equipements", 
    label: "Piscine & équipements", 
    keywords: ["piscine", "pompe piscine", "filtration", "liner", "spa", "jacuzzi", "local technique"],
    prixMinBase: 500, prixMaxBase: 5000, unite: "équipement"
  },
  { 
    key: "terrasse_exterieur", 
    label: "Terrasse / aménagement extérieur", 
    keywords: ["terrasse", "bois composite", "deck", "jardin", "arrosage", "amenagement exterieur", "aménagement extérieur", "cloture", "clôture", "portail"],
    prixMinBase: 80, prixMaxBase: 250, unite: "m²"
  },
  { 
    key: "diagnostic_immobilier", 
    label: "Diagnostic immobilier", 
    keywords: ["diagnostic", "dpe", "amiante", "plomb", "termite", "electricite", "gaz"],
    prixMinBase: 100, prixMaxBase: 600, unite: "diagnostic"
  },
  { 
    key: "autre", 
    label: "Autre (hors catégorie)", 
    keywords: [],
    prixMinBase: 0, prixMaxBase: 0, unite: ""
  }
];

const getScoreIcon = (score: string | null | undefined, className: string = "h-4 w-4") => {
  switch (score) {
    case "VERT": return <CheckCircle2 className={`${className} text-score-green`} />;
    case "ORANGE": return <AlertCircle className={`${className} text-score-orange`} />;
    case "ROUGE": return <XCircle className={`${className} text-score-red`} />;
    default: return <HelpCircle className={`${className} text-muted-foreground`} />;
  }
};

const getScoreBgClass = (score: string | null | undefined) => {
  switch (score) {
    case "VERT": return "bg-score-green-bg border-score-green/30";
    case "ORANGE": return "bg-score-orange-bg border-score-orange/30";
    case "ROUGE": return "bg-score-red-bg border-score-red/30";
    default: return "bg-muted border-border";
  }
};

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

// Apply zone coefficient
const applyZoneCoefficient = (price: number, zoneType: string | undefined): number => {
  switch (zoneType) {
    case "grande_ville": return price * 1.20; // +20%
    case "ville_moyenne": return price * 1.00; // 0%
    case "province": return price * 0.90; // -10%
    default: return price;
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

// Detect category from items
const detectCategory = (items: TravauxItem[]): OfficialCategory | null => {
  if (items.length === 0) return null;
  
  // Build search text from all items
  const searchText = items
    .map(item => `${item.categorie || ""} ${item.libelle || ""} ${item.categorie_metier || ""}`)
    .join(" ")
    .toLowerCase();
  
  // Find matching category
  for (const cat of OFFICIAL_CATEGORIES) {
    if (cat.key === "autre") continue; // Skip "autre" for auto-detection
    if (cat.keywords.some(kw => searchText.includes(kw))) {
      return cat;
    }
  }
  
  return null;
};

// Calculate fourchette with zone adjustment
const calculateFourchette = (category: OfficialCategory, zoneType: string | undefined) => {
  const min = applyZoneCoefficient(category.prixMinBase, zoneType);
  const max = applyZoneCoefficient(category.prixMaxBase, zoneType);
  const median = (min + max) / 2;
  return { min, median, max, unite: category.unite };
};

// State types
type ComparisonState = "auto" | "user_choice" | "hors_categorie";

const BlockDevisMultiple = ({ typesTravaux, pointsOk, alertes, montantTotalHT, codePostal, zoneType }: BlockDevisMultipleProps) => {
  const items = typesTravaux && typesTravaux.length > 0 ? typesTravaux : [];
  
  // State for user category selection
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);
  const [userConfirmedCategory, setUserConfirmedCategory] = useState<boolean>(false);
  
  // Get first zone type if available
  const displayZoneType = zoneType || items.find(i => i.zone_type)?.zone_type;
  
  // Detect category automatically
  const autoDetectedCategory = detectCategory(items);
  
  // Determine comparison state
  let comparisonState: ComparisonState;
  let activeCategory: OfficialCategory | null = null;
  
  if (userConfirmedCategory && selectedCategoryKey) {
    // User has selected a category
    activeCategory = OFFICIAL_CATEGORIES.find(c => c.key === selectedCategoryKey) || null;
    if (activeCategory?.key === "autre") {
      comparisonState = "hors_categorie";
    } else {
      comparisonState = "user_choice";
    }
  } else if (autoDetectedCategory) {
    // Auto-detected category
    activeCategory = autoDetectedCategory;
    comparisonState = "auto";
  } else {
    // No category detected - show user choice
    comparisonState = "user_choice";
  }
  
  // Calculate fourchette if we have an active category
  const fourchette = activeCategory && activeCategory.key !== "autre" 
    ? calculateFourchette(activeCategory, displayZoneType)
    : null;
  
  // Calculate price position for the total
  const pricePosition = fourchette && montantTotalHT
    ? calculatePricePosition(montantTotalHT, fourchette.min, fourchette.max)
    : "unknown";
  
  // Handle category selection
  const handleCategorySelect = (value: string) => {
    setSelectedCategoryKey(value);
    setUserConfirmedCategory(true);
  };
  
  // If no items and no total, don't render
  if (items.length === 0 && !montantTotalHT) return null;
  
  // GLOBAL SCORE - TOUJOURS VERT OU NULL (jamais ORANGE/ROUGE pour les prix)
  const globalScore = items.length > 0 || montantTotalHT ? "VERT" : null;
  
  return (
    <div className={`border-2 rounded-2xl p-6 mb-6 ${getScoreBgClass(globalScore)}`}>
      <div className="flex items-start gap-4">
        <div className="p-3 bg-background/50 rounded-xl flex-shrink-0">
          <Receipt className="h-6 w-6 text-primary" />
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
          {/* ÉTAT 1: COMPARAISON AUTOMATIQUE */}
          {/* ======================== */}
          {comparisonState === "auto" && activeCategory && fourchette && (
            <div className="space-y-4">
              <div className="p-4 bg-primary/5 rounded-xl border border-primary/20">
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-base font-medium text-foreground">
                      Catégorie détectée : {activeCategory.label}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Comparaison automatique effectuée sur la base des prix moyens du marché.
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
              
              {/* Option pour changer de catégorie */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Catégorie incorrecte ?</span>
                <button 
                  onClick={() => {
                    setSelectedCategoryKey(null);
                    setUserConfirmedCategory(false);
                  }}
                  className="text-primary hover:underline"
                >
                  Modifier
                </button>
              </div>
            </div>
          )}
          
          {/* ======================== */}
          {/* ÉTAT 2: CHOIX UTILISATEUR */}
          {/* ======================== */}
          {comparisonState === "user_choice" && !userConfirmedCategory && (
            <div className="space-y-4">
              <div className="p-4 bg-muted/30 rounded-xl border border-border">
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-2 bg-muted rounded-lg">
                    <HelpCircle className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-base font-medium text-foreground">
                      Catégorie de travaux non identifiée automatiquement
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Pour afficher une comparaison de prix, sélectionnez le type de travaux correspondant.
                    </p>
                  </div>
                </div>
                
                {/* Menu déroulant */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">
                    À quel type de travaux correspond le mieux ce devis ?
                  </label>
                  <Select onValueChange={handleCategorySelect}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sélectionnez une catégorie..." />
                    </SelectTrigger>
                    <SelectContent>
                      {OFFICIAL_CATEGORIES.map(cat => (
                        <SelectItem key={cat.key} value={cat.key}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Message informatif */}
              <div className="p-3 bg-primary/5 rounded-lg border border-primary/10">
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <span>ℹ️</span>
                  <span>L'absence de comparaison automatique n'indique pas un problème. Elle reflète simplement que le type de travaux n'a pas pu être identifié automatiquement.</span>
                </p>
              </div>
            </div>
          )}
          
          {/* ======================== */}
          {/* ÉTAT 2bis: APRÈS CHOIX UTILISATEUR (avec fourchette) */}
          {/* ======================== */}
          {comparisonState === "user_choice" && userConfirmedCategory && activeCategory && fourchette && (
            <div className="space-y-4">
              <div className="p-4 bg-primary/5 rounded-xl border border-primary/20">
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-base font-medium text-foreground">
                      Catégorie sélectionnée : {activeCategory.label}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Comparaison effectuée sur la base des prix moyens du marché.
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
              
              {/* Option pour changer de catégorie */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Catégorie incorrecte ?</span>
                <button 
                  onClick={() => {
                    setSelectedCategoryKey(null);
                    setUserConfirmedCategory(false);
                  }}
                  className="text-primary hover:underline"
                >
                  Modifier
                </button>
              </div>
            </div>
          )}
          
          {/* ======================== */}
          {/* ÉTAT 3: HORS CATÉGORIE (Autre) */}
          {/* ======================== */}
          {comparisonState === "hors_categorie" && (
            <div className="space-y-4">
              <div className="p-4 bg-muted/30 rounded-xl border border-border">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-muted rounded-lg">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-base font-medium text-foreground mb-3">
                      Travaux hors catégorie standard
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Nous n'avons pas pu analyser ce devis par comparaison de prix, car il concerne une catégorie de travaux ne disposant pas de références fiables.
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed mt-2">
                      <strong>Cela n'indique ni un problème de prix, ni un risque particulier.</strong>
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Option pour changer de catégorie */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Vous souhaitez essayer une autre catégorie ?</span>
                <button 
                  onClick={() => {
                    setSelectedCategoryKey(null);
                    setUserConfirmedCategory(false);
                  }}
                  className="text-primary hover:underline"
                >
                  Modifier
                </button>
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
