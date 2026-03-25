# Messagerie Chantier — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Messagerie" tab in the chantier sidebar allowing clients to email artisans via SendGrid, receive replies via Inbound Parse webhook, and send WhatsApp links — with message template support.

**Architecture:** Two new tables (`chantier_conversations`, `chantier_messages`), 4 new API routes, 1 webhook endpoint, SendGrid for send/receive, `wa.me/` links for WhatsApp. Domain configurable via `REPLY_EMAIL_DOMAIN` env var (starts with `reply.verifiermondevis.fr`).

**Tech Stack:** Astro API routes, Supabase (tables + RLS), SendGrid Mail API (`@sendgrid/mail`), React components (shadcn-ui patterns), Lucide icons.

**Design doc:** `docs/plans/2026-03-25-messagerie-chantier-design.md`

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260325120000_create_chantier_messaging.sql`

**Step 1: Write the migration**

```sql
-- ============================================================
-- Migration : messagerie chantier (conversations + messages)
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
```

**Step 2: Commit**

```bash
git add supabase/migrations/20260325120000_create_chantier_messaging.sql
git commit -m "feat(messaging): add chantier_conversations + chantier_messages tables"
```

---

## Task 2: Install SendGrid dependency

**Step 1: Install**

```bash
npm install @sendgrid/mail
```

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @sendgrid/mail dependency"
```

---

## Task 3: Message templates data file

**Files:**
- Create: `src/data/MESSAGE_TEMPLATES.ts`

**Step 1: Create the templates file**

Define the `MessageTemplate` interface and starter templates. Include variable interpolation helper function.

```typescript
export interface MessageTemplate {
  id: string;
  label: string;
  category: 'devis' | 'relance' | 'administratif' | 'planning';
  subject: string;
  body: string;
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: 'demande_devis',
    label: 'Demande de devis',
    category: 'devis',
    subject: 'Demande de devis - {{chantier_nom}}',
    body: `Bonjour {{artisan_nom}},

Je vous contacte dans le cadre de mon projet "{{chantier_nom}}".

Pourriez-vous me faire parvenir un devis pour les travaux correspondants ?

Je reste disponible pour tout complément d'information.

Cordialement,
{{client_nom}}`,
  },
  {
    id: 'relance_devis',
    label: 'Relance devis',
    category: 'relance',
    subject: 'Relance - Devis en attente - {{chantier_nom}}',
    body: `Bonjour {{artisan_nom}},

Je me permets de revenir vers vous concernant ma demande de devis pour le projet "{{chantier_nom}}".

N'ayant pas encore reçu votre proposition, pourriez-vous me donner une estimation du délai ?

Cordialement,
{{client_nom}}`,
  },
  {
    id: 'demande_attestation',
    label: 'Demande attestation',
    category: 'administratif',
    subject: 'Demande d\'attestation d\'assurance - {{chantier_nom}}',
    body: `Bonjour {{artisan_nom}},

Dans le cadre du projet "{{chantier_nom}}", pourriez-vous me transmettre votre attestation d'assurance décennale en cours de validité ?

Ce document est nécessaire avant le démarrage des travaux.

Cordialement,
{{client_nom}}`,
  },
  {
    id: 'confirmation_planning',
    label: 'Confirmation planning',
    category: 'planning',
    subject: 'Confirmation de planning - {{chantier_nom}}',
    body: `Bonjour {{artisan_nom}},

Je souhaite confirmer les dates d'intervention prévues pour le projet "{{chantier_nom}}".

Pouvez-vous me confirmer votre disponibilité ?

Cordialement,
{{client_nom}}`,
  },
];

export const TEMPLATE_CATEGORIES: Record<MessageTemplate['category'], string> = {
  devis: 'Devis',
  relance: 'Relances',
  administratif: 'Administratif',
  planning: 'Planning',
};

/** Replace {{variable}} placeholders with actual values */
export function interpolateTemplate(
  text: string,
  vars: Record<string, string>,
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);
}
```

**Step 2: Commit**

```bash
git add src/data/MESSAGE_TEMPLATES.ts
git commit -m "feat(messaging): add message templates with interpolation"
```

---

## Task 4: API route — list conversations

**Files:**
- Create: `src/pages/api/chantier/[id]/conversations.ts`

**Context:**
- Follow the same auth pattern as `src/pages/api/chantier/[id]/contacts.ts` (Bearer token, `getUser()`, ownership check via `chantiers.user_id`)
- CORS headers: `{ 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }`

**Step 1: Implement GET /api/chantier/[id]/conversations**

Returns all conversations for a chantier, ordered by `last_message_at DESC`. Each conversation includes a preview of the last message (join on `chantier_messages` with `LIMIT 1 ORDER BY created_at DESC`).

The route must:
1. Authenticate via Bearer JWT (`supabase.auth.getUser(token)`)
2. Verify chantier ownership (`chantiers.user_id = user.id`)
3. Query `chantier_conversations` WHERE `chantier_id = params.id` ORDER BY `last_message_at DESC NULLS LAST`
4. For each conversation, fetch the last message preview (use a separate query or join)
5. Return `{ conversations: [...] }`

Also export `OPTIONS` for CORS preflight.

**Step 2: Commit**

```bash
git add src/pages/api/chantier/[id]/conversations.ts
git commit -m "feat(messaging): add GET /api/chantier/[id]/conversations"
```

---

## Task 5: API route — conversation detail + mark read

**Files:**
- Create: `src/pages/api/chantier/[id]/conversations/[convId].ts`

**Step 1: Implement GET and PATCH**

**GET** `/api/chantier/[id]/conversations/[convId]`:
1. Auth + ownership check (same pattern)
2. Verify the conversation belongs to this chantier
3. Query `chantier_messages` WHERE `conversation_id = convId` ORDER BY `created_at ASC`
4. Set `unread_count = 0` on the conversation (auto mark-read on open)
5. Return `{ conversation: {...}, messages: [...] }`

**PATCH** `/api/chantier/[id]/conversations/[convId]`:
1. Auth + ownership check
2. Update `unread_count = 0` on the conversation
3. Return `{ success: true }`

Also export `OPTIONS` for CORS.

**Step 2: Commit**

```bash
git add src/pages/api/chantier/[id]/conversations/\[convId\].ts
git commit -m "feat(messaging): add GET+PATCH /api/chantier/[id]/conversations/[convId]"
```

---

## Task 6: API route — send message

**Files:**
- Create: `src/pages/api/chantier/[id]/messages.ts`

**Context:**
- Env vars: `SENDGRID_API_KEY`, `REPLY_EMAIL_DOMAIN` (default `reply.verifiermondevis.fr`)
- SendGrid import: `import sgMail from '@sendgrid/mail'`
- Reply address format: `chantier-{chantierId}+{convId}@{REPLY_EMAIL_DOMAIN}`

**Step 1: Implement POST /api/chantier/[id]/messages**

Request body:
```json
{
  "contact_id": "uuid",
  "subject": "string",
  "body": "string"
}
```

Logic:
1. Auth + ownership check
2. Fetch contact from `contacts_chantier` WHERE `id = contact_id AND chantier_id = params.id` — get name, email, phone
3. Upsert conversation: look for existing `chantier_conversations` WHERE `chantier_id AND contact_id`. If none, INSERT with new `reply_address` = `chantier-{chantierId}+{newConvId}@{REPLY_EMAIL_DOMAIN}`
4. INSERT into `chantier_messages` (direction: `outbound`, subject, body_text: body, status: `sent`)
5. Send via SendGrid:
   ```typescript
   sgMail.setApiKey(process.env.SENDGRID_API_KEY);
   await sgMail.send({
     to: contact.email,
     from: { email: `noreply@verifiermondevis.fr`, name: `${userName} via VerifierMonDevis` },
     replyTo: conversation.reply_address,
     subject,
     text: body,
   });
   ```
6. UPDATE conversation: `last_message_at = NOW()`
7. Return `{ success: true, conversationId, messageId }`

On SendGrid error: update message status to `failed`, still return the message (user can retry).

Fetch `user.user_metadata.first_name` + `user.user_metadata.last_name` for the `from` name.

**Step 2: Commit**

```bash
git add src/pages/api/chantier/[id]/messages.ts
git commit -m "feat(messaging): add POST /api/chantier/[id]/messages (SendGrid send)"
```

---

## Task 7: Webhook — inbound email (SendGrid Inbound Parse)

**Files:**
- Create: `src/pages/api/webhooks/inbound-email.ts`

**Context:**
- SendGrid Inbound Parse sends a `multipart/form-data` POST with fields: `to`, `from`, `subject`, `text`, `html`, `envelope`, etc.
- The `to` field contains the reply address: `chantier-xxx+conv-yyy@reply.verifiermondevis.fr`
- No JWT auth — validate by parsing the reply address and checking it exists in DB
- Env var: `SENDGRID_INBOUND_WEBHOOK_SECRET` (optional, for future signature verification)

**Step 1: Implement POST /api/webhooks/inbound-email**

Logic:
1. Parse multipart form data from request
2. Extract `to` field → regex to get `convId` from `chantier-{chantierId}+{convId}@...`
3. Lookup conversation in DB using `reply_address` (exact match on the `to` value, or extract convId and query by id)
4. If conversation not found → return 200 (don't retry, log warning)
5. Extract `text` and `html` from form data
6. INSERT into `chantier_messages` (direction: `inbound`, body_text, body_html, status: `delivered`)
7. UPDATE `chantier_conversations`: `unread_count = unread_count + 1`, `last_message_at = NOW()`
8. Send notification email to the client:
   - Fetch user email from `auth.users` via service role
   - Send via SendGrid: "Vous avez reçu une réponse de {contact_name} sur votre chantier {chantier_nom}"
   - Include a link to the chantier page: `https://www.verifiermondevis.fr/mon-chantier/{chantierId}`
9. Return 200

**Important:** Use `supabaseServiceKey` (not user JWT) since this is a server-to-server webhook.

**Step 2: Commit**

```bash
git add src/pages/api/webhooks/inbound-email.ts
git commit -m "feat(messaging): add inbound email webhook for SendGrid"
```

---

## Task 8: React hooks — useConversations + useMessages

**Files:**
- Create: `src/hooks/useConversations.ts`
- Create: `src/hooks/useMessages.ts`

**Step 1: Create useConversations hook**

```typescript
// Fetches GET /api/chantier/[id]/conversations
// Returns: { conversations, isLoading, error, refresh, totalUnread }
// totalUnread = sum of all unread_count (for sidebar badge)
```

Pattern: `useState` + `useEffect` fetch with Bearer token from `supabase.auth.getSession()`. Same pattern as other hooks in the project (e.g., `usePaymentEvents.ts`).

**Step 2: Create useMessages hook**

```typescript
// Fetches GET /api/chantier/[id]/conversations/[convId]
// Sends POST /api/chantier/[id]/messages
// Returns: { messages, conversation, isLoading, sendMessage, refresh }
```

`sendMessage(contactId, subject, body)` → POST then refresh.
Auto mark-read on fetch (the GET endpoint already does this).

**Step 3: Commit**

```bash
git add src/hooks/useConversations.ts src/hooks/useMessages.ts
git commit -m "feat(messaging): add useConversations + useMessages hooks"
```

---

## Task 9: UI — TemplateSelector component

**Files:**
- Create: `src/components/chantier/cockpit/TemplateSelector.tsx`

**Step 1: Implement TemplateSelector**

Props:
```typescript
interface TemplateSelectorProps {
  onSelect: (subject: string, body: string) => void;
  variables: Record<string, string>; // for interpolation
}
```

UI:
- Button "Utiliser un template" with dropdown (use shadcn `DropdownMenu` or simple div with `useState` toggle)
- Group templates by `category` using `TEMPLATE_CATEGORIES`
- On click: call `interpolateTemplate()` on subject + body, then `onSelect(subject, body)`

Keep it simple — no shadcn Popover dependency, just a relative positioned dropdown with `z-50`.

**Step 2: Commit**

```bash
git add src/components/chantier/cockpit/TemplateSelector.tsx
git commit -m "feat(messaging): add TemplateSelector component"
```

---

## Task 10: UI — MessageComposer component

**Files:**
- Create: `src/components/chantier/cockpit/MessageComposer.tsx`

**Step 1: Implement MessageComposer**

Props:
```typescript
interface MessageComposerProps {
  contactName: string;
  contactPhone?: string;
  variables: Record<string, string>;
  onSend: (subject: string, body: string) => Promise<void>;
  sending: boolean;
}
```

UI:
- Subject input (text input, pre-filled from template or empty)
- Body textarea (auto-grow or fixed height ~120px)
- Bottom bar: `<TemplateSelector>` on left, buttons on right:
  - WhatsApp button (if `contactPhone`): `<a href="wa.me/{phone}?text={encodeURIComponent(body)}" target="_blank">` with phone icon
  - Send button: mail icon + "Envoyer"
- Disable send when subject or body empty, or `sending` is true

WhatsApp link: format phone to international (remove leading 0, add +33 if starts with 0). Use same `wa.me/` format: `https://wa.me/33612345678?text=...`

**Step 2: Commit**

```bash
git add src/components/chantier/cockpit/MessageComposer.tsx
git commit -m "feat(messaging): add MessageComposer with WhatsApp + templates"
```

---

## Task 11: UI — ConversationThread component

**Files:**
- Create: `src/components/chantier/cockpit/ConversationThread.tsx`

**Step 1: Implement ConversationThread**

Props:
```typescript
interface ConversationThreadProps {
  conversation: Conversation;
  messages: Message[];
  isLoading: boolean;
  onSend: (subject: string, body: string) => Promise<void>;
  sending: boolean;
  onBack: () => void; // mobile back navigation
  variables: Record<string, string>;
}
```

UI:
- Header: contact name + role, email, WhatsApp button (if phone), back arrow (mobile)
- Messages list: scroll container, auto-scroll to bottom on new messages
  - Outbound: right-aligned, blue-50 bg, "Vous" label + time
  - Inbound: left-aligned, gray-50 bg, contact name + time
  - Show subject as bold first line if present
  - Render body_html with `dangerouslySetInnerHTML` for inbound (artisan replies may be HTML), body_text for outbound
- Bottom: `<MessageComposer>`

**Step 2: Commit**

```bash
git add src/components/chantier/cockpit/ConversationThread.tsx
git commit -m "feat(messaging): add ConversationThread component"
```

---

## Task 12: UI — ConversationList component

**Files:**
- Create: `src/components/chantier/cockpit/ConversationList.tsx`

**Step 1: Implement ConversationList**

Props:
```typescript
interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (convId: string) => void;
  onNewMessage: () => void;
  isLoading: boolean;
}
```

UI:
- Search input at top (filter by contact_name, client-side)
- "+ Nouveau message" button
- List of conversation cards:
  - Left: initials avatar (first letter of contact_name, colored bg based on hash)
  - Middle: contact name (bold if unread), role below, last message preview (truncated ~60 chars)
  - Right: relative date ("14:32", "hier", "22 mars"), unread badge (blue dot)
  - Sorted by `last_message_at DESC`
- Selected conversation: light blue bg

**Step 2: Commit**

```bash
git add src/components/chantier/cockpit/ConversationList.tsx
git commit -m "feat(messaging): add ConversationList component"
```

---

## Task 13: UI — MessagerieSection (main orchestrator)

**Files:**
- Create: `src/components/chantier/cockpit/MessagerieSection.tsx`

**Step 1: Implement MessagerieSection**

Props:
```typescript
interface MessagerieSectionProps {
  chantierId: string;
  chantierNom: string;
  token: string | null;
  contacts: Array<{ id: string; nom: string; email?: string; telephone?: string; role?: string }>;
}
```

State:
- `selectedConvId: string | null`
- `showNewMessage: boolean` — toggles a contact picker modal
- Uses `useConversations(chantierId, token)` + `useMessages(chantierId, selectedConvId, token)`

Layout:
- Desktop: 2-column (list 320px | thread flex-1)
- Mobile: show list OR thread (toggle via `selectedConvId`)

New message flow:
1. Click "+ Nouveau message"
2. Show a simple select/dropdown of contacts that have an email
3. On select → call `sendMessage` with the contact, which creates the conversation
4. Conversation appears in list, auto-selected

Build template variables from props + selected conversation:
```typescript
const vars = {
  chantier_nom: chantierNom,
  artisan_nom: selectedConversation?.contact_name ?? '',
  client_nom: userName,
  // etc.
};
```

**Step 2: Commit**

```bash
git add src/components/chantier/cockpit/MessagerieSection.tsx
git commit -m "feat(messaging): add MessagerieSection orchestrator component"
```

---

## Task 14: Integrate into DashboardUnified sidebar

**Files:**
- Modify: `src/components/chantier/cockpit/DashboardUnified.tsx`

**Step 1: Add 'messagerie' to Section type and NAV_ITEMS**

In `DashboardUnified.tsx`:

1. Add `Mail` to the lucide-react imports (line ~13)
2. Add `'messagerie'` to the `Section` type union (line 78)
3. Add to `NAV_ITEMS` array after `contacts` (line 273):
   ```typescript
   { id: 'messagerie', label: 'Messagerie', icon: Mail },
   ```
4. Import `MessagerieSection` at the top
5. Add the `messagerie` case in the main `switch (activeSection)` block (around line 2818):
   ```typescript
   case 'messagerie':
     return (
       <MessagerieSection
         chantierId={chantierId}
         chantierNom={result.nom}
         token={token}
         contacts={contacts}
       />
     );
   ```
6. Add unread badge: use `useConversations` to get `totalUnread`, add to `badges` object:
   ```typescript
   if (totalUnread > 0) badges.messagerie = { text: `${totalUnread}`, style: 'bg-blue-100 text-blue-700' };
   ```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add src/components/chantier/cockpit/DashboardUnified.tsx
git commit -m "feat(messaging): integrate Messagerie tab in chantier sidebar"
```

---

## Task 15: Update CLAUDE.md documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update docs**

Add to the relevant sections:
- New tables: `chantier_conversations`, `chantier_messages` in the tables list
- New API routes: 4 messaging routes + 1 webhook in the API routes table
- New env vars: `SENDGRID_API_KEY`, `SENDGRID_INBOUND_WEBHOOK_SECRET`, `REPLY_EMAIL_DOMAIN`
- New section: "Messagerie chantier" describing the flow
- Update sidebar nav items list
- Mention SendGrid Inbound Parse setup

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add messagerie chantier to CLAUDE.md"
```

---

## Execution order

Tasks 1-3 are independent (DB, npm, templates) → can be parallelized.
Tasks 4-7 are backend API routes → sequential (4→5→6→7).
Task 8 (hooks) depends on 4-6.
Tasks 9-12 are UI components → can be parallelized after task 8.
Task 13 depends on 9-12.
Task 14 depends on 13.
Task 15 is last.

```
[1: DB] ──────┐
[2: npm] ─────┤
[3: templates]┤
              ├──▸ [4: GET convs] → [5: GET+PATCH conv] → [6: POST msg] → [7: webhook]
              │
              └──▸ [8: hooks] → [9: TemplateSelector] ──┐
                                [10: MessageComposer] ───┤
                                [11: ConversationThread] ┤
                                [12: ConversationList] ──┤
                                                         └──▸ [13: MessagerieSection] → [14: DashboardUnified] → [15: CLAUDE.md]
```
