-- ============================================================================
-- 2026-08-29 — RÉPARATION DE 4 CRONS SILENCIEUSEMENT MORTS (signalé par Johan :
-- « la relecture IA n'apparaît pas »)
--
-- Cause : ces jobs ont été planifiés avec
--     current_setting('app.settings.supabase_url')
--     current_setting('app.settings.service_role_key')
-- Ces paramètres N'EXISTENT PAS sur ce projet Supabase → chaque exécution
-- échoue avec « unrecognized configuration parameter », sans aucune alerte.
-- Vérifié dans cron.job_run_details : 100 % des runs en `failed`.
--
-- Jobs concernés et durée de la panne :
--   • feedback-spike-alerts   (jobid 35) — mort depuis le 03/07 (~2 mois) :
--     aucune alerte sur les pics de feedbacks négatifs
--   • gmc-weekly-report       (jobid 36) — mort depuis le 24/07 : aucun
--     rapport hebdo GMC envoyé
--   • vmd-outcome-scheduler   (jobid 38) — mort depuis le 24/08 : AUCUN email
--     « Ce devis, finalement ? » envoyé (boucle de capture des issues)
--   • ai-review-agent         (jobid 39) — mort depuis le 27/08 : aucune
--     relecture IA automatique des pending_review
--
-- Correctif : on reprend le motif des crons qui FONCTIONNENT sur ce projet
-- (vmd-email-scheduler, gmc-email-scheduler, system-health-alerts) — URL en
-- dur, aucun header Authorization (ces 4 fonctions sont en verify_jwt=false
-- dans supabase/config.toml).
--
-- ⚠️ RÈGLE : ne JAMAIS utiliser current_setting('app.settings.*') dans un
-- cron sur ce projet. Après toute création de cron, vérifier :
--   select * from public.admin_cron_status('<jobname>');
-- ============================================================================

do $$
declare
  j text;
begin
  foreach j in array array[
    'feedback-spike-alerts', 'gmc-weekly-report',
    'vmd-outcome-scheduler', 'ai-review-agent'
  ] loop
    begin
      perform cron.unschedule(j);
    exception when others then
      null; -- job absent : on continue
    end;
  end loop;
end $$;

select cron.schedule(
  'feedback-spike-alerts',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://vhrhgsqxwvouswjaiczn.supabase.co/functions/v1/feedback-spike-alerts',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'gmc-weekly-report',
  '0 8 * * 1',
  $$
  select net.http_post(
    url := 'https://vhrhgsqxwvouswjaiczn.supabase.co/functions/v1/gmc-weekly-report',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'vmd-outcome-scheduler',
  '20 8 * * *',
  $$
  select net.http_post(
    url := 'https://vhrhgsqxwvouswjaiczn.supabase.co/functions/v1/vmd-outcome-scheduler',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'ai-review-agent',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://vhrhgsqxwvouswjaiczn.supabase.co/functions/v1/ai-review-agent',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := '{}'::jsonb
  );
  $$
);
