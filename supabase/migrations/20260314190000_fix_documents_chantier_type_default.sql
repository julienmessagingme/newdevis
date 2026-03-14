-- Fix: colonne `type` de documents_chantier héritée de la migration premium (20260305)
-- sans DEFAULT, ce qui provoque "null value in column type violates not-null constraint"
-- lors des INSERT depuis l'API route (même si la valeur est fournie, PostgREST peut
-- ne pas la transmettre si elle n'est pas dans le schéma généré).
--
-- Solution : aligner `type` sur `document_type` (même sémantique, même valeurs).
--   1. Ajouter DEFAULT 'autre'          → plus jamais de NOT NULL violation
--   2. Backfill depuis document_type     → cohérence des lignes existantes
--   3. Trigger de sync INSERT/UPDATE     → les deux colonnes toujours identiques

-- 1. Default
ALTER TABLE documents_chantier
  ALTER COLUMN type SET DEFAULT 'autre';

-- 2. Backfill (rows dont type est vide ou différent de document_type)
UPDATE documents_chantier
SET type = document_type
WHERE type IS NULL OR type = '' OR type != document_type;

-- 3. Trigger : garde type = document_type automatiquement
CREATE OR REPLACE FUNCTION sync_document_type_to_type()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Sur INSERT : si type non fourni ou vide, utilise document_type
  IF TG_OP = 'INSERT' THEN
    IF NEW.type IS NULL OR NEW.type = '' THEN
      NEW.type := COALESCE(NEW.document_type, 'autre');
    END IF;
  END IF;
  -- Sur UPDATE de document_type : synchronise type
  IF TG_OP = 'UPDATE' AND NEW.document_type IS DISTINCT FROM OLD.document_type THEN
    NEW.type := NEW.document_type;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_document_type ON documents_chantier;
CREATE TRIGGER trg_sync_document_type
  BEFORE INSERT OR UPDATE ON documents_chantier
  FOR EACH ROW EXECUTE FUNCTION sync_document_type_to_type();
