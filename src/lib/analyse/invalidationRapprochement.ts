/**
 * src/lib/analyse/invalidationRapprochement.ts
 *
 * 2026-09-26 — Invalider un rapprochement catalogue depuis l'écran de revue.
 *
 * 🔴 POURQUOI CE MODULE EXISTE. Le formulaire « Corriger » n'écrivait QUE
 * `conclusion_ia` : un expert pouvait ramener un surcoût à zéro sans que la
 * CARTE qui le portait change. La fourchette catalogue restait affichée, avec
 * son badge, sous un verdict qui disait l'inverse.
 *
 * 🔴 ET LE DÉFAUT NE VA PAS QUE DANS LE SENS DE L'ACCUSATION. Mesuré sur le
 * devis « noreco peinture2 » (peinture, 9 pièces) : quatre noms de pièces
 * avaient été rapprochés d'un miroir, d'une cuisine, d'une douche et d'un WC —
 * des tarifs À L'UNITÉ multipliés par une quantité en m². La page affichait
 * « salon 2 800 € · marché 10 500–42 000 € » avec un badge VERT « Prix
 * correct ». **Un rapprochement faux fabrique de la réassurance aussi souvent
 * qu'il accuse**, et c'est l'absolution que personne ne vient signaler.
 *
 * ⚠️ L'ARBITRE DU RAPPROCHEMENT NE POUVAIT PAS LES VOIR : il ne juge que les
 * postes qui portent un montant chiffré (`ARBITRE_ECART_MIN = 300 €`), et la
 * garde d'unité avait déjà retiré ces quatre-là du chiffrage. **Une garde qui
 * retire un poste du MONTANT ne le retire pas de l'ÉCRAN.**
 */

export interface GroupeRapproche {
  prices?: unknown[];
  job_type_label?: string | null;
  devis_lines?: Array<{ description?: string | null }>;
  vectorial?: Record<string, unknown> | null;
  /** Écrites par l'invalidation — jamais lues par l'affichage. */
  prices_invalides_par_expert?: unknown[];
  job_type_label_invalide_par_expert?: string | null;
  [k: string]: unknown;
}

export interface ResultatInvalidation {
  /** Les groupes, l'invalidation appliquée. Le tableau d'entrée n'est pas muté. */
  groupes: GroupeRapproche[];
  /** Les lignes de devis réellement invalidées, dans l'ordre des indices. */
  invalides: string[];
  /** Indices demandés retenus (dédupliqués). */
  demandes: number;
  /** Indices hors du tableau — l'appelant DOIT refuser la décision. */
  indicesInvalides: number[];
}

/** Le libellé du fourre-tout, identique à celui que produit le matcher. */
export const LIBELLE_NON_COMPARABLE = "Non comparable";

/**
 * Invalide les rapprochements désignés par leur INDICE.
 *
 * ⚠️ PAR INDICE, JAMAIS PAR LIBELLÉ. Plusieurs groupes d'un même devis portent
 * le même intitulé (règle du 17/09, « Charpente fermette industrielle » y
 * figure deux fois) : un rapprochement par nom désignerait le mauvais poste, en
 * silence.
 *
 * ⚠️ LES TARIFS D'ORIGINE SONT CONSERVÉS. `analysis_corrections` sauvegarde
 * `conclusion_ia`, JAMAIS `raw_text` : sans cette copie, une invalidation
 * erronée serait irréversible.
 */
export function invaliderRapprochements(
  groupes: readonly GroupeRapproche[] | null | undefined,
  indicesDemandes: readonly unknown[] | null | undefined,
): ResultatInvalidation {
  const liste = Array.isArray(groupes) ? groupes : [];
  const bruts = Array.isArray(indicesDemandes) ? indicesDemandes : [];

  const uniques = [...new Set(bruts)];
  const indicesInvalides = uniques.filter(
    (i) => !Number.isInteger(i) || (i as number) < 0 || (i as number) >= liste.length,
  ) as number[];

  // Copie de surface par groupe : on ne mute jamais l'entrée, pour qu'un appelant
  // qui refuse la décision reparte de la donnée intacte.
  const sortie: GroupeRapproche[] = liste.map((g) => ({ ...g }));
  const invalides: string[] = [];

  if (indicesInvalides.length === 0) {
    for (const i of (uniques as number[]).slice().sort((a, b) => a - b)) {
      const g = sortie[i];
      // Déjà sans tarif : rien à invalider. On ne le compte pas — c'est ce qui
      // permet à l'appelant de dire « 3 sur 4 » au lieu d'un faux succès.
      if (!Array.isArray(g.prices) || g.prices.length === 0) continue;

      g.prices_invalides_par_expert = g.prices;
      g.job_type_label_invalide_par_expert = g.job_type_label ?? null;

      g.prices = [];
      g.job_type_label = LIBELLE_NON_COMPARABLE;
      g.vectorial = { ...(g.vectorial ?? {}), confidence: "no_match" };

      invalides.push(String(g.devis_lines?.[0]?.description ?? `groupe ${i}`));
    }
  }

  return { groupes: sortie, invalides, demandes: uniques.length, indicesInvalides };
}
