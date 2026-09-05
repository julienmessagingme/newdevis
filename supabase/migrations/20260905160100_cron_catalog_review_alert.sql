-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-05 — cron SEMESTRIEL de relecture des fourchettes catalogue.
--
-- ⚠️ MOTIF OBLIGATOIRE SUR CE PROJET (incident du 2026-08-29) :
--   · URL en dur — `current_setting('app.settings.*')` N'EXISTE PAS ici et
--     fait échouer le job à CHAQUE exécution, en silence. Quatre crons ont été
--     trouvés morts d'un coup à cause de ça (dont un depuis 2 mois).
--   · headers = Content-Type seul, AUCUN Authorization : les fonctions cron
--     sont déclarées `verify_jwt = false`.
--   · vérification obligatoire après création (voir en bas de ce fichier).
--
-- Cadence : 1er février et 1er août à 08:00 UTC. Deux fois par an, c'est le
-- rythme demandé par Johan — au-delà on court après le bruit, en deçà on
-- décroche du marché.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT cron.unschedule('catalog-review-alert')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'catalog-review-alert');

SELECT cron.schedule(
  'catalog-review-alert',
  '0 8 1 2,8 *',
  $$
  SELECT net.http_post(
    url     := 'https://vhrhgsqxwvouswjaiczn.supabase.co/functions/v1/catalog-review-alert',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object('source', 'cron')
  );
  $$
);

-- Vérification (à exécuter après `db push`) :
--   SELECT public.admin_cron_status('catalog-review-alert');
-- Doit renvoyer le job actif ; les runs apparaîtront après le 1er février.
-- Pour un test immédiat sans attendre l'échéance :
--   SELECT net.http_post(
--     url := 'https://vhrhgsqxwvouswjaiczn.supabase.co/functions/v1/catalog-review-alert?dry_run=1',
--     headers := jsonb_build_object('Content-Type','application/json'),
--     body := '{}'::jsonb);
