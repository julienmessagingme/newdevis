-- ============================================================================
-- 2026-06-15 — V3.5.16 Piste C : revue humaine assistée des analyses à risque
-- ============================================================================
--
-- Objectif : zéro hallucination publique. Toute analyse qui touche un signal
-- "à risque" passe en `pending_review` → email à l'expert (Julien) avec lien
-- admin → validation/correction en 30s → l'analyse devient definitive.
--
-- Pendant la fenêtre `pending_review`, l'utilisateur voit un bandeau bleu
-- informatif "Validation expert en cours" (max 24h).
--
-- Critères déclenchement (cf. conclusion.ts) :
--   - verdict_global ∈ {a_risque, refuser}
--   - OU surcout_global.max > 2 000 €
--   - OU anomalies.length >= 2
--   - OU bypass actif (is_foreign_quote, is_incomplete_quote, hors_scope,
--     estimation_courtier)
--
-- Les analyses qui passent la grille (verdict signer/dans_la_norme,
-- surcout < 2k€, < 2 anomalies, pas de bypass) restent `auto_approved`
-- et sont publiées sans revue (~50-70% des cas attendus).
--
-- Une fois validées, ces analyses deviennent automatiquement du dataset
-- gold standard pour la Piste B (référentiel métier hiérarchique).
-- ============================================================================

BEGIN;

ALTER TABLE public.analyses
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'auto_approved';

-- Le CHECK est ajouté APRÈS la colonne pour que ALTER TABLE IF NOT EXISTS
-- reste idempotent (relance possible sans erreur).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'analyses_review_status_check'
  ) THEN
    ALTER TABLE public.analyses
      ADD CONSTRAINT analyses_review_status_check
      CHECK (review_status IN ('auto_approved', 'pending_review', 'validated', 'corrected'));
  END IF;
END$$;

ALTER TABLE public.analyses
  ADD COLUMN IF NOT EXISTS review_notes TEXT;

ALTER TABLE public.analyses
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE public.analyses
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index partial pour récupérer rapidement la file d'attente "à reviewer"
CREATE INDEX IF NOT EXISTS analyses_pending_review_idx
  ON public.analyses (created_at DESC)
  WHERE review_status = 'pending_review';

-- Vue d'attente expert (raccourci pour l'admin panel ultérieur)
CREATE OR REPLACE VIEW public.admin_pending_reviews AS
SELECT
  id,
  created_at,
  user_id,
  file_name,
  work_type,
  CASE
    WHEN conclusion_ia IS NULL OR conclusion_ia = '' THEN NULL
    WHEN conclusion_ia ~ '^\s*\{' THEN (conclusion_ia::jsonb)->>'verdict_global'
    ELSE NULL
  END AS verdict_global,
  CASE
    WHEN conclusion_ia IS NULL OR conclusion_ia = '' THEN NULL
    WHEN conclusion_ia ~ '^\s*\{' THEN
      ((conclusion_ia::jsonb)->'surcout_global'->>'estimation_ht_devis')::numeric
    ELSE NULL
  END AS surcout_estime
FROM public.analyses
WHERE review_status = 'pending_review'
ORDER BY created_at DESC;

REVOKE ALL ON public.admin_pending_reviews FROM anon, authenticated;
GRANT  SELECT ON public.admin_pending_reviews TO service_role;

COMMIT;
