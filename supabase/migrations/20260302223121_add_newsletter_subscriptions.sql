CREATE TABLE newsletter_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  subscribed_at timestamptz DEFAULT now(),
  source text DEFAULT 'popup'
);

ALTER TABLE newsletter_subscriptions ENABLE ROW LEVEL SECURITY;
