-- Create enum for roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'
  )
$$;

-- RLS policies for user_roles table
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create a view for aggregated KPIs (anonymized)
CREATE OR REPLACE VIEW public.admin_kpis_usage AS
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

-- Create a view for scoring KPIs
CREATE OR REPLACE VIEW public.admin_kpis_scoring AS
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

-- Create a view for tracking KPIs
CREATE OR REPLACE VIEW public.admin_kpis_tracking AS
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

-- Grant access to admin views only to authenticated users who are admins
-- (We'll check admin status in the application layer)
GRANT SELECT ON public.admin_kpis_usage TO authenticated;
GRANT SELECT ON public.admin_kpis_scoring TO authenticated;
GRANT SELECT ON public.admin_kpis_tracking TO authenticated;