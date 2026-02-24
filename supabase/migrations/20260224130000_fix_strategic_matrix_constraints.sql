-- ============================================================
-- Fix: drop old check constraints on strategic_matrix (old 0-5 scale)
-- and upsert all scores on 0-10 scale
-- ============================================================

-- Drop all existing check constraints so we can use 0-10 scale
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.strategic_matrix'::regclass
      AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.strategic_matrix DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

-- Ensure columns exist (safe for repeated runs)
ALTER TABLE public.strategic_matrix
  ADD COLUMN IF NOT EXISTS value_intrinseque  NUMERIC(4,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS liquidite          NUMERIC(4,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attractivite       NUMERIC(4,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS energie            NUMERIC(4,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reduction_risque   NUMERIC(4,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impact_loyer       NUMERIC(4,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vacance            NUMERIC(4,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fiscalite          NUMERIC(4,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS capex_risk         NUMERIC(4,1) NOT NULL DEFAULT 0;

-- ============================================================
-- Upsert all job_types (0-10 scale)
-- Colonnes: job_type, value, liquidite, attractivite, energie, reduction_risque,
--           impact_loyer, vacance, fiscalite, capex_risk
-- ============================================================

INSERT INTO public.strategic_matrix
  (job_type, value_intrinseque, liquidite, attractivite, energie, reduction_risque,
   impact_loyer, vacance, fiscalite, capex_risk)
VALUES

-- ISOLATION & ÉNERGIE
('isolation_combles',           6, 7, 5, 9, 5,   5, 6, 8, 2),
('isolation_combles_perdus',    6, 7, 5, 9, 5,   5, 6, 8, 2),
('isolation_murs',              6, 7, 5, 8, 5,   5, 6, 8, 2),
('isolation_murs_exterieurs',   7, 8, 6, 9, 5,   5, 6, 8, 2),
('isolation_murs_interieurs',   5, 6, 5, 7, 4,   4, 5, 7, 2),
('isolation_plancher_bas',      5, 6, 4, 8, 4,   4, 5, 7, 2),
('isolation_toiture',           6, 7, 5, 9, 5,   5, 6, 8, 2),
('isolation_toiture_sarking',   7, 7, 5, 9, 6,   5, 6, 8, 2),

-- PAC / POMPE À CHALEUR
('pac',                         7, 8, 6, 9, 5,   6, 7, 8, 4),
('pac_air_air',                 6, 7, 7, 8, 4,   5, 6, 7, 4),
('pac_air_eau',                 7, 8, 6, 9, 5,   6, 7, 8, 4),
('pac_geothermie',              8, 7, 6, 10, 5,  6, 7, 9, 3),

-- CHAUDIÈRE / CHAUFFAGE
('chaudiere_gaz',               5, 6, 5, 6, 5,   4, 5, 4, 5),
('chaudiere_biomasse',          6, 6, 5, 8, 5,   4, 5, 7, 5),
('radiateur_pose',              3, 4, 4, 4, 3,   3, 3, 2, 5),
('radiateur_elec',              3, 4, 4, 4, 3,   3, 3, 2, 4),
('chauffage_radiateur_pose',    3, 4, 4, 4, 3,   3, 3, 2, 5),
('depose_radiateur',            2, 3, 2, 2, 2,   1, 2, 1, 1),
('purge_radiateurs',            1, 2, 1, 2, 3,   1, 1, 1, 2),
('sav_pompe',                   2, 3, 2, 2, 5,   1, 2, 1, 3),
('pose_seche_serviettes',       3, 3, 5, 3, 2,   3, 3, 1, 3),

-- EAU CHAUDE SANITAIRE
('ballon_thermodynamique',      4, 5, 4, 8, 4,   3, 4, 7, 3),
('chauffe_eau_thermodynamique', 4, 5, 4, 8, 4,   3, 4, 7, 3),
('chauffe_eau_remplacement',    3, 5, 3, 4, 5,   2, 3, 2, 3),
('cumulus',                     2, 4, 2, 3, 4,   2, 3, 1, 4),

-- VMC / VENTILATION
('vmc',                         4, 6, 4, 7, 6,   3, 5, 6, 3),
('vmc_double_flux',             5, 7, 5, 9, 6,   4, 6, 8, 3),
('vmc_hygro',                   4, 6, 4, 7, 6,   3, 5, 6, 3),
('vmc_simple_flux',             3, 5, 4, 6, 5,   3, 4, 5, 3),
('gaine_ventilation',           3, 4, 2, 5, 4,   2, 3, 3, 3),
('extracteur_sdb',              3, 4, 3, 4, 4,   2, 3, 2, 3),

-- CLIMATISATION
('clim',                        5, 6, 7, 4, 3,   5, 6, 3, 5),
('maintenance_clim',            2, 3, 2, 4, 4,   2, 3, 1, 3),
('maintenance_pac',             2, 3, 2, 4, 4,   2, 3, 1, 3),

-- THERMOSTAT / DOMOTIQUE / SOLAIRE
('thermostat_pose',             3, 4, 3, 5, 2,   3, 3, 3, 2),
('domotique_module',            4, 5, 6, 4, 2,   4, 5, 2, 4),
('batterie_solaire',            6, 6, 5, 9, 3,   5, 5, 6, 4),
('onduleur_photovoltaique',     5, 5, 4, 8, 3,   4, 4, 6, 4),
('audit_energetique',           3, 7, 3, 5, 6,   2, 4, 4, 1),
('etude_thermique',             3, 6, 3, 5, 5,   2, 3, 4, 1),
('borne_recharge_irve',         6, 7, 7, 5, 3,   5, 6, 4, 3),
('bornes_recharge_wallbox',     6, 7, 7, 5, 3,   5, 6, 4, 3),

-- TOITURE / FAÇADE
('toiture',                     7, 7, 5, 4, 9,   3, 6, 2, 2),
('toiture_reparation',          5, 5, 4, 3, 7,   2, 4, 2, 3),
('toiture_demoussage',          3, 4, 3, 2, 5,   1, 2, 1, 4),
('toiture_nettoyage',           2, 3, 3, 1, 4,   1, 2, 1, 4),
('gouttiere',                   2, 3, 2, 1, 6,   1, 2, 1, 4),
('zinguerie_reparation',        2, 3, 2, 1, 6,   1, 2, 1, 4),
('peinture_facade',             4, 6, 7, 2, 4,   3, 5, 1, 3),

-- FENÊTRES / MENUISERIES EXT.
('fenetre',                     6, 7, 6, 7, 4,   4, 5, 5, 3),
('fenetre_pose',                6, 7, 6, 7, 4,   4, 5, 5, 3),
('fenetre_velux_pose',          5, 6, 6, 6, 3,   4, 5, 4, 3),
('remplacement_vitrage',        4, 5, 5, 5, 3,   3, 4, 3, 3),
('vitrage_remplacement',        4, 5, 5, 5, 3,   3, 4, 3, 3),
('store_velux_pose',            3, 3, 5, 3, 2,   3, 3, 2, 4),
('store_banne_pose',            3, 3, 5, 1, 1,   3, 4, 1, 4),
('pose_moustiquaire',           2, 2, 3, 1, 1,   2, 2, 1, 3),

-- VOLETS
('volet',                       4, 5, 5, 3, 3,   3, 4, 2, 4),
('motorisation_volet',          3, 4, 5, 2, 2,   3, 4, 1, 4),
('volet_roulant_reparation',    2, 3, 3, 2, 3,   1, 2, 1, 3),
('moteur_volet_roulant_remplacement', 2, 3, 3, 1, 2, 2, 2, 1, 4),
('tablier_volet',               2, 3, 3, 2, 2,   2, 2, 1, 4),
('tablier_volet_roulant_remplacement', 2, 3, 3, 2, 2, 2, 2, 1, 4),
('sangle_volet_roulant_remplacement',  1, 2, 2, 1, 2, 1, 1, 1, 3),
('porte_galet',                 1, 2, 2, 1, 2,   1, 1, 1, 2),

-- PORTES
('porte_entree',                5, 6, 7, 4, 5,   4, 5, 3, 3),
('porte_entree_pose',           5, 6, 7, 4, 5,   4, 5, 3, 3),
('porte_int',                   4, 4, 5, 2, 2,   3, 3, 1, 3),
('porte_interieure_pose',       4, 4, 5, 2, 2,   3, 3, 1, 3),
('porte_placard_pose',          3, 3, 5, 1, 1,   3, 3, 1, 3),
('porte_garage_pose',           4, 5, 5, 3, 3,   3, 4, 2, 4),
('ouverture_porte',             5, 4, 5, 1, 3,   4, 4, 1, 2),
('ouverture_porteur',           7, 5, 7, 1, 4,   5, 6, 1, 2),
('ouverture_non_porteur',       5, 4, 6, 1, 3,   4, 5, 1, 2),

-- CUISINE
('cuisine',                     9, 8, 9, 2, 3,   7, 8, 2, 5),
('cuisine_demontage',           1, 1, 1, 1, 1,   1, 1, 1, 1),
('cuisine_electricite',         3, 3, 2, 2, 4,   2, 2, 1, 2),
('cuisine_plomberie',           3, 3, 2, 1, 4,   2, 2, 1, 2),
('credence',                    3, 3, 5, 1, 1,   2, 3, 1, 2),
('plan_travail',                4, 4, 6, 1, 1,   3, 4, 1, 3),
('hotte_pose',                  3, 3, 5, 2, 2,   2, 3, 1, 3),

-- SALLE DE BAINS
('sdb_creation',                8, 7, 9, 2, 3,   6, 8, 2, 4),
('douche',                      6, 6, 7, 2, 2,   5, 6, 1, 4),
('baignoire',                   5, 5, 6, 1, 2,   4, 5, 1, 4),
('wc_suspendu',                 5, 6, 7, 1, 2,   4, 5, 1, 3),
('wc',                          4, 5, 5, 1, 3,   3, 4, 1, 3),
('wc_remplacement',             3, 4, 4, 1, 3,   2, 3, 1, 3),
('lavabo',                      4, 4, 5, 1, 2,   3, 4, 1, 3),
('installation_lave_mains',     3, 4, 4, 1, 3,   2, 3, 1, 3),
('pose_bac_douche',             4, 4, 6, 1, 2,   3, 4, 1, 3),
('pose_baignoire',              4, 4, 5, 1, 2,   3, 4, 1, 4),
('pose_baignoire_tabliers',     3, 3, 4, 1, 1,   2, 3, 1, 3),
('pose_meuble_sdb',             4, 4, 6, 1, 1,   3, 4, 1, 3),
('pose_miroir_lumineux',        2, 3, 5, 2, 1,   2, 3, 1, 2),
('pose_mitigeur',               2, 3, 3, 2, 2,   1, 2, 1, 2),
('pose_niche_douche',           3, 3, 5, 1, 1,   3, 4, 1, 2),
('pose_paroi_baignoire',        3, 3, 4, 1, 1,   2, 3, 1, 3),
('pose_paroi_douche',           4, 4, 6, 1, 1,   3, 5, 1, 3),
('pose_colonne_douche',         3, 3, 5, 1, 1,   2, 4, 1, 3),
('pose_silicone_sdb',           1, 2, 2, 1, 2,   1, 2, 1, 1),
('curage_sdb',                  2, 2, 2, 1, 3,   1, 2, 1, 2),

-- ÉLECTRICITÉ
('tableau_elec',                5, 7, 4, 3, 9,   3, 4, 3, 2),
('tableau_electrique_remplacement', 5, 7, 4, 3, 9, 3, 4, 3, 2),
('electricien',                 4, 5, 3, 3, 7,   3, 4, 3, 3),
('mise_a_la_terre',             4, 7, 3, 2, 9,   2, 3, 2, 2),
('ajout_differentiel',          3, 5, 2, 1, 8,   2, 2, 1, 2),
('ajout_disjoncteur',           2, 4, 2, 1, 7,   2, 2, 1, 2),
('tirage_ligne',                3, 4, 2, 2, 5,   2, 3, 2, 2),
('electricite_saignes',         3, 4, 2, 2, 5,   2, 2, 2, 2),
('alimentation_exterieure',     3, 4, 3, 2, 5,   2, 3, 1, 3),
('prise',                       2, 3, 2, 1, 3,   1, 2, 1, 1),
('prise_pose',                  2, 3, 2, 1, 3,   1, 2, 1, 1),
('interrupteur',                1, 2, 2, 1, 2,   1, 2, 1, 1),
('interrupteur_pose',           1, 2, 2, 1, 2,   1, 2, 1, 1),
('eclairage_pose',              3, 3, 5, 3, 2,   3, 3, 1, 2),
('pose_spot_encastre',          3, 3, 5, 2, 2,   3, 3, 1, 2),
('luminaire',                   2, 3, 5, 3, 2,   2, 3, 1, 2),
('pose_ruban_led',              2, 2, 5, 2, 1,   2, 3, 1, 2),

-- PLOMBERIE
('plombier',                    4, 5, 3, 2, 7,   3, 4, 2, 3),
('creation_arrivee_eau',        5, 5, 4, 2, 6,   4, 5, 2, 3),
('creation_evacuation',         5, 5, 4, 2, 6,   4, 5, 2, 3),
('plomberie_petite_intervention', 2, 3, 2, 1, 5, 1, 2, 1, 3),
('plomberie_soudure',           3, 4, 2, 1, 6,   2, 3, 1, 3),
('robinet_remplacement',        2, 3, 3, 1, 4,   1, 2, 1, 3),
('robinet_thermostatique',      3, 4, 3, 4, 4,   2, 3, 2, 3),
('debouchage',                  1, 2, 1, 1, 4,   1, 2, 1, 2),
('remplacement_siphon',         1, 2, 1, 1, 3,   1, 2, 1, 2),
('remplacement_vanne',          2, 3, 2, 1, 5,   1, 2, 1, 3),
('detartrage_cumulus',          1, 2, 1, 2, 3,   1, 1, 1, 3),
('drainage',                    4, 5, 3, 1, 7,   2, 4, 1, 3),
('traitement_humidite',         4, 7, 4, 3, 8,   3, 6, 2, 3),

-- SOLS
('parquet_massif',              7, 7, 8, 1, 2,   5, 6, 1, 2),
('parquet_massif_pose',         7, 7, 8, 1, 2,   5, 6, 1, 2),
('parquet_colle',               6, 6, 7, 1, 2,   4, 5, 1, 3),
('parquet_colle_pose',          6, 6, 7, 1, 2,   4, 5, 1, 3),
('parquet_flottant',            5, 5, 6, 1, 1,   3, 4, 1, 3),
('poncage_parquet',             4, 5, 6, 1, 1,   3, 4, 1, 2),
('carrelage_sol',               5, 6, 6, 1, 2,   4, 5, 1, 2),
('carrelage_sol_pose',          5, 6, 6, 1, 2,   4, 5, 1, 2),
('carrelage_grand_format',      6, 6, 7, 1, 2,   4, 5, 1, 2),
('sol_pvc',                     3, 4, 5, 1, 1,   3, 4, 1, 3),
('moquette',                    2, 3, 4, 1, 1,   2, 3, 1, 4),
('chape',                       3, 4, 3, 2, 4,   2, 3, 1, 2),
('ragreage',                    2, 3, 3, 1, 2,   2, 2, 1, 1),
('reagr_pp_ragreage_autolissant', 2, 3, 3, 1, 2, 2, 2, 1, 1),
('depose_carrelage',            1, 2, 1, 1, 1,   1, 1, 1, 1),
('depose_parquet',              1, 2, 1, 1, 1,   1, 1, 1, 1),
('depose_moquette',             1, 2, 2, 1, 1,   1, 1, 1, 1),
('depose_pvc',                  1, 2, 1, 1, 1,   1, 1, 1, 1),
('plinthes',                    2, 2, 3, 1, 1,   1, 2, 1, 1),
('seuils_barres',               1, 2, 2, 1, 1,   1, 2, 1, 2),
('pose_stratifie',              3, 3, 4, 1, 1,   2, 3, 1, 3),
('pose_pave',                   3, 3, 4, 1, 2,   2, 3, 1, 3),
('enrobe_pose',                 3, 3, 4, 1, 2,   2, 3, 1, 3),

-- PEINTURE & FINITIONS
('peinture_murs',               3, 5, 7, 1, 1,   3, 4, 1, 2),
('peinture_plafond',            3, 5, 6, 1, 1,   3, 4, 1, 2),
('peinture_boiseries',          3, 4, 5, 1, 1,   2, 3, 1, 2),
('peinture_porte',              2, 3, 4, 1, 1,   1, 2, 1, 2),
('peinture_radiateur',          2, 3, 4, 1, 1,   1, 2, 1, 2),
('peinture_escalier',           3, 4, 5, 1, 2,   2, 3, 1, 2),
('toile_verre',                 2, 3, 4, 1, 1,   2, 3, 1, 2),
('papier_peint',                2, 3, 5, 1, 1,   2, 3, 1, 3),
('lessivage_murs',              1, 2, 4, 1, 1,   1, 2, 1, 1),
('enduit_lissage',              2, 3, 4, 1, 1,   2, 2, 1, 2),

-- PLÂTRERIE / CLOISONS
('cloison_placo',               5, 4, 5, 3, 2,   4, 4, 2, 2),
('placo_doublage_mur',          4, 5, 4, 4, 2,   3, 4, 3, 2),
('doublage_placo',              4, 5, 4, 4, 2,   3, 4, 3, 2),
('bandes_placo',                2, 2, 3, 1, 1,   1, 2, 1, 1),
('faux_plafond',                3, 4, 5, 2, 1,   3, 3, 1, 2),
('demolition_cloison',          5, 4, 6, 1, 3,   4, 5, 1, 2),
('demolition_legere',           3, 3, 4, 1, 2,   2, 3, 1, 2),

-- MAÇONNERIE
('maconnerie_rebouchage',       2, 3, 3, 1, 4,   1, 2, 1, 2),
('reprise_fissures',            3, 4, 3, 1, 6,   2, 3, 1, 2),
('terrassement',                3, 2, 2, 1, 4,   1, 2, 1, 4),
('creation_muret',              3, 3, 4, 1, 3,   2, 3, 1, 2),

-- CARRELAGE MURAL
('carrelage_mural',             5, 5, 7, 1, 1,   4, 5, 1, 2),
('faience_mur_pose',            4, 4, 6, 1, 1,   3, 4, 1, 2),
('joint_carrelage',             2, 2, 3, 1, 2,   1, 2, 1, 2),
('pose_credence_carrelage',     3, 3, 5, 1, 1,   2, 3, 1, 2),
('pose_credence_verre',         3, 3, 5, 1, 1,   2, 3, 1, 2),
('pose_soubassement',           3, 3, 4, 1, 1,   2, 2, 1, 2),
('pose_plinthes_carrelage',     2, 2, 3, 1, 1,   1, 2, 1, 1),
('pose_baguettes_finition',     1, 1, 2, 1, 1,   1, 1, 1, 1),

-- ESCALIER / STANDING
('escalier_habillage',          4, 4, 6, 1, 2,   3, 4, 1, 3),
('garde_corps_pose',            3, 4, 3, 1, 6,   2, 3, 1, 2),
('placard_amenagement',         4, 4, 6, 1, 1,   4, 5, 1, 3),
('revetement_mural_boiserie',   4, 4, 6, 2, 1,   3, 4, 1, 3),

-- SERRURERIE / SÉCURITÉ
('serrure_remplacement',        3, 4, 3, 1, 5,   2, 3, 1, 2),
('blindage_porte',              4, 5, 4, 1, 6,   3, 4, 1, 2),
('changement_cylindre',         2, 3, 2, 1, 5,   1, 2, 1, 1),
('poignee_porte',               1, 2, 3, 1, 2,   1, 2, 1, 2),
('pose_verrou',                 2, 3, 2, 1, 5,   1, 2, 1, 2),
('serrurerie_taux_horaire',     2, 3, 2, 1, 4,   1, 2, 1, 2),
('interphone_pose',             2, 3, 3, 1, 3,   2, 3, 1, 3),

-- EXTÉRIEUR / AMÉNAGEMENT
('terrasse_bois',               5, 5, 7, 1, 2,   4, 6, 1, 5),
('terrasse_dalle',              5, 5, 7, 1, 2,   4, 6, 1, 3),
('cloture',                     3, 4, 5, 1, 2,   3, 4, 1, 5),
('cloture_grillage',            2, 3, 3, 1, 2,   2, 3, 1, 5),
('cloture_rigide',              3, 4, 4, 1, 2,   3, 4, 1, 4),
('portail',                     4, 5, 5, 1, 3,   3, 4, 1, 4),
('portillon_pose',              3, 4, 4, 1, 2,   2, 3, 1, 4),
('pergola_pose',                4, 4, 6, 1, 1,   3, 5, 1, 5),
('abattage_arbre',              2, 3, 3, 1, 4,   1, 2, 1, 2),
('elagage',                     1, 2, 3, 1, 3,   1, 2, 1, 2),
('jardin_taille_haie',          1, 2, 3, 1, 2,   1, 2, 1, 2),

-- DIAGNOSTICS
('diagnostic',                  2, 6, 2, 2, 8,   1, 3, 1, 1),
('diagnostic_dpe',              2, 8, 2, 3, 7,   1, 4, 1, 1),
('diagnostic_amiante',          2, 7, 2, 1, 9,   1, 4, 1, 1),
('diagnostic_electricite',      2, 7, 2, 1, 8,   1, 3, 1, 1),
('diagnostic_gaz',              2, 7, 2, 1, 8,   1, 3, 1, 1),
('diagnostic_plomb',            2, 7, 2, 1, 9,   1, 4, 1, 1),
('diagnostic_termites',         2, 6, 2, 1, 8,   1, 3, 1, 1),
('diagnostic_termites_zone',    2, 6, 2, 1, 8,   1, 3, 1, 1),
('diagnostic_assainissement',   2, 7, 2, 1, 8,   1, 3, 1, 1),
('diagnostic_bruit_aerien',     2, 5, 2, 1, 5,   1, 3, 1, 1),
('diagnostic_erp',              2, 6, 2, 1, 8,   1, 3, 1, 1),
('diagnostic_etat_parasitaire', 2, 6, 2, 1, 8,   1, 3, 1, 1),
('diagnostic_loi_boutin',       1, 5, 1, 1, 6,   1, 2, 1, 1),
('diagnostic_loi_carrez',       1, 5, 1, 1, 6,   1, 2, 1, 1),
('pack_diagnostics_complet',    2, 8, 2, 2, 9,   1, 4, 1, 1),
('pack_diagnostics_location',   2, 7, 2, 2, 8,   1, 3, 1, 1),
('pack_diagnostics_vente_appartement', 2, 8, 2, 2, 9, 1, 4, 1, 1),
('pack_diagnostics_vente_maison',      2, 8, 2, 2, 9, 1, 4, 1, 1),

-- MENUISERIE / FINITIONS DIVERSES
('menuiserie_taux_horaire',     3, 3, 3, 1, 2,   2, 2, 1, 3),

-- DIVERS CHANTIER
('protection_chantier',         1, 1, 1, 1, 2,   1, 1, 1, 1),
('nettoyage_fin_chantier',      1, 1, 2, 1, 1,   1, 1, 1, 1),
('benne',                       1, 1, 1, 1, 1,   1, 1, 1, 1),
('evacuation_dechets',          1, 1, 1, 1, 1,   1, 1, 1, 1),
('evacuation_gravats',          1, 1, 1, 1, 1,   1, 1, 1, 1),
('deplacement',                 1, 1, 1, 1, 1,   1, 1, 1, 1),
('eau',                         2, 3, 2, 1, 5,   1, 2, 1, 3),
('mod',                         2, 2, 2, 1, 1,   1, 1, 1, 2),
('point',                       1, 1, 1, 1, 2,   1, 1, 1, 2)

ON CONFLICT (job_type) DO UPDATE SET
  value_intrinseque  = EXCLUDED.value_intrinseque,
  liquidite          = EXCLUDED.liquidite,
  attractivite       = EXCLUDED.attractivite,
  energie            = EXCLUDED.energie,
  reduction_risque   = EXCLUDED.reduction_risque,
  impact_loyer       = EXCLUDED.impact_loyer,
  vacance            = EXCLUDED.vacance,
  fiscalite          = EXCLUDED.fiscalite,
  capex_risk         = EXCLUDED.capex_risk;
