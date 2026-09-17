-- 2026-09-17 — CLÔTURE ALUMINIUM À LAMES : LE PLAFOND ÉTAIT SOUS LE PLANCHER
-- DU MARCHÉ.
--
-- Déclencheur : le rejeu des 55 décisions d'expert (banc-rejeu-decisions-expert)
-- montre que le moteur réaccuse « Clôture aluminium lames » sur le devis
-- UF_Maison Bois (4 200 € pour 16,8 ml = 250 €/ml HT) alors que l'expert avait
-- annulé ce montant en écrivant : « alu CETAL 20 ans 250 €/ml OK — fourchettes
-- catalogue trop basses ».
--
-- SOURCES (deux, indépendantes, nommables — une source qu'on ne peut pas citer
-- ne compte pas, règle du 15/09) :
--
--   · prix-travaux-m2.com/prix-cloture-aluminium.php — relevé le 17/09/2026
--     « 175 euros à 400 euros HT / mètre linéaire », fourniture et pose incluses.
--     Par modèle : palissade 240-400 € HT/ml · lames persiennes 195-350 ·
--     claire-voie 175-330. Base : hauteur 1 m, fixation au sol.
--
--   · prix-pose.com/cloture-aluminium — relevé le 17/09/2026
--     175 à 400 €/ml **TTC**, moyenne nationale 240 €/ml TTC.
--     Palissade (lames pleines) 225-400 TTC, soit ≈ 187-333 € HT.
--
-- ⚠️ LE PIÈGE HT/TTC EST LE POINT CENTRAL DE CE SOURCING. Les deux pages
-- annoncent « 175-400 » mais l'une en HT et l'autre en TTC : les prendre pour
-- équivalentes gonflerait la fourchette de 20 %. Notre catalogue est HORS
-- TAXES. Converties à 20 %, les bornes TTC donnent 146-333 € HT.
--
-- FOURCHETTE RETENUE : 150 / 230 / 330 € HT/ml.
--   · min 150 — entre le plancher HT converti (146) et le plancher HT direct (175)
--   · max 330 — le plafond COMMUN aux deux sources (333 converti, 400 direct) ;
--     on retient le plus bas des deux, celui qui accuse le plus volontiers.
--   · avg 230 — cohérent avec la moyenne nationale (240 TTC ≈ 200 HT) et le
--     milieu de la fourchette palissade.
--
-- ANCIENNE FOURCHETTE : 55 / 92 / 145 € HT/ml, source « seed_manual », note
-- « Base ». Son PLAFOND (145) était sous le PLANCHER des deux sources (146-175) :
-- toute clôture aluminium conforme au marché était accusée.
--
-- MESURÉ AVANT APPLICATION (scripts/simuler-fourchette.mjs, rejeu du stock avec
-- la fourchette substituée) : 2 analyses portent cette entrée, le montant accusé
-- passe de 5 284 € à 1 756 € (−3 528 €), **0 poste ne devient accusé**, aucune
-- analyse ne bascule sous le plancher d'affichage.
--
-- ⚠️ EFFET LIMITÉ AU FUTUR. Les prix du catalogue sont FIGÉS dans chaque analyse
-- au moment où elle est faite (`raw_text.n8n_price_data[].prices`) : le stock
-- existant n'est pas corrigé par cette migration. Le −3 528 € est une projection
-- de la règle sur les données passées, pas un gain rétroactif.
--
-- ⚠️ PAS DE RE-SEED D'EMBEDDING NÉCESSAIRE : seuls les PRIX changent. Le vecteur
-- est calculé sur le libellé et les précisions, qui ne bougent pas.
--
-- ⚠️ ENTRÉE NON ÉDITORIALE : elle n'est pas publiée par generate-reference.ts,
-- donc `src/data/prix/reference.json` n'a pas à être régénéré (vérifié).

update public.market_prices
set
  price_min_unit_ht = 150,
  price_avg_unit_ht = 230,
  price_max_unit_ht = 330,
  source = 'web 2026-09-17 — prix-travaux-m2.com (175-400 HT/ml, palissade 240-400) + prix-pose.com (175-400 TTC, moy. 240 TTC) ; converti HT à 20 %',
  notes = 'Fourni + posé, hauteur ~1 m. Plafond retenu = le plus bas des deux sources (330). Ancienne fourchette 55-92-145 : son plafond était sous le plancher du marché.'
where job_type = 'cloture_alu_lames';

-- Témoin : l'entrée existe et n'a été touchée qu'une fois.
do $$
declare n int;
begin
  select count(*) into n from public.market_prices
   where job_type = 'cloture_alu_lames' and price_max_unit_ht = 330;
  if n <> 1 then
    raise exception 'cloture_alu_lames : % ligne(s) à 330 €/ml, attendu exactement 1', n;
  end if;
end $$;
