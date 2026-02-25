-- ============================================================
-- Migration: Add recovery_rate to strategic_matrix
-- + upsert 15 simulator high-level categories (0-10 scale)
-- ============================================================

ALTER TABLE public.strategic_matrix
  ADD COLUMN IF NOT EXISTS recovery_rate NUMERIC(4,3) NOT NULL DEFAULT 0.50;

-- ── Simulator categories: 15 high-level types ──
-- Scores on 0-10 scale (same as existing catalog entries)
-- ON CONFLICT → only update recovery_rate (preserve existing catalog IVP/IPI scores)
INSERT INTO public.strategic_matrix
  (job_type, value_intrinseque, liquidite, attractivite, energie, reduction_risque,
   impact_loyer, vacance, fiscalite, capex_risk, recovery_rate)
VALUES
  -- Structure / extension
  ('extension',               10, 9, 9, 2, 6,   8, 8, 2, 4,   0.850),
  ('combles',                  8, 8, 8, 5, 5,   6, 6, 4, 4,   0.800),
  -- Énergie
  ('renovation_energetique',   6, 8, 6,10, 7,   6, 8, 8, 2,   0.800),
  ('isolation',                5, 6, 4, 9, 7,   4, 6, 8, 2,   0.700),
  -- Sécurité / conformité
  ('toiture',                  7, 7, 5, 4, 9,   3, 6, 2, 2,   0.700),
  ('assainissement',           3, 7, 2, 2,10,   2, 3, 1, 2,   0.700),
  -- Aménagement
  ('redistribution',           7, 6, 8, 1, 4,   6, 6, 2, 4,   0.600),
  ('veranda',                  6, 4, 8, 2, 3,   4, 4, 2, 6,   0.600),
  -- Technique
  ('electricite',              3, 7, 2, 4,10,   2, 4, 2, 2,   0.600),
  ('photovoltaique',           5, 5, 6,10, 4,   4, 4,10, 4,   0.600),
  -- Pièces humides / cuisine
  ('cuisine',                  9, 8, 9, 2, 3,   7, 8, 2, 5,   0.500),
  ('salle_bain',               8, 7, 9, 3, 4,   6, 8, 2, 5,   0.500),
  -- Extérieur
  ('terrasse',                 6, 4, 8, 1, 3,   4, 4, 1, 6,   0.500),
  -- Confort
  ('climatisation',            4, 5, 6, 5, 3,   4, 4, 3, 6,   0.400),
  ('piscine',                  5, 2, 8, 1, 1,   3, 2, 1, 7,   0.400)

ON CONFLICT (job_type) DO UPDATE SET
  recovery_rate = EXCLUDED.recovery_rate;
