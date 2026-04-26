-- Migration : ajout du concept d'avenant sur documents_chantier
--
-- Un avenant est un devis qui amende un devis original (ex: l'artisan
-- annonce +500€ en cours de chantier pour une pompe non prévue). Il est
-- stocké comme un nouveau document_chantier de type 'devis' avec :
--   - parent_devis_id : FK vers le devis original
--   - montant : le SUPPLÉMENT seul (500€), pas le total amendé
--   - avenant_motif : raison du surcoût
--
-- Le devis original n'est pas muté — son montant reste celui d'origine.
-- L'analyse VMD reste accrochée au parent (l'UI affichera le lien VMD du
-- parent sur l'avenant).
--
-- devis_validated_at : timestamp posé quand devis_statut passe à 'valide'.
-- Permet d'afficher "validé le 26/04/2026 → digest du jour".

ALTER TABLE documents_chantier
  ADD COLUMN IF NOT EXISTS parent_devis_id    UUID
    REFERENCES documents_chantier(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS avenant_motif      TEXT,
  ADD COLUMN IF NOT EXISTS devis_validated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_documents_parent_devis_id
  ON documents_chantier (parent_devis_id)
  WHERE parent_devis_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_devis_validated_at
  ON documents_chantier (devis_validated_at)
  WHERE devis_validated_at IS NOT NULL;
