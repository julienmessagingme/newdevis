-- ============================================================================
-- Migration: Optimize ALL RLS policies for performance
--
-- Problem: auth.uid() called per-row instead of once per query.
-- Fix: Wrap in (select auth.uid()) to cache the value.
-- Impact: Up to 100x faster on large tables.
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#rls-performance-recommendations
-- ============================================================================

-- ============================================================================
-- 1. TABLE: analyses (4 policies)
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own analyses" ON public.analyses;
CREATE POLICY "Users can view their own analyses"
  ON public.analyses FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own analyses" ON public.analyses;
CREATE POLICY "Users can create their own analyses"
  ON public.analyses FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own analyses" ON public.analyses;
CREATE POLICY "Users can update their own analyses"
  ON public.analyses FOR UPDATE
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own analyses" ON public.analyses;
CREATE POLICY "Users can delete their own analyses"
  ON public.analyses FOR DELETE
  USING ((select auth.uid()) = user_id);

-- ============================================================================
-- 2. TABLE: analysis_work_items (1 policy — subquery + auth.uid() combo)
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own work items" ON public.analysis_work_items;
CREATE POLICY "Users can view own work items"
  ON public.analysis_work_items FOR SELECT
  USING (analysis_id IN (
    SELECT id FROM public.analyses WHERE user_id = (select auth.uid())
  ));

-- ============================================================================
-- 3. TABLE: post_signature_tracking (3 policies)
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own tracking" ON public.post_signature_tracking;
CREATE POLICY "Users can view their own tracking"
  ON public.post_signature_tracking FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own tracking" ON public.post_signature_tracking;
CREATE POLICY "Users can create their own tracking"
  ON public.post_signature_tracking FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own tracking" ON public.post_signature_tracking;
CREATE POLICY "Users can update their own tracking"
  ON public.post_signature_tracking FOR UPDATE
  USING ((select auth.uid()) = user_id);

-- ============================================================================
-- 4. TABLE: price_observations (4 policies)
-- ============================================================================

DROP POLICY IF EXISTS "admin_read_price_observations" ON public.price_observations;
CREATE POLICY "admin_read_price_observations"
  ON public.price_observations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = (select auth.uid())
        AND user_roles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "user_read_own_price_observations" ON public.price_observations;
CREATE POLICY "user_read_own_price_observations"
  ON public.price_observations FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "user_insert_own_price_observations" ON public.price_observations;
CREATE POLICY "user_insert_own_price_observations"
  ON public.price_observations FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "user_update_own_price_observations" ON public.price_observations;
CREATE POLICY "user_update_own_price_observations"
  ON public.price_observations FOR UPDATE
  USING ((select auth.uid()) = user_id);

-- ============================================================================
-- 5. TABLE: document_extractions (2 policies)
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own extractions" ON public.document_extractions;
CREATE POLICY "Users can view their own extractions"
  ON public.document_extractions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.analyses
      WHERE analyses.id = document_extractions.analysis_id
        AND analyses.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins can view all extractions" ON public.document_extractions;
CREATE POLICY "Admins can view all extractions"
  ON public.document_extractions FOR SELECT
  USING ((select public.is_admin()));

-- ============================================================================
-- 6. TABLE: user_roles (2 policies)
-- ============================================================================

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING ((select public.has_role((select auth.uid()), 'admin')));

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING ((select public.has_role((select auth.uid()), 'admin')))
  WITH CHECK ((select public.has_role((select auth.uid()), 'admin')));

-- ============================================================================
-- 7. STORAGE: devis bucket (3 policies)
-- ============================================================================

DROP POLICY IF EXISTS "Users can upload their own quotes" ON storage.objects;
CREATE POLICY "Users can upload their own quotes"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'devis'
    AND (select auth.uid())::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can view their own quotes" ON storage.objects;
CREATE POLICY "Users can view their own quotes"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'devis'
    AND (select auth.uid())::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete their own quotes" ON storage.objects;
CREATE POLICY "Users can delete their own quotes"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'devis'
    AND (select auth.uid())::text = (storage.foldername(name))[1]
  );

-- ============================================================================
-- 8. STORAGE: blog-images bucket (3 policies)
-- ============================================================================

DROP POLICY IF EXISTS "Admins can upload blog images" ON storage.objects;
CREATE POLICY "Admins can upload blog images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'blog-images'
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = (select auth.uid())
        AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update blog images" ON storage.objects;
CREATE POLICY "Admins can update blog images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'blog-images'
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = (select auth.uid())
        AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete blog images" ON storage.objects;
CREATE POLICY "Admins can delete blog images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'blog-images'
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = (select auth.uid())
        AND role = 'admin'
    )
  );

-- ============================================================================
-- 9. FUNCTION: Optimize is_admin() to cache auth.uid()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = (select auth.uid())
      AND role = 'admin'
  )
$$;
