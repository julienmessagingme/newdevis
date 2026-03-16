-- Migration: add project_mode column to chantiers table
-- Values: 'guided' | 'flexible' | 'investor'
-- Default: NULL (chantiers created before this migration have no mode)

ALTER TABLE chantiers
  ADD COLUMN IF NOT EXISTS project_mode TEXT
    CHECK (project_mode IN ('guided', 'flexible', 'investor'));

-- Index for potential filtering by mode
CREATE INDEX IF NOT EXISTS idx_chantiers_project_mode
  ON chantiers (project_mode)
  WHERE project_mode IS NOT NULL;
