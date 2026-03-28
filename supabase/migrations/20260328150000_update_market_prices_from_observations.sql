-- ============================================================
-- Migration : mise à jour market_prices depuis price_observations
-- Basée sur 527 observations réelles de devis (médiane par job type)
-- Date : 2026-03-28
-- ============================================================

-- ── Augmentations justifiées ───────────────────────────────────────────────

-- porte_fenetre_pvc_fourniture_pose : médiane observée 1754€/unité (18 obs)
-- Catalogue actuel : avg 1200€ → +42%
UPDATE market_prices SET
  price_min_unit_ht = 900,
  price_avg_unit_ht = 1700,
  price_max_unit_ht = 2200
WHERE job_type = 'porte_fenetre_pvc_fourniture_pose' AND domain = 'travaux';

-- volet_roulant_fourniture_pose : médiane observée 1276€/unité (4 obs, min 726, max 1747)
-- Catalogue actuel : avg 450€ → +111%
UPDATE market_prices SET
  price_min_unit_ht = 500,
  price_avg_unit_ht = 950,
  price_max_unit_ht = 1600
WHERE job_type = 'volet_roulant_fourniture_pose' AND domain = 'travaux';

-- fenetre_velux_pose : médiane observée 1365€/unité (4 obs très stables)
-- Catalogue actuel : avg 850€ → +41%
UPDATE market_prices SET
  price_min_unit_ht = 700,
  price_avg_unit_ht = 1200,
  price_max_unit_ht = 1800
WHERE job_type = 'fenetre_velux_pose' AND domain = 'travaux';

-- tablier_volet_roulant_remplacement : médiane observée 333€/unité (5 obs, min 232, max 467)
-- Catalogue actuel : avg 290€ → +17%
UPDATE market_prices SET
  price_min_unit_ht = 220,
  price_avg_unit_ht = 340,
  price_max_unit_ht = 500
WHERE job_type = 'tablier_volet_roulant_remplacement' AND domain = 'travaux';

-- drainage : médiane observée 89€/ml (4 obs, min 28, max 106)
-- Catalogue actuel : avg 55€ → +45%
UPDATE market_prices SET
  price_min_unit_ht = 35,
  price_avg_unit_ht = 80,
  price_max_unit_ht = 130
WHERE job_type = 'drainage' AND domain = 'travaux';

-- terrassement : médiane observée 53€/m³ (7 obs, min 48, max 162)
-- Catalogue actuel : avg 45€ → +22%
UPDATE market_prices SET
  price_min_unit_ht = 30,
  price_avg_unit_ht = 55,
  price_max_unit_ht = 100
WHERE job_type = 'terrassement' AND domain = 'travaux';

-- pose_baguettes_finition : médiane observée 10.20€/ml (7 obs parfaitement stables)
-- Catalogue actuel : avg 9€ → +11%
UPDATE market_prices SET
  price_min_unit_ht = 6,
  price_avg_unit_ht = 10,
  price_max_unit_ht = 18
WHERE job_type = 'pose_baguettes_finition' AND domain = 'travaux';

-- toiture : médiane observée 154€/m² (3 obs, min 144, max 701)
-- Catalogue actuel : avg 140€ → +14%
UPDATE market_prices SET
  price_min_unit_ht = 100,
  price_avg_unit_ht = 160,
  price_max_unit_ht = 260
WHERE job_type = 'toiture' AND domain = 'travaux';

-- ── Baisse justifiée ───────────────────────────────────────────────────────

-- chassis_compose_pvc_fourniture_pose : médiane observée 2425€/unité (18 obs très stables, min 2178, max 2693)
-- Catalogue actuel : avg 2800€ → -14%
UPDATE market_prices SET
  price_min_unit_ht = 1600,
  price_avg_unit_ht = 2400,
  price_max_unit_ht = 3200
WHERE job_type = 'chassis_compose_pvc_fourniture_pose' AND domain = 'travaux';
