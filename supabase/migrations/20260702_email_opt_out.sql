-- Migration : gestion RGPD des demandes de desinscription
-- Ajoute email_opt_out + email_opt_out_at sur gmc_subscriptions et vmd_signups.
-- Les 2 schedulers filtrent desormais sur email_opt_out=false.
-- Une fonction helper mark_email_opt_out(email) trouve le user_id via auth.users
-- et flippe les 2 tables si presentes (VMD+GMC opt-out cross-produit).

-- ── gmc_subscriptions ───────────────────────────────────────────────────────
alter table public.gmc_subscriptions
  add column if not exists email_opt_out boolean not null default false,
  add column if not exists email_opt_out_at timestamptz;

create index if not exists idx_gmc_subscriptions_email_opt_out
  on public.gmc_subscriptions(email_opt_out)
  where email_opt_out = true;

-- ── vmd_signups ─────────────────────────────────────────────────────────────
alter table public.vmd_signups
  add column if not exists email_opt_out boolean not null default false,
  add column if not exists email_opt_out_at timestamptz;

create index if not exists idx_vmd_signups_email_opt_out
  on public.vmd_signups(email_opt_out)
  where email_opt_out = true;

-- ── Helper : opt-out par email (cross VMD+GMC) ──────────────────────────────
-- Utilisation : select public.mark_email_opt_out('user@example.com');
-- Retour : nb de lignes flippees (0 = user pas trouve, 1 ou 2 = ok).
create or replace function public.mark_email_opt_out(p_email text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_updated integer := 0;
begin
  select id into v_user_id from auth.users where lower(email) = lower(p_email) limit 1;
  if v_user_id is null then
    return 0;
  end if;

  update public.gmc_subscriptions
     set email_opt_out = true,
         email_opt_out_at = coalesce(email_opt_out_at, now())
   where user_id = v_user_id
     and email_opt_out = false;
  get diagnostics v_updated = row_count;

  update public.vmd_signups
     set email_opt_out = true,
         email_opt_out_at = coalesce(email_opt_out_at, now())
   where user_id = v_user_id
     and email_opt_out = false;
  get diagnostics v_updated = v_updated + row_count;

  return v_updated;
end;
$$;

comment on function public.mark_email_opt_out(text) is
  'Flag email opt-out pour un user (par email) sur GMC et VMD. Retourne le nb de tables flippees.';

-- ── Grants (service_role gere tout, admin peut lire) ────────────────────────
revoke all on function public.mark_email_opt_out(text) from public;
grant execute on function public.mark_email_opt_out(text) to service_role;
