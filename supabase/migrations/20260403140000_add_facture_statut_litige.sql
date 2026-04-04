-- Migration : ajout du statut 'en_litige' à facture_statut
-- Permet de marquer une facture en litige commercial ou juridique

-- Supprimer la contrainte CHECK existante et la recréer avec la nouvelle valeur
ALTER TABLE documents_chantier
  DROP CONSTRAINT IF EXISTS documents_chantier_facture_statut_check;

ALTER TABLE documents_chantier
  ADD CONSTRAINT documents_chantier_facture_statut_check
    CHECK (facture_statut IN ('recue', 'payee', 'payee_partiellement', 'en_litige'));

-- Ajout colonne depense_type pour distinguer facture / ticket de caisse / achat matériaux
ALTER TABLE documents_chantier
  ADD COLUMN IF NOT EXISTS depense_type TEXT
    DEFAULT 'facture'
    CHECK (depense_type IN ('facture', 'ticket_caisse', 'achat_materiaux'));
