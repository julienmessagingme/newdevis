-- ============================================================
-- Migration : Prix marché enrobé / voirie / revêtements extérieurs
-- Date : 2026-04-08
-- Contexte : l'entrée 'enrobe_pose' existante (18-70 €/m², gros volume)
-- était trop basse pour les petits chantiers résidentiels.
-- Pour une allée de 15-30 m² la mobilisation du matériel
-- représente un coût fixe important → prix unitaire apparent élevé.
-- Ajout de variantes résidentielles + types de VRD manquants.
-- ============================================================

-- Mise à jour de l'entrée existante avec note plus précise
UPDATE market_prices
SET notes = 'Gros volume (>200 m²) — route, parking'
WHERE job_type = 'enrobe_pose' AND notes = 'Gros volume = moins cher';

-- Nouvelles entrées enrobé / voirie résidentielle
INSERT INTO market_prices
  (job_type, label, unit, price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht,
   fixed_min_ht, fixed_avg_ht, fixed_max_ht, zip_scope, notes, domain)
VALUES
  -- Allée résidentielle petite surface (15-50 m²)
  -- Coût fixe élevé (mobilisation camion enrobé, fraisage, cylindrage)
  ('enrobe_allee_residentielle', 'Pose enrobé allée résidentielle',
   'm2', 40, 65, 100, 300, 600, 1200, 'FR', 'Petite surface (<50 m²) — mobilisation incluse', 'travaux'),

  -- Allée résidentielle moyenne surface (50-200 m²)
  ('enrobe_allee_moyenne', 'Pose enrobé allée (surface moyenne)',
   'm2', 30, 50, 80, 200, 400, 800, 'FR', 'Surface 50-200 m² — cylindrage mécanisé', 'travaux'),

  -- Enrobé avec fraisage de l'ancien revêtement
  ('enrobe_avec_fraisage', 'Reprise enrobé avec fraisage',
   'm2', 45, 75, 120, 300, 600, 1200, 'FR', 'Dépose ancien enrobé + repose', 'travaux'),

  -- Enrobé à froid (réparation de nid-de-poule, petite réparation)
  ('enrobe_froid_reparation', 'Enrobé à froid — réparation localisée',
   'm2', 35, 60, 100, 50, 150, 300, 'FR', 'Correction nids-de-poule / dégradations ponctuelles', 'travaux'),

  -- Terrassement + pose enrobé clé en main (allée)
  ('enrobe_cle_en_main', 'Allée enrobée clé en main (terrassement + pose)',
   'm2', 60, 90, 140, 400, 800, 1500, 'FR', 'Décaissement + grave + enrobé 6 cm', 'travaux'),

  -- Béton désactivé (souvent comparé à l'enrobé)
  ('beton_desactive_allee', 'Béton désactivé allée',
   'm2', 50, 80, 130, 400, 700, 1500, 'FR', 'Finition gravier lavé / expo', 'travaux'),

  -- Pavés autobloquants béton
  ('paves_autobloquants', 'Pose pavés autobloquants béton',
   'm2', 40, 65, 110, 200, 400, 800, 'FR', 'Hors fourniture graviers + sable', 'travaux'),

  -- Pavés autobloquants fourniture + pose
  ('paves_autobloquants_fp', 'Pavés autobloquants fourniture + pose',
   'm2', 70, 110, 180, 300, 600, 1200, 'FR', 'Matériaux inclus (béton C25 pavé standard)', 'travaux'),

  -- Stabilisé / gravier compacté
  ('stabilise_grave', 'Grave stabilisée / gravier compacté',
   'm2', 15, 28, 50, 150, 300, 600, 'FR', 'Allée graviers — économique', 'travaux'),

  -- Dalle béton extérieure (terrasse / allée)
  ('dalle_beton_ext', 'Dalle béton extérieure',
   'm2', 35, 60, 100, 300, 600, 1200, 'FR', 'Dalle 10-15 cm armée treillis', 'travaux'),

  -- Bordurette / bordure de séparation
  ('bordurette_pose', 'Pose bordurette / bordure béton',
   'ml', 15, 28, 50, 100, 200, 400, 'FR', 'Baguette béton ou granit scellée', 'travaux'),

  -- Regard / grille d'évacuation EP
  ('regard_ep_pose', 'Pose regard eaux pluviales',
   'unité', 150, 280, 500, 0, 0, 0, 'FR', 'Regard béton + grille fonte', 'travaux')
ON CONFLICT (job_type) DO UPDATE SET
  label = EXCLUDED.label,
  price_min_unit_ht = EXCLUDED.price_min_unit_ht,
  price_avg_unit_ht = EXCLUDED.price_avg_unit_ht,
  price_max_unit_ht = EXCLUDED.price_max_unit_ht,
  fixed_min_ht      = EXCLUDED.fixed_min_ht,
  fixed_avg_ht      = EXCLUDED.fixed_avg_ht,
  fixed_max_ht      = EXCLUDED.fixed_max_ht,
  notes             = EXCLUDED.notes,
  domain            = EXCLUDED.domain;

-- Entrées strategic_matrix pour les nouveaux job_types
-- Colonnes: job_type, value_intrinseque, liquidite, attractivite, energie, reduction_risque,
--           impact_loyer, vacance, fiscalite, capex_risk, recovery_rate
-- Scores similaires à enrobe_pose (aménagement extérieur, valorisation patrimoniale modérée)
INSERT INTO public.strategic_matrix
  (job_type, value_intrinseque, liquidite, attractivite, energie, reduction_risque,
   impact_loyer, vacance, fiscalite, capex_risk, recovery_rate)
VALUES
  --                              val  liq  att  ene  rsk   loy  vac  fis  cpx  rcv
  ('enrobe_allee_residentielle',   3,   4,   5,   1,   2,    3,   3,   1,   3,  0.65),
  ('enrobe_allee_moyenne',         3,   4,   5,   1,   2,    3,   3,   1,   3,  0.65),
  ('enrobe_avec_fraisage',         3,   3,   4,   1,   2,    2,   3,   1,   3,  0.60),
  ('enrobe_froid_reparation',      2,   2,   3,   1,   2,    1,   2,   1,   2,  0.50),
  ('enrobe_cle_en_main',           4,   5,   6,   1,   2,    4,   4,   1,   3,  0.70),
  ('beton_desactive_allee',        4,   5,   6,   1,   2,    4,   4,   1,   3,  0.70),
  ('paves_autobloquants',          5,   6,   7,   1,   2,    5,   5,   1,   3,  0.75),
  ('paves_autobloquants_fp',       5,   6,   7,   1,   2,    5,   5,   1,   3,  0.75),
  ('stabilise_grave',              2,   3,   3,   1,   1,    2,   2,   1,   2,  0.45),
  ('dalle_beton_ext',              3,   4,   5,   1,   2,    3,   3,   1,   3,  0.60),
  ('bordurette_pose',              2,   2,   3,   1,   1,    1,   2,   1,   2,  0.50),
  ('regard_ep_pose',               2,   1,   2,   1,   3,    1,   2,   1,   2,  0.50)
ON CONFLICT (job_type) DO NOTHING;
