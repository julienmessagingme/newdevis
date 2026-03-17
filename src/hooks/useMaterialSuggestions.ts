import { useMemo } from 'react';
import type { ChantierIAResult, TypeProjet } from '@/types/chantier-ia';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MaterialFeature {
  text: string;
  positive: boolean;
}

export interface MaterialCard {
  id: string;
  name: string;
  /** URL Unsplash publique */
  image: string;
  priceRange: string;
  features: MaterialFeature[];
  duration: string;
  maintenanceBadge: string;
  maintenanceBadgeVariant: 'green' | 'amber' | 'red';
}

// ── Catalogues par type de travaux ────────────────────────────────────────────

const REVETEMENT_CARDS: MaterialCard[] = [
  {
    id: 'gravier',
    name: 'Gravier',
    image: 'https://images.unsplash.com/photo-1723175315614-8b85be78d929?auto=format&fit=crop&w=600&q=80',
    priceRange: '15 – 40 €/m²',
    features: [
      { text: 'Économique, drainage naturel', positive: true },
      { text: 'Déplacement fréquent', positive: false },
    ],
    duration: '5-10 ans',
    maintenanceBadge: 'Entretien élevé',
    maintenanceBadgeVariant: 'red',
  },
  {
    id: 'paves',
    name: 'Pavés',
    image: 'https://images.unsplash.com/photo-1762178949884-e289353b2d6d?auto=format&fit=crop&w=600&q=80',
    priceRange: '50 – 130 €/m²',
    features: [
      { text: 'Très durable, esthétique', positive: true },
      { text: 'Coût et pose élevés', positive: false },
    ],
    duration: '30+ ans',
    maintenanceBadge: 'Entretien faible',
    maintenanceBadgeVariant: 'green',
  },
  {
    id: 'beton_drainant',
    name: 'Béton drainant',
    image: 'https://images.unsplash.com/photo-1591188185682-41f5c74781f6?auto=format&fit=crop&w=600&q=80',
    priceRange: '40 – 80 €/m²',
    features: [
      { text: 'Solide, drainage intégré', positive: true },
      { text: 'Aspect uniforme', positive: false },
    ],
    duration: '20-25 ans',
    maintenanceBadge: 'Entretien faible',
    maintenanceBadgeVariant: 'green',
  },
  {
    id: 'enrobe',
    name: 'Enrobé',
    image: 'https://images.unsplash.com/photo-1560961821-134d5ca48da4?auto=format&fit=crop&w=600&q=80',
    priceRange: '50 – 100 €/m²',
    features: [
      { text: 'Lisse, résistant', positive: true },
      { text: 'Chaud en été', positive: false },
    ],
    duration: '15-20 ans',
    maintenanceBadge: 'Entretien faible',
    maintenanceBadgeVariant: 'green',
  },
];

const TERRASSE_CARDS: MaterialCard[] = [
  {
    id: 'bois',
    name: 'Bois exotique',
    image: 'https://images.unsplash.com/photo-1588854337236-6889d631faa8?auto=format&fit=crop&w=600&q=80',
    priceRange: '60 – 120 €/m²',
    features: [
      { text: 'Chaleureux, naturel', positive: true },
      { text: 'Lasure annuelle requise', positive: false },
    ],
    duration: '15-20 ans',
    maintenanceBadge: 'Entretien élevé',
    maintenanceBadgeVariant: 'red',
  },
  {
    id: 'composite',
    name: 'Composite',
    image: 'https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=600&q=80',
    priceRange: '80 – 160 €/m²',
    features: [
      { text: 'Zéro entretien, imputrescible', positive: true },
      { text: "Prix d'achat plus élevé", positive: false },
    ],
    duration: '25+ ans',
    maintenanceBadge: 'Entretien faible',
    maintenanceBadgeVariant: 'green',
  },
  {
    id: 'carrelage',
    name: 'Carrelage',
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=600&q=80',
    priceRange: '50 – 110 €/m²',
    features: [
      { text: 'Classique, résistant', positive: true },
      { text: 'Glissant mouillé si mal choisi', positive: false },
    ],
    duration: '30+ ans',
    maintenanceBadge: 'Entretien faible',
    maintenanceBadgeVariant: 'green',
  },
  {
    id: 'beton_cire',
    name: 'Béton ciré',
    image: 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?auto=format&fit=crop&w=600&q=80',
    priceRange: '40 – 90 €/m²',
    features: [
      { text: 'Moderne, uni', positive: true },
      { text: 'Sensible aux chocs sans protection', positive: false },
    ],
    duration: '10-15 ans',
    maintenanceBadge: 'Entretien modéré',
    maintenanceBadgeVariant: 'amber',
  },
];

const FACADE_CARDS: MaterialCard[] = [
  {
    id: 'enduit',
    name: 'Enduit',
    image: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?auto=format&fit=crop&w=600&q=80',
    priceRange: '40 – 80 €/m²',
    features: [
      { text: 'Solution classique, polyvalente', positive: true },
      { text: 'Peut se fissurer si le support bouge', positive: false },
    ],
    duration: '20+ ans',
    maintenanceBadge: 'Entretien modéré',
    maintenanceBadgeVariant: 'amber',
  },
  {
    id: 'bardage_bois',
    name: 'Bardage bois',
    image: 'https://images.unsplash.com/photo-1523413184730-e85dbbd04aba?auto=format&fit=crop&w=600&q=80',
    priceRange: '60 – 120 €/m²',
    features: [
      { text: 'Esthétique chaleureux', positive: true },
      { text: 'Traitement régulier requis', positive: false },
    ],
    duration: '15-25 ans',
    maintenanceBadge: 'Entretien élevé',
    maintenanceBadgeVariant: 'red',
  },
  {
    id: 'bardage_composite',
    name: 'Bardage composite',
    image: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=600&q=80',
    priceRange: '80 – 150 €/m²',
    features: [
      { text: 'Imputrescible, résistant UV', positive: true },
      { text: 'Coût initial plus élevé', positive: false },
    ],
    duration: '30+ ans',
    maintenanceBadge: 'Entretien faible',
    maintenanceBadgeVariant: 'green',
  },
  {
    id: 'crepi',
    name: 'Crépi',
    image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=600&q=80',
    priceRange: '30 – 60 €/m²',
    features: [
      { text: 'Économique, rapide à poser', positive: true },
      { text: 'Vieillissement moins homogène', positive: false },
    ],
    duration: '15-20 ans',
    maintenanceBadge: 'Entretien modéré',
    maintenanceBadgeVariant: 'amber',
  },
];

const ISOLATION_CARDS: MaterialCard[] = [
  {
    id: 'laine_roche',
    name: 'Laine de roche',
    image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=600&q=80',
    priceRange: '15 – 40 €/m²',
    features: [
      { text: 'Incombustible, très bon isolant', positive: true },
      { text: 'Pose délicate en insufflation', positive: false },
    ],
    duration: '50+ ans',
    maintenanceBadge: 'Sans entretien',
    maintenanceBadgeVariant: 'green',
  },
  {
    id: 'ouate',
    name: 'Ouate de cellulose',
    image: 'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?auto=format&fit=crop&w=600&q=80',
    priceRange: '20 – 45 €/m²',
    features: [
      { text: 'Écologique, bonne inertie', positive: true },
      { text: 'Sensible à l\'humidité si mal posé', positive: false },
    ],
    duration: '40+ ans',
    maintenanceBadge: 'Sans entretien',
    maintenanceBadgeVariant: 'green',
  },
  {
    id: 'polyurethane',
    name: 'Polyuréthane',
    image: 'https://images.unsplash.com/photo-1544985361-b420d7a77043?auto=format&fit=crop&w=600&q=80',
    priceRange: '30 – 70 €/m²',
    features: [
      { text: 'Meilleur lambda, faible épaisseur', positive: true },
      { text: 'Non recyclable', positive: false },
    ],
    duration: '50+ ans',
    maintenanceBadge: 'Sans entretien',
    maintenanceBadgeVariant: 'green',
  },
];

const SALLE_DE_BAIN_CARDS: MaterialCard[] = [
  {
    id: 'faience',
    name: 'Faïence murale',
    image: 'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?auto=format&fit=crop&w=600&q=80',
    priceRange: '25 – 80 €/m²',
    features: [
      { text: 'Imperméable, facile à nettoyer', positive: true },
      { text: 'Joints à entretenir', positive: false },
    ],
    duration: '20+ ans',
    maintenanceBadge: 'Entretien faible',
    maintenanceBadgeVariant: 'green',
  },
  {
    id: 'grand_format',
    name: 'Grand format (60×120)',
    image: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=600&q=80',
    priceRange: '40 – 120 €/m²',
    features: [
      { text: 'Peu de joints, moderne', positive: true },
      { text: 'Pose plus complexe', positive: false },
    ],
    duration: '30+ ans',
    maintenanceBadge: 'Entretien faible',
    maintenanceBadgeVariant: 'green',
  },
  {
    id: 'beton_cire_sdb',
    name: 'Béton ciré',
    image: 'https://images.unsplash.com/photo-1507652313519-d4e9174996dd?auto=format&fit=crop&w=600&q=80',
    priceRange: '80 – 150 €/m²',
    features: [
      { text: 'Aspect sur-mesure, sans joint', positive: true },
      { text: 'Traitement hydrofuge indispensable', positive: false },
    ],
    duration: '10-20 ans',
    maintenanceBadge: 'Entretien modéré',
    maintenanceBadgeVariant: 'amber',
  },
  {
    id: 'pierre_naturelle',
    name: 'Pierre naturelle',
    image: 'https://images.unsplash.com/photo-1614099099175-f6c0e7c5cbce?auto=format&fit=crop&w=600&q=80',
    priceRange: '80 – 300 €/m²',
    features: [
      { text: 'Luxueux, unique', positive: true },
      { text: 'Coûteux, nécessite imprégnation', positive: false },
    ],
    duration: '50+ ans',
    maintenanceBadge: 'Entretien modéré',
    maintenanceBadgeVariant: 'amber',
  },
];

const TOITURE_CARDS: MaterialCard[] = [
  {
    id: 'tuiles_terre_cuite',
    name: 'Tuiles terre cuite',
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=600&q=80',
    priceRange: '80 – 150 €/m²',
    features: [
      { text: 'Durabilité éprouvée, recyclable', positive: true },
      { text: 'Poids important', positive: false },
    ],
    duration: '50+ ans',
    maintenanceBadge: 'Entretien faible',
    maintenanceBadgeVariant: 'green',
  },
  {
    id: 'ardoise',
    name: 'Ardoise naturelle',
    image: 'https://images.unsplash.com/photo-1601758174493-e1d67e3d8b16?auto=format&fit=crop&w=600&q=80',
    priceRange: '120 – 220 €/m²',
    features: [
      { text: 'Esthétique, très durable', positive: true },
      { text: 'Pose et prix élevés', positive: false },
    ],
    duration: '80+ ans',
    maintenanceBadge: 'Entretien faible',
    maintenanceBadgeVariant: 'green',
  },
  {
    id: 'zinc',
    name: 'Bac acier / Zinc',
    image: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=600&q=80',
    priceRange: '60 – 130 €/m²',
    features: [
      { text: 'Léger, pente faible possible', positive: true },
      { text: 'Moins esthétique sur maisons traditionnelles', positive: false },
    ],
    duration: '30-40 ans',
    maintenanceBadge: 'Entretien faible',
    maintenanceBadgeVariant: 'green',
  },
];

// ── Map typeProjet → catalogue ─────────────────────────────────────────────────

const TYPE_PROJET_MAP: Partial<Record<TypeProjet, MaterialCard[]>> = {
  terrasse: TERRASSE_CARDS,
  toiture:  TOITURE_CARDS,
  isolation: ISOLATION_CARDS,
  salle_de_bain: SALLE_DE_BAIN_CARDS,
};

// Mots-clés dans les lots/description/prochaineAction → catalogue
const KEYWORD_MAP: Array<{ keywords: string[]; cards: MaterialCard[] }> = [
  { keywords: ['gravier', 'pavé', 'enrobé', 'allée', 'revêtement', 'revetement', 'parking', 'béton drainant', 'beton drainant'], cards: REVETEMENT_CARDS },
  { keywords: ['terrasse', 'deck', 'lame de bois', 'lame composite'], cards: TERRASSE_CARDS },
  { keywords: ['façade', 'facade', 'bardage', 'crépi', 'crepi', 'enduit'], cards: FACADE_CARDS },
  { keywords: ['isolation', 'isolant', 'laine', 'ouate', 'polyuréthane'], cards: ISOLATION_CARDS },
  { keywords: ['salle de bain', 'faïence', 'faience', 'carrelage mural', 'douche', 'baignoire'], cards: SALLE_DE_BAIN_CARDS },
  { keywords: ['toiture', 'toit', 'tuile', 'ardoise', 'couverture', 'charpente'], cards: TOITURE_CARDS },
];

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface UseMaterialSuggestionsReturn {
  cards: MaterialCard[];
  /** Label court décrivant le type de matériaux détecté, ex: "Revêtements de sol" */
  categoryLabel: string;
  /** true si au moins une catégorie a été détectée */
  hasMatch: boolean;
}

/**
 * Dérive dynamiquement le catalogue de matériaux adapté au chantier,
 * sans appel API. Priorité :
 * 1. typeProjet (ex: 'terrasse' → TERRASSE_CARDS)
 * 2. Mots-clés dans les lots
 * 3. Mots-clés dans prochaineAction.titre / prochaineAction.detail
 * 4. Mots-clés dans la description
 */
export function useMaterialSuggestions(chantier: ChantierIAResult): UseMaterialSuggestionsReturn {
  return useMemo(() => {
    // 1. typeProjet direct
    const byType = TYPE_PROJET_MAP[chantier.typeProjet];
    if (byType) {
      return {
        cards: byType,
        categoryLabel: getLabelForType(chantier.typeProjet),
        hasMatch: true,
      };
    }

    // 2. Haystack
    const lotNames = (chantier.lots ?? []).map((l) => l.nom).join(' ');
    const haystack = [
      lotNames,
      chantier.prochaineAction?.titre ?? '',
      chantier.prochaineAction?.detail ?? '',
      chantier.nom,
      chantier.description,
    ].join(' ').toLowerCase();

    for (const { keywords, cards } of KEYWORD_MAP) {
      if (keywords.some((kw) => haystack.includes(kw))) {
        return {
          cards,
          categoryLabel: getLabelForCards(cards),
          hasMatch: true,
        };
      }
    }

    // 3. Fallback : aucun match
    return { cards: [], categoryLabel: '', hasMatch: false };
  }, [chantier]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getLabelForType(type: TypeProjet): string {
  const labels: Partial<Record<TypeProjet, string>> = {
    terrasse:      'Revêtements de terrasse',
    toiture:       'Matériaux de couverture',
    isolation:     'Solutions d\'isolation',
    salle_de_bain: 'Revêtements salle de bain',
  };
  return labels[type] ?? 'Matériaux';
}

function getLabelForCards(cards: MaterialCard[]): string {
  if (cards === REVETEMENT_CARDS)   return 'Revêtements de sol extérieur';
  if (cards === TERRASSE_CARDS)     return 'Revêtements de terrasse';
  if (cards === FACADE_CARDS)       return 'Matériaux de façade';
  if (cards === ISOLATION_CARDS)    return 'Solutions d\'isolation';
  if (cards === SALLE_DE_BAIN_CARDS) return 'Revêtements salle de bain';
  if (cards === TOITURE_CARDS)      return 'Matériaux de couverture';
  return 'Matériaux';
}
