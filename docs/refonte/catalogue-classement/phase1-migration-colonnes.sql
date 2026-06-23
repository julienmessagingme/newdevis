-- ═════════════════════════════════════════════════════════════════════════════
-- Phase 1.5 — Migration : ajout des colonnes structurelles au catalogue
-- ═════════════════════════════════════════════════════════════════════════════
-- Date           : 2026-06-23
-- Source         : docs/refonte/catalogue-classement/audit-911-classified.csv
-- Génération     : scripts/phase1-generate-migration.ts
-- Décisions      : Claude (18 corrections) + Julien (6 arbitrages) + 128 validations bloc
--
-- ⚠️ À LANCER DANS SUPABASE STUDIO → SQL EDITOR
-- Effet : 891 entrées market_prices enrichies de 4 colonnes structurelles
--
-- Le script tourne dans une transaction BEGIN/COMMIT. Si UNE seule instruction
-- échoue, ROLLBACK automatique → catalogue intact.
-- ═════════════════════════════════════════════════════════════════════════════

-- Photo initiale attendue : 891 entrées sans metier/nature_prix/gamme
-- SELECT COUNT(*) FROM public.market_prices; -- → 891

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ALTER TABLE — ajouter les 4 nouvelles colonnes (nullable au départ)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.market_prices
  ADD COLUMN IF NOT EXISTS metier TEXT,
  ADD COLUMN IF NOT EXISTS nature_prix TEXT,
  ADD COLUMN IF NOT EXISTS multiplicateur_couches_applicable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gamme TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CHECK constraints
-- ─────────────────────────────────────────────────────────────────────────────

-- nature_prix : enum (4 valeurs autorisées)
ALTER TABLE public.market_prices
  DROP CONSTRAINT IF EXISTS check_nature_prix_enum;
ALTER TABLE public.market_prices
  ADD CONSTRAINT check_nature_prix_enum CHECK (
    nature_prix IS NULL OR nature_prix IN (
      'pose_seule',
      'fourniture_pose',
      'fourniture_seule',
      'non_applicable'
    )
  );

-- metier : enum (24 familles décidées en Phase 1.4)
ALTER TABLE public.market_prices
  DROP CONSTRAINT IF EXISTS check_metier_enum;
ALTER TABLE public.market_prices
  ADD CONSTRAINT check_metier_enum CHECK (
    metier IS NULL OR metier IN ('menuiserie_vitrages', 'plomberie_sanitaires', 'electricite', 'cuisine_agencement', 'chauffage', 'maconnerie_structure', 'placo_isolation', 'ouvrages_piscine', 'sols_souples', 'peinture_revetements', 'toiture_couverture', 'cvc_ventilation', 'ouvrages_vrd', 'stores_occultation', 'forfait_renovation_globale', 'carrelage_faience', 'diagnostic_reglementaire', 'sols_durs', 'ouvrages_paysagisme', 'ouvrages_anc', 'facade_ravalement', 'metallerie_serrurerie', 'ouvrages_photovoltaique', 'demolition_depose', 'logistique_chantier', 'bardage_exterieur', 'charpente_bois', 'domotique_securite', 'energie_environnement', 'petits_ouvrages_divers', 'ouvrages_ascenseur', 'ouvrages_geothermie', 'prestations_intellectuelles')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. UPDATE en bloc — 891 entrées avec les valeurs décidées
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.market_prices SET metier = 'bardage_exterieur', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 592;
UPDATE public.market_prices SET metier = 'bardage_exterieur', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 593;
UPDATE public.market_prices SET metier = 'bardage_exterieur', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'premium' WHERE id = 969;
UPDATE public.market_prices SET metier = 'bardage_exterieur', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 970;
UPDATE public.market_prices SET metier = 'bardage_exterieur', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 594;
UPDATE public.market_prices SET metier = 'bardage_exterieur', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 373;
UPDATE public.market_prices SET metier = 'bardage_exterieur', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 374;
UPDATE public.market_prices SET metier = 'carrelage_faience', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 839;
UPDATE public.market_prices SET metier = 'carrelage_faience', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'premium' WHERE id = 321;
UPDATE public.market_prices SET metier = 'carrelage_faience', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 434;
UPDATE public.market_prices SET metier = 'carrelage_faience', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'standard' WHERE id = 319;
UPDATE public.market_prices SET metier = 'carrelage_faience', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 768;
UPDATE public.market_prices SET metier = 'carrelage_faience', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 481;
UPDATE public.market_prices SET metier = 'carrelage_faience', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 482;
UPDATE public.market_prices SET metier = 'carrelage_faience', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 104;
UPDATE public.market_prices SET metier = 'carrelage_faience', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 893;
UPDATE public.market_prices SET metier = 'carrelage_faience', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 379;
UPDATE public.market_prices SET metier = 'carrelage_faience', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'premium' WHERE id = 14;
UPDATE public.market_prices SET metier = 'carrelage_faience', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 572;
UPDATE public.market_prices SET metier = 'carrelage_faience', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 652;
UPDATE public.market_prices SET metier = 'carrelage_faience', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 974;
UPDATE public.market_prices SET metier = 'carrelage_faience', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 725;
UPDATE public.market_prices SET metier = 'carrelage_faience', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 16;
UPDATE public.market_prices SET metier = 'carrelage_faience', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 17;
UPDATE public.market_prices SET metier = 'carrelage_faience', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 15;
UPDATE public.market_prices SET metier = 'carrelage_faience', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 81;
UPDATE public.market_prices SET metier = 'carrelage_faience', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 561;
UPDATE public.market_prices SET metier = 'carrelage_faience', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 918;
UPDATE public.market_prices SET metier = 'carrelage_faience', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 44;
UPDATE public.market_prices SET metier = 'carrelage_faience', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 180;
UPDATE public.market_prices SET metier = 'sols_durs', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 650;
UPDATE public.market_prices SET metier = 'sols_durs', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 836;
UPDATE public.market_prices SET metier = 'charpente_bois', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 742;
UPDATE public.market_prices SET metier = 'charpente_bois', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 537;
UPDATE public.market_prices SET metier = 'charpente_bois', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 536;
UPDATE public.market_prices SET metier = 'charpente_bois', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 492;
UPDATE public.market_prices SET metier = 'charpente_bois', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 266;
UPDATE public.market_prices SET metier = 'charpente_bois', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 265;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 289;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 7;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 601;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 602;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 405;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 406;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 20;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 21;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 807;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 24;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 49;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 617;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 903;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 517;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 476;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 408;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 811;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 409;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 605;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 475;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 518;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 813;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 348;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 346;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = 'standard' WHERE id = 345;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 347;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 410;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 608;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 606;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 607;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 193;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 22;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 192;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 610;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 611;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 407;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 191;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 441;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 352;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 350;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = 'standard' WHERE id = 349;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 351;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 612;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 613;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 38;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 23;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 707;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 616;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 820;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 609;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 519;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 814;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 48;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 145;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 604;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 474;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 202;
UPDATE public.market_prices SET metier = 'chauffage', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 618;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 790;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 147;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 644;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 783;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 35;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 480;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 785;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 372;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 370;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = 'standard' WHERE id = 369;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 371;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 781;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 880;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 879;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 576;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 574;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 777;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 778;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 575;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 33;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 587;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 171;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 34;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 404;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 403;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 686;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 579;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 578;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 583;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 89;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 580;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 581;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 588;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 584;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 172;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 149;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 304;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 582;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 332;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 330;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'standard' WHERE id = 329;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 331;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 585;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 586;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 788;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 782;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 910;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 900;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 766;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 431;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 887;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 779;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 780;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 577;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 170;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 273;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 567;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 163;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 284;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 36;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 37;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'premium' WHERE id = 786;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 787;
UPDATE public.market_prices SET metier = 'cuisine_agencement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 791;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 956;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 336;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 334;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'standard' WHERE id = 333;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 335;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 473;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 955;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 25;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 340;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 338;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'standard' WHERE id = 337;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 339;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 109;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 110;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 229;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 121;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 808;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 122;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 809;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 123;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 124;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 411;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 520;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 228;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 344;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 342;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'standard' WHERE id = 341;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 343;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 775;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 230;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 921;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 80;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 86;
UPDATE public.market_prices SET metier = 'cvc_ventilation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 818;
UPDATE public.market_prices SET metier = 'demolition_depose', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 39;
UPDATE public.market_prices SET metier = 'demolition_depose', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 79;
UPDATE public.market_prices SET metier = 'demolition_depose', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 41;
UPDATE public.market_prices SET metier = 'demolition_depose', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 758;
UPDATE public.market_prices SET metier = 'demolition_depose', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 42;
UPDATE public.market_prices SET metier = 'demolition_depose', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 512;
UPDATE public.market_prices SET metier = 'diagnostic_reglementaire', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 5;
UPDATE public.market_prices SET metier = 'diagnostic_reglementaire', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 51;
UPDATE public.market_prices SET metier = 'diagnostic_reglementaire', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 52;
UPDATE public.market_prices SET metier = 'diagnostic_reglementaire', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 54;
UPDATE public.market_prices SET metier = 'diagnostic_reglementaire', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 55;
UPDATE public.market_prices SET metier = 'diagnostic_reglementaire', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 59;
UPDATE public.market_prices SET metier = 'diagnostic_reglementaire', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 62;
UPDATE public.market_prices SET metier = 'diagnostic_reglementaire', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 63;
UPDATE public.market_prices SET metier = 'diagnostic_reglementaire', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 64;
UPDATE public.market_prices SET metier = 'diagnostic_reglementaire', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 57;
UPDATE public.market_prices SET metier = 'diagnostic_reglementaire', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 58;
UPDATE public.market_prices SET metier = 'diagnostic_reglementaire', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 77;
UPDATE public.market_prices SET metier = 'diagnostic_reglementaire', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 60;
UPDATE public.market_prices SET metier = 'diagnostic_reglementaire', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 61;
UPDATE public.market_prices SET metier = 'diagnostic_reglementaire', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 125;
UPDATE public.market_prices SET metier = 'diagnostic_reglementaire', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 126;
UPDATE public.market_prices SET metier = 'diagnostic_reglementaire', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 127;
UPDATE public.market_prices SET metier = 'diagnostic_reglementaire', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 128;
UPDATE public.market_prices SET metier = 'diagnostic_reglementaire', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 53;
UPDATE public.market_prices SET metier = 'diagnostic_reglementaire', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 56;
UPDATE public.market_prices SET metier = 'diagnostic_reglementaire', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 723;
UPDATE public.market_prices SET metier = 'domotique_securite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 832;
UPDATE public.market_prices SET metier = 'domotique_securite', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 428;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 3;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 92;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 2;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 188;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 290;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 291;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 831;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 426;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 12;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 827;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 830;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 427;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 628;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 829;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 972;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 971;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 294;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 825;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 292;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 624;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 625;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 626;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 833;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 630;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 826;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 922;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 112;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 293;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 823;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 627;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 430;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 107;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 368;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 366;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = 'standard' WHERE id = 365;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 367;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 429;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 621;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 631;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 721;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 632;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 623;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 622;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 91;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 93;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 69;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 629;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 189;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 633;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 181;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 185;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 218;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 615;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 13;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 824;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 211;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 212;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 72;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 620;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 619;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 822;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 219;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 295;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 71;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 769;
UPDATE public.market_prices SET metier = 'energie_environnement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 967;
UPDATE public.market_prices SET metier = 'energie_environnement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 966;
UPDATE public.market_prices SET metier = 'facade_ravalement', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 543;
UPDATE public.market_prices SET metier = 'facade_ravalement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 301;
UPDATE public.market_prices SET metier = 'facade_ravalement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 750;
UPDATE public.market_prices SET metier = 'facade_ravalement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = TRUE, gamme = '' WHERE id = 548;
UPDATE public.market_prices SET metier = 'facade_ravalement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 751;
UPDATE public.market_prices SET metier = 'facade_ravalement', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 268;
UPDATE public.market_prices SET metier = 'facade_ravalement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 863;
UPDATE public.market_prices SET metier = 'facade_ravalement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 140;
UPDATE public.market_prices SET metier = 'facade_ravalement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 639;
UPDATE public.market_prices SET metier = 'facade_ravalement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 262;
UPDATE public.market_prices SET metier = 'facade_ravalement', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 549;
UPDATE public.market_prices SET metier = 'facade_ravalement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 752;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 718;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 204;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 479;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 477;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 478;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 905;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 906;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 907;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 709;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 710;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 711;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 712;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 713;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 328;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 326;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'standard' WHERE id = 325;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 327;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 563;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 564;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 717;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 714;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 911;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 716;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 715;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 271;
UPDATE public.market_prices SET metier = 'forfait_renovation_globale', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 272;
UPDATE public.market_prices SET metier = 'logistique_chantier', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 915;
UPDATE public.market_prices SET metier = 'logistique_chantier', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 10;
UPDATE public.market_prices SET metier = 'logistique_chantier', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 914;
UPDATE public.market_prices SET metier = 'logistique_chantier', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 43;
UPDATE public.market_prices SET metier = 'logistique_chantier', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 720;
UPDATE public.market_prices SET metier = 'logistique_chantier', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 116;
UPDATE public.market_prices SET metier = 'logistique_chantier', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 719;
UPDATE public.market_prices SET metier = 'logistique_chantier', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 190;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 757;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 19;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 544;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 32;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 760;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 554;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 547;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 749;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 952;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 300;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 912;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 496;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 551;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 756;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 299;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 555;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 917;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 638;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 748;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 546;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 545;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 550;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 747;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 118;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 120;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 953;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 303;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 108;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 553;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 556;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 653;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 726;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 643;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 225;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 413;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 804;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 483;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 525;
UPDATE public.market_prices SET metier = 'electricite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 4;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 559;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 302;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 558;
UPDATE public.market_prices SET metier = 'demolition_depose', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 759;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 557;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 890;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 681;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 530;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 734;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 913;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 298;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 297;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 119;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 870;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 840;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 416;
UPDATE public.market_prices SET metier = 'maconnerie_structure', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 761;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 433;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 494;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 510;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 509;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 882;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 18;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 511;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 693;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 694;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 400;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 888;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 695;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 889;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 277;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 657;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 656;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 276;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 495;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 690;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 402;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 401;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 691;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 885;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 692;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 269;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 270;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 485;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 847;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 662;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 661;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 486;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 853;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 878;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 658;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 844;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 846;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 845;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 849;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'premium' WHERE id = 848;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'standard' WHERE id = 669;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 324;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 322;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 323;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 881;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 508;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 507;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 668;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 275;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 306;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 83;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 84;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 85;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 87;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 689;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 175;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 421;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 154;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 156;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 385;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 390;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 685;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 158;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 683;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 160;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 157;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 305;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 161;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 162;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 418;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 164;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 384;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 670;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 684;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 187;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 296;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 892;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 159;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'standard' WHERE id = 205;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 213;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 198;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 226;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 698;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 738;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'standard' WHERE id = 539;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 422;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 883;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 11;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 920;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 76;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 139;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 144;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 425;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 687;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 168;
UPDATE public.market_prices SET metier = 'menuiserie_vitrages', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 697;
UPDATE public.market_prices SET metier = 'metallerie_serrurerie', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 667;
UPDATE public.market_prices SET metier = 'metallerie_serrurerie', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 666;
UPDATE public.market_prices SET metier = 'metallerie_serrurerie', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 869;
UPDATE public.market_prices SET metier = 'metallerie_serrurerie', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 868;
UPDATE public.market_prices SET metier = 'metallerie_serrurerie', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 424;
UPDATE public.market_prices SET metier = 'metallerie_serrurerie', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 27;
UPDATE public.market_prices SET metier = 'metallerie_serrurerie', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 386;
UPDATE public.market_prices SET metier = 'metallerie_serrurerie', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 28;
UPDATE public.market_prices SET metier = 'metallerie_serrurerie', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 387;
UPDATE public.market_prices SET metier = 'metallerie_serrurerie', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 29;
UPDATE public.market_prices SET metier = 'metallerie_serrurerie', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 389;
UPDATE public.market_prices SET metier = 'metallerie_serrurerie', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 388;
UPDATE public.market_prices SET metier = 'demolition_depose', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 521;
UPDATE public.market_prices SET metier = 'ouvrages_anc', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 962;
UPDATE public.market_prices SET metier = 'ouvrages_anc', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 961;
UPDATE public.market_prices SET metier = 'ouvrages_anc', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 958;
UPDATE public.market_prices SET metier = 'ouvrages_anc', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 959;
UPDATE public.market_prices SET metier = 'ouvrages_anc', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 960;
UPDATE public.market_prices SET metier = 'ouvrages_anc', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 282;
UPDATE public.market_prices SET metier = 'ouvrages_anc', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 702;
UPDATE public.market_prices SET metier = 'ouvrages_anc', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 703;
UPDATE public.market_prices SET metier = 'ouvrages_anc', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 281;
UPDATE public.market_prices SET metier = 'ouvrages_anc', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 705;
UPDATE public.market_prices SET metier = 'ouvrages_anc', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 722;
UPDATE public.market_prices SET metier = 'ouvrages_anc', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 704;
UPDATE public.market_prices SET metier = 'ouvrages_anc', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 957;
UPDATE public.market_prices SET metier = 'ouvrages_anc', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 963;
UPDATE public.market_prices SET metier = 'ouvrages_ascenseur', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 968;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 568;
UPDATE public.market_prices SET metier = 'ouvrages_ascenseur', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 696;
UPDATE public.market_prices SET metier = 'ouvrages_geothermie', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 965;
UPDATE public.market_prices SET metier = 'ouvrages_geothermie', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 964;
UPDATE public.market_prices SET metier = 'ouvrages_paysagisme', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 1;
UPDATE public.market_prices SET metier = 'ouvrages_paysagisme', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 310;
UPDATE public.market_prices SET metier = 'ouvrages_paysagisme', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 312;
UPDATE public.market_prices SET metier = 'ouvrages_paysagisme', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 70;
UPDATE public.market_prices SET metier = 'ouvrages_paysagisme', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 875;
UPDATE public.market_prices SET metier = 'ouvrages_paysagisme', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 313;
UPDATE public.market_prices SET metier = 'ouvrages_paysagisme', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 311;
UPDATE public.market_prices SET metier = 'ouvrages_paysagisme', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 309;
UPDATE public.market_prices SET metier = 'ouvrages_paysagisme', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 399;
UPDATE public.market_prices SET metier = 'ouvrages_paysagisme', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 396;
UPDATE public.market_prices SET metier = 'ouvrages_paysagisme', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 675;
UPDATE public.market_prices SET metier = 'ouvrages_paysagisme', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 103;
UPDATE public.market_prices SET metier = 'ouvrages_paysagisme', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 680;
UPDATE public.market_prices SET metier = 'ouvrages_paysagisme', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 676;
UPDATE public.market_prices SET metier = 'ouvrages_paysagisme', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 866;
UPDATE public.market_prices SET metier = 'ouvrages_photovoltaique', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 9;
UPDATE public.market_prices SET metier = 'ouvrages_photovoltaique', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 491;
UPDATE public.market_prices SET metier = 'ouvrages_photovoltaique', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 828;
UPDATE public.market_prices SET metier = 'ouvrages_photovoltaique', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 129;
UPDATE public.market_prices SET metier = 'ouvrages_photovoltaique', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 130;
UPDATE public.market_prices SET metier = 'ouvrages_photovoltaique', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 131;
UPDATE public.market_prices SET metier = 'ouvrages_photovoltaique', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 488;
UPDATE public.market_prices SET metier = 'ouvrages_photovoltaique', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 489;
UPDATE public.market_prices SET metier = 'ouvrages_photovoltaique', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 490;
UPDATE public.market_prices SET metier = 'ouvrages_photovoltaique', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 973;
UPDATE public.market_prices SET metier = 'ouvrages_photovoltaique', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 117;
UPDATE public.market_prices SET metier = 'energie_environnement', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 821;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 466;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 516;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 254;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 465;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 249;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 246;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 463;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 505;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 257;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 258;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 241;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 238;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 677;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 240;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 243;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 239;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 468;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 469;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 513;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 470;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 471;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 247;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 459;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 464;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 460;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 252;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 256;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 237;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 462;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 504;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 514;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 253;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 248;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 461;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 472;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 678;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 242;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 244;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 250;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 679;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 515;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 245;
UPDATE public.market_prices SET metier = 'ouvrages_piscine', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 251;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 947;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 873;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 394;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 946;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 415;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 951;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 395;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 950;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 75;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 944;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 943;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 179;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 391;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 393;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 945;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 215;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 872;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 307;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 671;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 216;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 217;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 755;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 874;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 673;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 682;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 871;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 414;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 68;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 552;
UPDATE public.market_prices SET metier = 'ouvrages_vrd', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 949;
UPDATE public.market_prices SET metier = 'carrelage_faience', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'premium' WHERE id = 672;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 856;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 640;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 74;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 635;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 862;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 636;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 503;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 106;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 484;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 855;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 417;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 141;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 260;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 261;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 143;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 259;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 771;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 642;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 200;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 132;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 377;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'standard' WHERE id = 378;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 220;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 909;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 497;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 199;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 498;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 857;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 858;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 861;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 806;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 263;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 595;
UPDATE public.market_prices SET metier = 'petits_ouvrages_divers', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 655;
UPDATE public.market_prices SET metier = 'petits_ouvrages_divers', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 183;
UPDATE public.market_prices SET metier = 'petits_ouvrages_divers', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 173;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 8;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 502;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 360;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 358;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'standard' WHERE id = 357;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 359;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 26;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 884;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 66;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 148;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 794;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 82;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 364;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 362;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'standard' WHERE id = 361;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 363;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 859;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 802;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 412;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 797;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 99;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 356;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 354;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'standard' WHERE id = 353;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'variante_complexite' WHERE id = 355;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 596;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 597;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 100;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 796;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 599;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 803;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 264;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 375;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 98;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 754;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 753;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 792;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 793;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 501;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 500;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 603;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 590;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 805;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 96;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 740;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 493;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 798;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 591;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 589;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 444;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 765;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 446;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 773;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 30;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 287;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 31;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 176;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 895;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 40;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 902;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 898;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 467;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 90;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 280;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 436;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 897;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 438;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 432;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 445;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 764;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 151;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 614;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 6;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 167;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 566;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 286;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 169;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 67;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 706;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 105;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 174;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 177;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 178;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 165;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 571;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 570;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 182;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 573;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 565;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 233;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 560;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 235;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 285;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 762;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 699;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 700;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 201;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 196;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 197;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 234;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 283;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 901;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 701;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 152;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 896;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 439;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 894;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 774;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 770;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 440;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 569;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 437;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 442;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 767;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 443;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 772;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 763;
UPDATE public.market_prices SET metier = 'placo_isolation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 598;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 708;
UPDATE public.market_prices SET metier = 'plomberie_sanitaires', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 153;
UPDATE public.market_prices SET metier = 'prestations_intellectuelles', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 111;
UPDATE public.market_prices SET metier = 'prestations_intellectuelles', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 206;
UPDATE public.market_prices SET metier = 'sols_durs', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 649;
UPDATE public.market_prices SET metier = 'sols_durs', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 380;
UPDATE public.market_prices SET metier = 'sols_durs', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 854;
UPDATE public.market_prices SET metier = 'sols_durs', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 634;
UPDATE public.market_prices SET metier = 'sols_durs', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 834;
UPDATE public.market_prices SET metier = 'sols_durs', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 674;
UPDATE public.market_prices SET metier = 'sols_durs', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 837;
UPDATE public.market_prices SET metier = 'sols_durs', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 891;
UPDATE public.market_prices SET metier = 'sols_durs', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 838;
UPDATE public.market_prices SET metier = 'sols_durs', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 392;
UPDATE public.market_prices SET metier = 'sols_durs', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 562;
UPDATE public.market_prices SET metier = 'sols_durs', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 637;
UPDATE public.market_prices SET metier = 'sols_durs', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 381;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 654;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 860;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 843;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'premium' WHERE id = 320;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'standard' WHERE id = 318;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 155;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 166;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 641;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 648;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 113;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 133;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 134;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 865;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 646;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 135;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 136;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 864;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 137;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 647;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 150;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 382;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 208;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'premium' WHERE id = 651;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 186;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 184;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 194;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 435;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 195;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 274;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = 'premium' WHERE id = 789;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 207;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 842;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 45;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 46;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 47;
UPDATE public.market_prices SET metier = 'peinture_revetements', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 138;
UPDATE public.market_prices SET metier = 'sols_souples', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 499;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 398;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 115;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 664;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 397;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 688;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 645;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 146;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 308;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 209;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 420;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 278;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 419;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 114;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 203;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 232;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 487;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 663;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 850;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 665;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 660;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 852;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 279;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 659;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 506;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 851;
UPDATE public.market_prices SET metier = 'domotique_securite', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 65;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 210;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 231;
UPDATE public.market_prices SET metier = 'stores_occultation', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 214;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 736;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 255;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 527;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 526;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 529;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 540;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 524;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 528;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 535;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 534;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 746;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 801;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 735;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 533;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 532;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 531;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 744;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 88;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 954;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 538;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 267;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 236;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'pose_seule', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 423;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 222;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'non_applicable', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 223;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 221;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 224;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 541;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 542;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 743;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 600;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 799;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 101;
UPDATE public.market_prices SET metier = 'toiture_couverture', nature_prix = 'fourniture_pose', multiplicateur_couches_applicable = FALSE, gamme = '' WHERE id = 102;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Indexes pour le futur matcher
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_market_prices_metier ON public.market_prices (metier);
CREATE INDEX IF NOT EXISTS idx_market_prices_nature_prix ON public.market_prices (nature_prix);
CREATE INDEX IF NOT EXISTS idx_market_prices_metier_nature ON public.market_prices (metier, nature_prix);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Vérifications finales (avant COMMIT)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_total INT;
  v_with_metier INT;
  v_with_nature INT;
  v_unique_metiers INT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM public.market_prices;
  SELECT COUNT(*) INTO v_with_metier FROM public.market_prices WHERE metier IS NOT NULL;
  SELECT COUNT(*) INTO v_with_nature FROM public.market_prices WHERE nature_prix IS NOT NULL;
  SELECT COUNT(DISTINCT metier) INTO v_unique_metiers FROM public.market_prices WHERE metier IS NOT NULL;

  IF v_total != 891 THEN
    RAISE EXCEPTION 'Erreur — attendu 891 entrées, trouvé %', v_total;
  END IF;
  IF v_with_metier != 891 THEN
    RAISE EXCEPTION 'Erreur — % entrées sans metier (attendu 0)', 891 - v_with_metier;
  END IF;
  IF v_with_nature != 891 THEN
    RAISE EXCEPTION 'Erreur — % entrées sans nature_prix (attendu 0)', 891 - v_with_nature;
  END IF;

  RAISE NOTICE '✓ Catalogue : 891 entrées toutes enrichies';
  RAISE NOTICE '✓ Metiers distincts : %', v_unique_metiers;
  RAISE NOTICE '✓ nature_prix : 100%% des entrées renseignées';
END $$;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- Distribution finale par métier (info)
-- ═════════════════════════════════════════════════════════════════════════════
-- menuiserie_vitrages                 : 90 entrées
-- plomberie_sanitaires                : 76 entrées
-- electricite                         : 66 entrées
-- cuisine_agencement                  : 61 entrées
-- chauffage                           : 57 entrées
-- maconnerie_structure                : 53 entrées
-- placo_isolation                     : 52 entrées
-- ouvrages_piscine                    : 43 entrées
-- sols_souples                        : 37 entrées
-- peinture_revetements                : 35 entrées
-- toiture_couverture                  : 35 entrées
-- cvc_ventilation                     : 34 entrées
-- ouvrages_vrd                        : 30 entrées
-- stores_occultation                  : 28 entrées
-- forfait_renovation_globale          : 26 entrées
-- carrelage_faience                   : 24 entrées
-- diagnostic_reglementaire            : 21 entrées
-- sols_durs                           : 15 entrées
-- ouvrages_paysagisme                 : 15 entrées
-- ouvrages_anc                        : 14 entrées
-- facade_ravalement                   : 12 entrées
-- metallerie_serrurerie               : 12 entrées
-- ouvrages_photovoltaique             : 11 entrées
-- demolition_depose                   : 8 entrées
-- logistique_chantier                 : 8 entrées
-- bardage_exterieur                   : 7 entrées
-- charpente_bois                      : 6 entrées
-- domotique_securite                  : 3 entrées
-- energie_environnement               : 3 entrées
-- petits_ouvrages_divers              : 3 entrées
-- ouvrages_ascenseur                  : 2 entrées
-- ouvrages_geothermie                 : 2 entrées
-- prestations_intellectuelles         : 2 entrées

-- ═════════════════════════════════════════════════════════════════════════════
-- Distribution finale par nature_prix (info)
-- ═════════════════════════════════════════════════════════════════════════════
-- fourniture_pose      : 684 entrées
-- pose_seule           : 160 entrées
-- non_applicable       : 47 entrées
