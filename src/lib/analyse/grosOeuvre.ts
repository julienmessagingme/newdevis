/**
 * src/lib/analyse/grosOeuvre.ts
 *
 * Ce devis touche-t-il au GROS ŒUVRE, au sens qui rend l'assurance
 * dommages-ouvrage obligatoire ?
 *
 * Définition retenue, celle de service-public.fr : « travaux de construction,
 * d'extension ou de rénovation du gros œuvre (ossature du bâtiment) ». Le
 * critère légal (art. L242-1) est que les travaux soient susceptibles de
 * compromettre la solidité de l'ouvrage ou de le rendre impropre à sa
 * destination.
 *
 * Pourquoi ce module existe (retour Johan, 2026-09-03, devis SOLTANI) : sur un
 * devis de poêle à bois à 5 500 €, le conseil DO s'est déclenché sur la mention
 * **« IPE= 0,5 »** dans les caractéristiques techniques du poêle — l'Indice de
 * Performance Environnementale, lu comme une poutre IPE en acier. Le devis ne
 * comportait qu'un percement de mur pour la grille d'aération obligatoire :
 * personne ne souscrit une dommages-ouvrage pour ça.
 *
 * Règle de conduite : **un conseil intempestif est contre-productif.** Sur ce
 * levier, rater un cas limite coûte moins cher que d'en inventer un — un
 * conseil d'assurance hors sujet fait douter de tout le reste de l'analyse.
 */

/**
 * Actions réellement structurelles. Chaque motif exige un CONTEXTE, jamais un
 * simple sigle : « IPE » seul est un piège (indice environnemental, référence
 * produit), « poutre IPE 180 » n'en est pas un.
 */
const STRUCTUREL_RE = new RegExp(
  [
    // Créations d'ouvrage
    "extension", "agrandissement", "sur[ée]l[ée]vation", "construction\\s+neuve",
    "v[ée]randa\\s+ma[çc]onn",
    // Ossature bois porteuse (la maison ossature bois). « ossature métallique »
    // est volontairement ABSENT : dans 99 % des devis c'est le rail d'une
    // cloison en placo, pas une charpente.
    "ossature\\s+bois",
    // Fondations et planchers porteurs
    "fondation", "semelle\\s+filante", "longrine", "radier", "dalle\\s+b[ée]ton",
    "terrassement\\s+(?:de\\s+)?fondation",
    // Éléments porteurs : le mot « porteur » ou une section de profilé chiffrée
    "mur\\s+porteur", "mur\\s+de\\s+refend",
    "poutre\\s+(?:m[ée]tallique|acier|porteuse|b[ée]ton)",
    "\\b(?:ipn|hea|heb|ipe)\\s*\\d{2,3}\\b",
    "linteau",
    // Charpente et toiture : refaites ou déposées, pas entretenues
    "(?:r[ée]fection|remplacement|d[ée]pose|cr[ée]ation|reprise)\\s+(?:compl[èe]te\\s+)?(?:de\\s+)?(?:la\\s+)?(?:charpente|toiture|couverture)",
  ].join("|"),
  "i",
);

/**
 * Travaux qui ne touchent pas à la structure, même s'ils percent un mur.
 * Le percement d'une façade pour une grille d'aération, une ventouse de
 * chaudière ou un tubage de poêle n'engage pas la solidité de l'ouvrage.
 */
const HORS_PERIMETRE_RE =
  /\b(traitement|xylo|insecticide|fongicide|curatif|pr[ée]ventif|nettoyage|d[ée]moussage|peinture|lasure|ravalement|percement|carottage|ventouse|grille|a[ée]ration|tubage|conduit|placo|plaque\s+de\s+pl[âa]tre|doublage|cloison)\b/i;

export interface LigneTravaux {
  description?: string | null;
  libelle?: string | null;
}

function texteLigne(l: LigneTravaux): string {
  return `${l?.description ?? ""} ${l?.libelle ?? ""}`;
}

/** Une ligne engage-t-elle la structure ? */
export function ligneEstGrosOeuvre(texte: string): boolean {
  if (!texte) return false;
  return STRUCTUREL_RE.test(texte) && !HORS_PERIMETRE_RE.test(texte);
}

/**
 * @returns la ligne qui déclenche le conseil DO, ou `null` si aucune. On rend
 *   le libellé pour pouvoir l'expliquer au client : un conseil sans son motif
 *   nommé n'est pas un conseil.
 */
export function motifGrosOeuvre(
  lignes: LigneTravaux[],
  contexte = "",
): string | null {
  const liste = Array.isArray(lignes) ? lignes : [];
  const hit = liste.map(texteLigne).find(ligneEstGrosOeuvre);
  if (hit) {
    const propre = hit.replace(/\s+/g, " ").trim();
    return propre.length > 90 ? `${propre.slice(0, 87).trimEnd()}…` : propre;
  }
  // Le contexte (type de travaux, résumé) ne sert que de filet : il ne nomme
  // aucune ligne, donc il ne peut pas justifier le conseil à lui seul.
  return ligneEstGrosOeuvre(contexte) ? null : null;
}

/** Le devis relève-t-il du gros œuvre ? */
export function estGrosOeuvre(lignes: LigneTravaux[], contexte = ""): boolean {
  const liste = Array.isArray(lignes) ? lignes : [];
  return liste.map(texteLigne).some(ligneEstGrosOeuvre) || ligneEstGrosOeuvre(contexte);
}
