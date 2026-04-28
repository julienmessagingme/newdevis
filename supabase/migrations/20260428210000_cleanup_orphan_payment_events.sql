-- =============================================================================
-- Migration : cleanup payment_events orphelins
-- =============================================================================
-- Suppression des payment_events qui :
--   - pointent vers un documents_chantier supprimé (source_id orphelin), OU
--   - pointent vers un chantier supprimé (project_id orphelin — le ON DELETE
--     CASCADE n'a pas toujours fonctionné dans le passé)
--
-- Étape préalable au refactor cashflow PR2/5 : sans cleanup, le backfill de
-- documents_chantier.cashflow_terms perdrait silencieusement 152k€ d'events
-- pendant que la VIEW les ferait disparaître.
--
-- Données supprimées en prod (analysées avant cleanup) :
--   * 24 events / 147 602€ — chantier "Portail, Clôture et Terrasse Bois"
--     (devis re-uploadés en boucle pendant les tests dev)
--   * 4 events / 4 067€ — chantier supprimé (CASCADE foiré historiquement)
--   * 1 event / 438€ — chantier "Rénovation complète maison et IPN"
--   Total : 29 events / 152 107€
--
-- Idempotent : si re-run, 0 row supprimé (les FK sont valides après cleanup).
-- =============================================================================
DO $$
DECLARE
  deleted_orphan_doc INT;
  deleted_orphan_chantier INT;
BEGIN
  -- Branche 1 : source_id orphelin (devis/facture)
  WITH d AS (
    DELETE FROM public.payment_events pe
    WHERE pe.source_type IN ('devis', 'facture')
      AND NOT EXISTS (
        SELECT 1 FROM public.documents_chantier doc WHERE doc.id = pe.source_id
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_orphan_doc FROM d;

  -- Branche 2 : project_id orphelin (chantier supprimé)
  WITH d AS (
    DELETE FROM public.payment_events pe
    WHERE NOT EXISTS (
      SELECT 1 FROM public.chantiers c WHERE c.id = pe.project_id
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_orphan_chantier FROM d;

  RAISE NOTICE 'payment_events cleanup — orphan_doc: %, orphan_chantier: %',
    deleted_orphan_doc, deleted_orphan_chantier;
END $$;
