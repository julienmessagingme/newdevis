-- 2026-09-15 — TROIS RÉFÉRENCES DE PLUS, ET C'EST UN RETOUR TERRAIN QUI LES EXIGE.
--
-- 🔴 LA RIGUEUR MÉTHODOLOGIQUE PRODUISAIT UNE INCOHÉRENCE VISIBLE.
-- Après la mise en service du bloc matériel sur le devis VOLTELEC, Johan voit
-- **quatre murals Daikin Perfera de la même gamme : deux chiffrés en haut de
-- page, deux marqués « Prix non vérifiable » plus bas**. FTXM20A (510 €) et
-- FVXM25B (1 450 €) étaient bien dans le référentiel — mais à UNE source, donc
-- écartés par la contrainte `nb_sources >= 2`.
--
-- La règle des deux sources est bonne et ne change pas : un prix opposé à un
-- artisan sur la foi d'un seul marchand est indéfendable. Ce qu'il fallait,
-- c'était FINIR le sourcing, pas assouplir le garde. Le lecteur ne peut pas
-- comprendre qu'on sache chiffrer un FTXM42 et pas un FTXM20 de la même gamme :
-- l'incohérence décrédibilise les DEUX blocs à la fois.
--
-- ⚠️ Même méthode que la migration initiale, mêmes pièges écartés : prix
-- distributeur français en HT, unité intérieure SEULE (jamais le pack
-- monosplit, ×2,8 sur la même référence), jamais le tarif catalogue
-- constructeur (2 à 2,5× le réel).
--
-- MXZ-3F54VF4 rejoint le lot au passage : sa seconde source existait mais
-- n'était pas NOMMÉE (elle venait d'un résumé de recherche). Elle l'est
-- désormais — gus-astuces, prix relevé sur la fiche produit. Une source qu'on
-- ne peut pas nommer ne compte pas.
--
-- Effet sur le devis d'origine : la couverture passe de 57 % à ~69 %, et les
-- quatre murals de la même gamme sont enfin traités de la même façon.

insert into public.prix_materiel
  (reference, reference_normalisee, marque, famille, perimetre, designation,
   prix_min_ht, prix_max_ht, nb_sources, sources, releve_le, perime_le)
values
  ('FTXM20A', 'FTXM20A', 'Daikin', 'mural', 'unite_seule',
   'mural 2,0 kW (unite seule)', 299.17, 332.50, 2,
   '[{"distributeur":"climonline","prix_ht":299.17},{"distributeur":"climfactory","prix_ht":332.5}]'::jsonb,
   '2026-09-15', '2026-12-15'),

  ('FVXM25B', 'FVXM25B', 'Daikin', 'console', 'unite_seule',
   'console 2,5 kW (unite seule)', 949.17, 1007.50, 2,
   '[{"distributeur":"climfactory","prix_ht":949.17},{"distributeur":"climshop","prix_ht":1007.5}]'::jsonb,
   '2026-09-15', '2026-12-15'),

  ('MXZ-3F54VF4', 'MXZ3F54VF4', 'Mitsubishi', 'groupe_ext_multi', 'unite_seule',
   'groupe ext 3 sorties 5,4 kW', 1374.17, 1617.78, 2,
   '[{"distributeur":"climfactory","prix_ht":1374.17},{"distributeur":"gus-astuces","prix_ht":1617.78}]'::jsonb,
   '2026-09-15', '2026-12-15')

on conflict (reference_normalisee) do nothing;
