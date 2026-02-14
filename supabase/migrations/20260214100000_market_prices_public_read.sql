-- Allow anonymous read access to market_prices (public price reference data)
CREATE POLICY "market_prices_public_read"
  ON public.market_prices
  FOR SELECT
  TO anon, authenticated
  USING (true);
