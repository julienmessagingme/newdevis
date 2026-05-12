-- ============================================================================
-- kpi-shadow-v36.sql
-- ============================================================================
-- KPI de validation V3.6 SHADOW MODE (PHASE 6 cahier des charges)
--
-- Les logs [V36_SHADOW] sont émis par l'edge function `analyze-quote` au
-- format JSON et persistés dans Supabase Logs. Pour calculer les KPI, il
-- faut soit :
--   (a) parser les logs depuis le dashboard Supabase Functions Logs UI
--   (b) construire une table d'observation `v36_shadow_observations` et
--       y insérer chaque comparaison (recommandé pour > 100 analyses)
--
-- Ce script propose le SCHÉMA et les QUERIES KPI.
-- Implémentation (b) recommandée pour scaling.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TABLE D'OBSERVATION (si pas encore créée)
-- ─────────────────────────────────────────────────────────────────────────────
-- À créer une fois si on veut persister les comparaisons V3.5/V3.6.
-- Sinon parsing des logs Supabase Functions suffit pour les 100 premières analyses.

CREATE TABLE IF NOT EXISTS v36_shadow_observations (
  id                       BIGSERIAL PRIMARY KEY,
  analysis_id              UUID NOT NULL,
  group_label              TEXT,
  items_overlap            INTEGER,
  -- V3.5 (legacy, visible utilisateur)
  legacy_job_type          TEXT,
  legacy_job_type_label    TEXT,
  -- V3.6 (shadow)
  v36_signature_domain     TEXT,
  v36_signature_subcategory TEXT,
  v36_signature_room       TEXT,
  v36_signature_unit       TEXT,
  v36_signature_invalid    BOOLEAN DEFAULT FALSE,
  v36_matched_job_type     TEXT,
  v36_match_strategy       TEXT,           -- exact / indicative / fuzzy_fallback / no_match / rejected_room_mismatch / invalid_signature
  v36_confidence           INTEGER,        -- /100
  -- Diff
  same_match               BOOLEAN,
  v36_has_match            BOOLEAN,
  legacy_has_match         BOOLEAN,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v36_shadow_analysis_id ON v36_shadow_observations(analysis_id);
CREATE INDEX IF NOT EXISTS idx_v36_shadow_created_at  ON v36_shadow_observations(created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. KPI CORE — calculés sur les N dernières observations
-- ─────────────────────────────────────────────────────────────────────────────
-- Période par défaut : 7 derniers jours. Ajuster selon besoin.
--
-- Cible (PHASE 6 cahier des charges) :
--   coverage_match_rate   > 80%
--   no_match_rate         < 20%
--   verdict_delta_rate    < 15%
--
-- → Sinon rollback (mettre MARKET_MATCHER_V36=false dans Supabase Functions env).

WITH stats AS (
  SELECT
    COUNT(*) AS total_comparisons,
    COUNT(DISTINCT analysis_id) AS distinct_analyses,
    -- Coverage = V3.6 a un match (matched=true)
    SUM(CASE WHEN v36_has_match THEN 1 ELSE 0 END) AS v36_matches,
    SUM(CASE WHEN NOT v36_has_match THEN 1 ELSE 0 END) AS v36_no_matches,
    -- Same match V3.5 vs V3.6 (groupes équivalents)
    SUM(CASE WHEN same_match THEN 1 ELSE 0 END) AS same_match_count,
    -- V3.6 a trouvé un match là où V3.5 n'avait rien
    SUM(CASE WHEN v36_has_match AND NOT legacy_has_match THEN 1 ELSE 0 END) AS v36_recoveries,
    -- V3.6 a rien trouvé là où V3.5 avait un match (régression potentielle)
    SUM(CASE WHEN NOT v36_has_match AND legacy_has_match THEN 1 ELSE 0 END) AS v36_regressions,
    -- Signatures invalides (rejetées par enums)
    SUM(CASE WHEN v36_signature_invalid THEN 1 ELSE 0 END) AS invalid_signatures,
    -- Stratégies
    SUM(CASE WHEN v36_match_strategy = 'exact' THEN 1 ELSE 0 END) AS strat_exact,
    SUM(CASE WHEN v36_match_strategy = 'indicative' THEN 1 ELSE 0 END) AS strat_indicative,
    SUM(CASE WHEN v36_match_strategy = 'fuzzy_fallback' THEN 1 ELSE 0 END) AS strat_fuzzy,
    SUM(CASE WHEN v36_match_strategy = 'rejected_room_mismatch' THEN 1 ELSE 0 END) AS strat_rejected_room,
    AVG(v36_confidence) AS avg_confidence
  FROM v36_shadow_observations
  WHERE created_at > NOW() - INTERVAL '7 days'
)
SELECT
  total_comparisons,
  distinct_analyses,
  ROUND(100.0 * v36_matches / NULLIF(total_comparisons, 0), 1) AS coverage_match_rate_pct,
  ROUND(100.0 * v36_no_matches / NULLIF(total_comparisons, 0), 1) AS no_match_rate_pct,
  ROUND(100.0 * same_match_count / NULLIF(total_comparisons, 0), 1) AS same_match_rate_pct,
  ROUND(100.0 * v36_recoveries / NULLIF(total_comparisons, 0), 1) AS v36_recovery_pct,
  ROUND(100.0 * v36_regressions / NULLIF(total_comparisons, 0), 1) AS v36_regression_pct,
  invalid_signatures,
  ROUND(100.0 * invalid_signatures / NULLIF(total_comparisons, 0), 1) AS invalid_signature_pct,
  -- Breakdown stratégies
  jsonb_build_object(
    'exact', strat_exact,
    'indicative', strat_indicative,
    'fuzzy_fallback', strat_fuzzy,
    'rejected_room_mismatch', strat_rejected_room
  ) AS strategies,
  ROUND(avg_confidence::numeric, 1) AS avg_confidence,
  -- Verdict GO / NO GO selon les seuils du cahier des charges
  CASE
    WHEN total_comparisons < 100
      THEN '⏳ EN ATTENTE — collecter au moins 100 observations avant verdict'
    WHEN 100.0 * v36_matches / NULLIF(total_comparisons, 0) >= 80
     AND 100.0 * v36_no_matches / NULLIF(total_comparisons, 0) <= 20
     AND 100.0 * v36_regressions / NULLIF(total_comparisons, 0) <= 15
     AND 100.0 * invalid_signatures / NULLIF(total_comparisons, 0) <= 5
      THEN '✅ GO — V3.6 prêt pour activation prod (set MARKET_MATCHER_V36=true)'
    ELSE '❌ NO GO — seuils non atteints, garder V3.5'
  END AS verdict
FROM stats;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. KPI DRILL-DOWN — par domain
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  v36_signature_domain AS domain,
  COUNT(*) AS observations,
  ROUND(100.0 * SUM(CASE WHEN v36_has_match THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS coverage_pct,
  ROUND(100.0 * SUM(CASE WHEN same_match THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS same_match_pct,
  ROUND(AVG(v36_confidence)::numeric, 1) AS avg_confidence,
  STRING_AGG(DISTINCT v36_match_strategy, ', ') AS strategies_used
FROM v36_shadow_observations
WHERE created_at > NOW() - INTERVAL '7 days'
  AND NOT v36_signature_invalid
GROUP BY v36_signature_domain
ORDER BY observations DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. KPI RÉGRESSIONS — où V3.6 a perdu un match que V3.5 trouvait
-- ─────────────────────────────────────────────────────────────────────────────
-- Liste des cas où V3.5 matchait mais V3.6 ne trouve plus rien.
-- À analyser pour comprendre si V3.6 est trop strict ou si V3.5 mentait.

SELECT
  analysis_id,
  group_label,
  legacy_job_type,
  legacy_job_type_label,
  v36_signature_domain,
  v36_signature_subcategory,
  v36_signature_room,
  v36_match_strategy,
  v36_confidence,
  created_at
FROM v36_shadow_observations
WHERE legacy_has_match = TRUE
  AND v36_has_match = FALSE
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 50;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. KPI ROOM MISMATCH — où V3.5 a probablement choisi à tort un room-specific
-- ─────────────────────────────────────────────────────────────────────────────
-- Cas où V3.5 a un match mais V3.6 a rejeté pour room mismatch.
-- Si V3.5 avait par ex. "raccordements_electricite_cuisine" et V3.6 rejette
-- parce que pas de cuisine dans le devis → V3.6 est plus juste que V3.5.

SELECT
  analysis_id,
  group_label,
  legacy_job_type,
  v36_match_strategy,
  v36_signature_domain,
  v36_signature_room,
  COUNT(*) OVER (PARTITION BY legacy_job_type) AS legacy_job_type_count
FROM v36_shadow_observations
WHERE legacy_has_match = TRUE
  AND v36_match_strategy = 'rejected_room_mismatch'
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY legacy_job_type_count DESC, created_at DESC
LIMIT 50;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. VERDICT GO/NO GO simplifié pour stand-up
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  CASE
    WHEN COUNT(*) < 100 THEN '⏳ PAS ASSEZ DE DATA (' || COUNT(*) || ' obs, viser 100+)'
    WHEN 100.0 * SUM(CASE WHEN v36_has_match THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) >= 80
     AND 100.0 * SUM(CASE WHEN NOT v36_has_match THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) <= 20
     AND 100.0 * SUM(CASE WHEN legacy_has_match AND NOT v36_has_match THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) <= 15
      THEN '✅ GO — Activer V3.6 prod'
    ELSE '❌ NO GO — V3.6 pas prêt'
  END AS verdict,
  COUNT(*) AS total_obs
FROM v36_shadow_observations
WHERE created_at > NOW() - INTERVAL '7 days';
