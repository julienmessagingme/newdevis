-- ============================================================
-- Migration : renommer les labels toiture dans market_prices
--
-- Problème : les entrées toiture ont des labels dispersés
-- ("Refaire toiture" sous R, "Nettoyage toiture" sous N,
-- "Démoussage + traitement" sous D - invisible à la recherche "toiture")
--
-- Solution : préfixer tous les labels toiture par "Toiture - "
-- → regroupés sous T dans la liste alphabétique
-- → tous visibles quand on cherche "toiture"
-- ============================================================

UPDATE public.market_prices SET label = 'Toiture - réfection complète'         WHERE job_type = 'toiture';
UPDATE public.market_prices SET label = 'Toiture - démoussage + traitement'     WHERE job_type = 'toiture_demoussage';
UPDATE public.market_prices SET label = 'Toiture - nettoyage'                   WHERE job_type = 'toiture_nettoyage';
UPDATE public.market_prices SET label = 'Toiture - réparation'                  WHERE job_type = 'toiture_reparation';
