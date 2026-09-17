-- 2026-09-17 — LES QUATRE FOURCHETTES DES POSTES ACCUSÉS À TORT SUR LE DEVIS
-- 25030, SOURCÉES (demande Johan : « source les 4 fourchettes »).
--
-- Déclencheur : le banc de rejeu des décisions d'expert désigne 4 postes que le
-- moteur accuse encore alors que l'expert avait tranché 0 € — tous sur le même
-- devis, et tous avec un RAPPROCHEMENT JUSTE. Ce n'était donc pas du moteur :
-- c'étaient des fourchettes à instruire.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 CE QUE CE SOURCING A APPRIS AVANT MÊME DE CHIFFRER : « DEUX SOURCES
--    NOMMABLES » NE VEUT RIEN DIRE SI ON NE LES INTERROGE PAS.
--
-- Le sourceur IA (scripts/sourcer-fourchette-catalogue.mjs) a d'abord été lancé
-- avec le contrôle historique : « au moins deux sources dont l'URL commence par
-- http ». Vérification faite ensuite, **21 URL citées sur 21 ne répondaient
-- pas** — 404 sur des domaines réels (chemin inventé), et jusqu'à
-- `www.vertex-ai.fr`, un domaine qui n'existe même pas : le modèle avait
-- recraché le nom du produit Google qui sert de relais à sa propre recherche.
--
-- Le contrôle mesurait la FORME de la preuve, pas son EXISTENCE. C'est la même
-- famille d'erreur que les indicateurs faux de septembre. Le script interroge
-- désormais chaque URL (404 / domaine introuvable ⇒ la source ne compte pas ;
-- 403 compte, travaux.com et ootravaux.fr existent et bloquent les robots).
--
-- ⚠️ CONSÉQUENCE : les fourchettes ci-dessous ne sont PAS celles qu'a proposées
-- l'IA. Chaque page citée a été ouverte et relue à la main, et c'est cette
-- lecture qui fait foi. L'IA n'a servi qu'à trouver où chercher.
--
-- ⚠️ ET SON INSTABILITÉ EST MESURÉE : sur le témoin `mur_parpaing_20`, deux
-- passages successifs ont rendu 75-110 €/m² puis 58-167 €/m². Un plafond qui
-- varie de 50 % d'un appel à l'autre ne peut pas fixer une valeur de catalogue.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Toutes les valeurs ci-dessous sont HORS TAXES, comme tout le catalogue. Les
-- sources grand public publient majoritairement du TTC ; la conversion est
-- indiquée à chaque fois, et c'est le premier facteur d'erreur (10 à 20 %).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. PARQUET STRATIFIÉ STANDARD (fourni+posé) — 31/45/58 → 33/48/70 €/m²
-- ═══════════════════════════════════════════════════════════════════════════
-- SOURCES (relevées le 17/09/2026, pages ouvertes et lues) :
--   · prix-travaux-m2.com/prix-parquet-stratifie.php — annonce explicitement du
--     HT : « entre 33 euros et 90 euros HT / m2, fournitures et pose comprises ».
--     Décomposé par gamme : premier prix 33-55 · bonne résistance 40-70 ·
--     hydrofuge/antidérapant 44-90.
--   · lamaisonsaintgobain.fr/guides-travaux/amenagement-interieur/prix-pose-parquet
--     — « 69 à 91 €/m² » TTC fourniture et pose comprises (75-91 sur support
--     béton brut). Converti à 20 % : 58-76 € HT.
--
-- FOURCHETTE RETENUE 33 / 48 / 70. Le plafond 70 est la borne haute de la gamme
-- « bonne résistance », celle que décrit notre libellé « standard ». On ne monte
-- PAS à 90 : ce chiffre couvre l'hydrofuge/antidérapant, qui est l'entrée
-- `parquet_stratifie_premium`. Confondre les deux ferait disparaître la gamme.
--
-- MESURÉ (simuler-fourchette.mjs) : 11 analyses portent cette entrée, le montant
-- accusé passe de 18 419 € à 15 792 € (−2 627 €) sur 3 devis, une analyse passe
-- sous le plancher d'affichage, **0 poste ne devient accusé**.
update public.market_prices
set price_min_unit_ht = 33,
    price_avg_unit_ht = 48,
    price_max_unit_ht = 70,
    source = 'web 2026-09-17 — prix-travaux-m2.com/prix-parquet-stratifie.php (33-90 € HT/m² fourni+posé ; bonne résistance 40-70) + lamaisonsaintgobain.fr (69-91 €/m² TTC, soit 58-76 HT à 20 %)',
    notes = 'Fourni + posé, pose flottante sur support sain, sous-couche simple comprise. Hors dépose de l''ancien revêtement et hors ragréage. Plafond 70 = haut de la gamme « bonne résistance » ; au-delà, voir parquet_stratifie_premium.',
    last_reviewed_at = now()
where job_type = 'parquet_stratifie_standard';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. PARQUET STRATIFIÉ PREMIUM (fourni+posé) — 43/61/79 → 44/65/90 €/m²
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ CETTE ENTRÉE N'EST TOUCHÉE QUE POUR LA COHÉRENCE DE GAMME, et son effet
-- mesuré est NUL : **aucune analyse du stock ne la porte**. Sans elle, le
-- plafond « premium » (79) serait à 9 € du plafond « standard » (70) alors que
-- la source les sépare de 20 — la distinction de gamme cesserait de vouloir
-- dire quelque chose au premier devis qui l'utilisera.
--
-- SOURCE : prix-travaux-m2.com/prix-parquet-stratifie.php — gamme hydrofuge /
-- antidérapant « 44 euros à 90 euros / m2 », HT, fourniture et pose comprises.
update public.market_prices
set price_min_unit_ht = 44,
    price_avg_unit_ht = 65,
    price_max_unit_ht = 90,
    source = 'web 2026-09-17 — prix-travaux-m2.com/prix-parquet-stratifie.php (gamme hydrofuge/antidérapant 44-90 € HT/m² fourni+posé)',
    notes = 'Fourni + posé. Stratifié classe d''usage élevée (32/33, AC4-AC5), hydrofuge ou antidérapant, 10-12 mm. Aucune analyse du stock ne portait cette entrée au 17/09/2026 : correction de cohérence de gamme.',
    last_reviewed_at = now()
where job_type = 'parquet_stratifie_premium';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. FAÏENCE SALLE DE BAIN (fourni+posé) — 45/82/120 → 45/90/140 €/m²
-- ═══════════════════════════════════════════════════════════════════════════
-- Cette entrée était déjà signalée au backlog (« 45-120 quand les sources
-- donnent 80-150 »). Le relevé le confirme.
--
-- SOURCES (relevées le 17/09/2026) :
--   · lamaisonsaintgobain.fr/.../prix-pose-faience-m2 — « 80 à 150 €/m² » TTC
--     fourniture et pose, moyenne nationale 115 €/m² TTC. Converti à 10 %
--     (rénovation) : 73-136 € HT.
--   · prix-travaux-m2.com/prix-faience.php — « entre 45 euros et 210 euros HT,
--     fournitures et pose comprises ».
--
-- FOURCHETTE RETENUE 45 / 90 / 140. On ne retient PAS le 210 € : la consigne de
-- sourcing veut qu'une fourchette décrive le COURANT, pas l'extrême d'un seul
-- site — 140 est le plafond commun aux deux sources (136 converti, et bien en
-- deçà de 210). Le plancher 45 est celui, direct et HT, de prix-travaux-m2.
--
-- ⚠️ LA PAIRE RESTE POSSIBLE, et c'est le contrôle qui compte ici (règle du
-- 10/09 : 8 paires « fourniture comprise moins chère que la pose seule » avaient
-- été trouvées). `faience_mur_pose` (pose seule) est à 30-70 : le fourni+posé
-- reste au-dessus des deux côtés (45 > 30 et 140 > 70).
--
-- MESURÉ : 8 analyses portent cette entrée, le montant accusé ne bouge PAS
-- (aucun poste ne se situe entre 120 et 140 €/m²), 0 poste ne devient accusé.
-- La correction vaut pour les analyses à venir.
update public.market_prices
set price_min_unit_ht = 45,
    price_avg_unit_ht = 90,
    price_max_unit_ht = 140,
    source = 'web 2026-09-17 — lamaisonsaintgobain.fr (80-150 €/m² TTC fourni+posé, moyenne 115 TTC, soit 73-136 HT à 10 %) + prix-travaux-m2.com/prix-faience.php (45-210 € HT/m² fourni+posé)',
    notes = 'Fourni + posé, colle et joints compris, sur support sain. Hors dépose de l''ancien revêtement et hors ragréage. Plafond 140 = plafond commun aux deux sources ; le 210 € de prix-travaux-m2 décrit un carreau premium isolé, pas le courant.',
    last_reviewed_at = now()
where job_type = 'faience_salle_de_bain';

-- ⚠️ `faience_mur_pose` (pose seule, 30-70 €/m²) a été sourcée dans la même
-- passe et RESTE INCHANGÉE : prix-travaux-m2.com donne 25-70 € HT pour la pose
-- murale, lamaisonsaintgobain 50-70 €/m² TTC. Notre fourchette les couvre déjà.
-- Une entrée qu'on vérifie et qu'on ne touche pas est aussi un résultat.

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. ISOLATION PLANCHER POLYSTYRÈNE SOUS DALLE — 12/20/32 → 15/26/40 €/m²
-- ═══════════════════════════════════════════════════════════════════════════
-- SOURCES (relevées le 17/09/2026) :
--   · constructeurtravaux.fr/prix-pose-isolation-polystyrene/ — isoler un sol au
--     polystyrène « entre 20 et 40 euros par mètre carré », dont 5-15 €/m² pour
--     l'isolant seul.
--   · travauxbeton.fr/isolation-dalle-beton/ — sur un devis réel chiffré en HT,
--     l'ajout de l'isolant sous chape fait passer le m² de 180 à 206 € HT, soit
--     un delta de **26 €/m² HT** pour la fourniture et la pose de l'isolant.
--     La même page situe le PSE 100 mm à ~15 €/m² en fourniture seule.
--
-- FOURCHETTE RETENUE 15 / 26 / 40. La moyenne 26 est le delta mesuré sur devis
-- réel, ce qui est la meilleure donnée du lot ; les bornes encadrent la
-- fourchette de constructeurtravaux.
--
-- ⚠️ CE QUE CETTE ENTRÉE NE COUVRE PAS, ET QUI RESTE UN TROU : le devis qui a
-- déclenché ce sourcing facture un **polyuréthane** 80 mm (R = 3,70), pas du
-- polystyrène. Le PU coûte nettement plus cher — travauxbeton.fr le situe à
-- 25-35 €/m² en FOURNITURE SEULE contre ~15 pour le PSE. Le rapprochement est
-- donc approchant, pas exact, et une entrée « isolant polyuréthane sous
-- dalle/chape » manque au catalogue (backlog). Ne PAS la simuler en gonflant
-- celle-ci : deux matériaux, deux prix.
--
-- ⚠️ Et on ne confond pas avec `isolation_plancher_bas` (30-75 €/m², isolation
-- par la sous-face) ni avec les pages qui annoncent « isolation sous chape
-- 50-110 €/m² » — celles-là incluent la chape elle-même, un autre périmètre.
--
-- MESURÉ : 1 analyse porte cette entrée, montant accusé 4 101 € → 4 059 €
-- (−42 €), 0 poste ne devient accusé.
update public.market_prices
set price_min_unit_ht = 15,
    price_avg_unit_ht = 26,
    price_max_unit_ht = 40,
    source = 'web 2026-09-17 — constructeurtravaux.fr/prix-pose-isolation-polystyrene (20-40 €/m² isolation d''un sol au polystyrène, isolant seul 5-15) + travauxbeton.fr/isolation-dalle-beton (devis réel : +26 €/m² HT pour l''isolant sous chape, PSE 100 mm ≈ 15 €/m² fourniture)',
    notes = 'Fourni + posé, panneaux de polystyrène sous dalle ou sous chape, ép. ~80 mm. L''ISOLANT SEUL : ni la dalle, ni la chape, ni le ragréage. Ne couvre PAS le polyuréthane (25-35 €/m² en fourniture seule) — entrée à créer.',
    last_reviewed_at = now()
where job_type = 'isolation_plancher_polystyrene';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. POSE PANNEAUX OSB — 10/18/26 → 18/32/50 €/m²
-- ═══════════════════════════════════════════════════════════════════════════
-- SOURCES (relevées le 17/09/2026) :
--   · prix-pose.com/plancher-osb — par épaisseur, en TTC : 9-12 mm → 20-43 €/m²,
--     14-18 mm → 24-47, **20 mm et plus → 29-60 €/m²**, pose comprise. Pose
--     seule 15-35 €/m². Converti à 20 % : 24-50 € HT pour le 20 mm et plus.
--   · tarifartisan.fr/plancher-osb/ — TTC : fourniture 20 mm et plus 14-20 €/m²,
--     pose 15-35 €/m², global « 20 à 45 €/m² pose comprise ». La somme des deux
--     postes donne 29-55 € TTC, soit 24-46 € HT.
--
-- FOURCHETTE RETENUE 18 / 32 / 50. Le plancher 18 couvre les panneaux minces
-- (l'entrée ne dit pas son épaisseur) ; le plafond 50 est le plus bas des deux
-- plafonds convertis (50 et 46 → on garde celui qui accuse le plus volontiers
-- des deux sources les plus fiables, soit la borne de prix-pose.com).
--
-- ANCIENNE FOURCHETTE : 10/18/26, source « seed_manual ». Son plafond (26) était
-- au niveau du PLANCHER du marché converti (24) : une dalle OSB 22 mm fournie et
-- posée au prix courant était accusée quasi systématiquement.
--
-- ⚠️ LE LIBELLÉ RESTE « Pose panneaux OSB », ET C'EST DÉLIBÉRÉ. Il dit « Pose »
-- alors que `nature_prix` dit fourni+posé — c'est le piège documenté le 10/09
-- (`nature_prix` est une présomption, pas un relevé). Mais le corriger en
-- retirant le mot « Pose » rendrait l'entrée plus GÉNÉRIQUE et lui ferait
-- capter les lignes « Pose … » qui disent le contraire : c'est exactement le
-- renommage annulé le 10/09 sur le carrelage. L'ambiguïté part au backlog.
--
-- MESURÉ : 1 analyse porte cette entrée, montant accusé 4 101 € → 4 089 €
-- (−12 €), 0 poste ne devient accusé.
update public.market_prices
set price_min_unit_ht = 18,
    price_avg_unit_ht = 32,
    price_max_unit_ht = 50,
    source = 'web 2026-09-17 — prix-pose.com/plancher-osb (20 mm et plus : 29-60 €/m² TTC pose comprise, soit 24-50 HT à 20 % ; pose seule 15-35 TTC) + tarifartisan.fr/plancher-osb (fourniture 14-20 + pose 15-35 TTC, global 20-45 TTC)',
    notes = 'Fourni + posé, panneaux/dalles OSB sur solives ou lambourdes. Le plancher 18 couvre les faibles épaisseurs (9-12 mm), le plafond 50 la dalle 22 mm rainurée-bouvetée. ⚠️ Le libellé dit « Pose » mais le prix est fourni+posé : ne pas renommer (cf. le renommage annulé du 10/09).',
    last_reviewed_at = now()
where job_type = 'pose_plaque_osb';

-- ═══════════════════════════════════════════════════════════════════════════
-- TÉMOIN — la migration doit avoir fait ce qu'elle annonce, et rien d'autre.
-- Sans ce bloc, un `where` qui ne matche rien passe pour un succès.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  n_touchees int;
  n_incoherentes int;
  n_paires_impossibles int;
begin
  select count(*) into n_touchees
  from public.market_prices
  where job_type in ('parquet_stratifie_standard','parquet_stratifie_premium',
                     'faience_salle_de_bain','isolation_plancher_polystyrene','pose_plaque_osb')
    and last_reviewed_at >= now() - interval '1 minute';
  if n_touchees <> 5 then
    raise exception 'TÉMOIN CASSÉ : % entrée(s) mise(s) à jour au lieu de 5', n_touchees;
  end if;

  -- Une fourchette doit rester ordonnée : min <= avg <= max.
  select count(*) into n_incoherentes
  from public.market_prices
  where job_type in ('parquet_stratifie_standard','parquet_stratifie_premium',
                     'faience_salle_de_bain','isolation_plancher_polystyrene','pose_plaque_osb')
    and not (price_min_unit_ht <= price_avg_unit_ht and price_avg_unit_ht <= price_max_unit_ht);
  if n_incoherentes > 0 then
    raise exception 'TÉMOIN CASSÉ : % fourchette(s) désordonnée(s)', n_incoherentes;
  end if;

  -- 🔴 LE CONTRÔLE DU 10/09 : un « fourni + posé » ne peut pas être moins cher
  -- que la « pose seule » du même ouvrage. Huit paires impossibles avaient été
  -- trouvées ce jour-là ; on n'en recrée pas une.
  select count(*) into n_paires_impossibles
  from public.market_prices fp, public.market_prices ps
  where fp.job_type = 'faience_salle_de_bain'
    and ps.job_type = 'faience_mur_pose'
    and (fp.price_min_unit_ht < ps.price_min_unit_ht or fp.price_max_unit_ht <= ps.price_max_unit_ht);
  if n_paires_impossibles > 0 then
    raise exception 'TÉMOIN CASSÉ : faience_salle_de_bain (fourni+posé) n''est plus au-dessus de faience_mur_pose (pose seule)';
  end if;

  raise notice 'OK : 5 fourchettes sourcées, ordonnées, et la paire faïence reste cohérente.';
end $$;
