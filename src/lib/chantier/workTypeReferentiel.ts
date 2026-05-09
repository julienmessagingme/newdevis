/**
 * Référentiel hiérarchique des types de travaux
 * Structure: Catégorie > Sous-types métier > Fourchettes de prix
 * 
 * RÈGLE ABSOLUE: La jauge de prix ne doit JAMAIS être calculée à partir du texte du devis seul.
 * Elle utilise TOUJOURS une catégorie métier choisie par l'utilisateur.
 */

// =======================
// TYPES
// =======================

export interface SousType {
  key: string;
  label: string;
  prixMin: number;
  prixMax: number;
  unite: "m²" | "ml" | "unité" | "forfait";
  tempsMinH: number;
  tempsMaxH: number;
  description?: string;
}

export interface Categorie {
  key: string;
  label: string;
  sousTypes: SousType[];
}

// =======================
// BIBLE DE PRIX HIÉRARCHIQUE V3.0
// =======================

export const CATEGORIES_TRAVAUX: Categorie[] = [
  {
    key: "exterieur",
    label: "Extérieur",
    sousTypes: [
      { key: "allee_voirie", label: "Allée / accès / voirie privée", prixMin: 45, prixMax: 120, unite: "m²", tempsMinH: 0.5, tempsMaxH: 1.2, description: "Création ou rénovation d'allées, chemins d'accès, pavés" },
      { key: "terrasse_decorative", label: "Terrasse décorative", prixMin: 60, prixMax: 180, unite: "m²", tempsMinH: 0.8, tempsMaxH: 1.5, description: "Terrasse bois, composite, dalles sur plot" },
      { key: "cloture_portail", label: "Clôture / portail", prixMin: 120, prixMax: 450, unite: "ml", tempsMinH: 1, tempsMaxH: 3, description: "Clôture, grillage, portail coulissant ou battant" },
      { key: "amenagement_jardin", label: "Aménagement jardin / espaces verts", prixMin: 25, prixMax: 80, unite: "m²", tempsMinH: 0.3, tempsMaxH: 0.8, description: "Engazonnement, plantations, création massifs" },
      { key: "eclairage_exterieur", label: "Éclairage extérieur", prixMin: 150, prixMax: 400, unite: "unité", tempsMinH: 1.5, tempsMaxH: 3, description: "Bornes, spots, projecteurs" },
    ],
  },
  {
    key: "interieur",
    label: "Intérieur",
    sousTypes: [
      { key: "carrelage_sol", label: "Carrelage sol", prixMin: 35, prixMax: 90, unite: "m²", tempsMinH: 0.6, tempsMaxH: 1.2, description: "Pose carrelage sol classique ou grand format" },
      { key: "carrelage_mural", label: "Carrelage mural / faïence", prixMin: 40, prixMax: 100, unite: "m²", tempsMinH: 0.8, tempsMaxH: 1.5, description: "Faïence salle de bain, cuisine, crédence" },
      { key: "parquet", label: "Parquet / sol stratifié", prixMin: 25, prixMax: 80, unite: "m²", tempsMinH: 0.3, tempsMaxH: 0.7, description: "Pose parquet massif, contrecollé ou stratifié" },
      { key: "peinture_murs", label: "Peinture murs", prixMin: 15, prixMax: 40, unite: "m²", tempsMinH: 0.15, tempsMaxH: 0.35, description: "Préparation et peinture murs intérieurs" },
      { key: "peinture_plafond", label: "Peinture plafond", prixMin: 18, prixMax: 45, unite: "m²", tempsMinH: 0.2, tempsMaxH: 0.4, description: "Peinture plafond, raccords" },
      { key: "papier_peint", label: "Papier peint / revêtement mural", prixMin: 20, prixMax: 60, unite: "m²", tempsMinH: 0.3, tempsMaxH: 0.6, description: "Pose papier peint, toile de verre" },
    ],
  },
  {
    key: "menuiseries",
    label: "Menuiseries & fermetures",
    sousTypes: [
      { key: "fenetre_pvc", label: "Fenêtre PVC", prixMin: 350, prixMax: 700, unite: "unité", tempsMinH: 2, tempsMaxH: 4, description: "Fenêtre PVC double vitrage standard" },
      { key: "fenetre_alu", label: "Fenêtre aluminium", prixMin: 500, prixMax: 1200, unite: "unité", tempsMinH: 2.5, tempsMaxH: 5, description: "Fenêtre alu, coulissant" },
      { key: "fenetre_bois", label: "Fenêtre bois", prixMin: 600, prixMax: 1400, unite: "unité", tempsMinH: 3, tempsMaxH: 6, description: "Fenêtre bois massif ou mixte" },
      { key: "porte_entree", label: "Porte d'entrée", prixMin: 1500, prixMax: 4500, unite: "unité", tempsMinH: 4, tempsMaxH: 8, description: "Porte entrée sécurisée" },
      { key: "porte_interieure", label: "Porte intérieure", prixMin: 200, prixMax: 600, unite: "unité", tempsMinH: 1.5, tempsMaxH: 3, description: "Bloc-porte intérieur" },
      { key: "volet_roulant", label: "Volet roulant", prixMin: 300, prixMax: 800, unite: "unité", tempsMinH: 2, tempsMaxH: 4, description: "Volet roulant manuel ou motorisé" },
      { key: "porte_garage", label: "Porte de garage", prixMin: 1200, prixMax: 3500, unite: "unité", tempsMinH: 4, tempsMaxH: 8, description: "Porte garage sectionnelle, basculante" },
      { key: "veranda", label: "Véranda / extension vitrée", prixMin: 800, prixMax: 2000, unite: "m²", tempsMinH: 3, tempsMaxH: 6, description: "Véranda aluminium ou bois" },
    ],
  },
  {
    key: "plomberie",
    label: "Plomberie",
    sousTypes: [
      { key: "salle_eau_complete", label: "Salle d'eau complète", prixMin: 4500, prixMax: 12000, unite: "forfait", tempsMinH: 40, tempsMaxH: 80, description: "Création salle d'eau clé en main" },
      { key: "salle_bain_renovation", label: "Salle de bain rénovation", prixMin: 6000, prixMax: 15000, unite: "forfait", tempsMinH: 50, tempsMaxH: 100, description: "Rénovation complète salle de bain" },
      { key: "wc_pose", label: "WC pose / remplacement", prixMin: 300, prixMax: 800, unite: "unité", tempsMinH: 2, tempsMaxH: 4, description: "Pose WC suspendu ou classique" },
      { key: "douche_italienne", label: "Douche à l'italienne", prixMin: 2500, prixMax: 6000, unite: "forfait", tempsMinH: 16, tempsMaxH: 32, description: "Création douche à l'italienne" },
      { key: "baignoire", label: "Baignoire pose", prixMin: 800, prixMax: 2500, unite: "unité", tempsMinH: 6, tempsMaxH: 12, description: "Pose baignoire, robinetterie incluse" },
      { key: "chauffe_eau", label: "Chauffe-eau / ballon", prixMin: 800, prixMax: 2500, unite: "unité", tempsMinH: 4, tempsMaxH: 8, description: "Remplacement chauffe-eau électrique ou thermodynamique" },
      { key: "alimentation_eau", label: "Alimentation eau / évacuation", prixMin: 80, prixMax: 200, unite: "ml", tempsMinH: 0.5, tempsMaxH: 1.5, description: "Création ou modification réseaux" },
    ],
  },
  {
    key: "electricite",
    label: "Électricité",
    sousTypes: [
      { key: "tableau_electrique", label: "Tableau électrique", prixMin: 800, prixMax: 2500, unite: "unité", tempsMinH: 8, tempsMaxH: 16, description: "Remplacement tableau, mise aux normes" },
      { key: "prise_interrupteur", label: "Prise / interrupteur", prixMin: 60, prixMax: 150, unite: "unité", tempsMinH: 0.5, tempsMaxH: 1.5, description: "Création ou remplacement point électrique" },
      { key: "eclairage_interieur", label: "Éclairage intérieur", prixMin: 80, prixMax: 250, unite: "unité", tempsMinH: 1, tempsMaxH: 2.5, description: "Pose luminaire, spot encastré" },
      { key: "mise_aux_normes", label: "Mise aux normes complète", prixMin: 60, prixMax: 130, unite: "m²", tempsMinH: 0.5, tempsMaxH: 1, description: "Rénovation électrique complète au m²" },
      { key: "domotique", label: "Domotique / automatismes", prixMin: 200, prixMax: 600, unite: "unité", tempsMinH: 2, tempsMaxH: 5, description: "Installation domotique, volets connectés" },
    ],
  },
  {
    key: "chauffage",
    label: "Chauffage / Climatisation",
    sousTypes: [
      { key: "pac_air_eau", label: "Pompe à chaleur air/eau", prixMin: 10000, prixMax: 18000, unite: "forfait", tempsMinH: 24, tempsMaxH: 48, description: "PAC air/eau avec installation" },
      { key: "pac_air_air", label: "Pompe à chaleur air/air", prixMin: 3000, prixMax: 8000, unite: "forfait", tempsMinH: 8, tempsMaxH: 16, description: "Climatisation réversible monosplit ou multisplit" },
      { key: "chaudiere_gaz", label: "Chaudière gaz", prixMin: 3500, prixMax: 7000, unite: "forfait", tempsMinH: 8, tempsMaxH: 16, description: "Chaudière gaz condensation" },
      { key: "chaudiere_fioul", label: "Remplacement chaudière fioul", prixMin: 4000, prixMax: 8000, unite: "forfait", tempsMinH: 12, tempsMaxH: 24, description: "Remplacement chaudière fioul" },
      { key: "radiateur", label: "Radiateur", prixMin: 300, prixMax: 1000, unite: "unité", tempsMinH: 2, tempsMaxH: 4, description: "Pose radiateur eau chaude ou électrique" },
      { key: "plancher_chauffant", label: "Plancher chauffant", prixMin: 50, prixMax: 120, unite: "m²", tempsMinH: 0.3, tempsMaxH: 0.6, description: "Plancher chauffant eau ou électrique" },
      { key: "poele_bois", label: "Poêle à bois / granulés", prixMin: 3000, prixMax: 7000, unite: "forfait", tempsMinH: 8, tempsMaxH: 16, description: "Poêle avec conduit fumée" },
    ],
  },
  {
    key: "isolation",
    label: "Isolation",
    sousTypes: [
      { key: "isolation_combles", label: "Isolation combles perdus", prixMin: 20, prixMax: 50, unite: "m²", tempsMinH: 0.1, tempsMaxH: 0.25, description: "Isolation soufflée ou en rouleaux" },
      { key: "isolation_rampants", label: "Isolation rampants / toiture", prixMin: 40, prixMax: 90, unite: "m²", tempsMinH: 0.3, tempsMaxH: 0.6, description: "Isolation sous toiture" },
      { key: "isolation_murs_interieur", label: "Isolation murs par l'intérieur", prixMin: 30, prixMax: 80, unite: "m²", tempsMinH: 0.4, tempsMaxH: 0.8, description: "Doublage isolant + placo" },
      { key: "isolation_murs_exterieur", label: "Isolation murs par l'extérieur (ITE)", prixMin: 100, prixMax: 200, unite: "m²", tempsMinH: 0.8, tempsMaxH: 1.5, description: "ITE avec enduit ou bardage" },
      { key: "isolation_plancher", label: "Isolation plancher bas", prixMin: 25, prixMax: 60, unite: "m²", tempsMinH: 0.2, tempsMaxH: 0.4, description: "Isolation vide sanitaire ou dalle" },
    ],
  },
  {
    key: "toiture",
    label: "Toiture",
    sousTypes: [
      { key: "couverture_tuiles", label: "Couverture tuiles", prixMin: 90, prixMax: 180, unite: "m²", tempsMinH: 0.8, tempsMaxH: 1.5, description: "Réfection couverture tuiles terre cuite ou béton" },
      { key: "couverture_ardoise", label: "Couverture ardoise", prixMin: 140, prixMax: 280, unite: "m²", tempsMinH: 1, tempsMaxH: 2, description: "Couverture ardoise naturelle ou synthétique" },
      { key: "couverture_zinc", label: "Couverture zinc / bac acier", prixMin: 80, prixMax: 160, unite: "m²", tempsMinH: 0.6, tempsMaxH: 1.2, description: "Toiture zinc ou bac acier" },
      { key: "charpente", label: "Charpente rénovation", prixMin: 60, prixMax: 150, unite: "m²", tempsMinH: 0.5, tempsMaxH: 1, description: "Réparation ou renforcement charpente" },
      { key: "zinguerie", label: "Zinguerie (gouttières, descentes)", prixMin: 30, prixMax: 80, unite: "ml", tempsMinH: 0.3, tempsMaxH: 0.6, description: "Gouttières, chéneaux, descentes EP" },
      { key: "velux", label: "Fenêtre de toit / Velux", prixMin: 600, prixMax: 1500, unite: "unité", tempsMinH: 4, tempsMaxH: 8, description: "Pose fenêtre de toit avec raccord" },
    ],
  },
  {
    key: "facade",
    label: "Façade",
    sousTypes: [
      { key: "ravalement_peinture", label: "Ravalement peinture", prixMin: 30, prixMax: 70, unite: "m²", tempsMinH: 0.2, tempsMaxH: 0.5, description: "Nettoyage + peinture façade" },
      { key: "ravalement_enduit", label: "Ravalement enduit", prixMin: 50, prixMax: 120, unite: "m²", tempsMinH: 0.4, tempsMaxH: 0.8, description: "Enduit monocouche ou traditionnel" },
      { key: "bardage", label: "Bardage", prixMin: 80, prixMax: 180, unite: "m²", tempsMinH: 0.6, tempsMaxH: 1.2, description: "Bardage bois, composite ou PVC" },
      { key: "nettoyage_facade", label: "Nettoyage / démoussage", prixMin: 15, prixMax: 40, unite: "m²", tempsMinH: 0.1, tempsMaxH: 0.25, description: "Nettoyage haute pression, traitement" },
    ],
  },
  {
    key: "cuisine",
    label: "Cuisine",
    sousTypes: [
      { key: "cuisine_complete", label: "Cuisine complète posée", prixMin: 5000, prixMax: 15000, unite: "forfait", tempsMinH: 24, tempsMaxH: 56, description: "Meubles + électroménager + pose" },
      { key: "cuisine_meubles_pose", label: "Pose meubles cuisine seule", prixMin: 2000, prixMax: 5000, unite: "forfait", tempsMinH: 16, tempsMaxH: 32, description: "Pose meubles bas et hauts" },
      { key: "plan_travail", label: "Plan de travail", prixMin: 150, prixMax: 500, unite: "ml", tempsMinH: 1, tempsMaxH: 2, description: "Stratifié, bois massif, quartz" },
      { key: "credence", label: "Crédence", prixMin: 50, prixMax: 150, unite: "ml", tempsMinH: 0.5, tempsMaxH: 1, description: "Crédence carrelée ou verre" },
    ],
  },
  {
    key: "piscine",
    label: "Piscine",
    sousTypes: [
      { key: "piscine_coque", label: "Piscine coque polyester", prixMin: 15000, prixMax: 35000, unite: "forfait", tempsMinH: 80, tempsMaxH: 160, description: "Piscine coque livrée posée" },
      { key: "piscine_beton", label: "Piscine béton / maçonnée", prixMin: 25000, prixMax: 60000, unite: "forfait", tempsMinH: 160, tempsMaxH: 320, description: "Piscine béton traditionnelle" },
      { key: "liner", label: "Liner", prixMin: 30, prixMax: 70, unite: "m²", tempsMinH: 0.2, tempsMaxH: 0.4, description: "Remplacement liner piscine" },
      { key: "pompe_filtration", label: "Pompe / filtration", prixMin: 500, prixMax: 2000, unite: "unité", tempsMinH: 4, tempsMaxH: 8, description: "Système de filtration complet" },
      { key: "local_technique", label: "Local technique", prixMin: 2500, prixMax: 6000, unite: "forfait", tempsMinH: 16, tempsMaxH: 32, description: "Aménagement local technique piscine" },
      { key: "plage_piscine", label: "Plage de piscine", prixMin: 60, prixMax: 150, unite: "m²", tempsMinH: 0.6, tempsMaxH: 1.2, description: "Margelles, dallage, bois" },
    ],
  },
  {
    key: "maconnerie",
    label: "Maçonnerie / Gros œuvre",
    sousTypes: [
      { key: "mur_parpaing", label: "Mur parpaing / agglo", prixMin: 80, prixMax: 180, unite: "m²", tempsMinH: 1, tempsMaxH: 2, description: "Montage mur parpaing 20cm" },
      { key: "mur_brique", label: "Mur brique", prixMin: 100, prixMax: 220, unite: "m²", tempsMinH: 1.2, tempsMaxH: 2.5, description: "Mur brique traditionnelle ou monomur" },
      { key: "dalle_beton", label: "Dalle béton", prixMin: 60, prixMax: 120, unite: "m²", tempsMinH: 0.6, tempsMaxH: 1.2, description: "Coulage dalle armée" },
      { key: "demolition", label: "Démolition", prixMin: 30, prixMax: 80, unite: "m²", tempsMinH: 0.3, tempsMaxH: 0.8, description: "Démolition mur, cloison" },
      { key: "ouverture_mur", label: "Ouverture dans mur porteur", prixMin: 1500, prixMax: 4000, unite: "forfait", tempsMinH: 8, tempsMaxH: 16, description: "Création ouverture + IPN" },
      { key: "fondations", label: "Fondations", prixMin: 150, prixMax: 350, unite: "ml", tempsMinH: 1.5, tempsMaxH: 3, description: "Semelles filantes ou plots" },
    ],
  },
  {
    key: "diagnostic",
    label: "Diagnostics immobiliers",
    sousTypes: [
      { key: "dpe", label: "DPE (Diagnostic Performance Énergétique)", prixMin: 100, prixMax: 200, unite: "unité", tempsMinH: 1.5, tempsMaxH: 3, description: "Diagnostic obligatoire vente/location" },
      { key: "amiante", label: "Diagnostic amiante", prixMin: 80, prixMax: 200, unite: "unité", tempsMinH: 1, tempsMaxH: 2.5, description: "Repérage amiante" },
      { key: "plomb", label: "Diagnostic plomb (CREP)", prixMin: 100, prixMax: 250, unite: "unité", tempsMinH: 1.5, tempsMaxH: 3, description: "Constat risque exposition plomb" },
      { key: "electricite_diag", label: "Diagnostic électricité", prixMin: 80, prixMax: 150, unite: "unité", tempsMinH: 1, tempsMaxH: 2, description: "État installation électrique" },
      { key: "gaz_diag", label: "Diagnostic gaz", prixMin: 80, prixMax: 150, unite: "unité", tempsMinH: 1, tempsMaxH: 2, description: "État installation gaz" },
      { key: "termites", label: "Diagnostic termites", prixMin: 80, prixMax: 180, unite: "unité", tempsMinH: 1, tempsMaxH: 2, description: "État parasitaire" },
      { key: "pack_complet", label: "Pack diagnostics complet", prixMin: 300, prixMax: 600, unite: "forfait", tempsMinH: 3, tempsMaxH: 6, description: "Tous diagnostics obligatoires vente" },
    ],
  },
  {
    key: "autres",
    label: "Autre / Hors catégorie",
    sousTypes: [],
  },
];

// =======================
// HELPERS
// =======================

/**
 * Trouve une catégorie par sa clé
 */
export const getCategorieByKey = (key: string): Categorie | undefined => {
  return CATEGORIES_TRAVAUX.find(cat => cat.key === key);
};

/**
 * Trouve un sous-type par sa clé (recherche dans toutes les catégories)
 */
export const getSousTypeByKey = (key: string): { categorie: Categorie; sousType: SousType } | undefined => {
  for (const cat of CATEGORIES_TRAVAUX) {
    const sousType = cat.sousTypes.find(st => st.key === key);
    if (sousType) {
      return { categorie: cat, sousType };
    }
  }
  return undefined;
};

/**
 * Extrait la catégorie et le sous-type depuis une valeur combinée (format: "categorie:soustype")
 */
export const parseWorkTypeValue = (value: string): { categorieKey: string; sousTypeKey: string } | null => {
  if (!value || !value.includes(':')) return null;
  const [categorieKey, sousTypeKey] = value.split(':');
  return { categorieKey, sousTypeKey };
};

/**
 * Crée une valeur combinée à partir d'une catégorie et un sous-type
 */
export const createWorkTypeValue = (categorieKey: string, sousTypeKey: string): string => {
  return `${categorieKey}:${sousTypeKey}`;
};

/**
 * Vérifie si un type de travaux est "hors catégorie"
 */
export const isHorsCategorie = (workType: string | null | undefined): boolean => {
  if (!workType) return true;
  if (workType === 'autres' || workType === 'autre') return true;
  if (workType.startsWith('autres:')) return true;
  return false;
};

/**
 * Obtient les infos complètes d'un sous-type pour l'affichage de la jauge
 */
export const getSousTypeInfo = (workType: string | null | undefined): SousType | null => {
  if (!workType) return null;
  
  const parsed = parseWorkTypeValue(workType);
  if (!parsed) return null;
  
  const result = getSousTypeByKey(parsed.sousTypeKey);
  if (!result) return null;
  
  return result.sousType;
};

/**
 * Applique le coefficient géographique
 */
export const getZoneCoefficient = (zoneType?: string): number => {
  switch (zoneType) {
    case "grande_ville": return 1.20;
    case "ville_moyenne": return 1.00;
    case "province": return 0.90;
    default: return 1.00;
  }
};

/**
 * Calcule les fourchettes ajustées pour un sous-type
 */
export const calculateAdjustedPriceRange = (
  sousType: SousType,
  quantity: number,
  zoneType?: string
): { min: number; max: number } => {
  const coef = getZoneCoefficient(zoneType);
  
  if (sousType.unite === 'forfait') {
    return {
      min: Math.round(sousType.prixMin * coef),
      max: Math.round(sousType.prixMax * coef),
    };
  }
  
  return {
    min: Math.round(sousType.prixMin * quantity * coef),
    max: Math.round(sousType.prixMax * quantity * coef),
  };
};

/**
 * Calcule le temps de main-d'œuvre estimé pour un sous-type
 */
export const calculateLaborTime = (
  sousType: SousType,
  quantity: number
): { min: number; max: number } => {
  if (sousType.unite === 'forfait') {
    return {
      min: sousType.tempsMinH,
      max: sousType.tempsMaxH,
    };
  }
  
  return {
    min: Math.round(sousType.tempsMinH * quantity),
    max: Math.round(sousType.tempsMaxH * quantity),
  };
};

/**
 * Calcule la position du devis dans la fourchette (en pourcentage)
 */
export const calculatePricePosition = (
  price: number,
  fourchette: { min: number; max: number }
): number => {
  const range = fourchette.max - fourchette.min;
  if (range <= 0) return 50;
  
  const position = ((price - fourchette.min) / range) * 100;
  return position;
};
