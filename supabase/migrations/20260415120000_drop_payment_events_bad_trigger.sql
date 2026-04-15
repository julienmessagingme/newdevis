-- ============================================================
-- Drop le trigger trg_payment_events_updated_at qui cause une
-- erreur 500 sur tout UPDATE de payment_events.
-- La colonne updated_at n'existe pas sur cette table — le trigger
-- a été créé par erreur dans 20260324130000_add_payment_events.sql.
-- ============================================================

DROP TRIGGER IF EXISTS trg_payment_events_updated_at ON public.payment_events;
DROP FUNCTION IF EXISTS public.touch_payment_events_updated_at();
