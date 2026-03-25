-- Migration : ajout colonne updated_at manquante sur documents_chantier
-- Le CREATE TABLE IF NOT EXISTS dans 20260310130000 a skippé la colonne
-- car la table existait déjà. Le trigger set_updated_at() échoue sans elle.

ALTER TABLE documents_chantier
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
