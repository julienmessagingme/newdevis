# TODO / Backlog technique

Items issus des code reviews — filtrables par tag.

---

## [whapi-read-receipts]

- [ ] **Batcher les upserts statuts dans le webhook** — `src/pages/api/webhooks/whapi.ts`
  La boucle `for...of statuses` fait 1 SELECT + 1 UPSERT par status. Sur un groupe de 20+ membres lisant simultanément, whapi peut envoyer 50+ statuts en un seul batch → 100+ requêtes série. Fix : grouper par `message_id`, 1 `select().in()` pour les lookups chantier_id, puis `Promise.all` sur les upserts.

- [ ] **Logger `outgoingRes.error` explicitement** — `supabase/functions/agent-orchestrator/context.ts`
  Si la requête `whatsapp_outgoing_messages` plante (table absente, timeout), l'erreur est avalée silencieusement via `outgoingRes.data ?? []`. Ajouter un `console.error('[context] outgoing read receipts query failed:', outgoingRes.error.message)`.

- [ ] **Renommer `group_jid` → `chat_jid`** dans `whatsapp_outgoing_messages` — migration future
  Le digest du soir envoie en DM (`@s.whatsapp.net`), pas dans un groupe. La colonne s'appelle `group_jid` mais peut contenir un JID personnel. Créer une migration `ALTER TABLE whatsapp_outgoing_messages RENAME COLUMN group_jid TO chat_jid` et mettre à jour les refs dans `index.ts` et `context.ts`.

- [ ] **Batcher le lookup chantier_id dans le bloc statuts** — `src/pages/api/webhooks/whapi.ts`
  Le bloc statuts fait un SELECT par `message_id` distinct pour résoudre le `chantier_id`. Grouper les `message_id` uniques et faire un seul `select().in()` avant la boucle d'upsert.

---

## Tests E2E à faire

### [whapi-read-receipts]

- [ ] Webhook `POST /api/webhooks/whapi` avec payload contenant uniquement `statuses[]` (pas de `messages[]` ni `events[]`) → vérifier que l'early return ne court-circuite pas le bloc statuts et que les rows s'insèrent dans `whatsapp_message_statuses` `[whapi-read-receipts]`
- [ ] Tool `get_message_read_status` appelé avec un numéro sans aucun statut en base → réponse `{ ok: true, result: "Aucun accusé de lecture trouvé..." }` sans erreur `[whapi-read-receipts]`
- [ ] Double-envoi du même status whapi (même `message_id` + `viewer_id`) → idempotence via `ON CONFLICT` : UPDATE sans erreur, pas de doublon `[whapi-read-receipts]`

### [whapi-presence]

- [ ] Créer un groupe en sélectionnant un contact `has_whatsapp = false` : (a) le numéro est absent de l'appel whapi de création de groupe, (b) row inséré dans `chantier_whatsapp_members` avec `excluded_no_whatsapp = true`, (c) panel membres → 3e section "Sans WhatsApp" affichée, (d) modale → contact grisé, badge orange, décoché par défaut `[whapi-presence]`
- [ ] PATCH d'un groupe existant en ajoutant un contact `has_whatsapp = false` → mêmes vérifications (a–d) + réponse API `{ added: 0, excluded: 1 }` `[whapi-presence]`
- [ ] `POST /api/chantier/[id]/contacts` avec un numéro fixe (non-WhatsApp) → après quelques secondes : `has_whatsapp = false` et `whatsapp_checked_at` rempli en base, réponse API immédiate (fire-and-forget non bloquant) `[whapi-presence]`
- [ ] `POST /api/chantier/[id]/contacts` avec un vrai numéro WhatsApp → `has_whatsapp = true` et `whatsapp_checked_at` rempli `[whapi-presence]`
- [ ] Digest du soir `agent-orchestrator` : section "CONTACTS SANS WHATSAPP" présente dans le prompt (logs Supabase), aucune tâche de relance WhatsApp créée pour un contact `has_whatsapp = false` `[whapi-presence]`
