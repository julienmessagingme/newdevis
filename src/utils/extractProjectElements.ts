/**
 * extractProjectElements.ts
 * Détecte les éléments de travaux présents dans la description d'un projet chantier.
 * Mapping keywords → type métier, sans regex complexe.
 */

// ── Catalogue des types de travaux ───────────────────────────────────────────

const KEYWORD_MAP: Record<string, string[]> = {
  portail:      ['portail', 'portillon', 'porte de garage', 'portique', 'vantail'],
  cloture:      ['clôture', 'cloture', 'grillage', 'palissade', 'haie', 'barrière', 'barriere', 'panneau rigide'],
  terrasse:     ['terrasse', 'dalle', 'deck', 'composite', 'ipé', 'ipe', 'bois traité', 'carrelage extérieur'],
  piscine:      ['piscine', 'bassin', 'jacuzzi', 'spa', 'couloir de nage'],
  pergola:      ['pergola', 'tonnelle', 'carport', 'abri de jardin', 'véranda', 'veranda', 'préau', 'preau'],
  fenetres:     ['fenêtre', 'fenetre', 'châssis', 'chassis', 'baie vitrée', 'baie vitree', 'velux', 'volet', 'menuiserie extérieure', 'vitrage', 'double vitrage'],
  toiture:      ['toiture', 'toit', 'tuile', 'ardoise', 'charpente', 'couverture', 'zinguerie', 'gouttière', 'goutiere', 'faîtage'],
  cuisine:      ['cuisine', 'plan de travail', 'électroménager', 'electromenager', 'hotte', 'îlot', 'ilot'],
  salle_bain:   ['salle de bain', 'salle de bains', 'douche', 'baignoire', 'sanitaire', 'robinetterie', 'faïence salle'],
  plomberie:    ['plomberie', 'tuyauterie', 'chaudière', 'chaudiere', 'radiateur', 'chauffage', 'cumulus', 'ballon eau chaude', 'vmc', 'vmr'],
  electricite:  ['électricité', 'electricite', 'tableau électrique', 'tableau electrique', 'prise', 'éclairage', 'eclairage', 'domotique', 'câblage', 'cablage'],
  isolation:    ['isolation', 'isolant', 'combles', 'laine de verre', 'laine roche', 'ite', 'etics', 'pare-vapeur'],
  peinture:     ['peinture', 'enduit', 'ravalement', 'tapisserie', 'façade', 'facade', 'lasure'],
  carrelage:    ['carrelage', 'parquet', 'stratifié', 'stratifie', 'vinyl', 'lino', 'sol souple'],
  maconnerie:   ['maçonnerie', 'maconnerie', 'béton', 'beton', 'parpaing', 'brique', 'fondation', 'dalle béton', 'agglo'],
  terrassement: ['terrassement', 'terrassier', 'nivellement', 'remblai', 'décaissement', 'decaissement', 'voirie'],
  amenagement:  ['aménagement', 'amenagement', 'cloison', 'placo', 'doublage', 'faux-plafond'],
};

// ── Types publics ─────────────────────────────────────────────────────────────

export type ProjectElement = keyof typeof KEYWORD_MAP;

/**
 * Extrait les éléments de travaux détectés dans une description textuelle.
 * Retourne un tableau de types métier identifiés (ex: ['terrasse', 'portail', 'cloture']).
 */
export function extractProjectElements(description: string): ProjectElement[] {
  const lower = description.toLowerCase();
  const found: ProjectElement[] = [];
  for (const [type, keywords] of Object.entries(KEYWORD_MAP)) {
    if (keywords.some(kw => lower.includes(kw))) {
      found.push(type as ProjectElement);
    }
  }
  return found;
}

// ── Mapping lot/artisan → type de travaux ─────────────────────────────────────

const LOT_TYPE_MAP: Record<string, ProjectElement> = {
  menuisier:      'fenetres',
  menuiserie:     'fenetres',
  fenetre:        'fenetres',
  baie:           'fenetres',
  volet:          'fenetres',
  vitrage:        'fenetres',
  portail:        'portail',
  portillon:      'portail',
  cloture:        'cloture',
  clôture:        'cloture',
  grillage:       'cloture',
  terrasse:       'terrasse',
  deck:           'terrasse',
  dalle:          'terrasse',
  piscine:        'piscine',
  bassin:         'piscine',
  pergola:        'pergola',
  veranda:        'pergola',
  vérand:         'pergola',
  toiture:        'toiture',
  couvreur:       'toiture',
  charpente:      'toiture',
  toit:           'toiture',
  ardoise:        'toiture',
  tuile:          'toiture',
  plombier:       'plomberie',
  plomberie:      'plomberie',
  chauffage:      'plomberie',
  chaudiere:      'plomberie',
  électricien:    'electricite',
  electricien:    'electricite',
  électricité:    'electricite',
  electricite:    'electricite',
  isolation:      'isolation',
  isolant:        'isolation',
  peintre:        'peinture',
  peinture:       'peinture',
  ravalement:     'peinture',
  carreleur:      'carrelage',
  carrelage:      'carrelage',
  parquet:        'carrelage',
  macon:          'maconnerie',
  maçon:          'maconnerie',
  maçonnerie:     'maconnerie',
  maconnerie:     'maconnerie',
  terrassier:     'terrassement',
  terrassement:   'terrassement',
  amenagement:    'amenagement',
  aménagement:    'amenagement',
  cuisine:        'cuisine',
  salle:          'salle_bain',
  sanitaire:      'salle_bain',
};

/**
 * Détecte le type de travaux d'un devis/lot à partir de son nom.
 * Utilise un matching simple sur sous-chaîne normalisée.
 */
export function detectDevisType(nom: string): ProjectElement | 'autre' {
  const lower = nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [keyword, type] of Object.entries(LOT_TYPE_MAP)) {
    const normalizedKw = keyword.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (lower.includes(normalizedKw)) return type;
  }
  return 'autre';
}
