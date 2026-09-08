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
 * 2026-09-08 — 4ᵉ FAUX POSITIF, ET LA RÈGLE CHANGE DE NATURE.
 *
 * Le conseil s'est déclenché sur un devis de CLIMATISATION, à cause de
 * **« Extension de garantie 5 ans »**. Le mot `extension` suffisait.
 *
 * Les quatre cas partagent la même faille : **un NOM structurel isolé**.
 *   · « IPE = 0,5 » — l'indice environnemental d'un poêle ;
 *   · « Faux plafonds sous dalle béton » — l'élément cité comme support ;
 *   · « Extension de garantie » — un mot de contrat, pas de bâtiment.
 *
 * Un nom seul ne dira jamais si on TOUCHE à l'ouvrage. La règle exige donc
 * désormais **une ACTION portée sur un ÉLÉMENT PORTEUR, dans la même ligne**.
 * Seule une courte liste de termes qui n'existent que dans le gros œuvre se
 * suffit à elle-même.
 *
 * Arbitrage assumé, et c'est celui de Johan : « resserre vraiment, sinon on
 * sera obligé de l'arrêter ». On ratera des cas limites — un devis qui écrit
 * « Fondations : 12 m³ » sans verbe. C'est le prix à payer pour ne plus
 * proposer une assurance dommages-ouvrage à quelqu'un qui fait poser une
 * climatisation.
 */

/** Ce sur quoi on travaille : les éléments qui portent le bâtiment. */
const OBJET_PORTEUR = [
  "extension",
  "fondations?", "dalle\\s+b[ée]ton", "plancher\\s+porteur", "plancher\\s+b[ée]ton",
  "charpente", "toiture", "couverture",
  "mur\\s+porteur", "mur\\s+de\\s+refend", "structure\\s+porteuse", "ouvrage",
].join("|");

/**
 * Ce qu'on lui fait. Sans action, aucun conseil.
 *
 * « surélévation » et « agrandissement » sont ici et non parmi les objets :
 * ce sont des noms d'ACTION. « Surélévation de la toiture » se lit action +
 * objet, et c'est bien du gros œuvre.
 */
const ACTION = [
  "cr[ée]ation", "cr[ée]er", "construction", "construire", "r[ée]alisation",
  "coulage", "ferraillage", "ouverture", "percement", "d[ée]molition", "d[ée]molir",
  "abattre", "d[ée]pose", "reprise", "renfort", "renforcement", "[ée]taiement",
  "r[ée]fection", "remplacement", "terrassement",
  "sur[ée]l[ée]vation", "sur[ée]lever", "agrandissement", "agrandir",
].join("|");

/**
 * Termes qui n'existent QUE dans le gros œuvre : les rencontrer suffit.
 * `ossature métallique` est volontairement absent — dans 99 % des devis c'est
 * le rail d'une cloison en placo. `IPE` exige une section chiffrée : le sigle
 * seul est l'indice de performance environnementale d'un appareil.
 */
const AUTOSUFFISANT_RE = new RegExp(
  [
    "mur\\s+porteur", "mur\\s+de\\s+refend", "longrine", "radier",
    // « Semelle et fondation sur 11 M, béton armé ferraillé » : de vraies
    // fondations, sans verbe. Retrouvé dans la mesure du 08/09 — c'était le
    // seul regret parmi les cas que le resserrement faisait perdre.
    "semelle\\s+(?:filante|et\\s+fondation|de\\s+fondation)",
    "linteau", "poutre\\s+(?:m[ée]tallique|acier|porteuse|b[ée]ton)",
    "\\b(?:ipn|hea|heb|ipe)\\s*\\d{2,3}\\b",
    // « ossature bois » désigne une paroi porteuse ; c'est « ossature
    // métallique » qui est le rail de cloison, et elle reste exclue.
    "ossature\\s+bois", "construction\\s+neuve", "v[ée]randa\\s+ma[çc]onn",
    // Une extension DE BÂTIMENT : le mot doit être suivi de près par ce qu'on
    // étend, ou par une surface. « Extension de 20 m² accolée à la maison »
    // passe ; « Extension de garantie 5 ans » n'a ni l'un ni l'autre — et est
    // de toute façon déjà écartée par FAUX_AMIS_RE.
    "extension\\b[^.;]{0,40}?(?:maison|habitation|b[âa]timent|villa|logement|pavillon|\\d+\\s*m[²2])",
  ].join("|"),
  "i",
);

/**
 * Une action ET un objet porteur — l'objet devant suivre l'action DE PRÈS.
 *
 * ⚠️ La fenêtre est le cœur de la règle, et elle a été mesurée. À 40
 * caractères, « Démolition **carrelage** scellé au sol **sur dalle béton** »
 * passait : le voisinage confondait proximité et complément d'objet. Ce qu'on
 * démolit, c'est le carrelage. À 25, la phrase est écartée (28 caractères
 * séparent les deux), tandis que « Réfection complète de la charpente » (15)
 * et « Dépose de l'ancienne couverture » (14) passent toujours.
 *
 * Élargir cette fenêtre, c'est réintroduire des faux positifs. Le vérifier
 * sur le corpus avant d'y toucher (`scripts/` — mesure du 08/09 : 429 devis).
 */
const ACTION_SUR_PORTEUR_RE = new RegExp(
  `(?:${ACTION})[^.;]{0,25}?(?:${OBJET_PORTEUR})|(?:${OBJET_PORTEUR})[^.;]{0,15}?(?:${ACTION})`,
  "i",
);

/**
 * Les emplois NON bâtimentaires des mots porteurs. Ils sont écartés d'entrée,
 * avant toute autre règle : « extension de garantie » sur un devis de
 * climatisation est le 4ᵉ faux positif de ce levier.
 */
const FAUX_AMIS_RE =
  /extension\s+de\s+(?:garantie|la\s+garantie|ligne|c[âa]ble|r[ée]seau|tableau|point|prise|chauffage)/i;

/**
 * Travaux qui ne touchent pas à la structure, même s'ils percent un mur.
 * Le percement d'une façade pour une grille d'aération, une ventouse de
 * chaudière ou un tubage de poêle n'engage pas la solidité de l'ouvrage.
 */
const HORS_PERIMETRE_RE =
  /\b(traitement|xylo|insecticide|fongicide|curatif|pr[ée]ventif|nettoyage|d[ée]moussage|peinture|lasure|ravalement|percement|carottage|ventouse|grille|a[ée]ration|tubage|conduit|placo|plaque\s+de\s+pl[âa]tre|doublage|cloison|faux[-\s]?plafonds?|plafonds?\s+suspendus?|sous[-\s]?toiture)\b/i;

/**
 * 2026-09-07 (3e faux positif, cas « Faux plafonds Type F530 Sous Dalle Béton »)
 * — UN ÉLÉMENT STRUCTUREL CITÉ COMME SUPPORT N'EST PAS UN TRAVAIL DESSUS.
 *
 * Les deux faux positifs précédents (l'« IPE » d'un poêle, ce faux plafond)
 * partagent le même schéma : le mot structurel décrit **où** la prestation se
 * fixe, pas ce qu'on touche. « Sous dalle béton », « contre le mur porteur »,
 * « sur la charpente existante » situent l'ouvrage — ils n'y touchent pas.
 *
 * On neutralise donc la mention structurelle quand elle est introduite par une
 * préposition de localisation, sauf si une ACTION est explicitement portée sur
 * elle (« reprise sur mur porteur », « ouverture dans le mur porteur »).
 */
const SUPPORT_RE =
  /\b(sous|sur|contre|le\s+long\s+de|au\s+droit\s+de|fix[ée]s?\s+(?:sur|sous|à)|suspendus?\s+(?:sous|à))\s+(?:la\s+|le\s+|les\s+|l['’])?(dalle|plancher|charpente|poutre|mur\s+porteur|structure|solive)/i;

/** Une action portée sur l'élément, qui annule la lecture « support ». */
const ACTION_SUR_STRUCTURE_RE =
  /\b(reprise|ouverture|percer\s+(?:un\s+)?mur\s+porteur|d[ée]pose|d[ée]molition|renfort|renforcement|cr[ée]ation|remplacement|r[ée]fection|abattre|d[ée]molir)\b/i;

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

  // 1. Les emplois non bâtimentaires sortent d'abord : « extension de garantie »
  //    ne doit même pas être examiné.
  if (FAUX_AMIS_RE.test(texte)) return false;

  // 2. Un terme qui n'existe que dans le gros œuvre se suffit à lui-même…
  //    …sauf s'il n'est là que pour situer l'ouvrage (« sous dalle béton »).
  const autosuffisant = AUTOSUFFISANT_RE.test(texte);
  //    …ou une action explicite portée sur un élément porteur.
  const actionSurPorteur = ACTION_SUR_PORTEUR_RE.test(texte);
  if (!autosuffisant && !actionSurPorteur) return false;

  // 3. Entretien, finitions, percements de confort : hors périmètre légal.
  if (HORS_PERIMETRE_RE.test(texte)) return false;

  // 4. Élément structurel cité comme simple support, sans action portée dessus.
  if (SUPPORT_RE.test(texte) && !ACTION_SUR_STRUCTURE_RE.test(texte)) return false;

  return true;
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
