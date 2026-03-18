-- Add artisan phone and channel tracking to relances
ALTER TABLE relances
  ADD COLUMN IF NOT EXISTS artisan_phone TEXT,
  ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'email' CHECK (channel IN ('email', 'whatsapp'));
