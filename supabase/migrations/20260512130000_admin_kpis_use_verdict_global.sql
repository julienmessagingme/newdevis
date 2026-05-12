-- ============================================================================
-- 20260512130000_admin_kpis_use_verdict_global.sql
-- ============================================================================
-- Aligne les KPI admin sur la source unique de vérité V3.3+ :
--   conclusion_ia.verdict_global → mappé VERT/ORANGE/ROUGE
--   fallback sur `analyses.score` (legacy) si conclusion_ia absent
--
-- ATTENTION schéma :
--   - `conclusion_ia` est une colonne TEXT (JSON sérialisé en string) — pas JSONB.
--   - `multiple_quotes` + `global_metrics` ne sont PAS des colonnes propres ;
--     ils vivent dans `raw_text` (TEXT JSON aussi). Cf.
--     supabase/functions/analyze-quote/index.ts:962-978 (rawDataForDebug).
--
-- AVANT cette migration, les vues lisaient `analyses.score` qui pouvait
-- diverger du verdict réel affiché à l'utilisateur après escalade par la
-- garde de cohérence (ex: hero "+18 600€" + escalade en a_negocier, mais
-- score legacy resté à "VERT" car 0 anomalie identifiée poste par poste).
--
-- Cf. CLAUDE.md règles V3.3.1 #1 et #6 : un seul score, une seule source.
-- ============================================================================

-- Cleanup d'une éventuelle version 4-args créée par une tentative précédente
-- (avant qu'on découvre que global_metrics/multiple_quotes ne sont pas des colonnes).
DROP FUNCTION IF EXISTS public.derive_display_score(TEXT, JSONB, JSONB, BOOLEAN);

-- Fonction utilitaire : convertit le verdict canonique vers le score affichable.
-- Lit conclusion_ia (TEXT JSON) + raw_text (TEXT JSON contenant global_metrics +
-- multiple_quotes en multi-devis). Tous les casts sont protégés contre les
-- chaînes mal formées via un parseur safe.
CREATE OR REPLACE FUNCTION public.derive_display_score(
  legacy_score      TEXT,
  conclusion_ia_txt TEXT,
  raw_text_txt      TEXT
) RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  conclusion_obj JSONB := NULL;
  raw_obj        JSONB := NULL;
  is_multi       BOOLEAN := FALSE;
  global_verdict TEXT := NULL;
  mono_verdict   TEXT := NULL;
BEGIN
  -- Parse conclusion_ia
  IF conclusion_ia_txt IS NOT NULL AND conclusion_ia_txt <> '' THEN
    BEGIN
      conclusion_obj := conclusion_ia_txt::JSONB;
    EXCEPTION WHEN OTHERS THEN
      conclusion_obj := NULL;
    END;
  END IF;

  -- Parse raw_text
  IF raw_text_txt IS NOT NULL AND raw_text_txt <> '' THEN
    BEGIN
      raw_obj := raw_text_txt::JSONB;
    EXCEPTION WHEN OTHERS THEN
      raw_obj := NULL;
    END;
  END IF;

  -- Multi-devis : raw_obj.document_detection.multiple_quotes = true OU raw_obj.multiple_quotes = true
  IF raw_obj IS NOT NULL THEN
    is_multi := COALESCE(raw_obj #>> '{document_detection,multiple_quotes}', '') = 'true'
             OR COALESCE(raw_obj ->> 'multiple_quotes', '')                    = 'true';
    IF is_multi THEN
      global_verdict := raw_obj #>> '{global_metrics,verdict_global}';
    END IF;
  END IF;

  -- Mono-devis verdict
  IF conclusion_obj IS NOT NULL THEN
    mono_verdict := conclusion_obj ->> 'verdict_global';
  END IF;

  -- Priorité multi → mono → legacy
  IF is_multi AND global_verdict IS NOT NULL THEN
    RETURN CASE global_verdict
      WHEN 'signer'                  THEN 'VERT'
      WHEN 'signer_avec_negociation' THEN 'ORANGE'
      WHEN 'a_negocier'              THEN 'ORANGE'
      WHEN 'ne_pas_signer'           THEN 'ROUGE'
      WHEN 'refuser'                 THEN 'ROUGE'
      ELSE legacy_score
    END;
  END IF;

  IF mono_verdict IS NOT NULL THEN
    RETURN CASE mono_verdict
      WHEN 'signer'                  THEN 'VERT'
      WHEN 'signer_avec_negociation' THEN 'ORANGE'
      WHEN 'a_negocier'              THEN 'ORANGE'
      WHEN 'ne_pas_signer'           THEN 'ROUGE'
      WHEN 'refuser'                 THEN 'ROUGE'
      ELSE legacy_score
    END;
  END IF;

  RETURN legacy_score;
END;
$$;

GRANT EXECUTE ON FUNCTION public.derive_display_score(TEXT, TEXT, TEXT) TO authenticated, anon, service_role;

-- ============================================================================
-- admin_kpis_scoring — réécriture pour utiliser derive_display_score
-- ============================================================================
CREATE OR REPLACE VIEW public.admin_kpis_scoring
WITH (security_invoker = on) AS
WITH scored AS (
  SELECT
    public.derive_display_score(score, conclusion_ia, raw_text) AS effective_score,
    status
  FROM public.analyses
  WHERE status = 'completed'
    AND user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'admin')
)
SELECT
  COUNT(*) FILTER (WHERE effective_score = 'VERT')   AS score_vert,
  COUNT(*) FILTER (WHERE effective_score = 'ORANGE') AS score_orange,
  COUNT(*) FILTER (WHERE effective_score = 'ROUGE')  AS score_rouge,
  COUNT(*) FILTER (WHERE effective_score IS NULL)    AS score_null,
  ROUND(
    COUNT(*) FILTER (WHERE effective_score = 'VERT')::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE effective_score IS NOT NULL), 0) * 100, 1
  ) AS pct_vert,
  ROUND(
    COUNT(*) FILTER (WHERE effective_score = 'ORANGE')::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE effective_score IS NOT NULL), 0) * 100, 1
  ) AS pct_orange,
  ROUND(
    COUNT(*) FILTER (WHERE effective_score = 'ROUGE')::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE effective_score IS NOT NULL), 0) * 100, 1
  ) AS pct_rouge
FROM scored;

GRANT SELECT ON public.admin_kpis_scoring TO authenticated;

-- ============================================================================
-- admin_kpis_daily_evolution — idem
-- ============================================================================
CREATE OR REPLACE VIEW public.admin_kpis_daily_evolution
WITH (security_invoker = on) AS
SELECT
  d.day::date AS date,
  COALESCE(a.analyses_count, 0) AS analyses,
  COALESCE(a.vert, 0)   AS vert,
  COALESCE(a.orange, 0) AS orange,
  COALESCE(a.rouge, 0)  AS rouge,
  COALESCE(a.unique_users, 0) AS users
FROM generate_series(
  CURRENT_DATE - 29,
  CURRENT_DATE,
  '1 day'::interval
) AS d(day)
LEFT JOIN (
  SELECT
    created_at::date AS day,
    COUNT(*) AS analyses_count,
    COUNT(*) FILTER (WHERE public.derive_display_score(score, conclusion_ia, raw_text) = 'VERT')   AS vert,
    COUNT(*) FILTER (WHERE public.derive_display_score(score, conclusion_ia, raw_text) = 'ORANGE') AS orange,
    COUNT(*) FILTER (WHERE public.derive_display_score(score, conclusion_ia, raw_text) = 'ROUGE')  AS rouge,
    COUNT(DISTINCT user_id) AS unique_users
  FROM public.analyses
  WHERE created_at >= CURRENT_DATE - 29
    AND user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'admin')
  GROUP BY created_at::date
) a ON a.day = d.day
ORDER BY d.day;

GRANT SELECT ON public.admin_kpis_daily_evolution TO authenticated;

-- ============================================================================
-- admin_kpis_weekly_evolution — idem
-- ============================================================================
CREATE OR REPLACE VIEW public.admin_kpis_weekly_evolution
WITH (security_invoker = on) AS
SELECT
  to_char(w.week_start, 'IYYY') || '-S' || to_char(w.week_start, 'IW') AS week,
  to_char(w.week_start, 'IW') AS label,
  COALESCE(a.analyses_count, 0) AS analyses,
  COALESCE(a.vert, 0)   AS vert,
  COALESCE(a.orange, 0) AS orange,
  COALESCE(a.rouge, 0)  AS rouge,
  COALESCE(a.unique_users, 0) AS users
FROM generate_series(
  date_trunc('week', CURRENT_DATE) - INTERVAL '11 weeks',
  date_trunc('week', CURRENT_DATE),
  '1 week'::interval
) AS w(week_start)
LEFT JOIN (
  SELECT
    date_trunc('week', created_at)::date AS week_start,
    COUNT(*) AS analyses_count,
    COUNT(*) FILTER (WHERE public.derive_display_score(score, conclusion_ia, raw_text) = 'VERT')   AS vert,
    COUNT(*) FILTER (WHERE public.derive_display_score(score, conclusion_ia, raw_text) = 'ORANGE') AS orange,
    COUNT(*) FILTER (WHERE public.derive_display_score(score, conclusion_ia, raw_text) = 'ROUGE')  AS rouge,
    COUNT(DISTINCT user_id) AS unique_users
  FROM public.analyses
  WHERE created_at >= date_trunc('week', CURRENT_DATE) - INTERVAL '11 weeks'
    AND user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'admin')
  GROUP BY date_trunc('week', created_at)::date
) a ON a.week_start = w.week_start
ORDER BY w.week_start;

GRANT SELECT ON public.admin_kpis_weekly_evolution TO authenticated;

COMMENT ON FUNCTION public.derive_display_score(TEXT, TEXT, TEXT) IS
  'V3.4.6 — Convertit le verdict canonique (conclusion_ia.verdict_global ou global_metrics.verdict_global pour le multi-devis, depuis raw_text JSON) vers le score affichable VERT/ORANGE/ROUGE. Fallback sur la colonne legacy `score` si aucun verdict n''est disponible. Source unique de vérité pour tous les KPI admin. NB: conclusion_ia et raw_text sont des colonnes TEXT (JSON sérialisé), pas JSONB.';
