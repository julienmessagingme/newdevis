# WhatsApp Group Messages — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Receive and display WhatsApp group messages inside the Messagerie tab of the chantier dashboard.

**Architecture:** whapi.cloud webhook → Supabase table `chantier_whatsapp_messages` → API route → React component embedded in MessagerieSection. Webhook is unauthenticated (like SendGrid). All reads go through JWT-protected API route with ownership check.

**Tech Stack:** Astro SSR API routes, React, Supabase (service role for writes, JWT for reads), whapi.cloud webhook format.

---

## Context

This project is `devis-clarity` (VerifierMonDevis.fr) — an Astro 5 + React app deployed on Vercel.

Key patterns to follow:
- API routes use helpers from `src/lib/apiHelpers.ts`: `jsonOk`, `jsonError`, `requireChantierAuth`, `createServiceClient`
- All routes must start with `export const prerender = false;`
- The webhook route (like `src/pages/api/webhooks/inbound-email.ts`) uses `createClient` directly with service role, no auth
- Components live in `src/components/chantier/cockpit/`

whapi.cloud webhook payload format:
```json
{
  "messages": [
    {
      "id": "wamid.XXXX",
      "from": "33612345678",
      "to": "120363XXXXXXXXXX@g.us",
      "type": "text",
      "from_me": false,
      "timestamp": 1741234567,
      "text": { "body": "Hello world" }
    },
    {
      "id": "wamid.YYYY",
      "from": "33633921577",
      "to": "120363XXXXXXXXXX@g.us",
      "type": "image",
      "from_me": true,
      "timestamp": 1741234600,
      "image": { "id": "MEDIA_ID", "link": "https://...", "mime_type": "image/jpeg", "caption": "Voilà le plan" }
    }
  ]
}
```

Existing table `chantiers` has `whatsapp_group_id TEXT` column. The webhook looks up chantier by `whatsapp_group_id = message.to`.

---

## Task 1: SQL migration — table chantier_whatsapp_messages

**Files:**
- Create: `supabase/migrations/20260401100000_create_whatsapp_messages.sql`

**Step 1: Write the migration**

```sql
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

-- RLS: enable but only service_role bypasses (no user-level policy needed
-- because reads go through the API route which does ownership check)
ALTER TABLE chantier_whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Allow service_role to do everything (bypasses RLS anyway, but explicit is good)
-- No user-level policies: reads are mediated by API routes only
```

**Step 2: Apply the migration**

Go to Supabase Dashboard > SQL Editor and run the migration SQL.
Or run: `npx supabase db push` if CLI is configured.

**Step 3: Verify**

In Supabase Dashboard > Table Editor, confirm `chantier_whatsapp_messages` table exists with columns: `id, chantier_id, group_id, from_number, from_me, type, body, media_url, timestamp`.

**Step 4: Commit**

```bash
git add supabase/migrations/20260401100000_create_whatsapp_messages.sql
git commit -m "feat(db): add chantier_whatsapp_messages table"
```

---

## Task 2: Webhook endpoint POST /api/webhooks/whapi

**Files:**
- Create: `src/pages/api/webhooks/whapi.ts`

**Step 1: Write the webhook handler**

```typescript
// src/pages/api/webhooks/whapi.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseService = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

function makeClient() {
  return createClient(supabaseUrl, supabaseService);
}

// whapi may send OPTIONS before POST
export const OPTIONS: APIRoute = () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });

export const POST: APIRoute = async ({ request }) => {
  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return new Response('OK', { status: 200 }); // always return 200 to whapi
  }

  const messages: any[] = payload?.messages ?? [];
  if (messages.length === 0) return new Response('OK', { status: 200 });

  const supabase = makeClient();

  for (const msg of messages) {
    // Only process group messages (to ends with @g.us)
    if (!msg.to?.endsWith('@g.us')) continue;
    // Skip non-message events (status updates etc.)
    if (!msg.id || !msg.type) continue;

    // Find chantier by group JID
    const { data: chantier } = await supabase
      .from('chantiers')
      .select('id')
      .eq('whatsapp_group_id', msg.to)
      .single();

    if (!chantier) continue; // unknown group, skip

    // Extract body and media_url based on message type
    let body: string | null = null;
    let media_url: string | null = null;

    switch (msg.type) {
      case 'text':
        body = msg.text?.body ?? null;
        break;
      case 'image':
        body = msg.image?.caption ?? null;
        media_url = msg.image?.link ?? null;
        break;
      case 'video':
        body = msg.video?.caption ?? null;
        media_url = msg.video?.link ?? null;
        break;
      case 'document':
        body = msg.document?.filename ?? msg.document?.caption ?? null;
        media_url = msg.document?.link ?? null;
        break;
      case 'audio':
      case 'voice':
        body = '🎤 Message vocal';
        media_url = (msg.audio ?? msg.voice)?.link ?? null;
        break;
      default:
        body = msg.type; // fallback: just show type
    }

    const timestamp = msg.timestamp
      ? new Date(msg.timestamp * 1000).toISOString()
      : new Date().toISOString();

    // Upsert — idempotent: whapi may retry on non-2xx
    await supabase
      .from('chantier_whatsapp_messages')
      .upsert({
        id:          msg.id,
        chantier_id: chantier.id,
        group_id:    msg.to,
        from_number: String(msg.from ?? ''),
        from_me:     msg.from_me ?? false,
        type:        msg.type,
        body,
        media_url,
        timestamp,
      }, { onConflict: 'id' });
  }

  return new Response('OK', { status: 200 });
};
```

**Step 2: Verify build compiles**

```bash
cd C:/Users/julie/devis/devis-clarity && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors related to whapi.ts.

**Step 3: Commit**

```bash
git add src/pages/api/webhooks/whapi.ts
git commit -m "feat(webhook): add /api/webhooks/whapi endpoint for WhatsApp messages"
```

---

## Task 3: API route GET /api/chantier/[id]/whatsapp-messages

**Files:**
- Create: `src/pages/api/chantier/[id]/whatsapp-messages.ts`

**Step 1: Write the API route**

```typescript
// src/pages/api/chantier/[id]/whatsapp-messages.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const { data, error } = await ctx.supabase
    .from('chantier_whatsapp_messages')
    .select('id, from_number, from_me, type, body, media_url, timestamp')
    .eq('chantier_id', params.id!)
    .order('timestamp', { ascending: true })
    .limit(50);

  if (error) return jsonError('Erreur base de données', 500);

  return jsonOk({ messages: data ?? [] });
};
```

**Step 2: Verify build compiles**

```bash
cd C:/Users/julie/devis/devis-clarity && npm run build 2>&1 | tail -20
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/pages/api/chantier/[id]/whatsapp-messages.ts
git commit -m "feat(api): GET /api/chantier/[id]/whatsapp-messages"
```

---

## Task 4: WhatsAppThread.tsx component

**Files:**
- Create: `src/components/chantier/cockpit/WhatsAppThread.tsx`

**Step 1: Write the component**

```tsx
// src/components/chantier/cockpit/WhatsAppThread.tsx
import { useEffect, useRef, useState } from 'react';
import { Loader2, ArrowLeft, MessageCircle, FileText, Mic } from 'lucide-react';

interface WaMessage {
  id: string;
  from_number: string;
  from_me: boolean;
  type: string;
  body: string | null;
  media_url: string | null;
  timestamp: string;
}

interface Contact {
  telephone?: string;
  nom: string;
}

interface Props {
  chantierId: string;
  chantierNom: string;
  token: string;
  contacts: Contact[];     // to resolve sender names from phone numbers
  onBack: () => void;
}

function formatPhone(raw: string): string {
  // "33612345678" → "06 12 34 56 78"
  if (raw.startsWith('33') && raw.length === 11) {
    const local = '0' + raw.slice(2);
    return local.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  }
  return raw;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' +
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function WhatsAppThread({ chantierId, chantierNom, token, contacts, onBack }: Props) {
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Build phone → name map from contacts
  const phoneMap = new Map<string, string>();
  for (const c of contacts) {
    if (c.telephone) {
      // normalize: strip spaces/dashes, handle leading 0 → 33
      const digits = c.telephone.replace(/\D/g, '');
      const normalized = digits.startsWith('0') && digits.length === 10
        ? '33' + digits.slice(1)
        : digits;
      phoneMap.set(normalized, c.nom);
    }
  }

  useEffect(() => {
    if (!chantierId || !token) return;
    fetch(`/api/chantier/${chantierId}/whatsapp-messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((data) => {
        setMessages(data.messages ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [chantierId, token]);

  // Auto-scroll to bottom when messages load
  useEffect(() => {
    if (!loading) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [loading, messages.length]);

  function getSenderName(msg: WaMessage): string {
    if (msg.from_me) return 'Moi';
    return phoneMap.get(msg.from_number) ?? formatPhone(msg.from_number);
  }

  function renderMessageContent(msg: WaMessage) {
    if (msg.type === 'image' && msg.media_url) {
      return (
        <div className="space-y-1">
          <a href={msg.media_url} target="_blank" rel="noopener noreferrer">
            <img
              src={msg.media_url}
              alt="photo"
              className="max-w-[200px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
            />
          </a>
          {msg.body && <p className="text-sm">{msg.body}</p>}
        </div>
      );
    }
    if ((msg.type === 'document') && msg.media_url) {
      return (
        <a
          href={msg.media_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 hover:underline"
        >
          <FileText className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm truncate max-w-[180px]">{msg.body ?? 'Document'}</span>
        </a>
      );
    }
    if (msg.type === 'audio' || msg.type === 'voice') {
      return (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Mic className="h-4 w-4 flex-shrink-0" />
          <span>{msg.body ?? 'Message vocal'}</span>
        </div>
      );
    }
    return <p className="text-sm whitespace-pre-wrap break-words">{msg.body ?? ''}</p>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-700 lg:hidden">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="w-9 h-9 rounded-full bg-[#25D366] flex items-center justify-center flex-shrink-0">
          <MessageCircle className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm text-gray-900">Groupe WhatsApp</p>
          <p className="text-xs text-gray-400 truncate">{chantierNom}</p>
        </div>
        <p className="text-xs text-gray-400 ml-auto flex-shrink-0">Lecture seule</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-[#ECE5DD]">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
            Aucun message WhatsApp reçu pour l'instant
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.from_me ? 'items-end' : 'items-start'}`}>
              {/* Sender name (only for others) */}
              {!msg.from_me && (
                <p className="text-[10px] font-medium text-gray-500 mb-0.5 ml-1">
                  {getSenderName(msg)}
                </p>
              )}
              <div
                className={`max-w-[75%] px-3 py-2 rounded-lg shadow-sm ${
                  msg.from_me
                    ? 'bg-[#DCF8C6] text-gray-800 rounded-tr-none'
                    : 'bg-white text-gray-800 rounded-tl-none'
                }`}
              >
                {renderMessageContent(msg)}
                <p className={`text-[10px] text-gray-400 mt-1 ${msg.from_me ? 'text-right' : 'text-left'}`}>
                  {formatTime(msg.timestamp)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
```

**Step 2: Verify build compiles**

```bash
cd C:/Users/julie/devis/devis-clarity && npm run build 2>&1 | tail -20
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/components/chantier/cockpit/WhatsAppThread.tsx
git commit -m "feat(ui): WhatsAppThread component for chantier messagerie"
```

---

## Task 5: Integrate WhatsAppThread in MessagerieSection

**Files:**
- Modify: `src/components/chantier/cockpit/MessagerieSection.tsx`

The goal: when `waGroupId` is set, add a special "WhatsApp group" entry at the very top of the contact list. When clicked, show `WhatsAppThread` in the right panel instead of `ConversationThread`.

**Step 1: Add import at top of file**

After the existing imports (around line 7), add:
```tsx
import WhatsAppThread from './WhatsAppThread';
```

**Step 2: Add state for WhatsApp thread selection**

After line `const [waInviteLink, setWaInviteLink] = useState<string | null>(null);` (around line 79), add:
```tsx
const [showWaThread, setShowWaThread] = useState(false);
```

**Step 3: Update mobileShowThread to include WhatsApp**

Find:
```tsx
const mobileShowThread = !!(selectedConvId || newMsgContactId);
```
Replace with:
```tsx
const mobileShowThread = !!(selectedConvId || newMsgContactId || showWaThread);
```

**Step 4: Handle WhatsApp back navigation**

In `handleBack`, add:
```tsx
const handleBack = () => {
  setSelectedConvId(null);
  setNewMsgContactId(null);
  setShowWaThread(false);
};
```

**Step 5: Add WhatsApp entry in left column, above contact rows**

In the left column, find the `{/* Contact rows */}` section (around line 344). Just before the `<div className="flex-1 overflow-y-auto">` that wraps contact rows, add a WhatsApp entry row:

```tsx
{/* WhatsApp group entry */}
{waGroupId && (
  <button
    onClick={() => {
      setShowWaThread(true);
      setSelectedConvId(null);
      setNewMsgContactId(null);
    }}
    className={`w-full text-left px-3 py-3 flex items-center gap-3 transition-colors border-l-2 border-b border-gray-100 ${
      showWaThread
        ? 'bg-green-50 border-[#25D366]'
        : 'border-transparent hover:bg-gray-50'
    }`}
  >
    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#25D366] flex items-center justify-center">
      <MessageCircle className="h-5 w-5 text-white" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-gray-800">Groupe WhatsApp</p>
      <p className="text-xs text-gray-400 truncate">Messages du groupe</p>
    </div>
  </button>
)}
```

Add `MessageCircle` to the existing lucide-react import at the top:
```tsx
import { MessageSquare, Mail, Search, Loader2, User, Send, MessageCircle } from "lucide-react";
```

**Step 6: Update right panel to show WhatsAppThread**

Find the right panel section (around line 414):
```tsx
{threadConv ? (
  <ConversationThread ... />
) : (
  <div ...empty state...>
```

Replace with:
```tsx
{showWaThread ? (
  <WhatsAppThread
    chantierId={chantierId}
    chantierNom={chantierNom}
    token={token}
    contacts={contacts}
    onBack={handleBack}
  />
) : threadConv ? (
  <ConversationThread
    conversation={threadConv}
    messages={newMsgContact ? [] : messages}
    isLoading={newMsgContact ? false : msgsLoading}
    onSend={handleSend}
    sending={sending}
    onBack={handleBack}
    variables={activeTemplateVars}
    chantierNom={chantierNom}
    userName={userName}
  />
) : (
  <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3 px-6">
    <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center">
      <MessageSquare className="h-8 w-8 text-gray-300" />
    </div>
    <div className="text-center">
      <p className="text-sm font-medium text-gray-500">Sélectionnez un contact</p>
      <p className="text-xs text-gray-400 mt-1">
        Cliquez sur un intervenant pour voir ou démarrer une conversation
      </p>
    </div>
  </div>
)}
```

**Step 7: Verify build compiles**

```bash
cd C:/Users/julie/devis/devis-clarity && npm run build 2>&1 | tail -20
```

Expected: clean build.

**Step 8: Commit**

```bash
git add src/components/chantier/cockpit/MessagerieSection.tsx
git commit -m "feat(ui): integrate WhatsApp thread in MessagerieSection"
```

**Step 9: Push to Vercel**

```bash
git push
```

Wait for Vercel deployment (~1-2 min).

---

## Task 6: Configure whapi webhook

**After Vercel deployment is live:**

1. Go to https://panel.whapi.cloud/channels/CAPTAM-X9Y3E#
2. Navigate to **Settings** > **Webhooks** (or "Webhook")
3. Set webhook URL: `https://www.verifiermondevis.fr/api/webhooks/whapi`
4. Enable event: **messages** (specifically `messages.post` or the equivalent "new incoming message" event)
5. Save

**Verify:**

Send a message in the WhatsApp group from a phone. Check Supabase table `chantier_whatsapp_messages` — the message should appear within seconds.

Then open the chantier Messagerie tab — the "Groupe WhatsApp" entry should be visible in the left panel. Click it — the message should appear in the thread.

---

## Verification Checklist

- [ ] Table `chantier_whatsapp_messages` exists in Supabase with correct columns
- [ ] Sending a message in the WA group → row appears in DB within 5s
- [ ] GET `/api/chantier/:id/whatsapp-messages` returns messages (test with Bearer token in Postman/curl)
- [ ] "Groupe WhatsApp" entry appears in MessagerieSection left column when group exists
- [ ] Clicking it shows the WhatsApp thread in right panel
- [ ] Text messages display correctly in bubbles
- [ ] `from_me: true` → green bubble right-aligned
- [ ] `from_me: false` → white bubble left-aligned with sender name
- [ ] Images show as thumbnails (if any image was sent)
- [ ] Mobile: thread view covers full screen, back button returns to list
