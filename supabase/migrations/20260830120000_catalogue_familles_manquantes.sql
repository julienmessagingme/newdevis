-- Catalogue : 3 familles confirmées ABSENTES — 2026-08-30
--
-- Identifiées en mesurant la couverture sur 100 devis FR : ces prestations
-- apparaissent avec des montants lourds et n'avaient AUCUNE entrée, donc un
-- rapprochement forcément faux ou aucun rapprochement du tout.
--   · plancher poutrelles-hourdis  → aucune entrée « hourdis » au catalogue,
--     un devis à 12 049 € était rapproché de « Isolation plancher haut ».
--   · bardage double peau bac acier → seuls HPL / bois / composite / PVC
--     existaient ; un bardage industriel à 16 200 € tombait sur « Bardage HPL
--     haut de gamme », une gamme de prix sans rapport.
--   · lot plomberie complet d'un logement → seules des petites interventions
--     existaient ; « Plomberie, sanitaire (suivant plan) » à 9 182 € tombait
--     sur « Plomberie : petite intervention » (90-220 €/unité).
--
-- Fourchettes SOURCÉES sur le web (2026-08-30), jamais déduites de nos propres
-- devis — ce serait circulaire : on ne peut pas juger le marché avec les devis
-- qu'on juge. Contrôle de cohérence tout de même : les lignes réelles du stock
-- tombent bien dans les fourchettes retenues (hourdis 88,6 €/m², bardage
-- 90 €/m²).
--
-- ✅ Fourchettes relues et VALIDÉES par Johan le 2026-08-30.
-- ⚠️ Après application : `node scripts/seed_market_prices_embeddings.mjs`
--    sinon les entrées existent mais restent INTROUVABLES par la recherche
--    vectorielle.
--
-- Écartée volontairement : « ossature bois de murs ». Les sources ne donnent
-- que des prix de maison complète au m² habitable (1 150-2 300 €/m²), rien qui
-- corresponde à une ligne de mur au mètre linéaire. On n'invente pas une
-- fourchette.

insert into public.market_prices (
  job_type, label, unit,
  price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht,
  fixed_min_ht, fixed_avg_ht, fixed_max_ht,
  domain, metier, zip_scope, source, notes
) values
  (
    'plancher_poutrelles_hourdis',
    'Plancher poutrelles-hourdis (fourni+posé)',
    'm2',
    85, 120, 170,
    0, 0, 0,
    'travaux', 'maconnerie_structure', 'FR',
    'recherche web 2026-08-30 (toutsurlebeton.fr, habitatpresto.com, prix-travaux-m2.com) — VALIDÉ Johan 2026-08-30',
    'Hourdis béton 85-110 €/m², hourdis polystyrène isolant 110-170 €/m². Fourniture et pose comprises.'
  ),
  (
    'bardage_double_peau_bac_acier',
    'Bardage métallique double peau bac acier (fourni+posé)',
    'm2',
    80, 120, 170,
    0, 0, 0,
    'travaux', 'bardage_exterieur', 'FR',
    'recherche web 2026-08-30 (prix-pose.com, ootravaux.fr, hellopro.fr) — VALIDÉ Johan 2026-08-30',
    'Bâtiment industriel ou agricole : plateaux acier + isolant + parement extérieur. Fourniture 10-25 €/m², pose 40-80 €/m².'
  ),
  (
    'lot_plomberie_complet_logement',
    -- Libellé volontairement écrit comme les artisans rédigent : « Lot plomberie
    -- complet » ne se rapprochait de rien (0,73 contre « Rénovation plomberie SDB »),
    -- « Plomberie et sanitaires » remonte en tête à 0,764.
    'Plomberie et sanitaires — installation complète d''un logement',
    'forfait',
    0, 0, 0,
    7300, 12000, 18200,
    'travaux', 'plomberie_sanitaires', 'FR',
    'recherche web 2026-08-30 (travaux.com, renovbox.fr, prix-travaux-m2.com) — VALIDÉ Johan 2026-08-30',
    'Lot plomberie complet (suivant plan) : réfection ou création des réseaux d''un logement d''environ 100 m², équivalent 50-110 €/m² HT. Fourchette large assumée — dépend du nombre de points d''eau et de l''accessibilité des réseaux.'
  )
on conflict (job_type) do nothing;
