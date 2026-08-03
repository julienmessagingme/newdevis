// ============================================================
// Détection "devis incomplet" (résumé par lot) — logique partagée V1 + V2.
//
// V3.5.1 : un devis dont ≥ 70% des lignes n'ont ni unité physique ni quantité
// réelle est considéré comme un résumé par corps de métier ("Plomberie 7600€")
// → bypass conclusion.ts avec bannière "demandez un devis détaillé".
//
// 2026-08-03 — Garde montant (cas ATEX, cf. docs/refonte/BUGS-A-CORRIGER.md
// INCOMPLETE-QUOTE-FAUX-POSITIF-FORFAITS-LEGITIMES) : compter les LIGNES ne
// suffit pas. Un ravalement de façade légitime contient 6 forfaits "1 unité"
// (échafaudage, purge, dépose, nettoyage) à côté d'un poste principal
// parfaitement quantifié (bardage 80 m² × 142,50 €) qui porte 74% du montant.
// L'ancienne heuristique déclenchait à 75% de lignes forfait alors que le
// devis était analysable. Nouvelle règle : le bypass ne se déclenche que si
// EN PLUS ≥ 70% du MONTANT HT est porté par des lignes sans unité physique.
// Fallback : si aucun montant exploitable (tous null/0), on garde le
// comportement historique par comptage de lignes (cas devis bidon Crételi).
//
// Le Set d'unités physiques reste fourni par l'appelant : extract.ts (V1) et
// extract_v2.ts (V2, set étendu) ont des listes différentes — ce module ne
// doit PAS unifier silencieusement leurs comportements.
// ============================================================

export interface IncompleteQuoteLine {
  unite: string | null | undefined;
  quantite: number | null | undefined;
  /** Montant HT de la ligne (V1: travaux[].montant, V2: LigneV2.montant_total) */
  montant: number | null | undefined;
}

export interface IncompleteQuoteResult {
  is_incomplete: boolean;
  reason: string;
}

const LINE_RATIO_THRESHOLD = 0.70;
const MONTANT_RATIO_THRESHOLD = 0.70;

export function detectIncompleteQuoteShared(
  lines: IncompleteQuoteLine[],
  physicalUnits: Set<string>,
): IncompleteQuoteResult {
  if (!Array.isArray(lines) || lines.length < 5) {
    return { is_incomplete: false, reason: "" };
  }

  let noPhysicalUnit = 0;
  let qtyOneOrNull = 0;
  let montantTotal = 0;
  let montantNonDetaille = 0;

  for (const t of lines) {
    const unit = String(t?.unite ?? "").trim().toLowerCase();
    const hasPhysicalUnit = physicalUnits.has(unit);
    if (!hasPhysicalUnit) noPhysicalUnit++;

    const qty = t?.quantite;
    if (qty === null || qty === undefined || qty === 1 || qty === 0) qtyOneOrNull++;

    const amt = typeof t?.montant === "number" && t.montant > 0 ? t.montant : 0;
    montantTotal += amt;
    if (!hasPhysicalUnit) montantNonDetaille += amt;
  }

  const total = lines.length;
  const noPhysicalRatio = noPhysicalUnit / total;
  const qtyOneRatio = qtyOneOrNull / total;

  if (noPhysicalRatio < LINE_RATIO_THRESHOLD || qtyOneRatio < LINE_RATIO_THRESHOLD) {
    return { is_incomplete: false, reason: "" };
  }

  // Garde montant : si la majorité du montant HT est portée par des lignes
  // quantifiées (unité physique), le devis est analysable — pas de bypass.
  if (montantTotal > 0) {
    const montantRatio = montantNonDetaille / montantTotal;
    if (montantRatio < MONTANT_RATIO_THRESHOLD) {
      return { is_incomplete: false, reason: "" };
    }
    return {
      is_incomplete: true,
      reason:
        `${(noPhysicalRatio * 100).toFixed(0)}% lignes sans unité physique + ` +
        `${(qtyOneRatio * 100).toFixed(0)}% lignes quantité=1/null + ` +
        `${(montantRatio * 100).toFixed(0)}% du montant HT non détaillé sur ${total} lignes`,
    };
  }

  // Aucun montant exploitable → comportement historique (comptage de lignes).
  return {
    is_incomplete: true,
    reason:
      `${(noPhysicalRatio * 100).toFixed(0)}% lignes sans unité physique + ` +
      `${(qtyOneRatio * 100).toFixed(0)}% lignes quantité=1/null sur ${total} lignes (montants indisponibles)`,
  };
}
