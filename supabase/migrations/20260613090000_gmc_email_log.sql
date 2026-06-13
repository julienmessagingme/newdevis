-- ============================================================
-- GMC — table gmc_email_log : déduplication des emails cycle de vie.
-- 1 ligne par (user_id, template_id) envoyé. Lue/écrite par l'edge function
-- gmc-email-scheduler (service_role) pour ne jamais renvoyer 2× le même email.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.gmc_email_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  template_id text not null,
  sent_at     timestamptz not null default now(),
  unique (user_id, template_id)
);

create index if not exists gmc_email_log_user_idx on public.gmc_email_log (user_id);

alter table public.gmc_email_log enable row level security;

comment on table public.gmc_email_log is 'Dédup des emails cycle de vie GMC : 1 ligne par (user, template) envoyé. Écrit par gmc-email-scheduler (service_role only).';
