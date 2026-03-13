import type { DocumentChantier, LigneBudgetIA, LotChantier } from '@/types/chantier-ia';

// ── Types publics ─────────────────────────────────────────────────────────────

export interface LotDocumentCounts {
  devisCount:    number;
  facturesCount: number;
  photosCount:   number;
}

/** Clé = LigneBudgetIA.label (nom du lot) */
export type DocumentsByLot = Record<string, LotDocumentCounts>;

// ── Utilitaire ────────────────────────────────────────────────────────────────

/**
 * Regroupe les documents d'un chantier par nom de lot (issu de lignesBudget).
 *
 * Résolution :
 *   document.lot_id  →  LotChantier.id  →  LotChantier.nom
 *   LotChantier.nom  →  match partiel sur LigneBudgetIA.label
 *
 * @param documents    Liste des DocumentChantier du chantier
 * @param lignesBudget Lignes budget IA — définit les clés du résultat
 * @param lots         (optionnel) Lots persistés — nécessaire pour résoudre lot_id → nom
 *
 * @returns Un objet indexé par label de ligne budget, avec les compteurs.
 *          Toutes les clés sont présentes même si les compteurs sont à 0.
 */
export function groupDocumentsByLot(
  documents:    DocumentChantier[],
  lignesBudget: LigneBudgetIA[],
  lots:         LotChantier[] = [],
): DocumentsByLot {
  // Initialise toutes les entrées à zéro — garantit que chaque label est présent
  const result: DocumentsByLot = Object.fromEntries(
    lignesBudget.map((l) => [
      l.label,
      { devisCount: 0, facturesCount: 0, photosCount: 0 },
    ]),
  );

  if (!documents.length || !lignesBudget.length) return result;

  // Map UUID lot_id → nom du lot (LotChantier.nom)
  const lotNomById = new Map<string, string>(
    lots.map((l) => [l.id, l.nom]),
  );

  // Pour chaque document, on tente de le rattacher à un label de ligne budget
  for (const doc of documents) {
    const labelKey = resolveLabel(doc.lot_id, lotNomById, lignesBudget);
    if (!labelKey) continue; // document non attribué ou lot inconnu → ignoré

    const entry = result[labelKey];
    if (!entry) continue;

    switch (doc.document_type) {
      case 'devis':
        entry.devisCount++;
        break;
      case 'facture':
        entry.facturesCount++;
        break;
      case 'photo':
        entry.photosCount++;
        break;
      // plan, autorisation, assurance, autre → non comptabilisés ici
    }
  }

  return result;
}

// ── Filtre documents pour un lot précis ──────────────────────────────────────

/**
 * Retourne les documents dont le lot résout vers le label donné.
 * Utilise la même logique de résolution que groupDocumentsByLot.
 */
export function getDocumentsForLot(
  label:        string,
  documents:    DocumentChantier[],
  lignesBudget: LigneBudgetIA[],
  lots:         LotChantier[] = [],
): DocumentChantier[] {
  if (!documents.length) return [];

  const lotNomById = new Map<string, string>(
    lots.map((l) => [l.id, l.nom]),
  );

  return documents.filter(
    (doc) => resolveLabel(doc.lot_id, lotNomById, lignesBudget) === label,
  );
}

// ── Helpers internes ──────────────────────────────────────────────────────────

/**
 * Résout un lot_id UUID en label de LigneBudgetIA.
 *
 * Étapes :
 *  1. lot_id → LotChantier.nom (via lotNomById)
 *  2. LotChantier.nom → LigneBudgetIA.label (match exact, puis match partiel par token)
 */
function resolveLabel(
  lotId:         string | null,
  lotNomById:    Map<string, string>,
  lignesBudget:  LigneBudgetIA[],
): string | null {
  if (!lotId) return null;

  const lotNom = lotNomById.get(lotId);
  if (!lotNom) return null;

  const nomLower = lotNom.toLowerCase();

  // 1. Match exact (insensible à la casse)
  const exact = lignesBudget.find(
    (l) => l.label.toLowerCase() === nomLower,
  );
  if (exact) return exact.label;

  // 2. Match partiel : tokens du nom du lot présents dans le label ou vice-versa
  const tokens = nomLower.split(/[\s/,]+/).filter((t) => t.length > 3);
  const partial = lignesBudget.find((l) => {
    const labelLower = l.label.toLowerCase();
    return tokens.some((t) => labelLower.includes(t) || nomLower.includes(labelLower.split(' ')[0]));
  });

  return partial?.label ?? null;
}
