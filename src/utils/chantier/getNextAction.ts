import type {
  LigneBudgetIA,
  LotChantier,
  DocumentChantier,
  EtapeRoadmap,
} from '@/types/chantier-ia';
import { groupDocumentsByLot } from './groupDocumentsByLot';

// ── Types publics ──────────────────────────────────────────────────────────────

export interface NextActionResult {
  /** Texte court de l'action recommandée */
  action: string;
  /** Détail explicatif (1 phrase) */
  detail:  string;
  /** Nom du lot concerné, si applicable */
  lot?:    string;
  /** ID du lot concerné (pour navigation), si applicable */
  lotId?:  string;
  /** Icône emoji de l'action */
  icon:    string;
}

// ── Fonction principale ────────────────────────────────────────────────────────

/**
 * Détermine la prochaine action prioritaire pour un chantier en fonction
 * des documents déjà présents dans le dossier.
 *
 * Règles (ordre de priorité) :
 *  1. Un lot sans aucun devis                  → demander des devis
 *  2. Un lot avec devis mais sans facture       → comparer et signer un devis
 *  3. Un lot avec facture(s)                    → suivre l'avancement des travaux
 *  4. Fallback                                  → ajouter des documents au dossier
 *
 * @returns null si aucun lot n'est défini (chantier sans lignesBudget).
 */
export function getNextAction(
  lignesBudget: LigneBudgetIA[],
  documents:    DocumentChantier[],
  lots:         LotChantier[],
  roadmap:      EtapeRoadmap[],
): NextActionResult | null {

  if (!lignesBudget.length) return null;

  const byLot = groupDocumentsByLot(documents, lignesBudget, lots);

  // Résolution inverse : label → lot (pour récupérer l'id)
  const lotByLabel = new Map<string, LotChantier>(
    lots.map((l) => [l.nom.toLowerCase(), l]),
  );

  /** Résout label → LotChantier (correspondance souple) */
  const findLot = (label: string): LotChantier | undefined => {
    const exact = lots.find((l) => l.nom.toLowerCase() === label.toLowerCase());
    if (exact) return exact;
    const tokens = label.toLowerCase().split(/[\s/,]+/).filter((t) => t.length > 3);
    return lots.find((l) => tokens.some((t) => l.nom.toLowerCase().includes(t)));
  };

  // ── Priorité 1 : lot sans aucun devis ──────────────────────────────────────
  const sanDevis = lignesBudget.find(
    (l) => (byLot[l.label]?.devisCount ?? 0) === 0,
  );
  if (sanDevis) {
    const lot = findLot(sanDevis.label);
    return {
      icon:   '📋',
      action: `Demander des devis pour le lot "${sanDevis.label}"`,
      detail: 'Aucun devis n\'a encore été reçu pour ce lot. Contactez les artisans et ajoutez les devis au dossier.',
      lot:    sanDevis.label,
      lotId:  lot?.id,
    };
  }

  // ── Priorité 2 : lot avec devis mais sans facture ──────────────────────────
  const sansFact = lignesBudget.find((l) => {
    const c = byLot[l.label];
    return (c?.devisCount ?? 0) > 0 && (c?.facturesCount ?? 0) === 0;
  });
  if (sansFact) {
    const c = byLot[sansFact.label];
    const lot = findLot(sansFact.label);
    return {
      icon:   '🔍',
      action: `Comparer les devis reçus — lot "${sansFact.label}"`,
      detail: `${c.devisCount} devis reçu${c.devisCount > 1 ? 's' : ''} à analyser. Vérifiez les prestations et signez le devis retenu.`,
      lot:    sansFact.label,
      lotId:  lot?.id,
    };
  }

  // ── Priorité 3 : lot avec factures → suivi des travaux ────────────────────
  const avecFact = lignesBudget.find(
    (l) => (byLot[l.label]?.facturesCount ?? 0) > 0,
  );
  if (avecFact) {
    const lot = findLot(avecFact.label);
    return {
      icon:   '🏗️',
      action: `Suivre l'avancement des travaux — lot "${avecFact.label}"`,
      detail: 'Des factures ont été enregistrées. Mettez à jour l\'avancement et ajoutez des photos de chantier.',
      lot:    avecFact.label,
      lotId:  lot?.id,
    };
  }

  // ── Fallback ───────────────────────────────────────────────────────────────
  const current = roadmap.find((e) => e.isCurrent);
  return {
    icon:   '📂',
    action: current
      ? `Préparer la phase "${current.nom}"`
      : 'Ajouter des documents à votre dossier',
    detail: current
      ? `${current.detail} Ajoutez les documents correspondants à chaque lot.`
      : 'Déposez les devis et factures pour commencer le suivi de votre chantier.',
  };
}
