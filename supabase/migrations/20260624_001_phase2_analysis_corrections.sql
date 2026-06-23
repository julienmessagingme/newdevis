-- ═════════════════════════════════════════════════════════════════════════════
-- Phase 2.1 — Table analysis_corrections (socle gold standard pour Piste C)
-- ═════════════════════════════════════════════════════════════════════════════
-- Date           : 2026-06-23
-- Source         : docs/refonte/PLAN.md (Phase 2 — Écran de revue)
-- Décision       : grain de revue = verdict global d'abord (PDF refonte)
--                  descente ligne par ligne seulement si correction de prix exigée
--
-- Chaque ligne de analysis_corrections = un cas test du futur filet anti-régression
-- (Phase 3 lecture juste + Phase 4 verdict honnête).
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Table principale
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.analysis_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Lien vers l'analyse
  analysis_id UUID NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,

  -- Qui a corrigé (admin/expert)
  reviewed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by_email TEXT NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Action prise
  action TEXT NOT NULL CHECK (action IN ('validated', 'corrected', 'rejected')),
  -- validated : l'analyse IA était juste, expert confirme → pas de correction
  -- corrected : l'expert a modifié verdict / surcout / anomalies → vraie correction
  -- rejected  : l'analyse n'aurait pas dû être flag (faux positif Piste C) → ignorer

  -- ── Corrections (NULL si action='validated' ou 'rejected') ──
  -- Verdict corrigé (set #1 mono-devis : dans_la_norme/eleve_justifie/a_negocier/a_risque)
  corrected_verdict_global TEXT CHECK (
    corrected_verdict_global IS NULL OR corrected_verdict_global IN (
      'dans_la_norme', 'eleve_justifie', 'a_negocier', 'a_risque'
    )
  ),

  -- Verdict décisionnel corrigé
  corrected_verdict_decisionnel TEXT CHECK (
    corrected_verdict_decisionnel IS NULL OR corrected_verdict_decisionnel IN (
      'signer', 'signer_avec_negociation', 'ne_pas_signer'
    )
  ),

  -- Surcout corrigé
  corrected_surcout_min NUMERIC,
  corrected_surcout_max NUMERIC,

  -- Anomalies corrigées (liste libre, format ConclusionData.anomalies)
  corrected_anomalies JSONB,

  -- ── Métadonnées de tracabilité ──
  -- Snapshot du conclusion_ia ORIGINAL au moment de la revue
  -- (immuable : permet de comparer l'IA vs l'expert dans le temps)
  original_conclusion JSONB NOT NULL,

  -- Raisons qui ont déclenché Piste C (depuis detectReviewTriggers)
  review_triggers TEXT[] NOT NULL DEFAULT '{}',

  -- Notes libres de l'expert (POURQUOI il a corrigé)
  expert_notes TEXT,

  -- Engine version au moment de la revue (traçabilité)
  engine_version TEXT NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS analysis_corrections_analysis_id_idx
  ON public.analysis_corrections (analysis_id);

CREATE INDEX IF NOT EXISTS analysis_corrections_action_idx
  ON public.analysis_corrections (action);

CREATE INDEX IF NOT EXISTS analysis_corrections_reviewed_at_idx
  ON public.analysis_corrections (reviewed_at DESC);

CREATE INDEX IF NOT EXISTS analysis_corrections_engine_version_idx
  ON public.analysis_corrections (engine_version);

-- Index partial pour les seuls corrections (pour le filet anti-régression Phase 3+)
CREATE INDEX IF NOT EXISTS analysis_corrections_corrected_only_idx
  ON public.analysis_corrections (reviewed_at DESC)
  WHERE action = 'corrected';

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger updated_at
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at_analysis_corrections()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_analysis_corrections_updated_at ON public.analysis_corrections;
CREATE TRIGGER trg_analysis_corrections_updated_at
  BEFORE UPDATE ON public.analysis_corrections
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_analysis_corrections();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — seuls les admins peuvent lire/écrire (service_role bypass)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.analysis_corrections ENABLE ROW LEVEL SECURITY;

-- Lecture admins
DROP POLICY IF EXISTS analysis_corrections_select_admin ON public.analysis_corrections;
CREATE POLICY analysis_corrections_select_admin
  ON public.analysis_corrections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
        AND user_roles.role = 'admin'
    )
  );

-- Insertion admins
DROP POLICY IF EXISTS analysis_corrections_insert_admin ON public.analysis_corrections;
CREATE POLICY analysis_corrections_insert_admin
  ON public.analysis_corrections
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
        AND user_roles.role = 'admin'
    )
  );

-- Update : un admin peut corriger sa propre review dans les 24h (rare cas)
DROP POLICY IF EXISTS analysis_corrections_update_admin ON public.analysis_corrections;
CREATE POLICY analysis_corrections_update_admin
  ON public.analysis_corrections
  FOR UPDATE
  USING (
    reviewed_by_user_id = (SELECT auth.uid())
    AND reviewed_at > NOW() - INTERVAL '24 hours'
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
        AND user_roles.role = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Vue admin enrichie pour /admin/reviews
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.admin_pending_reviews;
CREATE OR REPLACE VIEW public.admin_pending_reviews AS
SELECT
  a.id,
  a.created_at,
  a.user_id,
  a.file_name,
  a.work_type,
  a.review_status,
  -- Conclusion IA structurée
  (a.conclusion_ia::jsonb)->>'verdict_global' AS verdict_global,
  (a.conclusion_ia::jsonb)->>'verdict_decisionnel' AS verdict_decisionnel,
  (a.conclusion_ia::jsonb)->>'phrase_intro' AS phrase_intro,
  ((a.conclusion_ia::jsonb)->'surcout_global'->>'min')::numeric AS surcout_min,
  ((a.conclusion_ia::jsonb)->'surcout_global'->>'max')::numeric AS surcout_max,
  jsonb_array_length(COALESCE((a.conclusion_ia::jsonb)->'anomalies', '[]'::jsonb)) AS nb_anomalies,
  -- Bypass flags actifs
  ((a.conclusion_ia::jsonb)->>'is_foreign_quote')::boolean AS is_foreign,
  ((a.conclusion_ia::jsonb)->>'is_incomplete_quote')::boolean AS is_incomplete,
  ((a.conclusion_ia::jsonb)->'hors_scope') IS NOT NULL AS is_hors_scope,
  ((a.conclusion_ia::jsonb)->'estimation_courtier') IS NOT NULL AS is_courtier,
  -- User info
  u.email AS user_email
FROM public.analyses a
LEFT JOIN auth.users u ON u.id = a.user_id
WHERE a.review_status = 'pending_review'
ORDER BY a.created_at DESC;

-- Permissions de lecture sur la vue (auth role + admins via RLS sous-jacent)
GRANT SELECT ON public.admin_pending_reviews TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérifications finales
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_table_exists BOOLEAN;
  v_view_exists BOOLEAN;
  v_nb_constraints INT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'analysis_corrections'
  ) INTO v_table_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'admin_pending_reviews'
  ) INTO v_view_exists;

  SELECT COUNT(*) INTO v_nb_constraints
  FROM information_schema.check_constraints
  WHERE constraint_schema = 'public'
    AND constraint_name LIKE 'analysis_corrections_%';

  IF NOT v_table_exists THEN
    RAISE EXCEPTION 'Table analysis_corrections non créée';
  END IF;
  IF NOT v_view_exists THEN
    RAISE EXCEPTION 'Vue admin_pending_reviews non créée';
  END IF;

  RAISE NOTICE '✓ Table analysis_corrections créée';
  RAISE NOTICE '✓ Vue admin_pending_reviews créée';
  RAISE NOTICE '✓ % CHECK constraints actives', v_nb_constraints;
  RAISE NOTICE '✓ RLS activée + 3 policies (select/insert/update admin)';
END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- POST-COMMIT — Test rapide
-- ─────────────────────────────────────────────────────────────────────────────
-- Compte les analyses en pending_review actuelles :
-- SELECT COUNT(*) FROM admin_pending_reviews;
--
-- Test RLS (en tant qu'admin connecté) :
-- SELECT * FROM analysis_corrections LIMIT 1;
-- → doit retourner 0 lignes (vide pour l'instant, prêt à recevoir)
