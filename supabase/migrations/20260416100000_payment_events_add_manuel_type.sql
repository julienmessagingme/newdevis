-- ============================================================
-- Permet les entrées manuelles dans payment_events :
--   1. Ajoute 'manuel' au CHECK source_type
--   2. Rend source_id nullable (pas de document source pour les dépenses manuelles)
-- ============================================================

-- 1. Étendre le CHECK sur source_type
ALTER TABLE public.payment_events
  DROP CONSTRAINT IF EXISTS payment_events_source_type_check;

ALTER TABLE public.payment_events
  ADD CONSTRAINT payment_events_source_type_check
  CHECK (source_type IN ('devis', 'facture', 'manuel'));

-- 2. Rendre source_id nullable
ALTER TABLE public.payment_events
  ALTER COLUMN source_id DROP NOT NULL;
