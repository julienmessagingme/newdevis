# Design — WhatsApp multi-groupes, couleurs, sélection participants, suivi membres

**Date :** 2026-04-01
**Périmètre :** GérerMonChantier — module WhatsApp du cockpit chantier

---

## Contexte

Situation actuelle : 1 groupe WhatsApp par chantier, tous les contacts ajoutés automatiquement, pas de suivi des membres, pas de distinction visuelle entre les rôles dans le thread.

Objectifs :
1. **Couleurs des bulles** par rôle (GérerMonChantier / Client / Artisans)
2. **Sélection des participants** lors de la création d'un groupe
3. **Multi-groupes** par chantier (scalable)
4. **Suivi des membres** (qui est dans le groupe, qui a quitté)

---

## Architecture DB

### Nouvelles tables

```sql
-- Groupes WhatsApp par chantier (N groupes possibles)
CREATE TABLE chantier_whatsapp_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,       -- "Groupe principal", "Maître d'œuvre"
  group_jid   TEXT NOT NULL,       -- "120363427106673085@g.us"
  invite_link TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_groups_chantier ON chantier_whatsapp_groups(chantier_id);
CREATE INDEX idx_wa_groups_jid ON chantier_whatsapp_groups(group_jid);

ALTER TABLE chantier_whatsapp_groups ENABLE ROW LEVEL SECURITY;
-- policy: SELECT WHERE chantier_id IN (SELECT id FROM chantiers WHERE user_id = auth.uid())

-- Membres par groupe avec suivi statut
CREATE TABLE chantier_whatsapp_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID NOT NULL REFERENCES chantier_whatsapp_groups(id) ON DELETE CASCADE,
  phone      TEXT NOT NULL,     -- "33612345678"
  name       TEXT NOT NULL,
  role       TEXT NOT NULL,     -- 'gmc' | 'client' | 'artisan'
  status     TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'left' | 'removed'
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at    TIMESTAMPTZ
);

ALTER TABLE chantier_whatsapp_members ENABLE ROW LEVEL SECURITY;
-- policy: SELECT via JOIN chantier_whatsapp_groups → chantiers WHERE user_id = auth.uid()
```

### Migration données existantes

```sql
-- Migrer le groupe existant (1 chantier actuel)
INSERT INTO chantier_whatsapp_groups (chantier_id, name, group_jid, invite_link)
SELECT id, 'Groupe principal', whatsapp_group_id, whatsapp_invite_link
FROM chantiers WHERE whatsapp_group_id IS NOT NULL;

-- Supprimer les colonnes obsolètes
ALTER TABLE chantiers DROP COLUMN IF EXISTS whatsapp_group_id;
ALTER TABLE chantiers DROP COLUMN IF EXISTS whatsapp_invite_link;
```

`chantier_whatsapp_messages.group_id` (TEXT = JID brut) reste inchangé — lie via `chantier_whatsapp_groups.group_jid`.

---

## Feature 1 — Couleurs des bulles dans WhatsAppThread

### 3 rôles visuels

| Rôle | Identification | Couleur bulle | Alignement |
|------|----------------|---------------|------------|
| GérerMonChantier | `from_me: true` | `#DCF8C6` vert (inchangé) | Droite |
| Client (user) | `from_me: false` + phone = `userPhone` prop | `#DBEAFE` bleu clair | Droite |
| Artisan | `from_me: false` + phone dans contacts | blanc (inchangé) | Gauche |

### Changements

- `WhatsAppThread.tsx` : nouvelle prop `userPhone: string` (phone normalisé du user connecté)
- `getSenderRole(msg)` retourne `'gmc' | 'client' | 'artisan'`
- Bulles client : alignées à droite comme GérerMonChantier, couleur bleue
- `MessagerieSection.tsx` : passe `userPhone` depuis `supabase.auth.getUser()` (déjà disponible via `useEffect`)

---

## Feature 2 — Sélection des participants à la création

### Flow UX

1. Clic "Créer un groupe" → modale s'ouvre
2. **Champ nom** du groupe (défaut : "Groupe principal")
3. **Liste des contacts avec téléphone** : checkbox par contact (tous cochés par défaut), nom + téléphone affiché, contacts sans téléphone grisés/exclus
4. Le client (user) et GérerMonChantier sont toujours inclus (non-décochables, affichés avec badge)
5. Clic "Créer" → POST avec `{ name, selectedPhones[] }`

### Changements API

`POST /api/chantier/[id]/whatsapp` — body :
```json
{ "name": "Groupe principal", "selectedPhones": ["33612345678", "33662807754"] }
```
Côté serveur : crée le groupe whapi, INSERT dans `chantier_whatsapp_groups`, INSERT membres dans `chantier_whatsapp_members`.

---

## Feature 3 — Multi-groupes

### UI

- `WhatsAppGroupCard` → renommé `WhatsAppGroupsPanel`
- Liste les groupes existants (chacun avec nom, lien copier, bouton détail membres)
- Bouton "Nouveau groupe" toujours disponible
- Dans la liste gauche de `MessagerieSection` : une entrée par groupe (avec le nom du groupe)

### API

- `GET /api/chantier/[id]/whatsapp-groups` : liste groupes + membres
- `POST /api/chantier/[id]/whatsapp` : crée un groupe (body avec name + selectedPhones)
- `PATCH /api/chantier/[id]/whatsapp` : body `{ groupId, phones[] }` — ajoute membres au groupe ciblé
- `GET /api/chantier/[id]/whatsapp-messages?groupJid=XXX` : messages d'un groupe spécifique

### Lookup webhook

```typescript
// whapi.ts — avant : .eq('whatsapp_group_id', groupId) sur chantiers
// après :
const { data: group } = await supabase
  .from('chantier_whatsapp_groups')
  .select('chantier_id')
  .eq('group_jid', groupId)
  .single();
```

---

## Feature 4 — Suivi des membres (webhook + UI)

### Événements whapi

whapi envoie les changements de membres dans `payload.events[]` (distinct de `payload.messages[]`) :

```json
{
  "events": [
    {
      "type": "group.participants.remove",
      "chat_id": "120363427106673085@g.us",
      "participants": ["33662807754"]
    }
  ]
}
```

Types d'events à gérer : `group.participants.add`, `group.participants.remove`, `group.delete`.

### Traitement dans `whapi.ts`

```typescript
for (const event of payload.events ?? []) {
  const group = await lookupGroupByJid(event.chat_id);
  if (!group) continue;

  if (event.type === 'group.participants.remove') {
    await supabase.from('chantier_whatsapp_members')
      .update({ status: 'removed', left_at: new Date().toISOString() })
      .eq('group_id', group.id)
      .in('phone', event.participants);
  }
  if (event.type === 'group.participants.add') {
    // upsert avec status: 'active', left_at: null
  }
  if (event.type === 'group.delete') {
    await supabase.from('chantier_whatsapp_groups')
      .delete().eq('id', group.id);
  }
}
```

### UI — Détail membres dans le groupe

Dans `WhatsAppGroupsPanel`, chaque groupe affiche (sur clic "Détail") :
- Membres **actifs** : avatar vert + nom + rôle
- Membres **partis/exclus** : avatar gris + nom + "A quitté" / "Retiré" + date
- GérerMonChantier toujours en premier (badge spécial)

---

## Fichiers impactés — récapitulatif

| Fichier | Action |
|---------|--------|
| `supabase/migrations/20260401200000_whatsapp_multigroup.sql` | Créer (migration + data) |
| `src/pages/api/chantier/[id].ts` | Remplacer `whatsapp_group_id`/`invite_link` par `whatsapp_groups[]` |
| `src/pages/api/chantier/[id]/whatsapp.ts` | Réécrire POST + PATCH pour multi-groupe + membres |
| `src/pages/api/chantier/[id]/whatsapp-groups.ts` | Créer (GET liste groupes+membres) |
| `src/pages/api/chantier/[id]/whatsapp-messages.ts` | Ajouter filtre `?groupJid=` |
| `src/pages/api/webhooks/whapi.ts` | Lookup via `chantier_whatsapp_groups` + handler events membres |
| `src/lib/whapiUtils.ts` | Inchangé |
| `src/components/chantier/cockpit/WhatsAppGroupCard.tsx` | Réécrire → `WhatsAppGroupsPanel.tsx` (multi + modale sélection) |
| `src/components/chantier/cockpit/WhatsAppThread.tsx` | Ajouter prop `userPhone` + `groupJid` + couleurs rôles |
| `src/components/chantier/cockpit/MessagerieSection.tsx` | `waGroupId` → `waGroups[]`, passer `userPhone`, entrée par groupe |
| `src/integrations/supabase/types.ts` | Régénérer après migration |

---

## Risques de régression & mitigations

| Risque | Mitigation |
|--------|-----------|
| Suppression colonnes `chantiers` avant migration data | Migration atomique : INSERT + DROP dans la même transaction |
| Webhook tombe pendant migration | Migration en < 1s, Vercel serverless — risque négligeable |
| `types.ts` obsolète | Régénérer en fin de migration DB, avant tout autre code |
| `MessagerieSection` casse si `whatsapp_groups` absent | API retourne `[]` par défaut, composant gère array vide |
| Messages existants dans `chantier_whatsapp_messages` | `group_id` (JID) inchangé — lookup via `group_jid` fonctionne sans migration |
