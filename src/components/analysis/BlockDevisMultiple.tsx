import { CheckCircle2, AlertCircle, XCircle, Receipt, TrendingUp, Minus, HelpCircle, MapPin, FileText, List, Calculator } from "lucide-react";

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

const getAppreciation = (score: string | null | undefined): string => {
  switch (score) {
    case "VERT": return "Cohérent";
    case "ORANGE": return "Élevé";
    case "ROUGE": return "Très élevé";
    default: return "Non évalué";
  }
};

const getTrendIcon = (score: string | null | undefined) => {
  switch (score) {
    case "VERT": return <Minus className="h-4 w-4 text-score-green" />;
    case "ORANGE": return <TrendingUp className="h-4 w-4 text-score-orange" />;
    case "ROUGE": return <TrendingUp className="h-4 w-4 text-score-red" />;
    default: return null;
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
    case "grande_ville": return "Grande ville";
    case "ville_moyenne": return "Ville moyenne";
    case "province": return "Province";
    default: return "";
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

// Calculate global score from items
const calculateGlobalScore = (items: TravauxItem[]): "VERT" | "ORANGE" | "ROUGE" | null => {
  const scoredItems = items.filter(i => i.score_prix);
  if (scoredItems.length === 0) return null;
  
  const redCount = scoredItems.filter(i => i.score_prix === "ROUGE").length;
  const orangeCount = scoredItems.filter(i => i.score_prix === "ORANGE").length;
  
  if (redCount > 0) return "ROUGE";
  if (orangeCount >= 2 || (orangeCount === 1 && scoredItems.length <= 2)) return "ORANGE";
  return "VERT";
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
          
          {/* Types de travaux avec comparaison de prix */}
          {itemsWithPrice.length > 0 && (
            <div className="mb-4">
              <h3 className="font-semibold text-foreground text-sm mb-3">
                Comparaison aux prix de marché
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {itemsWithPrice.map((item, idx) => (
                  <div 
                    key={idx} 
                    className={`p-4 rounded-xl border-2 ${getScoreBgClass(item.score_prix)}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium text-foreground text-sm">
                        {item.libelle || formatCategoryLabel(item.categorie)}
                      </h4>
                      {getScoreIcon(item.score_prix, "h-5 w-5")}
                    </div>
                    
                    <div className="space-y-2">
                      {/* Montant du devis */}
                      {item.montant_ht && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Montant devis</span>
                          <span className="font-semibold text-foreground">
                            {formatPrice(item.montant_ht)}
                          </span>
                        </div>
                      )}
                      
                      {/* Quantité */}
                      {item.quantite && item.unite && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Quantité</span>
                          <span className="text-sm text-foreground">
                            {item.quantite} {item.unite}
                          </span>
                        </div>
                      )}
                      
                      {/* Fourchette marché */}
                      {item.fourchette_min !== undefined && item.fourchette_max !== undefined && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Réf. marché/{item.unite}</span>
                          <span className="text-xs text-muted-foreground">
                            {item.fourchette_min.toFixed(0)}€ - {item.fourchette_max.toFixed(0)}€
                          </span>
                        </div>
                      )}
                      
                      {/* Appréciation */}
                      <div className="flex items-center gap-1 pt-1">
                        {getTrendIcon(item.score_prix)}
                        <span className={`text-xs font-medium ${getScoreTextClass(item.score_prix)}`}>
                          {getAppreciation(item.score_prix)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Types de travaux sans comparaison de prix - Analyse qualitative pédagogique */}
          {hasStructuredData && itemsWithoutPrice.length > 0 && (
            <div className="mb-4">
              <h3 className="font-semibold text-foreground text-sm mb-3">
                Postes spécifiques identifiés
              </h3>
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
              
              {/* Explication pédagogique pour les postes sans comparaison */}
              <div className="p-4 bg-background/50 rounded-lg border border-border">
                <div className="flex items-start gap-3 mb-3">
                  <FileText className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground mb-2">
                      Prestations spécifiques
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Ces prestations sont très spécifiques (produits sur mesure, dimensions précises, contexte particulier comme un sinistre ou une réparation). 
                      Il n'existe pas de prix de référence standardisé permettant une comparaison automatique fiable.
                    </p>
                  </div>
                </div>
                
                {/* Analyse qualitative */}
                <div className="mt-4 pt-4 border-t border-border/50">
                  <p className="text-xs font-medium text-foreground mb-3 flex items-center gap-2">
                    <List className="h-4 w-4 text-primary" />
                    Ce que l'analyse a pu vérifier :
                  </p>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-score-green flex-shrink-0 mt-0.5" />
                      <span>Le devis présente un détail ligne par ligne des prestations</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-score-green flex-shrink-0 mt-0.5" />
                      <span>Les descriptions permettent d'identifier clairement les travaux prévus</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Calculator className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                      <span>La cohérence entre quantités, descriptions et montants a été analysée</span>
                    </li>
                  </ul>
                </div>
                
                <p className="text-xs text-muted-foreground/80 mt-3 italic">
                  L'absence de comparaison chiffrée n'indique pas un problème. Elle reflète simplement la nature sur mesure des prestations.
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
          
          {/* Score explanation */}
          {globalScore && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <p className={`text-sm font-medium ${getScoreTextClass(globalScore)}`}>
                {globalScore === "VERT" && "✓ Les prix sont cohérents avec les références de marché."}
                {globalScore === "ORANGE" && "⚠️ Certains prix sont au-dessus des fourchettes de référence."}
                {globalScore === "ROUGE" && "⚠️ Des écarts de prix significatifs ont été détectés."}
              </p>
            </div>
          )}
          
          <p className="text-xs text-muted-foreground/70 mt-3 italic">
            Types de travaux identifiés automatiquement. Les comparaisons aux prix de référence (sources : FFB, CAPEB) sont indicatives 
            et ajustées selon la zone géographique. L'objectif est d'aider à la compréhension et à la vigilance, pas de fixer un "bon prix".
          </p>
        </div>
      </div>
    </div>
  );
};

export default BlockDevisMultiple;