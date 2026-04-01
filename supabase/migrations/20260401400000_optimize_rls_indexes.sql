-- supabase/migrations/20260401400000_optimize_rls_indexes.sql
-- ============================================================================
-- Audit post-WhatsApp multi-group : optimisations RLS + index FK manquants
--
-- Deux types de fix :
-- 1. RLS performance : auth.uid() → (select auth.uid())
--    auth.uid() est évalué une fois PAR LIGNE. (select auth.uid()) est évalué
--    une seule fois par requête et mis en cache → jusqu'à 100x plus rapide.
--    Référence : https://supabase.com/docs/guides/database/postgres/row-level-security#rls-performance-recommendations
--
-- 2. Index FK manquants : Postgres n'indexe PAS automatiquement les colonnes FK.
--    Sans index, chaque ON DELETE CASCADE / JOIN / WHERE sur la FK fait un seq scan.
-- ============================================================================

-- ============================================================================
-- PARTIE 1 — RLS : contacts_chantier (4 policies)
-- Créées dans 20260323120000 avec auth.uid() non wrappé.
-- ============================================================================

DROP POLICY IF EXISTS "contacts_chantier_select" ON contacts_chantier;
CREATE POLICY "contacts_chantier_select" ON contacts_chantier
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "contacts_chantier_insert" ON contacts_chantier;
CREATE POLICY "contacts_chantier_insert" ON contacts_chantier
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "contacts_chantier_update" ON contacts_chantier;
CREATE POLICY "contacts_chantier_update" ON contacts_chantier
  FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "contacts_chantier_delete" ON contacts_chantier;
CREATE POLICY "contacts_chantier_delete" ON contacts_chantier
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ============================================================================
-- PARTIE 2 — RLS : chantier_updates (2 policies)
-- Créées dans 20260309120000 — EXISTS + auth.uid() non wrappé.
-- ============================================================================

DROP POLICY IF EXISTS "chantier_updates_select" ON chantier_updates;
CREATE POLICY "chantier_updates_select" ON chantier_updates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chantiers
      WHERE id = chantier_updates.chantier_id
        AND user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "chantier_updates_insert" ON chantier_updates;
CREATE POLICY "chantier_updates_insert" ON chantier_updates
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM chantiers
      WHERE id = chantier_updates.chantier_id
        AND user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- PARTIE 3 — RLS : chantier_conversations + chantier_messages
-- Créées dans 20260325130000 avec auth.uid() non wrappé.
-- ============================================================================

DROP POLICY IF EXISTS "Users manage own conversations" ON chantier_conversations;
CREATE POLICY "Users manage own conversations"
  ON chantier_conversations FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage own messages" ON chantier_messages;
CREATE POLICY "Users manage own messages"
  ON chantier_messages FOR ALL
  USING (
    conversation_id IN (
      SELECT id FROM chantier_conversations
      WHERE user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- PARTIE 4 — RLS : chantier_whatsapp_groups + chantier_whatsapp_members
-- Créées dans 20260401200000 avec auth.uid() non wrappé.
-- ============================================================================

DROP POLICY IF EXISTS "Users can read their own wa groups" ON chantier_whatsapp_groups;
CREATE POLICY "Users can read their own wa groups"
  ON chantier_whatsapp_groups FOR SELECT
  USING (
    chantier_id IN (
      SELECT id FROM chantiers
      WHERE user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can read their own wa members" ON chantier_whatsapp_members;
CREATE POLICY "Users can read their own wa members"
  ON chantier_whatsapp_members FOR SELECT
  USING (
    group_id IN (
      SELECT g.id FROM chantier_whatsapp_groups g
      JOIN chantiers c ON c.id = g.chantier_id
      WHERE c.user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- PARTIE 5 — RLS : chantier_whatsapp_messages
-- Policy créée dans 20260401300000 (idempotent : DROP IF EXISTS)
-- ============================================================================

DROP POLICY IF EXISTS "Users can read their own wa messages" ON chantier_whatsapp_messages;
CREATE POLICY "Users can read their own wa messages"
  ON chantier_whatsapp_messages FOR SELECT
  USING (
    chantier_id IN (
      SELECT id FROM chantiers
      WHERE user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- PARTIE 6 — INDEX FK MANQUANTS
-- Postgres n'indexe pas automatiquement les colonnes FK.
-- Critique pour les ON DELETE CASCADE et les JOIN/WHERE dans les RLS.
-- ============================================================================

-- chantier_whatsapp_members.group_id → le plus critique :
--   - webhook: .eq('group_id', ...) → seq scan sans index
--   - RLS members: subquery sur group_id
--   - ON DELETE CASCADE depuis chantier_whatsapp_groups
CREATE INDEX IF NOT EXISTS idx_wa_members_group_id
  ON chantier_whatsapp_members(group_id);

-- chantier_conversations.contact_id → ON DELETE SET NULL + JOIN messager
CREATE INDEX IF NOT EXISTS idx_conv_contact_id
  ON chantier_conversations(contact_id);

-- contacts_chantier.lot_id → ON DELETE SET NULL depuis lots_chantier
CREATE INDEX IF NOT EXISTS idx_contacts_lot_id
  ON contacts_chantier(lot_id);

-- contacts_chantier.devis_id → ON DELETE SET NULL depuis devis_chantier
CREATE INDEX IF NOT EXISTS idx_contacts_devis_id
  ON contacts_chantier(devis_id);

-- contacts_chantier.analyse_id → ON DELETE SET NULL depuis analyses
CREATE INDEX IF NOT EXISTS idx_contacts_analyse_id
  ON contacts_chantier(analyse_id);
