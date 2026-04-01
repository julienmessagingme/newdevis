-- supabase/migrations/20260401300000_whatsapp_messages_fixes.sql
-- Add missing RLS SELECT policy and composite index on chantier_whatsapp_messages
-- Add UNIQUE constraint on group_jid to prevent duplicate groups on retry

-- Defensive: ensure RLS is enabled before adding the policy
ALTER TABLE chantier_whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- RLS SELECT policy (was missing — all existing API routes use service_role so this
-- doesn't break anything, but protects against future anon-key queries)
-- DROP IF EXISTS makes this idempotent on re-run
DROP POLICY IF EXISTS "Users can read their own wa messages" ON chantier_whatsapp_messages;
CREATE POLICY "Users can read their own wa messages"
  ON chantier_whatsapp_messages FOR SELECT
  USING (chantier_id IN (SELECT id FROM chantiers WHERE user_id = auth.uid()));

-- Composite index for filtered queries by group JID
-- Used by GET /api/chantier/:id/whatsapp-messages?groupJid=xxx
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_chantier_group
  ON chantier_whatsapp_messages(chantier_id, group_id);

-- Prevent duplicate groups: two chantiers could theoretically share a JID if whapi
-- reuses IDs (unlikely), but more importantly this turns a partial-write retry
-- into a harmless no-op instead of silently creating a duplicate group.
ALTER TABLE chantier_whatsapp_groups
  ADD CONSTRAINT chantier_whatsapp_groups_group_jid_unique UNIQUE (group_jid);
