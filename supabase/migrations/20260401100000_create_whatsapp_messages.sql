-- supabase/migrations/20260401100000_create_whatsapp_messages.sql

CREATE TABLE IF NOT EXISTS chantier_whatsapp_messages (
  id          TEXT PRIMARY KEY,
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  group_id    TEXT NOT NULL,
  from_number TEXT NOT NULL,
  from_me     BOOLEAN NOT NULL DEFAULT false,
  type        TEXT NOT NULL DEFAULT 'text',
  body        TEXT,
  media_url   TEXT,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_chantier
  ON chantier_whatsapp_messages(chantier_id, timestamp DESC);

ALTER TABLE chantier_whatsapp_messages ENABLE ROW LEVEL SECURITY;
