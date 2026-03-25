-- ============================================================
-- Migration : tables chantier_conversations + chantier_messages
-- Système de messagerie intégré au module chantier.
-- Une conversation par contact par chantier, avec fil de messages.
-- ============================================================

-- Conversations (1 par contact par chantier)
CREATE TABLE IF NOT EXISTS public.chantier_conversations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id     UUID        NOT NULL REFERENCES public.chantiers(id) ON DELETE CASCADE,
  contact_id      UUID        REFERENCES public.contacts_chantier(id) ON DELETE SET NULL,
  user_id         UUID        NOT NULL,
  contact_name    TEXT        NOT NULL,
  contact_email   TEXT        NOT NULL,
  contact_phone   TEXT,
  reply_address   TEXT        NOT NULL UNIQUE,
  last_message_at TIMESTAMPTZ,
  unread_count    INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conv_chantier_id  ON public.chantier_conversations(chantier_id);
CREATE INDEX idx_conv_user_id      ON public.chantier_conversations(user_id);

-- Messages (fil de discussion)
CREATE TABLE IF NOT EXISTS public.chantier_messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES public.chantier_conversations(id) ON DELETE CASCADE,
  direction       TEXT        NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  subject         TEXT,
  body_text       TEXT        NOT NULL,
  body_html       TEXT,
  sendgrid_id     TEXT,
  status          TEXT        NOT NULL DEFAULT 'sent' CHECK (status IN ('draft', 'sent', 'delivered', 'failed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_msg_conversation_id ON public.chantier_messages(conversation_id);
CREATE INDEX idx_msg_created_at      ON public.chantier_messages(created_at);

-- RLS
ALTER TABLE public.chantier_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chantier_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own conversations"
  ON public.chantier_conversations FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Users manage own messages"
  ON public.chantier_messages FOR ALL
  USING (
    conversation_id IN (
      SELECT id FROM public.chantier_conversations WHERE user_id = auth.uid()
    )
  );
