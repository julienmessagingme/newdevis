-- ============================================================
-- Migration : table payment_events
-- Stocke la timeline de paiement générée depuis les conditions
-- extraites par IA d'un devis ou d'une facture.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.payment_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES public.chantiers(id) ON DELETE CASCADE,
  source_type TEXT        NOT NULL CHECK (source_type IN ('devis', 'facture')),
  source_id   UUID        NOT NULL,
  amount      NUMERIC(12, 2),
  due_date    DATE,
  status      TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'paid', 'late', 'cancelled')),
  is_override BOOLEAN     NOT NULL DEFAULT FALSE,
  label       TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index de performance
CREATE INDEX IF NOT EXISTS idx_payment_events_project_id ON public.payment_events(project_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_source     ON public.payment_events(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_due_date   ON public.payment_events(due_date);
CREATE INDEX IF NOT EXISTS idx_payment_events_status     ON public.payment_events(status);

-- RLS : chaque utilisateur ne voit que ses propres événements
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own payment events"
  ON public.payment_events FOR ALL
  USING (
    project_id IN (
      SELECT id FROM public.chantiers WHERE user_id = auth.uid()
    )
  );

-- Trigger updated_at automatique
CREATE OR REPLACE FUNCTION public.touch_payment_events_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payment_events_updated_at
  BEFORE UPDATE ON public.payment_events
  FOR EACH ROW EXECUTE FUNCTION public.touch_payment_events_updated_at();
