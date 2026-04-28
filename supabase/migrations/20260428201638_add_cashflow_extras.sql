-- =============================================================================
-- Migration : table cashflow_extras
-- =============================================================================
-- Stocke les mouvements financiers SANS pièce justificative (déblocage crédit,
-- apport personnel, virement entrant non rattaché à un devis, etc.).
--
-- Étape 1 / 5 du refactor "voies de saisie de dépense" (WIP.md §11) :
-- - documents_chantier reste la source de vérité des dépenses AVEC pièce
-- - cashflow_extras = mouvements purs sans pièce
-- - payment_events sera ensuite remplacé par une VIEW dérivée des deux
--
-- Cette migration est strictement ADDITIVE :
--   * Aucune table existante n'est modifiée
--   * Aucune écriture n'est rerouté côté code
--   * payment_events legacy continue d'exister et d'être lue/écrite
--
-- Backfill : on copie les payment_events `manuel` non-override.
-- Idempotent (ON CONFLICT DO NOTHING sur l'id). Compteurs distincts logged
-- pour : inserted, eligible-but-already-existed, invalid (filtered out).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cashflow_extras (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID         NOT NULL REFERENCES public.chantiers(id) ON DELETE CASCADE,
  label               TEXT         NOT NULL CHECK (length(trim(label)) > 0),
  amount              NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  due_date            DATE         NOT NULL,
  status              TEXT         NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'paid', 'late', 'cancelled')),
  paid_at             TIMESTAMPTZ,        -- horodatage du passage en 'paid' (auto via trigger)
  financing_source    TEXT
                        CHECK (financing_source IS NULL OR financing_source IN
                          ('apport', 'credit', 'maprime', 'cee', 'eco_ptz', 'mixte')),
  notes               TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by          UUID         REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Index : Échéancier filtre par chantier + due_date
CREATE INDEX IF NOT EXISTS idx_cashflow_extras_project_due
  ON public.cashflow_extras(project_id, due_date);

-- Index : filtres ponctuels par status (ex: dashboards "à venir")
CREATE INDEX IF NOT EXISTS idx_cashflow_extras_status
  ON public.cashflow_extras(project_id, status)
  WHERE status != 'cancelled';

-- =============================================================================
-- Trigger updated_at (fonction dédiée, pas de réutilisation d'une fonction
-- d'une autre table — convention du projet)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.touch_cashflow_extras_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cashflow_extras_updated_at ON public.cashflow_extras;
CREATE TRIGGER trg_cashflow_extras_updated_at
  BEFORE UPDATE ON public.cashflow_extras
  FOR EACH ROW EXECUTE FUNCTION public.touch_cashflow_extras_updated_at();

-- =============================================================================
-- Trigger created_by — auto-rempli depuis auth.uid() si non fourni
-- (sera NULL pour les inserts via service_role, ce qui est attendu)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_cashflow_extras_created_by()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cashflow_extras_set_created_by ON public.cashflow_extras;
CREATE TRIGGER trg_cashflow_extras_set_created_by
  BEFORE INSERT ON public.cashflow_extras
  FOR EACH ROW EXECUTE FUNCTION public.set_cashflow_extras_created_by();

-- =============================================================================
-- Trigger paid_at — set au passage status -> 'paid', reset si reverti
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_cashflow_extras_paid_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN
    NEW.paid_at = COALESCE(NEW.paid_at, NOW());
  ELSIF NEW.status != 'paid' THEN
    NEW.paid_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cashflow_extras_set_paid_at ON public.cashflow_extras;
CREATE TRIGGER trg_cashflow_extras_set_paid_at
  BEFORE INSERT OR UPDATE ON public.cashflow_extras
  FOR EACH ROW EXECUTE FUNCTION public.set_cashflow_extras_paid_at();

-- =============================================================================
-- RLS — wrapper (select auth.uid()) pour éval unique par requête (cf. CLAUDE.md)
-- =============================================================================
ALTER TABLE public.cashflow_extras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own project cashflow extras" ON public.cashflow_extras;
CREATE POLICY "Users can manage own project cashflow extras"
  ON public.cashflow_extras FOR ALL
  USING (
    project_id IN (
      SELECT id FROM public.chantiers WHERE user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.chantiers WHERE user_id = (select auth.uid())
    )
  );

-- =============================================================================
-- Backfill depuis payment_events 'manuel' non-override
-- =============================================================================
-- Préservation de l'id source pour faciliter un rollback éventuel.
-- ON CONFLICT (id) DO NOTHING → idempotence si re-run manuel.
-- Compteurs distincts dans le RAISE NOTICE :
--   - eligible : rows respectant les invariants de cashflow_extras
--   - inserted : rows réellement créés (peut être < eligible si déjà présents)
--   - already_existed : eligible - inserted (re-run case)
--   - invalid : rows manuel exclus (amount NULL/zéro ou due_date NULL)
-- =============================================================================
DO $$
DECLARE
  total_eligible      INT;
  total_invalid       INT;
  inserted_count      INT;
  already_existed     INT;
BEGIN
  SELECT count(*) INTO total_eligible
  FROM public.payment_events
  WHERE source_type = 'manuel'
    AND COALESCE(is_override, false) = false
    AND amount IS NOT NULL AND amount > 0
    AND due_date IS NOT NULL;

  SELECT count(*) INTO total_invalid
  FROM public.payment_events
  WHERE source_type = 'manuel'
    AND COALESCE(is_override, false) = false
    AND (amount IS NULL OR amount <= 0 OR due_date IS NULL);

  WITH eligible AS (
    SELECT
      id,
      project_id,
      COALESCE(NULLIF(trim(label), ''), 'Mouvement (sans label)') AS label,
      amount,
      due_date,
      status,
      financing_source,
      created_at
    FROM public.payment_events
    WHERE source_type = 'manuel'
      AND COALESCE(is_override, false) = false
      AND amount IS NOT NULL AND amount > 0
      AND due_date IS NOT NULL
  ),
  ins AS (
    INSERT INTO public.cashflow_extras
      (id, project_id, label, amount, due_date, status, financing_source, created_at)
    SELECT id, project_id, label, amount, due_date, status, financing_source, created_at
    FROM eligible
    ON CONFLICT (id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO inserted_count FROM ins;

  already_existed := GREATEST(0, total_eligible - inserted_count);

  RAISE NOTICE 'cashflow_extras backfill — eligible: %, inserted: %, already_existed: %, invalid (skipped): %',
    total_eligible, inserted_count, already_existed, total_invalid;
END $$;

COMMENT ON TABLE public.cashflow_extras IS
  'Mouvements financiers sans pièce justificative (déblocage crédit, apport, etc.). Source : refactor cashflow étape 1/5 (cf. WIP.md §11).';
COMMENT ON COLUMN public.cashflow_extras.paid_at IS
  'Horodatage du passage en status=paid. Auto-rempli par trigger. Reset à NULL si on revient à pending/cancelled.';
COMMENT ON COLUMN public.cashflow_extras.created_by IS
  'auth.uid() de qui a créé la ligne. Auto-rempli par trigger BEFORE INSERT. NULL pour service_role (edge functions).';
