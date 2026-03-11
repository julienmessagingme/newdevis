-- ============================================================
-- PASS SÉRÉNITÉ — Create subscriptions table + Stripe integration
-- ============================================================

-- Create subscriptions table (if not exists)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'inactive',
  plan TEXT,
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  lifetime_analysis_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for Stripe customer lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer
  ON subscriptions(stripe_customer_id);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id
  ON subscriptions(user_id);

-- RLS: users can read their own subscription
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access"
  ON subscriptions FOR ALL
  USING (true)
  WITH CHECK (true);

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
