-- Ajout maintenance_clim manquant dans la migration climatisation (20260423)
INSERT INTO market_prices (job_type, label, unit, price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht, fixed_min_ht, fixed_avg_ht, fixed_max_ht, zip_scope, notes, domain)
SELECT 'maintenance_clim', 'Entretien / maintenance climatisation', 'forfait', 0, 0, 0, 80, 150, 300, 'FR', 'Contrat entretien annuel ou maintenance ponctuelle', 'travaux'
WHERE NOT EXISTS (SELECT 1 FROM market_prices WHERE job_type = 'maintenance_clim' AND domain = 'travaux');

INSERT INTO strategic_matrix (job_type, value_intrinseque, liquidite, attractivite, energie, reduction_risque, impact_loyer, vacance, fiscalite, capex_risk, recovery_rate)
SELECT 'maintenance_clim', 1, 2, 2, 1, 2, 1, 1, 1, 1, 0.100
WHERE NOT EXISTS (SELECT 1 FROM strategic_matrix WHERE job_type = 'maintenance_clim');
