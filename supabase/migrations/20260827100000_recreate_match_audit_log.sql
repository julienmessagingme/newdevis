-- ============================================================================
-- 2026-08-27 — RE-CRÉATION de match_audit_log (découverte session mining)
--
-- La migration 20260609_001 est marquée appliquée dans schema_migrations mais
-- la table N'EXISTE PAS en prod (marquage manuel de l'époque sans exécution).
-- Conséquence : les inserts fire-and-forget de matchSingleLineVectorial
-- échouent en silence depuis le 09/06 — l'audit des matchs est perdu sur la
-- période. DDL identique (idempotent) pour réactiver la collecte.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.match_audit_log (
  id               BIGSERIAL PRIMARY KEY,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  analysis_id      UUID,
  line_index       INTEGER,
  description      TEXT NOT NULL,
  unit             TEXT,
  quantity         NUMERIC,
  amount_ht        NUMERIC,
  top_job_type     TEXT,
  top_label        TEXT,
  top_similarity   NUMERIC,
  confidence       TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low', 'no_match')),
  all_candidates   JSONB,
  rejected_reasons JSONB,
  engine_version   TEXT
);

CREATE INDEX IF NOT EXISTS match_audit_log_created_at_idx
  ON public.match_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS match_audit_log_confidence_idx
  ON public.match_audit_log (confidence)
  WHERE confidence IN ('low', 'medium');
CREATE INDEX IF NOT EXISTS match_audit_log_analysis_idx
  ON public.match_audit_log (analysis_id)
  WHERE analysis_id IS NOT NULL;

ALTER TABLE public.match_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.match_audit_log FROM anon, authenticated;
GRANT  INSERT, SELECT ON public.match_audit_log TO service_role;
GRANT  USAGE, SELECT ON SEQUENCE public.match_audit_log_id_seq TO service_role;
