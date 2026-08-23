-- ============================================================================
-- 2026-08-24 — BOUCLE DE CAPTURE DES ISSUES (décision Johan)
--
-- « Chaque analyse qui passe sans capture d'issue est perdue pour toujours. »
-- Capture le devenir réel de chaque devis analysé (signé tel quel / signé
-- après négociation (+ remise) / non signé / hésite) pour transformer
-- l'Observatoire de descriptif (prix constatés) en prédictif (taux de
-- signature par niveau de prix et de verdict).
--
-- 3 sources : email J+15 à un clic (vmd-outcome-scheduler, cron 08:20 UTC),
-- bannière au retour sur la page d'analyse, sync GMC (futur).
-- ============================================================================

create table if not exists public.analysis_outcomes (
  id                  uuid primary key default gen_random_uuid(),
  analysis_id         uuid not null references public.analyses(id) on delete cascade,
  user_id             uuid,
  outcome             text not null check (outcome in ('signe_tel_quel', 'signe_apres_negociation', 'non_signe', 'hesite')),
  remise_montant      numeric,
  -- Snapshot du verdict au moment de la réponse (stats croisées verdict × issue)
  verdict_decisionnel text,
  source              text not null default 'email' check (source in ('email', 'banner', 'gmc_sync')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (analysis_id)
);

comment on table public.analysis_outcomes is
  'Issue réelle de chaque devis analysé (signé / négocié / non signé). Écrit en service_role uniquement (endpoints Vercel signés + scheduler). La donnée qui rend l''Observatoire prédictif.';

-- RLS : aucune policy = table invisible pour anon/authenticated.
-- Les écritures passent par les endpoints Vercel (service_role, token signé HMAC).
alter table public.analysis_outcomes enable row level security;

create index if not exists idx_analysis_outcomes_outcome on public.analysis_outcomes(outcome);

-- Horodatage de la relance J+15 (dédup : une seule demande par analyse).
alter table public.analyses
  add column if not exists outcome_request_sent_at timestamptz;

-- ── Cron quotidien 08:20 UTC (après gmc 08:00 et vmd 08:10) ────────────────
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

do $$
begin
  perform cron.unschedule('vmd-outcome-scheduler');
exception when others then
  null;
end $$;

select cron.schedule(
  'vmd-outcome-scheduler',
  '20 8 * * *',
  $$
  select net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/vmd-outcome-scheduler',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ── Vérification post-migration ────────────────────────────────────────────
-- select jobid, jobname, schedule, active from cron.job where jobname = 'vmd-outcome-scheduler';
