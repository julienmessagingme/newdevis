-- ═════════════════════════════════════════════════════════════════════════════
-- Phase 3.2 — Table extract_comparisons (shadow run extract_v2)
-- ═════════════════════════════════════════════════════════════════════════════
-- Date           : 2026-06-24
-- But            : collecter les divergences entre extract.ts v1 (prod) et
--                  extract_v2.ts (nouveau pipeline structure-d'abord) pendant
--                  la période shadow run (Phase 3.2) avant bascule (Phase 3.3).
-- Source         : docs/refonte/PHASE3-ARCHITECTURE.md §7 "Stratégie de
--                  déploiement progressif"
--
-- Mode shadow :
--   1. L'utilisateur reçoit la réponse calculée par V1 (comportement actuel)
--   2. Après réponse, V2 tourne en background (EdgeRuntime.waitUntil)
--   3. V2 termine → on calcule un diff structuré V1 vs V2
--   4. On INSERT dans extract_comparisons (jamais consulté côté UI)
--
-- Workflow d'analyse (Julien) :
--   scripts/phase3-analyze-shadow.ts produit un rapport markdown des
--   divergences récurrentes après 50-100 analyses shadow.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.extract_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Lien vers l'analyse d'origine
  analysis_id UUID NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  file_name TEXT,

  -- Snapshots des deux extractions (JSON complet)
  extract_v1 JSONB NOT NULL,
  extract_v2 JSONB NOT NULL,

  -- Diff calculé (résumé structuré, voir helpers diffExtractions dans index.ts)
  -- Format :
  -- {
  --   "totaux_ht_diff": 0 | <ecart>,
  --   "totaux_ttc_diff": 0 | <ecart>,
  --   "nb_travaux_v1": <n>,
  --   "nb_travaux_v2": <n>,
  --   "nb_travaux_diff": <delta>,
  --   "iban_match": true | false,
  --   "siret_match": true | false,
  --   "type_document_match": true | false,
  --   "is_foreign_match": true | false,
  --   "is_incomplete_match": true | false,
  --   "lignes_added": [...],      -- lignes dans v2 mais pas dans v1
  --   "lignes_removed": [...],    -- lignes dans v1 mais pas dans v2
  --   "lignes_modified": [...],   -- lignes communes mais montant/qty/prix_u différent
  --   "confiance_globale_v2": "certifie" | "indicatif" | "non_comparable",
  --   "summary": "court résumé textuel pour scan rapide"
  -- }
  diff JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Métadonnées
  v1_engine_version TEXT,  -- version de extract.ts au moment du shadow
  v2_engine_version TEXT,  -- "v2-prompt-structure-first"
  v1_duration_ms INTEGER,  -- temps d'exécution V1
  v2_duration_ms INTEGER,  -- temps d'exécution V2
  v2_success BOOLEAN NOT NULL DEFAULT FALSE,  -- false si V2 a échoué
  v2_error TEXT,  -- message d'erreur si V2 a échoué

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour rapports rapides
CREATE INDEX IF NOT EXISTS extract_comparisons_created_at_idx
  ON public.extract_comparisons (created_at DESC);

CREATE INDEX IF NOT EXISTS extract_comparisons_analysis_id_idx
  ON public.extract_comparisons (analysis_id);

CREATE INDEX IF NOT EXISTS extract_comparisons_v2_success_idx
  ON public.extract_comparisons (v2_success);

-- Index partiel sur les divergences majeures (utile pour scan rapide)
-- Une divergence est "majeure" si totaux divergent OU nb travaux différent OU iban/siret/type différents
CREATE INDEX IF NOT EXISTS extract_comparisons_diff_majeure_idx
  ON public.extract_comparisons (created_at DESC)
  WHERE (diff->>'iban_match')::boolean = false
     OR (diff->>'siret_match')::boolean = false
     OR (diff->>'type_document_match')::boolean = false
     OR (diff->>'is_foreign_match')::boolean = false;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS : pas de lecture publique. Seuls les admins peuvent consulter.
-- service_role bypass (l'edge function écrit via service_role).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.extract_comparisons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS extract_comparisons_select_admin ON public.extract_comparisons;
CREATE POLICY extract_comparisons_select_admin
  ON public.extract_comparisons
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
        AND user_roles.role = 'admin'
    )
  );

-- INSERT : service_role uniquement (edge function). Pas de policy nécessaire
-- car le service_role bypass RLS. Mais on ne crée PAS de policy permissive
-- pour les autres rôles → pas d'INSERT depuis le frontend.

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérification finale
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'extract_comparisons'
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'Table extract_comparisons non créée';
  END IF;
  RAISE NOTICE '✓ Table extract_comparisons créée';
  RAISE NOTICE '✓ 4 indexes créés (created_at, analysis_id, v2_success, diff_majeure partial)';
  RAISE NOTICE '✓ RLS activée (SELECT admin uniquement)';
END $$;

COMMIT;
