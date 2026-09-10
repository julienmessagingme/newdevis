-- 2026-09-10 — POMPE À BÉTON : LA SEULE LIGNE « NON-TRAVAUX » QUI SOIT CHIFFRABLE.
--
-- Sur les six familles de lignes de chantier sans correspondance relevées par
-- l'étalon (livraison, amenée-repli, location, pompe à béton, éco-participation,
-- Dommage-Ouvrage), une seule a un prix de marché constatable : la mise à
-- disposition d'une pompe à béton. Les autres sont écartées par une garde
-- (`estFraisNonChiffrable`) plutôt que tarifées — voir CLAUDE.md.
--
-- Sources (2026-09-10, convergentes) : forfait de mobilisation 300-500 €,
-- amenée 100-450 €, nettoyage du circuit 80-250 €, journée 300-750 € pour une
-- mini-pompe et 650-900 € au-delà de 36 m de flèche. La fourchette retenue
-- couvre la mise à disposition courante, mobilisation et nettoyage compris.
-- Contrôle : la ligne de l'étalon qui l'a motivée facturait ~706 € l'unité.
--
-- ⚠️ Après cette migration : `node scripts/seed_market_prices_embeddings.mjs`
-- puis `node scripts/score-rapprochement.mjs`.

INSERT INTO public.market_prices
  (job_type, label, unit, price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht,
   fixed_min_ht, fixed_avg_ht, fixed_max_ht, zip_scope, notes, domain, source,
   metier, nature_prix, room_specific, generic_family, ratio_materiaux, ratio_main_oeuvre)
VALUES
  ('pompe_beton_mise_a_disposition',
   'Pompe à béton — mise à disposition sur chantier (forfait)', 'forfait',
   0, 0, 0, 300, 550, 900, 'FR',
   'Mobilisation, amenée et nettoyage du circuit compris — hors béton',
   'travaux',
   'recherche web 2026-09-10 (mts-construction, hellopro) — étalon L047',
   'logistique_chantier', 'non_applicable', false, 'pompe_beton', 0.00, 0.00);
