# WhatsApp Group Feature — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Créer/mettre à jour un groupe WhatsApp par chantier (client + artisans + GérerMonChantier) via whapi.cloud, avec une carte statut dans l'onglet Messagerie.

**Architecture:** API route Astro POST/PATCH `/api/chantier/[id]/whatsapp` → appel whapi.cloud → stockage groupId + inviteLink dans `chantiers`. Frontend : `WhatsAppGroupCard.tsx` intégré dans `MessagerieSection.tsx`.

**Tech Stack:** Astro SSR API routes, whapi.cloud REST API (Bearer token), Supabase service role, React + Tailwind/shadcn-ui.

---

## Task 1 : Migration SQL — 2 colonnes sur `chantiers`

**Files:**
- Create: `supabase/migrations/20260401000000_add_whatsapp_group.sql`

**Step 1 : Créer le fichier de migration**

```sql
-- supabase/migrations/20260401000000_add_whatsapp_group.sql
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS whatsapp_group_id TEXT;
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS whatsapp_invite_link TEXT;
```

**Step 2 : Appliquer la migration**

```bash
npx supabase db push --project-id vhrhgsqxwvouswjaiczn
```

Expected : "Applying migration 20260401000000_add_whatsapp_group.sql... done"

**Step 3 : Régénérer les types TypeScript**

```bash
npx supabase gen types typescript --project-id vhrhgsqxwvouswjaiczn > src/integrations/supabase/types.ts
```

**Step 4 : Commit**

```bash
git add supabase/migrations/20260401000000_add_whatsapp_group.sql src/integrations/supabase/types.ts
git commit -m "feat(whatsapp): add whatsapp_group_id + whatsapp_invite_link columns on chantiers"
```

---

## Task 2 : `whapiUtils.ts` — helpers whapi.cloud

**Files:**
- Create: `src/lib/whapiUtils.ts`

**Step 1 : Créer le fichier**

```typescript
// src/lib/whapiUtils.ts

const API_URL = import.meta.env.WHAPI_API_URL ?? 'https://gate.whapi.cloud';
const TOKEN   = import.meta.env.WHAPI_TOKEN ?? '';

// Formate un numéro en format whapi : "33XXXXXXXXX" (sans + ni espaces)
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  // Numéro français commençant par 0 → remplacer par 33
  if (digits.startsWith('0') && digits.length === 10) return '33' + digits.slice(1);
  // Déjà en international avec 33
  if (digits.startsWith('33')) return digits;
  // Autre pays : on retourne tel quel
  return digits;
}

// Crée un groupe WhatsApp et retourne { groupId, inviteLink }
export async function createWhatsAppGroup(
  subject: string,
  participants: string[],
): Promise<{ groupId: string; inviteLink: string }> {
  // 1. Créer le groupe
  const createRes = await fetch(`${API_URL}/groups`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ subject, participants }),
  });
  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`whapi create group: ${createRes.status} — ${err}`);
  }
  const created = await createRes.json();
  const groupId: string = created.id ?? created.gid;
  if (!groupId) throw new Error('whapi: pas de groupId dans la réponse');

  // 2. Récupérer le lien d'invitation
  const inviteRes = await fetch(`${API_URL}/groups/${groupId}/invite`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!inviteRes.ok) throw new Error(`whapi get invite: ${inviteRes.status}`);
  const inviteData = await inviteRes.json();
  const inviteLink: string = inviteData.link ?? inviteData.invite_link ?? '';

  return { groupId, inviteLink };
}

// Ajoute des participants à un groupe existant
export async function addGroupParticipants(
  groupId: string,
  participants: string[],
): Promise<void> {
  const res = await fetch(`${API_URL}/groups/${groupId}/participants`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ participants }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`whapi add participants: ${res.status} — ${err}`);
  }
}
```

**Step 2 : Ajouter les env vars dans `.env`**

```bash
# Dans .env local
WHAPI_TOKEN=Bzghopu9IJzF7ndNB8cOUlmPOJIpPi19
WHAPI_API_URL=https://gate.whapi.cloud
```

Et dans Vercel : Settings → Environment Variables → ajouter les deux variables.

**Step 3 : Commit**

```bash
git add src/lib/whapiUtils.ts .env
git commit -m "feat(whatsapp): add whapiUtils helpers (formatPhone, createGroup, addParticipants)"
```

---

## Task 3 : API route `POST/PATCH /api/chantier/[id]/whatsapp`

**Files:**
- Create: `src/pages/api/chantier/[id]/whatsapp.ts`

**Step 1 : Créer le fichier**

```typescript
// src/pages/api/chantier/[id]/whatsapp.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth, createServiceClient } from '@/lib/apiHelpers';
import { formatPhone, createWhatsAppGroup, addGroupParticipants } from '@/lib/whapiUtils';

const GERER_MON_CHANTIER_PHONE = '33633921577';

async function getContactPhones(supabase: any, chantierId: string): Promise<string[]> {
  const { data } = await supabase
    .from('contacts_chantier')
    .select('telephone')
    .eq('chantier_id', chantierId)
    .not('telephone', 'is', null);
  return (data ?? [])
    .map((c: any) => formatPhone(c.telephone))
    .filter((p: string) => p.length >= 10);
}

async function getClientPhone(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase.auth.admin.getUserById(userId);
  const phone =
    data?.user?.phone ??
    data?.user?.user_metadata?.phone ??
    null;
  return phone ? formatPhone(phone) : null;
}

// ── OPTIONS ──────────────────────────────────────────────────────────────────

export const OPTIONS: APIRoute = () => optionsResponse('POST,PATCH,OPTIONS');

// ── POST — Créer le groupe ────────────────────────────────────────────────────

export const POST: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;

  // Vérifier qu'aucun groupe n'existe déjà
  const { data: chantier } = await ctx.supabase
    .from('chantiers')
    .select('nom, whatsapp_group_id')
    .eq('id', chantierId)
    .single();

  if (!chantier) return jsonError('Chantier introuvable', 404);
  if (chantier.whatsapp_group_id) return jsonError('Un groupe WhatsApp existe déjà', 409);

  // Collecter les participants
  const artisanPhones = await getContactPhones(ctx.supabase, chantierId);
  const clientPhone = await getClientPhone(ctx.supabase, ctx.user.id);

  const participants = [
    ...artisanPhones,
    ...(clientPhone ? [clientPhone] : []),
  ].filter((p, i, arr) => arr.indexOf(p) === i); // déduplique

  // GérerMonChantier est ajouté après la création (on est l'admin du groupe)
  const subject = `Chantier - ${chantier.nom}`;

  try {
    const { groupId, inviteLink } = await createWhatsAppGroup(subject, participants);

    // Ajouter GérerMonChantier
    await addGroupParticipants(groupId, [GERER_MON_CHANTIER_PHONE]);

    // Stocker dans chantiers
    await ctx.supabase
      .from('chantiers')
      .update({ whatsapp_group_id: groupId, whatsapp_invite_link: inviteLink })
      .eq('id', chantierId);

    return jsonOk({ groupId, inviteLink }, 201);
  } catch (err: any) {
    return jsonError(`Erreur whapi: ${err.message}`, 502);
  }
};

// ── PATCH — Ajouter les nouveaux membres ──────────────────────────────────────

export const PATCH: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;

  const { data: chantier } = await ctx.supabase
    .from('chantiers')
    .select('whatsapp_group_id')
    .eq('id', chantierId)
    .single();

  if (!chantier?.whatsapp_group_id)
    return jsonError('Aucun groupe WhatsApp pour ce chantier', 400);

  const phones = await getContactPhones(ctx.supabase, chantierId);
  if (phones.length === 0) return jsonOk({ added: 0 });

  try {
    await addGroupParticipants(chantier.whatsapp_group_id, phones);
    return jsonOk({ added: phones.length });
  } catch (err: any) {
    return jsonError(`Erreur whapi: ${err.message}`, 502);
  }
};
```

**Step 2 : Vérifier que la route est accessible**

```bash
npm run build
```

Expected : build sans erreur TypeScript.

**Step 3 : Commit**

```bash
git add src/pages/api/chantier/[id]/whatsapp.ts
git commit -m "feat(whatsapp): add POST/PATCH /api/chantier/[id]/whatsapp route"
```

---

## Task 4 : Composant `WhatsAppGroupCard.tsx`

**Files:**
- Create: `src/components/chantier/cockpit/WhatsAppGroupCard.tsx`

**Step 1 : Créer le composant**

```tsx
// src/components/chantier/cockpit/WhatsAppGroupCard.tsx
import React, { useState } from "react";
import { MessageCircle, Check, Copy, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WhatsAppGroupCardProps {
  chantierId: string;
  chantierNom: string;
  token: string;
  groupId: string | null;
  inviteLink: string | null;
  onGroupCreated: (groupId: string, inviteLink: string) => void;
}

export default function WhatsAppGroupCard({
  chantierId,
  chantierNom,
  token,
  groupId,
  inviteLink,
  onGroupCreated,
}: WhatsAppGroupCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/whatsapp`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur inconnue");
      onGroupCreated(data.groupId, data.inviteLink);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/whatsapp`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur inconnue");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── État : groupe existant ────────────────────────────────────────────────
  if (groupId) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 px-4 py-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500 text-white">
            <MessageCircle className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-sm font-medium text-green-800">
              <Check className="h-3.5 w-3.5" />
              Groupe WhatsApp actif
            </div>
            <p className="text-xs text-green-600">{`Chantier - ${chantierNom}`}</p>
            {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="text-green-700 hover:bg-green-100 text-xs gap-1.5"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copié !" : "Lien"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUpdate}
            disabled={loading}
            className="text-green-700 hover:bg-green-100 text-xs gap-1.5"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Mettre à jour
          </Button>
        </div>
      </div>
    );
  }

  // ── État : pas encore de groupe ───────────────────────────────────────────
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366] text-white">
            <MessageCircle className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800">Groupe WhatsApp</p>
            <p className="text-xs text-gray-500">
              Réunissez les artisans et le client dans un groupe
            </p>
            {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
          </div>
        </div>
        <Button
          size="sm"
          onClick={handleCreate}
          disabled={loading}
          className="bg-[#25D366] hover:bg-[#1da851] text-white text-xs gap-1.5"
        >
          {loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Création...
            </>
          ) : (
            "Créer le groupe"
          )}
        </Button>
      </div>
    </div>
  );
}
```

**Step 2 : Commit**

```bash
git add src/components/chantier/cockpit/WhatsAppGroupCard.tsx
git commit -m "feat(whatsapp): add WhatsAppGroupCard component"
```

---

## Task 5 : Intégrer `WhatsAppGroupCard` dans `MessagerieSection.tsx`

**Files:**
- Modify: `src/components/chantier/cockpit/MessagerieSection.tsx`

**Step 1 : Charger le groupId/inviteLink depuis le chantier**

Dans `MessagerieSection`, ajouter un useEffect qui fetch le chantier pour récupérer `whatsapp_group_id` et `whatsapp_invite_link`. Le chantier est déjà fetchable via `/api/chantier/${chantierId}` (route GET existante) ou directement via Supabase client.

Ajouter en haut du composant (après les states existants) :

```tsx
const [waGroupId, setWaGroupId] = useState<string | null>(null);
const [waInviteLink, setWaInviteLink] = useState<string | null>(null);

useEffect(() => {
  if (!chantierId || !token) return;
  fetch(`/api/chantier/${chantierId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data) return;
      setWaGroupId(data.whatsapp_group_id ?? null);
      setWaInviteLink(data.whatsapp_invite_link ?? null);
    });
}, [chantierId, token]);
```

**Step 2 : Ajouter l'import**

```tsx
import WhatsAppGroupCard from "./WhatsAppGroupCard";
```

**Step 3 : Intégrer la carte dans le JSX**

Trouver le `return (` du composant et ajouter `<WhatsAppGroupCard>` tout en haut du contenu, avant la liste des conversations :

```tsx
<WhatsAppGroupCard
  chantierId={chantierId}
  chantierNom={chantierNom}
  token={token}
  groupId={waGroupId}
  inviteLink={waInviteLink}
  onGroupCreated={(id, link) => {
    setWaGroupId(id);
    setWaInviteLink(link);
  }}
/>
```

**Step 4 : Vérifier que la route GET `/api/chantier/[id]` retourne bien les nouveaux champs**

Ouvrir `src/pages/api/chantier/[id].ts`, vérifier que le SELECT inclut `whatsapp_group_id, whatsapp_invite_link`. Si le SELECT est `*`, c'est automatique. Sinon, ajouter les 2 champs.

**Step 5 : Build**

```bash
npm run build
```

Expected : build sans erreur.

**Step 6 : Commit**

```bash
git add src/components/chantier/cockpit/MessagerieSection.tsx
git commit -m "feat(whatsapp): integrate WhatsAppGroupCard in MessagerieSection"
```

---

## Task 6 : Test manuel + deploy

**Step 1 : Tester en local**

```bash
npm run dev
```

- Aller sur `/mon-chantier/{id}` → onglet Messagerie
- Vérifier que la carte "Groupe WhatsApp" s'affiche
- Cliquer "Créer le groupe" → vérifier toast ou état "actif"
- Vérifier dans whapi.cloud dashboard que le groupe est créé

**Step 2 : Ajouter les env vars dans Vercel**

Vercel Dashboard → Settings → Environment Variables :
```
WHAPI_TOKEN = Bzghopu9IJzF7ndNB8cOUlmPOJIpPi19
WHAPI_API_URL = https://gate.whapi.cloud
```

**Step 3 : Deploy**

```bash
git push
```

Vercel déploie automatiquement.

**Step 4 : Commit final si ajustements**

```bash
git add -A
git commit -m "fix(whatsapp): post-deploy adjustments"
git push
```
