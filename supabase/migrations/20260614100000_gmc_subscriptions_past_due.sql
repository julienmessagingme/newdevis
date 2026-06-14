-- Autorise le statut 'past_due' sur gmc_subscriptions (dunning Stripe : paiement
-- en echec, acces tolere le temps des relances avant passage en 'expired').
alter table public.gmc_subscriptions drop constraint if exists gmc_subscriptions_status_check;
alter table public.gmc_subscriptions
  add constraint gmc_subscriptions_status_check
  check (status in ('inactive','trial','active','past_due','expired'));
