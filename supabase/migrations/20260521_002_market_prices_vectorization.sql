-- ============================================================================
-- V3.5.0 (2026-05-21) — VECTORISATION CATALOGUE MARKET_PRICES
-- ============================================================================
--
-- PHASE A de la refonte vectorielle (cf. Plan V3.5.0). Objectif : passer du
-- groupement Gemini "tout-en-un" qui produit des regroupements aberrants
-- (cas PH VISION : "Pose extracteur/WC" 3900€ = tout le bloc Sanitaires) à
-- un matching ligne-par-ligne via similarity search sur embeddings.
--
-- Cette migration est 100% NON-BREAKING : on ajoute uniquement une colonne
-- nullable + un index partial + une RPC. Le pipeline V3.6 actuel continue
-- de fonctionner exactement comme avant. La bascule vers vectoriel se fait
-- via feature flag `MARKET_MATCHER_VECTORIAL=true` en Phase F.
--
-- Sans Phase B (seed embeddings) + Phase C (refonte edge function), cette
-- migration n'a aucun effet visible. Elle prépare juste le terrain.
--
-- Idempotente : `CREATE EXTENSION IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
-- `CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`.
-- ============================================================================

BEGIN;

-- ── 1. Activer pgvector ─────────────────────────────────────────────────────
-- Extension PostgreSQL standard, disponible sur Supabase free + paid.
-- Installée dans schema `extensions` pour rester compatible avec les conventions
-- Supabase (cf. autres extensions du projet : pg_cron, pg_net).
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ── 2. Colonne embedding sur market_prices ─────────────────────────────────
-- 768 dimensions = format natif de Gemini embedding-001 (modèle qu'on utilisera
-- pour seed le catalogue + pour embed les lignes devis à l'analyse).
-- Nullable : les rows existantes restent à NULL jusqu'à ce que le script
-- seed Phase B les remplisse. L'index HNSW (point 3) les ignore via WHERE
-- IS NOT NULL.
ALTER TABLE public.market_prices
  ADD COLUMN IF NOT EXISTS embedding extensions.vector(768);

COMMENT ON COLUMN public.market_prices.embedding IS
  'V3.5.0 (2026-05-21) — Embedding sémantique 768d généré par Gemini embedding-001 '
  'sur la concaténation (label + notes + job_type + domain + unit). Sert au '
  'matching vectoriel ligne-par-ligne (cosine similarity) qui remplace le '
  'groupement Gemini V3.6 (responsable des regroupements aberrants type '
  '"Pose extracteur/WC = 3900€ tout-le-bloc-Sanitaires"). NULL = pas encore '
  'embeddé par le script scripts/seed_market_prices_embeddings.mjs.';

-- ── 3. Index HNSW pour similarity search rapide ────────────────────────────
-- HNSW = Hierarchical Navigable Small World, algorithme d'ANN (Approximate
-- Nearest Neighbor) qui scale bien jusqu'à des millions de vecteurs. Pour
-- nos 470 entrées catalogue c'est largement overkill mais ça reste rapide
-- même si on monte à 10k entrées un jour.
--
-- Opérateur vector_cosine_ops = cosine distance (1 - cosine_similarity).
-- C'est l'opérateur le plus adapté pour matcher du texte sémantique
-- (vs L2/Euclidean qui est sensible à la magnitude du vecteur).
--
-- WHERE embedding IS NOT NULL : index partiel pour éviter de stocker les
-- rows non encore embeddées (économise espace + accélère le maintenance).
CREATE INDEX IF NOT EXISTS idx_market_prices_embedding_hnsw
  ON public.market_prices
  USING hnsw (embedding extensions.vector_cosine_ops)
  WHERE embedding IS NOT NULL;

-- ── 4. RPC search_market_prices_v2 — similarity search ─────────────────────
-- Appelée par l'edge function analyze-quote (Phase C) à chaque ligne du devis :
--   const { data } = await supabase.rpc('search_market_prices_v2', {
--     query_embedding: '[0.012, -0.045, ...]',
--     match_threshold: 0.5,
--     match_count: 5,
--   });
--
-- Retourne les top N candidats catalogue triés par cosine similarity
-- décroissante, avec un score lisible (1.0 = match parfait, 0.0 = orthogonal).
--
-- SECURITY DEFINER pour bypass RLS depuis l'edge function. GRANT explicite
-- au service_role uniquement (pas exposé au client).
CREATE OR REPLACE FUNCTION public.search_market_prices_v2(
  query_embedding extensions.vector(768),
  match_threshold FLOAT DEFAULT 0.5,
  match_count    INT   DEFAULT 5
)
RETURNS TABLE (
  id                INT,
  job_type          TEXT,
  label             TEXT,
  unit              TEXT,
  price_min_unit_ht NUMERIC,
  price_avg_unit_ht NUMERIC,
  price_max_unit_ht NUMERIC,
  fixed_min_ht      NUMERIC,
  fixed_avg_ht      NUMERIC,
  fixed_max_ht      NUMERIC,
  domain            TEXT,
  notes             TEXT,
  similarity        FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    mp.id,
    mp.job_type,
    mp.label,
    mp.unit,
    mp.price_min_unit_ht,
    mp.price_avg_unit_ht,
    mp.price_max_unit_ht,
    mp.fixed_min_ht,
    mp.fixed_avg_ht,
    mp.fixed_max_ht,
    mp.domain,
    mp.notes,
    (1 - (mp.embedding <=> query_embedding))::FLOAT AS similarity
  FROM public.market_prices mp
  WHERE mp.embedding IS NOT NULL
    AND (1 - (mp.embedding <=> query_embedding)) > match_threshold
  ORDER BY mp.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

-- Garde-fou : seul le service_role appelle cette RPC depuis l'edge function.
-- Pas exposée à anon/authenticated (les users n'ont pas besoin de query le
-- catalogue directement).
REVOKE ALL ON FUNCTION public.search_market_prices_v2(extensions.vector(768), FLOAT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_market_prices_v2(extensions.vector(768), FLOAT, INT) TO service_role;

COMMENT ON FUNCTION public.search_market_prices_v2 IS
  'V3.5.0 (2026-05-21) — Similarity search vectoriel sur market_prices.embedding. '
  'Appelée par l''edge function analyze-quote (V3.5.0+) pour matcher chaque ligne '
  'de devis individuellement au catalogue. Remplace le groupement Gemini V3.6 '
  'qui produisait des regroupements aberrants. Cf. plan vectorisation Phase A.';

-- ── 5. Vérifications post-migration ────────────────────────────────────────
-- À lancer dans SQL Editor après application :
--
--   SELECT extname FROM pg_extension WHERE extname = 'vector';
--   -- Attendu : 1 row 'vector'
--
--   SELECT column_name, data_type, udt_name
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'market_prices'
--     AND column_name = 'embedding';
--   -- Attendu : embedding | USER-DEFINED | vector
--
--   SELECT indexname FROM pg_indexes
--   WHERE schemaname = 'public' AND tablename = 'market_prices'
--     AND indexname = 'idx_market_prices_embedding_hnsw';
--   -- Attendu : 1 row
--
--   SELECT count(*) FROM market_prices WHERE embedding IS NULL;
--   -- Attendu : ~470 (tous NULL initialement — Phase B remplira)

COMMIT;
