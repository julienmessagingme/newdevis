-- ── Migration : Assistant conversationnel + pipeline photo WhatsApp ──────────
-- 1. Colonnes supplémentaires sur documents_chantier (WA source + Vision IA)
-- 2. Nouvelle table chantier_assistant_messages (conversation persistée)

-- ── documents_chantier — colonnes photo WhatsApp ─────────────────────────────

ALTER TABLE documents_chantier
  ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT,
  ADD COLUMN IF NOT EXISTS vision_description  TEXT,
  ADD COLUMN IF NOT EXISTS lot_override_reason TEXT;

-- Index pour fetch rapide des photos récentes (agent context)
CREATE INDEX IF NOT EXISTS idx_documents_wa_source
  ON documents_chantier (chantier_id, created_at DESC)
  WHERE source = 'whatsapp' AND document_type = 'photo';

-- ── chantier_assistant_messages ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chantier_assistant_messages (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id      UUID        NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  role             TEXT        NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content          TEXT,
  tool_calls       JSONB,
  tool_call_id     TEXT,
  agent_initiated  BOOLEAN     NOT NULL DEFAULT false,
  is_read          BOOLEAN     NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance: fetch conversation + unread badge
CREATE INDEX IF NOT EXISTS idx_assistant_messages_chantier
  ON chantier_assistant_messages (chantier_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_unread
  ON chantier_assistant_messages (chantier_id, is_read)
  WHERE NOT is_read;

-- ── RLS (pattern optimisé : sous-select evite eval auth.uid() par ligne) ─────

ALTER TABLE chantier_assistant_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY assistant_messages_select ON chantier_assistant_messages
  FOR SELECT USING (
    chantier_id IN (
      SELECT id FROM chantiers WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY assistant_messages_insert ON chantier_assistant_messages
  FOR INSERT WITH CHECK (
    chantier_id IN (
      SELECT id FROM chantiers WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY assistant_messages_update ON chantier_assistant_messages
  FOR UPDATE USING (
    chantier_id IN (
      SELECT id FROM chantiers WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY assistant_messages_delete ON chantier_assistant_messages
  FOR DELETE USING (
    chantier_id IN (
      SELECT id FROM chantiers WHERE user_id = (SELECT auth.uid())
    )
  );
