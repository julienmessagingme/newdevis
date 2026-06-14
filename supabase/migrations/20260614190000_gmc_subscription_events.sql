-- Historique des passages de statut de l'abonnement GMC (timeline "Mon abonnement").
-- Alimente par le webhook Stripe (subscribed / payment_failed / canceled).
create table if not exists public.gmc_subscription_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event text not null,
  detail text,
  at timestamptz not null default now()
);
create index if not exists gmc_subscription_events_user_at_idx
  on public.gmc_subscription_events(user_id, at desc);
alter table public.gmc_subscription_events enable row level security;
drop policy if exists gmc_sub_events_select_own on public.gmc_subscription_events;
create policy gmc_sub_events_select_own on public.gmc_subscription_events
  for select using (auth.uid() = user_id);
