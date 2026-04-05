# Agent d'Orchestration "Pilote de Chantier"

> Design validé le 2026-04-05

## Objectif

Transformer les flux de données (WhatsApp, Emails, Uploads) en actions concrètes sur la DB via un agent IA avec function calling natif. L'agent observe, raisonne, et **agit** (modifie le planning, crée des tâches, alerte sur le budget).

## Decisions d'architecture

| Decision | Choix | Pourquoi |
|----------|-------|----------|
| Runtime | Edge Function Supabase | Multi-tenant SaaS, scale natif, stateless |
| Modele IA | Gemini 2.5 Flash | $0.15/1M tokens, function calling natif, deja utilise dans le projet |
| Function calling | Natif Gemini (pas du prompt engineering) | Schema tools JSON standardise, reponses structurees |
| Integration WhatsApp | Webhook Whapi -> edge function (pas OpenClaw) | Infra existante, zero changement cote WhatsApp |
| Skills -> API | HTTP vers API routes Vercel existantes | Zero duplication de logique metier |
| Etat inter-evenements | Postgres (table `agent_insights`) | Stateless mais persistent, scale natif |

## Perimetre V1 (Observateur + Acteur planning)

- Detecter les impacts planning dans les messages WhatsApp/email et **modifier les dates des lots** (cascade automatique via `computePlanningDates`)
- Alerter sur les depassements budget quand une facture est uploadee
- Resumer les conversations du jour par lot/artisan
- Detecter les risques passifs ("aucune nouvelle de X depuis Y jours", "lot Z sans devis signe")
- Digest quotidien envoye sur 3 canaux : WhatsApp (Whapi), Email (SendGrid), In-app (DB)

## Perimetre V2 (Proactif)

- L'agent envoie des messages WhatsApp/email de sa propre initiative (relances artisans, demandes de confirmation)
- Implemente via cron Supabase quotidien : hydrate donnees -> Gemini decide quelles actions proactives -> execute via Whapi/SendGrid

## Architecture

```
Whapi webhook ──> api/webhooks/whapi.ts (stocke en DB)
                  ──> fetch() fire-and-forget vers edge function agent-orchestrator

SendGrid webhook ──> api/webhooks/inbound-email.ts (stocke en DB)
                     ──> fetch() fire-and-forget vers edge function agent-orchestrator

Upload document ──> api/chantier/[id]/documents/* (stocke en DB)
                    ──> fetch() fire-and-forget vers edge function agent-orchestrator

Cron quotidien 19h ──> edge function agent-digest
                       ──> pour chaque chantier actif : genere digest
                       ──> envoie WhatsApp + Email + insert DB
```

## Edge Functions

### `agent-orchestrator` (nouvelle)

Declenchee par webhook (Whapi, SendGrid, upload). Recoit un evenement, hydrate le contexte, appelle Gemini avec function calling, execute les actions.

**Input** :
```json
{
  "event_type": "whatsapp_message" | "inbound_email" | "document_uploaded",
  "chantier_id": "uuid",
  "payload": { ... }  // message content, document metadata, etc.
}
```

**Flux** :
1. Hydrate contexte : GET lots + budget + contacts + 20 derniers messages + insights recents
2. Construit le prompt system avec le contexte JSON
3. Appelle Gemini 2.5 Flash avec tools schema
4. Boucle agent : tant que Gemini retourne des tool_calls, execute et re-prompt
5. Log le resultat dans `agent_insights`

**Tools (function calling)** :

| Tool | Methode | Route API | Action |
|------|---------|-----------|--------|
| `update_planning` | PATCH | `/api/chantier/{id}/planning` | Modifie dates/durees des lots, declenche cascade |
| `create_task` | POST | `/api/chantier/{id}/taches` | Cree une tache dans todo_chantier |
| `complete_task` | PATCH | `/api/chantier/{id}/taches/{tacheId}` | Marque une tache comme faite |
| `log_insight` | POST | `/api/chantier/{id}/insights` | Ecrit observation IA dans agent_insights |
| `update_lot_status` | PATCH | `/api/chantier/{id}/lots/{lotId}` | Change le statut d'un lot (en_cours, termine, etc.) |

**Pas de tool pour** : envoyer des messages (V1 = observateur, pas d'envoi). Les tools de lecture (contexte) ne sont pas des function calls — on pre-charge tout dans le prompt.

### `agent-digest` (nouvelle)

Declenchee par cron Supabase quotidien (19h). Pour chaque chantier actif, agrege les insights de la journee et envoie un digest.

**Flux** :
1. Query tous les chantiers avec activite recente (insights non lus)
2. Pour chaque chantier : agrege les insights, ajoute detection de risques (silence artisan, lots sans devis)
3. Appelle Gemini 2.5 Flash pour rediger un digest lisible
4. Envoie via 3 canaux :
   - WhatsApp : POST Whapi API vers le numero de l'user
   - Email : POST SendGrid vers l'email de l'user
   - In-app : INSERT dans `agent_insights` (type: 'digest')

## Nouvelle table `agent_insights`

```sql
CREATE TABLE agent_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'planning_impact', 'budget_alert', 'conversation_summary',
    'risk_detected', 'digest', 'lot_status_change'
  )),
  severity TEXT CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source_event JSONB,
  actions_taken JSONB,
  read_by_user BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_insights_chantier ON agent_insights(chantier_id, created_at DESC);
CREATE INDEX idx_insights_unread ON agent_insights(chantier_id, read_by_user) WHERE NOT read_by_user;
CREATE INDEX idx_insights_user ON agent_insights(user_id, created_at DESC);
```

## Nouvelle API route `/api/chantier/[id]/insights`

- `GET` : liste les insights du chantier (pour le dashboard frontend)
- `POST` : cree un insight (appele par l'edge function via service_role)

## Auth agent -> API routes

Header `X-Agent-Key` avec secret partage (`AGENT_SERVICE_KEY` en env Vercel).
Les API routes verifient ce header et operent avec les privileges service_role (bypass RLS).
Isolation tenant : l'edge function recoit toujours un `chantier_id` et ne peut operer que sur ce chantier.

## Modifications aux webhooks existants

### `api/webhooks/whapi.ts`
Ajouter apres le stockage en DB :
```typescript
// Fire-and-forget vers l'agent orchestrator
const agentPayload = {
  event_type: 'whatsapp_message',
  chantier_id: chantierId,
  payload: { from: msg.from, body: msg.body, type: msg.type, timestamp: msg.timestamp }
};
fetch(`${SUPABASE_URL}/functions/v1/agent-orchestrator`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(agentPayload)
}).catch(() => {}); // fire and forget
```

### `api/webhooks/inbound-email.ts`
Meme pattern apres stockage du message email.

### `api/chantier/[id]/documents/extract-invoice.ts` (et similaires)
Meme pattern apres extraction reussie d'un document.

## Modele IA et couts

- **Modele** : Gemini 2.5 Flash via `generativelanguage.googleapis.com/v1beta/` (meme endpoint que les edge functions existantes)
- **Cle** : `GOOGLE_API_KEY` (deja en env Supabase)
- **Context par appel** : ~4-6K tokens (system prompt + contexte chantier + message + tools schema)
- **Cout estime** : ~$0.01-0.02 par evenement. Pour un chantier actif (20 events/jour) = ~$0.30/jour
- **Pour 100 utilisateurs actifs** : ~$30/jour = ~$900/mois

## Risques identifies et mitigations

| Risque | Mitigation |
|--------|------------|
| Gemini se trompe de lot / mauvaise date | Mode "suggestion" : l'agent log l'insight mais marque `needs_confirmation: true`. Le dashboard affiche "L'agent suggere de decaler le lot X — Confirmer / Rejeter" |
| Message ambigu ("on commence lundi" — quel lot ?) | Prompt system strict : "Si tu ne peux pas identifier le lot avec certitude, log un insight de type 'needs_clarification' au lieu d'agir" |
| Cout tokens explose (contexte trop gros) | Cap le contexte a 5K tokens max. Ne charger que les lots actifs + 20 derniers messages |
| L'agent modifie le planning par erreur | Audit trail dans `actions_taken` (JSONB). Rollback possible via l'historique des dates dans `chantier_updates` |
| Webhook timeout (edge function > 150s) | Le function calling Gemini prend ~2-5s par appel. Boucle agent max 3 iterations |

## Fichiers a creer

```
supabase/functions/agent-orchestrator/
  index.ts          -- entrypoint, routing par event_type
  context.ts        -- hydratation contexte chantier depuis API routes
  tools.ts          -- schema des tools + execution
  prompt.ts         -- system prompt "Pilote de Chantier"
  types.ts          -- types TypeScript

supabase/functions/agent-digest/
  index.ts          -- cron handler, iteration chantiers, envoi multi-canal

src/pages/api/chantier/[id]/insights.ts  -- GET/POST insights
```

## Mode OpenClaw (V2 — option "geek")

Les skills (API routes) sont les memes dans les deux modes. Seul l'orchestrateur change :

| | Mode SaaS (defaut) | Mode OpenClaw |
|--|---------------------|---------------|
| Orchestrateur | Edge function Supabase | Instance OpenClaw sur VPS |
| Trigger | Webhook -> edge function | Webhook -> OpenClaw /hooks/agent |
| Modele | Gemini 2.5 Flash | Configurable (Claude, Gemini, etc.) |
| Etat | Stateless (Postgres) | Memoire agent persistante |
| Proactif | Cron Supabase | Heartbeat + cron OpenClaw |
| Cible | Multi-tenant, tous les users | Single-tenant, power users |

Pour activer le mode OpenClaw, un user configure son instance OpenClaw avec :
- Webhook Whapi pointe vers son OpenClaw au lieu de l'edge function
- Skills custom (SKILL.md) qui appellent les API routes GererMonChantier
- System prompt identique a celui de l'edge function

Prerequis : documenter les skills au format SKILL.md OpenClaw et publier sur ClawHub.

## Frontend (hors scope V1 mais prevu)

- Widget "Agent IA" dans le dashboard chantier : affiche les insights non lus
- Badge notification sur l'icone chantier quand il y a des insights unread
- Bouton "Confirmer / Rejeter" sur les insights `needs_confirmation`
