import { useState } from 'react';
import LotCard from '@/components/chantier/lots/LotCard';
import LotDetail from '@/components/chantier/lots/LotDetail';
import { groupDocumentsByLot, getDocumentsForLot } from '@/utils/chantier/groupDocumentsByLot';
import type { DocumentChantier, LigneBudgetIA, LotChantier } from '@/types/chantier-ia';

// ── Props ─────────────────────────────────────────────────────────────────────

interface LotGridProps {
  /** Lignes de budget IA — source de vérité des lots à afficher */
  lignesBudget: LigneBudgetIA[];
  /**
   * Documents du chantier — utilisés pour calculer nbDevis / nbFactures / nbPhotos.
   * Peut être vide si les documents ne sont pas encore chargés.
   */
  documents?: DocumentChantier[];
  /**
   * Lots persistés en DB — nécessaires pour résoudre document.lot_id → nom du lot.
   * Peut être vide si les lots ne sont pas disponibles.
   */
  lots?: LotChantier[];
  /** Props optionnelles pour l'upload de documents depuis LotDetail */
  chantierId?:      string;
  userId?:          string;
  token?:           string;
  onDocumentAdded?: () => void;
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function LotGrid({
  lignesBudget,
  documents = [],
  lots = [],
  chantierId,
  userId,
  token,
  onDocumentAdded,
}: LotGridProps) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  if (!lignesBudget.length) return null;

  // Calcul des compteurs par lot à partir des documents
  const countsByLot = groupDocumentsByLot(documents, lignesBudget, lots);

  // Ligne + documents du lot sélectionné
  const selectedLigne = lignesBudget.find((l) => l.label === selectedLabel) ?? null;
  const selectedDocuments = selectedLabel
    ? getDocumentsForLot(selectedLabel, documents, lignesBudget, lots)
    : [];

  // UUID du lot sélectionné (non-fallback) — pour l'upload depuis LotDetail
  const selectedLotId = selectedLabel
    ? (lots.find((l) => l.nom === selectedLabel && !l.id.startsWith('fallback-'))?.id ?? null)
    : null;

  return (
    <>
      <div className="mb-5">

        {/* Titre de section */}
        <h3 className="text-white font-bold text-lg mb-4">🔨 Lots de travaux</h3>

        {/* Grille responsive */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {lignesBudget.map((ligne, i) => {
            const counts = countsByLot[ligne.label] ?? {
              devisCount: 0,
              facturesCount: 0,
              photosCount: 0,
            };
            return (
              <LotCard
                key={i}
                label={ligne.label}
                montant={ligne.montant}
                couleur={ligne.couleur}
                nbDevis={counts.devisCount}
                nbFactures={counts.facturesCount}
                nbPhotos={counts.photosCount}
                onVoir={() => setSelectedLabel(ligne.label)}
              />
            );
          })}
        </div>
      </div>

      {/* Panneau de détail — rendu en dehors de la grille pour le positionnement fixed */}
      {selectedLabel && selectedLigne && (
        <LotDetail
          lotName={selectedLabel}
          budget={selectedLigne.montant}
          couleur={selectedLigne.couleur}
          documents={selectedDocuments}
          onClose={() => setSelectedLabel(null)}
          chantierId={chantierId}
          userId={userId}
          token={token}
          lotId={selectedLotId}
          onDocumentAdded={onDocumentAdded}
        />
      )}
    </>
  );
}
