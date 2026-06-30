-- ═════════════════════════════════════════════════════════════════════════════
-- Comparateur de devis V1 — Table comparisons
-- ═════════════════════════════════════════════════════════════════════════════
-- Date : 2026-06-30
-- Spec : docs/specs/COMPARATEUR-DEVIS-V1.md
--
-- Permet à un utilisateur de comparer 2 à 4 analyses VMD (cas A : mêmes
-- travaux, périmètres alignés). Stocke le verdict expert calculé + le
-- périmètre commun reconstruit.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,                              -- "Comparaison Rénovation SDB" (auto ou éditable)
  analysis_ids UUID[] NOT NULL,            -- [analysis_id_1, ..., analysis_id_4]
  verdict JSONB,                           -- ConclusionComparator complet
  perimeter JSONB,                         -- périmètre commun reconstruit par job_type
  status TEXT NOT NULL DEFAULT 'pending'   -- pending | computing | ready | failed | rejected_perimeter
    CHECK (status IN ('pending', 'computing', 'ready', 'failed', 'rejected_perimeter')),
  error_message TEXT,                      -- si status='failed' ou 'rejected_perimeter'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT comparisons_min_max_analyses
    CHECK (array_length(analysis_ids, 1) BETWEEN 2 AND 4)
);

CREATE INDEX IF NOT EXISTS comparisons_user_id_idx ON public.comparisons(user_id);
CREATE INDEX IF NOT EXISTS comparisons_created_at_idx ON public.comparisons(created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — chaque user voit / écrit uniquement ses propres comparaisons
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.comparisons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comparisons_select_own ON public.comparisons;
CREATE POLICY comparisons_select_own
  ON public.comparisons FOR SELECT
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS comparisons_insert_own ON public.comparisons;
CREATE POLICY comparisons_insert_own
  ON public.comparisons FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS comparisons_update_own ON public.comparisons;
CREATE POLICY comparisons_update_own
  ON public.comparisons FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS comparisons_delete_own ON public.comparisons;
CREATE POLICY comparisons_delete_own
  ON public.comparisons FOR DELETE
  USING (user_id = (SELECT auth.uid()));

-- Admin policy : peut tout voir
DROP POLICY IF EXISTS comparisons_select_admin ON public.comparisons;
CREATE POLICY comparisons_select_admin
  ON public.comparisons FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
        AND user_roles.role = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger updated_at
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.comparisons_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comparisons_set_updated_at ON public.comparisons;
CREATE TRIGGER comparisons_set_updated_at
  BEFORE UPDATE ON public.comparisons
  FOR EACH ROW
  EXECUTE FUNCTION public.comparisons_touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérification
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'comparisons'
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'Table comparisons non créée';
  END IF;
  RAISE NOTICE '✓ Table comparisons créée';
  RAISE NOTICE '✓ 2 indexes (user_id, created_at)';
  RAISE NOTICE '✓ RLS activée + 5 policies (select own/admin, insert/update/delete own)';
  RAISE NOTICE '✓ Trigger updated_at';
  RAISE NOTICE '✓ Contrainte array_length BETWEEN 2 AND 4';
END $$;

COMMIT;
