-- Migration: WhatsApp read receipts tracking
-- Permet à l'agent IA de savoir si un artisan a lu les messages envoyés

-- Table 1: Messages WhatsApp sortants avec leur ID whapi
CREATE TABLE IF NOT EXISTS whatsapp_outgoing_messages (
  id          TEXT PRIMARY KEY,                                   -- ID whapi retourné à l'envoi (ex: "PsrSJ7ETb...")
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  group_jid   TEXT NOT NULL,                                     -- JID groupe destinataire (XXX@g.us)
  body        TEXT NOT NULL,                                     -- Corps du message envoyé
  run_type    TEXT CHECK (run_type IN ('evening', 'morning', 'manual')),
  sent_by     TEXT NOT NULL DEFAULT 'agent',                     -- 'agent' | 'user'
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_outgoing_chantier ON whatsapp_outgoing_messages(chantier_id, sent_at DESC);
CREATE INDEX idx_outgoing_group    ON whatsapp_outgoing_messages(group_jid, sent_at DESC);

-- RLS: lecture user-scoped via join chantiers
ALTER TABLE whatsapp_outgoing_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own outgoing messages"
  ON whatsapp_outgoing_messages FOR SELECT
  USING (
    chantier_id IN (
      SELECT id FROM chantiers WHERE user_id = (SELECT auth.uid())
    )
  );

-- Table 2: Statuts de lecture par message × participant
CREATE TABLE IF NOT EXISTS whatsapp_message_statuses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   TEXT NOT NULL REFERENCES whatsapp_outgoing_messages(id) ON DELETE CASCADE,
  chantier_id  UUID NOT NULL,                                    -- Dénormalisé pour RLS + query rapide
  viewer_id    TEXT NOT NULL,                                    -- JID individuel (33XXXXXXXXX@s.whatsapp.net)
  viewer_phone TEXT GENERATED ALWAYS AS (split_part(viewer_id, '@', 1)) STORED,  -- Pour join contacts
  status       TEXT NOT NULL CHECK (status IN ('sent', 'delivered', 'read', 'played')),
  status_code  INT,                                              -- 1=sent, 2=delivered, 3=read, 4=played (raw whapi)
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, viewer_id)
);

CREATE INDEX idx_statuses_chantier ON whatsapp_message_statuses(chantier_id, updated_at DESC);
CREATE INDEX idx_statuses_message  ON whatsapp_message_statuses(message_id);
CREATE INDEX idx_statuses_viewer   ON whatsapp_message_statuses(viewer_phone);

-- RLS: lecture user-scoped via chantier_id
ALTER TABLE whatsapp_message_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own message statuses"
  ON whatsapp_message_statuses FOR SELECT
  USING (
    chantier_id IN (
      SELECT id FROM chantiers WHERE user_id = (SELECT auth.uid())
    )
  );
