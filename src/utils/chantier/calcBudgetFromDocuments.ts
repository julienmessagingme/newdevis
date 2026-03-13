import type { DocumentChantier, LigneBudgetIA } from '@/types/chantier-ia';

// ── Types publics ─────────────────────────────────────────────────────────────

export interface BudgetResult {
  /** Somme de lignesBudget.montant — toujours disponible */
  totalEstime:  number;
  /**
   * Somme des montants portés par les documents de type "devis".
   * Vaut 0 tant que DocumentChantier ne stocke pas de champ montant —
   * ce type étendu permet d'en bénéficier automatiquement quand il sera ajouté.
   */
  totalEngage:  number;
  /**
   * Somme des montants portés par les documents de type "facture".
   * Même remarque que totalEngage.
   */
  totalPaye:    number;
  /** totalEngage − totalPaye */
  resteAPayer:  number;
}

// Type étendu — forward-compatible avec un futur champ montant sur DocumentChantier
type DocWithMontant = DocumentChantier & { montant?: number };

// ── Fonction principale ───────────────────────────────────────────────────────

/**
 * Calcule les agrégats budgétaires du chantier à partir des lignes budget IA
 * et des documents chargés.
 *
 * - totalEstime : calculé depuis lignesBudget (toujours fiable)
 * - totalEngage : somme des montants des devis  (0 si aucun montant renseigné)
 * - totalPaye   : somme des montants des factures (0 si aucun montant renseigné)
 * - resteAPayer : totalEngage − totalPaye
 */
export function calcBudgetFromDocuments(
  lignesBudget: LigneBudgetIA[],
  documents:    DocumentChantier[],
): BudgetResult {
  const totalEstime = lignesBudget.reduce((sum, l) => sum + l.montant, 0);

  const totalEngage = documents
    .filter((d) => d.document_type === 'devis')
    .reduce((sum, d) => sum + ((d as DocWithMontant).montant ?? 0), 0);

  const totalPaye = documents
    .filter((d) => d.document_type === 'facture')
    .reduce((sum, d) => sum + ((d as DocWithMontant).montant ?? 0), 0);

  return {
    totalEstime,
    totalEngage,
    totalPaye,
    resteAPayer: totalEngage - totalPaye,
  };
}
