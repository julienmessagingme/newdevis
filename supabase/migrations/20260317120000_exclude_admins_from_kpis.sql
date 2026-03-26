-- ============================================================================
-- Migration: Exclude admin users from all KPI views
-- Date: 2026-03-17
-- Admins (julien@messagingme.fr, bridey.johan@gmail.com) are filtered out
-- from all metrics so their test analyses don't pollute production KPIs.
-- Filter is based on user_roles (role = 'admin') — no hardcoded UUIDs.
-- ============================================================================

-- Helper: reusable subquery to get admin user IDs
-- Used inline in every view below.

-- ============================================================================
-- admin_kpis_usage
-- ============================================================================
CREATE OR REPLACE VIEW public.admin_kpis_usage
WITH (security_invoker = on) AS
SELECT
  (SELECT COUNT(DISTINCT user_id) FROM public.analyses
   WHERE user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'admin')
  ) AS total_users,
  (SELECT COUNT(*) FROM public.analyses
   WHERE user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'admin')
  ) AS total_analyses,
  (SELECT COUNT(*) FROM public.analyses
   WHERE status = 'completed'
     AND user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'admin')
  ) AS completed_analyses,
  (SELECT COUNT(*) FROM public.analyses
   WHERE status = 'pending'
     AND user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'admin')
  ) AS pending_analyses,
  (SELECT COUNT(*) FROM public.analyses
   WHERE status = 'error'
     AND user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'admin')
  ) AS error_analyses,
  (SELECT ROUND(
    COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC /
    NULLIF(COUNT(*), 0) * 100, 1
  ) FROM public.analyses
   WHERE user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'admin')
  ) AS completion_rate,
  (SELECT ROUND(COUNT(*)::NUMERIC / NULLIF(COUNT(DISTINCT user_id), 0), 1)
   FROM public.analyses
   WHERE user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'admin')
  ) AS avg_analyses_per_user;

-- ============================================================================
-- admin_kpis_scoring
-- ============================================================================
CREATE OR REPLACE VIEW public.admin_kpis_scoring
WITH (security_invoker = on) AS
SELECT
  COUNT(*) FILTER (WHERE score = 'VERT') AS score_vert,
  COUNT(*) FILTER (WHERE score = 'ORANGE') AS score_orange,
  COUNT(*) FILTER (WHERE score = 'ROUGE') AS score_rouge,
  COUNT(*) FILTER (WHERE score IS NULL AND status = 'completed') AS score_null,
  ROUND(
    COUNT(*) FILTER (WHERE score = 'VERT')::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE score IS NOT NULL), 0) * 100, 1
  ) AS pct_vert,
  ROUND(
    COUNT(*) FILTER (WHERE score = 'ORANGE')::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE score IS NOT NULL), 0) * 100, 1
  ) AS pct_orange,
  ROUND(
    COUNT(*) FILTER (WHERE score = 'ROUGE')::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE score IS NOT NULL), 0) * 100, 1
  ) AS pct_rouge
FROM public.analyses
WHERE status = 'completed'
  AND user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'admin');

-- ============================================================================
-- admin_kpis_time_analytics
-- ============================================================================
CREATE OR REPLACE VIEW public.admin_kpis_time_analytics
WITH (security_invoker = on) AS
SELECT
  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS today,
  COUNT(*) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE)) AS this_week,
  COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) AS this_month
FROM public.analyses
WHERE user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'admin');

-- ============================================================================
-- admin_kpis_daily_evolution
-- ============================================================================
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
    AND user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'admin')
  GROUP BY created_at::date
) a ON a.day = d.day
ORDER BY d.day;

-- ============================================================================
-- admin_kpis_weekly_evolution
-- ============================================================================
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
    AND user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'admin')
  GROUP BY date_trunc('week', created_at)::date
) a ON a.week_start = w.week_start
ORDER BY w.week_start;

-- ============================================================================
-- admin_kpis_alerts
-- ============================================================================
CREATE OR REPLACE VIEW public.admin_kpis_alerts
WITH (security_invoker = on) AS
WITH alert_items AS (
  SELECT jsonb_array_elements_text(alertes) AS alert_text
  FROM public.analyses
  WHERE status = 'completed'
    AND alertes IS NOT NULL
    AND jsonb_typeof(alertes) = 'array'
    AND jsonb_array_length(alertes) > 0
    AND user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'admin')
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
      NULLIF((
        SELECT COUNT(*) FROM public.analyses
        WHERE status = 'completed'
          AND user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'admin')
      ), 0),
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

-- ============================================================================
-- admin_kpis_documents
-- ============================================================================
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
  WHERE user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'admin')
) sub;
