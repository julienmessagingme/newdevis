-- ============================================================================
-- Performance optimization: add missing composite indexes
-- Based on query pattern analysis across API routes and hooks
-- ============================================================================

-- 1. devis_chantier: dashboard loads ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_devis_chantier_chantier_created
  ON devis_chantier(chantier_id, created_at DESC);

-- 2. devis_chantier: filtering by status (valide, en_attente, refuse)
CREATE INDEX IF NOT EXISTS idx_devis_chantier_chantier_statut
  ON devis_chantier(chantier_id, statut);

-- 3. chantier_conversations: ordered by most recent message
CREATE INDEX IF NOT EXISTS idx_conv_chantier_last_message
  ON chantier_conversations(chantier_id, last_message_at DESC NULLS LAST);

-- 4. chantier_messages: thread loading ordered by date
--    Replaces the single-column idx_msg_created_at with a composite
CREATE INDEX IF NOT EXISTS idx_msg_conversation_created
  ON chantier_messages(conversation_id, created_at DESC);

-- 5. chantiers: user dashboard listing
CREATE INDEX IF NOT EXISTS idx_chantiers_user_created
  ON chantiers(user_id, created_at DESC);

-- 6. contacts_chantier: prevent duplicate emails per chantier
--    Partial unique — only enforced when email is not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_chantier_email_unique
  ON contacts_chantier(chantier_id, email)
  WHERE email IS NOT NULL AND email != '';

-- 7. Drop the now-redundant single-column index on chantier_messages.created_at
--    (superseded by the composite idx_msg_conversation_created)
DROP INDEX IF EXISTS idx_msg_created_at;
