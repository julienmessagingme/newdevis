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

- [ ] **Tests E2E à écrire** — `src/pages/api/webhooks/whapi.ts` + `supabase/functions/agent-orchestrator/tools.ts`
  (a) Webhook avec payload `{ statuses: [...] }` seul (sans `messages` ni `events`) → vérifier que l'early return ne court-circuite pas le bloc statuts.
  (b) `get_message_read_status` appelé avec un phone sans aucun accusé enregistré → réponse `{ ok: true, result: "Aucun accusé de lecture..." }` propre.
  (c) Double-envoi du même status whapi (retry webhook) → idempotence via `onConflict: "message_id,viewer_id"` validée.
