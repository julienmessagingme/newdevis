-- Add contact_category column for agent classification
ALTER TABLE contacts_chantier
  ADD COLUMN IF NOT EXISTS contact_category TEXT
  DEFAULT 'artisan'
  CHECK (contact_category IN ('artisan', 'architecte', 'maitre_oeuvre', 'bureau_etudes', 'client', 'autre'));

-- Backfill existing roles
UPDATE contacts_chantier SET contact_category = 'architecte'
  WHERE role ILIKE '%architecte%' AND contact_category = 'artisan';
UPDATE contacts_chantier SET contact_category = 'maitre_oeuvre'
  WHERE (role ILIKE '%maitre%' OR role ILIKE '%maître%') AND contact_category = 'artisan';
