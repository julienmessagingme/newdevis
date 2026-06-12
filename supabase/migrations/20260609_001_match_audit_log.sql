-- ============================================================================
-- 2026-06-09 — Audit log des matchings catalogue marché (V3.5.11 Phase 1)
-- ============================================================================
--
-- Objectif : capturer chaque match catalogue (high/medium/low/no_match) sur les
-- analyses devis pour :
--   1. Mesurer la distribution réelle des confidences en prod
--   2. Identifier les patterns récurrents de faux positifs (= cas observés
--      Côte Maison Travaux, Florian Miranda, etc.)
--   3. Construire le gold standard de la Phase 2 (taxonomie hiérarchique
--      famille/sous-type/job_type) à partir de tes 280 devis réels
--   4. Calibrer les seuils CONFIDENCE_THRESHOLD_HIGH / MEDIUM dans le code
--
-- Volumétrie attendue : ~30 lignes par analyse × 100 analyses/mois ≈ 3000
-- inserts/mois. Aucun impact perf.
--
-- Écriture : fire-and-forget depuis l'edge function analyze-quote
-- (matchSingleLineVectorial). Aucun blocage si l'insert échoue.
--
-- Confidentialité : pas de PII. Les lignes devis sont déjà publiques via
-- l'analyse elle-même (consommée par le user). Les `description` sont du
-- libellé brut sans identifiant client ni montant éxact.
-- ============================================================================

BEGIN;

-- ── Table principale ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.match_audit_log (
  id               BIGSERIAL PRIMARY KEY,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Référence vers l'analyse (FK soft — pas de cascade pour conserver l'audit
  -- même si l'analyse est supprimée par le user). On accepte NULL si l'edge
  -- function ne peut pas le déterminer (cas rare).
  analysis_id      UUID,
  line_index       INTEGER,

  -- Ligne devis (input du matcher)
  description      TEXT NOT NULL,
  unit             TEXT,
  quantity         NUMERIC,
  amount_ht        NUMERIC,

  -- Top-1 catalogue (output du matcher)
  top_job_type     TEXT,
  top_label        TEXT,
  top_similarity   NUMERIC,
  confidence       TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low', 'no_match')),

  -- Top-5 catalogue (transparence pour rétro-analyse)
  all_candidates   JSONB,

  -- Rejets V3.5.9 gardes (si applicable)
  -- ex: ["no_lexical_overlap", "supply_vs_labor_mismatch"]
  rejected_reasons JSONB,

  -- Version du moteur au moment du match (cf. ENGINE_VERSION)
  engine_version   TEXT
);

-- ── Index ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS match_audit_log_created_at_idx
  ON public.match_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS match_audit_log_confidence_idx
  ON public.match_audit_log (confidence)
  WHERE confidence IN ('low', 'medium');

CREATE INDEX IF NOT EXISTS match_audit_log_analysis_idx
  ON public.match_audit_log (analysis_id)
  WHERE analysis_id IS NOT NULL;

-- ── Permissions ─────────────────────────────────────────────────────────────
-- service_role seulement : insertion depuis l'edge function + lecture depuis
-- les SQL queries admin. Aucun accès anon ou authenticated (PII protection
-- préventive même si les data sont du libellé brut).
REVOKE ALL ON public.match_audit_log FROM anon, authenticated;
GRANT  INSERT, SELECT ON public.match_audit_log TO service_role;
GRANT  USAGE, SELECT ON SEQUENCE public.match_audit_log_id_seq TO service_role;

COMMIT;

-- ── Vérifications post-migration ────────────────────────────────────────────
--
--   SELECT confidence, COUNT(*) AS n
--   FROM public.match_audit_log
--   WHERE created_at >= NOW() - INTERVAL '7 days'
--   GROUP BY confidence
--   ORDER BY n DESC;
--   -- Devrait montrer la distribution réelle après 1-2 jours de prod.
--
--   -- Top descriptions qui matchent low/no_match (= candidates pour Phase 2
--   -- enrichissement catalogue) :
--   SELECT description, COUNT(*) AS occurrences,
--          ARRAY_AGG(DISTINCT top_label) AS top_labels
--   FROM public.match_audit_log
--   WHERE confidence IN ('low', 'no_match')
--     AND created_at >= NOW() - INTERVAL '30 days'
--   GROUP BY description
--   HAVING COUNT(*) >= 3
--   ORDER BY occurrences DESC
--   LIMIT 50;
