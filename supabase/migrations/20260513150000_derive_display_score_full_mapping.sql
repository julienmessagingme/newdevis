-- ============================================================================
-- 20260513150000_derive_display_score_full_mapping.sql
-- ============================================================================
-- Corrige le mapping de derive_display_score qui ne reconnaissait pas les
-- valeurs réelles de `conclusion_ia.verdict_global`.
--
-- Bug détecté 2026-05-13 : un devis "Carrelage LEONARD" affichait Feu Vert
-- sur la page d'analyse mais Rouge dans l'admin. Cause : la version
-- précédente de derive_display_score ne reconnaissait que les valeurs du
-- set "verdict_decisionnel" (signer/refuser) et tombait en fallback legacy
-- pour les valeurs du set "verdict_global" mono-devis (dans_la_norme,
-- eleve_justifie, a_risque).
--
-- DEUX JEUX DE VALEURS coexistent dans `verdict_global` selon la source :
--
--   1. `conclusion_ia.verdict_global` (mono-devis, type ConclusionData) :
--      - "dans_la_norme"   → VERT
--      - "eleve_justifie"  → ORANGE
--      - "a_negocier"      → ORANGE
--      - "a_risque"        → ROUGE
--      (cf. src/pages/api/analyse/[id]/conclusion.ts:1253 GLOBAL_MAP)
--
--   2. `global_metrics.verdict_global` (multi-devis, calculé edge function) :
--      - "signer"          → VERT
--      - "a_negocier"      → ORANGE
--      - "refuser"         → ROUGE
--      (cf. analyze-quote/verdict-utils.ts computeGlobalFromSegments)
--
-- La fonction doit gérer LES DEUX SETS. Les anciennes valeurs
-- (signer_avec_negociation, ne_pas_signer) sont aussi conservées pour rétro-
-- compatibilité au cas où certaines analyses anciennes les ont stockées.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.derive_display_score(
  legacy_score      TEXT,
  conclusion_ia_txt TEXT,
  raw_text_txt      TEXT
) RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  conclusion_obj JSONB := NULL;
  raw_obj        JSONB := NULL;
  is_multi       BOOLEAN := FALSE;
  global_verdict TEXT := NULL;
  mono_verdict   TEXT := NULL;
BEGIN
  -- Parse conclusion_ia (TEXT JSON sérialisé)
  IF conclusion_ia_txt IS NOT NULL AND conclusion_ia_txt <> '' THEN
    BEGIN
      conclusion_obj := conclusion_ia_txt::JSONB;
    EXCEPTION WHEN OTHERS THEN
      conclusion_obj := NULL;
    END;
  END IF;

  -- Parse raw_text (TEXT JSON sérialisé)
  IF raw_text_txt IS NOT NULL AND raw_text_txt <> '' THEN
    BEGIN
      raw_obj := raw_text_txt::JSONB;
    EXCEPTION WHEN OTHERS THEN
      raw_obj := NULL;
    END;
  END IF;

  -- Multi-devis : raw_obj.document_detection.multiple_quotes OU raw_obj.multiple_quotes
  IF raw_obj IS NOT NULL THEN
    is_multi := COALESCE(raw_obj #>> '{document_detection,multiple_quotes}', '') = 'true'
             OR COALESCE(raw_obj ->> 'multiple_quotes', '')                    = 'true';
    IF is_multi THEN
      global_verdict := raw_obj #>> '{global_metrics,verdict_global}';
    END IF;
  END IF;

  -- Mono-devis verdict
  IF conclusion_obj IS NOT NULL THEN
    mono_verdict := conclusion_obj ->> 'verdict_global';
  END IF;

  -- Priorité multi → mono → legacy
  IF is_multi AND global_verdict IS NOT NULL THEN
    -- Mapping global_metrics.verdict_global (set #2)
    RETURN CASE global_verdict
      WHEN 'signer'                  THEN 'VERT'
      WHEN 'a_negocier'              THEN 'ORANGE'
      WHEN 'refuser'                 THEN 'ROUGE'
      -- Compat éventuelle (legacy stockages anciens)
      WHEN 'signer_avec_negociation' THEN 'ORANGE'
      WHEN 'ne_pas_signer'           THEN 'ROUGE'
      -- Compat set #1 au cas où multi-devis aurait stocké set #1
      WHEN 'dans_la_norme'           THEN 'VERT'
      WHEN 'eleve_justifie'          THEN 'ORANGE'
      WHEN 'a_risque'                THEN 'ROUGE'
      ELSE legacy_score
    END;
  END IF;

  IF mono_verdict IS NOT NULL THEN
    -- Mapping conclusion_ia.verdict_global (set #1 — FIX du bug)
    RETURN CASE mono_verdict
      WHEN 'dans_la_norme'           THEN 'VERT'
      WHEN 'eleve_justifie'          THEN 'ORANGE'
      WHEN 'a_negocier'              THEN 'ORANGE'
      WHEN 'a_risque'                THEN 'ROUGE'
      -- Compat set #2 au cas où conclusion_ia aurait stocké set #2
      WHEN 'signer'                  THEN 'VERT'
      WHEN 'refuser'                 THEN 'ROUGE'
      WHEN 'signer_avec_negociation' THEN 'ORANGE'
      WHEN 'ne_pas_signer'           THEN 'ROUGE'
      ELSE legacy_score
    END;
  END IF;

  RETURN legacy_score;
END;
$$;

COMMENT ON FUNCTION public.derive_display_score(TEXT, TEXT, TEXT) IS
  'V3.4.8 (2026-05-13) — Convertit le verdict canonique vers le score affichable VERT/ORANGE/ROUGE. Gère les DEUX sets de valeurs de verdict_global : (1) conclusion_ia.verdict_global utilise dans_la_norme/eleve_justifie/a_negocier/a_risque ; (2) global_metrics.verdict_global utilise signer/a_negocier/refuser. Fallback sur legacy_score si aucun verdict canonique disponible. Source unique de vérité pour tous les KPI admin (admin_kpis_scoring, admin_kpis_daily_evolution, admin_kpis_weekly_evolution).';
