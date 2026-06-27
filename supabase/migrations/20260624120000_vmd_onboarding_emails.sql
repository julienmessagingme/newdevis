-- ============================================================
-- VMD — Onboarding emails (nouveaux comptes VerifierMonDevis)
-- Mirroir du systeme GMC (gmc_subscriptions/gmc_email_log + trigger + webhook).
--   - vmd_signups   : 1 ligne par nouveau compte VMD = point de declenchement du
--                     welcome + notif admin (via Database Webhook -> vmd-on-signup).
--   - vmd_email_log : dedup des emails de la sequence (1 ligne par user+template).
--   - trigger auth.users : cree la ligne vmd_signups pour les inscriptions EMAIL
--     (signup_source='verifiermondevis' dans les metadata). Les inscriptions Google
--     OAuth (signup_source absent des metadata Google) passent par /api/vmd-ensure-signup.
-- ============================================================

create extension if not exists pgcrypto;

-- ── Table : signups VMD (audience de la sequence + trigger du welcome) ─────────
create table if not exists public.vmd_signups (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique,
  email         text,
  prenom        text,
  phone         text,
  signup_source text not null default 'verifiermondevis',
  created_at    timestamptz not null default now()
);

create index if not exists vmd_signups_created_idx on public.vmd_signups (created_at);

alter table public.vmd_signups enable row level security;

comment on table public.vmd_signups is 'Nouveaux comptes VMD : declenche welcome + notif admin (webhook -> vmd-on-signup) et alimente la sequence onboarding (vmd-email-scheduler). Ecrit en service_role only.';

-- ── Table : dedup des emails de la sequence ───────────────────────────────────
create table if not exists public.vmd_email_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  template_id text not null,
  sent_at     timestamptz not null default now(),
  unique (user_id, template_id)
);

create index if not exists vmd_email_log_user_idx on public.vmd_email_log (user_id);

alter table public.vmd_email_log enable row level security;

comment on table public.vmd_email_log is 'Dedup des emails onboarding VMD : 1 ligne par (user, template) envoye. Ecrit par vmd-email-scheduler (service_role only).';

-- ── Trigger : creer vmd_signups a l'inscription EMAIL ─────────────────────────
-- Filtre signup_source='verifiermondevis' (pose par Register.tsx). Ne JAMAIS
-- faire echouer la creation de compte (handler d'exception). Les signups Google
-- OAuth n'ont pas ce metadata -> traites par /api/vmd-ensure-signup.
create or replace function public.vmd_create_signup_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_user_meta_data->>'signup_source' = 'verifiermondevis' then
    begin
      insert into public.vmd_signups (user_id, email, prenom, phone, signup_source)
      values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'first_name', split_part(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''), ' ', 1)),
        new.raw_user_meta_data->>'phone',
        'verifiermondevis'
      )
      on conflict (user_id) do nothing;
    exception when others then
      raise warning 'vmd_create_signup_on_signup failed for %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vmd_create_signup_on_signup on auth.users;
create trigger trg_vmd_create_signup_on_signup
  after insert on auth.users
  for each row execute function public.vmd_create_signup_on_signup();

-- Note : l'INSERT dans vmd_signups declenche le Database Webhook (a configurer
-- dans le dashboard Supabase) qui appelle l'edge function `vmd-on-signup`
-- (welcome + notif admin via Resend). Le cron de la sequence appelle
-- `vmd-email-scheduler` (a planifier en SQL direct, cf. infra checklist).
