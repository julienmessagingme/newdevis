-- ============================================================================
-- Migration: Optimize RLS policies, add constraints, create admin KPI views
-- Date: 2026-02-27
-- ============================================================================

-- 1. FIX RLS on analysis_work_items: IN subquery → EXISTS (correlated)
-- The IN pattern forces a full scan of analyses; EXISTS can short-circuit.
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own work items" ON public.analysis_work_items;
CREATE POLICY "Users can view own work items"
  ON public.analysis_work_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.analyses
      WHERE analyses.id = analysis_work_items.analysis_id
        AND analyses.user_id = (select auth.uid())
    )
  );

-- 2. DROP redundant index idx_blog_posts_published_at
-- Already covered by the partial index on published posts + idx_blog_posts_status
-- ============================================================================
DROP INDEX IF EXISTS idx_blog_posts_published_at;

-- 3. ADD UNIQUE constraint on price_observations(analysis_id, job_type_label)
-- Prevents duplicate snapshots per job type per analysis.
-- First deduplicate any existing rows (keep the most recent).
-- ============================================================================
DELETE FROM public.price_observations a
  USING public.price_observations b
  WHERE a.ctid < b.ctid
    AND a.analysis_id = b.analysis_id
    AND a.job_type_label = b.job_type_label;

CREATE UNIQUE INDEX IF NOT EXISTS idx_price_obs_unique_analysis_job
  ON public.price_observations(analysis_id, job_type_label);

-- 4. FIX blog_posts admin RLS: wrap is_admin() in (select ...) for per-statement eval
-- Without the wrapper, is_admin() may be called per-row on large tables.
-- ============================================================================
DROP POLICY IF EXISTS "Admins can manage all articles" ON public.blog_posts;
CREATE POLICY "Admins can manage all articles"
  ON public.blog_posts FOR ALL
  USING ((select public.is_admin()))
  WITH CHECK ((select public.is_admin()));

-- Also fix document_extractions admin policy if it exists
DROP POLICY IF EXISTS "Admins can view all extractions" ON public.document_extractions;
CREATE POLICY "Admins can view all extractions"
  ON public.document_extractions FOR SELECT
  USING ((select public.is_admin()));

-- ============================================================================
-- 5. NEW VIEWS for admin-kpis edge function (replace JS-side full table scans)
-- ============================================================================

-- 5a. Time analytics — counts for today / this week / this month
CREATE OR REPLACE VIEW public.admin_kpis_time_analytics
WITH (security_invoker = on) AS
SELECT
  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS today,
  COUNT(*) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE)) AS this_week,
  COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) AS this_month
FROM public.analyses;

-- 5b. Daily evolution — last 30 days, one row per day
CREATE OR REPLACE VIEW public.admin_kpis_daily_evolution
WITH (security_invoker = on) AS
SELECT
  d.day::date AS date,
  COALESCE(a.analyses_count, 0) AS analyses,
  COALESCE(a.vert, 0) AS vert,
  COALESCE(a.orange, 0) AS orange,
  COALESCE(a.rouge, 0) AS rouge,
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
    COUNT(*) FILTER (WHERE score = 'VERT') AS vert,
    COUNT(*) FILTER (WHERE score = 'ORANGE') AS orange,
    COUNT(*) FILTER (WHERE score = 'ROUGE') AS rouge,
    COUNT(DISTINCT user_id) AS unique_users
  FROM public.analyses
  WHERE created_at >= CURRENT_DATE - 29
  GROUP BY created_at::date
) a ON a.day = d.day
ORDER BY d.day;

-- 5c. Weekly evolution — last 12 weeks, one row per ISO week
CREATE OR REPLACE VIEW public.admin_kpis_weekly_evolution
WITH (security_invoker = on) AS
SELECT
  to_char(w.week_start, 'IYYY') || '-S' || to_char(w.week_start, 'IW') AS week,
  to_char(w.week_start, 'IW') AS label,
  COALESCE(a.analyses_count, 0) AS analyses,
  COALESCE(a.vert, 0) AS vert,
  COALESCE(a.orange, 0) AS orange,
  COALESCE(a.rouge, 0) AS rouge,
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
    COUNT(*) FILTER (WHERE score = 'VERT') AS vert,
    COUNT(*) FILTER (WHERE score = 'ORANGE') AS orange,
    COUNT(*) FILTER (WHERE score = 'ROUGE') AS rouge,
    COUNT(DISTINCT user_id) AS unique_users
  FROM public.analyses
  WHERE created_at >= date_trunc('week', CURRENT_DATE) - INTERVAL '11 weeks'
  GROUP BY date_trunc('week', created_at)::date
) a ON a.week_start = w.week_start
ORDER BY w.week_start;

-- 5d. Alerts aggregation — category counts from JSONB alertes array
CREATE OR REPLACE VIEW public.admin_kpis_alerts
WITH (security_invoker = on) AS
WITH alert_items AS (
  SELECT jsonb_array_elements_text(alertes) AS alert_text
  FROM public.analyses
  WHERE status = 'completed'
    AND alertes IS NOT NULL
    AND jsonb_typeof(alertes) = 'array'
    AND jsonb_array_length(alertes) > 0
),
categorized AS (
  SELECT
    CASE
      WHEN lower(alert_text) ~ 'siret|siren' THEN 'SIRET/SIREN'
      WHEN lower(alert_text) ~ 'assurance|décennale' THEN 'Assurance'
      WHEN lower(alert_text) ~ 'prix|tarif|cher' THEN 'Prix'
      WHEN lower(alert_text) ~ 'acompte|paiement' THEN 'Paiement'
      WHEN lower(alert_text) ~ 'tva' THEN 'TVA'
      WHEN lower(alert_text) ~ 'mention|légal' THEN 'Mentions légales'
      WHEN lower(alert_text) ~ 'rge|qualibat' THEN 'Certifications'
      ELSE 'Autre'
    END AS category
  FROM alert_items
),
totals AS (
  SELECT COUNT(*) AS total_alerts FROM categorized
),
avg_alerts AS (
  SELECT
    ROUND(
      (SELECT total_alerts FROM totals)::numeric /
      NULLIF((SELECT COUNT(*) FROM public.analyses WHERE status = 'completed'), 0),
      1
    ) AS avg_alerts_per_analysis
)
SELECT
  c.category,
  c.cnt AS count,
  ROUND(c.cnt::numeric / NULLIF(t.total_alerts, 0) * 100) AS percentage,
  t.total_alerts,
  aa.avg_alerts_per_analysis
FROM (
  SELECT category, COUNT(*) AS cnt FROM categorized GROUP BY category
) c
CROSS JOIN totals t
CROSS JOIN avg_alerts aa
ORDER BY c.cnt DESC;

-- 5e. Document type counts — extract type from raw_text JSON
CREATE OR REPLACE VIEW public.admin_kpis_documents
WITH (security_invoker = on) AS
SELECT
  COUNT(*) FILTER (WHERE doc_type = 'devis_travaux' OR doc_type IS NULL) AS devis_travaux,
  COUNT(*) FILTER (WHERE doc_type = 'devis_diagnostic_immobilier') AS devis_diagnostic,
  COUNT(*) FILTER (WHERE doc_type = 'devis_prestation_technique') AS devis_prestation_technique,
  COUNT(*) FILTER (WHERE doc_type IN ('facture', 'autre')) AS documents_refuses,
  COUNT(*) AS total
FROM (
  SELECT
    CASE
      WHEN raw_text IS NOT NULL AND raw_text LIKE '{%' THEN
        (raw_text::jsonb -> 'document_detection' ->> 'type')
      ELSE NULL
    END AS doc_type
  FROM public.analyses
) sub;

-- Grant access to authenticated users (admin check is done in edge function)
GRANT SELECT ON public.admin_kpis_time_analytics TO authenticated;
GRANT SELECT ON public.admin_kpis_daily_evolution TO authenticated;
GRANT SELECT ON public.admin_kpis_weekly_evolution TO authenticated;
GRANT SELECT ON public.admin_kpis_alerts TO authenticated;
GRANT SELECT ON public.admin_kpis_documents TO authenticated;
