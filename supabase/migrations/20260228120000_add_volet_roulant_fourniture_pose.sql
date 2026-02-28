-- ============================================================
-- Fix: Ajouter "volet roulant fourni+pose" au catalogue
-- Problème: seul l'entrée "volet" (MO seule, 80-150€/unité) existait.
-- Les devis incluant fourniture+pose étaient comparés à de la MO seule → comparaison trompeuse.
-- ============================================================

-- 0. Resynchroniser la séquence AVANT toute insertion (évite les erreurs PK duplicate)
SELECT setval(
  pg_get_serial_sequence('market_prices', 'id'),
  GREATEST((SELECT MAX(id) FROM market_prices), 1),
  true
);

-- 1. Clarifier l'entrée existante (MO seule)
UPDATE market_prices
SET
  label = 'Pose volet roulant (main d''œuvre seule)',
  notes = 'Hors fourniture'
WHERE job_type = 'volet' AND domain = 'travaux';

-- 2. Ajouter l'entrée fourniture+pose si elle n'existe pas encore
-- Prix observés pour volet roulant aluminium standard fourni+pose, France nationale
INSERT INTO market_prices (
  job_type, label, unit,
  price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht,
  fixed_min_ht, fixed_avg_ht, fixed_max_ht,
  zip_scope, notes, domain
)
SELECT
  'volet_roulant_fourniture_pose',
  'Volet roulant (fourni+pose)',
  'unité',
  250, 450, 800,
  0, 0, 0,
  'national',
  'Base',
  'travaux'
WHERE NOT EXISTS (
  SELECT 1 FROM market_prices WHERE job_type = 'volet_roulant_fourniture_pose' AND domain = 'travaux'
);
