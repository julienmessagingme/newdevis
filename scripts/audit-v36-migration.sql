-- ============================================================================
-- audit-v36-migration.sql
-- ============================================================================
-- Audit POST-MIGRATION du seed `room_specific` / `required_room` / `generic_family`
-- pour détecter une sur-classification (alerte si >25% du catalogue est marqué
-- room_specific=true).
--
-- À EXÉCUTER après la migration 20260512000000_market_prices_v36_room_specific.sql
-- pour valider que le seed n'a pas été trop agressif.
--
-- Whitelist conservative (cas RÉELLEMENT dépendants d'une pièce) :
--   OK : cuisine équipée, plomberie SDB, PAC en local technique
--   PAS OK : prises, éclairage, tableau électrique, moulures, peinture simple
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. STATISTIQUES GLOBALES — alerte si trop de room_specific
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  COUNT(*) AS total_entries,
  SUM(CASE WHEN room_specific THEN 1 ELSE 0 END) AS room_specific_count,
  ROUND(100.0 * SUM(CASE WHEN room_specific THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS room_specific_pct,
  COUNT(DISTINCT generic_family) AS distinct_families,
  CASE
    WHEN 100.0 * SUM(CASE WHEN room_specific THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) > 25
      THEN '🚨 ALERTE: > 25% du catalogue est room_specific → SUR-CLASSIFICATION probable'
    WHEN 100.0 * SUM(CASE WHEN room_specific THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) > 15
      THEN '⚠️ ATTENTION: 15-25% du catalogue est room_specific → à vérifier'
    ELSE '✅ OK: < 15% du catalogue est room_specific'
  END AS verdict
FROM market_prices;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RÉPARTITION room_specific PAR DOMAIN
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  domain,
  COUNT(*) AS total,
  SUM(CASE WHEN room_specific THEN 1 ELSE 0 END) AS room_specific,
  ROUND(100.0 * SUM(CASE WHEN room_specific THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS pct
FROM market_prices
GROUP BY domain
ORDER BY pct DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TOP FAMILLES GÉNÉRIQUES par nombre de variants
-- ─────────────────────────────────────────────────────────────────────────────
-- Si une famille a beaucoup de variants (5+ par pièce) avec des prix similaires,
-- c'est un candidat fort à la fusion (Niveau 3 catalogue).

SELECT
  generic_family,
  COUNT(*) AS variants_count,
  STRING_AGG(job_type, ' | ' ORDER BY job_type) AS variants,
  ROUND(AVG(price_avg_unit_ht)::numeric, 2) AS avg_price,
  CASE
    WHEN AVG(price_avg_unit_ht) > 0
      THEN ROUND((STDDEV(price_avg_unit_ht) / AVG(price_avg_unit_ht) * 100)::numeric, 1)
    ELSE NULL
  END AS cv_pct,
  CASE
    WHEN AVG(price_avg_unit_ht) > 0
     AND STDDEV(price_avg_unit_ht) / AVG(price_avg_unit_ht) < 0.15
      THEN '→ FUSIONNABLE (prix similaires)'
    WHEN AVG(price_avg_unit_ht) > 0
     AND STDDEV(price_avg_unit_ht) / AVG(price_avg_unit_ht) > 0.30
      THEN '→ GARDER variants (prix vraiment différents)'
    ELSE '→ À ARBITRER'
  END AS recommendation
FROM market_prices
WHERE generic_family IS NOT NULL
GROUP BY generic_family
HAVING COUNT(*) > 1
ORDER BY variants_count DESC, generic_family;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ALERTES — entrées probablement marquées room_specific à tort
-- ─────────────────────────────────────────────────────────────────────────────
-- Liste les job_types marqués room_specific=true mais qui contiennent des
-- termes neutres habituellement non dépendants de la pièce :
--   - prise, interrupteur, fil, câble, tableau, disjoncteur, moulure
--   - peinture (sans qualificatif premium)
--   - éclairage générique

SELECT
  job_type,
  label,
  required_room,
  generic_family,
  '🚨 Probablement à reclasser room_specific=FALSE' AS alert
FROM market_prices
WHERE room_specific = TRUE
  AND (
    job_type ~* 'prise|interrupteur|moulure|tableau|disjoncteur'
    OR job_type ~* 'peinture' AND job_type !~* '_premium|_haut_de_gamme'
    OR job_type ~* 'eclairage_(simple|standard|basique)'
    OR label ~* 'prise|interrupteur|moulure|tableau électrique|disjoncteur'
  )
ORDER BY job_type;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. SCRIPT DE CORRECTION (à exécuter manuellement APRÈS validation)
-- ─────────────────────────────────────────────────────────────────────────────
-- Ne décommenter et exécuter QUE si la requête #4 confirme une sur-classification.

-- UPDATE market_prices
-- SET room_specific = FALSE,
--     required_room = NULL,
--     generic_family = job_type
-- WHERE room_specific = TRUE
--   AND (
--     job_type ~* 'prise|interrupteur|moulure|tableau|disjoncteur'
--     OR job_type ~* 'peinture' AND job_type !~* '_premium|_haut_de_gamme'
--   );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. VALIDATION WHITELIST conservatrice
-- ─────────────────────────────────────────────────────────────────────────────
-- Liste les job_types qui DOIVENT rester room_specific=true (whitelist métier) :

SELECT
  job_type,
  label,
  required_room,
  '✅ Cas légitime room_specific' AS status
FROM market_prices
WHERE room_specific = TRUE
  AND (
    job_type ~* 'cuisine_(equipee|amenagement|complete|haut_de_gamme)'
    OR job_type ~* 'plomberie_(sdb|salle_de_bain|salle_d_eau)'
    OR job_type ~* 'pac_(local_technique|exterieur)'
    OR job_type ~* 'sanitaire_sdb|douche_italienne|baignoire'
    OR label ~* 'cuisine équipée|salle de bain complète|local technique'
  )
ORDER BY job_type;
