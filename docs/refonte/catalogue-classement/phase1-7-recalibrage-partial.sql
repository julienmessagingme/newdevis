-- ============================================================================
-- Phase 1.7 — Recalibrage fourchettes catalogue market_prices (2026-07-03)
-- ============================================================================
-- Source : docs/refonte/catalogue-classement/RAPPORT-RECALIBRAGE.md
-- Généré par : scripts/phase1-7-recalibrage-fourchettes.ts (349 analyses)
--
-- Sur les 9 flags rouges et 1 flag orange remontés, on n'applique que 2
-- corrections aujourd'hui — les 7 autres sont probablement des artefacts du
-- bug forfait fixé le même jour dans V3.5.2 (voir commit 6aa4034 :
-- market-matcher-vectorial.ts fallback main_unit=forfait au lieu de "m²"
-- quand Gemini n'extrait pas d'unité).
--
-- Décision : appliquer les 2 corrections fiables + relancer le script dans
-- 3 semaines après ~50 nouvelles analyses post-V3.5.2 pour un audit propre.
--
-- Idempotent : rejouable sans effet secondaire.
-- ============================================================================

-- ── Correction #1 — carrelage_sol_pose (id=17) ─────────────────────────────
-- Contexte : catalogue actuel [35, 55, 90] €/m² pour la pose seule (hors
-- fourniture) ne colle pas aux prix réels observés sur 12 devis (médiane
-- 80 €/m², écart +45%).
-- Diagnostic : n=12 est statistiquement suffisant. 80 €/m² pour la pose seule
-- est plausible (zones tendues IDF/PACA). Le catalogue actuel est sous-évalué
-- sans être aberrant. Ajustement modéré (moins large que la proposition brute
-- du script [35, 125]) : on remonte la médiane et le max, on garde un min
-- proche de l'ancien pour les zones détendues.
--
-- Avant  : min=35, avg=55, max=90
-- Après  : min=40, avg=65, max=100
UPDATE public.market_prices SET
  price_min_unit_ht = 40,
  price_avg_unit_ht = 65,
  price_max_unit_ht = 100
WHERE id = 17;

-- ── Correction #2 — ecran_sous_toiture HPV (id=746, zone orange) ──────────
-- Contexte : catalogue actuel [6, 16] €/m² pour l'écran HPV fourni+posé.
-- Observé Q1-Q3 [10.20, 30.75] : la fourchette catalogue EXCLUT carrément
-- la zone observée (n=3, faible mais structurel).
-- Diagnostic : écran HPV à 6-16 €/m² c'est trop bas pour la vraie qualité HPV
-- ("Haute Perméabilité à la Vapeur", classe R1 obligatoire), qui coûte plutôt
-- 15-30 €/m² fourni+posé sur les prix actuels. On élargit la fourchette pour
-- couvrir la vraie zone du marché.
--
-- Avant  : min=6, avg=16 (max non spécifié dans le catalogue actuel)
-- Après  : min=8, avg=18, max=32
UPDATE public.market_prices SET
  price_min_unit_ht = 8,
  price_avg_unit_ht = 18,
  price_max_unit_ht = 32
WHERE id = 746;

-- ============================================================================
-- FLAGS REJETÉS (7 rouges) — pour trace + relance dans 3 semaines
-- ============================================================================
--
-- #725 carrelage_sdb_etancheite (n=3, médiane 5300 €/m²)
--   CAS D'ÉCOLE du bug forfait V3.5.2. 5300 €/m² pour du carrelage c'est
--   impossible physiquement — un forfait "SDB complète 5300€" a été compté
--   comme "1 m² à 5300€". Corrigé par V3.5.2 dans market-matcher-vectorial.
--   Catalogue actuel [55, 95, 170] est correct.
--
-- #41 demolition_cloison (n=10, médiane 80 €/m², Q3=1197 €/m²)
--   Q3 à 1197 €/m² = forfait démolition entière compté comme 1 m². Bug forfait.
--   Catalogue actuel [15, 30, 60] est correct.
--
-- #143 peinture_plafond (n=7, médiane 10 €/m²)
-- #141 peinture_murs (n=5, médiane 7 €/m²)
-- #138 peinture_boiseries (n=4, médiane 3 €/ml)
--   Toutes les médianes basses = probablement fourniture seule (pot de peinture)
--   comptée comme prestation posée. Le catalogue est pour fourni+posé et est
--   correct. Alternative propre = créer des entrées séparées _fourniture_seule
--   dans le catalogue (autre discussion, enrichissement).
--
-- #793 isolation_iti_laine_de_verre (n=4, médiane 28 €/m²)
--   28 €/m² pour ITI fourni+posé possible sur bas de marché, mais n=4 trop
--   faible pour recalibrer. Remettre en observation.
--
-- #144 peinture_porte (n=5, médiane 164 €/U, Q3=8350)
--   Q3 à 8350 €/porte = outlier extraction. Ecart réel probable (164 vs 120)
--   mais n=5 trop faible. Remettre en observation.
--
-- #771 peinture_sdb_humide (n=3, médiane 80 €/m², écart +300%)
--   Croisement postes-surfactures.json : ce poste est déjà #2 des plus
--   surfacturés. Peut être vraie surfacturation OU forfait mal compté.
--   n=3 trop faible pour trancher. Remettre en observation.
--
-- ============================================================================
-- PROCHAINE ÉTAPE
-- ============================================================================
--
-- 1. Attendre ~50 nouvelles analyses post-V3.5.2 (3 semaines environ)
-- 2. Relancer : npx tsx scripts/phase1-7-recalibrage-fourchettes.ts
-- 3. Les flags forfait (725, 41, 771) devraient disparaître ou converger vers
--    des valeurs raisonnables.
-- 4. Les flags "fourniture-vs-fourniture+pose" (143, 141, 138) resteront tant
--    qu'on n'a pas d'entrées catalogue séparées.
--
-- ============================================================================
