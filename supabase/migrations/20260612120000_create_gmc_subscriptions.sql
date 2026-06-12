-- ============================================================
-- GMC SUBSCRIPTIONS — abonnement / essai GererMonChantier
-- Table DEDIEE, separee de `subscriptions` (facturation VMD / Pass Serenite)
-- pour isoler totalement les deux produits. VMD n'est pas touche.
-- ============================================================

CREATE TABLE IF NOT EXISTS gmc_subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  status                 TEXT NOT NULL DEFAULT 'inactive', -- 'inactive' | 'trial' | 'active' | 'expired'
  plan                   TEXT,                             -- 'gmc_essentiel' | 'gmc_multi'
  trial_started_at       TIMESTAMPTZ,
  trial_ends_at          TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  signup_source          TEXT,                             -- 'gerermonchantier' (trace acquisition)
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE gmc_subscriptions ENABLE ROW LEVEL SECURITY;

-- L'utilisateur peut LIRE son propre abonnement (afficher l'essai / le compteur).
CREATE POLICY "gmc_subscriptions_select_own"
  ON gmc_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Pas de policy insert/update/delete cote utilisateur : toute ecriture passe par
-- le serveur en service_role (trigger signup + webhooks Stripe), qui bypass RLS.
-- => un utilisateur ne peut jamais s'auto-accorder un abonnement.

CREATE INDEX IF NOT EXISTS idx_gmc_subscriptions_user_id        ON gmc_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_gmc_subscriptions_stripe_customer ON gmc_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_gmc_subscriptions_trial_ends      ON gmc_subscriptions(trial_ends_at);

-- Reutilise la fonction update_updated_at_column() definie dans add_premium_module.sql.
CREATE TRIGGER set_updated_at_gmc_subscriptions
  BEFORE UPDATE ON gmc_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
