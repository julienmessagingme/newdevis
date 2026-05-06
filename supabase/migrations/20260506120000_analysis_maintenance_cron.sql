-- ── Analysis Maintenance Cron ─────────────────────────────────────────────────
-- Lance l'edge function analysis-maintenance toutes les 15 minutes.
-- Elle détecte les analyses en erreur dans les 4 dernières heures,
-- retente automatiquement jusqu'à MAX_RETRIES fois,
-- et envoie un email admin si nécessaire.
-- ──────────────────────────────────────────────────────────────────────────────

SELECT cron.schedule(
  'analysis-maintenance',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://vhrhgsqxwvouswjaiczn.supabase.co/functions/v1/analysis-maintenance',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'agent_cron_secret' LIMIT 1)
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
