-- ============================================================================
-- V3.4.14+ (2026-05-16) — Enrichissement catalogue market_prices
-- Cible : ANC réhabilitation complète + prestations techniques sous-couvertes
-- ============================================================================
--
-- CONTEXTE
-- --------
-- Le bug originel (V3.4.13) a montré qu'un devis "ANC réhabilitation complète"
-- à 22 k€ se faisait matcher au seul forfait `micro_station_epuration`
-- (6-19 k€) du catalogue, produisant une fausse anomalie "+11 100€" alors
-- qu'une réhabilitation complète intègre terrassement + cuve + filière de
-- traitement + raccordements + remise en état. La garde plausibilité V3.4.13
-- mask le hero accusatoire mais le scoring reste indicatif uniquement.
--
-- Cette migration apporte le FIX STRUCTUREL : on ajoute les entrées catalogue
-- manquantes pour que le matching trouve une fourchette représentative de la
-- prestation réelle, plutôt que de tomber sur un composant isolé.
--
-- COUVERTURE
-- ----------
-- ANC complet et alternatives (7 entrées) :
--   - Réhabilitation complète clé en main
--   - Filière filtre à sable
--   - Filière phytoépuration / filtre planté
--   - Filière tertre d'infiltration
--   - Épandage souterrain traditionnel
--   - Étude de sol pédologique préalable
--   - Terrassement spécifique ANC
--
-- Prestations techniques sous-couvertes (8 entrées) :
--   - Géothermie verticale (forage) + horizontale (capteurs nappe)
--   - Cuve récupération eau de pluie enterrée
--   - Élévateur PMR résidentiel
--   - Bardage HPL composite et bois extérieur
--   - Domotique multi-pièces (variant complète)
--   - Photovoltaïque granulaire €/kWc
-- ============================================================================

-- Resynchroniser la séquence AVANT toute insertion (id SERIAL)
SELECT setval(
  pg_get_serial_sequence('market_prices', 'id'),
  GREATEST((SELECT MAX(id) FROM market_prices), 1),
  true
);

INSERT INTO public.market_prices
  (job_type, label, unit,
   price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht,
   fixed_min_ht, fixed_avg_ht, fixed_max_ht,
   zip_scope, notes, domain)
VALUES

-- ============================================================
-- ASSAINISSEMENT NON COLLECTIF (ANC) — RÉHABILITATION & FILIÈRES
-- ============================================================
-- Fourchettes basées sur :
--   - Observations VMD 2025-2026 (devis ANC analysés)
--   - Données FNTP / FNCPC (Fédération entreprises canalisations)
--   - Référentiels SPANC départementaux (66, 35, 22, 14, 86)
-- ============================================================

-- ENTRÉE PRINCIPALE — Réhabilitation complète clé en main.
-- Intègre : étude sol + terrassement + dépose ancien + cuve + filière de
-- traitement standard + raccords + remise en état terrain. Variante haute :
-- maison >120m² SHAB ou contraintes terrain (rocher, pente).
('anc_rehabilitation_complete',     'Réhabilitation complète ANC (étude + terrassement + cuve + filière + raccords + remise en état)', 'forfait', 0, 0, 0, 14000, 19000, 25000, 'FR', 'Maison individuelle 4-6 pièces. Hors électricité poste relèvement.', 'travaux'),

-- ALTERNATIVES FILIÈRES (variantes de traitement, hors réhabilitation complète)
-- Chaque ligne = "filière seule" hors terrassement.
('anc_filtre_a_sable_drainee',      'Filière filtre à sable vertical drainé',            'forfait', 0, 0, 0,  6500, 10000, 14000, 'FR', 'Hors terrassement et raccords', 'travaux'),
('anc_filtre_plante_phytoepuration','Filière filtre planté / phytoépuration',            'forfait', 0, 0, 0,  8000, 12000, 16000, 'FR', 'Agrément ministériel requis. Hors terrassement.', 'travaux'),
('anc_tertre_infiltration',         'Filière tertre d''infiltration (sol imperméable)',  'forfait', 0, 0, 0,  9000, 13000, 18000, 'FR', 'Indiqué si sol non infiltrant. Hors terrassement.', 'travaux'),
('anc_epandage_souterrain',         'Filière épandage souterrain traditionnel',          'forfait', 0, 0, 0,  5000,  7500, 10000, 'FR', 'Tranchées 0.6-0.8m. Hors terrassement gros volume.', 'travaux'),

-- ÉTAPES AMONT (étude + terrassement spécifique)
('anc_etude_sol_pedologique',       'Étude de sol pédologique / étude filière ANC',      'forfait', 0, 0, 0,   500,   900,  1500, 'FR', 'Obligatoire avant pose. SPANC consultatif.', 'travaux'),
('anc_terrassement_fouilles',       'Terrassement spécifique ANC (fouilles cuve + tranchées épandage)', 'forfait', 0, 0, 0,  2200,  3500,  5500, 'FR', 'Évacuation terres incluse. Hors rocher.', 'travaux'),


-- ============================================================
-- GÉOTHERMIE — Verticale + Horizontale
-- ============================================================
-- Sous-couvert avant : "pompe_chaleur_geothermique" (forfait global) cachait
-- les capteurs qui peuvent représenter 30-50% du coût total. Séparer permet :
--   1. Une comparaison fine quand le devis détaille (capteurs facturés au ml)
--   2. Une comparaison plus précise sur les forages (qui dépendent du sol)
-- ============================================================

-- Verticale : forage profond (50-150m généralement) — facturé au mètre linéaire
-- de profondeur. Inclut : forage, tubage PEHD, sondes, cimentation. Hors PAC.
('geothermie_capteurs_verticaux',   'Capteurs géothermiques verticaux (forage)',         'ml',     90, 140,  200,     0,    0,    0, 'FR', 'Hors PAC et raccordement. RGE QualiForage.', 'travaux'),

-- Horizontale : tranchées sub-surface (0.8-1.2m de profondeur, 1 are à 2 ares
-- de surface). Forfait global car la pose est rapide et standardisée.
('geothermie_capteurs_horizontaux', 'Capteurs géothermiques horizontaux (nappe)',        'forfait', 0, 0, 0,  3500,  6000,  9000, 'FR', 'Surface terrain ~1.5-2× SHAB. Hors PAC.', 'travaux'),


-- ============================================================
-- RÉCUPÉRATION EAU DE PLUIE
-- ============================================================
-- Distinction enterrée vs aérienne : prix très différents (×5-10).
-- ============================================================

('cuve_eau_pluie_enterree',         'Cuve récupération eau de pluie enterrée 5000-10000L', 'forfait', 0, 0, 0, 3500, 5500, 8000, 'FR', 'Inclut terrassement + pose. Hors filtration usage intérieur.', 'travaux'),
('cuve_eau_pluie_aerienne',         'Cuve récupération eau de pluie aérienne 1000-3000L',  'forfait', 0, 0, 0,  400, 1000, 1800, 'FR', 'Pose simple, hors collecte gouttières.', 'travaux'),


-- ============================================================
-- ÉLÉVATEUR PMR RÉSIDENTIEL
-- ============================================================
-- Catalogue avant : aucun. Pourtant fréquent en rénovation senior / handicap.
-- Tranche large car configurations très variées (2 niveaux vs 4 niveaux,
-- intérieur vs extérieur, cabine vs plateforme).
-- ============================================================

('elevateur_pmr_plateforme',        'Élévateur PMR plateforme verticale (2-3 niveaux)',  'forfait', 0, 0, 0,  8000, 12000, 18000, 'FR', 'Hors travaux gros œuvre cage. CITE/MaPrimeRénov Adapt.', 'travaux'),


-- ============================================================
-- BARDAGE EXTÉRIEUR — Variantes manquantes
-- ============================================================
-- Catalogue avant : bardage_bois_exterieur et bardage_composite_exterieur en
-- fourchettes basses. On ajoute les variantes haut de gamme (HPL, mélèze) et
-- on précise les écarts. Les bardages représentent souvent 25-40% d'une
-- rénovation ITE — une fourchette imprécise peut générer ±5000€ d'écart.
-- ============================================================

('bardage_hpl_haut_gamme',          'Bardage HPL haut de gamme (fourni+posé)',           'm2',      95, 130,  180,     0,    0,    0, 'FR', 'Type Trespa/Fundermax. Hors ossature.', 'travaux'),
('bardage_meleze_naturel',          'Bardage mélèze naturel (fourni+posé)',              'm2',      75, 105,  150,     0,    0,    0, 'FR', 'Sans traitement, classe 3-4. Hors ossature.', 'travaux'),


-- ============================================================
-- DOMOTIQUE — Variante "maison complète"
-- ============================================================
-- Catalogue avant : domotique_centrale_pose 3000-13000€ trop large (1× à 4×).
-- On ajoute deux variantes plus précises selon ampleur.
-- ============================================================

('domotique_studio_appartement',    'Domotique studio/appartement (1-3 pièces équipées)','forfait', 0, 0, 0, 1500, 2800, 4500, 'FR', 'Box + 5-10 équipements. Hors gros câblage.', 'travaux'),
('domotique_maison_complete',       'Domotique maison complète (>4 pièces, multi-protocoles)', 'forfait', 0, 0, 0, 4500, 8000, 14000, 'FR', 'Box principale + sous-stations. Hors gros œuvre.', 'travaux'),


-- ============================================================
-- PHOTOVOLTAÏQUE — Granulaire par kWc
-- ============================================================
-- Catalogue avant : 3 / 6 / 9 kWc en forfaits seuls. Problème : les devis
-- modernes facturent souvent par kWc (autoconsommation 4.5 / 7.5 kWc).
-- Ajout d'une entrée par kWc pour matcher ces devis sans bricoler les forfaits.
-- ============================================================

('photovoltaique_par_kwc',          'Photovoltaïque autoconsommation (par kWc)',         'kwc',  1700, 2100, 2400,     0,    0,    0, 'FR', 'Inclut onduleur, pose, MES. RGE QualiPV.', 'travaux');


-- ============================================================
-- METADONNÉES V3.6 — room_specific reste false par défaut.
-- generic_family : on regroupe les variantes ANC sous "anc_filiere" pour
-- que le matcher puisse fallback sur la famille si la signature Gemini
-- ne distingue pas la filière (ex: "Création système ANC pour maison").
-- ============================================================
UPDATE public.market_prices SET generic_family = 'anc_filiere'
WHERE job_type IN (
  'anc_filtre_a_sable_drainee',
  'anc_filtre_plante_phytoepuration',
  'anc_tertre_infiltration',
  'anc_epandage_souterrain'
);

-- Domotique : famille pour fallback variantes
UPDATE public.market_prices SET generic_family = 'domotique'
WHERE job_type IN ('domotique_studio_appartement', 'domotique_maison_complete', 'domotique_centrale_pose');

-- Bardage : famille pour fallback variantes
UPDATE public.market_prices SET generic_family = 'bardage_exterieur'
WHERE job_type IN ('bardage_hpl_haut_gamme', 'bardage_meleze_naturel', 'bardage_bois_exterieur', 'bardage_composite_exterieur');

COMMENT ON COLUMN public.market_prices.generic_family IS
  'Famille pour fallback matcher V3.6 quand la signature Gemini ne distingue pas la variante (ex: anc_filiere = toutes filières de traitement ANC, le matcher prend l''entrée moyenne si pas de match exact).';
