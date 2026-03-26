-- Migration : ajout colonnes facture_statut et montant_paye sur documents_chantier
-- Permet de suivre l'état de chaque facture (reçue, payée, payée partiellement)
-- et le montant effectivement payé (utile en cas de paiement partiel)

ALTER TABLE documents_chantier
  ADD COLUMN IF NOT EXISTS facture_statut TEXT
    CHECK (facture_statut IN ('recue', 'payee', 'payee_partiellement'));

ALTER TABLE documents_chantier
  ADD COLUMN IF NOT EXISTS montant_paye NUMERIC(12, 2)
    DEFAULT NULL;

-- Index pour filtrage rapide par statut facture
CREATE INDEX IF NOT EXISTS idx_documents_chantier_facture_statut
  ON documents_chantier(facture_statut)
  WHERE facture_statut IS NOT NULL;
