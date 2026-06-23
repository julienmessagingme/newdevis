-- ═════════════════════════════════════════════════════════════════════════════
-- Phase 1.4 — Fix des 39 doublons identifiés dans l'audit du catalogue
-- ═════════════════════════════════════════════════════════════════════════════
-- Date           : 2026-06-23
-- Source         : docs/refonte/catalogue-classement/RAPPORT-AUDIT.md
-- Décisions      : F2 (élargir isolation_murs_interieurs à 35-110) + G1 (créer pose_carrelage_sdb_m2)
-- Validation     : Julien (2026-06-23)
--
-- ⚠️ À LANCER DANS SUPABASE STUDIO → SQL EDITOR
-- Effet : 911 entrées → 890 entrées (-21) + 10 labels clarifiés + 1 nouvelle entrée
--
-- Le script tourne dans une transaction BEGIN/COMMIT. Si UNE seule instruction
-- échoue, ROLLBACK automatique → catalogue intact.
-- ═════════════════════════════════════════════════════════════════════════════

-- État initial pour comparaison (à exécuter AVANT le BEGIN pour photo)
-- SELECT COUNT(*) AS nb_entrees_avant FROM public.market_prices;
-- → doit retourner 911

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- CATÉGORIE A — Forfaits par taille à SUPPRIMER (-16 entrées)
-- ─────────────────────────────────────────────────────────────────────────────
-- Cause : 4 forfaits par tranche de surface (10/20/30/50m²) sont PARFAITEMENT
-- LINÉAIRES par rapport à l'entrée m² générique. Aucune info nouvelle, juste
-- du bruit pour le matcher vectoriel.
--
-- Vérification linéarité (exemples) :
--   dépose carrelage : 308/10 = 30.8, 616/20 = 30.8, 924/30 = 30.8 ✓
--   dépose moquette  : 116/10 = 11.6, 232/20 = 11.6, 348/30 = 11.6 ✓
--   dépose parquet   : 174/10 = 17.4, 348/20 = 17.4, 522/30 = 17.4 ✓
--   pose carrelage SDB : 810/10 = 81,  1215/15 = 81, 1620/20 = 81 ✓
-- ─────────────────────────────────────────────────────────────────────────────

-- Dépose carrelage (forfaits par taille → on garde id 44 au m²)
DELETE FROM public.market_prices WHERE id IN (447, 450, 453, 456);

-- Dépose moquette (forfaits par taille → on garde id 45 au m²)
DELETE FROM public.market_prices WHERE id IN (449, 452, 455, 458);

-- Dépose parquet (forfaits par taille → on garde id 46 au m²)
DELETE FROM public.market_prices WHERE id IN (448, 451, 454, 457);

-- Pose carrelage salle de bain MO (forfaits par taille → on crée une entrée m² en catégorie G1)
DELETE FROM public.market_prices WHERE id IN (314, 315, 316, 317);

-- ─────────────────────────────────────────────────────────────────────────────
-- CATÉGORIE B — Labels à expliciter (gamme standard/premium/simple/global)
-- ─────────────────────────────────────────────────────────────────────────────
-- Cause : 5 couples d'entrées avec le MÊME label mais des fourchettes
-- différentes. Au matching, le moteur choisit au hasard l'un ou l'autre.
-- Solution : expliciter la gamme dans le label.
-- ─────────────────────────────────────────────────────────────────────────────

-- Carrelage (fourni+posé) — standard vs premium
UPDATE public.market_prices SET label = 'Carrelage standard (fourni+posé)' WHERE id = 319;
UPDATE public.market_prices SET label = 'Carrelage premium (fourni+posé)' WHERE id = 321;

-- Parquet stratifié (fourni+posé) — standard vs premium
UPDATE public.market_prices SET label = 'Parquet stratifié standard (fourni+posé)' WHERE id = 318;
UPDATE public.market_prices SET label = 'Parquet stratifié premium (fourni+posé)' WHERE id = 320;

-- Porte de garage sectionnelle (fourni+posé) — standard vs premium
UPDATE public.market_prices SET label = 'Porte de garage sectionnelle standard (fourni+posé)' WHERE id = 669;
UPDATE public.market_prices SET label = 'Porte de garage sectionnelle premium (fourni+posé)' WHERE id = 848;

-- Paroi douche (fourni+posé) — simple vs global incl. étanchéité
UPDATE public.market_prices SET label = 'Paroi douche simple (fourni+posé)' WHERE id = 445;
UPDATE public.market_prices SET label = 'Paroi douche global incl. étanchéité (fourni+posé)' WHERE id = 432;

-- WC suspendu (fourni+posé) — simple vs global incl. maçonnerie
UPDATE public.market_prices SET label = 'WC suspendu simple (fourni+posé)' WHERE id = 443;
UPDATE public.market_prices SET label = 'WC suspendu global incl. maçonnerie (fourni+posé)' WHERE id = 433;

-- ─────────────────────────────────────────────────────────────────────────────
-- CATÉGORIE C — Vrais doublons à FUSIONNER (-5 entrées)
-- ─────────────────────────────────────────────────────────────────────────────
-- Cause : 2 entrées techniquement identiques (typo, alias). On garde la plus
-- précise/explicite, on supprime l'autre.
-- ─────────────────────────────────────────────────────────────────────────────

-- Évacuation gravats (prix identiques) → on garde id 79 (label "evacuation_gravats" plus parlant)
DELETE FROM public.market_prices WHERE id = 78; -- evacuation_dechets

-- Isolation combles perdus (prix identiques) → on garde id 96 (label plus précis)
DELETE FROM public.market_prices WHERE id = 95; -- isolation_combles (label "Isolation combles perdus" trop générique côté job_type)

-- VMC simple flux (forfait max 1300 vs 1400) → on garde id 230 (job_type plus précis), fourchette plus large
DELETE FROM public.market_prices WHERE id = 227; -- vmc

-- Pose plinthes carrelage (6-22 vs 9-19) → on garde id 180 (pluriel = norme), fourchette plus large
DELETE FROM public.market_prices WHERE id = 383; -- pose_plinthe_carrelage (typo singulier)

-- ─────────────────────────────────────────────────────────────────────────────
-- DÉCISION F2 — Isolation murs intérieurs : élargir fourchette + fusionner
-- ─────────────────────────────────────────────────────────────────────────────
-- Cause : id 99 a 35-90 €/m² (label "murs intérieurs" précis), id 97 a 35-110
-- (label "murs" trop générique mais fourchette plus large).
-- Décision F2 : UPDATE id 99 à 35-110 (élargie) puis DELETE id 97.
-- Effet : on garde le label précis + la fourchette large.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.market_prices
SET
  price_min_unit_ht = 35,
  price_avg_unit_ht = 72,  -- moyenne (35+110)/2 = 72.5
  price_max_unit_ht = 110
WHERE id = 99; -- isolation_murs_interieurs (fourchette élargie 35-110)

DELETE FROM public.market_prices WHERE id = 97; -- isolation_murs (label trop générique)

-- ─────────────────────────────────────────────────────────────────────────────
-- DÉCISION G1 — Nouvelle entrée pose_carrelage_sdb_m2 (+1 entrée)
-- ─────────────────────────────────────────────────────────────────────────────
-- Cause : les 4 forfaits SDB (catégorie A4) ont tous 39 €/m² min et 81 €/m² max
-- en sortie linéaire. Au lieu de les supprimer sans remplacement, on crée une
-- entrée m² générique qui couvre la spécificité SDB (étanchéité, contraintes
-- d'espace) — fourchette différente du sol classique (35-90).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.market_prices (
  job_type,
  label,
  unit,
  price_min_unit_ht,
  price_avg_unit_ht,
  price_max_unit_ht,
  fixed_min_ht,
  fixed_avg_ht,
  fixed_max_ht,
  domain,
  generic_family,
  room_specific,
  required_room,
  notes,
  source,
  confidence,
  sample_size
) VALUES (
  'pose_carrelage_sdb_m2',
  'Pose carrelage salle de bain (MO)',
  'm2',
  39,
  60,
  81,
  0,
  0,
  0,
  'travaux',
  'pose_carrelage',
  TRUE,
  '{"sdb","salle_de_bain"}',
  'Créée 2026-06-23 (Phase 1.4 G1) en remplacement des 4 forfaits par taille (pose_carrelage_sdb_10m2/15m2/20m2/30m2) qui avaient tous une linéarité parfaite à 39-81 €/m². Spécifique SDB (étanchéité, contraintes) vs sol classique.',
  'phase1_refonte',
  'medium',
  4  -- les 4 forfaits supprimés servaient d'observations
);

-- ─────────────────────────────────────────────────────────────────────────────
-- VÉRIFICATIONS FINALES (avant COMMIT)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Compte total attendu : 911 - 21 + 1 = 891 entrées
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.market_prices;
  IF v_count != 891 THEN
    RAISE EXCEPTION 'Erreur — attendu 891 entrées, trouvé %', v_count;
  END IF;
  RAISE NOTICE '✓ Catalogue : 891 entrées (911 - 21 supprimées + 1 créée)';
END $$;

-- 2. Aucun doublon de label (parmi les ex-doublons cat B)
DO $$
DECLARE
  v_dup INT;
BEGIN
  SELECT COUNT(*) INTO v_dup
  FROM (
    SELECT LOWER(TRIM(label)) AS lbl, COUNT(*) AS n
    FROM public.market_prices
    WHERE LOWER(TRIM(label)) IN (
      'carrelage (fourni+posé)',
      'parquet stratifié (fourni+posé)',
      'porte de garage sectionnelle (fourni+posé)',
      'paroi douche (fourni+posé)',
      'wc suspendu (fourni+posé)'
    )
    GROUP BY 1
    HAVING COUNT(*) > 1
  ) sub;
  IF v_dup > 0 THEN
    RAISE EXCEPTION 'Erreur — il reste % labels doublonnés après UPDATE catégorie B', v_dup;
  END IF;
  RAISE NOTICE '✓ Catégorie B : labels expliciter, plus de doublons sur ces 5 familles';
END $$;

-- 3. La nouvelle entrée pose_carrelage_sdb_m2 existe
DO $$
DECLARE
  v_exists INT;
BEGIN
  SELECT COUNT(*) INTO v_exists FROM public.market_prices WHERE job_type = 'pose_carrelage_sdb_m2';
  IF v_exists != 1 THEN
    RAISE EXCEPTION 'Erreur — pose_carrelage_sdb_m2 non créée';
  END IF;
  RAISE NOTICE '✓ G1 : pose_carrelage_sdb_m2 créée (39-81 €/m²)';
END $$;

-- 4. isolation_murs_interieurs a bien la nouvelle fourchette
DO $$
DECLARE
  v_max NUMERIC;
BEGIN
  SELECT price_max_unit_ht INTO v_max
  FROM public.market_prices WHERE id = 99;
  IF v_max != 110 THEN
    RAISE EXCEPTION 'Erreur F2 — isolation_murs_interieurs max attendu 110, trouvé %', v_max;
  END IF;
  RAISE NOTICE '✓ F2 : isolation_murs_interieurs élargi 35-110 €/m²';
END $$;

-- Toutes les vérifs passent → on commit
COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- POST-COMMIT — Actions recommandées
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Régénération embeddings : les 10 labels de catégorie B + la nouvelle entrée
--    G1 ont changé/sont neuves → embeddings obsolètes. Phase 1.6 traitera.
-- 2. Re-export du catalogue + relance du script audit pour vérifier que
--    le rapport ne montre plus de doublons sur ces 39 entrées.
-- 3. Le matcher V3.5 vectoriel en prod continue de fonctionner — l'index HNSW
--    pgvector se met à jour automatiquement à l'INSERT (mais les anciennes
--    rows modifiées (cat B) gardent leur ancien embedding tant que la phase 1.6
--    n'a pas tourné).
