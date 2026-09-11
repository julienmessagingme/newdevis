-- 2026-09-10 — HUIT FAMILLES OÙ « FOURNI + POSÉ » COÛTAIT MOINS CHER QUE « POSE SEULE ».
--
-- Origine : en instruisant la question « faut-il demander à l'utilisateur si le
-- matériel est fourni ? », on a cherché les entrées du catalogue existant en
-- deux lectures. Il y en a 17. Sur ces 17, **8 étaient impossibles** : le tarif
-- annoncé fourniture comprise était inférieur ou égal au tarif main-d'œuvre
-- seule. Poser la main-d'œuvre plus cher que la main-d'œuvre PLUS le matériel
-- ne peut pas être vrai.
--
-- Mesuré avant correctif : **44 lignes du stock, 46 468 €, en confiance HAUTE**
-- — donc des verdicts effectivement affichés — étaient comparées à l'une de ces
-- seize entrées.
--
-- 🔴 CE N'ÉTAIT PAS UN PROBLÈME DE PRIX, C'ÉTAIT UN PROBLÈME DE DOUBLONS.
-- `nature_prix` n'est pas une donnée relevée : `scripts/phase1-audit-catalogue.ts`
-- (couche 5) PRÉSUME `fourniture_pose` dès qu'un libellé ne porte pas de
-- marqueur explicite — et sa regex de `pose_seule` exige des parenthèses
-- (`(MO)`, `(hors fourniture)`, `(pose)`). Le mot « Pose » nu ne compte pas.
-- « Pose parquet collé » a donc été présumé fourni+posé alors que son libellé
-- dit l'inverse. Preuve la plus nette : `portillon_pose`, tagué
-- `fourniture_pose`, porte `notes = 'Hors fourniture'`.
-- Sur les 8 paires, **une seule** (plancher chauffant) avait ses deux membres
-- tagués explicitement : c'est la seule vraie contradiction de prix. Les autres
-- sont des DOUBLONS — deux entrées main-d'œuvre pour le même ouvrage, avec des
-- fourchettes divergentes selon celle que la recherche vectorielle retenait.
--
-- ⚠️ RÈGLE DU PROJET : une fourchette se SOURCE, jamais ne se déduit de nos
-- propres devis. Toutes celles ci-dessous viennent de guides de prix publics
-- consultés le 2026-09-10 et convergents entre eux ; `last_reviewed_at` reste
-- NULL, elles restent à relire par Julien.
--
-- ⚠️ CETTE MIGRATION NE SUFFIT PAS. Un libellé qui change, c'est un embedding
-- qui change. Après application :
--     node scripts/seed_market_prices_embeddings.mjs
--     node scripts/score-rapprochement.mjs
--     npx tsx scripts/prix/generate-reference.ts   -- carrelage_sol_pose est publié
-- La deuxième commande vérifie qu'on n'a rien cassé sur l'étalon des 150 lignes.

-- ════════════════════════════════════════════════════════════════════════════
-- A. LES DOUBLONS — six entrées supprimées
-- ════════════════════════════════════════════════════════════════════════════
-- Aucune n'est citée dans le code (vérifié sur `src`, `scripts`,
-- `supabase/functions`), et aucune n'est premier candidat du stock sauf
-- `parquet_massif` (une ligne, « - Pose de parquet »).

-- Portillon — le libellé dit « Pose », la NOTE dit « Hors fourniture », et le
-- tag disait fourni+posé. C'est le même ouvrage que « Pose portillon (MO) »
-- (208-432 €), qui reste. Le fourni+posé est couvert par
-- « Portillon aluminium (fourni+posé) » (400-1 250 €).
DELETE FROM public.market_prices WHERE job_type = 'portillon_pose';

-- Parquet collé et parquet massif — « Pose parquet collé » (25-60) et
-- « Pose parquet collé (hors fourniture) » (35-85) décrivent le même travail.
-- On garde celle dont le libellé ne laisse aucun doute. Idem pour le massif.
-- Le fourni+posé existe déjà : « Pose parquet massif (fourni+posé) » 80-200 et
-- « Pose parquet contrecollé (fourni+posé) » 50-135.
DELETE FROM public.market_prices WHERE job_type = 'parquet_colle';
DELETE FROM public.market_prices WHERE job_type = 'parquet_massif';

-- Micro-station — « Micro-station d'épuration (pose) » porte
-- `notes = 'Étude/terrassement'` : elle ne décrit pas une pose seule mais un
-- périmètre PLUS large que l'entrée principale (qui dit « hors terrassement »).
-- Le libellé ment sur son propre contenu ; l'entrée part.
DELETE FROM public.market_prices WHERE job_type = 'assainissement_microstation';

-- Plancher chauffant — la famille comptait QUATRE entrées pour deux notions :
-- deux fourni+posé (« hydraulique (fourni+posé) » 50-120 et « hydraulique eau
-- chaude » 55-132) et deux poses (« (pose) » 55-115 et « hydraulique (pose) »
-- 68-142). On garde une de chaque, la plus explicitement nommée.
-- ⚠️ `plancher_chauffant_electrique` (40-100, fourni+posé) N'EST PAS un doublon :
-- l'électrique est une autre technologie, et il est légitimement moins cher.
DELETE FROM public.market_prices WHERE job_type = 'plancher_chauffant_eau';
DELETE FROM public.market_prices WHERE job_type = 'pose_plancher_chauffant';

-- ════════════════════════════════════════════════════════════════════════════
-- B. LES LIBELLÉS QUI MENTAIENT — trois entrées renommées
-- ════════════════════════════════════════════════════════════════════════════
-- Ces trois-là comprennent bien la fourniture, mais leur libellé commençait par
-- « Pose ». Conséquence concrète : elles sont lexicalement indiscernables d'une
-- ligne de main-d'œuvre seule, ce qui neutralise `isSupplyVsLaborMismatch()`
-- (garde V3.5.9 du matcher, qui compare des MOTS).
-- ⚠️ Renommer change l'embedding : c'est précisément pour ça que le script de
-- ré-embarquement et le contrôle contre l'étalon sont obligatoires ensuite.

-- Carrelage sol — sources : main-d'œuvre seule 25-65 €/m², fourniture comprise
-- 60-190 €/m² (grès cérame standard posé : 80-120 €/m²).
UPDATE public.market_prices
   SET label = 'Carrelage sol (fourni + posé)',
       price_min_unit_ht = 60, price_avg_unit_ht = 95, price_max_unit_ht = 160,
       nature_prix = 'fourniture_pose',
       notes = 'Grès cérame courant, format standard, pose droite',
       source = 'recherche web 2026-09-10 (travaux.com, habitatpresto, angelino-carrelages) — paire fourniture/pose',
       last_reviewed_at = NULL
 WHERE job_type = 'carrelage_sol';

-- Faïence murale — sources : pose seule 30-70 €/m², fourniture comprise
-- 80-150 €/m².
UPDATE public.market_prices
   SET label = 'Faïence murale (fourni + posé)',
       price_min_unit_ht = 70, price_avg_unit_ht = 100, price_max_unit_ht = 150,
       nature_prix = 'fourniture_pose',
       notes = 'Format courant, pose collée sur support préparé',
       source = 'recherche web 2026-09-10 (lamaisonsaintgobain, tarifartisan, prix-travaux-m2) — paire fourniture/pose',
       last_reviewed_at = NULL
 WHERE job_type = 'carrelage_mural';

-- Éclairage extérieur — sources : création d'un point lumineux pose comprise
-- 110-482 € HT ; quatre points fournis et posés 500-1 200 € (soit 125-300 €
-- l'unité). L'ancienne fourchette 72-168 était sous le tarif main-d'œuvre.
UPDATE public.market_prices
   SET label = 'Point lumineux extérieur (fourni + posé)',
       price_min_unit_ht = 110, price_avg_unit_ht = 200, price_max_unit_ht = 400,
       nature_prix = 'fourniture_pose',
       notes = 'Luminaire + alimentation, par point',
       source = 'recherche web 2026-09-10 (travaux.com, travaux-electrique, btobjob) — paire fourniture/pose',
       last_reviewed_at = NULL
 WHERE job_type = 'eclairage_exterieur';

-- ════════════════════════════════════════════════════════════════════════════
-- C. LES FOURCHETTES RECALÉES — cinq entrées de main-d'œuvre seule
-- ════════════════════════════════════════════════════════════════════════════
-- Toutes étaient au-dessus du marché de la main-d'œuvre, ce qui est exactement
-- ce qui rendait les paires impossibles.

-- Pose carrelage sol : 40-100 → 25-65. ⚠️ Cette entrée est PUBLIÉE sur le site
-- (`scripts/prix/generate-reference.ts`, poste `carrelage_pose_seule`) :
-- régénérer `src/data/prix/reference.json` après cette migration.
UPDATE public.market_prices
   SET price_min_unit_ht = 25, price_avg_unit_ht = 45, price_max_unit_ht = 65,
       source = 'recherche web 2026-09-10 (travaux.com, habitatpresto, feuka) — paire fourniture/pose',
       last_reviewed_at = NULL
 WHERE job_type = 'carrelage_sol_pose';

-- Pose faïence murale : 40-110 → 30-70 (collée 30-50, scellée 50-70).
UPDATE public.market_prices
   SET price_min_unit_ht = 30, price_avg_unit_ht = 50, price_max_unit_ht = 70,
       source = 'recherche web 2026-09-10 (lamaisonsaintgobain, tarifartisan) — paire fourniture/pose',
       last_reviewed_at = NULL
 WHERE job_type = 'faience_mur_pose';

-- Pose parquet collé : 35-85 → 25-55 (main-d'œuvre pose collée 25-45 €/m²).
UPDATE public.market_prices
   SET price_min_unit_ht = 25, price_avg_unit_ht = 38, price_max_unit_ht = 55,
       source = 'recherche web 2026-09-10 (travaux.com, hemea, yoojo) — paire fourniture/pose',
       last_reviewed_at = NULL
 WHERE job_type = 'parquet_colle_pose';

-- Pose parquet massif : 55-130 → 35-70 (pose clouée 35-55, jusqu'à 70 selon
-- source et complexité du calepinage).
UPDATE public.market_prices
   SET price_min_unit_ht = 35, price_avg_unit_ht = 50, price_max_unit_ht = 70,
       source = 'recherche web 2026-09-10 (travaux.com, hemea, pierreetparquet) — paire fourniture/pose',
       last_reviewed_at = NULL
 WHERE job_type = 'parquet_massif_pose';

-- Pose éclairage extérieur : 120-400 → 60-200 (pose sur point existant 60-120,
-- applique extérieure 100-250).
UPDATE public.market_prices
   SET price_min_unit_ht = 60, price_avg_unit_ht = 110, price_max_unit_ht = 200,
       source = 'recherche web 2026-09-10 (yoojo, btobjob, travaux.com) — paire fourniture/pose',
       last_reviewed_at = NULL
 WHERE job_type = 'eclairage_exterieur_pose';

-- ════════════════════════════════════════════════════════════════════════════
-- D. LA SEULE VRAIE CONTRADICTION DE PRIX — plancher chauffant hydraulique
-- ════════════════════════════════════════════════════════════════════════════
-- Seule paire dont les DEUX membres portaient un marqueur explicite, donc seule
-- dont les fourchettes se contredisaient vraiment : fourni+posé 50-120 contre
-- pose seule 68-142. Sources : installé 70-150 €/m² (couramment 75-120),
-- pose seule 25-60 €/m².
UPDATE public.market_prices
   SET price_min_unit_ht = 70, price_avg_unit_ht = 95, price_max_unit_ht = 150,
       notes = 'Hors chaudière / hors générateur',
       source = 'recherche web 2026-09-10 (travaux.com, habitatpresto, lamaisonsaintgobain) — paire fourniture/pose',
       last_reviewed_at = NULL
 WHERE job_type = 'plancher_chauffant_hydraulique';

UPDATE public.market_prices
   SET price_min_unit_ht = 25, price_avg_unit_ht = 40, price_max_unit_ht = 60,
       notes = 'Nappes et collecteur fournis par ailleurs',
       source = 'recherche web 2026-09-10 (travaux.com, ootravaux) — paire fourniture/pose',
       last_reviewed_at = NULL
 WHERE job_type = 'pose_plancher_chauffant_hydro';
