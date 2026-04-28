-- =============================================================================
-- Migration : event_id stable dans cashflow_terms + VIEW recompilée
-- =============================================================================
-- Étape 3a / 5 du refactor cashflow chantier (WIP.md §11).
--
-- Pourquoi : pour permettre le dual-write en PR3 (l'API doit pouvoir relier
-- un event de la VIEW à sa contrepartie legacy AND à un index dans
-- cashflow_terms), on ajoute un `event_id` UUID stable dans chaque élément
-- de l'array. Ce UUID :
--   - est égal à payment_events.id pour les rows backfillés (compat-rétro)
--   - sera généré côté Node lors des futurs INSERTs (pour synchro 1:1 entre
--     la legacy table et cashflow_terms)
--
-- La VIEW est ensuite recompilée pour exposer (term->>'event_id')::uuid comme
-- `id` de la branche 2, au lieu d'un v5 dérivé. Conséquence : les IDs exposés
-- par la VIEW sont les MÊMES que ceux de payment_events legacy → l'API peut
-- patch/delete les deux en parallèle pendant la transition (PR3).
--
-- Strict rebuild : wipe + re-backfill cashflow_terms. Sûr car aucune écriture
-- applicative ne touche encore cashflow_terms (PR3 va l'introduire après
-- cette migration).
--
-- L'ensemble (wipe + re-backfill + recreate VIEW) tourne dans une transaction
-- implicite (Supabase migrate) — une erreur dans une étape ROLLBACK le tout.
-- Pour re-runs manuels, l'idempotence est garantie par la séquence wipe → fill.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Re-backfill cashflow_terms AVEC event_id stable
-- -----------------------------------------------------------------------------
UPDATE public.documents_chantier
SET cashflow_terms = '[]'::jsonb
WHERE cashflow_terms IS NOT NULL AND cashflow_terms != '[]'::jsonb;

DO $$
DECLARE
  docs_updated      INT;
  total_terms_count INT;
BEGIN
  WITH grouped AS (
    SELECT
      pe.source_id AS doc_id,
      jsonb_agg(
        jsonb_build_object(
          'event_id', pe.id,
          'amount',   pe.amount,
          'due_date', pe.due_date,
          'status',   pe.status,
          'label',    pe.label
        )
        ORDER BY pe.due_date NULLS LAST, pe.id
      ) AS terms,
      COUNT(*) AS n_terms
    FROM public.payment_events pe
    WHERE pe.source_type IN ('devis', 'facture')
      AND COALESCE(pe.is_override, false) = false
    GROUP BY pe.source_id
  ),
  upd AS (
    UPDATE public.documents_chantier d
    SET cashflow_terms = g.terms
    FROM grouped g
    WHERE d.id = g.doc_id
    RETURNING 1, g.n_terms
  )
  SELECT COUNT(*), COALESCE(SUM(n_terms), 0) INTO docs_updated, total_terms_count FROM upd;

  RAISE NOTICE 'cashflow_terms re-backfill (with event_id) — docs_updated: %, total_terms: %',
    docs_updated, total_terms_count;
END $$;

-- -----------------------------------------------------------------------------
-- 2. VIEW payment_events_v — branche 2 utilise (term->>'event_id')::uuid
--    comme id pour matcher les payment_events legacy 1:1.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.payment_events_v AS

-- Branche 1 : Frais & ticket_caisse → 1 event auto-paid (date = created_at)
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
  null::text             AS financing_source,
  false                  AS is_override,
  'document'::text       AS origin,
  d.created_at
FROM public.documents_chantier d
WHERE d.depense_type IN ('frais', 'ticket_caisse')
  AND d.montant IS NOT NULL
  AND d.montant > 0

UNION ALL

-- Branche 2 : Devis & factures → expand cashflow_terms array, id = event_id
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
  null::text AS financing_source,
  false      AS is_override,
  'document'::text AS origin,
  d.created_at
FROM public.documents_chantier d
CROSS JOIN LATERAL jsonb_array_elements(d.cashflow_terms) WITH ORDINALITY t(term, idx)
WHERE d.depense_type NOT IN ('frais', 'ticket_caisse')
  AND jsonb_array_length(d.cashflow_terms) > 0
  AND term ? 'event_id'
  AND jsonb_typeof(term->'event_id') = 'string'

UNION ALL

-- Branche 3 : Mouvements manuels (cashflow_extras de PR1)
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
  e.financing_source,
  false           AS is_override,
  'extra'::text   AS origin,
  e.created_at
FROM public.cashflow_extras e
WHERE e.status != 'cancelled';

COMMENT ON VIEW public.payment_events_v IS
  'Vue dérivée pour Échéancier/Trésorerie. UNION : (1) frais/ticket auto-paid, '
  '(2) versements de devis/facture (cashflow_terms JSONB, id=event_id pour '
  'matcher legacy), (3) cashflow_extras manuels. Étape 3a/5 du refactor (WIP.md §11).';

COMMIT;
