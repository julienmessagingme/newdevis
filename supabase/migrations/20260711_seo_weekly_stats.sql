-- ============================================================================
-- 2026-07-11 — Suivi SEO hebdomadaire via Google Search Console
-- ============================================================================
--
-- Chaque lundi 09:00 UTC, l'edge function `seo-weekly-report` interroge
-- l'API Google Search Console pour la semaine écoulée (lundi → dimanche
-- N-1), agrège par cluster (observatoire / guides / centre-aide / landing /
-- autres) et envoie un rapport email à Julien + Johan avec comparaison à
-- la semaine N-2.
--
-- Table `seo_weekly_stats` : historique lourd (retenu pour piloter le SEO
-- comme un vrai canal, comparer trimestres, détecter dérives long-terme).
-- Une ligne par (semaine, cluster). `top_queries` / `top_pages` sont des
-- JSONB pour éviter d'inflater la table (2-3 KB par ligne suffisent).
--
-- Idempotent : cron.unschedule puis cron.schedule.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

-- ── Table de stockage hebdomadaire ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.seo_weekly_stats (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start    date NOT NULL,       -- lundi
  week_end      date NOT NULL,       -- dimanche
  cluster       text NOT NULL CHECK (cluster IN (
                  'global',
                  'observatoire',
                  'guides',
                  'centre-aide',
                  'landing',
                  'autres'
                )),
  impressions   bigint NOT NULL DEFAULT 0,
  clicks        bigint NOT NULL DEFAULT 0,
  ctr           numeric(6,4),
  avg_position  numeric(6,2),
  top_queries   jsonb,               -- [{query, impressions, clicks, position}]
  top_pages     jsonb,               -- [{page, impressions, clicks, position}]
  captured_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_start, cluster)
);

CREATE INDEX IF NOT EXISTS idx_seo_weekly_stats_week
  ON public.seo_weekly_stats(week_start DESC);

CREATE INDEX IF NOT EXISTS idx_seo_weekly_stats_cluster
  ON public.seo_weekly_stats(cluster, week_start DESC);

-- Écriture réservée au service_role (l'edge function).
ALTER TABLE public.seo_weekly_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY seo_weekly_stats_service_role_all
  ON public.seo_weekly_stats
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Lecture admin (utilisée si on veut plus tard une vue admin dashboard).
CREATE POLICY seo_weekly_stats_admin_select
  ON public.seo_weekly_stats
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ── Cron : chaque lundi 09:00 UTC (~11h Paris été, 10h hiver) ──────────────
DO $$
BEGIN
  PERFORM cron.unschedule('seo-weekly-report');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'seo-weekly-report',
  '0 9 * * 1',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/seo-weekly-report',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ── Vérification post-migration ────────────────────────────────────────────
-- SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'seo-weekly-report';
-- SELECT jobname, runid, status, return_message, start_time FROM cron.job_run_details
-- WHERE jobname = 'seo-weekly-report' ORDER BY start_time DESC LIMIT 5;
