/**
 * budgetAffinageData — Types, données et logique métier pour le questionnaire
 * d'affinage budgétaire. Aucune dépendance React.
 */

// ── Types questionnaire affinage ──────────────────────────────────────────────

export type TypeProjetAffinage = 'renovation_complete' | 'renovation_partielle' | 'extension' | 'exterieur';

// ── Éléments de projet détectables ────────────────────────────────────────────

export interface ElemQuestion {
  id: string;
  label: string;
  /** Précision affichée sous le label */
  sub?: string;
  type: 'number' | 'choice' | 'yesno';
  unit?: string;
  placeholder?: string;
  choices?: string[];
  /** Impact budgétaire (€) quand la réponse est "oui" */
  addMin?: number;
  addAvg?: number;
  addMax?: number;
  /** Impact budgétaire selon le choix sélectionné */
  choiceImpact?: Record<string, { addMin: number; addAvg: number; addMax: number }>;
}

export interface ProjectElementDef {
  id: string;
  label: string;
  emoji: string;
  keywords: string[];
  typeEquiv: TypeProjetAffinage;
  questions: ElemQuestion[];
  /** Élément ajouté manuellement par l'utilisateur */
  isCustom?: boolean;
  /** Budget personnalisé fourni par l'utilisateur (éléments "Autre") */
  customBudgetMin?: number;
  customBudgetMax?: number;
}

export const ELEMENT_DEFS: ProjectElementDef[] = [
  {
    id: 'piscine', label: 'Piscine', emoji: '🏊', typeEquiv: 'exterieur',
    keywords: ['piscine', 'pool', 'bassin'],
    questions: [
      { id: 'type', label: 'Type de piscine', type: 'choice', sub: 'Le type détermine fortement le coût et la durée des travaux',
        choices: ['Béton coulé (sur mesure)', 'Coque polyester (kit)', 'Hors-sol'],
        choiceImpact: { 'Béton coulé (sur mesure)': { addMin: 10000, addAvg: 20000, addMax: 35000 }, 'Coque polyester (kit)': { addMin: 0, addAvg: 0, addMax: 0 }, 'Hors-sol': { addMin: -8000, addAvg: -15000, addMax: -22000 } } },
      { id: 'surface', label: 'Surface du bassin', type: 'number', unit: 'm²', placeholder: '30', sub: 'La superficie est le principal facteur de coût (terrassement, liner, eau)' },
      { id: 'local_technique', label: 'Faut-il construire un local technique (filtration, pompe) ?', type: 'yesno', sub: 'Local béton ou préfabriqué pour les équipements de traitement de l\'eau', addMin: 4000, addAvg: 8000, addMax: 15000 },
      { id: 'chauffage', label: 'Souhaitez-vous chauffer la piscine ?', type: 'yesno', sub: 'Pompe à chaleur air-eau dédiée — prolonge la saison de 2 à 3 mois', addMin: 3000, addAvg: 5500, addMax: 9000 },
      { id: 'plage', label: 'Y a-t-il une plage béton / carrelage autour du bassin ?', type: 'yesno', sub: 'Dalle antidérapante sur le pourtour (béton lavé, carrelage ou pierre)', addMin: 3000, addAvg: 6000, addMax: 12000 },
      { id: 'eclairage', label: 'Souhaitez-vous un éclairage LED sous-marin ?', type: 'yesno', sub: 'Projecteurs LED subaquatiques + alimentation électrique étanche', addMin: 800, addAvg: 1800, addMax: 3500 },
      { id: 'couverture', label: 'Faut-il une couverture automatique de sécurité ?', type: 'yesno', sub: 'Volet immergé ou abri télescopique — protection anti-noyade + économies de chauffage', addMin: 3000, addAvg: 7000, addMax: 14000 },
    ],
  },
  {
    id: 'terrasse', label: 'Terrasse', emoji: '🪵', typeEquiv: 'exterieur',
    keywords: ['terrasse', 'deck', 'platelage', 'dallage', 'dalle extérieure', 'dalle béton'],
    questions: [
      { id: 'surface', label: 'Surface de la terrasse', type: 'number', unit: 'm²', placeholder: '25', sub: 'La surface est la base du calcul (fourniture + pose au m²)' },
      { id: 'materiau', label: 'Quel revêtement souhaitez-vous ?', type: 'choice', sub: 'Le matériau impacte à la fois le coût et la durée de vie',
        choices: ['Bois composite', 'Bois naturel (ipé, pin…)', 'Carrelage extérieur', 'Béton désactivé / dallage'],
        choiceImpact: { 'Bois composite': { addMin: 500, addAvg: 1500, addMax: 3000 }, 'Bois naturel (ipé, pin…)': { addMin: 0, addAvg: 0, addMax: 0 }, 'Carrelage extérieur': { addMin: 800, addAvg: 2000, addMax: 4000 }, 'Béton désactivé / dallage': { addMin: 0, addAvg: 500, addMax: 1500 } } },
      { id: 'terrassement', label: 'Y a-t-il un dénivelé ou un terrassement préalable ?', type: 'yesno', sub: 'Décaissement du sol, évacuation des terres, mise en niveau', addMin: 1500, addAvg: 3500, addMax: 7000 },
      { id: 'eclairage', label: 'Souhaitez-vous des points lumineux sur la terrasse ?', type: 'yesno', sub: 'Spots encastrés au sol, appliques murales ou guirlandes + câblage', addMin: 600, addAvg: 1500, addMax: 3000 },
      { id: 'eau', label: 'Faut-il créer un point d\'eau extérieur (robinet, douche) ?', type: 'yesno', sub: 'Raccordement plomberie + robinet extérieur ou douche de jardin', addMin: 400, addAvg: 900, addMax: 2000 },
      { id: 'escaliers', label: 'Des escaliers d\'accès sont-ils à créer ?', type: 'yesno', sub: 'Marches en pierre, béton ou bois pour accéder à la terrasse surélevée', addMin: 500, addAvg: 1500, addMax: 3500 },
      { id: 'garde_corps', label: 'Un garde-corps ou une rambarde est-il nécessaire ?', type: 'yesno', sub: 'Obligatoire si la terrasse est surélevée de plus de 1 m', addMin: 800, addAvg: 2000, addMax: 4500 },
    ],
  },
  {
    id: 'pergola', label: 'Pergola', emoji: '⛺', typeEquiv: 'exterieur',
    keywords: ['pergola'],
    questions: [
      { id: 'surface', label: 'Surface couverte', type: 'number', unit: 'm²', placeholder: '15', sub: 'La surface détermine la quantité de matériaux et le temps de pose' },
      { id: 'type', label: 'Type de pergola', type: 'choice', sub: 'La bioclimatique est plus complexe à installer mais très polyvalente',
        choices: ['Bioclimatique (lames orientables)', 'Aluminium fixe', 'Bois classique'],
        choiceImpact: { 'Bioclimatique (lames orientables)': { addMin: 5000, addAvg: 9000, addMax: 15000 }, 'Aluminium fixe': { addMin: 1000, addAvg: 2500, addMax: 5000 }, 'Bois classique': { addMin: 0, addAvg: 0, addMax: 0 } } },
      { id: 'electricite', label: 'Faut-il amener l\'électricité jusqu\'à la pergola ?', type: 'yesno', sub: 'Tirage de câble depuis le tableau + gaine extérieure', addMin: 800, addAvg: 1800, addMax: 4000 },
      { id: 'eclairage', label: 'Souhaitez-vous un éclairage intégré dans la structure ?', type: 'yesno', sub: 'Spots LED ou guirlandes fixés dans les poutres de la pergola', addMin: 400, addAvg: 1000, addMax: 2200 },
      { id: 'stores', label: 'Faut-il prévoir des stores ou rideaux latéraux ?', type: 'yesno', sub: 'Protection solaire et intimité sur les côtés de la pergola', addMin: 800, addAvg: 1800, addMax: 3500 },
      { id: 'chauffage', label: 'Souhaitez-vous un chauffage infrarouge pour les soirées fraîches ?', type: 'yesno', sub: 'Radiateurs infrarouges fixés à la structure — prolonge l\'usage en automne', addMin: 500, addAvg: 1200, addMax: 2500 },
    ],
  },
  {
    id: 'pool_house', label: 'Pool house', emoji: '🏡', typeEquiv: 'exterieur',
    keywords: ['pool house', 'poolhouse', 'abri piscine', 'pool-house'],
    questions: [
      { id: 'surface', label: 'Surface du pool house', type: 'number', unit: 'm²', placeholder: '20', sub: 'La superficie définit la quantité de maçonnerie, toiture et charpente' },
      { id: 'type', label: 'Type de construction', type: 'choice', sub: 'La maçonnerie pierre est la plus chère, l\'ossature bois la plus rapide',
        choices: ['Parpaing / enduit', 'Ossature bois', 'Maçonnerie pierre'],
        choiceImpact: { 'Parpaing / enduit': { addMin: 0, addAvg: 0, addMax: 0 }, 'Ossature bois': { addMin: 1000, addAvg: 3000, addMax: 6000 }, 'Maçonnerie pierre': { addMin: 3000, addAvg: 8000, addMax: 15000 } } },
      { id: 'electricite', label: 'Faut-il tirer l\'électricité jusqu\'au pool house ?', type: 'yesno', sub: 'Câblage depuis le tableau principal de la maison + sous-tableau', addMin: 1200, addAvg: 2500, addMax: 5000 },
      { id: 'cuisine', label: 'Faut-il prévoir une cuisine ou kitchenette ?', type: 'yesno', sub: 'Évier + plan de travail + rangement + raccordement plomberie', addMin: 2500, addAvg: 5000, addMax: 10000 },
      { id: 'sanitaires', label: 'Y a-t-il des sanitaires à créer (WC, douche) ?', type: 'yesno', sub: 'Raccordement eau + évacuation + équipements sanitaires', addMin: 3000, addAvg: 5500, addMax: 9000 },
      { id: 'climatisation', label: 'Souhaitez-vous la climatisation / chauffage réversible ?', type: 'yesno', sub: 'Unité murale réversible (climatisation + chauffage en hiver)', addMin: 2000, addAvg: 3500, addMax: 6000 },
    ],
  },
  {
    id: 'extension', label: 'Extension', emoji: '🏗️', typeEquiv: 'extension',
    keywords: ['extension', 'agrandissement', 'annexe', 'surélévation', 'surelevation'],
    questions: [
      { id: 'surface', label: 'Surface à créer', type: 'number', unit: 'm²', placeholder: '30', sub: 'La surface neuve est la base du calcul au m² hors taxes' },
      { id: 'structure', label: 'Type de structure', type: 'choice', sub: 'La surélévation nécessite des travaux de charpente et de toiture supplémentaires',
        choices: ['Plain-pied (dalle béton)', 'Surélévation (niveau supplémentaire)'],
        choiceImpact: { 'Plain-pied (dalle béton)': { addMin: 0, addAvg: 0, addMax: 0 }, 'Surélévation (niveau supplémentaire)': { addMin: 6000, addAvg: 14000, addMax: 28000 } } },
      { id: 'plomberie', label: 'Faut-il prévoir la plomberie dans l\'extension ?', type: 'yesno', sub: 'Raccordement eau chaude/froide + évacuations (si cuisine, bain ou WC)', addMin: 4000, addAvg: 8000, addMax: 15000 },
      { id: 'electricite', label: 'L\'électricité est-elle à réaliser entièrement ?', type: 'yesno', sub: 'Tableau divisionnaire, câblage neuf, prises, éclairage, VMC', addMin: 3000, addAvg: 6000, addMax: 12000 },
      { id: 'demolition', label: 'Y a-t-il une démolition ou une ouverture de mur à prévoir ?', type: 'yesno', sub: 'Dépose de murs porteurs ou non, ouverture de façade, évacuation gravats', addMin: 2000, addAvg: 5000, addMax: 10000 },
      { id: 'cuisine_sdb', label: 'L\'extension comprend-elle une cuisine ou une salle de bain ?', type: 'yesno', sub: 'Travaux de plomberie + carrelage + équipements sanitaires ou cuisine', addMin: 6000, addAvg: 14000, addMax: 25000 },
    ],
  },
  {
    id: 'renovation', label: 'Rénovation complète', emoji: '🔨', typeEquiv: 'renovation_complete',
    keywords: ['rénovation complète', 'renovation complete', 'rénover entièrement', 'réhabilitation'],
    questions: [
      { id: 'surface', label: 'Surface à rénover', type: 'number', unit: 'm²', placeholder: '100', sub: 'La surface est la base du calcul — plus elle est grande, plus la fourchette s\'élargit' },
      { id: 'etendue', label: 'Étendue des travaux', type: 'choice', sub: 'Une rénovation légère coûte 3 à 5× moins cher qu\'une rénovation lourde (gros œuvre)',
        choices: ['Lourde (gros œuvre + second œuvre + finitions)', 'Intermédiaire (second œuvre + finitions)', 'Légère (peinture, sols, finitions)'],
        choiceImpact: { 'Lourde (gros œuvre + second œuvre + finitions)': { addMin: 10000, addAvg: 25000, addMax: 50000 }, 'Intermédiaire (second œuvre + finitions)': { addMin: 0, addAvg: 0, addMax: 0 }, 'Légère (peinture, sols, finitions)': { addMin: -8000, addAvg: -15000, addMax: -25000 } } },
      { id: 'demolition', label: 'Y a-t-il des démolitions ou un désamiantage à prévoir ?', type: 'yesno', sub: 'Abattage de cloisons, diagnostic amiante obligatoire avant 1997', addMin: 2000, addAvg: 5000, addMax: 12000 },
      { id: 'reseaux', label: 'Les réseaux (plomberie, électricité) sont-ils à entièrement refaire ?', type: 'yesno', sub: 'Mise aux normes complète — souvent obligatoire sur les biens anciens', addMin: 8000, addAvg: 18000, addMax: 35000 },
    ],
  },
  {
    id: 'salle_bain', label: 'Salle de bain', emoji: '🚿', typeEquiv: 'renovation_partielle',
    keywords: ['salle de bain', 'salle de bains', 'sdb', 'douche', 'baignoire'],
    questions: [
      { id: 'surface', label: 'Surface de la salle de bain', type: 'number', unit: 'm²', placeholder: '8', sub: 'Les SdB coûtent cher au m² car elles concentrent plomberie + carrelage + équipements' },
      { id: 'etendue', label: 'Étendue des travaux', type: 'choice', sub: 'Une réfection complète inclut tout : démolition, plomberie, carrelage, équipements',
        choices: ['Complète (démolition + plomberie + carrelage + équipements)', 'Équipements seuls (douche, WC, vasque)', 'Rafraîchissement (peinture + joints + accessoires)'],
        choiceImpact: { 'Complète (démolition + plomberie + carrelage + équipements)': { addMin: 0, addAvg: 0, addMax: 0 }, 'Équipements seuls (douche, WC, vasque)': { addMin: -3000, addAvg: -6000, addMax: -10000 }, 'Rafraîchissement (peinture + joints + accessoires)': { addMin: -5000, addAvg: -9000, addMax: -15000 } } },
      { id: 'italienne', label: 'Souhaitez-vous une douche à l\'italienne (sans receveur) ?', type: 'yesno', sub: 'Chape en pente + étanchéité + carrelage — 1 à 2 jours de travail supplémentaire', addMin: 800, addAvg: 1800, addMax: 3500 },
      { id: 'seche_serviette', label: 'Faut-il installer un sèche-serviette électrique ?', type: 'yesno', sub: 'Radiateur sèche-serviette mural + point électrique dédié', addMin: 300, addAvg: 700, addMax: 1500 },
      { id: 'vmc', label: 'Y a-t-il une ventilation (VMC) à créer ou remplacer ?', type: 'yesno', sub: 'Obligatoire dans les salles de bain — évite les problèmes d\'humidité', addMin: 400, addAvg: 900, addMax: 2000 },
    ],
  },
  {
    id: 'cuisine', label: 'Cuisine', emoji: '🍳', typeEquiv: 'renovation_partielle',
    keywords: ['cuisine', 'plan de travail', 'meuble cuisine'],
    questions: [
      { id: 'surface', label: 'Surface de la cuisine', type: 'number', unit: 'm²', placeholder: '15', sub: 'Les cuisines ouvertes (25m²+) nécessitent plus de linéaire de meubles' },
      { id: 'etendue', label: 'Étendue des travaux', type: 'choice', sub: 'Le remplacement complet inclut la dépose de l\'ancienne cuisine + toute la plomberie',
        choices: ['Complète (plomberie + électricité + mobilier)', 'Remplacement des équipements uniquement', 'Façades + plan de travail uniquement'],
        choiceImpact: { 'Complète (plomberie + électricité + mobilier)': { addMin: 0, addAvg: 0, addMax: 0 }, 'Remplacement des équipements uniquement': { addMin: -2000, addAvg: -5000, addMax: -9000 }, 'Façades + plan de travail uniquement': { addMin: -4000, addAvg: -8000, addMax: -14000 } } },
      { id: 'ilot', label: 'Souhaitez-vous un îlot central ?', type: 'yesno', sub: 'Plan de travail central avec rangements — mobilier + plomberie si évier déporté', addMin: 1500, addAvg: 3500, addMax: 7000 },
      { id: 'credence', label: 'Une crédence carrelage ou verre est-elle à poser ?', type: 'yesno', sub: 'Protection murale entre les meubles hauts et le plan de travail', addMin: 300, addAvg: 800, addMax: 2000 },
      { id: 'electricite', label: 'L\'électricité de la cuisine est-elle à refaire ?', type: 'yesno', sub: 'Circuits dédiés pour four, lave-vaisselle, réfrigérateur — mis aux normes', addMin: 800, addAvg: 2000, addMax: 4500 },
    ],
  },
  {
    id: 'cloture', label: 'Clôture / portail', emoji: '🚧', typeEquiv: 'exterieur',
    keywords: ['clôture', 'cloture', 'portail', 'grillage', 'palissade', 'mur de clôture'],
    questions: [
      { id: 'lineaire', label: 'Linéaire de clôture à créer', type: 'number', unit: 'm', placeholder: '30', sub: 'Le linéaire (en mètres) est la base du devis clôture' },
      { id: 'type', label: 'Type de clôture', type: 'choice', sub: 'Le bois est le moins cher à poser, le béton / pierre le plus pérenne',
        choices: ['Grillage rigide + poteaux', 'Palissade bois / lisses', 'Aluminium / PVC', 'Béton / mur maçonné'],
        choiceImpact: { 'Grillage rigide + poteaux': { addMin: 0, addAvg: 0, addMax: 0 }, 'Palissade bois / lisses': { addMin: 500, addAvg: 1500, addMax: 3000 }, 'Aluminium / PVC': { addMin: 1000, addAvg: 3000, addMax: 6000 }, 'Béton / mur maçonné': { addMin: 2000, addAvg: 6000, addMax: 12000 } } },
      { id: 'portail', label: 'Y a-t-il un portail motorisé à installer ?', type: 'yesno', sub: 'Portail coulissant ou battant + motorisation + télécommande + interphone', addMin: 1500, addAvg: 3500, addMax: 7000 },
      { id: 'fondations', label: 'Le terrain est-il en pente (fondations spéciales) ?', type: 'yesno', sub: 'Terrassement + béton armé si dénivelé important', addMin: 1000, addAvg: 3000, addMax: 6000 },
    ],
  },
  {
    id: 'carport', label: 'Carport / garage', emoji: '🚗', typeEquiv: 'exterieur',
    keywords: ['carport', 'abri voiture', 'garage', 'box'],
    questions: [
      { id: 'surface', label: 'Surface du carport / garage', type: 'number', unit: 'm²', placeholder: '20', sub: 'Environ 15 m² pour 1 voiture, 25 m² pour 2 voitures' },
      { id: 'type', label: 'Type de structure', type: 'choice', sub: 'Le garage maçonné est le plus solide mais le plus long à construire',
        choices: ['Carport bois (ouvert)', 'Carport aluminium (ouvert)', 'Garage maçonné (fermé)', 'Abri métal (semi-ouvert)'],
        choiceImpact: { 'Carport bois (ouvert)': { addMin: 0, addAvg: 0, addMax: 0 }, 'Carport aluminium (ouvert)': { addMin: 500, addAvg: 1500, addMax: 3500 }, 'Garage maçonné (fermé)': { addMin: 5000, addAvg: 12000, addMax: 22000 }, 'Abri métal (semi-ouvert)': { addMin: 300, addAvg: 800, addMax: 2000 } } },
      { id: 'dalle', label: 'Faut-il créer une dalle béton au sol ?', type: 'yesno', sub: 'Dalle de 10 à 15 cm + ferraillage — indispensable si le sol n\'est pas préparé', addMin: 800, addAvg: 2000, addMax: 4500 },
      { id: 'electricite', label: 'Souhaitez-vous l\'électricité + éclairage dans le carport ?', type: 'yesno', sub: 'Prise 16A/32A + éclairage + câblage depuis le tableau de la maison', addMin: 800, addAvg: 1800, addMax: 4000 },
      { id: 'borne_recharge', label: 'Faut-il installer une borne de recharge voiture électrique ?', type: 'yesno', sub: 'Borne 7 kW (wallbox) + câble dédié — environ 1 journée d\'électricien', addMin: 1000, addAvg: 2000, addMax: 3500 },
    ],
  },
  {
    id: 'allee', label: 'Allée carrossable', emoji: '🛣️', typeEquiv: 'exterieur',
    keywords: ['allée', 'allee', 'carrossable', 'voie d\'accès', 'voie acces', 'entrée voiture', 'accès voiture'],
    questions: [
      { id: 'surface', label: 'Surface de l\'allée', type: 'number', unit: 'm²', placeholder: '40', sub: 'Exemple : une allée de 20 m × 3 m = 60 m²' },
      { id: 'materiau', label: 'Revêtement souhaité', type: 'choice', sub: 'Le béton désactivé est le plus qualitatif, le gravier stabilisé le moins cher',
        choices: ['Béton désactivé', 'Enrobé bitumineux', 'Gravier stabilisé', 'Pavés autobloquants béton'],
        choiceImpact: { 'Béton désactivé': { addMin: 1500, addAvg: 4000, addMax: 8000 }, 'Enrobé bitumineux': { addMin: 800, addAvg: 2500, addMax: 5000 }, 'Gravier stabilisé': { addMin: 0, addAvg: 0, addMax: 0 }, 'Pavés autobloquants béton': { addMin: 2000, addAvg: 5000, addMax: 10000 } } },
      { id: 'terrassement', label: 'Y a-t-il du terrassement ou décaissement à prévoir ?', type: 'yesno', sub: 'Décapage de la végétation, décaissement, évacuation des terres', addMin: 1500, addAvg: 3500, addMax: 7000 },
      { id: 'bordures', label: 'Faut-il poser des bordures ou caniveaux sur les côtés ?', type: 'yesno', sub: 'Bordures béton T2 ou caniveaux de drainage pour évacuer les eaux pluviales', addMin: 500, addAvg: 1500, addMax: 3000 },
      { id: 'eclairage', label: 'Souhaitez-vous un éclairage le long de l\'allée ?', type: 'yesno', sub: 'Bornes solaires ou câblées disposées le long de l\'allée', addMin: 800, addAvg: 2000, addMax: 4500 },
      { id: 'portail', label: 'Faut-il installer un portail motorisé à l\'entrée ?', type: 'yesno', sub: 'Portail coulissant ou battant + motorisation + télécommande', addMin: 1500, addAvg: 3500, addMax: 7000 },
    ],
  },
  {
    id: 'amenagement_jardin', label: 'Aménagement jardin', emoji: '🌳', typeEquiv: 'exterieur',
    keywords: ['jardin', 'paysager', 'gazon', 'pelouse', 'plantation', 'massif', 'engazonnement', 'arrosage automatique'],
    questions: [
      { id: 'surface', label: 'Surface du jardin à aménager', type: 'number', unit: 'm²', placeholder: '200', sub: 'La surface à travailler détermine le volume de terre végétale et de plantes' },
      { id: 'type', label: 'Type d\'aménagement principal', type: 'choice', sub: 'Un engazonnement simple coûte 5× moins cher qu\'un jardin paysager complet',
        choices: ['Engazonnement + quelques plantations', 'Jardin paysager complet (massifs, allées)', 'Terrain de sport / pelouse sportive'],
        choiceImpact: { 'Engazonnement + quelques plantations': { addMin: 0, addAvg: 0, addMax: 0 }, 'Jardin paysager complet (massifs, allées)': { addMin: 3000, addAvg: 8000, addMax: 18000 }, 'Terrain de sport / pelouse sportive': { addMin: 2000, addAvg: 6000, addMax: 12000 } } },
      { id: 'terrassement', label: 'Y a-t-il du terrassement ou nivellement à prévoir ?', type: 'yesno', sub: 'Décapage, apport de terre végétale, nivellement au tracteur', addMin: 1000, addAvg: 3000, addMax: 7000 },
      { id: 'arrosage', label: 'Souhaitez-vous un arrosage automatique enterré ?', type: 'yesno', sub: 'Système avec programmateur, tuyaux enterrés et têtes de rotation', addMin: 2500, addAvg: 5000, addMax: 10000 },
      { id: 'eclairage', label: 'Faut-il prévoir un éclairage extérieur dans le jardin ?', type: 'yesno', sub: 'Spots au sol, bornes ou projecteurs + câblage enterré', addMin: 1000, addAvg: 2500, addMax: 5000 },
      { id: 'cloture', label: 'Y a-t-il une clôture ou délimitation à créer ?', type: 'yesno', sub: 'Grillage, palissade ou haie pour délimiter la propriété', addMin: 1500, addAvg: 4000, addMax: 9000 },
    ],
  },
  {
    id: 'toiture', label: 'Toiture / charpente', emoji: '🏠', typeEquiv: 'renovation_partielle',
    keywords: ['toiture', 'charpente', 'couverture', 'toit', 'tuile', 'ardoise', 'zinguerie', 'gouttière'],
    questions: [
      { id: 'surface', label: 'Surface de la toiture', type: 'number', unit: 'm²', placeholder: '120', sub: 'La surface de toiture est généralement 1,2 à 1,5× la surface au sol' },
      { id: 'type', label: 'Type de couverture souhaitée', type: 'choice', sub: 'L\'ardoise naturelle est la plus durable mais 2× plus chère que les tuiles béton',
        choices: ['Tuiles béton', 'Tuiles terre cuite', 'Ardoise naturelle', 'Zinc / bac acier'],
        choiceImpact: { 'Tuiles béton': { addMin: 0, addAvg: 0, addMax: 0 }, 'Tuiles terre cuite': { addMin: 1000, addAvg: 3000, addMax: 6000 }, 'Ardoise naturelle': { addMin: 3000, addAvg: 8000, addMax: 15000 }, 'Zinc / bac acier': { addMin: 1000, addAvg: 3500, addMax: 7000 } } },
      { id: 'charpente', label: 'La charpente est-elle à remplacer ou renforcer ?', type: 'yesno', sub: 'Remplacement total ou partiel de la structure bois portant la couverture', addMin: 4000, addAvg: 10000, addMax: 20000 },
      { id: 'isolation', label: 'Souhaitez-vous isoler les combles en même temps ?', type: 'yesno', sub: 'Isolation thermique des combles — économies de chauffage immédiates', addMin: 2000, addAvg: 5000, addMax: 10000 },
      { id: 'velux', label: 'Faut-il poser ou remplacer des fenêtres de toit (Velux) ?', type: 'yesno', sub: 'Compter environ 1 500 € l\'unité en moyenne (fourniture + pose)', addMin: 1000, addAvg: 3000, addMax: 6000 },
      { id: 'zinguerie', label: 'Les gouttières et zingueries sont-elles à refaire ?', type: 'yesno', sub: 'Chéneaux, descentes, solins, noues — souvent oubliés dans les devis', addMin: 1500, addAvg: 3500, addMax: 7000 },
    ],
  },
  {
    id: 'isolation', label: 'Isolation', emoji: '🧱', typeEquiv: 'renovation_partielle',
    keywords: ['isolation', 'ite', 'iti', 'combles', 'plancher bas', 'pare-vapeur', 'laine de verre', 'laine de roche'],
    questions: [
      { id: 'surface', label: 'Surface à isoler', type: 'number', unit: 'm²', placeholder: '100', sub: 'La surface isolée est la base du calcul (€/m² selon la solution choisie)' },
      { id: 'type', label: 'Type d\'isolation', type: 'choice', sub: 'L\'ITE améliore aussi l\'esthétique de façade mais coûte 3 à 5× plus cher que les combles',
        choices: ['Combles perdus (soufflage)', 'Isolation par l\'extérieur — ITE', 'Isolation intérieure — ITI', 'Plancher bas / vide sanitaire'],
        choiceImpact: { 'Combles perdus (soufflage)': { addMin: 0, addAvg: 0, addMax: 0 }, 'Isolation par l\'extérieur — ITE': { addMin: 3000, addAvg: 8000, addMax: 18000 }, 'Isolation intérieure — ITI': { addMin: 1000, addAvg: 3000, addMax: 7000 }, 'Plancher bas / vide sanitaire': { addMin: 500, addAvg: 2000, addMax: 5000 } } },
      { id: 'humidite', label: 'Y a-t-il des problèmes d\'humidité ou infiltrations à traiter avant ?', type: 'yesno', sub: 'Traitement hydrofuge, drainage ou cuvelage avant de poser l\'isolant', addMin: 1500, addAvg: 4000, addMax: 9000 },
      { id: 'menuiseries', label: 'Faut-il remplacer les fenêtres en même temps ?', type: 'yesno', sub: 'Cohérence thermique recommandée — double ou triple vitrage', addMin: 2000, addAvg: 5000, addMax: 12000 },
    ],
  },
  {
    id: 'electricite', label: 'Électricité', emoji: '⚡', typeEquiv: 'renovation_partielle',
    keywords: ['électricité', 'electricite', 'tableau électrique', 'mise aux normes', 'vmc', 'domotique', 'prises', 'câblage'],
    questions: [
      { id: 'surface', label: 'Surface du logement concernée', type: 'number', unit: 'm²', placeholder: '80', sub: 'Permet d\'estimer le nombre de circuits, de prises et de câbles nécessaires' },
      { id: 'type', label: 'Type de travaux électriques', type: 'choice', sub: 'Une rénovation complète comprend nouveau tableau + tous les circuits + prises + éclairage',
        choices: ['Rénovation complète (tableau + câblage + prises)', 'Mise aux normes partielle', 'Extension ou ajout de prises / circuits'],
        choiceImpact: { 'Rénovation complète (tableau + câblage + prises)': { addMin: 2000, addAvg: 5000, addMax: 10000 }, 'Mise aux normes partielle': { addMin: 0, addAvg: 0, addMax: 0 }, 'Extension ou ajout de prises / circuits': { addMin: -500, addAvg: -2000, addMax: -4000 } } },
      { id: 'vmc', label: 'Faut-il installer ou remplacer la VMC (ventilation) ?', type: 'yesno', sub: 'Obligatoire dans les logements construits après 1982', addMin: 800, addAvg: 2000, addMax: 5000 },
      { id: 'domotique', label: 'Souhaitez-vous intégrer de la domotique (éclairage intelligent, volets) ?', type: 'yesno', sub: 'Bus KNX ou protocole Z-Wave — câblage spécifique + programmation', addMin: 2000, addAvg: 5000, addMax: 12000 },
      { id: 'borne_recharge', label: 'Faut-il prévoir une borne de recharge pour véhicule électrique ?', type: 'yesno', sub: 'Wallbox 7 kW + circuit dédié depuis tableau — environ 1 journée d\'électricien', addMin: 1000, addAvg: 1800, addMax: 3500 },
    ],
  },
  {
    id: 'plomberie', label: 'Plomberie / chauffage', emoji: '🔧', typeEquiv: 'renovation_partielle',
    keywords: ['plomberie', 'chauffage', 'chaudière', 'radiateur', 'plancher chauffant', 'pompe à chaleur', 'pac', 'sanitaire'],
    questions: [
      { id: 'surface', label: 'Surface du logement', type: 'number', unit: 'm²', placeholder: '100', sub: 'La surface détermine la puissance de chauffage nécessaire (en kW)' },
      { id: 'type', label: 'Type de travaux de chauffage', type: 'choice', sub: 'La PAC air-eau est la solution la plus économique sur le long terme',
        choices: ['Remplacement chaudière gaz / fioul', 'Pompe à chaleur air-eau (PAC)', 'Plancher chauffant hydraulique', 'Radiateurs électriques uniquement'],
        choiceImpact: { 'Remplacement chaudière gaz / fioul': { addMin: 0, addAvg: 0, addMax: 0 }, 'Pompe à chaleur air-eau (PAC)': { addMin: 4000, addAvg: 8000, addMax: 15000 }, 'Plancher chauffant hydraulique': { addMin: 3000, addAvg: 7000, addMax: 14000 }, 'Radiateurs électriques uniquement': { addMin: -1000, addAvg: -3000, addMax: -5000 } } },
      { id: 'eau_chaude', label: 'Le chauffe-eau est-il à remplacer ?', type: 'yesno', sub: 'Durée de vie d\'un chauffe-eau : 10–15 ans — à remplacer si plus de 10 ans', addMin: 500, addAvg: 1200, addMax: 3000 },
      { id: 'reseaux', label: 'Les canalisations sont-elles à refaire (plomb ou acier galvanisé) ?', type: 'yesno', sub: 'Remplacement des tuyaux en plomb ou acier galvanisé — recommandé sur biens anciens', addMin: 3000, addAvg: 7000, addMax: 14000 },
    ],
  },
  {
    id: 'menuiseries', label: 'Menuiseries', emoji: '🪟', typeEquiv: 'renovation_partielle',
    keywords: ['menuiserie', 'fenêtre', 'fenetre', 'porte-fenêtre', 'porte fenetre', 'baie vitrée', 'baie vitree', 'volet', 'store'],
    questions: [
      { id: 'quantite', label: 'Nombre d\'ouvertures à remplacer', type: 'number', unit: 'fenêtres / portes', placeholder: '8', sub: 'Comptez chaque fenêtre, porte-fenêtre ou baie vitrée individuellement' },
      { id: 'materiau', label: 'Matériau choisi', type: 'choice', sub: 'L\'aluminium offre le meilleur rapport durabilité/entretien, le PVC le meilleur prix',
        choices: ['PVC (le moins cher)', 'Aluminium (le plus durable)', 'Bois (esthétique mais entretien régulier)', 'Mixte bois-alu'],
        choiceImpact: { 'PVC (le moins cher)': { addMin: 0, addAvg: 0, addMax: 0 }, 'Aluminium (le plus durable)': { addMin: 1000, addAvg: 2500, addMax: 5000 }, 'Bois (esthétique mais entretien régulier)': { addMin: 1500, addAvg: 3500, addMax: 7000 }, 'Mixte bois-alu': { addMin: 2000, addAvg: 4500, addMax: 9000 } } },
      { id: 'volets', label: 'Faut-il remplacer ou installer des volets ?', type: 'yesno', sub: 'Volets roulants électriques ou battants — à intégrer au devis menuiserie', addMin: 1500, addAvg: 3500, addMax: 7000 },
      { id: 'porte_entree', label: 'La porte d\'entrée est-elle à remplacer ?', type: 'yesno', sub: 'Porte blindée ou isolante — sécurité + économies d\'énergie', addMin: 800, addAvg: 2000, addMax: 4500 },
    ],
  },
  {
    id: 'ravalement', label: 'Ravalement façade', emoji: '🏛️', typeEquiv: 'renovation_partielle',
    keywords: ['ravalement', 'façade', 'facade', 'enduit', 'bardage'],
    questions: [
      { id: 'surface', label: 'Surface de façade à traiter', type: 'number', unit: 'm²', placeholder: '150', sub: 'Surface extérieure des murs hors ouvertures (fenêtres, portes)' },
      { id: 'type', label: 'Type de finition souhaitée', type: 'choice', sub: 'L\'enduit projeté est la solution la plus courante, l\'ITE la plus performante thermiquement',
        choices: ['Enduit projeté monocouche', 'Peinture façade (sur enduit sain)', 'Bardage bois ou composite', 'Isolation extérieure ITE + enduit'],
        choiceImpact: { 'Enduit projeté monocouche': { addMin: 0, addAvg: 0, addMax: 0 }, 'Peinture façade (sur enduit sain)': { addMin: -1000, addAvg: -2500, addMax: -5000 }, 'Bardage bois ou composite': { addMin: 2000, addAvg: 5000, addMax: 10000 }, 'Isolation extérieure ITE + enduit': { addMin: 5000, addAvg: 12000, addMax: 22000 } } },
      { id: 'echafaudage', label: 'La hauteur nécessite-t-elle un échafaudage au-delà du 1er étage ?', type: 'yesno', sub: 'Au-delà du 1er étage, un échafaudage tubulaire est obligatoire — coût fixe important', addMin: 1500, addAvg: 3500, addMax: 7000 },
      { id: 'fissures', label: 'Y a-t-il des fissures ou des infiltrations à traiter avant ?', type: 'yesno', sub: 'Rejointoiement, traitement hydrofuge, réparation des supports avant enduit', addMin: 1000, addAvg: 3000, addMax: 7000 },
    ],
  },
  {
    id: 'amenagement_interieur', label: 'Aménagement intérieur', emoji: '🛋️', typeEquiv: 'renovation_partielle',
    keywords: ['aménagement intérieur', 'amenagement interieur', 'cloison', 'parquet', 'carrelage intérieur', 'peinture', 'plâtrerie'],
    questions: [
      { id: 'surface', label: 'Surface à aménager', type: 'number', unit: 'm²', placeholder: '50', sub: 'La surface détermine la quantité de matériaux et le nombre d\'heures de main d\'œuvre' },
      { id: 'type', label: 'Type de travaux principaux', type: 'choice', sub: 'La création de cloisons implique aussi plâtrerie, électricité et peinture',
        choices: ['Peinture + revêtements de sol', 'Cloisons + plâtrerie + finitions', 'Parquet / carrelage + plinthes', 'Aménagement complet (tout corps d\'état)'],
        choiceImpact: { 'Peinture + revêtements de sol': { addMin: 0, addAvg: 0, addMax: 0 }, 'Cloisons + plâtrerie + finitions': { addMin: 1500, addAvg: 4000, addMax: 8000 }, 'Parquet / carrelage + plinthes': { addMin: 500, addAvg: 1500, addMax: 3000 }, 'Aménagement complet (tout corps d\'état)': { addMin: 3000, addAvg: 8000, addMax: 18000 } } },
      { id: 'demolition', label: 'Y a-t-il des cloisons ou revêtements à démolir / déposer ?', type: 'yesno', sub: 'Dépose de carrelage, parquet, abattage de cloisons — génère des gravats à évacuer', addMin: 800, addAvg: 2000, addMax: 5000 },
      { id: 'faux_plafond', label: 'Faut-il créer ou refaire des faux-plafonds ?', type: 'yesno', sub: 'Placo, BA13 ou dalles — intègre souvent l\'éclairage encastré', addMin: 1000, addAvg: 2500, addMax: 5500 },
    ],
  },
  {
    id: 'terrassement', label: 'Terrassement / VRD', emoji: '🚜', typeEquiv: 'exterieur',
    keywords: ['terrassement', 'vrd', 'voirie', 'assainissement', 'drainage', 'fouille', 'nivellement', 'remblai'],
    questions: [
      { id: 'surface', label: 'Surface concernée', type: 'number', unit: 'm²', placeholder: '300', sub: 'La surface et la profondeur à décaisser déterminent le volume de terres' },
      { id: 'type', label: 'Nature des travaux', type: 'choice', sub: 'L\'assainissement est souvent obligatoire lors d\'une construction neuve',
        choices: ['Terrassement / décaissement', 'Assainissement (fosse + épandage)', 'Drainage + remblai', 'VRD complet (réseaux + voirie)'],
        choiceImpact: { 'Terrassement / décaissement': { addMin: 0, addAvg: 0, addMax: 0 }, 'Assainissement (fosse + épandage)': { addMin: 5000, addAvg: 12000, addMax: 20000 }, 'Drainage + remblai': { addMin: 1000, addAvg: 4000, addMax: 8000 }, 'VRD complet (réseaux + voirie)': { addMin: 3000, addAvg: 10000, addMax: 20000 } } },
      { id: 'acces_engin', label: 'L\'accès chantier est-il difficile pour les engins ?', type: 'yesno', sub: 'Accès étroit, terrain en pente raide — nécessite des engins spéciaux ou mini-pelles', addMin: 1000, addAvg: 3000, addMax: 7000 },
    ],
  },
];

/** Convertit un nom de lot en slug simple */
export function slugify(text: string): string {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ── Questions spécifiques par corps de métier ─────────────────────────────────
// 3 questions pertinentes à impact direct sur le prix, avec "Je ne sais pas encore"

export interface TradeQuestionDef {
  emoji: string;
  keywords: string[];   // mots-clés dans le nom du lot (après normalisation)
  questions: ElemQuestion[];
}

export const NSP = 'Je ne sais pas encore';
export const NSP_IMPACT = { addMin: 0, addAvg: 0, addMax: 0 };

export const TRADE_QUESTION_DEFS: TradeQuestionDef[] = [

  // ── Terrassier / Terrassement / VRD ─────────────────────────────────────────
  {
    emoji: '🚜',
    keywords: ['terrassier', 'terrassement', 'vrd', 'fouille', 'remblai', 'drainage'],
    questions: [
      { id: 'mini_pelle', label: 'Faut-il louer une mini-pelle pour les travaux ?',
        sub: 'Indispensable si la surface est > 50 m² ou si le sol est dur (argile, roche)',
        type: 'choice', choices: ['Oui', 'Non — travail manuel suffisant', NSP],
        choiceImpact: { 'Oui': { addMin: 600, addAvg: 1400, addMax: 2500 }, 'Non — travail manuel suffisant': NSP_IMPACT, [NSP]: NSP_IMPACT } },
      { id: 'evacuation', label: 'Y a-t-il des terres à évacuer hors du chantier ?',
        sub: 'Location de bennes + décharge agréée — coût variable selon le tonnage',
        type: 'yesno', addMin: 800, addAvg: 2000, addMax: 4500 },
      { id: 'acces_difficile', label: 'L\'accès au chantier est-il difficile pour les engins ?',
        sub: 'Chemin étroit, pas de camion possible = surcoût de manutention',
        type: 'yesno', addMin: 500, addAvg: 1500, addMax: 3500 },
    ],
  },

  // ── Paysagiste / Jardinier ───────────────────────────────────────────────────
  {
    emoji: '🌿',
    keywords: ['paysagiste', 'jardinier', 'espaces verts', 'plantations', 'gazon', 'pelouse'],
    questions: [
      { id: 'plantation', label: 'Prévoyez-vous la plantation d\'arbres ou d\'arbustes ?',
        sub: 'Arbres adultes, haies, massifs — le prix varie selon la taille et le nombre',
        type: 'choice', choices: ['Oui — quelques plants (< 10)', 'Oui — nombreux (10 plants et +)', 'Non', NSP],
        choiceImpact: {
          'Oui — quelques plants (< 10)': { addMin: 500, addAvg: 1500, addMax: 3500 },
          'Oui — nombreux (10 plants et +)': { addMin: 2000, addAvg: 5000, addMax: 10000 },
          'Non': NSP_IMPACT, [NSP]: NSP_IMPACT,
        } },
      { id: 'arrosage', label: 'Faut-il créer un point d\'eau ou un système d\'arrosage automatique ?',
        sub: 'Arrosage intégré au sol + programmateur — raccordement à l\'alimentation existante',
        type: 'yesno', addMin: 800, addAvg: 2500, addMax: 5500 },
      { id: 'engazonnement', label: 'Y a-t-il un engazonnement à réaliser (semis ou gazon en rouleau) ?',
        sub: 'Préparation du sol (fraisage, nivellement) + fourniture et pose du gazon',
        type: 'yesno', addMin: 500, addAvg: 1800, addMax: 4500 },
    ],
  },

  // ── Menuisier / Charpentier ──────────────────────────────────────────────────
  {
    emoji: '🪚',
    keywords: ['menuisier', 'charpentier', 'charpente', 'ossature', 'boiserie'],
    questions: [
      { id: 'type_bois', label: 'Quel type de bois est prévu pour la structure ou les ouvrages ?',
        sub: 'Le choix du bois est le 1er facteur de coût — le chêne coûte 3× le sapin',
        type: 'choice', choices: ['Sapin / épicéa (standard)', 'Douglas (mi-gamme, durable)', 'Chêne massif (haut de gamme)', NSP],
        choiceImpact: {
          'Sapin / épicéa (standard)': NSP_IMPACT,
          'Douglas (mi-gamme, durable)': { addMin: 1000, addAvg: 3000, addMax: 6000 },
          'Chêne massif (haut de gamme)': { addMin: 4000, addAvg: 9000, addMax: 18000 },
          [NSP]: NSP_IMPACT,
        } },
      { id: 'traitement', label: 'Le bois doit-il être traité (autoclave, lasure, peinture) ?',
        sub: 'Protection indispensable en extérieur contre l\'humidité et les insectes',
        type: 'yesno', addMin: 500, addAvg: 1500, addMax: 3500 },
      { id: 'poutres_apparentes', label: 'Y a-t-il des poutres apparentes à travailler ou à intégrer ?',
        sub: 'Dégraissage, rabotage, finition soignée — travail supplémentaire de qualité',
        type: 'yesno', addMin: 1500, addAvg: 4000, addMax: 8500 },
    ],
  },

  // ── Maçon / Maçonnerie ───────────────────────────────────────────────────────
  {
    emoji: '🧱',
    keywords: ['macon', 'maçon', 'maçonnerie', 'gros oeuvre', 'gros œuvre', 'beton', 'béton', 'parpaing'],
    questions: [
      { id: 'mur_porteur', label: 'Y a-t-il un mur porteur à démolir ou une ouverture à créer ?',
        sub: 'Démolition d\'un mur porteur = IPN + étude de structure obligatoire',
        type: 'yesno', addMin: 3000, addAvg: 7000, addMax: 16000 },
      { id: 'fondations', label: 'Des fondations sont-elles à créer (dalle, semelles) ?',
        sub: 'Indispensable pour une extension ou une construction neuve',
        type: 'yesno', addMin: 2500, addAvg: 6000, addMax: 12000 },
      { id: 'enduit', label: 'Les nouveaux murs doivent-ils être enduits ou coffragés ?',
        sub: 'Enduit de façade ou intérieur — finition nécessaire sur les parpaings bruts',
        type: 'yesno', addMin: 800, addAvg: 2500, addMax: 5500 },
    ],
  },

  // ── Électricien ──────────────────────────────────────────────────────────────
  {
    emoji: '⚡',
    keywords: ['electricien', 'électricien', 'electricite', 'électricité', 'tableau electrique', 'câblage', 'cablage', 'domotique', 'vmc'],
    questions: [
      { id: 'tableau', label: 'Le tableau électrique doit-il être remplacé ou mis aux normes ?',
        sub: 'Tableau NF C 15-100 obligatoire — coût variable selon la puissance souscrite',
        type: 'yesno', addMin: 1500, addAvg: 3500, addMax: 6000 },
      { id: 'exterieur', label: 'Y a-t-il des points électriques extérieurs à créer (éclairage, prises IP) ?',
        sub: 'Câblage sous gaine enterrée ou en façade + prises/spots étanches',
        type: 'yesno', addMin: 600, addAvg: 1800, addMax: 3500 },
      { id: 'domotique', label: 'Souhaitez-vous la domotique (prises connectées, alarme, volets motorisés) ?',
        sub: 'Box domotique + câblage spécifique + programmation — confort et sécurité',
        type: 'yesno', addMin: 1500, addAvg: 4000, addMax: 8000 },
    ],
  },

  // ── Plombier / Chauffagiste ──────────────────────────────────────────────────
  {
    emoji: '🔧',
    keywords: ['plombier', 'plomberie', 'chauffagiste', 'chauffage', 'chaudiere', 'chaudière', 'radiateur', 'sanitaire', 'pac'],
    questions: [
      { id: 'nouveau_raccordement', label: 'Y a-t-il un nouveau raccordement à l\'eau à créer ?',
        sub: 'Alimentation eau froide + évacuations — tranchée + raccordement réseau public',
        type: 'yesno', addMin: 1500, addAvg: 4000, addMax: 8000 },
      { id: 'chaudiere', label: 'Une chaudière, un chauffe-eau ou une pompe à chaleur est-il à installer ?',
        sub: 'Remplacement ou création — coût très variable selon la technologie choisie',
        type: 'choice', choices: ['Oui — chauffe-eau électrique', 'Oui — PAC ou chaudière', 'Non', NSP],
        choiceImpact: {
          'Oui — chauffe-eau électrique': { addMin: 500, addAvg: 1200, addMax: 2500 },
          'Oui — PAC ou chaudière': { addMin: 4000, addAvg: 9000, addMax: 18000 },
          'Non': NSP_IMPACT, [NSP]: NSP_IMPACT,
        } },
      { id: 'sanitaires', label: 'Des sanitaires complets (WC, douche, lavabo) sont-ils à installer ?',
        sub: 'Pose + raccordement + faïence éventuelle — prévoir aussi le carreleur',
        type: 'yesno', addMin: 1500, addAvg: 5000, addMax: 9000 },
    ],
  },

  // ── Carreleur ────────────────────────────────────────────────────────────────
  {
    emoji: '🪟',
    keywords: ['carreleur', 'carrelage', 'faience', 'faïence', 'dallage intérieur', 'pose de sol'],
    questions: [
      { id: 'surface', label: 'Quelle superficie de carrelage est prévue ?', type: 'number', unit: 'm²', placeholder: '40',
        sub: 'La surface est le principal facteur de coût (matière + pose au m²)' },
      { id: 'destination', label: 'Le carrelage est-il pour l\'intérieur ou l\'extérieur ?',
        sub: 'Le carrelage extérieur (antidérapant, gélifugé) coûte plus cher',
        type: 'choice', choices: ['Intérieur uniquement', 'Extérieur (terrasse, entrée)', 'Les deux', NSP],
        choiceImpact: {
          'Intérieur uniquement': NSP_IMPACT,
          'Extérieur (terrasse, entrée)': { addMin: 500, addAvg: 1500, addMax: 3500 },
          'Les deux': { addMin: 1000, addAvg: 2500, addMax: 5000 },
          [NSP]: NSP_IMPACT,
        } },
      { id: 'douche_italienne', label: 'Y a-t-il une douche à l\'italienne avec étanchéité (receveur à carreler) ?',
        sub: 'Complexe en chape spécifique + membrane d\'étanchéité — 2× plus cher que pose standard',
        type: 'yesno', addMin: 800, addAvg: 2500, addMax: 4500 },
    ],
  },

  // ── Peintre ──────────────────────────────────────────────────────────────────
  {
    emoji: '🎨',
    keywords: ['peintre', 'peinture', 'enduit', 'ravalement interieur', 'papier peint'],
    questions: [
      { id: 'surface', label: 'Quelle superficie est à peindre (murs + plafonds) ?', type: 'number', unit: 'm²', placeholder: '80',
        sub: 'Surface développée : compter largeur × hauteur de chaque mur' },
      { id: 'preparation', label: 'Y a-t-il des travaux de préparation importants (rebouchage, enduit lissé) ?',
        sub: 'Enduit de lissage sur supports dégradés = 30 à 50% du coût total peinture',
        type: 'yesno', addMin: 500, addAvg: 2000, addMax: 4500 },
      { id: 'plafonds', label: 'Les plafonds sont-ils à peindre ou à enduire également ?',
        sub: 'Plafond = travail en hauteur, plus contraignant — tarif majoré',
        type: 'yesno', addMin: 400, addAvg: 1500, addMax: 3000 },
    ],
  },

  // ── Serrurier / Métallerie ───────────────────────────────────────────────────
  {
    emoji: '🔩',
    keywords: ['serrurier', 'metallerie', 'métallerie', 'ferronnerie', 'serrurerie'],
    questions: [
      { id: 'type_ouvrage', label: 'Quel type d\'ouvrage métallique est prévu ?',
        sub: 'Le volume de travail varie fortement selon le type d\'ouvrage',
        type: 'choice', choices: ['Portail / clôture', 'Garde-corps / rambarde', 'Escalier métallique', 'Verrière / structure', NSP],
        choiceImpact: {
          'Portail / clôture': NSP_IMPACT,
          'Garde-corps / rambarde': { addMin: 500, addAvg: 2000, addMax: 5000 },
          'Escalier métallique': { addMin: 3000, addAvg: 8000, addMax: 18000 },
          'Verrière / structure': { addMin: 5000, addAvg: 15000, addMax: 35000 },
          [NSP]: NSP_IMPACT,
        } },
      { id: 'motorisation', label: 'Le portail ou le volet roulant sera-t-il motorisé ?',
        sub: 'Motorisation + télécommande + raccordement électrique',
        type: 'yesno', addMin: 1000, addAvg: 2500, addMax: 5000 },
      { id: 'thermolaquage', label: 'Faut-il un traitement de surface (thermolaquage, galvanisation) ?',
        sub: 'Protection longue durée contre la corrosion — obligatoire pour l\'extérieur',
        type: 'yesno', addMin: 400, addAvg: 1200, addMax: 2500 },
    ],
  },

  // ── Couvreur / Zingueur ──────────────────────────────────────────────────────
  {
    emoji: '🏠',
    keywords: ['couvreur', 'zingueur', 'gouttiere', 'gouttière', 'ardoise', 'tuile'],
    questions: [
      { id: 'type_couverture', label: 'Quel type de couverture est prévu ?',
        sub: 'L\'ardoise naturelle coûte 2 à 3× plus cher que la tuile béton',
        type: 'choice', choices: ['Tuile béton (standard)', 'Tuile terre cuite', 'Ardoise naturelle', 'Bac acier / zinc', NSP],
        choiceImpact: {
          'Tuile béton (standard)': NSP_IMPACT,
          'Tuile terre cuite': { addMin: 500, addAvg: 2000, addMax: 5000 },
          'Ardoise naturelle': { addMin: 3000, addAvg: 8000, addMax: 18000 },
          'Bac acier / zinc': { addMin: 1000, addAvg: 3000, addMax: 7000 },
          [NSP]: NSP_IMPACT,
        } },
      { id: 'charpente', label: 'La charpente doit-elle être réparée ou renforcée ?',
        sub: 'Remplacement de chevrons, pannes ou fermettes — souvent découvert en cours de chantier',
        type: 'yesno', addMin: 2000, addAvg: 5000, addMax: 12000 },
      { id: 'gouttières', label: 'Y a-t-il des gouttières et descentes d\'eau à remplacer ?',
        sub: 'Zinc, aluminium ou PVC — longueur totale de l\'habitation',
        type: 'yesno', addMin: 800, addAvg: 2000, addMax: 4500 },
    ],
  },

  // ── Isolant / Thermicien ─────────────────────────────────────────────────────
  {
    emoji: '🌡️',
    keywords: ['isolation', 'isolant', 'thermicien', 'combles', 'ite', 'iti', 'pare vapeur'],
    questions: [
      { id: 'type_isolation', label: 'Quel type d\'isolation est prévu ?',
        sub: 'ITE (extérieure) est 2× plus chère que l\'isolation par soufflage des combles',
        type: 'choice', choices: ['Combles soufflés (laine)', 'Isolation par l\'intérieur (ITI)', 'Isolation par l\'extérieur (ITE)', NSP],
        choiceImpact: {
          'Combles soufflés (laine)': NSP_IMPACT,
          'Isolation par l\'intérieur (ITI)': { addMin: 1000, addAvg: 4000, addMax: 9000 },
          'Isolation par l\'extérieur (ITE)': { addMin: 6000, addAvg: 15000, addMax: 30000 },
          [NSP]: NSP_IMPACT,
        } },
      { id: 'pare_vapeur', label: 'Un pare-vapeur ou frein vapeur est-il à poser ?',
        sub: 'Indispensable en zone humide ou sous chape béton — protection longue durée',
        type: 'yesno', addMin: 300, addAvg: 800, addMax: 2000 },
      { id: 'surface', label: 'Surface approximative à isoler', type: 'number', unit: 'm²', placeholder: '100',
        sub: 'La surface est la base du calcul au m² (pose + fourniture)' },
    ],
  },

  // ── Façadier / Ravaleur ──────────────────────────────────────────────────────
  {
    emoji: '🏛️',
    keywords: ['façadier', 'facadier', 'ravalement', 'bardage', 'enduit facade', 'crépi'],
    questions: [
      { id: 'type_finition', label: 'Quelle finition de façade est prévue ?',
        sub: 'Le bardage bois ou composite coûte plus cher mais dure plus longtemps',
        type: 'choice', choices: ['Enduit taloché (standard)', 'Enduit gratté / projeté', 'Bardage bois ou composite', 'Pierre reconstituée', NSP],
        choiceImpact: {
          'Enduit taloché (standard)': NSP_IMPACT,
          'Enduit gratté / projeté': { addMin: 0, addAvg: 500, addMax: 2000 },
          'Bardage bois ou composite': { addMin: 3000, addAvg: 8000, addMax: 18000 },
          'Pierre reconstituée': { addMin: 5000, addAvg: 12000, addMax: 25000 },
          [NSP]: NSP_IMPACT,
        } },
      { id: 'echafaudage', label: 'Un échafaudage de chantier est-il nécessaire ?',
        sub: 'Location d\'échafaudage pour R+1 et plus — obligatoire pour la sécurité',
        type: 'yesno', addMin: 800, addAvg: 2500, addMax: 6000 },
      { id: 'nettoyage', label: 'La façade existante nécessite-t-elle un nettoyage ou un décapage préalable ?',
        sub: 'Hydrogommage, sablage ou traitement hydrofuge avant application du nouveau revêtement',
        type: 'yesno', addMin: 500, addAvg: 1500, addMax: 3500 },
    ],
  },
];

/**
 * Retourne les questions spécifiques au corps de métier détecté,
 * ou des questions génériques en fallback.
 */
export function inferGenericElement(lotNom: string): ProjectElementDef {
  const lower = lotNom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Chercher dans le dictionnaire des métiers
  for (const trade of TRADE_QUESTION_DEFS) {
    const keywordsNorm = trade.keywords.map(k =>
      k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    );
    if (keywordsNorm.some(kw => lower.includes(kw))) {
      return {
        id: slugify(lotNom),
        label: lotNom,
        emoji: trade.emoji,
        keywords: [lower],
        typeEquiv: 'exterieur',
        questions: trade.questions,
      };
    }
  }

  // Fallback générique (corps de métier non reconnu)
  return {
    id: slugify(lotNom),
    label: lotNom,
    emoji: '🔨',
    keywords: [lower],
    typeEquiv: 'exterieur',
    questions: [
      { id: 'complexite', label: 'Quel est le niveau de complexité des travaux ?',
        sub: 'Un chantier simple et accessible coûte moins cher qu\'un travail sur mesure',
        type: 'choice', choices: ['Simple (accès facile, standard)', 'Moyen (quelques contraintes)', 'Complexe (sur mesure ou accès difficile)', NSP],
        choiceImpact: {
          'Simple (accès facile, standard)': NSP_IMPACT,
          'Moyen (quelques contraintes)': { addMin: 500, addAvg: 1500, addMax: 3000 },
          'Complexe (sur mesure ou accès difficile)': { addMin: 2000, addAvg: 5000, addMax: 10000 },
          [NSP]: NSP_IMPACT,
        } },
      { id: 'acces', label: 'L\'accès au chantier est-il difficile (intérieur, étage, espace réduit) ?',
        sub: 'Contrainte d\'accès = surcoût de main d\'œuvre et de manutention',
        type: 'yesno', addMin: 400, addAvg: 1200, addMax: 2500 },
      { id: 'urgence', label: 'Les travaux sont-ils urgents (délai < 1 mois) ?',
        sub: 'Une intervention urgente peut majorer le tarif de 15 à 30%',
        type: 'yesno', addMin: 300, addAvg: 1000, addMax: 2000 },
    ],
  };
}

/**
 * Construit la liste des éléments détectables en utilisant les lots IA comme source primaire.
 * Pour chaque lot, cherche une définition correspondante dans ELEMENT_DEFS ;
 * si aucune correspondance, crée un élément générique avec des questions pertinentes.
 * Complète ensuite avec une analyse textuelle du prompt.
 */
export function buildElementsFromLots(
  lots: { nom: string }[],
  promptText: string,
): ProjectElementDef[] {
  const result: ProjectElementDef[] = [];
  const addedIds = new Set<string>();

  // Priorité 1 : utiliser les lots déjà identifiés par l'IA
  for (const lot of lots) {
    const lower = lot.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let matched = false;

    for (const def of ELEMENT_DEFS) {
      if (!addedIds.has(def.id)) {
        const defKeywordsNorm = def.keywords.map(k =>
          k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
        );
        if (defKeywordsNorm.some(kw => lower.includes(kw))) {
          result.push(def);
          addedIds.add(def.id);
          matched = true;
          break;
        }
      }
    }

    // Lot non couvert par les définitions → créer un élément générique
    if (!matched) {
      const generic = inferGenericElement(lot.nom);
      if (!addedIds.has(generic.id)) {
        result.push(generic);
        addedIds.add(generic.id);
      }
    }
  }

  // Priorité 2 : compléter avec le texte du prompt (pour les éléments hors lots)
  const lowerPrompt = promptText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const def of ELEMENT_DEFS) {
    if (!addedIds.has(def.id)) {
      const defKeywordsNorm = def.keywords.map(k =>
        k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
      );
      if (defKeywordsNorm.some(kw => lowerPrompt.includes(kw))) {
        result.push(def);
        addedIds.add(def.id);
      }
    }
  }

  return result;
}

/** Ancienne fonction (utilisée quand resultLots est vide) */
export function detectElements(text: string): ProjectElementDef[] {
  const lower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const result: ProjectElementDef[] = [];
  for (const def of ELEMENT_DEFS) {
    const defKeywordsNorm = def.keywords.map(k =>
      k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    );
    if (defKeywordsNorm.some(kw => lower.includes(kw))) {
      result.push(def);
    }
  }
  return result;
}

export interface BreakdownItem {
  id: string;
  label: string;
  emoji: string;
  min: number;
  max: number;
  reliability: 'haute' | 'moyenne' | 'faible';
}

export interface AffinageAnswers {
  confirmedElements: string[];
  elementAnswers: Record<string, Record<string, string | number>>;
}

export const INITIAL_ANSWERS: AffinageAnswers = {
  confirmedElements: [],
  elementAnswers: {},
};

export function computeRefinedRange(
  baseMin: number, baseMax: number, a: AffinageAnswers,
  detectedEls?: ProjectElementDef[],
  lots?: { nom: string; budget_min_ht?: number | null; budget_max_ht?: number | null }[],
): { min: number; max: number; breakdown: BreakdownItem[] } {
  if (baseMin === 0 && baseMax === 0) return { min: 0, max: 0, breakdown: [] };

  const confirmed = a.confirmedElements
    .map(id => detectedEls?.find(e => e.id === id))
    .filter((d): d is ProjectElementDef => !!d);

  if (confirmed.length === 0) return { min: baseMin, max: baseMax, breakdown: [] };

  // Match each element to its lot budget
  function findLot(elem: ProjectElementDef) {
    return lots?.find(l =>
      l.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(
        elem.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 6),
      ) ||
      elem.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(
        l.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 6),
      )
    );
  }

  // Split base budget proportionally across elements using lot budgets
  const matchedLots = confirmed.map(e => findLot(e));
  const totalMatchedMin = matchedLots.reduce((s, l) => s + (l?.budget_min_ht ?? 0), 0);
  const totalMatchedMax = matchedLots.reduce((s, l) => s + (l?.budget_max_ht ?? 0), 0);
  const unmatchedCount  = matchedLots.filter(l => !l || !(l.budget_min_ht ?? 0)).length;
  const remainingMin    = Math.max(0, baseMin - totalMatchedMin);
  const remainingMax    = Math.max(0, baseMax - totalMatchedMax);
  const splitMin        = unmatchedCount > 0 ? remainingMin / unmatchedCount : 0;
  const splitMax        = unmatchedCount > 0 ? remainingMax / unmatchedCount : 0;

  // Compute per-element impacts from question answers
  const breakdown: BreakdownItem[] = [];
  let addMin = 0; let addMax = 0;

  for (let i = 0; i < confirmed.length; i++) {
    const def = confirmed[i];
    const lot = matchedLots[i];
    const hasLotBudget = (lot?.budget_min_ht ?? 0) > 0;
    const lotMin = hasLotBudget ? (lot?.budget_min_ht ?? 0) : splitMin;
    const lotMax = hasLotBudget ? (lot?.budget_max_ht ?? 0) : splitMax;

    let elemAddMin = 0; let elemAddMax = 0;
    let hasAnswers = false;
    if (def.isCustom) {
      elemAddMin = def.customBudgetMin ?? 0;
      elemAddMax = def.customBudgetMax ?? 0;
      hasAnswers = true;
    } else {
      const ea = a.elementAnswers[def.id] ?? {};
      for (const q of def.questions) {
        if (q.type === 'yesno' && ea[q.id] === 'oui') {
          elemAddMin += q.addMin ?? 0; elemAddMax += q.addMax ?? 0;
          hasAnswers = true;
        } else if (q.type === 'choice' && q.choiceImpact) {
          const impact = q.choiceImpact[ea[q.id] as string];
          if (impact) { elemAddMin += impact.addMin; elemAddMax += impact.addMax; hasAnswers = true; }
        }
      }
    }

    const elemMin = def.isCustom ? elemAddMin : (lotMin + elemAddMin);
    const elemMax = def.isCustom ? elemAddMax : (lotMax + elemAddMax);
    addMin += def.isCustom ? elemAddMin : elemAddMin;
    addMax += def.isCustom ? elemAddMax : elemAddMax;

    const reliability: BreakdownItem['reliability'] =
      def.isCustom ? 'haute' :
      (hasLotBudget && hasAnswers) ? 'haute' :
      (hasLotBudget || hasAnswers)  ? 'moyenne' :
      'faible';

    breakdown.push({
      id: def.id, label: def.label, emoji: def.emoji,
      min: Math.round(elemMin / 100) * 100,
      max: Math.round(elemMax / 100) * 100,
      reliability,
    });
  }

  const finalMin = Math.round((baseMin + addMin) / 100) * 100;
  const finalMax = Math.round((baseMax + addMax) / 100) * 100;

  // ── Normalisation : garantit que somme des postes = total affiché ──────────
  if (breakdown.length > 0) {
    const sumMin = breakdown.reduce((s, b) => s + b.min, 0);
    const sumMax = breakdown.reduce((s, b) => s + b.max, 0);

    if (sumMin > 0 && sumMax > 0) {
      let cumMin = 0; let cumMax = 0;
      for (let i = 0; i < breakdown.length; i++) {
        if (i < breakdown.length - 1) {
          breakdown[i].min = Math.round((breakdown[i].min / sumMin) * finalMin / 100) * 100;
          breakdown[i].max = Math.round((breakdown[i].max / sumMax) * finalMax / 100) * 100;
          cumMin += breakdown[i].min;
          cumMax += breakdown[i].max;
        } else {
          // Dernier poste absorbe le reste (arrondi)
          breakdown[i].min = Math.max(0, finalMin - cumMin);
          breakdown[i].max = Math.max(0, finalMax - cumMax);
        }
      }
    }
  }

  return { min: finalMin, max: finalMax, breakdown };
}

export function computeScore(a: AffinageAnswers, detectedEls?: ProjectElementDef[]): number {
  if (a.confirmedElements.length === 0) return 0;
  let answered = 0; let total = 0;
  for (const elemId of a.confirmedElements) {
    const def = detectedEls?.find(e => e.id === elemId);
    if (!def || def.isCustom) continue; // les éléments perso sont déjà "répondus"
    total += def.questions.length;
    const ea = a.elementAnswers[elemId] ?? {};
    for (const q of def.questions) {
      if (ea[q.id] !== undefined && ea[q.id] !== '') answered++;
    }
  }
  if (total === 0) return 1;
  const ratio = answered / total;
  if (ratio >= 0.8) return 5; if (ratio >= 0.5) return 4; if (ratio >= 0.3) return 3; return 2;
}
