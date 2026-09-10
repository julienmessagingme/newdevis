-- 2026-09-10 — HUIT ENTRÉES DÉSIGNÉES PAR L'ÉTALON, ET DEUX DOUBLONS TRANCHÉS.
--
-- Origine : la relecture des 150 lignes (`match_gold_standard`) a montré que
-- **42 des 77 lignes de consensus n'ont AUCUNE entrée valable au catalogue**.
-- Ces huit-là sont les manques que les deux juges ont confirmés ET qui se
-- répètent — pas une liste d'idées, une liste de trous constatés.
--
-- ⚠️ RÈGLE DU PROJET : une fourchette se SOURCE, jamais ne se déduit de nos
-- propres devis — ce serait circulaire. Chaque entrée porte sa provenance dans
-- `source`. Les fourchettes ci-dessous viennent de guides de prix publics
-- consultés le 2026-09-10 et convergents entre eux ; elles restent à relire par
-- Julien (`last_reviewed_at` volontairement laissé NULL).
--
-- ⚠️ UN INSERT NE SUFFIT PAS. Sans embedding, l'entrée existe mais reste
-- INTROUVABLE par la recherche vectorielle. Après cette migration :
--     node scripts/seed_market_prices_embeddings.mjs
--     node scripts/score-rapprochement.mjs
-- La seconde commande vérifie qu'on a gagné sans rien casser.

-- ── A. Couverture / zinguerie ───────────────────────────────────────────────
-- Le catalogue n'avait que le zinc et le PVC ; l'aluminium est apparu deux fois
-- dans la relecture, à chaque fois sans aucune correspondance possible.

INSERT INTO public.market_prices
  (job_type, label, unit, price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht,
   fixed_min_ht, fixed_avg_ht, fixed_max_ht, zip_scope, notes, domain, source,
   metier, nature_prix, room_specific, generic_family, ratio_materiaux, ratio_main_oeuvre)
VALUES
  ('gouttiere_aluminium', 'Gouttière aluminium (fourni+posé)', 'ml',
   45, 72, 105, 0, 0, 0, 'FR', 'Profilé alu laqué, pose sur crochets',
   'travaux', 'recherche web 2026-09-10 (travaux.com, allotoiture) — étalon L064/L098',
   'toiture_couverture', 'fourniture_pose', false, 'gouttiere', 0.35, 0.60),

  ('couvertine_aluminium', 'Couvertine aluminium sur mur ou acrotère (fourni+posé)', 'ml',
   50, 72, 100, 0, 0, 0, 'FR', 'Développé standard, teinte RAL courante',
   'travaux', 'recherche web 2026-09-10 (tb-renovation, prix-travaux-m2) — étalon L061',
   'toiture_couverture', 'fourniture_pose', false, 'couvertine', 0.40, 0.55),

  ('liteaunage_toiture', 'Liteaunage et contre-liteaunage de toiture (fourni+posé)', 'm2',
   15, 30, 50, 0, 0, 0, 'FR', 'Liteaux bois traités, pose par couvreur',
   'travaux', 'recherche web 2026-09-10 (travaux.com) — étalon L015',
   'toiture_couverture', 'fourniture_pose', false, 'liteaunage', 0.30, 0.65),

-- ── B. Déposes ──────────────────────────────────────────────────────────────
-- Le catalogue comptait 18 entrées de dépose (sols, cloisons, cuisine, clôture)
-- mais RIEN pour la couverture ni les sanitaires. Cinq lignes de l'étalon sont
-- tombées dans ce trou, et le relecteur l'a nommé cinq fois : « c'est une
-- dépose, aucun candidat n'en est une ».

  ('depose_couverture_tuiles', 'Dépose de couverture (tuiles, liteaux) et évacuation', 'm2',
   20, 25, 30, 0, 0, 0, 'FR', 'Dépose + descente + évacuation en déchetterie',
   'travaux', 'recherche web 2026-09-10 (travaux.com, ootravaux) — étalon L028/L150',
   'demolition_depose', 'pose_seule', false, 'depose_couverture', 0.05, 0.90),

  -- ⚠️ La moins sûre des huit : les sources publiques donnent surtout des prix
  -- de dépannage TTC, très dispersés (200 à 400 € pour un WC). Fourchette large
  -- assumée, à relire en priorité.
  ('depose_appareil_sanitaire', 'Dépose d''appareil sanitaire (WC, lavabo, receveur, baignoire)', 'unité',
   80, 170, 300, 0, 0, 0, 'FR', 'Par appareil, dépose et évacuation — fourchette à confirmer',
   'travaux', 'recherche web 2026-09-10 (ondemolitout, demarrezlestravaux) — étalon L007/L051/L141',
   'demolition_depose', 'pose_seule', false, 'depose_sanitaire', 0.05, 0.90),

-- ── C. Menuiserie avec volet roulant intégré ────────────────────────────────
-- Deux lignes de l'étalon, deux fois le même motif de refus : « aucun candidat
-- n'inclut le volet roulant intégré ». Comparer un bloc menuiserie + volet au
-- tarif d'une fenêtre nue fabrique un faux écart à chaque fois.

  ('fenetre_pvc_volet_roulant_integre', 'Fenêtre PVC avec volet roulant intégré (fourni+posé)', 'unité',
   700, 1150, 1800, 0, 0, 0, 'FR', 'Bloc-baie monobloc, manuel ou électrique',
   'travaux', 'recherche web 2026-09-10 (travaux.com, espace-construction) — étalon L130',
   'menuiserie_vitrages', 'fourniture_pose', false, 'fenetre_volet_integre', 0.60, 0.35),

  ('porte_fenetre_pvc_volet_roulant_integre', 'Porte-fenêtre PVC avec volet roulant intégré (fourni+posé)', 'unité',
   1150, 1800, 2800, 0, 0, 0, 'FR', 'Bloc-baie monobloc, manuel ou électrique',
   'travaux', 'recherche web 2026-09-10 (travaux.com, espace-construction) — étalon L058',
   'menuiserie_vitrages', 'fourniture_pose', false, 'fenetre_volet_integre', 0.60, 0.35),

-- ── D. Attestation Consuel ──────────────────────────────────────────────────
-- La seule entrée du catalogue dont le prix est PUBLIC et exact : tarifs 2026
-- du Consuel — 76,37 € (vert, locaux pro), 144,67 € (jaune, habitation),
-- 233,62 € (contre-visite). Sur la ligne de l'étalon, l'artisan facturait 170 €
-- l'unité : une marge légitime, mais désormais vérifiable.

  ('attestation_consuel', 'Attestation de conformité électrique Consuel', 'unité',
   77, 145, 235, 0, 0, 0, 'FR', 'Tarifs publics 2026 : vert 76,37 / jaune 144,67 / contre-visite 233,62',
   'travaux', 'tarif public Consuel 2026 (jechange, fournisseurs-electricite) — étalon L021',
   'electricite', 'non_applicable', false, 'attestation_consuel', 0.00, 0.00);

-- ── E. Les deux doublons, tranchés ──────────────────────────────────────────
--
-- Détectés en comparant les libellés à périmètre et unité égaux : deux entrées
-- décrivaient la même chose avec des fourchettes incompatibles. Selon celle que
-- la recherche vectorielle retenait, le verdict changeait — « deux valorisations
-- pour la même chose », ce que le projet proscrit.

-- Semelle filante : les sources convergent sur 80-200 €/ml (terrassement, béton
-- armé, ferraillage et main-d'œuvre compris). L'entrée à 180-520 décrivait des
-- fondations profondes ou complexes, pas le cas courant — c'est elle qui part.
-- ⚠️ C'est pourtant la PLUS utilisée du stock (3 rapprochements contre 1) :
-- l'usage ne fait pas la justesse.
DELETE FROM public.market_prices WHERE job_type = 'fondation_semelle_filante';

-- Écran de sous-toiture : ni 8-32 ni 5-14 ne correspondaient aux sources
-- (5 à 20 €/m²). On garde une seule entrée, recalée, et on supprime l'autre —
-- qui n'était utilisée nulle part dans le stock.
UPDATE public.market_prices
   SET price_min_unit_ht = 6, price_avg_unit_ht = 12, price_max_unit_ht = 20,
       source = 'recalé 2026-09-10 (travaux.com) — fusion de deux entrées divergentes',
       last_reviewed_at = NULL
 WHERE job_type = 'ecran_sous_toiture';
DELETE FROM public.market_prices WHERE job_type = 'ecran_de_sous_toiture_hpv';
