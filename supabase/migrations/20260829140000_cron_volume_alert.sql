-- Alerte de palier de volume (Johan + Julien) — 2026-08-29
--
-- Prévenir dès que le volume atteint ~300 analyses sur 30 jours glissants, pour
-- arbitrer l'optimisation des coûts IA AVANT que la facture ne devienne un
-- sujet. Cadence HEBDOMADAIRE volontaire : le seuil, une fois franchi, le
-- reste — un cron plus fréquent enverrait le même mail en boucle.
--
-- ⚠️ Motif obligatoire sur ce projet (cf. CLAUDE.md § Edge functions) :
-- URL en dur, headers sans Authorization. `current_setting('app.settings.*')`
-- n'existe PAS ici et fait échouer le cron À CHAQUE exécution, en silence.

select cron.unschedule('vmd-volume-alert')
where exists (select 1 from cron.job where jobname = 'vmd-volume-alert');

select cron.schedule(
  'vmd-volume-alert',
  '20 8 * * 1',  -- tous les lundis à 08:20 UTC
  $$
  select net.http_post(
    url := 'https://vhrhgsqxwvouswjaiczn.supabase.co/functions/v1/system-alerts?check=volume',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

-- Vérification (à lancer après application) :
--   select public.admin_cron_status('vmd-volume-alert');
