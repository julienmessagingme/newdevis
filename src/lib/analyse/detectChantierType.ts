/**
 * Detection heuristique du type de chantier depuis les lignes de travaux d'un devis.
 *
 * Utilisation : PourAllerPlusLoin (post-verdict) pour personnaliser les liens vers
 * l'Observatoire (fourchette prix chantier detecte) + Comparateur (preset).
 *
 * Approche : scoring par mots-cles sur les descriptions extraites. Le slug qui
 * accumule le plus de matches gagne. Si tous les scores sont trop faibles ou
 * ex aequo, on renvoie null -> PourAllerPlusLoin retombe sur ses liens generiques.
 *
 * Slugs Observatoire cibles (aligne avec src/data/observatoire/chantiers/*.json) :
 * salle-de-bain, cuisine, isolation, chauffage, toiture, carrelage, peinture,
 * fenetres, electricite, plomberie, facade, cloisons, cloture, garage, piscine, terrasse.
 */

interface Travail {
  description?: string;
  categorie?: string;
}

/**
 * Mapping mots-cles -> slug Observatoire.
 * Ordre : plus specifique en premier (evite qu'un mot-cle generique de 'chauffage'
 * l'emporte sur un 'salle de bain' quand il y a un chauffe-eau).
 */
const KEYWORDS: Array<{ slug: string; patterns: RegExp[] }> = [
  {
    slug: 'salle-de-bain',
    patterns: [
      /\bsalle\s+de\s+bain\b/i,
      /\bs\.?d\.?b\.?\b/i,
      /\bdouche\b/i,
      /\bbaignoire\b/i,
      /\bvasque\b/i,
      /\brobinet(?:terie)?\b/i,
      /\bmitigeur\b/i,
      /\bWC\b/,
      /\bfaience\s+murale\b/i,
      /\breceveur\b/i,
      /\bparoi\s+de\s+douche\b/i,
    ],
  },
  {
    slug: 'cuisine',
    patterns: [
      /\bcuisine\b/i,
      /\bplan\s+de\s+travail\b/i,
      /\bhotte\b/i,
      /\bmeuble\s+haut\b/i,
      /\belectrom[eé]nager\b/i,
      /\b[eé]vier\b/i,
      /\bcredence\b/i,
    ],
  },
  {
    slug: 'isolation',
    patterns: [
      /\bisolation\b/i,
      /\bcombles?\b/i,
      /\blaine\s+de\s+verre\b/i,
      /\blaine\s+de\s+roche\b/i,
      /\bouate\s+de\s+cellulose\b/i,
      /\bpolystyrene\b/i,
      /\bITE\b/,
      /\bITI\b/,
      /\bpare-?vapeur\b/i,
    ],
  },
  {
    slug: 'chauffage',
    patterns: [
      /\bchauffage\b/i,
      /\bchaudi[eè]re\b/i,
      /\bpompe\s+[aà]\s+chaleur\b/i,
      /\bPAC\b/,
      /\bpo[eê]le\b/i,
      /\bradiateur\b/i,
      /\bplancher\s+chauffant\b/i,
      /\bchauffe-?eau\b/i,
      /\bthermostat\b/i,
    ],
  },
  {
    slug: 'toiture',
    patterns: [
      /\btoiture\b/i,
      /\bcouverture\b/i,
      /\btuiles?\b/i,
      /\bardoises?\b/i,
      /\bzinguerie\b/i,
      /\bcharpente\b/i,
      /\bfaitage\b/i,
      /\bgoutti[eè]re\b/i,
      /\bvelux\b/i,
      /\bcheneau\b/i,
    ],
  },
  {
    slug: 'carrelage',
    patterns: [
      /\bcarrelage\b/i,
      /\bfa[iï]ence\b/i,
      /\bgres\s+c[eé]rame\b/i,
      /\bpose\s+carrelage\b/i,
      /\bjoint\s+carrelage\b/i,
      /\bd[eé]pose\s+carrelage\b/i,
      /\bragr[eé]age\b/i,
      /\bchape\b/i,
    ],
  },
  {
    slug: 'peinture',
    patterns: [
      /\bpeinture\b/i,
      /\bpapier\s+peint\b/i,
      /\bsous-?couche\b/i,
      /\bpr[eé]paration\s+mur\b/i,
      /\benduit\s+de\s+lissage\b/i,
      /\brebouchage\b/i,
    ],
  },
  {
    slug: 'fenetres',
    patterns: [
      /\bfen[eê]tres?\b/i,
      /\bmenuiserie\s+ext[eé]rieure\b/i,
      /\bdouble\s+vitrage\b/i,
      /\btriple\s+vitrage\b/i,
      /\bPVC\b/,
      /\bvolets?\s+roulants?\b/i,
      /\bporte-?fen[eê]tre\b/i,
      /\bbaie\s+vitr[eé]e\b/i,
    ],
  },
  {
    slug: 'electricite',
    patterns: [
      /\b[eé]lectricit[eé]\b/i,
      /\btableau\s+[eé]lectrique\b/i,
      /\bprise\s+[eé]lectrique\b/i,
      /\binterrupteur\b/i,
      /\bdisjoncteur\b/i,
      /\bluminaire\b/i,
      /\bnorme\s+NF\s*C\s*15/i,
      /\bmise\s+aux?\s+normes?\b/i,
      /\bgaine\s+ICTA\b/i,
    ],
  },
  {
    slug: 'plomberie',
    patterns: [
      /\bplomberie\b/i,
      /\bsanitaire\b/i,
      /\btuyau\s+PER\b/i,
      /\bcuivre\b/i,
      /\bevacuation\b/i,
      /\bcompteur\s+eau\b/i,
    ],
  },
  {
    slug: 'facade',
    patterns: [
      /\bfa[cç]ade\b/i,
      /\bravalement\b/i,
      /\benduit\s+ext[eé]rieur\b/i,
      /\bcr[eé]pi\b/i,
      /\bbardage\b/i,
      /\bnettoyage\s+fa[cç]ade\b/i,
    ],
  },
  {
    slug: 'cloisons',
    patterns: [
      /\bcloisons?\b/i,
      /\bplaco\b/i,
      /\bplacoplatre\b/i,
      /\bplaques?\s+de\s+platre\b/i,
      /\bBA\s?13\b/,
      /\brail\s+placo\b/i,
      /\bfaux\s+plafond\b/i,
    ],
  },
  {
    slug: 'cloture',
    patterns: [
      /\bcl[oô]ture\b/i,
      /\bportail\b/i,
      /\bgrillage\b/i,
      /\bbarri[eè]re\b/i,
      /\bportillon\b/i,
      /\bpanneaux?\s+de\s+cl[oô]ture\b/i,
    ],
  },
  {
    slug: 'garage',
    patterns: [
      /\bgarage\b/i,
      /\bporte\s+de\s+garage\b/i,
      /\bcarport\b/i,
    ],
  },
  {
    slug: 'piscine',
    patterns: [
      /\bpiscine\b/i,
      /\bliner\b/i,
      /\bfiltration\b/i,
      /\bmargelles?\b/i,
      /\bpompe\s+piscine\b/i,
      /\blocal\s+technique\b/i,
    ],
  },
  {
    slug: 'terrasse',
    patterns: [
      /\bterrasses?\b/i,
      /\bdeck\b/i,
      /\blames?\s+bois\b/i,
      /\bcompositer?\b/i,
      /\bdalle\s+ext[eé]rieure\b/i,
      /\bpergolas?\b/i,
    ],
  },
];

/**
 * Detecte le slug Observatoire le plus probable a partir des lignes de travaux.
 * Retourne null si aucun signal net (evite d'induire l'utilisateur en erreur).
 */
export function detectChantierSlug(travaux: Travail[] | null | undefined): string | null {
  if (!Array.isArray(travaux) || travaux.length === 0) return null;

  // Concatene toutes les descriptions + categories en un seul texte pour scoring.
  const text = travaux
    .flatMap((t) => [t.description ?? '', t.categorie ?? ''])
    .filter(Boolean)
    .join(' | ')
    .toLowerCase();

  if (!text.trim()) return null;

  const scores = new Map<string, number>();
  for (const { slug, patterns } of KEYWORDS) {
    let s = 0;
    for (const p of patterns) {
      const matches = text.match(new RegExp(p.source, p.flags.includes('g') ? p.flags : p.flags + 'g'));
      s += matches?.length ?? 0;
    }
    if (s > 0) scores.set(slug, s);
  }

  if (scores.size === 0) return null;

  // Trie desc, garde le winner s'il est nettement au-dessus (>= 2 matches et
  // au moins 2x le second — evite les detections floues sur multi-chantiers).
  const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
  const [topSlug, topScore] = sorted[0];
  if (topScore < 2) return null;
  const secondScore = sorted[1]?.[1] ?? 0;
  if (secondScore > 0 && topScore < secondScore * 2) return null;

  return topSlug;
}
