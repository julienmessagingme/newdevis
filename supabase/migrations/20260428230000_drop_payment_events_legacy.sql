-- =============================================================================
-- Migration : DROP payment_events legacy + restore funding_source_id + recompile VIEW
-- =============================================================================
-- Étape 5 / 5 du refactor cashflow chantier (WIP.md §11).
--
-- 1. DROP TABLE public.payment_events (lecture-seule depuis PR4, plus aucun
--    reader ni writer)
-- 2. ALTER cashflow_extras : restaurer funding_source_id (FK → chantier_entrees)
--    qui était une feature de payment_events legacy non migrée pendant PR3-PR4
-- 3. Recompile VIEW : retire is_override (always false), ajoute funding_source_id
-- =============================================================================

BEGIN;

-- 1. DROP table legacy
DROP TABLE IF EXISTS public.payment_events CASCADE;

-- 2. Restaurer funding_source_id sur cashflow_extras
ALTER TABLE public.cashflow_extras
  ADD COLUMN IF NOT EXISTS funding_source_id UUID
    REFERENCES public.chantier_entrees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cashflow_extras_funding_source
  ON public.cashflow_extras(funding_source_id)
  WHERE funding_source_id IS NOT NULL;

COMMENT ON COLUMN public.cashflow_extras.funding_source_id IS
  'FK vers chantier_entrees pour tracer quel revenu a financé ce mouvement (typiquement paid).';

-- 3. Recompile VIEW : retire is_override, ajoute funding_source_id
-- (pour cashflow_terms : extrait depuis le JSONB élément ; null si absent)
DROP VIEW IF EXISTS public.payment_events_v;

CREATE VIEW public.payment_events_v AS

-- Branche 1 : Frais & ticket_caisse → 1 event auto-paid
SELECT
  extensions.uuid_generate_v5(
    extensions.uuid_ns_url(),
    'cashflow:' || d.id::text || ':auto'
  ) AS id,
  d.chantier_id          AS project_id,
  'frais'::text          AS source_type,
  d.id                   AS source_id,
  null::int              AS term_index,
  d.lot_id,
  d.montant              AS amount,
  d.created_at::date     AS due_date,
  'paid'::text           AS status,
  COALESCE(NULLIF(trim(d.nom_fichier), ''), 'Frais') AS label,
  null::uuid             AS funding_source_id,
  'document'::text       AS origin,
  d.created_at
FROM public.documents_chantier d
WHERE d.depense_type IN ('frais', 'ticket_caisse')
  AND d.montant IS NOT NULL
  AND d.montant > 0

UNION ALL

-- Branche 2 : Devis & factures → expand cashflow_terms array
SELECT
  (term->>'event_id')::uuid AS id,
  d.chantier_id AS project_id,
  CASE WHEN d.document_type = 'devis' THEN 'devis'::text
       ELSE 'facture'::text
  END AS source_type,
  d.id AS source_id,
  (idx-1)::int AS term_index,
  d.lot_id,
  CASE
    WHEN term ? 'amount' AND jsonb_typeof(term->'amount') = 'number'
      THEN (term->>'amount')::numeric
    ELSE NULL
  END AS amount,
  CASE
    WHEN term ? 'due_date' AND jsonb_typeof(term->'due_date') = 'string'
      THEN (term->>'due_date')::date
    ELSE NULL
  END AS due_date,
  COALESCE(NULLIF(term->>'status', ''), 'pending') AS status,
  COALESCE(NULLIF(term->>'label', ''), d.nom_fichier, 'Versement') AS label,
  CASE
    WHEN term ? 'funding_source_id' AND jsonb_typeof(term->'funding_source_id') = 'string'
      THEN (term->>'funding_source_id')::uuid
    ELSE NULL
  END AS funding_source_id,
  'document'::text AS origin,
  d.created_at
FROM public.documents_chantier d
CROSS JOIN LATERAL jsonb_array_elements(d.cashflow_terms) WITH ORDINALITY t(term, idx)
WHERE d.depense_type NOT IN ('frais', 'ticket_caisse')
  AND jsonb_array_length(d.cashflow_terms) > 0
  AND term ? 'event_id'
  AND jsonb_typeof(term->'event_id') = 'string'

UNION ALL

-- Branche 3 : Mouvements manuels (cashflow_extras)
SELECT
  e.id,
  e.project_id,
  'manuel'::text  AS source_type,
  null::uuid      AS source_id,
  null::int       AS term_index,
  null::uuid      AS lot_id,
  e.amount,
  e.due_date,
  e.status,
  e.label,
  e.funding_source_id,
  'extra'::text   AS origin,
  e.created_at
FROM public.cashflow_extras e
WHERE e.status != 'cancelled';

COMMENT ON VIEW public.payment_events_v IS
  'Vue dérivée pour Échéancier/Trésorerie. UNION : (1) frais/ticket auto-paid, '
  '(2) versements de devis/facture (cashflow_terms JSONB), (3) cashflow_extras '
  'manuels. Refactor PR1-PR5 (WIP.md §11) — payment_events legacy droppée.';

COMMIT;
