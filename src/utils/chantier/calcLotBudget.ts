import type { DocumentChantier } from '@/types/chantier-ia';

// ── Types publics ──────────────────────────────────────────────────────────────

export interface LotBudgetResult {
  /**
   * Somme des montants extraits des documents de type "devis" du lot.
   * Calculé par heuristique depuis les noms de fichiers.
   * 0 si aucun montant n'a pu être extrait.
   */
  devisTotal: number;
  /**
   * Somme des montants extraits des documents de type "facture" du lot.
   * Calculé par heuristique depuis les noms de fichiers.
   * 0 si aucun montant n'a pu être extrait.
   */
  payeTotal:  number;
  /**
   * devisTotal − payeTotal.
   * Peut être négatif si des factures dépassent les devis enregistrés.
   */
  reste:      number;
  /**
   * Nombre de devis dans les documents — permet d'afficher un indicateur
   * même quand les montants ne sont pas extractibles.
   */
  nbDevis:    number;
  /**
   * Nombre de factures dans les documents.
   */
  nbFactures: number;
}

// ── Heuristique extraction du montant ─────────────────────────────────────────

/**
 * Extrait un montant numérique depuis le nom d'un fichier.
 *
 * Reconnaît les formats courants :
 *  - "devis-plomberie-3200€.pdf"      → 3200
 *  - "facture_peinture_4 500,00€.pdf" → 4500
 *  - "2 800.50 euros cuisine.pdf"     → 2800.50
 *
 * @returns Le montant en nombre, ou null si aucun pattern reconnu.
 */
function extractMontant(nom: string): number | null {
  const match = nom.match(
    /(\d[\d\s.]*)(?:[.,](\d{1,2}))?\s*(?:€|eur(?:os?)?)\b/i,
  );
  if (!match) return null;

  const entiere  = match[1].replace(/[\s.]/g, '');
  const decimale = match[2] ?? '00';
  const n = parseFloat(`${entiere}.${decimale}`);

  return isNaN(n) || n <= 0 ? null : n;
}

// ── Fonction principale ────────────────────────────────────────────────────────

/**
 * Calcule les agrégats financiers d'un lot à partir de ses documents.
 *
 * Les montants sont extraits heuristiquement depuis les noms de fichiers.
 * Tant que `DocumentChantier` ne stocke pas de champ `montant`, seuls les
 * fichiers dont le nom contient un montant (ex: "3200€") seront comptabilisés.
 *
 * @param documents  Documents du lot (tous types confondus)
 * @param budgetLot  Budget estimé IA du lot en € (non modifié, passé pour contexte)
 */
export function calcLotBudget(
  documents: DocumentChantier[],
  budgetLot: number,
): LotBudgetResult {
  const devisDocs   = documents.filter((d) => d.document_type === 'devis');
  const factDocs    = documents.filter((d) => d.document_type === 'facture');

  const devisTotal = devisDocs.reduce(
    (sum, d) => sum + (extractMontant(d.nom) ?? 0),
    0,
  );

  const payeTotal = factDocs.reduce(
    (sum, d) => sum + (extractMontant(d.nom) ?? 0),
    0,
  );

  return {
    devisTotal,
    payeTotal,
    reste:     devisTotal - payeTotal,
    nbDevis:   devisDocs.length,
    nbFactures: factDocs.length,
  };
}
