-- 2026-09-11 — SIX ENTRÉES POUR LES FAMILLES QUE L'ÉTALON DÉSIGNE COMME ABSENTES.
--
-- Origine : après la fermeture du re-classement du top-5 (mesuré, aucun signal
-- ne départage), le seul gisement chiffré restant est le CATALOGUE — **44 % des
-- lignes de consensus de `match_gold_standard` n'ont aucune entrée valable**,
-- soit cinq fois le gisement du classement.
--
-- ⚠️ MÉTHODE, ET SES DEUX CORRECTIFS. Les 34 lignes « aucune entrée valable »
-- ont d'abord été LUES une par une : neuf sont déjà écartées à raison par une
-- garde (prestations intellectuelles, frais non chiffrables), huit sont des
-- accessoires ou des fragments injugeables. Restent une quinzaine de vrais
-- trous, dont on a mesuré le poids sur le stock entier. Deux pièges rencontrés
-- en le faisant :
--   (a) chercher uniquement parmi les lignes « non vérifiables » RATE l'essentiel
--       — un trou de catalogue produit souvent un faux match CONFIANT. Les trois
--       lignes d'enduit chaux extérieur (12 740 €) sont toutes en confiance
--       HAUTE, rapprochées du même faux : « Enduit chaux intérieur (tadelakt) ».
--   (b) compter le montant d'une ligne dès qu'un mot-clé y apparaît gonfle tout :
--       une ligne de bardage à 16 200 € citant « rives » en passant était
--       comptée en zinguerie. Le mot-clé doit être dans la TÊTE de la ligne —
--       même piège que la garde des frais (40 caractères) le 10/09.
--
-- ⚠️ RÈGLE DU PROJET : une fourchette se SOURCE, jamais ne se déduit de nos
-- propres devis — ce serait circulaire. Chaque entrée porte sa provenance, et
-- `last_reviewed_at` reste NULL : elles restent à relire par Julien. Trois
-- d'entre elles sont explicitement signalées comme les moins sûres.
--
-- ⚠️ UN INSERT NE SUFFIT PAS :
--     node scripts/seed_market_prices_embeddings.mjs
--     node scripts/score-rapprochement.mjs
-- et re-soumettre au relecteur les lignes de l'étalon que ces entrées comblent —
-- sinon le score continue de les compter « aucune entrée valable » et
-- sous-estime durablement le catalogue (leçon du 10/09).

-- ════════════════════════════════════════════════════════════════════════════
-- A. ENDUIT CHAUX EXTÉRIEUR — le trou le plus cher, et le plus silencieux
-- ════════════════════════════════════════════════════════════════════════════
-- Le catalogue compte DIX entrées d'enduit de façade (grattée, talochée,
-- monocouche, ravalement…) et **aucune ne contient le mot « chaux »**. La seule
-- qui le contient est « Enduit chaux intérieur (tadelakt/stucolustro) ». Toutes
-- les lignes d'enduit chaux extérieur partent donc sur l'intérieur, en confiance
-- haute : 3 lignes, 12 740 €, 3 verdicts affichés sur une référence fausse.
--
-- Ce qui manque précisément est le CORPS D'ENDUIT (couche de dressage), qui se
-- facture à part de la finition. Un enduit traditionnel à la chaux se fait en
-- trois couches : gobetis d'accroche, corps d'enduit, finition.
-- ⚠️ On n'ajoute PAS d'entrée « enduit chaux façade complet » : elle couvrirait
-- les trois couches et ferait paraître bon marché chaque couche facturée seule —
-- exactement le défaut composite/unitaire documenté le 30/08.

INSERT INTO public.market_prices
  (job_type, label, unit, price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht,
   fixed_min_ht, fixed_avg_ht, fixed_max_ht, zip_scope, notes, domain, source,
   metier, nature_prix, room_specific, generic_family, ratio_materiaux, ratio_main_oeuvre)
VALUES
  ('enduit_dressage_chaux', 'Enduit de dressage à la chaux — corps d''enduit (fourni+posé)', 'm2',
   20, 32, 45, 0, 0, 0, 'FR', 'Couche de dressage seule, hors gobetis et hors finition',
   'travaux', 'recherche web 2026-09-11 (expert-ravalement, dictadevi, travaux.com) — enduit chaux complet 50-90 €/m² en trois couches, le corps d''enduit étant la plus épaisse — étalon L152',
   'facade_ravalement', 'fourniture_pose', false, 'enduit_facade', 0.30, 0.65),

-- ════════════════════════════════════════════════════════════════════════════
-- B. ÉLECTRICITÉ DE DÉTAIL — 19 lignes, et DEUX problèmes distincts
-- ════════════════════════════════════════════════════════════════════════════
-- La lecture des 19 lignes sépare deux choses que le mot-clé confondait :
--
-- 1. La SORTIE DE CÂBLE (20 A, 32 A pour plaque de cuisson) : un circuit dédié
--    sans socle de prise. Rien ne la décrit au catalogue ; les lignes partent en
--    no_match ou sur « Raccordements électricité cuisine » (un forfait 120-700 €
--    pour four + plaques + hotte, sans rapport avec une sortie unitaire).
  ('sortie_cable', 'Sortie de câble 20 A / 32 A (fourni+posé)', 'unité',
   50, 90, 150, 0, 0, 0, 'FR', 'Circuit dédié, plaque de cuisson ou appareil fixe',
   'travaux', 'recherche web 2026-09-11 (travaux.com, yoojo — électricien 50-70 €/h, création de point 60-250 €) + cohérence de famille (Ajout prise 60-160, Ajout interrupteur 50-150) — ⚠️ fourchette encadrée, à relire',
   'electricite', 'fourniture_pose', false, 'appareillage_electrique', 0.25, 0.70),

-- 2. Le DCL n'est PAS un trou de prix : « Point lumineux » (70-200 €) le couvre
--    déjà. C'est un trou de VOCABULAIRE — quatre lignes « DCL » à 120 € partent
--    sur « Diagnostic électricité ». On ajoute donc un ALIAS à même fourchette
--    plutôt qu'un concurrent, exactement comme `prise_alias` l'a fait pour
--    « Ajout prise ». ⚠️ Ne jamais s'écarter de la fourchette de l'entrée
--    d'origine : deux valorisations pour le même ouvrage, c'est ce que le projet
--    proscrit et ce qu'on a passé la veille à supprimer.
  ('dcl_alias', 'Point de centre DCL / simple allumage (fourni+posé)', 'unité',
   70, 120, 200, 0, 0, 0, 'FR', 'Boîte DCL, point de centre, simple allumage, va-et-vient',
   'travaux', 'alias de "Point lumineux" (même fourchette) — libellé calqué sur le phrasé réel des devis, cf. prise_alias',
   'electricite', 'fourniture_pose', false, 'point_lumineux', 0.25, 0.70),

-- ════════════════════════════════════════════════════════════════════════════
-- C. COUVERTURE — accessoires et déposes au mètre linéaire
-- ════════════════════════════════════════════════════════════════════════════
-- Le catalogue sait chiffrer une couverture au m² et un faîtage au ml, mais
-- ignore les ACCESSOIRES à l'unité. Résultat : « Fourniture et pose de tuile à
-- douille » est comparée à « Couverture tuile béton » — un tarif de toiture
-- entière appliqué à une tuile.
  ('tuile_chatiere_douille', 'Tuile chatière / tuile à douille (fourni+posé)', 'unité',
   35, 60, 100, 0, 0, 0, 'FR', 'Par accessoire posé, ouverture de couverture comprise',
   'travaux', 'recherche web 2026-09-11 (renovation-toiture — chatière 5-15 € pièce ; couvreur 40-70 €/h) — ⚠️ la pose n''est pas sourcée directement, fourchette large assumée, à relire en priorité',
   'toiture_couverture', 'fourniture_pose', false, 'accessoire_couverture', 0.20, 0.75),

-- La dépose au m² existe depuis le 10/09 ; le relecteur a signalé deux fois que
-- le cas au MÈTRE LINÉAIRE manquait (faîtières, arêtiers, rangées de tuiles),
-- et c'est resté au TODO depuis.
  ('depose_faitage_aretier', 'Dépose de faîtage / arêtier / rangée de tuiles', 'ml',
   12, 18, 25, 0, 0, 0, 'FR', 'Dépose, descente et mise en stock ou évacuation',
   'travaux', 'recherche web 2026-09-11 (billomenaction, prix-travaux-m2 — dépose d''ancien faîtage 15-20 €/ml) — étalon L028/L150',
   'demolition_depose', 'pose_seule', false, 'depose_couverture', 0.05, 0.90),

-- ════════════════════════════════════════════════════════════════════════════
-- D. CLIMATISATION — le groupe extérieur facturé seul
-- ════════════════════════════════════════════════════════════════════════════
-- Dix-neuf entrées de climatisation au catalogue, toutes des systèmes complets
-- ou des unités INTÉRIEURES. Le groupe extérieur facturé à part (4 lignes,
-- 6 676 € dans le stock) ne correspond à aucune.
  ('groupe_exterieur_clim', 'Groupe extérieur de climatisation multi-split (fourni+posé)', 'unité',
   900, 1700, 3200, 0, 0, 0, 'FR', 'Unité extérieure seule, hors unités intérieures',
   'travaux', 'recherche web 2026-09-11 (hellopro, travaux.com — groupe extérieur multisplit 900-3 900 € à l''achat)',
   'cvc_ventilation', 'fourniture_pose', false, 'climatisation', 0.70, 0.25);

-- ── Écartées volontairement ─────────────────────────────────────────────────
-- • Coffret de communication VDI (2 lignes) : le prix de pose n'est pas sourçable
--   et « Coffret GTL gaine technique logement » (150-480 €) couvre un périmètre
--   très proche — le risque de doublon l'emporte sur le gain.
-- • Planelle de coffrage (1 ligne, 809 €) : une occurrence ne fait pas une
--   famille.
-- • Échafaudage : la mesure montre que le catalogue le couvre DÉJÀ et le
--   rapproche correctement — la famille était un faux positif de ma liste.
