-- ── Migration : référentiel de prix par lot de travaux ───────────────────────
-- Stratégie additive — zéro breaking change, rétrocompatible

-- 1. Ratios de décomposition sur market_prices
--    ratio_materiaux   : part matériaux dans le budget moyen (défaut 40%)
--    ratio_main_oeuvre : part main-d'œuvre dans le budget moyen (défaut 55%)
--    divers            : calculé côté JS = 1 - ratio_materiaux - ratio_main_oeuvre

ALTER TABLE market_prices
  ADD COLUMN IF NOT EXISTS ratio_materiaux    NUMERIC NOT NULL DEFAULT 0.40,
  ADD COLUMN IF NOT EXISTS ratio_main_oeuvre  NUMERIC NOT NULL DEFAULT 0.55;

-- 2. Colonnes de calcul sur lots_chantier
--    Toutes nullable : les lots sans price match restent fonctionnels (budget IA brut)

ALTER TABLE lots_chantier
  ADD COLUMN IF NOT EXISTS job_type        TEXT,
  ADD COLUMN IF NOT EXISTS quantite        NUMERIC,
  ADD COLUMN IF NOT EXISTS unite           TEXT,
  ADD COLUMN IF NOT EXISTS budget_min_ht   NUMERIC,
  ADD COLUMN IF NOT EXISTS budget_avg_ht   NUMERIC,
  ADD COLUMN IF NOT EXISTS budget_max_ht   NUMERIC,
  ADD COLUMN IF NOT EXISTS materiaux_ht    NUMERIC,
  ADD COLUMN IF NOT EXISTS main_oeuvre_ht  NUMERIC,
  ADD COLUMN IF NOT EXISTS divers_ht       NUMERIC;

-- Index pour les futurs lookups par job_type
CREATE INDEX IF NOT EXISTS idx_lots_chantier_job_type
  ON lots_chantier (job_type) WHERE job_type IS NOT NULL;
