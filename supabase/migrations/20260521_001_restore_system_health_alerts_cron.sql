-- ============================================================================
-- 2026-05-21 — RESTAURATION cron system-health-alerts
-- ============================================================================
--
-- 🚨 BUG DE PROD DÉTECTÉ AUJOURD'HUI :
-- Une régression VMD (V3.4.20 → V3.4.21) est passée en prod sans qu'aucune
-- alerte mail soit déclenchée. Diagnostic : le cron `system-health-alerts`
-- créé en 2026-02-28 a été SUPPRIMÉ par le commit ff69caa (2026-03-14) et
-- N'A JAMAIS ÉTÉ RESTAURÉ. Pendant 80 jours, aucune surveillance.
--
-- Le fichier `supabase/migrations/20260228.sql` existe encore dans le repo
-- mais a pu ne pas être réappliquée en prod (selon l'historique
-- `supabase_migrations.schema_migrations`). Cette nouvelle migration est
-- explicite, idempotente, et garantit que le cron tourne.
--
-- POURQUOI 2 CRONS DIFFÉRENTS :
-- - `system-health-alerts` (*/5 min, EF system-alerts) : détecte les
--   analyses bloquées > 15 min, les pics d'erreurs (3+ en 30 min), et
--   les taux d'échec élevés (>50%). Envoie immédiatement un email.
-- - `analysis-maintenance` (*/15 min, EF analysis-maintenance) : retry
--   les analyses en error/failed jusqu'à 2 fois, puis email si échec
--   persistant. Couvre les pannes ponctuelles Gemini.
--
-- Les deux sont complémentaires : `system-alerts` détecte les anomalies
-- volumétriques (pic) en quasi-temps réel, `analysis-maintenance` répare
-- les analyses individuellement échouées.
--
-- Idempotent : `cron.unschedule` puis `cron.schedule` couvre le cas où
-- le job existe déjà (renomme/recrée proprement sans doublon).
-- ============================================================================

-- Extensions (au cas où elles auraient été désactivées)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

-- Unschedule si existant (idempotence — pas d'erreur si absent)
DO $$
BEGIN
  PERFORM cron.unschedule('system-health-alerts');
EXCEPTION WHEN OTHERS THEN
  -- Le job n'existait pas → ignore silencieusement
  NULL;
END $$;

-- Reschedule */5 min vers /functions/v1/system-alerts
SELECT cron.schedule(
  'system-health-alerts',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/system-alerts',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ── Vérification rapide post-migration ─────────────────────────────────────
-- Pour vérifier que le job est bien planifié, lancer :
--
--   SELECT jobid, jobname, schedule, active
--   FROM cron.job
--   WHERE jobname = 'system-health-alerts';
--
-- Attendu :
--   jobid | jobname              | schedule    | active
--   ------|----------------------|-------------|--------
--   xxxx  | system-health-alerts | */5 * * * * | true
--
-- Logs des exécutions récentes :
--   SELECT jobname, runid, status, return_message, start_time
--   FROM cron.job_run_details
--   WHERE jobname = 'system-health-alerts'
--   ORDER BY start_time DESC
--   LIMIT 10;
