# Design — Groupe WhatsApp par chantier (whapi.cloud)

**Date** : 2026-04-01
**Statut** : Validé

---

## Objectif

Permettre au client de créer un groupe WhatsApp par chantier regroupant :
- **Le client** (propriétaire du chantier) — numéro depuis `auth.users.raw_user_meta_data.phone`
- **Les artisans** — contacts de `contacts_chantier` ayant un numéro de téléphone renseigné
- **GérerMonChantier** — +33633921577 (représentant de marque, ajouté systématiquement)

---

## Décisions

- **Déclenchement** : bouton manuel dans l'onglet Messagerie (pas automatique à la création)
- **Mise à jour** : bouton "Mettre à jour les membres" pour ajouter les nouveaux contacts
- **Affichage** : carte statut avec nom du groupe + lien d'invitation
- **API** : whapi.cloud — token Bearer, base URL `https://gate.whapi.cloud`
- **Stockage** : 2 colonnes sur `chantiers` (`whatsapp_group_id`, `whatsapp_invite_link`)

---

## Stack technique

### Env vars
```
WHAPI_TOKEN=Bzghopu9IJzF7ndNB8cOUlmPOJIpPi19
WHAPI_API_URL=https://gate.whapi.cloud
```

### whapi.cloud — endpoints utilisés

| Action | Méthode | URL |
|--------|---------|-----|
| Créer le groupe | POST | `/groups` |
| Récupérer le lien d'invitation | GET | `/groups/{groupId}/invite` |
| Ajouter des participants | POST | `/groups/{groupId}/participants` |

### Format des numéros
International sans `+` : `33612345678` (supprimer le `0` initial si numéro français)

### Body création groupe
```json
{
  "subject": "Chantier - {nom_chantier}",
  "participants": ["33612345678", "33698765432", "33633921577"]
}
```

### Body ajout participants
```json
{
  "participants": ["33612345678"]
}
```

---

## DB — Migration SQL

```sql
ALTER TABLE chantiers ADD COLUMN whatsapp_group_id TEXT;
ALTER TABLE chantiers ADD COLUMN whatsapp_invite_link TEXT;
```

---

## API Routes

### `POST /api/chantier/[id]/whatsapp`
1. Auth + ownership check (pattern `requireChantierAuth`)
2. Vérifie qu'aucun groupe n'existe déjà (`whatsapp_group_id IS NULL`)
3. Récupère contacts avec `telephone` non null depuis `contacts_chantier`
4. Récupère le téléphone du client via `supabase.auth.admin.getUserById(userId)`
5. Formate tous les numéros en `33XXXXXXXXX`
6. Ajoute `33633921577` (GérerMonChantier)
7. `POST https://gate.whapi.cloud/groups` → récupère `id` du groupe
8. `GET https://gate.whapi.cloud/groups/{id}/invite` → récupère `link`
9. UPDATE `chantiers` SET `whatsapp_group_id`, `whatsapp_invite_link`
10. Retourne `{ groupId, inviteLink }`

### `PATCH /api/chantier/[id]/whatsapp`
1. Auth + ownership check
2. Récupère `whatsapp_group_id` (erreur 400 si pas encore créé)
3. Récupère contacts actuels avec téléphone
4. `POST https://gate.whapi.cloud/groups/{groupId}/participants`
5. Retourne `{ added: number }`

---

## Frontend — `MessagerieSection.tsx`

Carte WhatsApp en haut de la section messagerie, au-dessus des conversations email.

**État 1 — Pas de groupe**
```
[icône WhatsApp] Créer un groupe WhatsApp
Réunissez tous les artisans et le client dans un groupe
[Créer le groupe →]
```

**État 2 — Groupe actif**
```
✅ Groupe WhatsApp actif
"Chantier - Rénovation cuisine"
[Copier le lien] [Mettre à jour les membres]
```

**État loading** : spinner + "Création en cours..."
**Erreur** : toast rouge avec message whapi

---

## Composants à créer/modifier

| Fichier | Action |
|---------|--------|
| `supabase/migrations/YYYYMMDD_add_whatsapp_group.sql` | Nouveau — 2 colonnes |
| `src/pages/api/chantier/[id]/whatsapp.ts` | Nouveau — POST + PATCH |
| `src/lib/whapiUtils.ts` | Nouveau — helpers format numéro + appels whapi |
| `src/components/chantier/cockpit/WhatsAppGroupCard.tsx` | Nouveau — carte statut |
| `src/components/chantier/cockpit/MessagerieSection.tsx` | Modifier — intégrer la carte |
