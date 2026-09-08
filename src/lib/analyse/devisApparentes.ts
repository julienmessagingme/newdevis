/**
 * src/lib/analyse/devisApparentes.ts
 *
 * 2026-09-08 (demande Johan) — DEUX DEVIS POUR LE MÊME PROJET, C'EST UNE
 * COMPARAISON QUI S'IGNORE.
 *
 * Constat : la même personne a déposé deux devis de climatisation de deux
 * prestataires différents, à quelques minutes d'intervalle. L'outil les a
 * comptés comme deux analyses sans lien, alors que le comparateur existe et
 * répond exactement à sa question — « lequel je prends ? ». Il exigeait
 * jusqu'ici deux dépôts séparés puis une navigation délibérée : personne ne le
 * trouve.
 *
 * ⚠️ POURQUOI PAS UNE DÉTECTION PAR MÉTIER. Le premier réflexe — « même métier
 * = même projet » — se trompe : deux devis de plomberie peuvent porter sur deux
 * chantiers sans rapport, et `work_type` / `domain` sont vides ou constants sur
 * le stock réel (vérifié : `domain = "travaux"` pour tout le monde). On compare
 * donc ce que les devis DISENT : le recouvrement de leur vocabulaire de
 * travaux. Deux devis de clim partagent « multi-split », « unité intérieure »,
 * « frigorifique » ; un devis de peinture et un devis de toiture ne partagent
 * rien.
 *
 * ⚠️ ET SURTOUT : ON PROPOSE, ON N'AFFIRME PAS. Une suggestion à tort au moment
 * du résultat coûte cher en crédibilité — c'est la leçon des quatre faux
 * positifs dommages-ouvrage. D'où un seuil haut, une entreprise obligatoirement
 * différente, et une formulation en question.
 */

/** Mots vides et unités : présents partout, ils ne disent rien du métier. */
const BRUIT = new Set([
  "avec", "sans", "pour", "dans", "sous", "selon", "type", "types", "unite", "unites",
  "compris", "comprise", "comprenant", "fourniture", "fourni", "fournie", "pose", "posee",
  "prix", "total", "montant", "forfait", "ensemble", "divers", "autre", "autres",
  "mise", "oeuvre", "travaux", "chantier", "prestation", "prestations", "realisation",
  "installation", "remplacement", "existant", "existante", "neuf", "neuve",
  "gamme", "reference", "references", "marque", "modele", "dimensions",
  "garantie", "ans", "mois", "jour", "jours", "heure", "heures",
  "euro", "euros", "ttc", "eco", "participation", "deplacement",
]);

/**
 * Les mots significatifs d'un devis. On garde la racine grossièrement : le
 * pluriel et les accents ne doivent pas séparer deux devis qui parlent de la
 * même chose.
 */
export function signatureDevis(libelles: string[]): Set<string> {
  const mots = new Set<string>();
  for (const libelle of libelles) {
    const propre = String(libelle ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9\s-]/g, " ");
    for (const brut of propre.split(/[\s-]+/)) {
      // Les références produit (MXZ-3F68VF3, BA13) sont trop spécifiques : deux
      // devis concurrents ne proposent pas le même modèle.
      if (/\d/.test(brut)) continue;
      if (brut.length < 4) continue;
      const mot = brut.endsWith("s") ? brut.slice(0, -1) : brut;
      if (BRUIT.has(mot) || BRUIT.has(brut)) continue;
      mots.add(mot);
    }
  }
  return mots;
}

/**
 * Recouvrement de vocabulaire, entre 0 et 1.
 *
 * On divise par le PLUS PETIT des deux ensembles (coefficient de recouvrement)
 * et non par leur union : un devis détaillé de 40 lignes et un devis synthétique
 * de 6 lignes peuvent décrire le même chantier, et Jaccard les séparerait pour
 * la seule raison que l'un est plus bavard.
 */
export function recouvrement(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [petit, grand] = a.size <= b.size ? [a, b] : [b, a];
  let communs = 0;
  for (const mot of petit) if (grand.has(mot)) communs++;
  return communs / petit.size;
}

export interface DevisCandidat {
  id: string;
  /** Libellés des lignes de travaux. */
  libelles: string[];
  /** Nom de l'entreprise, pour ne pas proposer un devis contre lui-même. */
  entreprise?: string | null;
  createdAt: string;
  montantHt?: number | null;
  fileName?: string | null;
}

export interface Apparente {
  id: string;
  entreprise: string | null;
  montantHt: number | null;
  createdAt: string;
  fileName: string | null;
  /** Part du vocabulaire commun — sert au journal, jamais affichée telle quelle. */
  recouvrement: number;
}

/**
 * Seuils, CALIBRÉS sur les 585 paires du stock réel (mesure du 08/09).
 *
 * Le recouvrement seul ne suffit pas, et c'est la mesure qui l'a montré :
 *   · à 0,60 on rate le cas signalé — les deux devis de climatisation de
 *     prestataires différents ne sont qu'à **0,47** (leurs 17 mots communs :
 *     multi, split, frigorifique, condensat…) ;
 *   · à 0,50 on attrape « devis toiture ⟷ devis charpente », qui sont deux
 *     LOTS d'un même chantier, pas deux offres concurrentes.
 *
 * D'où un second signal : **deux offres pour le même périmètre ont des
 * montants du même ordre**. Il écarte les paires au vocabulaire proche mais au
 * périmètre sans rapport — mesuré ×98, ×26, ×19 sur le stock.
 *
 * Résultat : 19 propositions sur 585 paires (3 %), la paire de climatisation
 * incluse (0,47 · ×1,06).
 *
 * ⚠️ Ne pas trop resserrer le rapport de montants : deux vrais concurrents
 * peuvent différer de 80 %, et c'est précisément là que la comparaison sert le
 * plus. Un seuil à ×1,5 ne garderait que les paires déjà semblables — celles
 * où il n'y a rien à décider.
 */
export const SEUIL_RECOUVREMENT = 0.4;

/** Rapport maximal entre les deux montants. Au-delà, ce n'est plus le même chantier. */
export const RAPPORT_MONTANT_MAX = 2;

/**
 * Au-delà de ce recouvrement, ce n'est pas un concurrent : c'est le même devis
 * redéposé, ou une révision. Un autre prestataire n'écrit jamais le même devis.
 */
export const RECOUVREMENT_MEME_DEVIS = 0.9;

/** Deux devis d'un même projet arrivent à quelques semaines d'intervalle. */
export const FENETRE_JOURS = 30;

/** Le même fichier redéposé, à l'index de copie près : « devis (1).pdf ». */
function memeFichier(a?: string | null, b?: string | null): boolean {
  const n = (s?: string | null) =>
    String(s ?? "").toLowerCase().replace(/\(\d+\)|\.(pdf|jpe?g|png|webp)$/g, "").replace(/\s+/g, "");
  const x = n(a), y = n(b);
  return x.length > 2 && x === y;
}

/** Un même nom d'entreprise = le même devis redéposé, ou une révision. */
function memeEntreprise(a?: string | null, b?: string | null): boolean {
  const n = (s?: string | null) =>
    String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]/g, "");
  const x = n(a), y = n(b);
  return x.length > 2 && x === y;
}

/**
 * Le devis d'un autre prestataire qui décrit le même projet, s'il existe.
 *
 * @returns le meilleur candidat, ou `null` — et `null` est le cas normal :
 *   mieux vaut ne rien proposer qu'une comparaison qui n'a pas de sens.
 */
export function trouverDevisApparente(
  courant: DevisCandidat,
  candidats: DevisCandidat[],
  options: { seuil?: number; fenetreJours?: number } = {},
): Apparente | null {
  const seuil = options.seuil ?? SEUIL_RECOUVREMENT;
  const fenetre = (options.fenetreJours ?? FENETRE_JOURS) * 86_400_000;
  const signatureCourante = signatureDevis(courant.libelles);
  if (signatureCourante.size < 5) return null; // trop peu de matière pour juger

  const tCourant = Date.parse(courant.createdAt);
  let meilleur: Apparente | null = null;

  for (const c of candidats) {
    if (c.id === courant.id) continue;
    if (memeEntreprise(c.entreprise, courant.entreprise)) continue;
    // Le même fichier redéposé n'est pas un concurrent. Le nom seul suffit ici :
    // sur le stock, les redépôts gardent le nom d'origine à un « (1) » près.
    if (memeFichier(c.fileName, courant.fileName)) continue;
    const t = Date.parse(c.createdAt);
    if (!Number.isFinite(t) || Math.abs(tCourant - t) > fenetre) continue;

    // Deux offres pour le même périmètre ont des montants du même ordre.
    const ma = Number(courant.montantHt) || 0;
    const mb = Number(c.montantHt) || 0;
    if (ma > 0 && mb > 0 && Math.max(ma, mb) / Math.min(ma, mb) > RAPPORT_MONTANT_MAX) continue;

    const score = recouvrement(signatureCourante, signatureDevis(c.libelles));
    if (score < seuil) continue;
    // Un vocabulaire quasi identique trahit le même devis, pas un concurrent.
    if (score >= RECOUVREMENT_MEME_DEVIS) continue;
    if (meilleur && score <= meilleur.recouvrement) continue;

    meilleur = {
      id: c.id,
      entreprise: c.entreprise ?? null,
      montantHt: c.montantHt ?? null,
      createdAt: c.createdAt,
      fileName: c.fileName ?? null,
      recouvrement: score,
    };
  }

  return meilleur;
}
