-- ============================================================================
-- V3.5.8 (2026-06-02) — Enrichissement catalogue market_prices : gros œuvre
-- ============================================================================
--
-- CONTEXTE
-- --------
-- Bug observé sur devis "reno bois colombe.pdf" (TLC Construction, rénovation
-- maison) : 3 anomalies prix sur 4 étaient des FAUX POSITIFS dus à un matching
-- vectoriel imprécis sur des postes structurels gros œuvre :
--
--   • "Plancher poutrelles hourdis béton avec étaiement+coffrage+ferraillage+coulage"
--     170 €/m² → matché à `ragreage_epais` (32-80 €/m²) → fausse anomalie +6 300 €.
--     Or 170 €/m² est dans la fourchette NORMALE pour un plancher hourdis complet
--     (80-200 €/m² selon portée et complexité).
--
--   • "Charpente fermette industrielle (pannes, chevrons, arbalétriers, entraits,
--     jambes de force, contreventements, assemblages et ferrures)" 680 €/U
--     → matché à un €/U générique 35-80 → fausse anomalie +2 400 €.
--     Or une charpente fermette se compte par unité de fermette (200-600 €/U
--     selon portée 6-12m), ou par m² de toiture (60-130 €/m²).
--
-- Le matching vectoriel V3.5 marche bien quand le catalogue couvre la
-- prestation. Quand la prestation n'a pas d'entrée dédiée, il tombe sur
-- l'entrée la plus proche sémantiquement — qui peut être à un ordre de
-- grandeur en dessous.
--
-- COUVERTURE (8 entrées)
-- ----------------------
-- Plancher béton armé (3 variantes) :
--   1. Plancher poutrelles hourdis béton complet (étaiement + coffrage +
--      ferraillage + coulage) — RDC ou intermédiaire
--   2. Plancher dalle pleine BA RDC sur vide sanitaire
--   3. Plancher prédalles béton armé (industriel)
--
-- Charpente fermette industrielle (3 variantes) :
--   4. Fermette industrielle au m² de toiture (fourni+posé)
--   5. Fermette industrielle au ml de fermette (fourni+posé)
--   6. Fermette industrielle à l'unité (4-8m portée standard)
--
-- Compléments gros œuvre fréquents (2 entrées) :
--   7. Dalle béton intérieure brute (chape légère, non armée)
--   8. Pré-mur béton préfabriqué (vertical)
--
-- ⚠️ APRÈS APPLICATION : il faut RE-EMBED ces 8 nouvelles entrées via
--    `node scripts/seed_market_prices_embeddings.mjs` (script idempotent —
--    n'embed que les rows où `embedding IS NULL`). Sans cet embed, le matcher
--    vectoriel ne pourra pas les retrouver via similarity search.
--
-- Sources fourchettes 2026 :
--   - Capeb / FFB observations BTP 2025
--   - Référentiels APCMA / Hexabat / Travaux.com
--   - Données chantiers VMD 2026 (devis rénovation maison analysés)
-- ============================================================================

-- Resynchroniser la séquence AVANT toute insertion (id SERIAL)
SELECT setval(
  pg_get_serial_sequence('market_prices', 'id'),
  GREATEST((SELECT MAX(id) FROM market_prices), 1),
  true
);

INSERT INTO public.market_prices
  (job_type, label, unit,
   price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht,
   fixed_min_ht, fixed_avg_ht, fixed_max_ht,
   zip_scope, notes, domain)
VALUES

-- ============================================================
-- PLANCHERS BÉTON ARMÉ — gros œuvre étage
-- ============================================================
-- Avant : "ragreage_epais" (32-80 €/m²) attiré tout matching contenant
-- "dalle béton" ou "plancher" → ratio ×2-3 → fausse anomalie systématique.

-- 1. PLANCHER POUTRELLES HOURDIS COMPLET — le plus fréquent en rénovation
-- Inclut : étaiement, coffrage de rive, ferraillage de la dalle de compression,
-- pose poutrelles + hourdis, coulage béton 4-5 cm de compression, finition.
-- Variante haute : portée > 5m, ferraillage renforcé, chape épaisse.
('plancher_poutrelles_hourdis_complet',  'Plancher poutrelles + hourdis béton complet (étaiement + coffrage + ferraillage + coulage)', 'm2', 100, 145, 200, 0, 0, 0, 'FR', 'Plancher étage (haut RDC ou intermédiaire). Inclut tous les postes gros œuvre. Hors gaines techniques.', 'travaux'),

-- 2. DALLE BA PLEINE sur vide sanitaire ou terre-plein (RDC)
-- Inclut : préparation forme, polyane, ferraillage, coulage 12-15 cm.
-- Souvent moins cher que poutrelles+hourdis car moins de coffrage.
('plancher_dalle_ba_pleine_rdc',         'Dalle béton armée pleine RDC sur vide sanitaire / terre-plein', 'm2',  85, 120, 165, 0, 0, 0, 'FR', 'Inclut polyane + ferraillage + coulage. Hors VRD et isolation sous-dalle.', 'travaux'),

-- 3. PRÉDALLES INDUSTRIELLES (béton armé préfa)
-- Pour grands chantiers / planchers étage avec portée importante.
('plancher_predalles_beton_arme',        'Plancher prédalles béton armé préfabriquées (pose + coulage compression)', 'm2',  95, 135, 185, 0, 0, 0, 'FR', 'Plancher industriel. Inclut pose + coulage compression. Hors étaiement provisoire.', 'travaux'),


-- ============================================================
-- CHARPENTE FERMETTE INDUSTRIELLE — 3 variantes (m² / ml / U)
-- ============================================================
-- Avant : pas d'entrée dédiée → matching tombait sur "charpente_taux_horaire"
-- ou similaire à €/U non comparable. Les 3 variantes ci-dessous permettent un
-- match précis selon la façon dont l'artisan facture (par fermette unitaire,
-- par ml linéaire de toiture, ou par m² de surface couverte).

-- 4. CHARPENTE FERMETTE INDUSTRIELLE au m² de toiture (fourni+posé) — le plus courant
-- Inclut : fermettes en bois traité classe 2, contreventements, sabots métalliques,
-- pose, livraison. Hors : couverture, isolation, écran sous-toiture.
('charpente_fermette_m2_fourni_pose',    'Charpente fermette industrielle au m² de toiture (fourni + posé, hors couverture)', 'm2',  60,  90, 130, 0, 0, 0, 'FR', 'Fermettes bois traité + contreventements + sabots + pose. Hors couverture et isolation.', 'travaux'),

-- 5. CHARPENTE FERMETTE INDUSTRIELLE au ml (fourni+posé) — facturation par fermette linéaire
-- Pour les artisans qui facturent au mètre linéaire de fermette (= portée × nb fermettes).
('charpente_fermette_ml_fourni_pose',    'Charpente fermette industrielle au ml (fourni + posé)', 'ml',  50,  90, 150, 0, 0, 0, 'FR', 'Variante facturation ml. Bois classe 2 + contreventements + pose.', 'travaux'),

-- 6. CHARPENTE FERMETTE INDUSTRIELLE à l'unité (par fermette)
-- Pour les devis qui facturent par fermette individuelle (courant sur petites
-- maisons type pavillon 6-12m de portée).
('charpente_fermette_unite_fourni_pose', 'Charpente fermette industrielle à l''unité (4-12 m de portée)', 'u', 200, 400, 600, 0, 0, 0, 'FR', 'Une fermette complète (bois + sabots + pose). Portée 4-12m standard.', 'travaux'),


-- ============================================================
-- COMPLÉMENTS GROS ŒUVRE FRÉQUENTS
-- ============================================================

-- 7. DALLE BÉTON INTÉRIEURE BRUTE — chape de mise à niveau, non porteuse
-- Pour finition de sol (avant carrelage/parquet). Souvent confondu avec
-- les planchers porteurs ci-dessus → distinction nécessaire dans le catalogue.
('dalle_beton_finition_chape_legere',    'Dalle béton intérieure non porteuse (chape légère ≤ 5 cm)', 'm2',  35,  55,  85, 0, 0, 0, 'FR', 'Chape de mise à niveau / finition. Hors ragréage et hors plancher porteur.', 'travaux'),

-- 8. PRÉ-MUR BÉTON PRÉFABRIQUÉ — élément vertical
-- Murs porteurs préfabriqués (banchage industriel). Différent du parpaing
-- traditionnel ou du béton banché coulé sur place.
('mur_beton_premur_prefabrique',         'Pré-mur béton préfabriqué (industriel)', 'm2',  85, 125, 175, 0, 0, 0, 'FR', 'Pose + coulage + ferraillage. Hors finition intérieure.', 'travaux');


-- ============================================================
-- POST-INSTALLATION
-- ============================================================
-- Vérifier après application :
--   SELECT job_type, label, unit, price_min_unit_ht, price_max_unit_ht
--   FROM market_prices
--   WHERE job_type LIKE 'plancher_%' OR job_type LIKE 'charpente_fermette_%'
--      OR job_type IN ('dalle_beton_finition_chape_legere', 'mur_beton_premur_prefabrique');
--   → 8 rows attendues
--
--   SELECT COUNT(*) FROM market_prices WHERE embedding IS NULL;
--   → 8 attendues (les nouvelles, à embed via le script seed)
--
-- Puis lancer côté CLI :
--   node scripts/seed_market_prices_embeddings.mjs
--   → embed les 8 nouvelles entrées via Gemini gemini-embedding-001
--   → idempotent (n'embed que les NULL)
--
-- ============================================================================
