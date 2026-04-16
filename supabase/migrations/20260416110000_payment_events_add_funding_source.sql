-- ============================================================
-- Lie chaque paiement à une enveloppe de financement
-- (apport personnel, crédit, aides, etc.)
-- Permet de calculer la consommation réelle par source
-- dans les jauges Trésorerie.
-- ============================================================

ALTER TABLE public.payment_events
  ADD COLUMN IF NOT EXISTS funding_source_id UUID
    REFERENCES public.chantier_entrees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payment_events_funding_source
  ON public.payment_events(funding_source_id);
