-- ============================================================================
-- Migration: User retention analytics views
-- Date: 2026-04-20
-- New users (first analysis on that day) vs returning users (prior analysis).
-- Also: all-time list of users with >1 analysis, with email from auth.users.
-- ============================================================================

-- Daily new vs returning (30-day window)
CREATE OR REPLACE VIEW public.admin_kpis_retention_daily AS
WITH admin_ids AS (
  SELECT user_id FROM public.user_roles WHERE role = 'admin'
),
first_analysis AS (
  SELECT user_id, MIN(DATE(created_at AT TIME ZONE 'UTC')) AS first_date
  FROM public.analyses
  WHERE user_id NOT IN (SELECT user_id FROM admin_ids)
  GROUP BY user_id
)
SELECT
  DATE(a.created_at AT TIME ZONE 'UTC') AS day,
  COUNT(DISTINCT CASE WHEN DATE(a.created_at AT TIME ZONE 'UTC') = fa.first_date THEN a.user_id END) AS new_users,
  COUNT(DISTINCT CASE WHEN DATE(a.created_at AT TIME ZONE 'UTC') > fa.first_date THEN a.user_id END) AS returning_users
FROM public.analyses a
JOIN first_analysis fa ON a.user_id = fa.user_id
WHERE a.created_at >= NOW() - INTERVAL '30 days'
  AND a.user_id NOT IN (SELECT user_id FROM admin_ids)
GROUP BY DATE(a.created_at AT TIME ZONE 'UTC')
ORDER BY day;

-- Weekly new vs returning (12-week window)
CREATE OR REPLACE VIEW public.admin_kpis_retention_weekly AS
WITH admin_ids AS (
  SELECT user_id FROM public.user_roles WHERE role = 'admin'
),
first_analysis AS (
  SELECT user_id, date_trunc('week', MIN(created_at AT TIME ZONE 'UTC')) AS first_week
  FROM public.analyses
  WHERE user_id NOT IN (SELECT user_id FROM admin_ids)
  GROUP BY user_id
)
SELECT
  date_trunc('week', a.created_at AT TIME ZONE 'UTC') AS week,
  COUNT(DISTINCT CASE WHEN date_trunc('week', a.created_at AT TIME ZONE 'UTC') = fa.first_week THEN a.user_id END) AS new_users,
  COUNT(DISTINCT CASE WHEN date_trunc('week', a.created_at AT TIME ZONE 'UTC') > fa.first_week THEN a.user_id END) AS returning_users
FROM public.analyses a
JOIN first_analysis fa ON a.user_id = fa.user_id
WHERE a.created_at >= NOW() - INTERVAL '12 weeks'
  AND a.user_id NOT IN (SELECT user_id FROM admin_ids)
GROUP BY date_trunc('week', a.created_at AT TIME ZONE 'UTC')
ORDER BY week;

-- All-time: users who came back (>1 analysis total), sorted by frequency.
-- Joins auth.users for email (no security_invoker — runs as view owner with service_role).
CREATE OR REPLACE VIEW public.admin_kpis_returning_users AS
SELECT
  a.user_id,
  au.email,
  COUNT(*) AS analysis_count,
  MIN(a.created_at) AS first_analysis_at,
  MAX(a.created_at) AS last_analysis_at,
  COUNT(*) FILTER (WHERE a.status = 'completed') AS completed_count
FROM public.analyses a
LEFT JOIN auth.users au ON a.user_id = au.id
WHERE a.user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'admin')
GROUP BY a.user_id, au.email
HAVING COUNT(*) > 1
ORDER BY analysis_count DESC;
