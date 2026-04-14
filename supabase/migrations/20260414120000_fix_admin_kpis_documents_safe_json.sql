-- ============================================================================
-- Fix: admin_kpis_documents — safe JSON cast
-- Date: 2026-04-14
-- Problème : raw_text::jsonb plantait si raw_text commence par '{' mais
-- contient du JSON invalide (ex: réponse Gemini tronquée).
-- Solution : fonction PL/pgSQL avec EXCEPTION pour un cast sans erreur.
-- ============================================================================

-- Fonction helper : parse JSON sans exception
CREATE OR REPLACE FUNCTION public.safe_jsonb(val TEXT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN val::jsonb;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- Accorder l'accès
GRANT EXECUTE ON FUNCTION public.safe_jsonb(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.safe_jsonb(TEXT) TO service_role;

-- ============================================================================
-- Recréer admin_kpis_documents avec safe_jsonb
-- ============================================================================
CREATE OR REPLACE VIEW public.admin_kpis_documents
WITH (security_invoker = on) AS
SELECT
  COUNT(*) FILTER (WHERE doc_type = 'devis_travaux' OR doc_type IS NULL) AS devis_travaux,
  COUNT(*) FILTER (WHERE doc_type = 'devis_diagnostic_immobilier')       AS devis_diagnostic,
  COUNT(*) FILTER (WHERE doc_type = 'devis_prestation_technique')        AS devis_prestation_technique,
  COUNT(*) FILTER (WHERE doc_type IN ('facture', 'autre'))               AS documents_refuses,
  COUNT(*)                                                                AS total
FROM (
  SELECT
    CASE
      WHEN raw_text IS NOT NULL AND raw_text LIKE '{%' THEN
        -- safe_jsonb retourne NULL si JSON invalide → pas de crash
        (public.safe_jsonb(raw_text) -> 'document_detection' ->> 'type')
      ELSE NULL
    END AS doc_type
  FROM public.analyses
  WHERE user_id NOT IN (
    SELECT user_id FROM public.user_roles WHERE role = 'admin'
  )
) sub;

GRANT SELECT ON public.admin_kpis_documents TO authenticated;
GRANT SELECT ON public.admin_kpis_documents TO service_role;
