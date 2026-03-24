-- Migration : ajout colonne devis_statut sur documents_chantier
-- Permet de suivre l'état de chaque devis par lot (en_cours, a_relancer, valide, attente_facture)

ALTER TABLE documents_chantier
  ADD COLUMN IF NOT EXISTS devis_statut TEXT
    DEFAULT 'en_cours'
    CHECK (devis_statut IN ('en_cours', 'a_relancer', 'valide', 'attente_facture'));

-- Index pour filtrage rapide par statut
CREATE INDEX IF NOT EXISTS idx_documents_chantier_devis_statut
  ON documents_chantier(devis_statut)
  WHERE devis_statut IS NOT NULL;
