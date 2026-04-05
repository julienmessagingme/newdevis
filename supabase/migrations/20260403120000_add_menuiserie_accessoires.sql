-- ============================================================
-- Migration: Accessoires menuiserie existante
-- Grilles d'entrée d'air, mortaises, ventilation sur fenêtres
-- existantes — distinguer du remplacement complet fenêtre PVC
-- ============================================================

INSERT INTO public.market_prices
  (job_type, label, unit, price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht,
   fixed_min_ht, fixed_avg_ht, fixed_max_ht, zip_scope, notes)
VALUES

-- Grille d'entrée d'air auto-réglable (hygrométrique ou débit constant)
-- Fourniture + pose sur menuiserie existante — ~14-40€/unité selon modèle
('grille_entree_air',
 'Grille d''entrée d''air auto-réglable (menuiserie existante)',
 'unité', 14.00, 25.00, 45.00, 0, 0, 0, 'FR',
 'Grille auto-réglable hygrométrique ou débit constant, fournie et posée sur châssis existant'),

-- Mortaise sur menuiserie existante + pose grille de ventilation
-- Opération de perçage/fraisage du dormant + installation grille
('mortaise_grille_ventilation',
 'Mortaise menuiserie existante + pose grille ventilation',
 'forfait', 0, 0, 0, 60.00, 110.00, 180.00, 'FR',
 'Création mortaise sur dormant/ouvrant existant + fourniture et pose grille de ventilation'),

-- Lot différentiel 30mA + disjoncteur (souvent facturé ensemble lors de remplacement fenêtres)
-- Complémentaire à ajout_differentiel + ajout_disjoncteur qui existent séparément
('differentiel_disjoncteur_lot',
 'Lot différentiel 30 mA + disjoncteur sur tableau',
 'forfait', 0, 0, 0, 100.00, 160.00, 280.00, 'FR',
 'Fourniture et pose différentiel 30mA + disjoncteur sur tableau électrique existant');
