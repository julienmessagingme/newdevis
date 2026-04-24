-- ============================================================
-- Migration: Ajout entrées climatisation dans market_prices + strategic_matrix
-- Cause : catalog avait uniquement 'clim' (mono-split) → Gemini ne mappait pas
-- les devis multi-split → tout allait dans "Autre" → zéro comparaison prix.
-- ============================================================

-- 1. Mettre à jour le label 'clim' pour le rendre générique
UPDATE market_prices
SET label = 'Climatisation split (mono-split, fourni+posé)',
    notes = 'Mono-split 1 unité int. + 1 unité ext.'
WHERE job_type = 'clim' AND domain = 'travaux';

-- 2. Ajouter climatisation multi-split (par unité intérieure)
INSERT INTO market_prices (job_type, label, unit, price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht, fixed_min_ht, fixed_avg_ht, fixed_max_ht, zip_scope, notes, domain)
SELECT 'clim_multisplit', 'Climatisation multi-split (par unité intérieure)', 'unité', 1200, 1900, 3200, 800, 1200, 2200, 'FR', 'Prix par unité int. + forfait unité ext.', 'travaux'
WHERE NOT EXISTS (SELECT 1 FROM market_prices WHERE job_type = 'clim_multisplit' AND domain = 'travaux');

-- 3. Ajouter climatisation gainable / centralisée
INSERT INTO market_prices (job_type, label, unit, price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht, fixed_min_ht, fixed_avg_ht, fixed_max_ht, zip_scope, notes, domain)
SELECT 'clim_gainable', 'Climatisation gainable / centralisée (fourni+posé)', 'forfait', 0, 0, 0, 3500, 6000, 12000, 'FR', 'Système gainable toute surface', 'travaux'
WHERE NOT EXISTS (SELECT 1 FROM market_prices WHERE job_type = 'clim_gainable' AND domain = 'travaux');

-- 4. Ajouter accessoires / liaisons frigorifiques climatisation
INSERT INTO market_prices (job_type, label, unit, price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht, fixed_min_ht, fixed_avg_ht, fixed_max_ht, zip_scope, notes, domain)
SELECT 'clim_accessoires', 'Accessoires climatisation (liaisons, supports, finitions)', 'forfait', 0, 0, 0, 150, 350, 700, 'FR', 'Liaisons frigorigènes, supports muraux, décors', 'travaux'
WHERE NOT EXISTS (SELECT 1 FROM market_prices WHERE job_type = 'clim_accessoires' AND domain = 'travaux');

-- 5. Ajouter les nouvelles entrées dans strategic_matrix
-- (même profil que 'clim' : travaux de confort, valorisation modérée)
INSERT INTO strategic_matrix (job_type, value_intrinseque, liquidite, attractivite, energie, reduction_risque, impact_loyer, vacance, fiscalite, capex_risk, recovery_rate)
SELECT 'clim_multisplit', 5, 6, 7, 5, 3, 5, 6, 3, 5, 0.400
WHERE NOT EXISTS (SELECT 1 FROM strategic_matrix WHERE job_type = 'clim_multisplit');

INSERT INTO strategic_matrix (job_type, value_intrinseque, liquidite, attractivite, energie, reduction_risque, impact_loyer, vacance, fiscalite, capex_risk, recovery_rate)
SELECT 'clim_gainable', 6, 6, 7, 5, 3, 5, 6, 3, 5, 0.400
WHERE NOT EXISTS (SELECT 1 FROM strategic_matrix WHERE job_type = 'clim_gainable');

INSERT INTO strategic_matrix (job_type, value_intrinseque, liquidite, attractivite, energie, reduction_risque, impact_loyer, vacance, fiscalite, capex_risk, recovery_rate)
SELECT 'clim_accessoires', 2, 3, 3, 2, 1, 2, 2, 1, 2, 0.300
WHERE NOT EXISTS (SELECT 1 FROM strategic_matrix WHERE job_type = 'clim_accessoires');

-- 6. Ajouter entretien / maintenance climatisation (manquant dans le prompt)
INSERT INTO market_prices (job_type, label, unit, price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht, fixed_min_ht, fixed_avg_ht, fixed_max_ht, zip_scope, notes, domain)
SELECT 'maintenance_clim', 'Entretien / maintenance climatisation', 'forfait', 0, 0, 0, 80, 150, 300, 'FR', 'Contrat entretien annuel ou maintenance ponctuelle', 'travaux'
WHERE NOT EXISTS (SELECT 1 FROM market_prices WHERE job_type = 'maintenance_clim' AND domain = 'travaux');

INSERT INTO strategic_matrix (job_type, value_intrinseque, liquidite, attractivite, energie, reduction_risque, impact_loyer, vacance, fiscalite, capex_risk, recovery_rate)
SELECT 'maintenance_clim', 1, 2, 2, 1, 2, 1, 1, 1, 1, 0.100
WHERE NOT EXISTS (SELECT 1 FROM strategic_matrix WHERE job_type = 'maintenance_clim');
