-- ============================================================
-- DASHBOARD CHANTIER — Ajout colonnes emoji + phase
-- ============================================================

-- Ajoute la colonne emoji (pictogramme du chantier)
ALTER TABLE chantiers
  ADD COLUMN IF NOT EXISTS emoji TEXT NOT NULL DEFAULT '🏠';

-- Ajoute la colonne phase (étape courante du chantier)
ALTER TABLE chantiers
  ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'preparation'
  CHECK (phase IN ('preparation', 'gros_oeuvre', 'second_oeuvre', 'finitions', 'reception'));

-- Index pour les requêtes de dashboard (tri multi-chantiers)
CREATE INDEX IF NOT EXISTS idx_chantiers_user_created
  ON chantiers (user_id, created_at DESC);

-- Commentaires
COMMENT ON COLUMN chantiers.emoji IS 'Pictogramme emoji représentant le type de chantier (ex: 🛁, 🍳)';
COMMENT ON COLUMN chantiers.phase IS 'Phase courante du chantier parmi : preparation, gros_oeuvre, second_oeuvre, finitions, reception';
