# Messagerie Chantier — Design Document

Date: 2026-03-25

## Objectif

Ajouter un onglet "Messagerie" dans la sidebar du dashboard chantier permettant au client d'envoyer des emails (et WhatsApp) aux contacts de son chantier, et de recevoir les réponses directement dans l'application.

## Décisions

| Choix | Décision |
|---|---|
| Service email | **SendGrid** (envoi + Inbound Parse pour réception) |
| Adressage reply | Sous-domaine dédié : `reply.gerermonchantier.fr` |
| Format reply-to | `chantier-{chantierId}+{convId}@reply.gerermonchantier.fr` |
| WhatsApp | Lien `wa.me/{numéro}?text={message}` (pas d'API) |
| Templates | Fichier statique `data/MESSAGE_TEMPLATES.ts`, évolutif vers table DB |

## Architecture

```
Client (onglet Messagerie)
  │
  ├──▸ POST /api/chantier/[id]/messages
  │      ├── Stocke en DB (chantier_messages)
  │      └── Envoie via SendGrid API
  │            From: "Julien via GererMonChantier"
  │            Reply-To: chantier-xxx+conv-yyy@reply.gerermonchantier.fr
  │
  ▼
Artisan reçoit email → fait "Répondre"
  │
  ▼
SendGrid Inbound Parse
  │
  ├──▸ POST /api/webhooks/inbound-email
  │      ├── Parse adresse reply → identifie conversation
  │      ├── Stocke en DB (chantier_messages, direction: inbound)
  │      ├── Incrémente unread_count
  │      └── Envoie notification email au client
  │
  ▼
Client voit la réponse dans l'onglet Messagerie
```

## Modèle de données

### Table `chantier_conversations`

| Colonne | Type | Description |
|---|---|---|
| id | UUID PK | |
| chantier_id | UUID FK → chantiers CASCADE | |
| contact_id | UUID FK → contacts_chantier SET NULL | Peut être null si contact supprimé |
| user_id | UUID NOT NULL | Propriétaire |
| contact_name | TEXT NOT NULL | Dénormalisé |
| contact_email | TEXT NOT NULL | |
| contact_phone | TEXT | Pour lien wa.me |
| reply_address | TEXT NOT NULL UNIQUE | Adresse reply-to unique |
| last_message_at | TIMESTAMPTZ | Pour tri |
| unread_count | INTEGER DEFAULT 0 | Badge notification |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |

RLS: user-scoped (`auth.uid() = user_id`)

### Table `chantier_messages`

| Colonne | Type | Description |
|---|---|---|
| id | UUID PK | |
| conversation_id | UUID FK → chantier_conversations CASCADE | |
| direction | TEXT CHECK ('outbound', 'inbound') | Envoyé / Reçu |
| body_text | TEXT NOT NULL | Contenu plain text |
| body_html | TEXT | Contenu HTML (replies artisans) |
| sendgrid_id | TEXT | ID SendGrid tracking |
| status | TEXT DEFAULT 'sent' | 'draft', 'sent', 'delivered', 'failed' |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |

RLS: via join sur `chantier_conversations.user_id`

### Index

- `idx_conv_chantier_id` sur `chantier_conversations(chantier_id)`
- `idx_conv_user_id` sur `chantier_conversations(user_id)`
- `idx_conv_reply_address` UNIQUE sur `chantier_conversations(reply_address)`
- `idx_msg_conversation_id` sur `chantier_messages(conversation_id)`
- `idx_msg_created_at` sur `chantier_messages(created_at)`

## API Routes

| Méthode | Route | Auth | Rôle |
|---|---|---|---|
| GET | `/api/chantier/[id]/conversations` | JWT | Liste des conversations (trié par last_message_at DESC) |
| GET | `/api/chantier/[id]/conversations/[convId]` | JWT | Messages d'une conversation |
| POST | `/api/chantier/[id]/messages` | JWT | Envoyer un message (crée la conversation si 1er échange) |
| PATCH | `/api/chantier/[id]/conversations/[convId]` | JWT | Marquer comme lu (unread_count = 0) |
| POST | `/api/webhooks/inbound-email` | Signature SendGrid | Réception des réponses artisans |

### POST /api/chantier/[id]/messages — Payload

```json
{
  "contact_id": "uuid",
  "subject": "Demande de devis - Rénovation cuisine",
  "body": "Bonjour M. Dupont, ..."
}
```

### POST /api/webhooks/inbound-email — Traitement

1. Parse le champ `to` → extraire `convId` depuis `chantier-xxx+conv-yyy@reply...`
2. Vérifier que la conversation existe
3. Extraire `text` (plain text) et `html` du payload SendGrid
4. INSERT dans `chantier_messages` (direction: `inbound`)
5. UPDATE `chantier_conversations` : `unread_count += 1`, `last_message_at = NOW()`
6. Envoyer email notification au client : "Vous avez une réponse de {contact_name} sur {chantier_nom}"

### Sécurité webhook

- Pas de JWT (appelé par SendGrid)
- Validation via signature SendGrid (Event Webhook Verification) ou whitelist IP
- Rate limiting recommandé

## Templates de messages

### Structure (fichier statique `data/MESSAGE_TEMPLATES.ts`)

```typescript
interface MessageTemplate {
  id: string;
  label: string;
  category: 'devis' | 'relance' | 'administratif' | 'planning';
  subject: string;
  body: string;
}
```

### Variables interpolées

- `{{artisan_nom}}`, `{{artisan_entreprise}}`
- `{{chantier_nom}}`, `{{chantier_adresse}}`
- `{{lot_nom}}`, `{{lot_budget}}`
- `{{client_nom}}`, `{{client_telephone}}`

Les variables sont remplacées au moment de l'insertion dans le champ message. L'utilisateur peut modifier avant envoi.

**Évolution future** : table `message_templates` avec CRUD admin.

## UI

### Sidebar

Nouvel onglet **"Messagerie"** (icône `Mail` de Lucide) inséré entre "Contacts" et "Analyse des devis". Badge avec le total `unread_count` de toutes les conversations du chantier.

### Vue liste (panneau gauche)

- Recherche par nom de contact
- Bouton "+ Nouveau message" → sélecteur parmi les contacts ayant un email
- Chaque ligne : avatar/initiales, nom, rôle, aperçu dernier message, date, pastille unread
- Trié par `last_message_at DESC`

### Vue conversation (panneau droit)

- Header : nom contact, email, bouton WhatsApp (si téléphone)
- Historique : bulles alternées (outbound = droite/bleu, inbound = gauche/gris)
- Zone de saisie en bas : textarea + bouton template + bouton WhatsApp + bouton Envoyer
- Bouton template : dropdown avec catégories, clic → insère le texte pré-rempli

### Mobile

- Liste = vue plein écran
- Clic sur conversation = navigation vers vue conversation plein écran avec bouton retour

## Configuration SendGrid requise

1. Créer un compte SendGrid
2. Configurer le domaine d'envoi (Domain Authentication) pour `gerermonchantier.fr`
3. Configurer Inbound Parse : MX record `reply.gerermonchantier.fr` → `mx.sendgrid.net`
4. Inbound Parse webhook URL : `https://www.verifiermondevis.fr/api/webhooks/inbound-email`
5. Variables d'environnement Vercel :
   - `SENDGRID_API_KEY`
   - `SENDGRID_INBOUND_WEBHOOK_SECRET` (optionnel, pour validation signature)

## Variables d'environnement

| Variable | Où | Usage |
|---|---|---|
| `SENDGRID_API_KEY` | Vercel | Envoi email via SendGrid API |
| `SENDGRID_INBOUND_WEBHOOK_SECRET` | Vercel | Validation signature webhook inbound |
| `REPLY_EMAIL_DOMAIN` | Vercel | `reply.gerermonchantier.fr` |

## Fichiers à créer/modifier

### Nouveaux fichiers
- `supabase/migrations/xxx_create_chantier_messaging.sql` — tables + RLS + index
- `src/pages/api/chantier/[id]/messages.ts` — envoi de messages
- `src/pages/api/chantier/[id]/conversations.ts` — liste conversations
- `src/pages/api/chantier/[id]/conversations/[convId].ts` — messages + mark read
- `src/pages/api/webhooks/inbound-email.ts` — webhook SendGrid
- `src/components/chantier/cockpit/MessagerieSection.tsx` — composant principal
- `src/components/chantier/cockpit/ConversationList.tsx` — liste conversations
- `src/components/chantier/cockpit/ConversationThread.tsx` — fil de messages
- `src/components/chantier/cockpit/MessageComposer.tsx` — zone de saisie + templates + WA
- `src/components/chantier/cockpit/TemplateSelector.tsx` — dropdown templates
- `src/data/MESSAGE_TEMPLATES.ts` — templates statiques
- `src/hooks/useConversations.ts` — hook chargement conversations
- `src/hooks/useMessages.ts` — hook chargement messages + envoi

### Fichiers modifiés
- `src/components/chantier/cockpit/DashboardUnified.tsx` — ajouter onglet Messagerie + badge unread
