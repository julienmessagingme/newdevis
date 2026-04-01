# WhatsApp Multi-groupes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrer du modèle 1 groupe par chantier vers N groupes, avec sélection des participants, couleurs par rôle dans le thread, et suivi des membres (join/leave/remove).

**Architecture:** Deux nouvelles tables (`chantier_whatsapp_groups`, `chantier_whatsapp_members`) remplacent les colonnes `whatsapp_group_id`/`whatsapp_invite_link` sur `chantiers`. Le lookup webhook passe de `chantiers.whatsapp_group_id` à `chantier_whatsapp_groups.group_jid`. Le composant `WhatsAppGroupCard` devient `WhatsAppGroupsPanel` (liste multi-groupes + modale création). `WhatsAppThread` reçoit `userPhone` + `groupJid` pour les couleurs par rôle et le filtrage par groupe.

**Tech Stack:** Astro 5 SSR, React 18, Supabase (postgres), whapi.cloud, Tailwind CSS, TypeScript

**Design doc:** `docs/plans/2026-04-01-whatsapp-multigroup-design.md`

---

## Context — Fichiers existants clés

- `src/pages/api/chantier/[id].ts` — GET retourne actuellement `whatsapp_group_id` + `whatsapp_invite_link`
- `src/pages/api/chantier/[id]/whatsapp.ts` — POST crée groupe, PATCH ajoute membres, lit/écrit sur `chantiers`
- `src/pages/api/webhooks/whapi.ts` — lookup chantier via `.eq('whatsapp_group_id', groupId)` sur `chantiers`
- `src/pages/api/chantier/[id]/whatsapp-messages.ts` — GET filtre par `chantier_id` uniquement
- `src/components/chantier/cockpit/MessagerieSection.tsx` — états `waGroupId`/`waInviteLink`, une entrée WA dans la liste gauche
- `src/components/chantier/cockpit/WhatsAppGroupCard.tsx` — gère 1 groupe, appelle POST/PATCH /whatsapp
- `src/components/chantier/cockpit/WhatsAppThread.tsx` — affiche messages, `from_me:true` = vert, autres = blanc
- `src/lib/whapiUtils.ts` — `createWhatsAppGroup`, `addGroupParticipants`, `formatPhone`

---

### Task 1: SQL migration — nouvelles tables + migration données + suppression colonnes

**Files:**
- Create: `supabase/migrations/20260401200000_whatsapp_multigroup.sql`

**Step 1: Écrire la migration**

```sql
-- supabase/migrations/20260401200000_whatsapp_multigroup.sql

BEGIN;

-- Table des groupes WhatsApp par chantier (N groupes possibles)
CREATE TABLE IF NOT EXISTS chantier_whatsapp_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'Groupe principal',
  group_jid   TEXT NOT NULL,
  invite_link TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_groups_chantier ON chantier_whatsapp_groups(chantier_id);
CREATE INDEX IF NOT EXISTS idx_wa_groups_jid ON chantier_whatsapp_groups(group_jid);

ALTER TABLE chantier_whatsapp_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own wa groups"
  ON chantier_whatsapp_groups FOR SELECT
  USING (chantier_id IN (SELECT id FROM chantiers WHERE user_id = auth.uid()));

-- Table des membres par groupe
CREATE TABLE IF NOT EXISTS chantier_whatsapp_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID NOT NULL REFERENCES chantier_whatsapp_groups(id) ON DELETE CASCADE,
  phone      TEXT NOT NULL,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'artisan',  -- 'gmc' | 'client' | 'artisan'
  status     TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'left' | 'removed'
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at    TIMESTAMPTZ
);

ALTER TABLE chantier_whatsapp_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own wa members"
  ON chantier_whatsapp_members FOR SELECT
  USING (
    group_id IN (
      SELECT g.id FROM chantier_whatsapp_groups g
      JOIN chantiers c ON c.id = g.chantier_id
      WHERE c.user_id = auth.uid()
    )
  );

-- Migrer les données existantes (chantiers avec whatsapp_group_id non null)
INSERT INTO chantier_whatsapp_groups (chantier_id, name, group_jid, invite_link)
SELECT id, 'Groupe principal', whatsapp_group_id, whatsapp_invite_link
FROM chantiers
WHERE whatsapp_group_id IS NOT NULL;

-- Supprimer les colonnes obsolètes sur chantiers
ALTER TABLE chantiers DROP COLUMN IF EXISTS whatsapp_group_id;
ALTER TABLE chantiers DROP COLUMN IF EXISTS whatsapp_invite_link;

COMMIT;
```

**Step 2: Appliquer manuellement dans Supabase Dashboard**

Ouvrir https://supabase.com/dashboard/project/vhrhgsqxwvouswjaiczn/sql et coller le contenu complet. Cliquer **Run**.

**Step 3: Vérifier que les tables existent**

```bash
curl -s "https://vhrhgsqxwvouswjaiczn.supabase.co/rest/v1/chantier_whatsapp_groups?limit=5" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```
Attendu : `[]` ou un tableau JSON (pas d'erreur 404).

Vérifier aussi que la migration des données a bien fonctionné (doit retourner 1 ligne) :
```bash
curl -s "https://vhrhgsqxwvouswjaiczn.supabase.co/rest/v1/chantier_whatsapp_groups?select=*" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

**Step 4: Commit**

```bash
git add supabase/migrations/20260401200000_whatsapp_multigroup.sql
git commit -m "feat(db): whatsapp multi-groups tables, migrate existing data, drop old columns"
```

---

### Task 2: Nouvelle route GET /api/chantier/[id]/whatsapp-groups

**Files:**
- Create: `src/pages/api/chantier/[id]/whatsapp-groups.ts`

**Step 1: Écrire la route**

```typescript
// src/pages/api/chantier/[id]/whatsapp-groups.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  // Groupes du chantier
  const { data: groups, error: groupsErr } = await ctx.supabase
    .from('chantier_whatsapp_groups')
    .select('id, name, group_jid, invite_link, created_at')
    .eq('chantier_id', params.id!)
    .order('created_at', { ascending: true });

  if (groupsErr) return jsonError(groupsErr.message, 500);
  if (!groups || groups.length === 0) return jsonOk({ groups: [] });

  // Membres pour tous les groupes en une seule requête
  const groupIds = groups.map((g) => g.id);
  const { data: members, error: membersErr } = await ctx.supabase
    .from('chantier_whatsapp_members')
    .select('id, group_id, phone, name, role, status, joined_at, left_at')
    .in('group_id', groupIds)
    .order('joined_at', { ascending: true });

  if (membersErr) return jsonError(membersErr.message, 500);

  // Rattacher les membres à leur groupe
  const result = groups.map((g) => ({
    ...g,
    members: (members ?? []).filter((m) => m.group_id === g.id),
  }));

  return jsonOk({ groups: result });
};
```

**Step 2: Vérifier le build**

```bash
cd C:/Users/julie/devis/devis-clarity && npm run build 2>&1 | tail -20
```
Attendu : `Build Complete!` sans erreur TypeScript.

**Step 3: Commit**

```bash
git add src/pages/api/chantier/[id]/whatsapp-groups.ts
git commit -m "feat(api): GET /api/chantier/[id]/whatsapp-groups"
```

---

### Task 3: Mettre à jour GET /api/chantier/[id].ts — remplacer whatsapp_group_id par whatsapp_groups

**Files:**
- Modify: `src/pages/api/chantier/[id].ts`

**Step 1: Lire le fichier pour comprendre les 2 endroits à changer**

Les lignes concernées sont :
- SELECT : `'id, nom, ..., whatsapp_group_id, whatsapp_invite_link'` (ligne ~85)
- Réponse fallback : `whatsapp_group_id: ... whatsapp_invite_link: ...` (ligne ~190)
- Réponse normale : `whatsapp_group_id: ... whatsapp_invite_link: ...` (lignes ~266-267)

**Step 2: Appliquer les changements**

1. Supprimer `whatsapp_group_id, whatsapp_invite_link` du SELECT (ligne ~85) :
```typescript
// Avant
.select('id, nom, emoji, budget, phase, type_projet, mensualite, duree_credit, metadonnees, created_at, project_mode, whatsapp_group_id, whatsapp_invite_link')

// Après
.select('id, nom, emoji, budget, phase, type_projet, mensualite, duree_credit, metadonnees, created_at, project_mode')
```

2. Dans la réponse fallback (ligne ~190), remplacer :
```typescript
// Avant
whatsapp_group_id: (chantier as any).whatsapp_group_id ?? null,
whatsapp_invite_link: (chantier as any).whatsapp_invite_link ?? null

// Après — supprimés (les groupes sont chargés via /whatsapp-groups)
```

3. Dans la réponse normale (lignes ~266-267), même suppression :
```typescript
// Avant
whatsapp_group_id: (chantier as any).whatsapp_group_id ?? null,
whatsapp_invite_link: (chantier as any).whatsapp_invite_link ?? null,

// Après — supprimés
```

**Step 3: Vérifier le build**

```bash
cd C:/Users/julie/devis/devis-clarity && npm run build 2>&1 | tail -20
```

**Step 4: Commit**

```bash
git add src/pages/api/chantier/[id].ts
git commit -m "refactor(api): remove whatsapp_group_id from chantier GET response"
```

---

### Task 4: Réécrire POST et PATCH /api/chantier/[id]/whatsapp.ts

**Files:**
- Modify: `src/pages/api/chantier/[id]/whatsapp.ts`

**Step 1: Réécrire le fichier complet**

```typescript
// src/pages/api/chantier/[id]/whatsapp.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';
import { formatPhone, createWhatsAppGroup, addGroupParticipants } from '@/lib/whapiUtils';

const GMC_PHONE = '33633921577'; // GérerMonChantier — toujours admin auto du groupe

async function getClientPhone(supabase: any, token: string): Promise<string | null> {
  const { data } = await supabase.auth.getUser(token);
  const phone = data?.user?.user_metadata?.phone ?? data?.user?.phone ?? null;
  return phone ? formatPhone(phone) : null;
}

export const OPTIONS: APIRoute = () => optionsResponse('POST,PATCH,OPTIONS');

// POST — Créer un nouveau groupe WhatsApp pour ce chantier
// Body: { name?: string, selectedPhones: string[] }
export const POST: APIRoute = async ({ params, request }) => {
  const token = request.headers.get('Authorization')?.slice(7) ?? '';
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;

  const { data: chantier } = await ctx.supabase
    .from('chantiers')
    .select('nom')
    .eq('id', chantierId)
    .single();
  if (!chantier) return jsonError('Chantier introuvable', 404);

  let body: { name?: string; selectedPhones?: string[] } = {};
  try { body = await request.json(); } catch { /* body optionnel */ }

  const groupName = body.name?.trim() || 'Groupe principal';
  const selectedPhones: string[] = body.selectedPhones ?? [];

  // Client toujours inclus (si phone dispo)
  const clientPhone = await getClientPhone(ctx.supabase, token);

  // Participants = selected + client (dédupliqué, sans GMC qui est auto-admin)
  const participants = [...new Set([
    ...selectedPhones.map(formatPhone).filter((p) => p.length >= 10),
    ...(clientPhone ? [clientPhone] : []),
  ])].filter((p) => p !== GMC_PHONE);

  const subject = `${groupName} — ${chantier.nom}`;

  try {
    const { groupId, inviteLink } = await createWhatsAppGroup(subject, participants);

    // Enregistrer le groupe
    const { data: group, error: insertErr } = await ctx.supabase
      .from('chantier_whatsapp_groups')
      .insert({ chantier_id: chantierId, name: groupName, group_jid: groupId, invite_link: inviteLink })
      .select('id')
      .single();

    if (insertErr || !group) return jsonError('Erreur enregistrement groupe', 500);

    // Enregistrer les membres
    const memberRows = [];

    // GérerMonChantier — toujours présent (auto-admin whapi)
    memberRows.push({ group_id: group.id, phone: GMC_PHONE, name: 'GérerMonChantier', role: 'gmc', status: 'active' });

    // Client
    if (clientPhone) {
      memberRows.push({ group_id: group.id, phone: clientPhone, name: 'Client', role: 'client', status: 'active' });
    }

    // Artisans sélectionnés — récupérer leurs noms
    if (selectedPhones.length > 0) {
      const formattedPhones = selectedPhones.map(formatPhone).filter((p) => p !== GMC_PHONE && p !== clientPhone);
      if (formattedPhones.length > 0) {
        const { data: contacts } = await ctx.supabase
          .from('contacts_chantier')
          .select('nom, telephone')
          .eq('chantier_id', chantierId)
          .not('telephone', 'is', null);

        for (const p of formattedPhones) {
          const contact = (contacts ?? []).find((c: any) => formatPhone(c.telephone) === p);
          memberRows.push({
            group_id: group.id,
            phone: p,
            name: contact?.nom ?? p,
            role: 'artisan',
            status: 'active',
          });
        }
      }
    }

    await ctx.supabase.from('chantier_whatsapp_members').insert(memberRows);

    return jsonOk({ groupId, inviteLink, groupDbId: group.id }, 201);
  } catch (err: any) {
    return jsonError(`Erreur whapi: ${err.message}`, 502);
  }
};

// PATCH — Ajouter des membres à un groupe existant
// Body: { groupDbId: string, phones: string[] }
export const PATCH: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;

  let body: { groupDbId?: string; phones?: string[] } = {};
  try { body = await request.json(); } catch { return jsonError('Body invalide', 400); }

  if (!body.groupDbId) return jsonError('groupDbId requis', 400);

  // Vérifier ownership du groupe via le chantier
  const { data: group } = await ctx.supabase
    .from('chantier_whatsapp_groups')
    .select('id, group_jid')
    .eq('id', body.groupDbId)
    .eq('chantier_id', chantierId)
    .single();

  if (!group) return jsonError('Groupe introuvable', 404);

  const phones = (body.phones ?? []).map(formatPhone).filter((p) => p.length >= 10 && p !== GMC_PHONE);
  if (phones.length === 0) return jsonOk({ added: 0 });

  try {
    await addGroupParticipants(group.group_jid, phones);

    // Upsert membres
    const { data: contacts } = await ctx.supabase
      .from('contacts_chantier')
      .select('nom, telephone')
      .eq('chantier_id', chantierId)
      .not('telephone', 'is', null);

    const memberRows = phones.map((p) => {
      const contact = (contacts ?? []).find((c: any) => formatPhone(c.telephone) === p);
      return { group_id: group.id, phone: p, name: contact?.nom ?? p, role: 'artisan', status: 'active' };
    });

    await ctx.supabase
      .from('chantier_whatsapp_members')
      .upsert(memberRows, { onConflict: 'group_id,phone' });

    return jsonOk({ added: phones.length });
  } catch (err: any) {
    return jsonError(`Erreur whapi: ${err.message}`, 502);
  }
};
```

**Note:** Le upsert sur `chantier_whatsapp_members` avec `onConflict: 'group_id,phone'` nécessite une contrainte UNIQUE. Ajouter dans la migration (ou appliquer manuellement dans Supabase) :
```sql
ALTER TABLE chantier_whatsapp_members ADD CONSTRAINT wa_members_group_phone_unique UNIQUE (group_id, phone);
```

**Step 2: Vérifier le build**

```bash
cd C:/Users/julie/devis/devis-clarity && npm run build 2>&1 | tail -20
```

**Step 3: Commit**

```bash
git add src/pages/api/chantier/[id]/whatsapp.ts
git commit -m "feat(api): multi-group POST/PATCH with participant selection and member tracking"
```

---

### Task 5: Mettre à jour le webhook whapi.ts

**Files:**
- Modify: `src/pages/api/webhooks/whapi.ts`

**Step 1: Réécrire le fichier complet**

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
    return new Response('OK', { status: 200 });
  }

  if (!supabaseUrl || !supabaseService) {
    console.error('[whapi] Missing Supabase config');
    return new Response('OK', { status: 200 });
  }

  const supabase = makeClient();

  // ── Messages ────────────────────────────────────────────────────────────────
  const messages: any[] = payload?.messages ?? [];

  for (const msg of messages) {
    const groupId = msg.chat_id ?? msg.to;
    if (!groupId?.endsWith('@g.us')) continue;
    if (!msg.id || !msg.type) continue;

    // Lookup chantier via chantier_whatsapp_groups (nouvelle architecture)
    const { data: group } = await supabase
      .from('chantier_whatsapp_groups')
      .select('chantier_id')
      .eq('group_jid', groupId)
      .single();

    if (!group) continue;

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
        body = msg.type;
    }

    const timestamp = msg.timestamp
      ? new Date(msg.timestamp * 1000).toISOString()
      : new Date().toISOString();

    const { error: upsertErr } = await supabase
      .from('chantier_whatsapp_messages')
      .upsert({
        id:          msg.id,
        chantier_id: group.chantier_id,
        group_id:    groupId,
        from_number: String(msg.from ?? ''),
        from_me:     msg.from_me ?? false,
        type:        msg.type,
        body,
        media_url,
        timestamp,
      }, { onConflict: 'id' });

    if (upsertErr) console.error('[whapi] upsert error:', upsertErr.message);
  }

  // ── Events groupe (membres) ─────────────────────────────────────────────────
  const events: any[] = payload?.events ?? [];

  for (const event of events) {
    const groupJid = event.chat_id;
    if (!groupJid?.endsWith('@g.us')) continue;

    const { data: group } = await supabase
      .from('chantier_whatsapp_groups')
      .select('id')
      .eq('group_jid', groupJid)
      .single();

    if (!group) continue;

    if (event.type === 'group.participants.remove') {
      const phones: string[] = event.participants ?? [];
      if (phones.length > 0) {
        const { error } = await supabase
          .from('chantier_whatsapp_members')
          .update({ status: 'removed', left_at: new Date().toISOString() })
          .eq('group_id', group.id)
          .in('phone', phones);
        if (error) console.error('[whapi] member remove error:', error.message);
      }
    }

    if (event.type === 'group.participants.add') {
      const phones: string[] = event.participants ?? [];
      for (const phone of phones) {
        const { error } = await supabase
          .from('chantier_whatsapp_members')
          .upsert(
            { group_id: group.id, phone, name: phone, role: 'artisan', status: 'active', left_at: null },
            { onConflict: 'group_id,phone' }
          );
        if (error) console.error('[whapi] member add error:', error.message);
      }
    }

    if (event.type === 'group.delete') {
      const { error } = await supabase
        .from('chantier_whatsapp_groups')
        .delete()
        .eq('id', group.id);
      if (error) console.error('[whapi] group delete error:', error.message);
    }
  }

  return new Response('OK', { status: 200 });
};
```

**Step 2: Build**

```bash
cd C:/Users/julie/devis/devis-clarity && npm run build 2>&1 | tail -20
```

**Step 3: Commit**

```bash
git add src/pages/api/webhooks/whapi.ts
git commit -m "feat(webhook): lookup via chantier_whatsapp_groups + handle member join/leave/remove events"
```

---

### Task 6: Mettre à jour GET whatsapp-messages — filtre par groupJid

**Files:**
- Modify: `src/pages/api/chantier/[id]/whatsapp-messages.ts`

**Step 1: Ajouter le filtre `groupJid` optionnel**

```typescript
// src/pages/api/chantier/[id]/whatsapp-messages.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  // Filtre optionnel par groupe
  const url = new URL(request.url);
  const groupJid = url.searchParams.get('groupJid');

  let query = ctx.supabase
    .from('chantier_whatsapp_messages')
    .select('id, from_number, from_me, type, body, media_url, timestamp, group_id')
    .eq('chantier_id', params.id!)
    .order('timestamp', { ascending: true })
    .limit(50);

  if (groupJid) {
    query = query.eq('group_id', groupJid);
  }

  const { data, error } = await query;

  if (error) return jsonError(error.message, 500);

  return jsonOk({ messages: data ?? [] });
};
```

**Step 2: Build + commit**

```bash
cd C:/Users/julie/devis/devis-clarity && npm run build 2>&1 | tail -10
git add src/pages/api/chantier/[id]/whatsapp-messages.ts
git commit -m "feat(api): add optional groupJid filter to whatsapp-messages route"
```

---

### Task 7: Mettre à jour WhatsAppThread.tsx — couleurs par rôle + prop groupJid

**Files:**
- Modify: `src/components/chantier/cockpit/WhatsAppThread.tsx`

**Step 1: Modifier les props et la logique de couleur**

Changements à apporter :

1. Ajouter `userPhone: string` et `groupJid: string` aux props
2. Ajouter `getSenderRole()` qui retourne `'gmc' | 'client' | 'artisan'`
3. Modifier les classes CSS des bulles selon le rôle
4. Passer `groupJid` dans l'URL de fetch

```typescript
interface Props {
  chantierId: string;
  chantierNom: string;
  token: string;
  contacts: Contact[];
  onBack: () => void;
  userPhone: string;    // NOUVEAU — phone normalisé du client connecté ("33662807754")
  groupJid: string;     // NOUVEAU — JID du groupe ("120363...@g.us")
  groupName: string;    // NOUVEAU — nom du groupe ("Groupe principal")
}
```

Fonction de rôle (après la construction de `phoneMap`) :
```typescript
function getSenderRole(msg: WaMessage): 'gmc' | 'client' | 'artisan' {
  if (msg.from_me) return 'gmc';
  const normalized = msg.from_number;
  if (normalized === userPhone) return 'client';
  return 'artisan';
}
```

Classes CSS des bulles selon rôle :
```typescript
function getBubbleClasses(role: 'gmc' | 'client' | 'artisan'): string {
  if (role === 'gmc') return 'bg-[#DCF8C6] text-gray-800 rounded-tr-none';
  if (role === 'client') return 'bg-[#DBEAFE] text-gray-800 rounded-tr-none';
  return 'bg-white text-gray-800 rounded-tl-none';
}
```

Alignement selon rôle :
```typescript
const role = getSenderRole(msg);
const isRight = role === 'gmc' || role === 'client';
// className={`flex flex-col ${isRight ? 'items-end' : 'items-start'}`}
```

Fetch avec `groupJid` :
```typescript
fetch(`/api/chantier/${chantierId}/whatsapp-messages?groupJid=${encodeURIComponent(groupJid)}`, {
  headers: { Authorization: `Bearer ${token}` },
})
```

Header du thread — afficher `groupName` à la place de `chantierNom` :
```typescript
<p className="text-xs text-gray-400 truncate">{groupName}</p>
```

Sender name — pour `gmc` afficher "GérerMonChantier", pour `client` afficher "Moi" :
```typescript
function getSenderName(msg: WaMessage): string {
  const role = getSenderRole(msg);
  if (role === 'gmc') return 'GérerMonChantier';
  if (role === 'client') return 'Moi';
  return phoneMap.get(msg.from_number) ?? formatPhone(msg.from_number);
}
```

**Step 2: Build**

```bash
cd C:/Users/julie/devis/devis-clarity && npm run build 2>&1 | tail -20
```
Corriger les éventuelles erreurs TypeScript (props manquantes dans MessagerieSection seront corrigées à la tâche suivante).

**Step 3: Commit**

```bash
git add src/components/chantier/cockpit/WhatsAppThread.tsx
git commit -m "feat(ui): WhatsAppThread — role-based bubble colors (gmc/client/artisan) + groupJid filter"
```

---

### Task 8: Créer WhatsAppGroupsPanel.tsx (remplace WhatsAppGroupCard)

**Files:**
- Create: `src/components/chantier/cockpit/WhatsAppGroupsPanel.tsx`

**Step 1: Écrire le composant complet**

```tsx
// src/components/chantier/cockpit/WhatsAppGroupsPanel.tsx
import React, { useEffect, useState } from 'react';
import {
  MessageCircle, Check, Copy, Plus, Users, ChevronDown, ChevronUp,
  Loader2, UserCheck, UserX, Crown
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Member {
  id: string;
  phone: string;
  name: string;
  role: 'gmc' | 'client' | 'artisan';
  status: 'active' | 'left' | 'removed';
  joined_at: string;
  left_at: string | null;
}

interface WaGroup {
  id: string;
  name: string;
  group_jid: string;
  invite_link: string | null;
  created_at: string;
  members: Member[];
}

interface Contact {
  id: string;
  nom: string;
  telephone?: string;
}

interface Props {
  chantierId: string;
  chantierNom: string;
  token: string;
  contacts: Contact[];
  groups: WaGroup[];
  onGroupsChanged: (groups: WaGroup[]) => void;
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) return '33' + digits.slice(1);
  if (digits.startsWith('33')) return digits;
  return digits;
}

function RoleBadge({ role }: { role: Member['role'] }) {
  if (role === 'gmc') return (
    <span className="flex items-center gap-1 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
      <Crown className="h-2.5 w-2.5" /> GMC
    </span>
  );
  if (role === 'client') return (
    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Client</span>
  );
  return <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">Artisan</span>;
}

function MemberRow({ member }: { member: Member }) {
  const isActive = member.status === 'active';
  return (
    <div className={`flex items-center gap-2 py-1.5 ${!isActive ? 'opacity-50' : ''}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-medium ${
        isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
      }`}>
        {member.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-800 truncate">{member.name}</p>
        {!isActive && (
          <p className="text-[10px] text-gray-400">
            {member.status === 'removed' ? 'Retiré' : 'A quitté'}{member.left_at ? ` · ${new Date(member.left_at).toLocaleDateString('fr-FR')}` : ''}
          </p>
        )}
      </div>
      <RoleBadge role={member.role} />
      {isActive
        ? <UserCheck className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
        : <UserX className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
      }
    </div>
  );
}

function GroupCard({
  group, chantierId, token, contacts, onUpdate,
}: {
  group: WaGroup;
  chantierId: string;
  token: string;
  contacts: Contact[];
  onUpdate: (g: WaGroup) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const activeCount = group.members.filter((m) => m.status === 'active').length;

  function handleCopy() {
    if (!group.invite_link) return;
    navigator.clipboard.writeText(group.invite_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 mb-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366] text-white flex-shrink-0">
            <MessageCircle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-medium text-green-800">
              <Check className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{group.name}</span>
            </div>
            <p className="text-xs text-green-600">{activeCount} membre{activeCount > 1 ? 's' : ''} actif{activeCount > 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={handleCopy}
            className="text-green-700 hover:bg-green-100 text-xs gap-1">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copié' : 'Lien'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowMembers((v) => !v)}
            className="text-green-700 hover:bg-green-100 text-xs gap-1">
            <Users className="h-3.5 w-3.5" />
            {showMembers ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      {showMembers && (
        <div className="mt-3 border-t border-green-200 pt-3 space-y-0.5">
          {group.members.length === 0
            ? <p className="text-xs text-gray-400 text-center py-2">Aucun membre enregistré</p>
            : group.members.map((m) => <MemberRow key={m.id} member={m} />)
          }
        </div>
      )}
    </div>
  );
}

// Modale création groupe
function CreateGroupModal({
  contacts, chantierNom, onClose, onCreated,
  chantierId, token,
}: {
  contacts: Contact[];
  chantierNom: string;
  onClose: () => void;
  onCreated: (group: WaGroup) => void;
  chantierId: string;
  token: string;
}) {
  const [groupName, setGroupName] = useState('Groupe principal');
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Contacts avec téléphone uniquement
  const eligibleContacts = contacts.filter((c) => c.telephone?.trim());

  // Pré-cocher tous les contacts éligibles
  useEffect(() => {
    const phones = new Set(eligibleContacts.map((c) => formatPhone(c.telephone!)));
    setSelectedPhones(phones);
  }, []);

  function togglePhone(phone: string) {
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone);
      else next.add(phone);
      return next;
    });
  }

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/whatsapp`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: groupName, selectedPhones: [...selectedPhones] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erreur inconnue');

      // Recharger les groupes
      const groupsRes = await fetch(`/api/chantier/${chantierId}/whatsapp-groups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const groupsData = await groupsRes.json();
      const newGroup = (groupsData.groups ?? []).find((g: WaGroup) => g.id === data.groupDbId);
      if (newGroup) onCreated(newGroup);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Créer un groupe WhatsApp</h3>

        {/* Nom du groupe */}
        <div className="mb-4">
          <label className="text-xs font-medium text-gray-700 mb-1 block">Nom du groupe</label>
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]"
            placeholder="Groupe principal"
          />
        </div>

        {/* Membres fixes */}
        <div className="mb-3">
          <p className="text-xs font-medium text-gray-700 mb-2">Toujours inclus</p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
              <Crown className="h-3.5 w-3.5 text-green-600" />
              <span className="text-sm text-gray-700">GérerMonChantier</span>
              <span className="text-xs text-gray-400 ml-auto">Admin</span>
            </div>
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
              <Users className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-sm text-gray-700">Vous (client)</span>
              <span className="text-xs text-gray-400 ml-auto">Si téléphone renseigné</span>
            </div>
          </div>
        </div>

        {/* Sélection artisans */}
        {eligibleContacts.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-700 mb-2">Intervenants à inviter</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {eligibleContacts.map((c) => {
                const phone = formatPhone(c.telephone!);
                const checked = selectedPhones.has(phone);
                return (
                  <label key={c.id} className="flex items-center gap-2.5 cursor-pointer bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-2 transition-colors">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePhone(phone)}
                      className="h-4 w-4 rounded accent-[#25D366]"
                    />
                    <span className="text-sm text-gray-800 flex-1">{c.nom}</span>
                    <span className="text-xs text-gray-400">{c.telephone}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {eligibleContacts.length === 0 && (
          <p className="text-xs text-gray-400 mb-4">Aucun intervenant avec téléphone renseigné.</p>
        )}

        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>Annuler</Button>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={loading || !groupName.trim()}
            className="bg-[#25D366] hover:bg-[#1da851] text-white gap-1.5"
          >
            {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Création...</> : 'Créer le groupe'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Composant principal
export default function WhatsAppGroupsPanel({
  chantierId, chantierNom, token, contacts, groups, onGroupsChanged,
}: Props) {
  const [showModal, setShowModal] = useState(false);

  function handleGroupCreated(newGroup: WaGroup) {
    onGroupsChanged([...groups, newGroup]);
  }

  return (
    <div className="mb-4">
      {groups.map((g) => (
        <GroupCard
          key={g.id}
          group={g}
          chantierId={chantierId}
          token={token}
          contacts={contacts}
          onUpdate={(updated) => onGroupsChanged(groups.map((x) => x.id === updated.id ? updated : x))}
        />
      ))}

      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowModal(true)}
        className="w-full border-dashed border-[#25D366] text-[#25D366] hover:bg-green-50 gap-2 text-xs"
      >
        <Plus className="h-3.5 w-3.5" />
        Nouveau groupe WhatsApp
      </Button>

      {showModal && (
        <CreateGroupModal
          contacts={contacts}
          chantierNom={chantierNom}
          chantierId={chantierId}
          token={token}
          onClose={() => setShowModal(false)}
          onCreated={handleGroupCreated}
        />
      )}
    </div>
  );
}
```

**Step 2: Build**

```bash
cd C:/Users/julie/devis/devis-clarity && npm run build 2>&1 | tail -20
```

**Step 3: Commit**

```bash
git add src/components/chantier/cockpit/WhatsAppGroupsPanel.tsx
git commit -m "feat(ui): WhatsAppGroupsPanel — multi-group list, member details, create modal with participant selection"
```

---

### Task 9: Mettre à jour MessagerieSection.tsx — câbler tout ensemble

**Files:**
- Modify: `src/components/chantier/cockpit/MessagerieSection.tsx`

**Step 1: Changements à apporter**

1. **Imports** — remplacer `WhatsAppGroupCard` par `WhatsAppGroupsPanel`, ajouter le type `WaGroup` :
```typescript
import WhatsAppGroupsPanel from './WhatsAppGroupsPanel';
// supprimer import WhatsAppGroupCard
```

2. **États** — remplacer `waGroupId`/`waInviteLink` par `waGroups` + `userPhone` + `activeWaGroupJid` :
```typescript
// Supprimer:
// const [waGroupId, setWaGroupId] = useState<string | null>(null);
// const [waInviteLink, setWaInviteLink] = useState<string | null>(null);
// const [showWaThread, setShowWaThread] = useState(false);

// Ajouter:
const [waGroups, setWaGroups] = useState<any[]>([]);
const [userPhone, setUserPhone] = useState('');
const [activeWaGroupJid, setActiveWaGroupJid] = useState<string | null>(null);
```

3. **useEffect chargement** — remplacer l'appel à `GET /api/chantier/${chantierId}` pour whatsapp par un appel à `/api/chantier/${chantierId}/whatsapp-groups`. Récupérer aussi le `userPhone` depuis l'auth :

```typescript
useEffect(() => {
  if (!chantierId || !token) return;
  // Charger les groupes WhatsApp
  fetch(`/api/chantier/${chantierId}/whatsapp-groups`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((r) => r.ok ? r.json() : { groups: [] })
    .then((data) => setWaGroups(data.groups ?? []));

  // Charger le phone du user connecté pour les couleurs de bulles
  // (supabase client disponible via prop ou hook — utiliser le même token)
  fetch(`${import.meta.env.PUBLIC_SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    },
  })
    .then((r) => r.ok ? r.json() : null)
    .then((user) => {
      if (!user) return;
      const rawPhone = user.user_metadata?.phone ?? user.phone ?? '';
      if (rawPhone) {
        const digits = rawPhone.replace(/\D/g, '');
        setUserPhone(digits.startsWith('0') && digits.length === 10 ? '33' + digits.slice(1) : digits);
      }
    });
}, [chantierId, token]);
```

4. **mobileShowThread** — remplacer `showWaThread` par `activeWaGroupJid` :
```typescript
const mobileShowThread = !!(selectedConvId || newMsgContactId || activeWaGroupJid);
```

5. **handleBack** — remplacer `setShowWaThread(false)` par `setActiveWaGroupJid(null)` :
```typescript
const handleBack = () => {
  setSelectedConvId(null);
  setNewMsgContactId(null);
  setActiveWaGroupJid(null);
};
```

6. **Colonne gauche** — remplacer le `WhatsAppGroupCard` + le bouton WA group entry par `WhatsAppGroupsPanel` + entrées dynamiques par groupe :

Remplacer le bloc `WhatsAppGroupCard` :
```tsx
<WhatsAppGroupsPanel
  chantierId={chantierId}
  chantierNom={chantierNom}
  token={token}
  contacts={contacts}
  groups={waGroups}
  onGroupsChanged={setWaGroups}
/>
```

Remplacer le bloc `{/* WhatsApp group entry */}` (bouton unique) par une liste dynamique :
```tsx
{/* Entrées WhatsApp — une par groupe */}
{waGroups.map((g) => (
  <button
    key={g.id}
    onClick={() => {
      setActiveWaGroupJid(g.group_jid);
      setSelectedConvId(null);
      setNewMsgContactId(null);
    }}
    className={`w-full text-left px-3 py-3 flex items-center gap-3 transition-colors border-l-2 border-b border-gray-100 ${
      activeWaGroupJid === g.group_jid
        ? 'bg-green-50 border-[#25D366]'
        : 'border-transparent hover:bg-gray-50'
    }`}
  >
    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#25D366] flex items-center justify-center">
      <MessageCircle className="h-5 w-5 text-white" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-gray-800">{g.name}</p>
      <p className="text-xs text-gray-400 truncate">
        {g.members.filter((m: any) => m.status === 'active').length} membres actifs
      </p>
    </div>
  </button>
))}
```

7. **Panneau droit** — mettre à jour la condition et les props de `WhatsAppThread` :
```tsx
{activeWaGroupJid ? (
  <WhatsAppThread
    chantierId={chantierId}
    chantierNom={chantierNom}
    token={token}
    contacts={contacts}
    onBack={handleBack}
    userPhone={userPhone}
    groupJid={activeWaGroupJid}
    groupName={waGroups.find((g) => g.group_jid === activeWaGroupJid)?.name ?? 'Groupe WhatsApp'}
  />
) : threadConv ? (
  // ... ConversationThread inchangé
) : (
  // ... empty state inchangé
)}
```

**Step 2: Build — s'assurer que toutes les props TypeScript sont satisfaites**

```bash
cd C:/Users/julie/devis/devis-clarity && npm run build 2>&1 | tail -30
```
En cas d'erreur "Property X does not exist", vérifier que les interfaces de `WhatsAppThread` et `WhatsAppGroupsPanel` correspondent aux props passées.

**Step 3: Commit**

```bash
git add src/components/chantier/cockpit/MessagerieSection.tsx
git commit -m "feat(ui): MessagerieSection — multi-group entries, userPhone for bubble colors, dynamic WA thread"
```

---

### Task 10: Supprimer WhatsAppGroupCard.tsx (ancien composant)

**Files:**
- Delete: `src/components/chantier/cockpit/WhatsAppGroupCard.tsx`

**Step 1: Vérifier qu'aucun autre fichier l'importe**

```bash
grep -r "WhatsAppGroupCard" C:/Users/julie/devis/devis-clarity/src --include="*.tsx" --include="*.ts"
```
Attendu : aucune ligne.

**Step 2: Supprimer le fichier**

```bash
rm C:/Users/julie/devis/devis-clarity/src/components/chantier/cockpit/WhatsAppGroupCard.tsx
```

**Step 3: Build final**

```bash
cd C:/Users/julie/devis/devis-clarity && npm run build 2>&1 | tail -20
```
Attendu : `Build Complete!` sans erreur.

**Step 4: Push**

```bash
git add -A
git commit -m "chore: remove obsolete WhatsAppGroupCard component"
git push
```

---

### Task 11: Contrainte UNIQUE sur chantier_whatsapp_members (si pas déjà faite en Task 1)

Si l'upsert `onConflict: 'group_id,phone'` échoue en production, appliquer manuellement :

```sql
ALTER TABLE chantier_whatsapp_members
  ADD CONSTRAINT wa_members_group_phone_unique UNIQUE (group_id, phone);
```

Dans Supabase Dashboard SQL Editor.

---

## Ordre d'exécution recommandé

1. Task 1 (DB migration) — **d'abord, manuellement dans Supabase**
2. Tasks 2-6 en séquence (API routes) — build à chaque étape
3. Task 7 (WhatsAppThread)
4. Task 8 (WhatsAppGroupsPanel)
5. Task 9 (MessagerieSection) — câblage final
6. Task 10 (supprimer WhatsAppGroupCard)
7. Task 11 (contrainte UNIQUE si besoin)

## Test final

Après déploiement Vercel :
1. Ouvrir `/mon-chantier/{id}` → onglet Messagerie
2. Le groupe migré apparaît sous son nom "Groupe principal"
3. Cliquer → thread WhatsApp avec les messages existants, bulles colorées par rôle
4. Cliquer "Nouveau groupe" → modale avec sélection artisans, créer → 2e entrée dans la liste
5. Envoyer un message WhatsApp dans le groupe → apparaît dans le thread
