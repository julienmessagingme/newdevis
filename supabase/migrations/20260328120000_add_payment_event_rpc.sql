-- ============================================================
-- Migration : fonction RPC set_payment_event_status
-- Contourne le RLS via SECURITY DEFINER tout en vérifiant
-- l'ownership via auth.uid() — solution fiable sans service_role côté client.
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
  -- Valider le statut
  IF p_status NOT IN ('paid', 'pending', 'late', 'cancelled') THEN
    RETURN FALSE;
  END IF;

  -- Vérifier que l'utilisateur appelant possède ce chantier
  IF NOT EXISTS (
    SELECT 1 FROM chantiers
    WHERE id = p_chantier_id AND user_id = auth.uid()
  ) THEN
    RETURN FALSE;
  END IF;

  -- Mettre à jour (SECURITY DEFINER bypass RLS)
  UPDATE payment_events
  SET status = p_status
  WHERE id = p_event_id AND project_id = p_chantier_id;

  RETURN FOUND;
END;
$$;

-- Accorder l'exécution aux utilisateurs authentifiés
GRANT EXECUTE ON FUNCTION public.set_payment_event_status(UUID, UUID, TEXT) TO authenticated;
