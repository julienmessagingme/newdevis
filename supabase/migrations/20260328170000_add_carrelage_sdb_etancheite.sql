-- ============================================================
-- Migration: Add carrelage salle de bains avec étanchéité
-- Contexte : la référence carrelage_sol (25-80€/m²) ne couvre pas
-- les pièces humides avec système SPEC (Weber, Schluter...).
-- Un carrelage SDB avec étanchéité coûte naturellement 2-3x plus
-- en matériaux (WEBERPRIM + WEBERSYS PROTEC + bande + colle C2 + joint).
-- ============================================================

INSERT INTO public.market_prices (job_type, label, unit, price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht, fixed_min_ht, fixed_avg_ht, fixed_max_ht, zip_scope, notes) VALUES
('carrelage_sdb_etancheite',  'Pose carrelage salle de bains avec étanchéité',        'm2',     55, 95,  170, 0, 0, 0, 'FR', 'SPEC Weber/Schluter - douche italienne, pièce humide. Inclut primaire + membrane + colle C2 + joint'),
('etancheite_sdb',            'Système étanchéité salle de bains (SPEC)',              'm2',     15, 28,   45, 0, 0, 0, 'FR', 'Fourniture seule : membrane, primaire, bande. Weber, Schluter ou équivalent');
