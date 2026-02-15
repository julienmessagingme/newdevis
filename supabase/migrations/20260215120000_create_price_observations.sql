-- Table price_observations : données "gold" des groupements job type
-- Survit à la suppression des analyses (pas de FK CASCADE)
-- Utilisée pour le benchmarking prix marché par job type et zone géographique

CREATE TABLE IF NOT EXISTS price_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID,  -- référence sans FK, pas de CASCADE
  user_id UUID NOT NULL,
  job_type_label TEXT NOT NULL,
  catalog_job_types TEXT[] DEFAULT '{}',
  main_unit TEXT NOT NULL DEFAULT 'forfait',
  main_quantity NUMERIC NOT NULL DEFAULT 1,
  devis_total_ht NUMERIC,
  line_count INTEGER NOT NULL DEFAULT 0,
  devis_lines JSONB NOT NULL DEFAULT '[]',
  zip_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour requêtes d'agrégation big data
CREATE INDEX idx_price_obs_job_type ON price_observations(job_type_label);
CREATE INDEX idx_price_obs_catalog ON price_observations USING GIN(catalog_job_types);
CREATE INDEX idx_price_obs_zip ON price_observations(zip_code);
CREATE INDEX idx_price_obs_user ON price_observations(user_id);
CREATE INDEX idx_price_obs_analysis ON price_observations(analysis_id);

-- RLS : les edge functions utilisent service_role (bypass RLS)
-- Pas besoin de policy pour anon/authenticated en lecture pour l'instant
ALTER TABLE price_observations ENABLE ROW LEVEL SECURITY;

-- Policy admin : lecture complète pour les admins
CREATE POLICY "admin_read_price_observations" ON price_observations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  );

-- Policy user : lecture de ses propres observations
CREATE POLICY "user_read_own_price_observations" ON price_observations
  FOR SELECT USING (auth.uid() = user_id);
