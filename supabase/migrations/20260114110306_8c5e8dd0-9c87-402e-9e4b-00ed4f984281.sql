-- Drop and recreate views with security_invoker
DROP VIEW IF EXISTS public.admin_kpis_usage;
DROP VIEW IF EXISTS public.admin_kpis_scoring;
DROP VIEW IF EXISTS public.admin_kpis_tracking;

-- Recreate view for aggregated KPIs (anonymized) with security_invoker
CREATE OR REPLACE VIEW public.admin_kpis_usage
WITH (security_invoker = on) AS
SELECT
  (SELECT COUNT(DISTINCT user_id) FROM public.analyses) AS total_users,
  (SELECT COUNT(*) FROM public.analyses) AS total_analyses,
  (SELECT COUNT(*) FROM public.analyses WHERE status = 'completed') AS completed_analyses,
  (SELECT COUNT(*) FROM public.analyses WHERE status = 'pending') AS pending_analyses,
  (SELECT COUNT(*) FROM public.analyses WHERE status = 'error') AS error_analyses,
  (SELECT ROUND(
    COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC / 
    NULLIF(COUNT(*), 0) * 100, 1
  ) FROM public.analyses) AS completion_rate,
  (SELECT ROUND(COUNT(*)::NUMERIC / NULLIF(COUNT(DISTINCT user_id), 0), 1) FROM public.analyses) AS avg_analyses_per_user;

-- Recreate view for scoring KPIs with security_invoker
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
WHERE status = 'completed';

-- Recreate view for tracking KPIs with security_invoker
CREATE OR REPLACE VIEW public.admin_kpis_tracking
WITH (security_invoker = on) AS
SELECT
  COUNT(*) AS total_tracking_entries,
  COUNT(*) FILTER (WHERE tracking_consent = true) AS consent_given,
  ROUND(
    COUNT(*) FILTER (WHERE tracking_consent = true)::NUMERIC / 
    NULLIF(COUNT(*), 0) * 100, 1
  ) AS consent_rate,
  COUNT(*) FILTER (WHERE phone_number IS NOT NULL AND tracking_consent = true) AS whatsapp_enabled,
  ROUND(
    COUNT(*) FILTER (WHERE phone_number IS NOT NULL AND tracking_consent = true)::NUMERIC / 
    NULLIF(COUNT(*) FILTER (WHERE tracking_consent = true), 0) * 100, 1
  ) AS whatsapp_rate,
  COUNT(*) FILTER (WHERE work_completion_status IS NOT NULL) AS responses_received,
  COUNT(*) FILTER (WHERE work_completion_status = 'oui') AS status_completed,
  COUNT(*) FILTER (WHERE work_completion_status = 'en_cours') AS status_in_progress,
  COUNT(*) FILTER (WHERE work_completion_status = 'non_retard') AS status_delayed,
  COUNT(*) FILTER (WHERE is_signed = true) AS signed_quotes
FROM public.post_signature_tracking;

-- Re-grant access
GRANT SELECT ON public.admin_kpis_usage TO authenticated;
GRANT SELECT ON public.admin_kpis_scoring TO authenticated;
GRANT SELECT ON public.admin_kpis_tracking TO authenticated;