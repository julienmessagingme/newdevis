-- =============================================================
-- Supabase cleanup migration
-- 1. Drop unused table: market_price_refs
-- 2. Drop dead table: travaux_reference_prix
-- 3. Drop unused column: document_extractions.price_debug
-- 4. Add cron job to purge expired company_cache rows (daily)
-- =============================================================

-- 1. Drop market_price_refs (never queried anywhere in codebase)
DROP TABLE IF EXISTS public.market_price_refs;

-- 2. Drop travaux_reference_prix (queried but scoring always returns VERT — dead code)
DROP TABLE IF EXISTS public.travaux_reference_prix;

-- 3. Drop unused price_debug column from document_extractions
ALTER TABLE public.document_extractions DROP COLUMN IF EXISTS price_debug;

-- 4. Cron job: purge expired company_cache entries daily at 03:00 UTC
SELECT cron.schedule(
  'purge-expired-company-cache',
  '0 3 * * *',
  $$DELETE FROM public.company_cache WHERE expires_at < NOW()$$
);
