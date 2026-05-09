-- supabase/migrations/20260509133525_rls_wrap_remaining_auth_uid_and_drop_duplicates.sql
-- ============================================================================
-- RLS audit suite — issu de l'audit scalabilité 2026-05-09.
--
-- Le advisor performance Supabase a identifié 18 policies utilisant
-- `auth.uid()` non wrappé (lint `auth_rls_initplan`) après les fixes
-- partiels de 20260401400000_optimize_rls_indexes.sql. Cause : tables
-- créées avant la convention `(select auth.uid())` ou jamais migrées.
-- Sans le wrapping, auth.uid() est ré-évalué pour CHAQUE ligne de la
-- requête (peut être ~100x plus lent à l'échelle 100k+ rows).
--
-- En complément : 7 policies doublons (résultat de renaming ou migration
-- en 2 vagues sans drop de l'ancienne version) sont supprimées. Le
-- advisor remonte ces doublons en `multiple_permissive_policies` —
-- chaque doublon augmente le coût RLS sur chaque query.
--
-- Sécurité : 100% des wrappings préservent la sémantique (même condition,
-- même résultat fonctionnel — uniquement la performance change). Les
-- drops de doublons ciblent uniquement des policies dont une jumelle
-- fonctionnellement équivalente existe déjà.
-- ============================================================================

-- ============================================================================
-- PARTIE 1 — Wrap auth.uid() : 18 policies sur 6 tables
-- ============================================================================

-- chantiers (4 policies)
DROP POLICY IF EXISTS "chantiers_select_own" ON public.chantiers;
CREATE POLICY "chantiers_select_own" ON public.chantiers
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "chantiers_insert_own" ON public.chantiers;
CREATE POLICY "chantiers_insert_own" ON public.chantiers
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "chantiers_update_own" ON public.chantiers;
CREATE POLICY "chantiers_update_own" ON public.chantiers
  FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "chantiers_delete_own" ON public.chantiers;
CREATE POLICY "chantiers_delete_own" ON public.chantiers
  FOR DELETE USING ((select auth.uid()) = user_id);

-- subscriptions (3 policies wrappées + 1 doublon dropé)
DROP POLICY IF EXISTS "subscriptions_select_own" ON public.subscriptions;
CREATE POLICY "subscriptions_select_own" ON public.subscriptions
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "subscriptions_insert_own" ON public.subscriptions;
CREATE POLICY "subscriptions_insert_own" ON public.subscriptions
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "subscriptions_update_own" ON public.subscriptions;
CREATE POLICY "subscriptions_update_own" ON public.subscriptions
  FOR UPDATE USING ((select auth.uid()) = user_id);

-- "Users can read own subscription" : doublon fonctionnel de subscriptions_select_own
DROP POLICY IF EXISTS "Users can read own subscription" ON public.subscriptions;

-- journal_entries (4 policies, EXISTS sur chantiers.user_id)
DROP POLICY IF EXISTS "journal_entries_select_own" ON public.journal_entries;
CREATE POLICY "journal_entries_select_own" ON public.journal_entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chantiers
      WHERE chantiers.id = journal_entries.chantier_id
        AND chantiers.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "journal_entries_insert_own" ON public.journal_entries;
CREATE POLICY "journal_entries_insert_own" ON public.journal_entries
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chantiers
      WHERE chantiers.id = journal_entries.chantier_id
        AND chantiers.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "journal_entries_update_own" ON public.journal_entries;
CREATE POLICY "journal_entries_update_own" ON public.journal_entries
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.chantiers
      WHERE chantiers.id = journal_entries.chantier_id
        AND chantiers.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "journal_entries_delete_own" ON public.journal_entries;
CREATE POLICY "journal_entries_delete_own" ON public.journal_entries
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.chantiers
      WHERE chantiers.id = journal_entries.chantier_id
        AND chantiers.user_id = (select auth.uid())
    )
  );

-- relances (4 policies, EXISTS sur chantiers.user_id)
DROP POLICY IF EXISTS "relances_select_own" ON public.relances;
CREATE POLICY "relances_select_own" ON public.relances
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chantiers
      WHERE chantiers.id = relances.chantier_id
        AND chantiers.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "relances_insert_own" ON public.relances;
CREATE POLICY "relances_insert_own" ON public.relances
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chantiers
      WHERE chantiers.id = relances.chantier_id
        AND chantiers.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "relances_update_own" ON public.relances;
CREATE POLICY "relances_update_own" ON public.relances
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.chantiers
      WHERE chantiers.id = relances.chantier_id
        AND chantiers.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "relances_delete_own" ON public.relances;
CREATE POLICY "relances_delete_own" ON public.relances
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.chantiers
      WHERE chantiers.id = relances.chantier_id
        AND chantiers.user_id = (select auth.uid())
    )
  );

-- lots_chantier (1 policy, IN SELECT sur chantiers.user_id)
DROP POLICY IF EXISTS "lots_chantier_owner" ON public.lots_chantier;
CREATE POLICY "lots_chantier_owner" ON public.lots_chantier
  FOR ALL
  USING (
    chantier_id IN (
      SELECT chantiers.id FROM public.chantiers
      WHERE chantiers.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    chantier_id IN (
      SELECT chantiers.id FROM public.chantiers
      WHERE chantiers.user_id = (select auth.uid())
    )
  );

-- chantier_whatsapp_messages : doublon de "Users can read their own wa messages"
-- (la version "wa messages" est déjà wrappée correctement, on garde celle-là).
DROP POLICY IF EXISTS "Users can read their own chantier whatsapp messages" ON public.chantier_whatsapp_messages;

-- ============================================================================
-- PARTIE 2 — Drop des doublons multiple_permissive_policies sur analyses
-- (lint Supabase advisor — à chaque query la policy effectivement matchée
--  est OR-évaluée avec sa jumelle, ce qui multiplie le coût)
-- ============================================================================

-- analyses : "Users can ... their own analyses" doublons fonctionnels des
-- "Users can ... own analyses". On garde la version courte (existe en premier
-- dans l'historique des migrations).
DROP POLICY IF EXISTS "Users can delete their own analyses" ON public.analyses;
DROP POLICY IF EXISTS "Users can create their own analyses" ON public.analyses;
DROP POLICY IF EXISTS "Users can view their own analyses" ON public.analyses;
DROP POLICY IF EXISTS "Users can update their own analyses" ON public.analyses;

-- analysis_work_items : 2 policies SELECT équivalentes (EXISTS vs IN sur
-- même clé). On garde l'EXISTS qui est plus efficace en général sur des
-- relations 1-N filtrées.
DROP POLICY IF EXISTS "Users can view work items for own analyses" ON public.analysis_work_items;

-- ============================================================================
-- VÉRIFICATION POST-MIGRATION (à exécuter manuellement après apply) :
--
--   SELECT COUNT(*) FROM pg_policies
--   WHERE schemaname = 'public'
--     AND ((qual ~ '\bauth\.uid\(\)' AND qual !~ '\(\s*select\s+auth\.uid\(\)')
--      OR (with_check ~ '\bauth\.uid\(\)' AND with_check !~ '\(\s*select\s+auth\.uid\(\)'));
--
-- Doit retourner 0.
--
-- Tables non traitées dans cette migration (multiple_permissive_policies
-- restants) : price_observations, post_signature_tracking, blog_posts,
-- document_extractions, dvf_prices, user_roles. À examiner case par case
-- dans une prochaine session — chacun de ces cas implique une décision
-- de conception (RESTRICTIVE vs PERMISSIVE, segmentation par rôle).
-- ============================================================================
