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

---

## Architecture agent IA — évolutions long terme (post P1-P4)

**Contexte au 2026-04-26** : l'archi agent actuelle = 1 edge function Deno + Gemini 2.5-flash function calling + boucle MAX_TOOL_ROUNDS + history 20 msgs. Solide pour ~10-50 chantiers actifs avec 1-3 actions/jour/chantier.

P1-P4 livrés (pending decisions, modularisation tools, MAX_ROUNDS=8, fan-out cron) → l'archi tient jusqu'à ~100-200 chantiers actifs et 5-10 actions/jour/chantier.

**Ce qui plafonnera ensuite** : coût tokens Gemini sur contexts riches (rebuild à chaque call sans cache), hallucinations Gemini sur workflows multi-tour complexes (>5 tool_calls), hacks accumulés autour de Gemini (CONFIRMATION_REGEX, format tool_calls custom, max_tokens=16384 thinking budget).

À chaque entrée ci-dessous : quand ça devient actionnable et qu'on commence à coder → migrer vers `WIP.md`.

### 🟠 P5 — POC Claude Sonnet 4.7 + prompt caching

**Hypothèse à valider** : Claude + prompt caching réduit le TCO total malgré un prix au token brut plus élevé, parce que :
- Prompt caching = -90% sur le contexte (notre `context.ts` rebuild ~6-10k tokens à chaque appel — gain énorme)
- Taux de succès tool_call plus élevé = moins de retries
- Moins d'hallucinations = moins de "défaire ce qu'a fait l'agent" côté user
- Suppression progressive des hacks Gemini

**À mesurer sur 1 chantier de test, 1 mois** : taux tool_calls qui aboutissent, coût par run (avec cache hit rate visible), latence (avec streaming Anthropic), qualité subjective des messages générés.

**Quand le faire** : > 100 chantiers actifs OU dès qu'un user signale un comportement bizarre récurrent qu'on ne peut pas patcher facilement.

**Risque** : compatibilité tool calling (Anthropic format ≠ OpenAI format Gemini). Réécriture du dispatcher tools. Mais après P2 modularisation, c'est isolé.

### 🟠 P6 — Multi-agents chaînés (planner + executors)

**Hypothèse** : splitter l'orchestrator en 2 niveaux :
- 1 agent **planner** (full context) qui décide quoi faire
- N agents **executors** spécialisés (planning, finance, comm) avec prompt minimal et tools restreints

**Bénéfices attendus** : -40 à -60% sur les tokens cumulés, prompts plus précis par domaine, meilleure observabilité (chaque sous-agent loggé séparément).

**Coût** : latence cumulée (2-3 calls Gemini/Claude par tour), complexité du dispatcher.

**Quand le faire** : si après P5 on a encore des problèmes de qualité tool_call sur les workflows à 6+ étapes. Pas avant.

### 🟠 P7 — Évaluer un framework agent (Vercel AI SDK / Mastra)

**Contexte** : aujourd'hui dispatcher, retry logic, history compaction = 100% custom artisanal.

**Hypothèse** : Vercel AI SDK (déjà sur Vercel, intégration TS native) ou Mastra (TS-first, workflows + memory natifs) pourrait remplacer 60% du code custom.

**Bénéfices potentiels** : streaming natif (UX chat améliorée), observabilité native (LangSmith, Helicone), memory long terme (résumés glissants automatiques), workflows multi-step sans bricolage.

**Coût** : courbe d'apprentissage, dépendance externe (lock-in, breaking changes), perte de contrôle fin (ex: nos hacks Gemini).

**Quand le faire** : POC à 6 mois (mi-2026) sur 1 fonctionnalité périphérique avant de migrer le coeur.

**À NE PAS faire** : 🔴 LangGraph en Python — ajoute Python à notre stack (Astro + Deno + Python = 3 runtimes), trop de friction pour le bénéfice.

### 🟠 P8 — State machine explicite pour workflows critiques

Si la complexité des workflows pending explose (>3 états avec branches conditionnelles), envisager XState ou home-made. Aujourd'hui : pending → resolved/expired suffit, donc pas pertinent. À reconsidérer si on ajoute des workflows multi-acteurs (ex: validation simultanée artisan + comptable).

### 🟠 P9 — Recommandation artisan (feature)

Quand un lot a 0 devis depuis X jours, proposer une short-list d'artisans RGE / proches géographiquement / bien notés Google. Nécessite : dataset RGE (ADEME — déjà partiellement utilisé dans `verify.ts`), API Google Places pour proximité, scoring custom. Forte valeur user, gros build. À planifier quand les bases sont solides.

### 🟠 P10 — Canaux proactifs alternatifs (Web Push / email)

⚠️ **À ne pas confondre avec la vague 3** qui livre le canal proactif principal **via WhatsApp privé** (groupe "Mon Chantier — X" avec uniquement le user dedans). P10 = canaux **alternatifs** pour les users qui ne veulent pas / ne peuvent pas WhatsApp.

Pistes :
- **Web Push API** (notif browser) : permission demandée au premier login, push depuis edge function via VAPID. Fonctionne même app fermée si browser ouvert.
- **Email transactionnel SendGrid** : digest quotidien ou notif immédiate sur les triggers critiques (alertes, clarifications urgentes).

Settings UI à enrichir : checkboxes par canal (WhatsApp / Web Push / Email) × par catégorie de trigger (clarifications / alertes critiques / rappels / etc.). Sinon spam.

Pas urgent : à activer si on identifie une cohorte significative de users sans WhatsApp.

### 🟠 P11 — Rapport PDF fin de chantier

À la réception du chantier, livret PDF récap : timeline, lots, devis, factures, photos avant/après, total dépensé vs budget initial, performances par artisan. Service pour le user, angle commercial fort.
