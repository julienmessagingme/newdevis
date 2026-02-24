-- ============================================================
-- Migration: Create strategic_matrix table
-- IVP (Indice de Valorisation Patrimoniale) + IPI (Indice de Performance Investisseur)
-- Scores 0-10 par critère, calculés depuis index.ts (computeStrategicScores)
-- NOTE: seed data is in 20260224130000_fix_strategic_matrix_constraints.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.strategic_matrix (
  job_type              TEXT PRIMARY KEY,
  value_intrinseque     NUMERIC(4,1) NOT NULL DEFAULT 0,
  liquidite             NUMERIC(4,1) NOT NULL DEFAULT 0,
  attractivite          NUMERIC(4,1) NOT NULL DEFAULT 0,
  energie               NUMERIC(4,1) NOT NULL DEFAULT 0,
  reduction_risque      NUMERIC(4,1) NOT NULL DEFAULT 0,
  impact_loyer          NUMERIC(4,1) NOT NULL DEFAULT 0,
  vacance               NUMERIC(4,1) NOT NULL DEFAULT 0,
  fiscalite             NUMERIC(4,1) NOT NULL DEFAULT 0,
  capex_risk            NUMERIC(4,1) NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_strategic_matrix_job_type ON public.strategic_matrix(job_type);

ALTER TABLE public.strategic_matrix ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'strategic_matrix' AND policyname = 'strategic_matrix_public_read'
  ) THEN
    EXECUTE 'CREATE POLICY "strategic_matrix_public_read" ON public.strategic_matrix
      FOR SELECT TO anon, authenticated USING (true)';
  END IF;
END $$;
