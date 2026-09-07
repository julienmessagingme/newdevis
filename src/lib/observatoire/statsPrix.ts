/**
 * src/lib/observatoire/statsPrix.ts
 *
 * 2026-09-07 (retour Johan) — LA RÈGLE UNIQUE POUR PUBLIER UN PRIX.
 *
 * « Les prix de l'observatoire n'apportent rien comme information : 1 397 € de
 * panier moyen, et alors ? »
 *
 * Il avait raison, et le défaut était le même que celui corrigé la veille sur
 * `/observatoire/prix-variables` : on agrégeait des choses qui ne se comparent
 * pas. Sur la page menuiserie, la « médiane unitaire » mélangeait 121 lignes à
 * l'unité, 3 au mètre linéaire, 1 au m² et 3 forfaits — une poignée de porte et
 * une baie vitrée dans le même chiffre. Un « panier moyen » ne répond à aucune
 * question : personne n'achète un panier moyen.
 *
 * Ce module porte la règle, une seule fois, pour les études thématiques comme
 * pour les 33 pages métier et les pages chantier. Toute nouvelle page de prix
 * doit passer par ici plutôt que réinventer son agrégation.
 */

/** Unités désignant un prix global : un forfait n'a pas de prix unitaire. */
const UNITES_FORFAIT = /^(forfait|for|f|ff|fft|ens|ensemble|global|lot)$/;

/**
 * Ramène les graphies d'une même unité à une clé unique (m² = m2 = M²).
 * `null` quand l'unité est absente : sans elle, « prix unitaire » ne veut rien
 * dire et la ligne doit être écartée.
 */
export function normaliserUnite(u: unknown): string | null {
  const s = String(u ?? "").toLowerCase().trim().replace(/\.$/, "");
  if (!s) return null;
  if (UNITES_FORFAIT.test(s)) return "forfait";
  if (/^(m2|m²|metre carre|mètre carré)$/.test(s)) return "m²";
  if (/^(ml|m|metre lineaire|mètre linéaire)$/.test(s)) return "ml";
  if (/^(m3|m³)$/.test(s)) return "m³";
  if (/^(u|un|unit|pce|pcs|piece|pièce|unite|unité)$/.test(s)) return "u";
  if (/^(h|heure|hr)$/.test(s)) return "h";
  if (/^(j|jour|jours)$/.test(s)) return "j";
  if (/^(kg|t|tonne)$/.test(s)) return s;
  return s;
}

/** Quantile d'une série TRIÉE croissante. */
export function quantile(triee: number[], q: number): number {
  if (triee.length === 0) return 0;
  const i = Math.min(triee.length - 1, Math.max(0, Math.round((triee.length - 1) * q)));
  return triee[i];
}

/**
 * Nombre minimal d'observations pour publier un poste.
 *
 * À 5, un seul devis atypique faisait la une (« Faux plafond BA13 ×86 » alors
 * que 107 observations sur 107 s'accordaient à 55 €/m²).
 */
export const OBS_MIN_PUBLICATION = 8;

/** Idem, assoupli pour une page métier : sinon la plupart n'affichent rien. */
export const OBS_MIN_PAGE_METIER = 5;

export interface LignePrix {
  /** Libellé du poste au catalogue. */
  label: string | null | undefined;
  unite: unknown;
  prixUnitaire: number | null | undefined;
}

export interface PostePublie {
  label: string;
  unite: string;
  /** Nombre d'observations RETENUES (après retrait des valeurs aberrantes). */
  nbObs: number;
  p10: number;
  mediane: number;
  p90: number;
  /** Rapport P90/P10 — l'écart entre artisans, à prestation et unité égales. */
  ecart: number;
}

/**
 * Agrège des lignes de devis en postes publiables.
 *
 * Trois garde-fous, tous nés d'un cas réel :
 *   1. **une série par (poste, unité)** — un prix au m² et un prix à la pièce ne
 *      décrivent pas la même chose ;
 *   2. **forfaits exclus** — un forfait couvre un périmètre propre à chaque
 *      devis (repeindre une porte ou toutes celles de la maison) ;
 *   3. **forfaits déguisés écartés** — une valeur à plus de dix fois la médiane
 *      de son propre poste ne décrit pas le même travail (cas « Peinture porte :
 *      1 u, 8 350 € », où l'unité dit « u » mais couvre tout un lot).
 *
 * L'amplitude publiée est P90/P10 et non max/min : un seul devis atypique ne
 * doit pas faire le classement.
 */
export function agregerPostes(
  lignes: LignePrix[],
  options: { obsMin?: number } = {},
): PostePublie[] {
  const obsMin = options.obsMin ?? OBS_MIN_PUBLICATION;
  const series = new Map<string, { label: string; unite: string; valeurs: number[] }>();

  for (const l of lignes) {
    const unite = normaliserUnite(l.unite);
    if (!unite || unite === "forfait") continue;
    const label = String(l.label ?? "").trim();
    if (!label) continue;
    const prix = Number(l.prixUnitaire);
    if (!Number.isFinite(prix) || prix <= 0 || prix > 100_000) continue;

    const cle = `${label}::${unite}`;
    let s = series.get(cle);
    if (!s) { s = { label, unite, valeurs: [] }; series.set(cle, s); }
    s.valeurs.push(prix);
  }

  const postes: PostePublie[] = [];
  for (const { label, unite, valeurs } of series.values()) {
    const brut = [...valeurs].sort((a, b) => a - b);
    const medBrute = quantile(brut, 0.5);
    const retenues = medBrute > 0
      ? brut.filter((p) => p <= medBrute * 10 && p >= medBrute / 10)
      : brut;
    if (retenues.length < obsMin) continue;

    const p10 = quantile(retenues, 0.10);
    const p90 = quantile(retenues, 0.90);
    postes.push({
      label,
      unite,
      nbObs: retenues.length,
      p10,
      mediane: quantile(retenues, 0.5),
      p90,
      ecart: p10 > 0 ? p90 / p10 : 0,
    });
  }

  // Les postes les mieux documentés d'abord : c'est sur eux que le lecteur peut
  // s'appuyer, pas sur celui qui a l'écart le plus spectaculaire.
  return postes.sort((a, b) => b.nbObs - a.nbObs);
}

/**
 * Le fait marquant d'une page : le poste dont l'écart entre artisans est le plus
 * fort, parmi ceux qui sont assez documentés pour qu'on l'affirme.
 *
 * C'est ce qui remplace le « panier moyen » : une phrase qu'un lecteur retient
 * et peut vérifier sur son propre devis.
 */
export function faitMarquant(postes: PostePublie[]): PostePublie | null {
  if (postes.length === 0) return null;

  // 2026-09-07 — ON NE FAIT PAS LA UNE SUR UN ACCESSOIRE.
  //
  // Première version : le plus fort écart, point. Sur la page menuiserie, elle
  // titrait « Pose poignée / garniture ×8,8 » — vrai, mais dérisoire à côté
  // d'une fenêtre à 1 760 €. Johan demandait des chiffres « sur les plus gros
  // postes » : un écart n'est marquant que s'il porte sur de l'argent réel.
  //
  // Le seuil est RELATIF au métier plutôt qu'absolu : 116 € est un poste
  // central en électricité (point lumineux) et une broutille en menuiserie.
  // On écarte donc ce qui pèse moins d'un cinquième du poste le plus cher du
  // métier.
  const medianeMax = Math.max(...postes.map((p) => p.mediane));
  const seuilPoids = medianeMax * 0.2;

  const candidats = postes.filter((p) => p.ecart >= 1.5 && p.mediane >= seuilPoids);
  if (candidats.length === 0) return null;
  return candidats.reduce((a, b) => (b.ecart > a.ecart ? b : a));
}
