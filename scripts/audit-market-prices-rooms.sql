-- ============================================================================
-- audit-market-prices-rooms.sql
-- ============================================================================
-- AUDIT DU CATALOGUE market_prices — IDENTIFIER LES JOB_TYPES À PIÈCE
--
-- Ce script identifie tous les job_types du catalogue qui contiennent un
-- mot-pièce (cuisine, sdb, chambre, salon, bureau, garage, etc.) afin de
-- décider quels job_types fusionner en versions génériques (Niveau 3 — V3.5).
--
-- Contexte (V3.4.5) :
--   Le système V3.4.5 détecte déjà les room mismatches au moment de l'analyse
--   et bascule les groupes en "Comparaison indicative" (défense en profondeur).
--   Mais la VRAIE SOLUTION DE FOND est de refondre le catalogue pour ne plus
--   avoir de job_types par pièce quand la prestation est identique.
--
-- Usage : copier-coller dans Supabase SQL Editor → exécuter → analyser
-- l'export pour décider quoi fusionner / supprimer / garder.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. LISTE COMPLÈTE des job_types contenant un mot-pièce
-- ─────────────────────────────────────────────────────────────────────────────
-- Permet de voir d'un coup l'ampleur du problème : combien d'identifiants
-- ont un mot-pièce, et à quelle famille de prestations ils appartiennent ?

SELECT
  job_type,
  label,
  unit,
  price_min_unit_ht,
  price_avg_unit_ht,
  price_max_unit_ht,
  CASE
    WHEN job_type ~* '_cuisine'         THEN 'cuisine'
    WHEN job_type ~* '_sdb|_salle_de_bain' THEN 'sdb'
    WHEN job_type ~* '_chambre'         THEN 'chambre'
    WHEN job_type ~* '_salon|_sejour'   THEN 'salon'
    WHEN job_type ~* '_bureau'          THEN 'bureau'
    WHEN job_type ~* '_garage'          THEN 'garage'
    WHEN job_type ~* '_cellier|_buanderie' THEN 'cellier'
    WHEN job_type ~* '_wc|_toilette'    THEN 'wc'
    WHEN job_type ~* '_entree|_hall'    THEN 'entree'
    WHEN job_type ~* '_couloir'         THEN 'couloir'
    WHEN job_type ~* '_terrasse|_balcon|_exterieur' THEN 'exterieur'
    WHEN job_type ~* '_cave|_sous_sol'  THEN 'cave'
    WHEN job_type ~* '_combles|_grenier' THEN 'combles'
    ELSE 'autre'
  END AS piece_detectee
FROM market_prices
WHERE
  job_type ~* '_cuisine|_sdb|_salle_de_bain|_chambre|_salon|_sejour|_bureau|_garage|_cellier|_buanderie|_wc|_toilette|_entree|_hall|_couloir|_terrasse|_balcon|_exterieur|_cave|_sous_sol|_combles|_grenier'
ORDER BY piece_detectee, job_type;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. AGRÉGATION par "famille" — combien de variantes pièce existent par famille ?
-- ─────────────────────────────────────────────────────────────────────────────
-- But : si on a 6 versions ("raccordements_electricite_cuisine",
-- "raccordements_electricite_sdb", "raccordements_electricite_chambre"…) avec
-- des prix SIMILAIRES → fusionner en "raccordements_electricite" générique.
-- Si les prix sont VRAIMENT différents (ex: cuisine premium vs sdb basique) →
-- garder la distinction MAIS s'assurer que le prompt Gemini check le mot-pièce
-- dans les descriptions.

WITH job_types_par_piece AS (
  SELECT
    -- Famille : prefixe avant le mot-pièce (ex: "raccordements_electricite" pour
    -- "raccordements_electricite_cuisine")
    regexp_replace(
      job_type,
      '_(cuisine|sdb|salle_de_bain|salle_de_bains|chambre|salon|sejour|bureau|garage|cellier|buanderie|wc|toilettes|entree|hall|couloir|terrasse|balcon|exterieur|cave|sous_sol|combles|grenier).*$',
      '',
      'i'
    ) AS famille_generique,
    job_type,
    label,
    unit,
    price_min_unit_ht,
    price_avg_unit_ht,
    price_max_unit_ht
  FROM market_prices
  WHERE
    job_type ~* '_cuisine|_sdb|_salle_de_bain|_chambre|_salon|_sejour|_bureau|_garage|_cellier|_buanderie|_wc|_toilette|_entree|_hall|_couloir|_terrasse|_balcon|_exterieur|_cave|_sous_sol|_combles|_grenier'
)
SELECT
  famille_generique,
  COUNT(*) AS nb_variantes,
  string_agg(job_type, ' | ' ORDER BY job_type) AS variantes,
  -- Mesure de dispersion des prix : si CV (coefficient de variation) est faible,
  -- les prix sont similaires → fusionnable. Si élevé (>30%), différencier vraiment.
  ROUND(AVG(price_avg_unit_ht)::numeric, 2)     AS prix_moyen,
  ROUND(STDDEV(price_avg_unit_ht)::numeric, 2)  AS prix_ecart_type,
  CASE
    WHEN AVG(price_avg_unit_ht) > 0
      THEN ROUND((STDDEV(price_avg_unit_ht) / AVG(price_avg_unit_ht) * 100)::numeric, 1)
    ELSE NULL
  END AS coefficient_variation_pct
FROM job_types_par_piece
GROUP BY famille_generique
HAVING COUNT(*) > 1  -- uniquement les familles avec plusieurs variantes par pièce
ORDER BY nb_variantes DESC, famille_generique;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PROPOSITION DE FUSION — familles homogènes (CV < 15%)
-- ─────────────────────────────────────────────────────────────────────────────
-- Ces familles ont des prix tellement similaires entre pièces qu'on peut
-- safe-fusionner en une version générique. Le mot-pièce n'apporte aucune
-- information utile sur le prix.
-- À utiliser comme liste de TODO pour la refonte catalogue.

WITH job_types_par_piece AS (
  SELECT
    regexp_replace(
      job_type,
      '_(cuisine|sdb|salle_de_bain|salle_de_bains|chambre|salon|sejour|bureau|garage|cellier|buanderie|wc|toilettes|entree|hall|couloir|terrasse|balcon|exterieur|cave|sous_sol|combles|grenier).*$',
      '',
      'i'
    ) AS famille_generique,
    price_avg_unit_ht
  FROM market_prices
  WHERE
    job_type ~* '_cuisine|_sdb|_salle_de_bain|_chambre|_salon|_sejour|_bureau|_garage|_cellier|_buanderie|_wc|_toilette|_entree|_hall|_couloir|_terrasse|_balcon|_exterieur|_cave|_sous_sol|_combles|_grenier'
)
SELECT
  famille_generique,
  COUNT(*) AS nb_variantes,
  ROUND(AVG(price_avg_unit_ht)::numeric, 2) AS prix_moyen,
  CASE
    WHEN AVG(price_avg_unit_ht) > 0
      THEN ROUND((STDDEV(price_avg_unit_ht) / AVG(price_avg_unit_ht) * 100)::numeric, 1)
    ELSE NULL
  END AS cv_pct,
  '→ FUSIONNABLE' AS recommandation
FROM job_types_par_piece
GROUP BY famille_generique
HAVING COUNT(*) > 1
   AND (STDDEV(price_avg_unit_ht) / NULLIF(AVG(price_avg_unit_ht), 0) * 100) < 15
ORDER BY nb_variantes DESC;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. PROPOSITION DE FUSION INVERSE — familles vraiment différentes (CV > 30%)
-- ─────────────────────────────────────────────────────────────────────────────
-- Ces familles ont des prix vraiment différents entre pièces (justifié :
-- cuisine premium, chambre basique...). À GARDER en versions distinctes,
-- MAIS le prompt Gemini doit absolument matcher le mot-pièce → c'est ce que
-- fait déjà la RÈGLE ROOM MISMATCH V3.5 dans domain-config.ts.

WITH job_types_par_piece AS (
  SELECT
    regexp_replace(
      job_type,
      '_(cuisine|sdb|salle_de_bain|salle_de_bains|chambre|salon|sejour|bureau|garage|cellier|buanderie|wc|toilettes|entree|hall|couloir|terrasse|balcon|exterieur|cave|sous_sol|combles|grenier).*$',
      '',
      'i'
    ) AS famille_generique,
    price_avg_unit_ht
  FROM market_prices
  WHERE
    job_type ~* '_cuisine|_sdb|_salle_de_bain|_chambre|_salon|_sejour|_bureau|_garage|_cellier|_buanderie|_wc|_toilette|_entree|_hall|_couloir|_terrasse|_balcon|_exterieur|_cave|_sous_sol|_combles|_grenier'
)
SELECT
  famille_generique,
  COUNT(*) AS nb_variantes,
  ROUND(MIN(price_avg_unit_ht)::numeric, 2) AS prix_min,
  ROUND(MAX(price_avg_unit_ht)::numeric, 2) AS prix_max,
  CASE
    WHEN AVG(price_avg_unit_ht) > 0
      THEN ROUND((STDDEV(price_avg_unit_ht) / AVG(price_avg_unit_ht) * 100)::numeric, 1)
    ELSE NULL
  END AS cv_pct,
  '→ DIFFÉRENCIATION JUSTIFIÉE — Gemini doit matcher la pièce' AS recommandation
FROM job_types_par_piece
GROUP BY famille_generique
HAVING COUNT(*) > 1
   AND (STDDEV(price_avg_unit_ht) / NULLIF(AVG(price_avg_unit_ht), 0) * 100) > 30
ORDER BY cv_pct DESC;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ZONE GRISE (CV entre 15% et 30%) — analyser au cas par cas
-- ─────────────────────────────────────────────────────────────────────────────

WITH job_types_par_piece AS (
  SELECT
    regexp_replace(
      job_type,
      '_(cuisine|sdb|salle_de_bain|salle_de_bains|chambre|salon|sejour|bureau|garage|cellier|buanderie|wc|toilettes|entree|hall|couloir|terrasse|balcon|exterieur|cave|sous_sol|combles|grenier).*$',
      '',
      'i'
    ) AS famille_generique,
    job_type,
    price_avg_unit_ht
  FROM market_prices
  WHERE
    job_type ~* '_cuisine|_sdb|_salle_de_bain|_chambre|_salon|_sejour|_bureau|_garage|_cellier|_buanderie|_wc|_toilette|_entree|_hall|_couloir|_terrasse|_balcon|_exterieur|_cave|_sous_sol|_combles|_grenier'
)
SELECT
  famille_generique,
  COUNT(*) AS nb_variantes,
  string_agg(job_type || ' (' || ROUND(price_avg_unit_ht::numeric, 0) || '€)', ' | ' ORDER BY job_type) AS variantes_detail,
  ROUND(MIN(price_avg_unit_ht)::numeric, 0) AS prix_min,
  ROUND(MAX(price_avg_unit_ht)::numeric, 0) AS prix_max,
  CASE
    WHEN AVG(price_avg_unit_ht) > 0
      THEN ROUND((STDDEV(price_avg_unit_ht) / AVG(price_avg_unit_ht) * 100)::numeric, 1)
    ELSE NULL
  END AS cv_pct,
  '⚠️ À ARBITRER manuellement' AS recommandation
FROM job_types_par_piece
GROUP BY famille_generique
HAVING COUNT(*) > 1
   AND (STDDEV(price_avg_unit_ht) / NULLIF(AVG(price_avg_unit_ht), 0) * 100) BETWEEN 15 AND 30
ORDER BY famille_generique;
