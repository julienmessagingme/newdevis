// ── MATERIALS_MAP.ts ─────────────────────────────────────────────────────────
// Catalogue statique de matériaux par type de chantier.
// 17 types × 3 options minimum + 1 option "Autre" auto-ajoutée.
// Images : URLs statiques Unsplash/Pexels uniquement — pas de fetch dynamique.

import type { TypeProjet } from '@/types/chantier-ia';

export interface MaterialOption {
  id: string;
  label: string;
  emoji: string;
  image: string;                   // URL statique uniquement
  priceMin: number;                // € HT / m² ou unité
  priceMax: number;
  priceUnit: string;               // 'm²' | 'unité' | 'ml' | 'forfait'
  durabilite: number;              // 1–5
  entretien: number;               // 1–5 (5 = très peu d'entretien)
  description: string;
  maintenanceBadge: string;
  maintenanceBadgeVariant: 'green' | 'amber' | 'red';
  /** Si true, affiche badge "Sur devis" bleu + bouton "Obtenir des devis" */
  isOther?: boolean;
}

export interface ChantierType {
  id: string;
  label: string;
  /** Mots-clés pour la détection automatique */
  keywords: string[];
  options: MaterialOption[];
}

// ── Constante "Autre" réutilisable ────────────────────────────────────────────
const AUTRE_OPTION: MaterialOption = {
  id: 'autre',
  label: 'Autre / Je ne sais pas',
  emoji: '🤔',
  image: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400&q=80',
  priceMin: 0,
  priceMax: 0,
  priceUnit: 'm²',
  durabilite: 0,
  entretien: 0,
  description: 'Vous n\'êtes pas sûr du matériau ? Obtenez des devis comparatifs d\'artisans locaux.',
  maintenanceBadge: 'Sur devis',
  maintenanceBadgeVariant: 'green',
  isOther: true,
};

// ── Catalogue principal ───────────────────────────────────────────────────────

const RAW_MAP: Array<Omit<ChantierType, 'options'> & { options: MaterialOption[] }> = [

  // 1. Carrelage sol
  {
    id: 'carrelage_sol',
    label: 'Carrelage sol',
    keywords: ['carrelage', 'carrelé', 'faïence sol', 'grès cérame', 'dalle céramique'],
    options: [
      {
        id: 'gres_cerame',
        label: 'Grès cérame',
        emoji: '🟫',
        image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80',
        priceMin: 25,
        priceMax: 80,
        priceUnit: 'm²',
        durabilite: 5,
        entretien: 5,
        description: 'Très résistant, faible porosité. Idéal pour les pièces humides et le passage intensif.',
        maintenanceBadge: 'Entretien facile',
        maintenanceBadgeVariant: 'green',
      },
      {
        id: 'carrelage_imitation_parquet',
        label: 'Imitation parquet',
        emoji: '🪵',
        image: 'https://images.unsplash.com/photo-1600607686527-6fb886090705?w=400&q=80',
        priceMin: 30,
        priceMax: 90,
        priceUnit: 'm²',
        durabilite: 5,
        entretien: 5,
        description: 'Aspect bois avec la robustesse du carrelage. Très tendance, facile à nettoyer.',
        maintenanceBadge: 'Entretien facile',
        maintenanceBadgeVariant: 'green',
      },
      {
        id: 'marbre_pierre',
        label: 'Marbre / Pierre naturelle',
        emoji: '🏛️',
        image: 'https://images.unsplash.com/photo-1615873968403-89e068629265?w=400&q=80',
        priceMin: 60,
        priceMax: 200,
        priceUnit: 'm²',
        durabilite: 5,
        entretien: 2,
        description: 'Prestige absolu, chaque dalle unique. Demande un entretien régulier et un traitement hydrofuge.',
        maintenanceBadge: 'Entretien régulier',
        maintenanceBadgeVariant: 'red',
      },
    ],
  },

  // 2. Parquet
  {
    id: 'parquet',
    label: 'Parquet',
    keywords: ['parquet', 'plancher bois', 'lame parquet', 'stratifié', 'vinyle', 'lame pvc', 'lvt'],
    options: [
      {
        id: 'parquet_massif',
        label: 'Parquet massif',
        emoji: '🪵',
        image: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=400&q=80',
        priceMin: 50,
        priceMax: 150,
        priceUnit: 'm²',
        durabilite: 5,
        entretien: 3,
        description: 'Peut être rénové plusieurs fois par ponçage. Valorise le bien immobilier.',
        maintenanceBadge: 'Ponçage tous les 10 ans',
        maintenanceBadgeVariant: 'amber',
      },
      {
        id: 'parquet_contrecolle',
        label: 'Parquet contrecollé',
        emoji: '🏠',
        image: 'https://images.unsplash.com/photo-1562663474-6cbb3eaa4d14?w=400&q=80',
        priceMin: 30,
        priceMax: 90,
        priceUnit: 'm²',
        durabilite: 4,
        entretien: 4,
        description: 'Pose flottante possible, compatible chauffage au sol. Bon rapport qualité/prix.',
        maintenanceBadge: 'Entretien modéré',
        maintenanceBadgeVariant: 'amber',
      },
      {
        id: 'lame_pvc_lvt',
        label: 'Lame PVC / LVT',
        emoji: '💧',
        image: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&q=80',
        priceMin: 15,
        priceMax: 50,
        priceUnit: 'm²',
        durabilite: 3,
        entretien: 5,
        description: '100% étanche, pose rapide. Parfait pour cuisine et salle d\'eau. Rendu bois réaliste.',
        maintenanceBadge: 'Entretien facile',
        maintenanceBadgeVariant: 'green',
      },
    ],
  },

  // 3. Peinture
  {
    id: 'peinture',
    label: 'Peinture murale',
    keywords: ['peinture', 'peindre', 'enduit', 'badigeon', 'mur blanc', 'couleur mur'],
    options: [
      {
        id: 'peinture_acrylique',
        label: 'Peinture acrylique',
        emoji: '🎨',
        image: 'https://images.unsplash.com/photo-1562259929-b4e1fd3aef09?w=400&q=80',
        priceMin: 5,
        priceMax: 20,
        priceUnit: 'm²',
        durabilite: 3,
        entretien: 4,
        description: 'Séchage rapide, lessivable, large choix de teintes. La référence pour l\'intérieur.',
        maintenanceBadge: 'Retouche facile',
        maintenanceBadgeVariant: 'green',
      },
      {
        id: 'peinture_velours',
        label: 'Peinture velouté / mat',
        emoji: '🖌️',
        image: 'https://images.unsplash.com/photo-1571115764595-644a1f56a55c?w=400&q=80',
        priceMin: 8,
        priceMax: 30,
        priceUnit: 'm²',
        durabilite: 3,
        entretien: 3,
        description: 'Aspect haut de gamme, masque les imperfections. Moins lessivable que le satiné.',
        maintenanceBadge: 'Entretien délicat',
        maintenanceBadgeVariant: 'amber',
      },
      {
        id: 'enduit_beton_cire',
        label: 'Béton ciré / Enduit décoratif',
        emoji: '🏗️',
        image: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400&q=80',
        priceMin: 40,
        priceMax: 120,
        priceUnit: 'm²',
        durabilite: 4,
        entretien: 3,
        description: 'Effet industriel très tendance. Application professionnelle recommandée.',
        maintenanceBadge: 'Traitement annuel',
        maintenanceBadgeVariant: 'amber',
      },
    ],
  },

  // 4. Salle de bain
  {
    id: 'salle_de_bain',
    label: 'Salle de bain',
    keywords: ['salle de bain', 'sdb', 'douche', 'baignoire', 'vasque', 'robinetterie', 'sanitaire'],
    options: [
      {
        id: 'sdb_accessible',
        label: 'Fonctionnel & accessible',
        emoji: '🚿',
        image: 'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=400&q=80',
        priceMin: 3000,
        priceMax: 8000,
        priceUnit: 'forfait',
        durabilite: 4,
        entretien: 5,
        description: 'Bac à douche standard, meubles vasque pratiques, carrelage uni. Fiable et économique.',
        maintenanceBadge: 'Entretien facile',
        maintenanceBadgeVariant: 'green',
      },
      {
        id: 'sdb_design',
        label: 'Design & tendance',
        emoji: '🛁',
        image: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=400&q=80',
        priceMin: 8000,
        priceMax: 20000,
        priceUnit: 'forfait',
        durabilite: 4,
        entretien: 3,
        description: 'Douche à l\'italienne, double vasque, robinetterie design. Valorise le bien.',
        maintenanceBadge: 'Entretien modéré',
        maintenanceBadgeVariant: 'amber',
      },
      {
        id: 'sdb_luxe',
        label: 'Premium & spa',
        emoji: '✨',
        image: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=400&q=80',
        priceMin: 20000,
        priceMax: 50000,
        priceUnit: 'forfait',
        durabilite: 5,
        entretien: 3,
        description: 'Marbre, baignoire îlot, douche hammam, domotique. Standing haut de gamme.',
        maintenanceBadge: 'Entretien régulier',
        maintenanceBadgeVariant: 'red',
      },
    ],
  },

  // 5. Cuisine
  {
    id: 'cuisine',
    label: 'Cuisine',
    keywords: ['cuisine', 'plan de travail', 'crédence', 'meuble cuisine', 'ilot', 'électroménager'],
    options: [
      {
        id: 'cuisine_kit',
        label: 'Cuisine en kit',
        emoji: '🍳',
        image: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&q=80',
        priceMin: 2000,
        priceMax: 6000,
        priceUnit: 'forfait',
        durabilite: 3,
        entretien: 4,
        description: 'Ikea, Leroy Merlin, etc. Montage rapide, large choix de finitions, prix accessible.',
        maintenanceBadge: 'Entretien facile',
        maintenanceBadgeVariant: 'green',
      },
      {
        id: 'cuisine_semi_sur_mesure',
        label: 'Semi-sur-mesure',
        emoji: '🏡',
        image: 'https://images.unsplash.com/photo-1565538810643-b5bdb714032a?w=400&q=80',
        priceMin: 8000,
        priceMax: 20000,
        priceUnit: 'forfait',
        durabilite: 4,
        entretien: 4,
        description: 'Cuisiniste (Schmidt, Mobalpa…). Meilleure intégration, garantie poseur, électros inclus.',
        maintenanceBadge: 'Qualité garantie',
        maintenanceBadgeVariant: 'green',
      },
      {
        id: 'cuisine_sur_mesure',
        label: 'Sur-mesure haut de gamme',
        emoji: '⭐',
        image: 'https://images.unsplash.com/photo-1556909172-54557c7e4fb7?w=400&q=80',
        priceMin: 20000,
        priceMax: 60000,
        priceUnit: 'forfait',
        durabilite: 5,
        entretien: 3,
        description: 'Ébéniste ou cuisiniste premium. Plans massifs, électros Miele/Gaggenau, organisation parfaite.',
        maintenanceBadge: 'Investissement durable',
        maintenanceBadgeVariant: 'amber',
      },
    ],
  },

  // 6. Terrasse
  {
    id: 'terrasse',
    label: 'Terrasse',
    keywords: ['terrasse', 'dalle terrasse', 'bois terrasse', 'composite terrasse', 'carrelage extérieur'],
    options: [
      {
        id: 'terrasse_composite',
        label: 'Bois composite',
        emoji: '🪵',
        image: 'https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=400&q=80',
        priceMin: 40,
        priceMax: 90,
        priceUnit: 'm²',
        durabilite: 5,
        entretien: 5,
        description: 'Aspect bois sans entretien. Imputrescible, résistant UV, longue durée de vie.',
        maintenanceBadge: 'Sans entretien',
        maintenanceBadgeVariant: 'green',
      },
      {
        id: 'terrasse_carrelee',
        label: 'Carrelage / Dalle béton',
        emoji: '🟦',
        image: 'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=400&q=80',
        priceMin: 30,
        priceMax: 80,
        priceUnit: 'm²',
        durabilite: 5,
        entretien: 4,
        description: 'Très durable, nettoyage au karcher. Large choix de formats. Nécessite joints de dilatation.',
        maintenanceBadge: 'Entretien facile',
        maintenanceBadgeVariant: 'green',
      },
      {
        id: 'terrasse_bois_naturel',
        label: 'Bois naturel (IPE, Pin)',
        emoji: '🌿',
        image: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&q=80',
        priceMin: 35,
        priceMax: 100,
        priceUnit: 'm²',
        durabilite: 4,
        entretien: 2,
        description: 'Aspect chaleureux naturel. Nécessite huilage annuel pour maintenir la couleur.',
        maintenanceBadge: 'Huilage annuel',
        maintenanceBadgeVariant: 'red',
      },
    ],
  },

  // 7. Isolation
  {
    id: 'isolation',
    label: 'Isolation thermique',
    keywords: ['isolation', 'isoler', 'ite', 'iti', 'comble', 'laine de verre', 'laine de roche', 'polystyrène', 'sarking'],
    options: [
      {
        id: 'laine_minerale',
        label: 'Laine minérale (verre/roche)',
        emoji: '🧱',
        image: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&q=80',
        priceMin: 20,
        priceMax: 60,
        priceUnit: 'm²',
        durabilite: 4,
        entretien: 5,
        description: 'Standard du marché. Bonne performance thermique et acoustique. Éligible aux aides.',
        maintenanceBadge: 'Sans entretien',
        maintenanceBadgeVariant: 'green',
      },
      {
        id: 'isolation_biosourcee',
        label: 'Isolation biosourcée',
        emoji: '🌿',
        image: 'https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=400&q=80',
        priceMin: 30,
        priceMax: 80,
        priceUnit: 'm²',
        durabilite: 4,
        entretien: 5,
        description: 'Chanvre, ouate de cellulose, lin. Régulation hygrométrique naturelle. Éco-responsable.',
        maintenanceBadge: 'Sans entretien',
        maintenanceBadgeVariant: 'green',
      },
      {
        id: 'isolation_rigide_ite',
        label: 'ITE — Polystyrène / Polyuréthane',
        emoji: '🏠',
        image: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=400&q=80',
        priceMin: 80,
        priceMax: 180,
        priceUnit: 'm²',
        durabilite: 5,
        entretien: 4,
        description: 'Isolation par l\'extérieur, sans perte de surface intérieure. Traitement ponts thermiques.',
        maintenanceBadge: 'Finition à reprendre',
        maintenanceBadgeVariant: 'amber',
      },
    ],
  },

  // 8. Toiture
  {
    id: 'toiture',
    label: 'Toiture',
    keywords: ['toiture', 'toit', 'tuile', 'ardoise', 'zinc', 'couverture', 'charpente', 'zinguerie'],
    options: [
      {
        id: 'tuiles_terre_cuite',
        label: 'Tuiles terre cuite',
        emoji: '🏠',
        image: 'https://images.unsplash.com/photo-1416331108676-a22ccb276e35?w=400&q=80',
        priceMin: 80,
        priceMax: 160,
        priceUnit: 'm²',
        durabilite: 5,
        entretien: 4,
        description: 'Matériau traditionnel très durable (50+ ans). Large gamme de régions et styles.',
        maintenanceBadge: 'Nettoyage périodique',
        maintenanceBadgeVariant: 'amber',
      },
      {
        id: 'ardoise_naturelle',
        label: 'Ardoise naturelle',
        emoji: '🌊',
        image: 'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=400&q=80',
        priceMin: 120,
        priceMax: 250,
        priceUnit: 'm²',
        durabilite: 5,
        entretien: 5,
        description: 'Prestige, durée de vie 100 ans. Idéal pour les régions à forte pluviométrie.',
        maintenanceBadge: 'Entretien minimal',
        maintenanceBadgeVariant: 'green',
      },
      {
        id: 'bac_acier_zinc',
        label: 'Zinc / Bac acier',
        emoji: '⚡',
        image: 'https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=400&q=80',
        priceMin: 60,
        priceMax: 150,
        priceUnit: 'm²',
        durabilite: 5,
        entretien: 5,
        description: 'Pose rapide, excellente étanchéité. Moderne ou industriel. Recyclable.',
        maintenanceBadge: 'Sans entretien',
        maintenanceBadgeVariant: 'green',
      },
    ],
  },

  // 9. Pergola
  {
    id: 'pergola',
    label: 'Pergola / Véranda',
    keywords: ['pergola', 'véranda', 'tonnelle', 'carport', 'abri jardin', 'bioclimatique'],
    options: [
      {
        id: 'pergola_bois',
        label: 'Pergola bois',
        emoji: '🌲',
        image: 'https://images.unsplash.com/photo-1585128903994-9788298ef8d8?w=400&q=80',
        priceMin: 2000,
        priceMax: 8000,
        priceUnit: 'forfait',
        durabilite: 3,
        entretien: 2,
        description: 'Aspect naturel et chaleureux. Nécessite une lasure tous les 2-3 ans contre les intempéries.',
        maintenanceBadge: 'Traitement bisannuel',
        maintenanceBadgeVariant: 'red',
      },
      {
        id: 'pergola_aluminium',
        label: 'Pergola aluminium',
        emoji: '🔧',
        image: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&q=80',
        priceMin: 5000,
        priceMax: 20000,
        priceUnit: 'forfait',
        durabilite: 5,
        entretien: 5,
        description: 'Robuste, léger, sans entretien. Nombreuses options : lames orientables, LEDs, stores.',
        maintenanceBadge: 'Sans entretien',
        maintenanceBadgeVariant: 'green',
      },
      {
        id: 'pergola_bioclimatique',
        label: 'Bioclimatique motorisée',
        emoji: '☀️',
        image: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=400&q=80',
        priceMin: 10000,
        priceMax: 35000,
        priceUnit: 'forfait',
        durabilite: 5,
        entretien: 4,
        description: 'Lames orientables motorisées, capteurs vent/pluie. Confort optimal toute l\'année.',
        maintenanceBadge: 'Entretien moteur',
        maintenanceBadgeVariant: 'amber',
      },
    ],
  },

  // 10. Extension
  {
    id: 'extension',
    label: 'Extension / Agrandissement',
    keywords: ['extension', 'agrandissement', 'surélévation', 'véranda', 'ossature bois', 'maçonnerie'],
    options: [
      {
        id: 'extension_ossature_bois',
        label: 'Ossature bois',
        emoji: '🪵',
        image: 'https://images.unsplash.com/photo-1534237710431-e2fc698436d0?w=400&q=80',
        priceMin: 1200,
        priceMax: 2500,
        priceUnit: 'm²',
        durabilite: 4,
        entretien: 3,
        description: 'Construction rapide, légère. Bonne isolation thermique. Esthétique contemporaine.',
        maintenanceBadge: 'Entretien modéré',
        maintenanceBadgeVariant: 'amber',
      },
      {
        id: 'extension_beton',
        label: 'Béton / Maçonnerie',
        emoji: '🏗️',
        image: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&q=80',
        priceMin: 1500,
        priceMax: 3000,
        priceUnit: 'm²',
        durabilite: 5,
        entretien: 5,
        description: 'Matériau traditionnel. Excellente inertie thermique. Durée de vie > 100 ans.',
        maintenanceBadge: 'Sans entretien',
        maintenanceBadgeVariant: 'green',
      },
      {
        id: 'extension_metallique',
        label: 'Structure métallique',
        emoji: '⚙️',
        image: 'https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=400&q=80',
        priceMin: 1800,
        priceMax: 4000,
        priceUnit: 'm²',
        durabilite: 5,
        entretien: 4,
        description: 'Grands espaces sans poteaux intermédiaires. Architecture moderne. Chantier rapide.',
        maintenanceBadge: 'Protection anti-rouille',
        maintenanceBadgeVariant: 'amber',
      },
    ],
  },

  // 11. Piscine
  {
    id: 'piscine',
    label: 'Piscine',
    keywords: ['piscine', 'bassin', 'liner', 'coque', 'nage contre courant', 'jacuzzi'],
    options: [
      {
        id: 'piscine_coque',
        label: 'Piscine coque polyester',
        emoji: '🏊',
        image: 'https://images.unsplash.com/photo-1575429198097-0414ec08e8cd?w=400&q=80',
        priceMin: 15000,
        priceMax: 35000,
        priceUnit: 'forfait',
        durabilite: 4,
        entretien: 4,
        description: 'Pose rapide (1 semaine). Pas de liner à remplacer. Surface lisse anti-algues.',
        maintenanceBadge: 'Entretien facile',
        maintenanceBadgeVariant: 'green',
      },
      {
        id: 'piscine_beton',
        label: 'Piscine béton/carrelée',
        emoji: '🔵',
        image: 'https://images.unsplash.com/photo-1523875194681-bedd468c58bf?w=400&q=80',
        priceMin: 25000,
        priceMax: 70000,
        priceUnit: 'forfait',
        durabilite: 5,
        entretien: 3,
        description: 'Sur-mesure total, toutes formes. Valeur ajoutée maximale. Rénovation possible.',
        maintenanceBadge: 'Joints périodiques',
        maintenanceBadgeVariant: 'amber',
      },
      {
        id: 'piscine_liner',
        label: 'Piscine liner',
        emoji: '💧',
        image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400&q=80',
        priceMin: 10000,
        priceMax: 25000,
        priceUnit: 'forfait',
        durabilite: 3,
        entretien: 3,
        description: 'Solution économique. Large choix de couleurs. Liner à remplacer tous les 10-15 ans.',
        maintenanceBadge: 'Liner à renouveler',
        maintenanceBadgeVariant: 'red',
      },
    ],
  },

  // 12. Électricité
  {
    id: 'electricite',
    label: 'Installation électrique',
    keywords: ['électricité', 'tableau électrique', 'câblage', 'prises', 'éclairage', 'disjoncteur', 'mise aux normes'],
    options: [
      {
        id: 'renovation_partielle',
        label: 'Rénovation partielle',
        emoji: '🔌',
        image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80',
        priceMin: 1500,
        priceMax: 5000,
        priceUnit: 'forfait',
        durabilite: 4,
        entretien: 5,
        description: 'Mise aux normes tableau, remplacement prises/interrupteurs. Intervention ciblée.',
        maintenanceBadge: 'Sans entretien',
        maintenanceBadgeVariant: 'green',
      },
      {
        id: 'renovation_complete',
        label: 'Rénovation complète',
        emoji: '⚡',
        image: 'https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=400&q=80',
        priceMin: 8000,
        priceMax: 25000,
        priceUnit: 'forfait',
        durabilite: 5,
        entretien: 5,
        description: 'Refonte complète : nouveau tableau, saignées, gaines, passages de câbles. Normes NF C 15-100.',
        maintenanceBadge: 'Sans entretien',
        maintenanceBadgeVariant: 'green',
      },
      {
        id: 'domotique',
        label: 'Électricité + domotique',
        emoji: '🏠',
        image: 'https://images.unsplash.com/photo-1558002038-1055907df827?w=400&q=80',
        priceMin: 15000,
        priceMax: 50000,
        priceUnit: 'forfait',
        durabilite: 5,
        entretien: 3,
        description: 'KNX, Legrand, Schneider. Pilotage lumière, chauffage, volets depuis smartphone.',
        maintenanceBadge: 'Mises à jour logiciel',
        maintenanceBadgeVariant: 'amber',
      },
    ],
  },

  // 13. Plomberie
  {
    id: 'plomberie',
    label: 'Plomberie',
    keywords: ['plomberie', 'tuyauterie', 'robinetterie', 'chauffe-eau', 'radiateur', 'chauffage', 'chaudière'],
    options: [
      {
        id: 'remplacement_elements',
        label: 'Remplacement équipements',
        emoji: '🚰',
        image: 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=400&q=80',
        priceMin: 500,
        priceMax: 3000,
        priceUnit: 'forfait',
        durabilite: 4,
        entretien: 4,
        description: 'Changement chauffe-eau, robinets, WC. Intervention rapide sans gros travaux.',
        maintenanceBadge: 'Entretien annuel',
        maintenanceBadgeVariant: 'amber',
      },
      {
        id: 'renovation_complete_plomberie',
        label: 'Réfection complète',
        emoji: '🔧',
        image: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&q=80',
        priceMin: 8000,
        priceMax: 30000,
        priceUnit: 'forfait',
        durabilite: 5,
        entretien: 4,
        description: 'Nouveau réseau PER multicouche, distribution, évacuations. Conformité DTU.',
        maintenanceBadge: 'Entretien annuel',
        maintenanceBadgeVariant: 'amber',
      },
      {
        id: 'chauffage_pompe_chaleur',
        label: 'PAC / Plancher chauffant',
        emoji: '♨️',
        image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80',
        priceMin: 10000,
        priceMax: 25000,
        priceUnit: 'forfait',
        durabilite: 5,
        entretien: 3,
        description: 'Pompe à chaleur air/eau + plancher chauffant. Éligible MaPrimeRénov. Économies longue durée.',
        maintenanceBadge: 'Contrat entretien',
        maintenanceBadgeVariant: 'amber',
      },
    ],
  },

  // 14. Rénovation maison complète
  {
    id: 'renovation_maison',
    label: 'Rénovation maison',
    keywords: ['rénovation complète', 'rénovation maison', 'rénover maison', 'réhabilitation', 'travaux complets'],
    options: [
      {
        id: 'renovation_legere',
        label: 'Rénovation légère',
        emoji: '🖌️',
        image: 'https://images.unsplash.com/photo-1562663474-6cbb3eaa4d14?w=400&q=80',
        priceMin: 300,
        priceMax: 700,
        priceUnit: 'm²',
        durabilite: 3,
        entretien: 4,
        description: 'Peinture, sols, luminaires, poignées. Rafraîchissement sans toucher au gros œuvre.',
        maintenanceBadge: 'Entretien facile',
        maintenanceBadgeVariant: 'green',
      },
      {
        id: 'renovation_intermediaire',
        label: 'Rénovation intermédiaire',
        emoji: '🏠',
        image: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=400&q=80',
        priceMin: 700,
        priceMax: 1500,
        priceUnit: 'm²',
        durabilite: 4,
        entretien: 4,
        description: 'Cuisine + SDB + isolation + menuiseries. Confort amélioré, économies d\'énergie.',
        maintenanceBadge: 'Qualité durable',
        maintenanceBadgeVariant: 'green',
      },
      {
        id: 'renovation_lourde',
        label: 'Rénovation lourde / Totale',
        emoji: '🏗️',
        image: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=400&q=80',
        priceMin: 1500,
        priceMax: 3500,
        priceUnit: 'm²',
        durabilite: 5,
        entretien: 4,
        description: 'Restructuration, démolition partielle, tout corps d\'état. Remise à neuf complète.',
        maintenanceBadge: 'Garantie décennale',
        maintenanceBadgeVariant: 'green',
      },
    ],
  },

  // 15. Façade
  {
    id: 'facade',
    label: 'Ravalement de façade',
    keywords: ['façade', 'ravalement', 'enduit façade', 'crépi', 'peinture façade', 'bardage'],
    options: [
      {
        id: 'crepi_mince',
        label: 'Crépi / Enduit mince',
        emoji: '🏠',
        image: 'https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=400&q=80',
        priceMin: 35,
        priceMax: 80,
        priceUnit: 'm²',
        durabilite: 3,
        entretien: 3,
        description: 'Solution économique. Protège du gel et des intempéries. Reprise en 10-15 ans.',
        maintenanceBadge: 'Reprise décennale',
        maintenanceBadgeVariant: 'amber',
      },
      {
        id: 'bardage_bois_pvc',
        label: 'Bardage bois ou PVC',
        emoji: '🪵',
        image: 'https://images.unsplash.com/photo-1534237710431-e2fc698436d0?w=400&q=80',
        priceMin: 60,
        priceMax: 150,
        priceUnit: 'm²',
        durabilite: 4,
        entretien: 3,
        description: 'Esthétique moderne, bonne isolation phonique. PVC sans entretien, bois à traiter.',
        maintenanceBadge: 'Traitement périodique',
        maintenanceBadgeVariant: 'amber',
      },
      {
        id: 'ite_enduit',
        label: 'ITE + Enduit de finition',
        emoji: '🌡️',
        image: 'https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=400&q=80',
        priceMin: 90,
        priceMax: 200,
        priceUnit: 'm²',
        durabilite: 5,
        entretien: 4,
        description: 'Isolation thermique par l\'extérieur + ravalement. Éligible MaPrimeRénov. ROI 5-10 ans.',
        maintenanceBadge: 'Qualité durable',
        maintenanceBadgeVariant: 'green',
      },
    ],
  },

  // 16. Fenêtres / Menuiseries
  {
    id: 'menuiseries',
    label: 'Fenêtres & menuiseries',
    keywords: ['fenêtre', 'menuiserie', 'double vitrage', 'triple vitrage', 'pvc', 'aluminium', 'volet', 'baie vitrée'],
    options: [
      {
        id: 'pvc_double_vitrage',
        label: 'PVC double vitrage',
        emoji: '🪟',
        image: 'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=400&q=80',
        priceMin: 400,
        priceMax: 900,
        priceUnit: 'unité',
        durabilite: 4,
        entretien: 5,
        description: 'Rapport qualité/prix optimal. Aucun entretien, bonne isolation thermique. Le plus répandu.',
        maintenanceBadge: 'Sans entretien',
        maintenanceBadgeVariant: 'green',
      },
      {
        id: 'aluminium_double_vitrage',
        label: 'Aluminium double vitrage',
        emoji: '✨',
        image: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=400&q=80',
        priceMin: 700,
        priceMax: 1800,
        priceUnit: 'unité',
        durabilite: 5,
        entretien: 5,
        description: 'Finesse des profils, design contemporain. Recyclable 100%. Large gamme de couleurs RAL.',
        maintenanceBadge: 'Sans entretien',
        maintenanceBadgeVariant: 'green',
      },
      {
        id: 'bois_double_vitrage',
        label: 'Bois double vitrage',
        emoji: '🌲',
        image: 'https://images.unsplash.com/photo-1416331108676-a22ccb276e35?w=400&q=80',
        priceMin: 800,
        priceMax: 2200,
        priceUnit: 'unité',
        durabilite: 4,
        entretien: 2,
        description: 'Chaleur naturelle, classé monuments historiques possible. Lasure tous les 3-5 ans.',
        maintenanceBadge: 'Lasure régulière',
        maintenanceBadgeVariant: 'red',
      },
    ],
  },

  // 17. Autre
  {
    id: 'autre',
    label: 'Autres travaux',
    keywords: ['autre', 'divers', 'travaux'],
    options: [
      {
        id: 'solution_standard',
        label: 'Solution standard',
        emoji: '🔨',
        image: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400&q=80',
        priceMin: 500,
        priceMax: 2000,
        priceUnit: 'forfait',
        durabilite: 3,
        entretien: 4,
        description: 'Matériaux courants, délais courts. Adapté aux budgets serrés.',
        maintenanceBadge: 'Entretien standard',
        maintenanceBadgeVariant: 'amber',
      },
      {
        id: 'solution_qualite',
        label: 'Solution qualité',
        emoji: '⭐',
        image: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=400&q=80',
        priceMin: 2000,
        priceMax: 8000,
        priceUnit: 'forfait',
        durabilite: 4,
        entretien: 4,
        description: 'Matériaux sélectionnés, artisans qualifiés. Rapport qualité/prix équilibré.',
        maintenanceBadge: 'Bonne durabilité',
        maintenanceBadgeVariant: 'green',
      },
      {
        id: 'solution_premium',
        label: 'Solution premium',
        emoji: '💎',
        image: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=400&q=80',
        priceMin: 8000,
        priceMax: 30000,
        priceUnit: 'forfait',
        durabilite: 5,
        entretien: 4,
        description: 'Haut de gamme, finitions irréprochables, garanties étendues.',
        maintenanceBadge: 'Durabilité maximale',
        maintenanceBadgeVariant: 'green',
      },
    ],
  },
];

// ── Export principal : ajoute "Autre" à chaque type ───────────────────────────

export const MATERIALS_BY_CHANTIER: ChantierType[] = RAW_MAP.map((type) => ({
  ...type,
  options: [...type.options, { ...AUTRE_OPTION, id: `${type.id}_autre` }],
}));

// ── Détection automatique ─────────────────────────────────────────────────────

/**
 * Détecte le type de chantier à partir du contexte textuel et du typeProjet.
 * Retourne le `ChantierType` correspondant, ou `null` si aucun match.
 */
export function detectChantierType(params: {
  typeProjet?: string;
  description?: string;
  prochaineActionTitre?: string;
  lotNoms?: string[];
}): ChantierType | null {
  const { typeProjet, description = '', prochaineActionTitre = '', lotNoms = [] } = params;

  // 1. Correspondance directe typeProjet → id
  if (typeProjet) {
    const byType = MATERIALS_BY_CHANTIER.find((t) => t.id === typeProjet);
    if (byType) return byType;

    // Mapping des valeurs TypeProjet → id catalogue
    const PROJET_MAP: Record<string, string> = {
      salle_de_bain: 'salle_de_bain',
      cuisine: 'cuisine',
      terrasse: 'terrasse',
      pergola: 'pergola',
      isolation: 'isolation',
      toiture: 'toiture',
      piscine: 'piscine',
      electricite: 'electricite',
      plomberie: 'plomberie',
      extension: 'extension',
      renovation_maison: 'renovation_maison',
    };
    const mappedId = PROJET_MAP[typeProjet];
    if (mappedId) {
      const mapped = MATERIALS_BY_CHANTIER.find((t) => t.id === mappedId);
      if (mapped) return mapped;
    }
  }

  // 2. Recherche par mots-clés dans le texte (description + prochaine action + lots)
  const haystack = [description, prochaineActionTitre, ...lotNoms]
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // retire les accents pour la comparaison

  for (const type of MATERIALS_BY_CHANTIER) {
    const score = type.keywords.reduce((acc, kw) => {
      const normalized = kw
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      return acc + (haystack.includes(normalized) ? 1 : 0);
    }, 0);
    if (score >= 1) return type;
  }

  return null;
}
