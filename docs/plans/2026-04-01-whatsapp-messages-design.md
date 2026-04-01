# WhatsApp Group Messages — Design Document

## Goal

Allow users to read WhatsApp group messages from their chantier group inside the Messagerie tab, without leaving the app.

## Validated Design

### Data Layer

**New table: `chantier_whatsapp_messages`**

```sql
CREATE TABLE chantier_whatsapp_messages (
  id          TEXT PRIMARY KEY,       -- whapi message ID (wamid.XXX)
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  group_id    TEXT NOT NULL,          -- WhatsApp group JID (120363XXX@g.us)
  from_number TEXT NOT NULL,          -- sender phone (e.g. "33612345678")
  from_me     BOOLEAN NOT NULL DEFAULT false,
  type        TEXT NOT NULL DEFAULT 'text',  -- text | image | document | audio | video
  body        TEXT,                   -- message text or caption or filename
  media_url   TEXT,                   -- whapi pre-signed download URL (for media types)
  timestamp   TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_whatsapp_messages_chantier ON chantier_whatsapp_messages(chantier_id, timestamp DESC);
```

RLS: service_role only (webhook writes with service key, reads via API route that does ownership check).

### Webhook: `POST /api/webhooks/whapi`

- No JWT required (like SendGrid inbound-email webhook)
- Receives whapi webhook events
- Payload: `{ messages: [{ id, from, to, type, from_me, timestamp, text?, image?, document?, audio?, video? }] }`
- Only process messages where `to` ends with `@g.us` (group messages)
- Lookup `chantiers` by `whatsapp_group_id = message.to` to get `chantier_id`
- Extract body: `text.body` (text), `image.caption` (image), `document.filename` (document)
- Extract media_url: `image.link`, `document.link`, etc. (whapi provides pre-signed URLs)
- INSERT ... ON CONFLICT (id) DO NOTHING (idempotent)
- Returns 200 OK always (whapi retries on non-2xx)

### API: `GET /api/chantier/[id]/whatsapp-messages`

- JWT auth + ownership check (via `requireChantierAuth`)
- Returns last 50 messages ordered by timestamp ASC (so UI can render top-to-bottom)
- Response: `{ messages: WhatsAppMessage[] }`

### UI: WhatsApp entry in MessagerieSection

**Left column** — new entry at TOP of the contacts list (above contact rows, below WhatsAppGroupCard):
- Green WhatsApp icon
- "Groupe WhatsApp" label
- Last message preview + timestamp
- Unread dot if there are messages newer than last view
- Only shown when `waGroupId` is set

**Right panel** — `WhatsAppThread.tsx` component:
- Header: WhatsApp icon + "Groupe WhatsApp" title + chantier name
- Scrollable message list (auto-scroll to bottom)
- Bubble style: green (#DCF8C6) right-aligned for `from_me`, grey left-aligned for others
- Sender name: resolved from `contacts_chantier.telephone` → `contacts_chantier.nom` (show phone number if no match)
- Images: `<img>` thumbnail, click opens full image in new tab
- Documents: download icon + filename as link
- Read-only (no compose — WhatsApp replies happen in WhatsApp)
- Loading state via `Loader2`
- Messages loaded once (no polling)

## Files to Create/Modify

| Action | File |
|--------|------|
| Create | `supabase/migrations/20260401100000_create_whatsapp_messages.sql` |
| Create | `src/pages/api/webhooks/whapi.ts` |
| Create | `src/pages/api/chantier/[id]/whatsapp-messages.ts` |
| Create | `src/components/chantier/cockpit/WhatsAppThread.tsx` |
| Modify | `src/components/chantier/cockpit/MessagerieSection.tsx` |
