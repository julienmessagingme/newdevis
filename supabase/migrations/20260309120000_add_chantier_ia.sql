-- Migration : module IA Chantier
-- Ajoute metadonnees JSON sur chantiers + tables todo_chantier et chantier_updates

-- 1. Colonnes IA sur chantiers (roadmap, artisans, formalites, aides IA)
ALTER TABLE chantiers
  ADD COLUMN IF NOT EXISTS metadonnees TEXT,
  ADD COLUMN IF NOT EXISTS type_projet TEXT DEFAULT 'autre',
  ADD COLUMN IF NOT EXISTS mensualite NUMERIC,
  ADD COLUMN IF NOT EXISTS duree_credit INTEGER,
  ADD COLUMN IF NOT EXISTS date_debut_souhaitee TIMESTAMPTZ;

-- 2. Table todo_chantier (checklist IA)
-- chantiers.id est UUID → chantier_id doit être UUID aussi
CREATE TABLE IF NOT EXISTS todo_chantier (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  titre       TEXT NOT NULL,
  priorite    TEXT NOT NULL DEFAULT 'normal' CHECK (priorite IN ('urgent', 'important', 'normal')),
  done        BOOLEAN NOT NULL DEFAULT false,
  ordre       INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_todo_chantier_chantier_id ON todo_chantier(chantier_id);
CREATE INDEX IF NOT EXISTS idx_todo_chantier_ordre ON todo_chantier(chantier_id, ordre);

-- 3. Table chantier_updates (log des améliorations IA)
CREATE TABLE IF NOT EXISTS chantier_updates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id  UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  modification TEXT NOT NULL,
  changes      TEXT NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chantier_updates_chantier_id ON chantier_updates(chantier_id);

-- 4. RLS
ALTER TABLE todo_chantier ENABLE ROW LEVEL SECURITY;
ALTER TABLE chantier_updates ENABLE ROW LEVEL SECURITY;

-- todo_chantier : accès via ownership du chantier parent
CREATE POLICY "todo_chantier_select" ON todo_chantier
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM chantiers WHERE id = todo_chantier.chantier_id AND user_id = auth.uid())
  );
CREATE POLICY "todo_chantier_insert" ON todo_chantier
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM chantiers WHERE id = todo_chantier.chantier_id AND user_id = auth.uid())
  );
CREATE POLICY "todo_chantier_update" ON todo_chantier
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM chantiers WHERE id = todo_chantier.chantier_id AND user_id = auth.uid())
  );
CREATE POLICY "todo_chantier_delete" ON todo_chantier
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM chantiers WHERE id = todo_chantier.chantier_id AND user_id = auth.uid())
  );

-- chantier_updates : accès via ownership du chantier parent
CREATE POLICY "chantier_updates_select" ON chantier_updates
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM chantiers WHERE id = chantier_updates.chantier_id AND user_id = auth.uid())
  );
CREATE POLICY "chantier_updates_insert" ON chantier_updates
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM chantiers WHERE id = chantier_updates.chantier_id AND user_id = auth.uid())
  );
