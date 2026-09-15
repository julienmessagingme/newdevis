/**
 * src/lib/analyse/petitsPostes.ts
 *
 * 2026-09-15 (retour Johan) — REGROUPER LES PETITS POSTES NON VÉRIFIABLES.
 *
 * Sur un devis de climatisation, le détail affichait **dix cartes « Prix non
 * vérifiable » d'affilée** : liaison frigorifique, câble d'interconnexion,
 * tuyau de condensat, kit anti-vibration, goulotte — des lignes à 65-500 €.
 * Dix fois la même phrase, sur des accessoires dont personne n'attend un
 * chiffrage. « C'est du bruit pour rien. »
 *
 * 🔴 ON NE MASQUE PAS, ON REGROUPE. Le montant total reste affiché et le
 * nombre de postes est dit : l'information ne disparaît pas, elle cesse
 * d'occuper dix écrans. Masquer ces lignes ferait perdre au lecteur la trace
 * d'une part réelle de son devis.
 *
 * ⚠️ LE SEUIL EST RELATIF, JAMAIS ABSOLU. 500 € est un accessoire sur un devis
 * de climatisation à 16 000 € et un poste central sur un devis de plomberie à
 * 3 000 €. Même raisonnement que le « fait marquant » de l'observatoire
 * (2026-09-07), où un seuil absolu titrait sur une poignée de porte.
 */

/**
 * Un poste pèse « peu » en dessous de 5 % du devis. Sur le devis qui a motivé
 * la règle (16 485 € HT), cela place la frontière à 824 € : les accessoires
 * (65 à 500 €) sont regroupés, les deux postes de distribution (900 et
 * 1 500 €) restent affichés séparément — ce sont de vraies prestations.
 */
export const PART_MAX_PETIT_POSTE = 0.05;

/**
 * En dessous de trois, on n'y gagne rien : remplacer deux cartes par une ligne
 * de synthèse ne fait qu'ajouter un niveau de lecture.
 */
export const MIN_POSTES_POUR_REGROUPER = 3;

export interface SeparationPetitsPostes<T> {
  /** Les postes qui gardent leur carte. */
  affiches: T[];
  /** Les petits postes rassemblés en une ligne (vide si la règle ne s'applique pas). */
  regroupes: T[];
  /** Montant HT cumulé des postes regroupés. */
  montantRegroupe: number;
}

/**
 * Sépare les postes à afficher de ceux à regrouper.
 *
 * ⚠️ N'est appelée que sur les postes NON VÉRIFIABLES : un poste dont on
 * connaît le prix se montre toujours, quel que soit son montant — c'est notre
 * travail, et le regrouper reviendrait à cacher ce qu'on sait faire.
 */
export function separerPetitsPostes<T>(
  postes: T[],
  montantDe: (p: T) => number | null,
  totalDevisHT: number | null,
): SeparationPetitsPostes<T> {
  const aucunRegroupement: SeparationPetitsPostes<T> = {
    affiches: postes,
    regroupes: [],
    montantRegroupe: 0,
  };

  // Sans total exploitable, on ne sait pas ce qui est « petit » : on affiche
  // tout plutôt que d'inventer une frontière.
  if (!totalDevisHT || totalDevisHT <= 0) return aucunRegroupement;

  const plafond = totalDevisHT * PART_MAX_PETIT_POSTE;
  const petits: T[] = [];
  const grands: T[] = [];
  for (const p of postes) {
    const m = montantDe(p);
    // Un poste sans montant exploitable n'est pas « petit » : on ne peut rien
    // en dire, il garde sa carte.
    if (typeof m !== "number" || m <= 0 || m > plafond) grands.push(p);
    else petits.push(p);
  }

  if (petits.length < MIN_POSTES_POUR_REGROUPER) return aucunRegroupement;

  return {
    affiches: grands,
    regroupes: petits,
    montantRegroupe: petits.reduce((s, p) => s + (montantDe(p) ?? 0), 0),
  };
}
