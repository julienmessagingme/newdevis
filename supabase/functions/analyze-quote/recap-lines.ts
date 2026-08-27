/**
 * supabase/functions/analyze-quote/recap-lines.ts
 *
 * 2026-08-27 (cas NAZON, signalé par Johan) — détection déterministe d'une
 * ligne RÉCAPITULATIVE qui double le devis entier.
 *
 * Devis RITUAL RENOVATION : 6 sous-totaux (1 920 + 17 250 + 35 000 + 9 600 +
 * 13 500 + 12 000 = 89 270 €) PUIS une ligne « forfait intervention 89 270 € ».
 * L'analyse des postes affichait donc 178 540 € pour un devis de 89 270 € —
 * incohérence visible par l'utilisateur, et couverture marché faussée.
 *
 * Les gardes existantes ne couvraient pas ce cas :
 *   - RECAP_PATTERNS (V3.4.11) matche des libellés explicites (« Montant total
 *     HT », « TVA »…) — « forfait intervention » y échappe ;
 *   - la garde « titre de section » (V3.5.10) ne regarde QUE vers l'avant
 *     (parent suivi de ses enfants) — un récap en FIN de devis lui échappe.
 *
 * Règle retenue, indépendante du libellé ET de la position : si la ligne la
 * plus chère vaut (à la tolérance près) la SOMME DE TOUTES LES AUTRES, c'est
 * arithmétiquement un récapitulatif. Un vrai poste ne peut valoir exactement
 * la somme de tous ses voisins que par coïncidence — d'où le minimum de
 * 3 lignes et la tolérance serrée.
 */

export interface RecapCandidateLine {
  montant_total?: number | null;
}

/** Tolérance : 5 € absolus ou 1 % de la somme des autres lignes. */
function tolerance(sumOthers: number): number {
  return Math.max(5, sumOthers * 0.01);
}

/**
 * Retourne l'index de la ligne récapitulative, ou null s'il n'y en a pas.
 * Ne considère que les lignes à montant > 0 (les autres sont ignorées mais
 * les index retournés référencent bien le tableau d'origine).
 */
export function detectRecapTotalLine(lignes: RecapCandidateLine[]): number | null {
  const withAmount = lignes
    .map((l, index) => ({ index, montant: typeof l?.montant_total === "number" ? l.montant_total : 0 }))
    .filter((l) => l.montant > 0);

  // 3 lignes minimum : avec 2 lignes égales, chacune « vaut la somme des
  // autres » — coïncidence trop fréquente (ex. 2 lots au même prix).
  if (withAmount.length < 3) return null;

  const total = withAmount.reduce((s, l) => s + l.montant, 0);
  const candidate = withAmount.reduce((max, l) => (l.montant > max.montant ? l : max), withAmount[0]);
  const sumOthers = total - candidate.montant;
  if (sumOthers <= 0) return null;

  return Math.abs(candidate.montant - sumOthers) <= tolerance(sumOthers) ? candidate.index : null;
}
