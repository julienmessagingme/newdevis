-- 2026-09-11 — TUILE DE RIVE SCELLÉE : le trou confirmé par les DEUX juges.
--
-- Origine : L114 (« Scellement de tuile à l'égout bas de pente », 26,4 ml,
-- 396 €) et L069 (« Scellement de rive à rabat sur côté », 25,6 ml, 973 €).
-- Cette famille avait été écartée de la passe du matin **faute de source, pas
-- faute de pertinence**. Elle est depuis confirmée : Johan ET gemini-2.5-pro
-- répondent tous deux « aucune entrée ne convient » sur L114.
--
-- Le catalogue compte 40 entrées de couverture et **aucune ne chiffre un
-- scellement au mètre linéaire** : la seule qui en parle,
-- « Maçonnerie — scellements et raccords », est facturée à l'HEURE.
--
-- ⚠️ UNE SEULE ENTRÉE, PAS DEUX — et c'est un choix, pas un oubli.
-- Les deux lignes de l'étalon décrivent deux ouvrages de prix très différents :
-- la rive à rabat sort à 38 €/ml (tuiles de rive comprises), l'égout à 15 €/ml
-- (scellement au mortier de tuiles déjà en place). Seul le PREMIER est sourçable :
-- tuiles de rive 14-45 €/ml + pose couvreur 25-45 €/ml. Le second ne se déduirait
-- que d'un taux horaire, c'est-à-dire d'une estimation — et la règle du projet
-- est qu'une fourchette se SOURCE. Il reste donc un trou assumé, inscrit au TODO.

INSERT INTO public.market_prices
  (job_type, label, unit, price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht,
   fixed_min_ht, fixed_avg_ht, fixed_max_ht, zip_scope, notes, domain, source,
   metier, nature_prix, room_specific, generic_family, ratio_materiaux, ratio_main_oeuvre)
VALUES
  ('tuile_rive_scellee', 'Tuile de rive scellée au mortier (fourni+posé)', 'ml',
   40, 65, 90, 0, 0, 0, 'FR', 'Rive à rabat ou à emboîtement, scellement au mortier bâtard',
   'travaux', 'recherche web 2026-09-11 (allotoiture, prix-travaux-m2, toiture-bost — tuiles de rive 14-45 €/ml + pose couvreur 25-45 €/ml) — étalon L069',
   'toiture_couverture', 'fourniture_pose', false, 'rive_couverture', 0.40, 0.55);
