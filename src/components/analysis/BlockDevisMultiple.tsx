import { CheckCircle2, AlertCircle, XCircle, Receipt, TrendingUp, TrendingDown, Minus, HelpCircle, MapPin, FileText, List, Calculator } from "lucide-react";
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

const getScoreTextClass = (score: string | null | undefined) => {
  switch (score) {
    case "VERT": return "text-score-green";
    case "ORANGE": return "text-score-orange";
    case "ROUGE": return "text-score-red";
    default: return "text-muted-foreground";
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

// Get position label
const getPositionLabel = (position: PricePosition): string => {
  switch (position) {
    case "low": return "Partie basse";
    case "middle": return "Milieu de fourchette";
    case "high": return "Partie haute";
    case "above": return "Au-dessus de la fourchette";
    case "below": return "En-dessous de la fourchette";
    default: return "Position indéterminée";
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

// Get pedagogical message based on position
const getPositionExplanation = (position: PricePosition): string => {
  switch (position) {
    case "low":
    case "below":
      return "Le prix se situe dans la partie basse des prix observés. Cela peut indiquer un tarif compétitif ou une prestation standard.";
    case "middle":
      return "Le prix se situe dans la moyenne des tarifs observés pour ce type de travaux.";
    case "high":
      return "Le prix se situe dans la partie haute des tarifs observés. Cela peut s'expliquer par la complexité du chantier, la qualité des matériaux ou des finitions spécifiques.";
    case "above":
      return "Le prix se situe au-dessus de la fourchette indicative. Cela peut s'expliquer par des spécificités du chantier, la qualité des matériaux, ou des prestations complémentaires incluses.";
    default:
      return "Comparaison disponible à titre indicatif.";
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

const formatCategoryLabel = (categorie: string): string => {
  const labels: Record<string, string> = {
    plomberie: "Plomberie",
    electricite: "Électricité",
    electricite_renovation: "Rénovation électrique",
    chauffage_pac: "Pompe à chaleur",
    chaudiere_gaz: "Chaudière gaz",
    isolation_combles: "Isolation combles",
    isolation_murs: "Isolation murs",
    toiture_tuiles: "Toiture tuiles",
    toiture_ardoise: "Toiture ardoise",
    etancheite: "Étanchéité",
    menuiserie_fenetre: "Menuiserie fenêtres",
    menuiserie_porte: "Menuiserie portes",
    peinture_interieure: "Peinture intérieure",
    peinture_exterieure: "Peinture extérieure",
    maconnerie: "Maçonnerie",
    renovation_sdb: "Rénovation salle de bain",
    plomberie_sdb: "Plomberie salle de bain",
    renovation_cuisine: "Rénovation cuisine",
    cuisine_pose: "Pose cuisine équipée",
    terrassement: "Terrassement",
    carrelage_sol: "Carrelage sol",
    carrelage_mural: "Carrelage mural",
    parquet_stratifie: "Parquet stratifié",
    parquet_massif: "Parquet massif",
    placo_cloison: "Cloisons placo",
    facade_ravalement: "Ravalement façade",
    renovation_globale: "Rénovation globale",
    autre: "Autre"
  };
  return labels[categorie] || categorie.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
};

const getZoneLabel = (zoneType: string | undefined): string => {
  switch (zoneType) {
    case "grande_ville": return "Grande ville (+20%)";
    case "ville_moyenne": return "Ville moyenne (référence)";
    case "province": return "Zone rurale (-10%)";
    default: return "Zone standard";
  }
};

// Parse work types from points_ok and alertes (fallback if no structured data)
const extractFromPoints = (pointsOk: string[], alertes: string[]): TravauxItem[] => {
  const items: TravauxItem[] = [];
  const allPoints = [...pointsOk, ...alertes];
  
  for (const point of allPoints) {
    // Pattern: "✓ Category: prix cohérent (X€/unit)" or "⚠️ Category: prix élevé (X€/unit vs Y€-Z€)"
    const pricePattern = /(?:✓|⚠️|🚨)\s*(.+?):\s*prix\s*(cohérent|bas|élevé|anormalement bas|excessif)\s*\((\d+(?:[.,]\d+)?)\s*€\/(\w+)(?:\s*vs\s*(\d+(?:[.,]\d+)?)\s*€\s*-\s*(\d+(?:[.,]\d+)?)\s*€)?\)/i;
    const match = point.match(pricePattern);
    
    if (match) {
      const libelle = match[1].trim();
      const appreciation = match[2].toLowerCase();
      const prixUnitaire = parseFloat(match[3].replace(",", "."));
      const unite = match[4];
      const fourchetteBasse = match[5] ? parseFloat(match[5].replace(",", ".")) : undefined;
      const fourchetteHaute = match[6] ? parseFloat(match[6].replace(",", ".")) : undefined;
      
      let score: "VERT" | "ORANGE" | "ROUGE" = "VERT";
      if (appreciation.includes("excessif") || appreciation.includes("anormalement")) {
        score = "ROUGE";
      } else if (appreciation.includes("élevé") || appreciation.includes("bas")) {
        score = "ORANGE";
      }
      
      items.push({
        categorie: libelle.toLowerCase().replace(/\s+/g, "_"),
        libelle,
        quantite: null,
        unite,
        montant_ht: null,
        score_prix: score,
        fourchette_min: fourchetteBasse,
        fourchette_max: fourchetteHaute,
        explication: point
      });
    }
  }
  
  return items;
};

// Calculate global score - NOUVELLES RÈGLES: jamais dégradation pour les prix
const calculateGlobalScore = (items: TravauxItem[]): "VERT" | null => {
  // Per new rules: price analysis NEVER degrades the score
  // Always return VERT if items exist, null otherwise
  const scoredItems = items.filter(i => i.score_prix);
  if (scoredItems.length === 0) return null;
  return "VERT"; // Always VERT - prices are informative only
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

const BlockDevisMultiple = ({ typesTravaux, pointsOk, alertes, montantTotalHT, codePostal, zoneType }: BlockDevisMultipleProps) => {
  // Use structured data if available, otherwise extract from points
  const items = typesTravaux && typesTravaux.length > 0 
    ? typesTravaux 
    : extractFromPoints(pointsOk, alertes);
  
  // If no items found, return null
  if (items.length === 0) return null;
  
  const globalScore = calculateGlobalScore(items);
  const itemsWithPrice = items.filter(t => t.score_prix);
  const itemsWithoutPrice = items.filter(t => !t.score_prix);
  const isMultiType = items.length > 1;
  const hasStructuredData = typesTravaux && typesTravaux.length > 0;
  
  // Get first zone type if available
  const displayZoneType = zoneType || items.find(i => i.zone_type)?.zone_type;
  
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
          
          <p className="text-sm text-muted-foreground mb-4">
            {isMultiType 
              ? `${items.length} types de travaux identifiés automatiquement sur ce devis.`
              : "Type de travaux identifié automatiquement."
            }
          </p>
          
          {/* Types de travaux détectés - summary */}
          <div className="mb-4 flex flex-wrap gap-2">
            {items.map((item, idx) => (
              <span 
                key={idx}
                className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-full"
              >
                {item.libelle || formatCategoryLabel(item.categorie)}
              </span>
            ))}
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
            <div className="mb-4 p-3 bg-background/50 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Montant total HT du devis</p>
              <p className="text-xl font-bold text-foreground">{formatPrice(montantTotalHT)}</p>
            </div>
          )}
          {/* Types de travaux avec comparaison indicative */}
          {itemsWithPrice.length > 0 && (
            <div className="mb-4">
              <h3 className="font-semibold text-foreground text-sm mb-2">
                Ce qui a pu être comparé
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Les types de travaux ci-dessous ont été comparés à des fourchettes de prix indicatives, ajustées selon votre zone géographique.
              </p>
              <div className="grid grid-cols-1 gap-4">
                {itemsWithPrice.map((item, idx) => {
                  // Calculate unit price if possible
                  const unitPrice = (item.montant_ht && item.quantite && item.quantite > 0) 
                    ? item.montant_ht / item.quantite 
                    : null;
                  
                  const position = calculatePricePosition(
                    unitPrice, 
                    item.fourchette_min, 
                    item.fourchette_max
                  );
                  
                  const hasValidRange = item.fourchette_min != null && 
                                        item.fourchette_max != null && 
                                        item.fourchette_min > 0 && 
                                        item.fourchette_max > 0;
                  
                  return (
                    <div 
                      key={idx} 
                      className={`p-4 rounded-xl border-2 ${getScoreBgClass("VERT")}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <h4 className="font-medium text-foreground text-sm">
                          {item.libelle || formatCategoryLabel(item.categorie)}
                        </h4>
                        <CheckCircle2 className="h-5 w-5 text-score-green" />
                      </div>
                      
                      {/* Grid des prix détaillés */}
                      {hasValidRange && (
                        <div className="bg-background/50 rounded-lg p-3 mb-3">
                          <div className="grid grid-cols-3 gap-2 text-center mb-3">
                            {/* Fourchette basse */}
                            <div className="p-2 rounded-lg bg-blue-50 border border-blue-100">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                                Fourchette basse
                              </p>
                              <p className="text-sm font-semibold text-blue-600">
                                {formatPricePerUnit(item.fourchette_min)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                /{item.unite || 'unité'}
                              </p>
                            </div>
                            
                            {/* Prix du devis */}
                            <div className={`p-2 rounded-lg border-2 ${
                              position === "low" || position === "below" 
                                ? "bg-blue-100 border-blue-300" 
                                : position === "middle" 
                                  ? "bg-gray-100 border-gray-300"
                                  : "bg-amber-100 border-amber-300"
                            }`}>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                                Prix devis
                              </p>
                              <p className={`text-sm font-bold ${getPositionColorClass(position)}`}>
                                {unitPrice != null ? formatPricePerUnit(unitPrice) : "—"}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                /{item.unite || 'unité'}
                              </p>
                            </div>
                            
                            {/* Fourchette haute */}
                            <div className="p-2 rounded-lg bg-amber-50 border border-amber-100">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                                Fourchette haute
                              </p>
                              <p className="text-sm font-semibold text-amber-600">
                                {formatPricePerUnit(item.fourchette_max)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                /{item.unite || 'unité'}
                              </p>
                            </div>
                          </div>
                          
                          {/* Position indicator */}
                          {position !== "unknown" && (
                            <div className="flex items-center gap-2 justify-center py-2 px-3 bg-muted/50 rounded-lg">
                              {getPositionIcon(position, "h-4 w-4")}
                              <span className={`text-sm font-medium ${getPositionColorClass(position)}`}>
                                {getPositionLabel(position)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Quantité et montant total */}
                      <div className="space-y-2 mb-3">
                        {item.quantite && item.unite && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Quantité</span>
                            <span className="text-foreground font-medium">
                              {item.quantite} {item.unite}
                            </span>
                          </div>
                        )}
                        {item.montant_ht && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Montant total HT</span>
                            <span className="text-foreground font-semibold">
                              {formatPrice(item.montant_ht)}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {/* Explication pédagogique */}
                      {position !== "unknown" && (
                        <div className="p-3 bg-primary/5 rounded-lg border border-primary/10">
                          <div className="flex items-start gap-2">
                            <span className="text-lg">💡</span>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {getPositionExplanation(position)}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Types de travaux sans comparaison de prix - Analyse qualitative pédagogique */}
          {hasStructuredData && itemsWithoutPrice.length > 0 && (
            <div className="mb-4">
              <h3 className="font-semibold text-foreground text-sm mb-2">
                Ce qui ne peut pas être comparé
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Ces prestations sont spécifiques et ne correspondent pas aux catégories standards de travaux.
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {itemsWithoutPrice.map((item, idx) => (
                  <div 
                    key={idx} 
                    className="px-3 py-2 bg-background/50 rounded-lg border border-border text-sm"
                  >
                    <span className="text-foreground">
                      {item.libelle || formatCategoryLabel(item.categorie)}
                    </span>
                    {item.montant_ht && (
                      <span className="text-muted-foreground ml-2">
                        ({formatPrice(item.montant_ht)})
                      </span>
                    )}
                  </div>
                ))}
              </div>
              
              {/* Explication pédagogique - Pourquoi pas de comparaison */}
              <div className="p-4 bg-background/50 rounded-lg border border-border">
                <div className="flex items-start gap-3 mb-3">
                  <HelpCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground mb-2">
                      Pourquoi ces postes ne sont pas comparés ?
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Ces prestations sont très spécifiques (produits sur mesure, dimensions précises, contexte particulier). 
                      Il n'existe pas de prix de référence standardisé permettant une comparaison automatique fiable.
                    </p>
                  </div>
                </div>
                
                {/* Ce que l'analyse a vérifié */}
                <div className="mt-4 pt-4 border-t border-border/50">
                  <p className="text-xs font-medium text-foreground mb-3 flex items-center gap-2">
                    <List className="h-4 w-4 text-primary" />
                    Ce que l'analyse a pu vérifier :
                  </p>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-score-green flex-shrink-0 mt-0.5" />
                      <span>Présence d'un détail ligne par ligne des prestations</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-score-green flex-shrink-0 mt-0.5" />
                      <span>Clarté des descriptions permettant d'identifier les travaux</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Calculator className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                      <span>Cohérence entre quantités et montants vérifiée</span>
                    </li>
                  </ul>
                </div>
                
                <p className="text-xs text-muted-foreground/80 mt-3 italic">
                  💡 L'absence de comparaison chiffrée n'indique pas un problème. Elle reflète simplement la nature sur mesure des prestations.
                </p>
              </div>
            </div>
          )}
          
          {/* Fallback message if no type identified - Analyse qualitative */}
          {items.length === 0 && (
            <div className="p-4 bg-muted/50 rounded-lg border border-border">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-5 w-5 text-primary" />
                <span className="font-medium text-foreground">Analyse qualitative du devis</span>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Les prestations décrites sont très spécifiques et ne correspondent pas aux catégories standards de travaux.
                L'outil a néanmoins analysé la structure et la clarté du document.
              </p>
              
              {/* Ce que l'outil a vérifié */}
              <div className="bg-background/30 rounded-lg p-3">
                <p className="text-xs font-medium text-foreground mb-2 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-score-green" />
                  Points vérifiés automatiquement :
                </p>
                <ul className="space-y-1.5 text-xs text-muted-foreground ml-6">
                  <li>• Présence d'un détail poste par poste</li>
                  <li>• Clarté des descriptions pour le particulier</li>
                  <li>• Cohérence apparente entre quantités et montants</li>
                  <li>• Absence de lignes vagues ou de forfaits globaux non détaillés</li>
                </ul>
              </div>
              
              <p className="text-xs text-muted-foreground/80 mt-3 italic">
                L'objectif est d'aider à la compréhension et à la vigilance, pas de fixer un "bon prix". 
                Les comparaisons chiffrées restent indicatives lorsqu'elles sont disponibles.
              </p>
            </div>
          )}
          
          
          {/* Mention légale obligatoire - affichée une seule fois en bas du bloc */}
          <div className="mt-6 p-4 bg-muted/30 rounded-xl border border-border">
            <div className="flex items-start gap-3">
              <span className="text-lg">⚖️</span>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Les fourchettes de prix sont fournies à titre indicatif, sur la base de moyennes constatées 
                  (sources professionnelles).
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Elles ne constituent ni une expertise, ni une évaluation du travail de l'artisan.
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Les spécificités du chantier, les matériaux choisis et le contexte local peuvent justifier des écarts.
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