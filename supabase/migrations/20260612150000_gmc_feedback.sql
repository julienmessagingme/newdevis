-- ============================================================
-- GMC — table gmc_feedback : retours "votre avis".
-- Alimentee par /api/gmc-feedback (service_role), declenchee par le CTA
-- "Donner mon avis" des emails (winback_2 / goodbye) + la page /avis.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.gmc_feedback (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  source      text,            -- contexte : winback_2, goodbye, page, ...
  reason      text,            -- raison principale (choix)
  comment     text,            -- texte libre
  email       text,            -- optionnel, si l'utilisateur accepte le recontact
  user_id     uuid,            -- optionnel, si connu
  user_agent  text
);

create index if not exists gmc_feedback_created_at_idx on public.gmc_feedback (created_at desc);

-- RLS active sans aucune policy : ecriture/lecture reservees au service_role
-- (l'API route). anon/authenticated n'ont aucun acces via PostgREST.
alter table public.gmc_feedback enable row level security;

comment on table public.gmc_feedback is 'Retours "votre avis" GMC (CTA Donner mon avis des emails winback_2 / goodbye + page /avis).';
