-- Enable RLS on 4 tables flagged by Supabase security advisor
-- postal_insee, dvf_prices_yearly: public read (used by API routes)
-- market_prices_backup, postal_insee_raw: RLS enabled, NO public policy (admin/service_role only)

-- ══════════════════════════════════════════════════════════
-- 1. postal_insee — read-only public (used by /api/postal-lookup)
-- ══════════════════════════════════════════════════════════
ALTER TABLE public.postal_insee ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'postal_insee' AND policyname = 'postal_insee_public_read'
  ) THEN
    CREATE POLICY "postal_insee_public_read"
      ON public.postal_insee
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════
-- 2. dvf_prices_yearly — read-only public (used by /api/market-prices)
-- ══════════════════════════════════════════════════════════
ALTER TABLE public.dvf_prices_yearly ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dvf_prices_yearly' AND policyname = 'dvf_prices_yearly_public_read'
  ) THEN
    CREATE POLICY "dvf_prices_yearly_public_read"
      ON public.dvf_prices_yearly
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════
-- 3. market_prices_backup — RLS on, NO public access (service_role only)
-- ══════════════════════════════════════════════════════════
ALTER TABLE public.market_prices_backup ENABLE ROW LEVEL SECURITY;
-- No policy = only service_role (bypasses RLS) can access

-- ══════════════════════════════════════════════════════════
-- 4. postal_insee_raw — RLS on, NO public access (service_role only)
-- ══════════════════════════════════════════════════════════
ALTER TABLE public.postal_insee_raw ENABLE ROW LEVEL SECURITY;
-- No policy = only service_role (bypasses RLS) can access
