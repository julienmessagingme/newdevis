-- ═════════════════════════════════════════════════════════════════════════════
-- Observatoire — Materialized Views + refresh nightly
-- ═════════════════════════════════════════════════════════════════════════════
-- Date : 2026-07-01
-- But  : precalcul de toutes les statistiques agregees consultees par le
--        script generate-observatoire.ts (source : analyses + market_prices +
--        analysis_corrections). Refresh nightly via pg_cron.
--
-- Justification : lire 350+ analyses pour agreger stats a chaque generation
-- prend 30-60s. Les MVs precalculees s'executent en <100ms.
--
-- Toutes les MVs peuvent etre refresh en CONCURRENTLY pour ne pas bloquer.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper : extraction JSON safe (renvoie NULL au lieu de raise en cas d'erreur)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.safe_jsonb_extract(txt TEXT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF txt IS NULL OR txt = '' THEN RETURN NULL; END IF;
  RETURN txt::JSONB;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Vue de base : lignes exploitables cross-analyses
--
-- Chaque row = 1 groupe n8n_price_data d'1 analyse, avec confidence HIGH
-- (similarity >= 0.77) + qty > 0 + devis_total_ht > 0 + non-forfait.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_observatoire_base AS
WITH parsed AS (
  SELECT
    a.id AS analysis_id,
    a.created_at,
    a.score,
    safe_jsonb_extract(a.raw_text) AS raw,
    safe_jsonb_extract(a.conclusion_ia) AS conclusion
  FROM public.analyses a
  WHERE a.status = 'completed'
    AND a.raw_text IS NOT NULL
),
groups AS (
  SELECT
    p.analysis_id,
    p.created_at,
    p.score,
    p.raw->'extracted'->'totaux'->>'ht' AS total_ht,
    p.raw->'extracted'->'totaux'->>'taux_tva' AS taux_tva,
    p.raw->'extracted'->'entreprise'->>'adresse' AS adresse_entreprise,
    g.value AS g,
    (g.value->>'devis_total_ht')::NUMERIC AS devis_total_ht,
    COALESCE((g.value->>'main_quantity')::NUMERIC, 1) AS main_quantity,
    g.value->>'main_unit' AS main_unit,
    g.value->>'job_type_label' AS job_type_label,
    g.value->'vectorial'->>'top_similarity' AS similarity_str,
    g.value->'catalog_job_types'->>0 AS catalog_job_type
  FROM parsed p,
  LATERAL jsonb_array_elements(COALESCE(p.raw->'n8n_price_data', '[]'::jsonb)) g
  WHERE p.raw IS NOT NULL
)
SELECT
  g.analysis_id,
  g.created_at,
  g.score,
  g.total_ht::NUMERIC AS analysis_total_ht,
  g.taux_tva::NUMERIC AS analysis_taux_tva,
  g.adresse_entreprise,
  g.job_type_label,
  g.catalog_job_type,
  g.devis_total_ht,
  g.main_quantity,
  g.main_unit,
  (g.devis_total_ht / g.main_quantity) AS prix_unitaire,
  g.similarity_str::NUMERIC AS similarity,
  m.metier,
  m.label AS market_label,
  m.unit AS market_unit,
  m.price_min_unit_ht AS market_price_min,
  m.price_avg_unit_ht AS market_price_avg,
  m.price_max_unit_ht AS market_price_max
FROM groups g
LEFT JOIN public.market_prices m ON m.job_type = g.catalog_job_type
WHERE g.catalog_job_type IS NOT NULL
  AND g.devis_total_ht IS NOT NULL AND g.devis_total_ht > 0
  AND g.main_quantity IS NOT NULL AND g.main_quantity > 0
  AND (g.similarity_str IS NULL OR g.similarity_str::NUMERIC >= 0.77);

CREATE UNIQUE INDEX IF NOT EXISTS mv_observatoire_base_pk
  ON public.mv_observatoire_base (analysis_id, catalog_job_type);

CREATE INDEX IF NOT EXISTS mv_observatoire_base_metier_idx
  ON public.mv_observatoire_base (metier);

CREATE INDEX IF NOT EXISTS mv_observatoire_base_created_at_idx
  ON public.mv_observatoire_base (created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- MV 1 : stats par metier
-- Pour /observatoire/metiers/[slug] (33 pages)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_observatoire_metiers AS
SELECT
  metier,
  COUNT(DISTINCT analysis_id) AS nb_devis,
  COUNT(*) AS nb_lignes,
  ROUND(AVG(prix_unitaire)::NUMERIC, 2) AS prix_moyen,
  ROUND(MIN(prix_unitaire)::NUMERIC, 2) AS prix_min,
  ROUND(MAX(prix_unitaire)::NUMERIC, 2) AS prix_max,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY prix_unitaire)::NUMERIC, 2) AS prix_median,
  ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY prix_unitaire)::NUMERIC, 2) AS prix_p25,
  ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY prix_unitaire)::NUMERIC, 2) AS prix_p75,
  ROUND(AVG(devis_total_ht)::NUMERIC, 2) AS panier_moyen,
  ROUND(SUM(devis_total_ht)::NUMERIC, 2) AS volume_total_ht,
  ROUND(AVG(CASE
    WHEN market_price_avg > 0 THEN prix_unitaire / market_price_avg
    ELSE NULL
  END)::NUMERIC, 3) AS ratio_moyen_vs_marche
FROM public.mv_observatoire_base
WHERE metier IS NOT NULL
GROUP BY metier;

CREATE UNIQUE INDEX IF NOT EXISTS mv_observatoire_metiers_pk
  ON public.mv_observatoire_metiers (metier);

-- ─────────────────────────────────────────────────────────────────────────────
-- MV 2 : top postes surfactures (ratio devis / marche moyen)
-- Pour /observatoire/postes-surfactures et pages metier (top par metier)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_observatoire_postes_surfactures AS
SELECT
  catalog_job_type AS job_type,
  MAX(market_label) AS label,
  MAX(metier) AS metier,
  COUNT(*) AS nb_obs,
  ROUND(AVG(prix_unitaire)::NUMERIC, 2) AS prix_moyen_observe,
  ROUND(AVG(market_price_avg)::NUMERIC, 2) AS prix_moyen_marche,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
    CASE WHEN market_price_avg > 0 THEN prix_unitaire / market_price_avg ELSE NULL END
  )::NUMERIC, 3) AS ratio_median,
  ROUND(AVG(devis_total_ht)::NUMERIC, 2) AS panier_moyen
FROM public.mv_observatoire_base
WHERE market_price_avg > 0
  AND market_price_avg IS NOT NULL
GROUP BY catalog_job_type
HAVING COUNT(*) >= 3;

CREATE UNIQUE INDEX IF NOT EXISTS mv_observatoire_postes_surfactures_pk
  ON public.mv_observatoire_postes_surfactures (job_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- MV 3 : stats par type de chantier (heuristique mots-cles sur libelles)
-- Pour /observatoire/chantiers/[slug]
-- ─────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_observatoire_chantiers AS
WITH classified AS (
  SELECT
    b.analysis_id,
    b.analysis_total_ht,
    b.devis_total_ht,
    b.prix_unitaire,
    b.metier,
    -- Heuristique : type de chantier deduit du metier + mots-cles job_type_label
    CASE
      WHEN b.job_type_label ILIKE '%salle de bain%' OR b.job_type_label ILIKE '%sdb%'
        OR b.job_type_label ILIKE '%douche%' OR b.job_type_label ILIKE '%baignoire%'
        OR b.job_type_label ILIKE '%lavabo%' OR b.job_type_label ILIKE '%wc%'
        OR b.job_type_label ILIKE '%receveur%' OR b.job_type_label ILIKE '%vasque%' THEN 'salle-de-bain'
      WHEN b.job_type_label ILIKE '%cuisine%' THEN 'cuisine'
      WHEN b.job_type_label ILIKE '%toiture%' OR b.job_type_label ILIKE '%couverture%'
        OR b.job_type_label ILIKE '%charpente%' OR b.job_type_label ILIKE '%tuile%'
        OR b.job_type_label ILIKE '%ardoise%' OR b.job_type_label ILIKE '%zinc%'
        OR b.job_type_label ILIKE '%gouttiere%' THEN 'toiture'
      WHEN b.job_type_label ILIKE '%isolation%' OR b.job_type_label ILIKE '%ite%'
        OR b.job_type_label ILIKE '%iti%' THEN 'isolation'
      WHEN b.job_type_label ILIKE '%fenetre%' OR b.job_type_label ILIKE '%porte-fenetre%'
        OR b.job_type_label ILIKE '%chassis%' OR b.job_type_label ILIKE '%velux%' THEN 'fenetres'
      WHEN b.job_type_label ILIKE '%facade%' OR b.job_type_label ILIKE '%bardage%'
        OR b.job_type_label ILIKE '%ravalement%' THEN 'facade'
      WHEN b.job_type_label ILIKE '%terrasse%' THEN 'terrasse'
      WHEN b.job_type_label ILIKE '%piscine%' THEN 'piscine'
      WHEN b.job_type_label ILIKE '%cloture%' OR b.job_type_label ILIKE '%portail%' THEN 'cloture'
      WHEN b.job_type_label ILIKE '%garage%' THEN 'garage'
      WHEN b.metier = 'chauffage' THEN 'chauffage'
      WHEN b.metier = 'electricite' THEN 'electricite'
      WHEN b.metier = 'plomberie_sanitaires' THEN 'plomberie'
      WHEN b.metier = 'peinture_revetements' THEN 'peinture'
      WHEN b.metier = 'placo_isolation' THEN 'cloisons'
      WHEN b.metier = 'carrelage_faience' THEN 'carrelage'
      ELSE NULL
    END AS chantier_type
  FROM public.mv_observatoire_base b
)
SELECT
  chantier_type,
  COUNT(DISTINCT analysis_id) AS nb_devis,
  COUNT(*) AS nb_lignes,
  ROUND(AVG(prix_unitaire)::NUMERIC, 2) AS prix_moyen_unitaire,
  ROUND(AVG(devis_total_ht)::NUMERIC, 2) AS ligne_moyenne,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY prix_unitaire)::NUMERIC, 2) AS prix_median,
  ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY prix_unitaire)::NUMERIC, 2) AS prix_p25,
  ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY prix_unitaire)::NUMERIC, 2) AS prix_p75,
  ROUND(MIN(prix_unitaire)::NUMERIC, 2) AS prix_min,
  ROUND(MAX(prix_unitaire)::NUMERIC, 2) AS prix_max
FROM classified
WHERE chantier_type IS NOT NULL
GROUP BY chantier_type;

CREATE UNIQUE INDEX IF NOT EXISTS mv_observatoire_chantiers_pk
  ON public.mv_observatoire_chantiers (chantier_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- MV 4 : anomalies observees
-- Pour /observatoire/anomalies/*
-- ─────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_observatoire_anomalies AS
WITH parsed AS (
  SELECT
    a.id AS analysis_id,
    a.created_at,
    a.score,
    safe_jsonb_extract(a.conclusion_ia) AS conclusion
  FROM public.analyses a
  WHERE a.status = 'completed'
    AND a.conclusion_ia IS NOT NULL
),
exploded AS (
  SELECT
    p.analysis_id,
    p.created_at,
    p.score,
    an.value->>'titre' AS titre,
    an.value->>'explication' AS explication
  FROM parsed p,
  LATERAL jsonb_array_elements(COALESCE(p.conclusion->'anomalies', '[]'::jsonb)) an
  WHERE p.conclusion IS NOT NULL
)
SELECT
  COALESCE(NULLIF(TRIM(titre), ''), '(sans titre)') AS titre_short,
  COUNT(*) AS occurrences,
  COUNT(DISTINCT analysis_id) AS nb_analyses_touchees
FROM exploded
WHERE titre IS NOT NULL AND TRIM(titre) <> ''
GROUP BY COALESCE(NULLIF(TRIM(titre), ''), '(sans titre)')
HAVING COUNT(*) >= 2;

CREATE UNIQUE INDEX IF NOT EXISTS mv_observatoire_anomalies_pk
  ON public.mv_observatoire_anomalies (titre_short);

-- ─────────────────────────────────────────────────────────────────────────────
-- MV 5 : stats TVA
-- Pour /observatoire/tva
-- ─────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_observatoire_tva AS
WITH parsed AS (
  SELECT
    a.id AS analysis_id,
    (safe_jsonb_extract(a.raw_text)->'extracted'->'totaux'->>'taux_tva')::NUMERIC AS taux_tva,
    LOWER(safe_jsonb_extract(a.raw_text)::TEXT) AS raw_lower
  FROM public.analyses a
  WHERE a.status = 'completed' AND a.raw_text IS NOT NULL
)
SELECT
  CASE
    WHEN taux_tva = 20 THEN '20%'
    WHEN taux_tva = 10 THEN '10%'
    WHEN taux_tva = 5.5 THEN '5,5%'
    WHEN taux_tva IS NULL THEN 'non extraite'
    ELSE 'autre'
  END AS taux_label,
  COUNT(*) AS nb_devis,
  COUNT(CASE WHEN taux_tva = 20 AND raw_lower LIKE '%renovat%' THEN 1 END) AS nb_suspects_reno_20
FROM parsed
GROUP BY 1;

CREATE UNIQUE INDEX IF NOT EXISTS mv_observatoire_tva_pk
  ON public.mv_observatoire_tva (taux_label);

-- ─────────────────────────────────────────────────────────────────────────────
-- MV 6 : KPIs globaux (pour hub /observatoire)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_observatoire_kpi_global AS
SELECT
  (SELECT COUNT(*) FROM public.analyses WHERE status = 'completed') AS total_analyses,
  (SELECT COUNT(*) FROM public.mv_observatoire_base) AS total_lignes_exploitables,
  (SELECT COUNT(DISTINCT metier) FROM public.mv_observatoire_base WHERE metier IS NOT NULL) AS nb_metiers,
  (SELECT COUNT(DISTINCT catalog_job_type) FROM public.mv_observatoire_base) AS nb_categories,
  (SELECT ROUND(AVG(devis_total_ht)::NUMERIC, 2) FROM public.mv_observatoire_base) AS ligne_moyenne_ht,
  (SELECT ROUND(SUM(devis_total_ht)::NUMERIC, 2) FROM public.mv_observatoire_base) AS volume_total_analyse_ht,
  (SELECT COUNT(*) FROM public.analyses WHERE score = 'ROUGE' AND status = 'completed') AS nb_devis_rouges,
  (SELECT COUNT(*) FROM public.analyses WHERE score = 'ORANGE' AND status = 'completed') AS nb_devis_oranges,
  (SELECT COUNT(*) FROM public.analyses WHERE score = 'VERT' AND status = 'completed') AS nb_devis_verts,
  NOW() AS last_refreshed;

-- pas de PK sur celle-la (1 seule row)
CREATE UNIQUE INDEX IF NOT EXISTS mv_observatoire_kpi_global_singleton
  ON public.mv_observatoire_kpi_global ((1));

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS : lecture publique autorisee (donnees agregees, aucune donnee individuelle)
-- ─────────────────────────────────────────────────────────────────────────────

-- Les MVs n'utilisent pas RLS natif. Grant SELECT direct.
GRANT SELECT ON public.mv_observatoire_base TO anon, authenticated;
GRANT SELECT ON public.mv_observatoire_metiers TO anon, authenticated;
GRANT SELECT ON public.mv_observatoire_postes_surfactures TO anon, authenticated;
GRANT SELECT ON public.mv_observatoire_chantiers TO anon, authenticated;
GRANT SELECT ON public.mv_observatoire_anomalies TO anon, authenticated;
GRANT SELECT ON public.mv_observatoire_tva TO anon, authenticated;
GRANT SELECT ON public.mv_observatoire_kpi_global TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fonction wrapper pour refresh
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.refresh_observatoire_views()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  t0 TIMESTAMPTZ := clock_timestamp();
BEGIN
  -- base d'abord (les autres en dependent)
  REFRESH MATERIALIZED VIEW public.mv_observatoire_base;
  REFRESH MATERIALIZED VIEW public.mv_observatoire_metiers;
  REFRESH MATERIALIZED VIEW public.mv_observatoire_postes_surfactures;
  REFRESH MATERIALIZED VIEW public.mv_observatoire_chantiers;
  REFRESH MATERIALIZED VIEW public.mv_observatoire_anomalies;
  REFRESH MATERIALIZED VIEW public.mv_observatoire_tva;
  REFRESH MATERIALIZED VIEW public.mv_observatoire_kpi_global;
  RETURN 'Observatoire MVs refreshed in ' || EXTRACT(EPOCH FROM (clock_timestamp() - t0))::TEXT || 's';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Cron nightly 04:00 UTC (evite les fenetres de trafic FR)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Cleanup ancien job s'il existe
    PERFORM cron.unschedule('refresh-observatoire') FROM cron.job WHERE jobname = 'refresh-observatoire';

    PERFORM cron.schedule(
      'refresh-observatoire',
      '0 4 * * *',
      $inner$SELECT public.refresh_observatoire_views()$inner$
    );
    RAISE NOTICE 'Cron refresh-observatoire scheduled at 04:00 UTC daily';
  ELSE
    RAISE NOTICE 'Extension pg_cron indisponible — refresh manuel requis via SELECT public.refresh_observatoire_views()';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Premiere alimentation
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public.refresh_observatoire_views();

DO $$
DECLARE
  v_base BIGINT;
  v_metiers BIGINT;
  v_postes BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_base FROM public.mv_observatoire_base;
  SELECT COUNT(*) INTO v_metiers FROM public.mv_observatoire_metiers;
  SELECT COUNT(*) INTO v_postes FROM public.mv_observatoire_postes_surfactures;
  RAISE NOTICE '✓ mv_observatoire_base : % rows', v_base;
  RAISE NOTICE '✓ mv_observatoire_metiers : % metiers agreges', v_metiers;
  RAISE NOTICE '✓ mv_observatoire_postes_surfactures : % postes >=3 obs', v_postes;
END $$;

COMMIT;
