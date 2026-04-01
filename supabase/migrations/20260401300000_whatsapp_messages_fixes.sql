-- supabase/migrations/20260401300000_whatsapp_messages_fixes.sql
-- Add missing RLS SELECT policy and composite index on chantier_whatsapp_messages

-- RLS SELECT policy (was missing — all existing API routes use service_role so this
-- doesn't break anything, but protects against future anon-key queries)
CREATE POLICY "Users can read their own wa messages"
  ON chantier_whatsapp_messages FOR SELECT
  USING (chantier_id IN (SELECT id FROM chantiers WHERE user_id = auth.uid()));

-- Composite index for filtered queries by group JID
-- Used by GET /api/chantier/:id/whatsapp-messages?groupJid=xxx
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_chantier_group
  ON chantier_whatsapp_messages(chantier_id, group_id);
