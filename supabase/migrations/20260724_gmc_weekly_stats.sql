-- ============================================================================
-- 2026-07-24 — Suivi hebdomadaire GMC (inscriptions, activation, rétention)
-- ============================================================================
--
-- Chaque lundi 08:00 UTC, l'edge function `gmc-weekly-report` calcule les KPIs
-- de la semaine écoulée (lundi -> dimanche N-1), les compare à la semaine
-- N-2 stockée, écrit en base et envoie un rapport email HTML à Julien +
-- Johan.
--
-- KPIs suivis :
--   - inscriptions_total          nb de gmc_subscriptions créées
--   - inscriptions_via_gmc        signup_source = 'gerermonchantier'
--   - inscriptions_via_vmd        signup_source = 'verifiermondevis'
--   - activation_j7               % inscrits qui ont créé >=1 chantier dans les 7j
--   - inscrits_avec_chantier      valeur brute pour le calcul
--   - trial_actifs_j14            % actifs (dernière connexion < 14j) parmi les essais
--   - trial_ended_no_conversion   nb d'essais expirés sans passage payant
--   - conversions_trial_paid      nb de trials -> active dans la semaine
--   - top_users                   5 inscrits les plus actifs (JSONB)
--
-- Idempotent : cron.unschedule puis cron.schedule.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.gmc_weekly_stats (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start                    date NOT NULL UNIQUE,     -- lundi
  week_end                      date NOT NULL,            -- dimanche
  inscriptions_total            integer NOT NULL DEFAULT 0,
  inscriptions_via_gmc          integer NOT NULL DEFAULT 0,
  inscriptions_via_vmd          integer NOT NULL DEFAULT 0,
  inscrits_avec_chantier        integer NOT NULL DEFAULT 0,
  activation_rate_j7            numeric(5,2),             -- pourcentage
  trial_actifs_j14              integer NOT NULL DEFAULT 0,
  trial_ended_no_conversion     integer NOT NULL DEFAULT 0,
  conversions_trial_paid        integer NOT NULL DEFAULT 0,
  top_users                     jsonb,                    -- [{email, first_name, nb_chantiers, nb_docs, last_activity}]
  captured_at                   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gmc_weekly_stats_week
  ON public.gmc_weekly_stats(week_start DESC);

ALTER TABLE public.gmc_weekly_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY gmc_weekly_stats_service_role_all
  ON public.gmc_weekly_stats
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY gmc_weekly_stats_admin_select
  ON public.gmc_weekly_stats
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ── Cron : chaque lundi 08:00 UTC (~10h Paris été) ─────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('gmc-weekly-report');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'gmc-weekly-report',
  '0 8 * * 1',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/gmc-weekly-report',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
