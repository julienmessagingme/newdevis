-- =============================================================================
-- Migration : documents_chantier.cashflow_terms + VIEW payment_events_v
-- =============================================================================
-- Étape 2 / 5 du refactor "voies de saisie de dépense" (WIP.md §11).
--
-- Stockage : chaque document peut désormais déclarer 0..N versements via une
-- colonne JSONB `cashflow_terms` (array). La VIEW `payment_events_v` UNION-e :
--   1. Les frais & ticket_caisse (1 event auto-paid par doc, dérivé de depense_type)
--   2. Les versements explicites des devis/factures (cashflow_terms array)
--   3. Les mouvements purs sans pièce (cashflow_extras de la PR1)
--
-- Cette migration est lecture-only côté APIs : la table payment_events legacy
-- reste intouchée. La VIEW est créée en parallèle pour comparaison.
--
-- Comparaison attendue après backfill :
--   SUM(payment_events_v WHERE source_type IN ('devis','facture'))
--     == SUM(payment_events legacy WHERE source_type IN ('devis','facture')
--            AND COALESCE(is_override,false)=false)
--
--   SUM(payment_events_v WHERE source_type='manuel')
--     == SUM(cashflow_extras WHERE status != 'cancelled')
--
--   3 frais/ticket events EN PLUS (intentionnel — gain de feature : frais
--     deviennent visibles dans Échéancier).
--
-- Note achat_materiaux : actuellement aucun doc avec ce depense_type en prod.
-- Si un doc achat_materiaux a un cashflow_terms non vide, il sera traité
-- comme une facture (branche 2). À reconsidérer si le pattern évolue.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Extension uuid-ossp (pour uuid_generate_v5 utilisé par la VIEW)
-- -----------------------------------------------------------------------------
-- Sur Supabase, les extensions sont dans le schéma `extensions`. On qualifie
-- explicitement les appels pour ne pas dépendre du search_path.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- -----------------------------------------------------------------------------
-- 1. Schéma : ajouter cashflow_terms à documents_chantier
-- -----------------------------------------------------------------------------
ALTER TABLE public.documents_chantier
  ADD COLUMN IF NOT EXISTS cashflow_terms JSONB NOT NULL DEFAULT '[]'::jsonb;

-- CHECK : doit être un array
ALTER TABLE public.documents_chantier
  DROP CONSTRAINT IF EXISTS documents_chantier_cashflow_terms_is_array;
ALTER TABLE public.documents_chantier
  ADD CONSTRAINT documents_chantier_cashflow_terms_is_array
  CHECK (jsonb_typeof(cashflow_terms) = 'array');

COMMENT ON COLUMN public.documents_chantier.cashflow_terms IS
  'Array JSONB de versements dérivés du devis/facture. Chaque élément = '
  '{ amount: numeric|null, due_date: "YYYY-MM-DD"|null, status: '
  '"pending"|"paid"|"late"|"cancelled", label: string }. '
  'Pour frais/ticket_caisse : non utilisé (l''event auto-paid est dérivé '
  'directement par la VIEW depuis depense_type + montant).';

-- -----------------------------------------------------------------------------
-- 2. Backfill cashflow_terms depuis payment_events legacy
-- -----------------------------------------------------------------------------
-- Idempotent (skip docs ayant déjà un cashflow_terms non vide). Si une UI
-- écrit dans cashflow_terms entre deux runs, la migration ne l'écrase pas
-- (drift à monitorer manuellement — non bloquant en PR2).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  docs_updated      INT;
  total_terms_count INT;
  overrides_skipped INT;
BEGIN
  SELECT COUNT(*) INTO overrides_skipped
  FROM public.payment_events
  WHERE source_type IN ('devis', 'facture')
    AND is_override = true;

  WITH grouped AS (
    SELECT
      pe.source_id AS doc_id,
      jsonb_agg(
        jsonb_build_object(
          'amount', pe.amount,
          'due_date', pe.due_date,
          'status', pe.status,
          'label', pe.label
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
      AND (d.cashflow_terms IS NULL OR d.cashflow_terms = '[]'::jsonb)
    RETURNING 1, g.n_terms
  )
  SELECT COUNT(*), COALESCE(SUM(n_terms), 0) INTO docs_updated, total_terms_count FROM upd;

  RAISE NOTICE 'cashflow_terms backfill — docs_updated: %, total_terms: %, overrides_skipped: %',
    docs_updated, total_terms_count, overrides_skipped;
END $$;

-- -----------------------------------------------------------------------------
-- 3. VIEW payment_events_v
-- -----------------------------------------------------------------------------
-- Colonnes exposées :
--   id, project_id, source_type, source_id, term_index, lot_id,
--   amount, due_date, status, label, financing_source, is_override,
--   origin, created_at
--
-- term_index :
--   - NULL pour les events frais/ticket auto-paid (branche 1)
--   - 0..N-1 pour les versements de devis/factures (branche 2)
--   - NULL pour les extras manuels (branche 3)
--   → Permet aux PATCH/DELETE futurs (PR4) de cibler le bon versement
--     dans documents_chantier.cashflow_terms[term_index].
--
-- is_override : toujours false dans la VIEW (les overrides legacy ne sont
--   plus représentés). Exposé pour compat-rétro avec le code consumer
--   actuel pendant la transition (PR3).
--
-- IDs déterministes via uuid_generate_v5(uuid_ns_url(), seed) avec seed
-- explicite pour stabilité cross-session.
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

-- Branche 2 : Devis & factures → expand cashflow_terms array
SELECT
  extensions.uuid_generate_v5(
    extensions.uuid_ns_url(),
    'cashflow:' || d.id::text || ':' || (idx-1)::text
  ) AS id,
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
  '(2) versements de devis/facture (cashflow_terms JSONB), (3) cashflow_extras '
  'manuels. Étape 2/5 du refactor (WIP.md §11). Remplacera payment_events legacy '
  'au PR3 (lecture) puis PR4 (écriture).';
