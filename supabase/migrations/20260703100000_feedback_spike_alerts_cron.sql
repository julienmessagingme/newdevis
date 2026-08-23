-- ============================================================================
-- 2026-07-03 — Cron feedback-spike-alerts (*/30 min)
-- ============================================================================
--
-- Angle mort du monitoring existant (system-alerts, analysis-maintenance) :
-- un MAUVAIS VERDICT (entreprise "radiée" à tort, verdict incohérent) n'est
-- PAS une erreur technique. L'analyse est 'completed', aucune exception, aucun
-- retry -> les 2 crons volumetriques + reparation ne le detectent pas.
--
-- Ce cron scanne les feedbacks negatifs recents (`analysis_feedback` avec
-- choice='negative') et alerte email si :
--   - >= 3 feedbacks negatifs du meme tag / heure -> pic structurel (bug cible)
--   - OU >= 5 feedbacks negatifs total / heure -> pic global
--
-- Fenetre 1h, execution */30 min = detection en < 45 min max.
-- Dedup Idempotency-Key basee sur les IDs des feedbacks (comme system-alerts).
-- Destinataires alignes : julien@ + bridey.johan@.
--
-- Idempotent : cron.unschedule puis cron.schedule.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('feedback-spike-alerts');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'feedback-spike-alerts',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/feedback-spike-alerts',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ── Verification rapide post-migration ─────────────────────────────────────
-- SELECT jobid, jobname, schedule, active
-- FROM cron.job
-- WHERE jobname = 'feedback-spike-alerts';
--
-- Logs :
-- SELECT jobname, runid, status, return_message, start_time
-- FROM cron.job_run_details
-- WHERE jobname = 'feedback-spike-alerts'
-- ORDER BY start_time DESC
-- LIMIT 10;
