-- ============================================================
-- Fix : remove updated_at (column doesn't exist on payment_events)
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_payment_event_status(
  p_event_id    UUID,
  p_chantier_id UUID,
  p_status      TEXT
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  IF p_status NOT IN ('paid', 'pending', 'late', 'cancelled') THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM chantiers
    WHERE id = p_chantier_id AND user_id = auth.uid()
  ) THEN
    RETURN FALSE;
  END IF;

  UPDATE payment_events
  SET status = p_status
  WHERE id = p_event_id AND project_id = p_chantier_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_payment_event_status(UUID, UUID, TEXT) TO authenticated;
