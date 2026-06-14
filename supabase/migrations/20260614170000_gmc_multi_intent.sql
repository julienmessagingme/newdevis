-- Horodatage d'intention multi-chantier : pose par le gate (tentative de 2e chantier
-- en gratuit/essai/Essentiel) -> declenche l'email gmc_upsell_multi via le scheduler.
alter table public.gmc_subscriptions add column if not exists multi_intent_at timestamptz;
