-- ============================================================================
-- 20260512130000_admin_kpis_use_verdict_global.sql
-- ============================================================================
-- Aligne les KPI admin sur la source unique de vérité V3.3+ :
--   conclusion_ia.verdict_global → mappé VERT/ORANGE/ROUGE
--   fallback sur `analyses.score` (legacy) si conclusion_ia absent
--
-- AVANT cette migration, les vues lisaient `analyses.score` qui pouvait
-- diverger du verdict réel affiché à l'utilisateur après escalade par la
-- garde de cohérence (ex: hero "+18 600€" + escalade en a_negocier, mais
-- score legacy resté à "VERT" car 0 anomalie identifiée poste par poste).
--
-- Cf. CLAUDE.md règles V3.3.1 #1 et #6 : un seul score, une seule source.
-- ============================================================================

-- Fonction utilitaire : convertit le verdict canonique vers le score affichable.
-- - Multi-devis : on prend global_metrics.verdict_global.
-- - Mono-devis  : on prend conclusion_ia.verdict_global.
-- - Fallback    : on garde la colonne `score` legacy si rien de mieux.
CREATE OR REPLACE FUNCTION public.derive_display_score(
  legacy_score      TEXT,
  conclusion_ia     JSONB,
  global_metrics    JSONB,
  multiple_quotes   BOOLEAN
) RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE
    -- 1) Multi-devis : global_metrics canonique
    WHEN multiple_quotes = TRUE AND global_metrics ? 'verdict_global' THEN
      CASE global_metrics->>'verdict_global'
        WHEN 'signer'                  THEN 'VERT'
        WHEN 'signer_avec_negociation' THEN 'ORANGE'
        WHEN 'a_negocier'              THEN 'ORANGE'
        WHEN 'ne_pas_signer'           THEN 'ROUGE'
        WHEN 'refuser'                 THEN 'ROUGE'
        ELSE legacy_score
      END
    -- 2) Mono-devis : conclusion_ia (post-escalade)
    WHEN conclusion_ia ? 'verdict_global' THEN
      CASE conclusion_ia->>'verdict_global'
        WHEN 'signer'                  THEN 'VERT'
        WHEN 'signer_avec_negociation' THEN 'ORANGE'
        WHEN 'a_negocier'              THEN 'ORANGE'
        WHEN 'ne_pas_signer'           THEN 'ROUGE'
        WHEN 'refuser'                 THEN 'ROUGE'
        ELSE legacy_score
      END
    -- 3) Fallback legacy
    ELSE legacy_score
  END;
$$;

GRANT EXECUTE ON FUNCTION public.derive_display_score(TEXT, JSONB, JSONB, BOOLEAN) TO authenticated, anon, service_role;

-- ============================================================================
-- admin_kpis_scoring — réécriture pour utiliser derive_display_score
-- ============================================================================
CREATE OR REPLACE VIEW public.admin_kpis_scoring
WITH (security_invoker = on) AS
WITH scored AS (
  SELECT
    public.derive_display_score(score, conclusion_ia, global_metrics, multiple_quotes) AS effective_score,
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
    COUNT(*) FILTER (WHERE public.derive_display_score(score, conclusion_ia, global_metrics, multiple_quotes) = 'VERT')   AS vert,
    COUNT(*) FILTER (WHERE public.derive_display_score(score, conclusion_ia, global_metrics, multiple_quotes) = 'ORANGE') AS orange,
    COUNT(*) FILTER (WHERE public.derive_display_score(score, conclusion_ia, global_metrics, multiple_quotes) = 'ROUGE')  AS rouge,
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
    COUNT(*) FILTER (WHERE public.derive_display_score(score, conclusion_ia, global_metrics, multiple_quotes) = 'VERT')   AS vert,
    COUNT(*) FILTER (WHERE public.derive_display_score(score, conclusion_ia, global_metrics, multiple_quotes) = 'ORANGE') AS orange,
    COUNT(*) FILTER (WHERE public.derive_display_score(score, conclusion_ia, global_metrics, multiple_quotes) = 'ROUGE')  AS rouge,
    COUNT(DISTINCT user_id) AS unique_users
  FROM public.analyses
  WHERE created_at >= date_trunc('week', CURRENT_DATE) - INTERVAL '11 weeks'
    AND user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'admin')
  GROUP BY date_trunc('week', created_at)::date
) a ON a.week_start = w.week_start
ORDER BY w.week_start;

GRANT SELECT ON public.admin_kpis_weekly_evolution TO authenticated;

COMMENT ON FUNCTION public.derive_display_score(TEXT, JSONB, JSONB, BOOLEAN) IS
  'V3.4.6 — Convertit le verdict canonique (conclusion_ia.verdict_global ou global_metrics.verdict_global pour le multi-devis) vers le score affichable VERT/ORANGE/ROUGE. Fallback sur la colonne legacy `score` si aucun verdict n''est disponible. Source unique de vérité pour tous les KPI admin.';
