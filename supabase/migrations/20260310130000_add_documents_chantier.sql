-- ── Lot 5 : Hub documentaire ────────────────────────────────────────────────

-- Bucket privé, limite 10 Mo au niveau storage (2e protection après validation serveur)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chantier-documents', 'chantier-documents', false, 10485760)
ON CONFLICT (id) DO NOTHING;

-- Policy storage : chemin attendu = {user_id}/{chantier_id}/{uuid}.ext
-- [1] = premier segment du chemin = user_id
DROP POLICY IF EXISTS "chantier_documents_owner" ON storage.objects;
CREATE POLICY "chantier_documents_owner" ON storage.objects FOR ALL
  USING (
    bucket_id = 'chantier-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'chantier-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── Table documents_chantier ────────────────────────────────────────────────
-- Stratégie idempotente :
--   1. CREATE TABLE IF NOT EXISTS avec colonnes minimales (nouvelles installations)
--   2. ALTER TABLE ADD COLUMN IF NOT EXISTS pour chaque colonne (installations partielles)

CREATE TABLE IF NOT EXISTS documents_chantier (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id UUID        NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Colonnes métier — toutes ajoutées de façon idempotente
ALTER TABLE documents_chantier
  ADD COLUMN IF NOT EXISTS lot_id        UUID REFERENCES lots_chantier(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS analyse_id    UUID REFERENCES analyses(id)      ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'autre',
  ADD COLUMN IF NOT EXISTS source        TEXT NOT NULL DEFAULT 'manual_upload',
  ADD COLUMN IF NOT EXISTS nom           TEXT,
  ADD COLUMN IF NOT EXISTS nom_fichier   TEXT,
  ADD COLUMN IF NOT EXISTS bucket_path   TEXT,
  ADD COLUMN IF NOT EXISTS taille_octets BIGINT,
  ADD COLUMN IF NOT EXISTS mime_type     TEXT;

-- Contraintes CHECK sur document_type (idempotent via DROP + ADD)
ALTER TABLE documents_chantier
  DROP CONSTRAINT IF EXISTS documents_chantier_document_type_check;
ALTER TABLE documents_chantier
  ADD  CONSTRAINT documents_chantier_document_type_check
  CHECK (document_type IN ('devis','facture','photo','plan','autorisation','assurance','autre'));

-- Contrainte CHECK sur taille_octets
ALTER TABLE documents_chantier
  DROP CONSTRAINT IF EXISTS documents_chantier_taille_octets_check;
ALTER TABLE documents_chantier
  ADD  CONSTRAINT documents_chantier_taille_octets_check
  CHECK (taille_octets > 0);

-- Contrainte UNIQUE sur bucket_path
ALTER TABLE documents_chantier
  DROP CONSTRAINT IF EXISTS documents_chantier_bucket_path_key;
ALTER TABLE documents_chantier
  ADD  CONSTRAINT documents_chantier_bucket_path_key UNIQUE (bucket_path);

-- NOT NULL sur colonnes nom / nom_fichier / bucket_path (si elles venaient d'être ajoutées nullables)
-- On met des valeurs par défaut temporaires pour éviter les erreurs si des lignes NULL existent.
UPDATE documents_chantier SET nom         = ''  WHERE nom         IS NULL;
UPDATE documents_chantier SET nom_fichier = ''  WHERE nom_fichier IS NULL;
UPDATE documents_chantier SET bucket_path = ''  WHERE bucket_path IS NULL;

ALTER TABLE documents_chantier
  ALTER COLUMN nom         SET NOT NULL,
  ALTER COLUMN nom_fichier SET NOT NULL,
  ALTER COLUMN bucket_path SET NOT NULL;

-- ── Index ────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_documents_chantier_created
  ON documents_chantier (chantier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_lot_id
  ON documents_chantier (lot_id) WHERE lot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_analyse_id
  ON documents_chantier (analyse_id) WHERE analyse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_type
  ON documents_chantier (chantier_id, document_type);

-- ── Trigger updated_at ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_documents_chantier_updated_at ON documents_chantier;
CREATE TRIGGER trg_documents_chantier_updated_at
  BEFORE UPDATE ON documents_chantier
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE documents_chantier ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "documents_chantier_owner" ON documents_chantier;
CREATE POLICY "documents_chantier_owner" ON documents_chantier FOR ALL
  USING (
    chantier_id IN (SELECT id FROM chantiers WHERE user_id = auth.uid())
  )
  WITH CHECK (
    chantier_id IN (SELECT id FROM chantiers WHERE user_id = auth.uid())
  );
