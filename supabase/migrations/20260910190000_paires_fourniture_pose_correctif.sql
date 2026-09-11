-- 2026-09-10 — CORRECTIF DE LA MIGRATION PRÉCÉDENTE, IMPOSÉ PAR LA MESURE.
--
-- `20260910180000` renommait deux entrées pour que leur libellé cesse de mentir :
--   « Pose carrelage sol »  → « Carrelage sol (fourni + posé) »
--   « Pose faïence murale » → « Faïence murale (fourni + posé) »
-- L'intention était juste — un libellé qui commence par « Pose » alors que le
-- tarif comprend le matériel est indiscernable d'une ligne de main-d'œuvre.
--
-- 🔴 LE REJEU DU STOCK SUR LE CATALOGUE MODIFIÉ DIT QUE C'EST L'INVERSE QUI
-- SE PRODUIT. En retirant « Pose » du libellé, on rend l'entrée PLUS GÉNÉRIQUE :
-- elle gagne alors sur toutes les lignes « Pose … », y compris celles qui
-- disent explicitement le contraire. Deux régressions nettes, mesurées :
--   « Pose de la faïence AVEC FOURNITURE DE LA COLLE »  640 €
--   « Pose carrelage ou murs FOURNIE COLLE ET JOINT »   650 €
-- Ces deux lignes — main-d'œuvre seule, la fourniture se limitant à la colle —
-- étaient correctement rapprochées de « (hors fourniture) » et passaient sur la
-- nouvelle entrée fourni+posé à 70-150 €/m². Au total 25 textes sur 29 changeaient
-- de référence, dont une majorité dans le mauvais sens.
--
-- ⚠️ Effet de bord découvert au passage : `isSupplyVsLaborMismatch()` (garde 2 du
-- matcher) lit des MOTS. « fourni » n'est pas dans `SUPPLY_TOKENS`, « posé » se
-- normalise en « pose » qui EST dans `LABOR_ONLY_TOKENS` — un libellé
-- « (fourni + posé) » se lit donc comme de la main-d'œuvre pour cette garde.
--
-- ✅ CE QUE LA MESURE VALIDE À LA PLACE : ces deux entrées ne sont pas des
-- tarifs fourni+posé mal nommés, ce sont des DOUBLONS de leur jumelle
-- « (hors fourniture) » — leur tag `fourniture_pose` venait de la couche 5 par
-- défaut de `phase1-audit-catalogue.ts`, pas d'un relevé. Et le fourni+posé
-- existe déjà, explicitement nommé :
--   carrelage sol → `carrelage_standard_fourni_pose` « Carrelage standard (fourni+posé) » 46-94
--   faïence       → `faience_salle_de_bain`          « Faïence salle de bain (fourni+posé) » 45-120
-- On les traite donc exactement comme le portillon, le parquet collé, le parquet
-- massif et la micro-station : suppression du doublon.
--
-- ⚠️ Ni `carrelage_sol` ni `carrelage_mural` n'est cité comme job_type dans le
-- code (les occurrences de `src/data/MATERIALS_MAP.ts` et
-- `src/lib/chantier/workTypeReferentiel.ts` sont des identifiants d'autres
-- référentiels, sans rapport avec `market_prices`).
--
-- Après application :
--     node scripts/score-rapprochement.mjs

DELETE FROM public.market_prices WHERE job_type = 'carrelage_sol';
DELETE FROM public.market_prices WHERE job_type = 'carrelage_mural';

-- L'éclairage extérieur, lui, GARDE son renommage : son libellé d'origine
-- (« Éclairage extérieur (point) ») ne commençait pas par « Pose », il nommait
-- l'objet — c'est bien le tarif fourni+posé, et sa jumelle « Pose éclairage
-- extérieur (hors fourniture) » reste distincte. On aligne seulement la forme
-- sur la convention du catalogue, qui écrit « (fourni+posé) » sans espaces.
UPDATE public.market_prices
   SET label = 'Point lumineux extérieur (fourni+posé)'
 WHERE job_type = 'eclairage_exterieur';
