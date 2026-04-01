-- ============================================================
-- Migration : +200 prix marché — lacunes majeures comblées
-- Date : 2026-03-30
-- Rationnel : analyse des 527 observations réelles + domaines
-- les plus demandés en France non couverts par les ~270 entrées
-- existantes. Répartition :
--   20 Toiture/couverture (matériaux spécifiques)
--   15 Maçonnerie gros œuvre
--   15 Salle de bain spécialisée
--   15 Cuisine (plans de travail, équipements)
--   15 Isolation avancée
--   15 Chauffage spécialisé
--   15 Électricité avancée
--   12 Peinture / revêtements décoratifs
--   10 Sols spécialisés
--   15 Menuiseries extérieures fourni+posé
--   12 Aménagement extérieur
--   10 Menuiseries intérieures spécialisées
--    6 Escaliers
--   10 Plomberie spécialisée
--   10 Rénovation globale (packages)
--    5 Divers techniques
-- ============================================================

-- Resynchroniser la séquence AVANT toute insertion
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
-- TOITURE & COUVERTURE (20 entrées)
-- Les devis de couverture sont très fréquents et l'entrée
-- générique "toiture 90-140€/m²" est insuffisante.
-- ============================================================
('couverture_tuile_terre_cuite',    'Couverture tuile terre cuite (fourni+posé)',        'm2',      70,  100,  140,     0,    0,    0, 'FR', 'Base', 'travaux'),
('couverture_tuile_beton',          'Couverture tuile béton (fourni+posé)',               'm2',      55,   85,  120,     0,    0,    0, 'FR', 'Base', 'travaux'),
('couverture_ardoise_naturelle',     'Couverture ardoise naturelle (fourni+posé)',         'm2',      90,  130,  185,     0,    0,    0, 'FR', 'Base', 'travaux'),
('couverture_ardoise_fibrociment',  'Couverture ardoise fibrociment (fourni+posé)',       'm2',      50,   80,  115,     0,    0,    0, 'FR', 'Base', 'travaux'),
('couverture_zinc_joint_debout',    'Couverture zinc joint debout (fourni+posé)',         'm2',     100,  150,  210,     0,    0,    0, 'FR', 'Zinc TL ou naturel', 'travaux'),
('couverture_bac_acier',            'Couverture bac acier (fourni+posé)',                 'm2',      35,   60,   95,     0,    0,    0, 'FR', 'Base', 'travaux'),
('etancheite_toiture_plate_bicouche','Étanchéité toiture plate bicouche bitume',         'm2',      45,   72,  105,     0,    0,    0, 'FR', 'Base', 'travaux'),
('membrane_epdm_toiture_plate',     'Membrane EPDM toiture plate (fourni+posé)',          'm2',      50,   82,  125,     0,    0,    0, 'FR', 'Base', 'travaux'),
('gouttiere_zinc_demi_ronde',       'Gouttière zinc demi-ronde (fourni+posé)',            'ml',      35,   55,   90,     0,    0,    0, 'FR', 'Base', 'travaux'),
('gouttiere_pvc_pose',              'Gouttière PVC (fourni+posé)',                        'ml',      18,   28,   48,     0,    0,    0, 'FR', 'Base', 'travaux'),
('descente_ep_zinc',                'Descente eaux pluviales zinc (fourni+posé)',         'ml',      35,   58,   90,     0,    0,    0, 'FR', 'Base', 'travaux'),
('descente_ep_pvc',                 'Descente eaux pluviales PVC (fourni+posé)',          'ml',      14,   22,   38,     0,    0,    0, 'FR', 'Base', 'travaux'),
('charpente_traditionnelle',        'Charpente traditionnelle (neuf)',                    'm2',      55,   90,  135,     0,    0,    0, 'FR', 'Surface au sol', 'travaux'),
('charpente_industrielle_fermettes','Charpente industrielle fermettes',                   'm2',      35,   60,   92,     0,    0,    0, 'FR', 'Base', 'travaux'),
('faitage_remplacement',            'Remplacement faîtage + solin',                      'ml',      28,   48,   75,     0,    0,    0, 'FR', 'Base', 'travaux'),
('velux_fourniture_pose',           'Velux fourni + posé (GGL/GGU standard)',             'unité',  900, 1400, 2200,     0,    0,    0, 'FR', 'Fourniture incluse', 'travaux'),
('couverture_shingle',              'Couverture shingle (bardeaux bitumés)',              'm2',      30,   55,   82,     0,    0,    0, 'FR', 'Toiture faible pente', 'travaux'),
('toiture_vegetalisee_extensive',   'Toiture végétalisée extensive',                     'm2',      60,  100,  155,     0,    0,    0, 'FR', 'Hors structure renforce', 'travaux'),
('traitement_hydrofuge_toiture',    'Traitement hydrofuge / imperméabilisant toiture',    'm2',       8,   15,   26,     0,    0,    0, 'FR', 'Base', 'travaux'),
('echafaudage_facade',              'Échafaudage façade (location + montage)',            'm2',       5,    9,   16,     0,    0,    0, 'FR', 'Surface façade', 'travaux'),

-- ============================================================
-- MAÇONNERIE GROS ŒUVRE (15 entrées)
-- Quasiment absent du catalogue alors que très demandé
-- ============================================================
('mur_parpaing_20_construction',    'Construction mur parpaing 20 cm (fourni+posé)',      'm2',      55,   88,  128,     0,    0,    0, 'FR', 'Base', 'travaux'),
('mur_brique_pleine',               'Mur briques pleines (fourni+posé)',                  'm2',      75,  118,  168,     0,    0,    0, 'FR', 'Base', 'travaux'),
('mur_brique_monomur',              'Mur brique monomur 30 cm (fourni+posé)',             'm2',      92,  138,  198,     0,    0,    0, 'FR', 'Base', 'travaux'),
('dalle_beton_exterieure',          'Dalle béton armée extérieure',                       'm2',      40,   62,   95,     0,    0,    0, 'FR', 'Base', 'travaux'),
('enduit_facade_monocouche',        'Enduit façade monocouche (fourni+posé)',              'm2',      28,   46,   68,     0,    0,    0, 'FR', 'Base', 'travaux'),
('ravalement_facade_complet',       'Ravalement façade complet (nettoyage+enduit)',       'm2',      38,   65,   98,     0,    0,    0, 'FR', 'Hors échafaudage', 'travaux'),
('mur_soutenement_beton',           'Mur de soutènement béton armé',                     'ml',     250,  420,  680,     0,    0,    0, 'FR', 'Selon hauteur', 'travaux'),
('fondation_semelle_filante',       'Fondation semelle filante béton',                   'ml',     180,  310,  520,     0,    0,    0, 'FR', 'Béton + coffrage + armature', 'travaux'),
('drainage_pied_mur',               'Drainage périphérique pied de mur',                 'ml',      40,   68,  105,     0,    0,    0, 'FR', 'Tuyau drainant + géotextile', 'travaux'),
('regard_beton_visite',             'Regard en béton préfabriqué',                       'unité',  300,  550,  900,     0,    0,    0, 'FR', 'Base', 'travaux'),
('cuvelage_sous_sol',               'Cuvelage sous-sol (étanchéité intérieure)',          'm2',      70,  112,  165,     0,    0,    0, 'FR', 'Base', 'travaux'),
('injection_resine_fissure_beton',  'Injection résine réparation fissure béton',         'ml',      60,  115,  210,     0,    0,    0, 'FR', 'Base', 'travaux'),
('micropieux_reprise_oeuvre',       'Reprise en sous-œuvre micropieux',                  'unité',   600, 1100, 2000,     0,    0,    0, 'FR', 'Par micropieu', 'travaux'),
('demolition_mur_porteur_poutre',   'Dépose mur porteur + pose poutre IPN',              'forfait',   0,    0,    0,  3000, 5500, 10500, 'FR', 'Hors travaux connexes', 'travaux'),
('dalle_beton_interieure',          'Dalle béton intérieure armée (ragréage épais)',      'm2',      32,   52,   80,     0,    0,    0, 'FR', 'Base', 'travaux'),

-- ============================================================
-- SALLE DE BAIN SPÉCIALISÉE (15 entrées)
-- Nombreux devis SDB avec travaux non couverts
-- ============================================================
('douche_italienne_creation',       'Création douche italienne complète (maçonnerie+étanchéité+carrelage)', 'forfait', 0, 0, 0, 1800, 3200, 5500, 'FR', 'Base', 'travaux'),
('wc_broyeur_pose',                 'Pose WC broyeur (hors fourniture)',                 'unité',  200,  360,  580,     0,    0,    0, 'FR', 'Base', 'travaux'),
('mosaique_pose',                   'Pose mosaïque (hors fourniture)',                   'm2',      65,  100,  150,     0,    0,    0, 'FR', 'Colle C2 + joint', 'travaux'),
('pierre_naturelle_interieur',      'Pose pierre naturelle intérieure',                  'm2',      65,   98,  140,     0,    0,    0, 'FR', 'Base', 'travaux'),
('sdb_renovation_petite',           'Rénovation SDB complète < 5 m²',                   'forfait',   0,    0,    0,  6000, 10000, 17000, 'FR', 'Hors fourniture', 'travaux'),
('sdb_renovation_grande',           'Rénovation SDB complète > 8 m²',                   'forfait',   0,    0,    0, 10000, 17500, 30000, 'FR', 'Hors fourniture', 'travaux'),
('siphon_de_sol_pose',              'Pose siphon de sol (hors fourniture)',               'unité',  100,  175,  320,     0,    0,    0, 'FR', 'Base', 'travaux'),
('baignoire_balneo_pose',           'Pose baignoire balnéo (hors fourniture)',           'unité',  500,  920,  1650,     0,    0,    0, 'FR', 'Branchement balnéo inclus', 'travaux'),
('meuble_double_vasque_pose',       'Pose meuble double vasque',                         'unité',  350,  620,  980,     0,    0,    0, 'FR', 'Base', 'travaux'),
('douche_pmr_creation',             'Création douche PMR accessible',                   'forfait',   0,    0,    0,  2500, 4500, 8500, 'FR', 'Base', 'travaux'),
('bain_douche_conversion',          'Transformation baignoire en douche italienne',      'forfait',   0,    0,    0,   800, 1600, 3000, 'FR', 'Hors carrelage neuf', 'travaux'),
('robinetterie_bain_pose',          'Pose robinetterie de bain (hors fourniture)',       'unité',  120,  230,  400,     0,    0,    0, 'FR', 'Base', 'travaux'),
('receveur_resine_extra_plat',      'Pose receveur résine extra-plat',                   'unité',  200,  330,  520,     0,    0,    0, 'FR', 'Base', 'travaux'),
('carrelage_hexagonal_pose',        'Pose carrelage hexagonal sol / mosaïque',           'm2',      55,   88,  135,     0,    0,    0, 'FR', 'Base', 'travaux'),
('seche_serviette_eau_pose',        'Pose sèche-serviettes eau chaude (hors fourniture)','unité',  200,  360,  620,     0,    0,    0, 'FR', 'Base', 'travaux'),

-- ============================================================
-- CUISINE (15 entrées)
-- Les postes de cuisine manquent de granularité matériaux
-- ============================================================
('plan_travail_granit_pose',        'Plan de travail granit (hors fourniture)',           'ml',     100,  165,  260,     0,    0,    0, 'FR', 'Base', 'travaux'),
('plan_travail_quartz_pose',        'Plan de travail quartz/silestone (hors fourniture)', 'ml',     100,  185,  290,     0,    0,    0, 'FR', 'Base', 'travaux'),
('plan_travail_bois_massif_pose',   'Plan de travail bois massif (hors fourniture)',      'ml',      80,  145,  230,     0,    0,    0, 'FR', 'Base', 'travaux'),
('plan_travail_stratifie_pose',     'Plan de travail stratifié (hors fourniture)',        'ml',      40,   78,  125,     0,    0,    0, 'FR', 'Base', 'travaux'),
('evier_inox_pose',                 'Pose évier inox (hors fourniture)',                  'unité',  100,  185,  310,     0,    0,    0, 'FR', 'Base', 'travaux'),
('evier_granit_composite_pose',     'Pose évier granit composite (hors fourniture)',      'unité',  120,  230,  400,     0,    0,    0, 'FR', 'Base', 'travaux'),
('hotte_casquette_pose',            'Pose hotte aspirante casquette (hors fourniture)',   'unité',  100,  185,  320,     0,    0,    0, 'FR', 'Base', 'travaux'),
('hotte_ilot_suspendue_pose',       'Pose hotte îlot suspendue (hors fourniture)',        'unité',  180,  330,  580,     0,    0,    0, 'FR', 'Réseau gaine en sus', 'travaux'),
('plaque_cuisson_pose',             'Pose plaque de cuisson (hors fourniture)',           'unité',   80,  165,  290,     0,    0,    0, 'FR', 'Base', 'travaux'),
('four_encastre_pose',              'Pose four encastré (hors fourniture)',               'unité',   80,  165,  290,     0,    0,    0, 'FR', 'Base', 'travaux'),
('lave_vaisselle_integre_pose',     'Pose lave-vaisselle intégrable (hors fourniture)',   'unité',   80,  165,  290,     0,    0,    0, 'FR', 'Base', 'travaux'),
('cuisine_renovation_petite',       'Rénovation cuisine complète < 8 m²',                'forfait',   0,    0,    0,  8000, 14000, 26000, 'FR', 'Hors électroménager', 'travaux'),
('cuisine_renovation_grande',       'Rénovation cuisine complète > 12 m²',               'forfait',   0,    0,    0, 14000, 26000, 48000, 'FR', 'Hors électroménager', 'travaux'),
('credence_verre_securit_pose',     'Pose crédence verre sécurit (hors fourniture)',      'm2',      80,  165,  290,     0,    0,    0, 'FR', 'Base', 'travaux'),
('ilot_central_cuisine_pose',       'Pose îlot central cuisine (hors fourniture)',        'forfait',   0,    0,    0,   600, 1300, 2800, 'FR', 'Base', 'travaux'),

-- ============================================================
-- ISOLATION AVANCÉE (15 entrées)
-- ITE, bardages, isolation acoustique, soufflage
-- ============================================================
('soufflage_laine_combles_perdus',  'Soufflage laine soufflée combles perdus',           'm2',      20,   35,   56,     0,    0,    0, 'FR', 'RGE', 'travaux'),
('ouate_cellulose_projection',      'Projection ouate de cellulose',                     'm2',      25,   42,   65,     0,    0,    0, 'FR', 'RGE', 'travaux'),
('laine_de_bois_combles',           'Isolation laine de bois combles',                   'm2',      30,   52,   80,     0,    0,    0, 'FR', 'RGE', 'travaux'),
('bardage_bois_exterieur',          'Bardage bois extérieur (fourni+posé)',               'm2',      55,   92,  140,     0,    0,    0, 'FR', 'Base', 'travaux'),
('bardage_composite_exterieur',     'Bardage composite extérieur (fourni+posé)',          'm2',      50,   82,  125,     0,    0,    0, 'FR', 'Base', 'travaux'),
('bardage_pvc_exterieur',           'Bardage PVC extérieur (fourni+posé)',                'm2',      35,   56,   88,     0,    0,    0, 'FR', 'Base', 'travaux'),
('ITE_enduit_mince',                'ITE enduit mince (polystyrène + enduit)',            'm2',      80,  125,  172,     0,    0,    0, 'FR', 'RGE', 'travaux'),
('isolation_phonique_cloison',      'Isolation phonique cloison (laine + placo renforcé)','m2',     45,   72,  115,     0,    0,    0, 'FR', 'Base', 'travaux'),
('isolation_phonique_plafond',      'Isolation phonique plafond',                        'm2',      40,   68,  105,     0,    0,    0, 'FR', 'Base', 'travaux'),
('isolation_vide_sanitaire',        'Isolation vide sanitaire (panneaux/rouleaux)',       'm2',      25,   42,   65,     0,    0,    0, 'FR', 'Base', 'travaux'),
('isolation_plancher_haut',         'Isolation plancher haut entre logements',            'm2',      22,   38,   58,     0,    0,    0, 'FR', 'Base', 'travaux'),
('isolation_sous_toiture_rampant',  'Isolation rampants sous toiture (laine minérale)',   'm2',      38,   58,   90,     0,    0,    0, 'FR', 'Base', 'travaux'),
('calorifugeage_ballon',            'Calorifugeage réservoir eau chaude',                'forfait',   0,    0,    0,   150,  290,  520, 'FR', 'Base', 'travaux'),
('calorifugeage_tuyaux',            'Calorifugeage tuyauterie chauffage',                'ml',       8,   15,   26,     0,    0,    0, 'FR', 'Base', 'travaux'),
('pare_vapeur_pose',                'Pose pare-vapeur / frein vapeur',                   'm2',       8,   14,   24,     0,    0,    0, 'FR', 'Base', 'travaux'),

-- ============================================================
-- CHAUFFAGE SPÉCIALISÉ (15 entrées)
-- Planchers chauffants, poêles, insert, chaudières
-- ============================================================
('plancher_chauffant_electrique',   'Plancher chauffant électrique (câble/mat)',          'm2',      40,   68,  100,     0,    0,    0, 'FR', 'Base', 'travaux'),
('plancher_chauffant_eau',          'Plancher chauffant hydraulique eau chaude',          'm2',      55,   88,  132,     0,    0,    0, 'FR', 'Base', 'travaux'),
('poele_bois_pose',                 'Pose poêle à bois (hors fourniture)',                'forfait',   0,    0,    0,   400,  850, 1600, 'FR', 'Hors tubage', 'travaux'),
('poele_granules_pose',             'Pose poêle à granulés (hors fourniture)',            'forfait',   0,    0,    0,   500, 1050, 2100, 'FR', 'Hors tubage', 'travaux'),
('insert_cheminee_pose',            'Pose insert cheminée (hors fourniture)',             'forfait',   0,    0,    0,   600, 1250, 2600, 'FR', 'Hors tubage', 'travaux'),
('tubage_cheminee_inox',            'Tubage cheminée flexible inox',                     'ml',      45,   78,  128,     0,    0,    0, 'FR', 'Flexible ou rigide', 'travaux'),
('radiateur_electrique_inertie',    'Pose radiateur électrique à inertie (hors fourniture)', 'unité', 100, 188, 320,  0,    0,    0, 'FR', 'Base', 'travaux'),
('radiateur_fonte_pose',            'Pose radiateur fonte (hors fourniture)',             'unité',  150,  290,  500,     0,    0,    0, 'FR', 'Base', 'travaux'),
('chaudiere_condensation_rempl',    'Remplacement chaudière condensation gaz',            'forfait',   0,    0,    0,  2000, 3200, 5200, 'FR', 'MO + raccordement', 'travaux'),
('chaudiere_fioul_remplacement',    'Remplacement chaudière fioul',                      'forfait',   0,    0,    0,  2500, 4200, 7000, 'FR', 'MO + raccordement', 'travaux'),
('adoucisseur_eau_pose',            'Pose adoucisseur d''eau (hors fourniture)',          'forfait',   0,    0,    0,   700, 1150, 2000, 'FR', 'Base', 'travaux'),
('thermostat_connecte_pose',        'Pose thermostat connecté (hors fourniture)',         'unité',   80,  155,  290,     0,    0,    0, 'FR', 'Base', 'travaux'),
('pompe_circulatrice_remplacement', 'Remplacement pompe circulatrice chauffage',         'unité',  250,  420,  680,     0,    0,    0, 'FR', 'Base', 'travaux'),
('equilibrage_chauffage',           'Équilibrage réseau de chauffage',                   'forfait',   0,    0,    0,   200,  420,  750, 'FR', 'Base', 'travaux'),
('robinets_thermostatiques_lot',    'Remplacement robinets thermostatiques (lot complet)','forfait',  0,    0,    0,   300,  620, 1150, 'FR', 'Base', 'travaux'),

-- ============================================================
-- ÉLECTRICITÉ AVANCÉE (15 entrées)
-- Alarme, caméras, installation complète, conformité
-- ============================================================
('alarme_intrusion_sans_fil',       'Système alarme intrusion sans fil (fourni+posé)',   'forfait',   0,    0,    0,   900, 1650, 3100, 'FR', 'Base', 'travaux'),
('alarme_intrusion_filaire',        'Système alarme intrusion filaire (fourni+posé)',    'forfait',   0,    0,    0,  1400, 2600, 4800, 'FR', 'Base', 'travaux'),
('camera_ip_ext_pose',              'Pose caméra IP extérieure (hors fourniture)',        'unité',  150,  290,  500,     0,    0,    0, 'FR', 'Base', 'travaux'),
('interphone_video_pose',           'Pose interphone vidéo (hors fourniture)',            'forfait',   0,    0,    0,   250,  520,  980, 'FR', 'Base', 'travaux'),
('eclairage_exterieur_pose',        'Pose éclairage extérieur (hors fourniture)',         'unité',  120,  230,  400,     0,    0,    0, 'FR', 'Base', 'travaux'),
('installation_elec_t2',            'Installation électrique complète T2',               'forfait',   0,    0,    0,  3000, 5200, 9000, 'FR', 'Base', 'travaux'),
('installation_elec_t3',            'Installation électrique complète T3',               'forfait',   0,    0,    0,  4500, 7200, 13000, 'FR', 'Base', 'travaux'),
('installation_elec_t4_t5',         'Installation électrique complète T4/T5',            'forfait',   0,    0,    0,  6000, 10000, 17000, 'FR', 'Base', 'travaux'),
('mise_conformite_elec',            'Mise en conformité électrique complète',            'forfait',   0,    0,    0,  1200, 2300, 4200, 'FR', 'Base', 'travaux'),
('coffret_gtl_pose',                'Coffret GTL gaine technique logement',              'forfait',   0,    0,    0,   150,  290,  480, 'FR', 'Base', 'travaux'),
('parafoudre_pose',                 'Pose parafoudre tableau électrique',                'unité',  180,  310,  520,     0,    0,    0, 'FR', 'Base', 'travaux'),
('bande_led_installation',          'Installation ruban LED encastré (hors fourniture)', 'ml',      12,   22,   42,     0,    0,    0, 'FR', 'Base', 'travaux'),
('domotique_centrale_pose',         'Pose centrale domotique (hors fourniture)',         'forfait',   0,    0,    0,  3000, 6500, 13000, 'FR', 'Base', 'travaux'),
('detecteur_fumee_pose',            'Pose détecteurs fumée interconnectés',              'forfait',   0,    0,    0,   120,  260,  480, 'FR', 'Par pièce inclus', 'travaux'),
('prise_rj45_pose',                 'Pose prise RJ45 / réseau informatique',             'unité',   40,   72,  125,     0,    0,    0, 'FR', 'Base', 'travaux'),

-- ============================================================
-- PEINTURE & REVÊTEMENTS DÉCORATIFS (12 entrées)
-- Béton ciré, enduit chaux, résines, lambris
-- ============================================================
('beton_cire_murs',                 'Béton ciré murs intérieurs',                        'm2',      50,   82,  135,     0,    0,    0, 'FR', 'Base', 'travaux'),
('enduit_chaux_interieur',          'Enduit chaux intérieur (tadelakt/stucolustro)',      'm2',      28,   46,   75,     0,    0,    0, 'FR', 'Base', 'travaux'),
('enduit_decoratif_texture',        'Enduit décoratif texturé (stuc/relief)',             'm2',      35,   62,  105,     0,    0,    0, 'FR', 'Base', 'travaux'),
('resine_epoxy_sol',                'Résine époxy sol lissé',                            'm2',      30,   58,   95,     0,    0,    0, 'FR', 'Base', 'travaux'),
('microtopping_sol_murs',           'Microtopping béton sol / murs',                     'm2',      45,   78,  128,     0,    0,    0, 'FR', 'Base', 'travaux'),
('impermeabilisant_facade_peinture','Peinture imperméabilisante façade',                 'm2',      10,   19,   34,     0,    0,    0, 'FR', 'Hors échafaudage', 'travaux'),
('decollement_papier_peint',        'Décollement papier peint',                          'm2',       6,   12,   22,     0,    0,    0, 'FR', 'Base', 'travaux'),
('lambris_pvc_pose',                'Pose lambris PVC (hors fourniture)',                 'm2',      18,   30,   52,     0,    0,    0, 'FR', 'Base', 'travaux'),
('peinture_garage_epoxy_sol',       'Peinture sol garage époxy',                         'm2',      15,   28,   52,     0,    0,    0, 'FR', 'Base', 'travaux'),
('anti_humidite_produit_murs',      'Traitement anti-humidité produit injectés murs',     'm2',      12,   24,   42,     0,    0,    0, 'FR', 'Base', 'travaux'),
('bibliotheque_bois_mesure',        'Bibliothèque boiserie sur mesure (MO)',              'ml',     200,  400,  750,     0,    0,    0, 'FR', 'Base', 'travaux'),
('claustra_interieur_pose',         'Pose claustra intérieur bois / métal',              'm2',      80,  155,  295,     0,    0,    0, 'FR', 'Base', 'travaux'),

-- ============================================================
-- SOLS SPÉCIALISÉS (10 entrées)
-- Parquet en chevrons, micro-ciment, terrazzo, LVT
-- ============================================================
('parquet_chevrons_pose',           'Pose parquet en chevrons (hors fourniture)',         'm2',      45,   82,  135,     0,    0,    0, 'FR', 'Base', 'travaux'),
('parquet_point_hongrie_pose',      'Pose parquet point de Hongrie (hors fourniture)',    'm2',      50,   88,  142,     0,    0,    0, 'FR', 'Base', 'travaux'),
('linoleum_naturel_pose',           'Pose linoléum naturel',                             'm2',      15,   28,   52,     0,    0,    0, 'FR', 'Base', 'travaux'),
('micro_ciment_sol',                'Application micro-ciment sol',                      'm2',      50,   82,  135,     0,    0,    0, 'FR', 'Base', 'travaux'),
('terrazzo_coule_pose',             'Pose terrazzo coulé in situ',                       'm2',      70,  115,  168,     0,    0,    0, 'FR', 'Base', 'travaux'),
('sol_pvc_lame_luxe_pose',          'Pose sol PVC lames luxe clipsées (LVT)',             'm2',      18,   32,   55,     0,    0,    0, 'FR', 'Base', 'travaux'),
('carrelage_imitation_bois_pose',   'Pose carrelage imitation bois (plank 20x120)',       'm2',      40,   68,  105,     0,    0,    0, 'FR', 'Base', 'travaux'),
('sol_beton_poli',                  'Sol béton poli (meulage + cire)',                   'm2',      30,   55,   90,     0,    0,    0, 'FR', 'Base', 'travaux'),
('vitrification_parquet_seule',     'Huilage / vitrification parquet seule (sans ponçage)', 'm2',   8,   15,   28,     0,    0,    0, 'FR', 'Base', 'travaux'),
('cristallisation_marbre',          'Cristallisation / polissage marbre / pierre',       'm2',      20,   40,   70,     0,    0,    0, 'FR', 'Base', 'travaux'),

-- ============================================================
-- MENUISERIES EXTÉRIEURES FOURNI+POSÉ (15 entrées)
-- Le catalogue n'a que MO seule pour la plupart des menuiseries
-- ============================================================
('fenetre_pvc_fourniture_pose',     'Fenêtre PVC double vitrage (fourni+posé)',           'unité',  400,  660, 1050,     0,    0,    0, 'FR', 'Base', 'travaux'),
('fenetre_alu_fourniture_pose',     'Fenêtre aluminium double vitrage (fourni+posé)',     'unité',  500,  880, 1400,     0,    0,    0, 'FR', 'Base', 'travaux'),
('porte_entree_fourniture_pose',    'Porte d''entrée (fourni+posé)',                      'unité',  800, 1450, 2600,     0,    0,    0, 'FR', 'Base', 'travaux'),
('volet_bois_battant_fourniture',   'Volet bois battant (fourni+posé)',                   'unité',  250,  430,  700,     0,    0,    0, 'FR', 'Base', 'travaux'),
('volet_alu_battant_fourniture',    'Volet aluminium battant (fourni+posé)',               'unité',  350,  600,  980,     0,    0,    0, 'FR', 'Base', 'travaux'),
('portail_coulissant_motorise',     'Portail coulissant motorisé aluminium (fourni+posé)','unité', 1500, 2600, 4800,     0,    0,    0, 'FR', 'Base', 'travaux'),
('portail_battant_motorise',        'Portail battant motorisé (fourni+posé)',             'unité', 1000, 1900, 3400,     0,    0,    0, 'FR', 'Base', 'travaux'),
('store_coffre_motorise',           'Store banne coffre motorisé (fourni+posé)',          'unité', 1200, 2100, 3800,     0,    0,    0, 'FR', 'Base', 'travaux'),
('pergola_bioclimatique_alu',       'Pergola bioclimatique aluminium (fourni+posé)',      'm2',     350,  580,  950,     0,    0,    0, 'FR', 'Base', 'travaux'),
('veranda_alu_creation',            'Véranda aluminium création',                        'm2',     500,  820, 1350,     0,    0,    0, 'FR', 'Base', 'travaux'),
('cloture_bois_occultant',          'Clôture bois occultant (fourni+posé)',               'ml',      35,   62,   98,     0,    0,    0, 'FR', 'Base', 'travaux'),
('cloture_alu_lames',               'Clôture aluminium lames (fourni+posé)',              'ml',      55,   92,  145,     0,    0,    0, 'FR', 'Base', 'travaux'),
('portillon_alu_fourniture_pose',   'Portillon aluminium (fourni+posé)',                  'unité',  400,  720, 1250,     0,    0,    0, 'FR', 'Base', 'travaux'),
('porte_garage_sectionnelle',       'Porte de garage sectionnelle (fourni+posé)',         'unité', 1200, 2100, 3800,     0,    0,    0, 'FR', 'Base', 'travaux'),
('serrure_connectee_pose',          'Pose serrure connectée (hors fourniture)',           'unité',  120,  230,  420,     0,    0,    0, 'FR', 'Base', 'travaux'),

-- ============================================================
-- AMÉNAGEMENT EXTÉRIEUR (12 entrées)
-- Terrasse composite/carrelage, piscine, arrosage
-- ============================================================
('terrasse_composite_pose',         'Terrasse composite lames (fourni+posé)',             'm2',      45,   78,  128,     0,    0,    0, 'FR', 'Base', 'travaux'),
('terrasse_carrelage_exterieur',    'Terrasse carrelage extérieur grand format',          'm2',      55,   92,  148,     0,    0,    0, 'FR', 'Base', 'travaux'),
('beton_desactive_allee',           'Béton désactivé allée / terrasse',                  'm2',      45,   78,  120,     0,    0,    0, 'FR', 'Base', 'travaux'),
('dalle_pierre_naturelle_ext',      'Dalle pierre naturelle extérieure (fourni+posé)',    'm2',      65,  108,  172,     0,    0,    0, 'FR', 'Base', 'travaux'),
('arrosage_automatique_gazon',      'Système arrosage automatique gazon',                'forfait',   0,    0,    0,  1000, 1900, 3800, 'FR', 'Base', 'travaux'),
('eclairage_jardin_basse_tension',  'Éclairage jardin basse tension (hors fourniture)',   'unité',  100,  190,  340,     0,    0,    0, 'FR', 'Base', 'travaux'),
('piscine_coque_polyester',         'Piscine coque polyester (fourni+posé)',              'forfait',   0,    0,    0, 18000, 32000, 55000, 'FR', 'Hors terrassement', 'travaux'),
('piscine_beton_construction',      'Piscine béton armé miroir',                         'forfait',   0,    0,    0, 32000, 55000, 95000, 'FR', 'Hors VRD', 'travaux'),
('pompe_chaleur_piscine_pose',      'Pose pompe à chaleur piscine (hors fourniture)',     'forfait',   0,    0,    0,  2200, 3900, 6800, 'FR', 'Base', 'travaux'),
('drainage_francais_jardin',        'Drainage français jardin',                          'ml',      28,   52,   88,     0,    0,    0, 'FR', 'Base', 'travaux'),
('escalier_exterieur_beton',        'Escalier extérieur béton (sur mesure)',              'forfait',   0,    0,    0,  1500, 3200, 6500, 'FR', 'Base', 'travaux'),
('caniveau_grille_pose',            'Caniveau avec grille de drainage (fourni+posé)',     'ml',      30,   58,   95,     0,    0,    0, 'FR', 'Base', 'travaux'),

-- ============================================================
-- MENUISERIES INTÉRIEURES SPÉCIALISÉES (10 entrées)
-- Vérière, galandage, dressing, garde-corps
-- ============================================================
('porte_galandage_pose',            'Pose porte de galandage (hors fourniture)',          'unité',  250,  460,  780,     0,    0,    0, 'FR', 'Base', 'travaux'),
('verriere_interieure_pose',        'Pose vérière intérieure acier / verre',             'm2',     400,  680, 1150,     0,    0,    0, 'FR', 'Base', 'travaux'),
('porte_coulissante_verre_pose',    'Pose porte coulissante verre (hors fourniture)',     'unité',  300,  580,  980,     0,    0,    0, 'FR', 'Base', 'travaux'),
('dressing_modulable_pose',         'Pose dressing modulable (hors fourniture)',          'ml',     200,  400,  680,     0,    0,    0, 'FR', 'Base', 'travaux'),
('placard_coulissant_miroir_pose',  'Pose portes coulissantes miroir (hors fourniture)', 'unité',  200,  400,  680,     0,    0,    0, 'FR', 'Base', 'travaux'),
('claustra_bois_exterieur',         'Pose claustra bois extérieur',                      'm2',      90,  165,  295,     0,    0,    0, 'FR', 'Base', 'travaux'),
('marquise_verre_pose',             'Pose marquise verre auvent (hors fourniture)',       'ml',     300,  520,  950,     0,    0,    0, 'FR', 'Base', 'travaux'),
('garde_corps_inox',                'Garde-corps inox (fourni+posé)',                    'ml',     250,  430,  700,     0,    0,    0, 'FR', 'Base', 'travaux'),
('garde_corps_verre',               'Garde-corps verre feuilleté (fourni+posé)',         'ml',     350,  600,  980,     0,    0,    0, 'FR', 'Base', 'travaux'),
('habillage_marche_escalier',       'Habillage marche escalier bois (hors fourniture)',  'marche',  80,  165,  295,     0,    0,    0, 'FR', 'Base', 'travaux'),

-- ============================================================
-- ESCALIERS (6 entrées)
-- Travaux très demandés, quasi absents du catalogue
-- ============================================================
('escalier_droit_bois_creation',    'Création escalier droit bois',                      'forfait',   0,    0,    0,  2500, 4800, 8500, 'FR', 'Base', 'travaux'),
('escalier_quart_tournant',         'Création escalier quart tournant',                  'forfait',   0,    0,    0,  3500, 6500, 12500, 'FR', 'Base', 'travaux'),
('escalier_helicoidal_metal',       'Escalier hélicoïdal métal (fourni+posé)',           'forfait',   0,    0,    0,  3000, 5800, 11000, 'FR', 'Base', 'travaux'),
('monte_escalier_pose',             'Pose monte-escalier (hors fourniture)',              'forfait',   0,    0,    0,  1500, 3200, 6500, 'FR', 'Base', 'travaux'),
('trappe_acces_combles_isolee',     'Pose trappe accès combles isolée',                  'unité',  200,  400,  680,     0,    0,    0, 'FR', 'Base', 'travaux'),
('balustrade_renovation',           'Rénovation balustrade / rampe d''escalier',         'ml',      80,  165,  320,     0,    0,    0, 'FR', 'Base', 'travaux'),

-- ============================================================
-- PLOMBERIE SPÉCIALISÉE (10 entrées)
-- Assainissement, canalisations, fosse septique
-- ============================================================
('canalisation_plomb_remplacement', 'Remplacement canalisations plomb',                  'ml',      40,   82,  145,     0,    0,    0, 'FR', 'Base', 'travaux'),
('colonne_fonte_remplacement',      'Remplacement colonne fonte en PVC',                 'ml',      60,  115,  188,     0,    0,    0, 'FR', 'Base', 'travaux'),
('reprise_evacuation_pvc',          'Reprise évacuation PVC (rénovation)',               'ml',      25,   52,   92,     0,    0,    0, 'FR', 'Base', 'travaux'),
('fosse_septique_installation',     'Installation fosse septique toutes eaux',          'forfait',   0,    0,    0,  4000, 7500, 13000, 'FR', 'Hors terrassement', 'travaux'),
('micro_station_epuration',         'Micro-station d''épuration',                        'forfait',   0,    0,    0,  6000, 11000, 19000, 'FR', 'Hors terrassement', 'travaux'),
('raccordement_reseau_assainissement','Raccordement réseau public assainissement',       'forfait',   0,    0,    0,  2000, 4200, 8500, 'FR', 'Base', 'travaux'),
('station_relevage_pose',           'Pose station de relevage eaux usées',               'forfait',   0,    0,    0,  2000, 3800, 7000, 'FR', 'Base', 'travaux'),
('filtre_anti_calcaire_pose',       'Pose filtre anti-calcaire (hors fourniture)',        'unité',  100,  210,  400,     0,    0,    0, 'FR', 'Base', 'travaux'),
('groupe_securite_cumulus',         'Remplacement groupe de sécurité cumulus',           'unité',   80,  145,  250,     0,    0,    0, 'FR', 'Base', 'travaux'),
('nettoyage_pression_canalisation', 'Nettoyage haute pression canalisations',            'ml',      10,   22,   42,     0,    0,    0, 'FR', 'Base', 'travaux'),

-- ============================================================
-- RÉNOVATION GLOBALE (10 entrées)
-- Packages rénovation très demandés — absents du catalogue
-- ============================================================
('renovation_complete_studio',      'Rénovation complète studio 25-35 m²',               'forfait',   0,    0,    0, 15000, 26000, 42000, 'FR', 'Hors fourniture mobilier', 'travaux'),
('renovation_complete_t2',          'Rénovation complète T2 50-60 m²',                   'forfait',   0,    0,    0, 26000, 42000, 68000, 'FR', 'Hors fourniture mobilier', 'travaux'),
('renovation_complete_t3',          'Rénovation complète T3 70-90 m²',                   'forfait',   0,    0,    0, 42000, 68000, 110000, 'FR', 'Hors fourniture mobilier', 'travaux'),
('renovation_complete_t4',          'Rénovation complète T4 100-120 m²',                 'forfait',   0,    0,    0, 62000, 100000, 160000, 'FR', 'Hors fourniture mobilier', 'travaux'),
('renovation_energetique_globale',  'Rénovation énergétique globale maison',             'forfait',   0,    0,    0, 30000, 65000, 110000, 'FR', 'ITE+PAC+VMC+Fenêtres', 'travaux'),
('amenagement_combles_habitables',  'Aménagement combles perdus → habitables',           'm2',     600, 1050, 1900,     0,    0,    0, 'FR', 'Surface créée', 'travaux'),
('extension_ossature_bois',         'Extension ossature bois',                           'm2',    1200, 2100, 3400,     0,    0,    0, 'FR', 'Surface créée', 'travaux'),
('extension_maconnerie_trad',       'Extension maçonnerie traditionnelle',               'm2',    1000, 1900, 2900,     0,    0,    0, 'FR', 'Surface créée', 'travaux'),
('surelevation_maison',             'Surélévation maison',                               'm2',    1200, 2300, 3800,     0,    0,    0, 'FR', 'Surface créée', 'travaux'),
('amenagement_sous_sol',            'Aménagement sous-sol existant',                     'm2',     600, 1150, 1900,     0,    0,    0, 'FR', 'Surface créée', 'travaux'),

-- ============================================================
-- DIVERS TECHNIQUES (5 entrées)
-- ============================================================
('nettoyage_chantier_pro',          'Nettoyage fin de chantier professionnel',           'm2',       3,    6,   14,     0,    0,    0, 'FR', 'Base', 'travaux'),
('nacelle_location_journee',        'Location nacelle / plateforme (journée)',            'forfait',   0,    0,    0,   350,  620, 1150, 'FR', 'Hors transport', 'travaux'),
('detecteur_co_monoxyde',           'Pose détecteur CO monoxyde (hors fourniture)',       'unité',   80,  155,  290,     0,    0,    0, 'FR', 'Base', 'travaux'),
('vidange_fosse_septique',          'Vidange fosse septique',                            'forfait',   0,    0,    0,   150,  295,  520, 'FR', 'Base', 'travaux'),
('expertise_batiment_facade',       'Expertise bâtiment / façade',                       'forfait',   0,    0,    0,   200,  420,  850, 'FR', 'Base', 'travaux');
