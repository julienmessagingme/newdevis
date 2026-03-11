-- ============================================================
-- PASS SÉRÉNITÉ — Stripe integration + lifetime analysis counter
-- ============================================================

-- Add Stripe columns + analysis counter to subscriptions
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS lifetime_analysis_count INTEGER NOT NULL DEFAULT 0;

-- Index for Stripe customer lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer
  ON subscriptions(stripe_customer_id);

-- RPC function to atomically increment analysis count (upsert)
CREATE OR REPLACE FUNCTION increment_analysis_count(p_user_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO subscriptions (user_id, lifetime_analysis_count)
  VALUES (p_user_id, 1)
  ON CONFLICT (user_id) DO UPDATE
  SET lifetime_analysis_count = subscriptions.lifetime_analysis_count + 1,
      updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
