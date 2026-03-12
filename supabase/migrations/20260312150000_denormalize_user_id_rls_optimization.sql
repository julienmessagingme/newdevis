-- Migration: Denormalize user_id into dependent tables for faster RLS
-- Before: RLS uses EXISTS subquery on chantiers → 1 subquery per row
-- After: RLS uses direct (select auth.uid()) = user_id → instant

-- ============================================================
-- 1. Add user_id columns
-- ============================================================

ALTER TABLE devis_chantier ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE documents_chantier ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE todo_chantier ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- ============================================================
-- 2. Backfill from parent table (chantiers)
-- ============================================================

UPDATE devis_chantier
SET user_id = chantiers.user_id
FROM chantiers
WHERE devis_chantier.chantier_id = chantiers.id
  AND devis_chantier.user_id IS NULL;

UPDATE documents_chantier
SET user_id = chantiers.user_id
FROM chantiers
WHERE documents_chantier.chantier_id = chantiers.id
  AND documents_chantier.user_id IS NULL;

UPDATE todo_chantier
SET user_id = chantiers.user_id
FROM chantiers
WHERE todo_chantier.chantier_id = chantiers.id
  AND todo_chantier.user_id IS NULL;

-- ============================================================
-- 3. Add indexes on user_id for RLS performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_devis_chantier_user_id ON devis_chantier(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_chantier_user_id ON documents_chantier(user_id);
CREATE INDEX IF NOT EXISTS idx_todo_chantier_user_id ON todo_chantier(user_id);

-- ============================================================
-- 4. Replace RLS policies with direct user_id check
-- ============================================================

-- --- devis_chantier ---
DROP POLICY IF EXISTS "devis_chantier_select_own" ON devis_chantier;
DROP POLICY IF EXISTS "devis_chantier_insert_own" ON devis_chantier;
DROP POLICY IF EXISTS "devis_chantier_update_own" ON devis_chantier;
DROP POLICY IF EXISTS "devis_chantier_delete_own" ON devis_chantier;

CREATE POLICY "devis_chantier_select_own" ON devis_chantier FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "devis_chantier_insert_own" ON devis_chantier FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "devis_chantier_update_own" ON devis_chantier FOR UPDATE
  USING ((select auth.uid()) = user_id);

CREATE POLICY "devis_chantier_delete_own" ON devis_chantier FOR DELETE
  USING ((select auth.uid()) = user_id);

-- --- documents_chantier ---
DROP POLICY IF EXISTS "documents_chantier_select_own" ON documents_chantier;
DROP POLICY IF EXISTS "documents_chantier_insert_own" ON documents_chantier;
DROP POLICY IF EXISTS "documents_chantier_update_own" ON documents_chantier;
DROP POLICY IF EXISTS "documents_chantier_delete_own" ON documents_chantier;
DROP POLICY IF EXISTS "documents_chantier_owner" ON documents_chantier;

CREATE POLICY "documents_chantier_owner" ON documents_chantier FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- --- todo_chantier ---
DROP POLICY IF EXISTS "todo_chantier_select" ON todo_chantier;
DROP POLICY IF EXISTS "todo_chantier_insert" ON todo_chantier;
DROP POLICY IF EXISTS "todo_chantier_update" ON todo_chantier;
DROP POLICY IF EXISTS "todo_chantier_delete" ON todo_chantier;

CREATE POLICY "todo_chantier_select" ON todo_chantier FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "todo_chantier_insert" ON todo_chantier FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "todo_chantier_update" ON todo_chantier FOR UPDATE
  USING ((select auth.uid()) = user_id);

CREATE POLICY "todo_chantier_delete" ON todo_chantier FOR DELETE
  USING ((select auth.uid()) = user_id);

-- ============================================================
-- 5. Auto-populate user_id on INSERT via trigger
--    (so frontend doesn't need to pass user_id explicitly)
-- ============================================================

CREATE OR REPLACE FUNCTION set_user_id_from_chantier()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.chantier_id IS NOT NULL THEN
    SELECT user_id INTO NEW.user_id FROM chantiers WHERE id = NEW.chantier_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_devis_chantier_set_user_id ON devis_chantier;
CREATE TRIGGER trg_devis_chantier_set_user_id
  BEFORE INSERT ON devis_chantier
  FOR EACH ROW EXECUTE FUNCTION set_user_id_from_chantier();

DROP TRIGGER IF EXISTS trg_documents_chantier_set_user_id ON documents_chantier;
CREATE TRIGGER trg_documents_chantier_set_user_id
  BEFORE INSERT ON documents_chantier
  FOR EACH ROW EXECUTE FUNCTION set_user_id_from_chantier();

DROP TRIGGER IF EXISTS trg_todo_chantier_set_user_id ON todo_chantier;
CREATE TRIGGER trg_todo_chantier_set_user_id
  BEFORE INSERT ON todo_chantier
  FOR EACH ROW EXECUTE FUNCTION set_user_id_from_chantier();
