# TODO.md — Backlog VerifierMonDevis.fr / GérerMonChantier

Backlog = items à faire **non encore commencés**. Dès qu'on attaque un item, il bascule dans `WIP.md`.

Pour le rationnel et l'historique des audits UX, voir `UX-AUDIT.md`.

---

## UX/UI cockpit GMC — issus de l'audit #2 (2026-05-09)

### P0 — Frein produit majeur

- [ ] **I3 — Surface persistante Assistant IA** : aujourd'hui les alertes IA (`agent_insights`) ne sont visibles que dans l'onglet "Assistant" + badge sidebar + toasts < 5 min. Un user qui n'ouvre jamais cet onglet ne voit jamais une alerte. À faire : bandeau discret (amber, lien vers onglet) sur DashboardHome si `agentInsights.unreadCount > 0` ; idem en haut du BudgetTab si insights financiers non lus ; rouge si `hasCriticalInsight`. Décision UX préalable : où placer (Dashboard seul ? toutes les pages ?), quel wording, quel comportement de fermeture.

### P0 — Mobile

- [ ] **N5b — IntervenantsListView en cards mobile** : actuellement tableau 6 colonnes `min-w-[760px]` qui force scroll-X sur 375px (font 10px illisible). À faire : variant cartes empilées sous breakpoint `sm`, comme déjà appliqué dans `BudgetTab` (`sm:hidden` / `hidden sm:flex`). Fichier : `src/components/chantier/cockpit/lots/IntervenantsListView.tsx:185`.

- [ ] **N5c — Touch events Planning Gantt** : `PlanningTimeline` écoute uniquement `MouseEvent` (`onMouseDown/Move/Up`). Aucun `onTouchStart/Move/End` → drag/resize impossible sur mobile. Poignées de resize en `opacity-0 group-hover/bar:opacity-100` → invisibles sur touch. À faire : ajouter touch events (ou `pointerdown` qui couvre les deux), forcer poignées visibles sous `lg:hidden`, ou afficher une vue list-mode alternative sur mobile. Fichier : `src/components/chantier/cockpit/planning/PlanningTimeline.tsx:60-160`. Effort estimé : 1 j.

### P1 — UX moyens

- [ ] **I5 — Vue expert / novice en toggle** : le tableau Budget reste dense par défaut (6 colonnes). À faire : toggle "🌱 Vue simple / 🔧 Vue détaillée" dans ActionBar. En mode simple → masquer "Facturé" et "Avancement", garder Artisan/Engagé/Solde/Actions. Persistance localStorage. Refonte invasive du tableau (colgroup table-fixed + headers + cells) → planifier un sprint dédié pour éviter régressions.

- [ ] **Pencil edit durée LotDetail (touch target)** : `w-6 h-6` (24×24) — sous WCAG 44×44. À traiter dans une passe globale "touch targets" avec aussi les boutons Check/X durée (28×28). Fichier : `src/components/chantier/cockpit/lots/LotDetail.tsx:162`.

---

## Refacto code (suite de l'audit structure 2026-05-08/09)

Étapes 1-4 livrées. Reste à programmer, priorisé par ROI.

- [ ] **Étape 5 — Casser `BudgetTab.tsx` (2581 lignes 🔥)**
  Le pire fichier du repo. Effort : ~1j. Risque : moyen (fichier critique, plusieurs flux paiement).
  Plan minimal : extraire 4-5 sous-composants (`IntervenantsList`, `PaymentSummary`, `MissingDocAlerts`, `LineItemRow`) en gardant `BudgetTab.tsx` comme orchestrateur < 500 lignes.

- [ ] **Étape 6 — Consolider Trésorerie ×3**
  `tresorerie/{TresoreriePanel, TresorerieView, BudgetTresorerie}` = 4 niveaux de cascade pour afficher un même domaine. Effort : ~1j. Risque : moyen — `showBudgetDetail` flag dans ChantierCockpit suggère 2 modes distincts. **Audit avant de fusionner**.

- [ ] **Étape 7 — Partition `lib/` par domaine**
  38 fichiers plats. Mêmes domaines que `cockpit/` :
  ```
  lib/
  ├── api/         (apiHelpers)
  ├── analyse/     (verdictEngine, scoreUtils, conclusionTypes, entrepriseUtils, urbanismeUtils, blogUtils, securiteUtils, devisUtils, quoteGlobalAnalysis, contexteUtils, architecteUtils)
  ├── chantier/    (planningUtils, lotUtils, paymentEvents, financingUtils, budgetAffinageData, budgetHelpers, dashboardHelpers, roadmapUtils)
  ├── auth/        (gmcAccess, postLoginRedirect, signOut, ssoHandoffClient, adminAuth, brand, domainConfig)
  ├── integrations/ (whapiUtils, marketingApi, amplitude, subscription)
  └── data/        (workTypeReferentiel, formalitesLinks, prompts/)
  ```
  Effort : 30min. Risque : bas. Faire en `git mv` + bulk update des imports `@/lib/X` → `@/lib/<domain>/X`.

- [ ] **Étape 8 — Header ×3 sync**
  3 variantes (`layout/Header.tsx` React + `astro/Header.astro` + `gmc-landing/Header.astro`) imposent de modifier 3 fichiers à chaque changement d'auth state. Extraire un `<HeaderUserMenu />` partagé client:only — les 3 Headers se réduisent à layout + branding + import du même menu.
  Effort : 2-3h. Risque : moyen.

- [ ] **Étape 9 — Découper `AnalysisResult.tsx` (1341 lignes)**
  Page principale d'analyse de devis. Les sections `Block*` sont déjà extraites — reste 1341 lignes d'orchestrateur dont gros useMemo (`effectiveScore`, `weightedAnomalies`) à sortir en hooks dédiés (`useEffectiveScore.ts`, `useWeightedAnomalies.ts`). Cible : ~600 lignes.
  Effort : ~1j. Risque : moyen (page critique, beaucoup de logique TDZ-sensible — cf. règle "TDZ in edge functions and React").

- [ ] **Étape 10 — Tests unitaires (couverture critique)**
  Au minimum couvrir avec Vitest :
  - `lib/planningUtils.ts` (CPM forward pass — bug zone historique)
  - `lib/market-prices.ts` (matching 5 niveaux + emergency fallback)
  - `pages/api/analyse/[id]/conclusion.ts` (`extractKnownSurface`, `hasSurfaceUnitMismatch`)
  - `verdictEngine.ts` ✅ déjà couvert (27 cas)

  Effort : 2-3j. Risque : bas. Filet de sécurité critique vu que l'agent IA prend des actions destructives.

---

## Dette technique

- [ ] **Cron timeout — fan-out pattern**
  Le cron quotidien `agent-orchestrator-evening-digest` traite les chantiers actifs en batches de 3. Au-delà de ~10 chantiers actifs, on risque le timeout edge function 60s.
  **Solution** : edge function "dispatcher" qui fire N appels indépendants à l'edge function `agent-orchestrator` (1 par chantier). Pas bloquant — juste à anticiper avant que la base utilisateur grossisse.

- [ ] **Migration `useInsights` legacy → `agent_insights`**
  6 composants utilisent encore `cockpit/useInsights.ts` (ancien système Gemini MOE — appel éphémère sans persistance) :
  - `BudgetTresorerie.tsx`
  - `AnalyseDevisSection.tsx`
  - `LotCard.tsx`
  - `LotIntervenantCard.tsx`
  - `BudgetKpiCard.tsx`
  - `dashboardHelpers.ts`

  À terme : remplacer par lecture des `agent_insights` persistants (mêmes données mais cachées + traçables). Pas urgent — ça marche aujourd'hui.

---

## Architecture agent IA — évolutions à programmer (issu de WIP § 12)

- [ ] **P4 — Fan-out cron evening**
  Aujourd'hui batch 3 séquentiels → > 30-50 chantiers actifs = timeout edge function 60s.
  Edge function "dispatcher" qui fire N invocations indépendantes (1 par chantier) au lieu de boucler. Chaque invocation = 1 chantier, timeout indépendant.
  *(Recouvre partiellement "Cron timeout fan-out pattern" ci-dessus — fusionner les deux quand on attaque.)*

- [ ] **P5 — POC Claude Sonnet 4.7 + prompt caching**
  **Hypothèse à valider** : Claude + prompt caching réduit le TCO total malgré un prix au token brut plus élevé, parce que :
  - Prompt caching = -90% sur le contexte (notre `context.ts` rebuild ~6-10k tokens à chaque appel — gain énorme)
  - Taux de succès tool_call plus élevé = moins de retries
  - Moins d'hallucinations = moins de "défaire ce qu'a fait l'agent" côté user
  - Suppression progressive des hacks Gemini

  **À mesurer sur 1 chantier de test, 1 mois** : taux tool_calls qui aboutissent, coût par run (avec cache hit rate visible), latence (avec streaming Anthropic), qualité subjective des messages générés.

  **Quand le faire** : > 100 chantiers actifs OU dès qu'un user signale un comportement bizarre récurrent qu'on ne peut pas patcher facilement.

  **Risque** : compatibilité tool calling (Anthropic format ≠ OpenAI format Gemini). Réécriture du dispatcher tools. Mais après P2 modularisation (livré), c'est isolé.

- [ ] **P6 — Multi-agents chaînés (planner + executors)**
  **Hypothèse** : splitter l'orchestrator en 2 niveaux :
  - 1 agent **planner** (full context) qui décide quoi faire
  - N agents **executors** spécialisés (planning, finance, comm) avec prompt minimal et tools restreints

  **Bénéfices attendus** : -40 à -60% sur les tokens cumulés, prompts plus précis par domaine, meilleure observabilité (chaque sous-agent loggé séparément).

  **Coût** : latence cumulée (2-3 calls Gemini/Claude par tour), complexité du dispatcher.

  **Quand le faire** : si après P5 on a encore des problèmes de qualité tool_call sur les workflows à 6+ étapes. Pas avant.

- [ ] **P7 — Évaluer un framework agent (Vercel AI SDK / Mastra)**
  **Contexte** : aujourd'hui dispatcher, retry logic, history compaction = 100% custom artisanal.

  **Hypothèse** : Vercel AI SDK (déjà sur Vercel, intégration TS native) ou Mastra (TS-first, workflows + memory natifs) pourrait remplacer 60% du code custom.

  **Bénéfices potentiels** : streaming natif (UX chat améliorée), observabilité native (LangSmith, Helicone), memory long terme (résumés glissants automatiques), workflows multi-step sans bricolage.

  **Coût** : courbe d'apprentissage, dépendance externe (lock-in, breaking changes), perte de contrôle fin (ex: nos hacks Gemini).

  **Quand le faire** : POC à 6 mois (mi-2026) sur 1 fonctionnalité périphérique avant de migrer le coeur.

  **À NE PAS faire** : 🔴 LangGraph en Python — ajoute Python à notre stack (Astro + Deno + Python = 3 runtimes), trop de friction pour le bénéfice.

- [ ] **P8 — State machine explicite pour workflows critiques**
  Si la complexité des workflows pending explose (>3 états avec branches conditionnelles), envisager XState ou home-made. Aujourd'hui : pending → resolved/expired suffit, donc pas pertinent. À reconsidérer si on ajoute des workflows multi-acteurs (ex: validation simultanée artisan + comptable).

- [ ] **P10 — Canaux proactifs alternatifs (Web Push / email)**
  ⚠️ **À ne pas confondre avec la vague 3** qui livre le canal proactif principal **via WhatsApp privé** (groupe "Mon Chantier — X" avec uniquement le user dedans). P10 = canaux **alternatifs** pour les users qui ne veulent pas / ne peuvent pas WhatsApp.

  Pistes :
  - **Web Push API** (notif browser) : permission demandée au premier login, push depuis edge function via VAPID. Fonctionne même app fermée si browser ouvert.
  - **Email transactionnel SendGrid** : digest quotidien ou notif immédiate sur les triggers critiques (alertes, clarifications urgentes).

  Settings UI à enrichir : checkboxes par canal (WhatsApp / Web Push / Email) × par catégorie de trigger (clarifications / alertes critiques / rappels / etc.). Sinon spam.

  Pas urgent : à activer si on identifie une cohorte significative de users sans WhatsApp.

---

## Tools agent IA — vague 3 reste à câbler

Vagues 1, 2, 3 livrées (cf. WIP § 13 historique). Sous-items non commencés :

- [ ] **UI activation canal owner WhatsApp**
  Bouton dans Settings (chantier) "Activer notifications WhatsApp IA" qui appelle `POST /api/chantier/[id]/whatsapp { is_owner_channel: true }`. Aujourd'hui c'est l'agent qui peut le créer via `create_owner_whatsapp_channel` à la demande user au chat. Mais idéal : exposer aussi le bouton UI pour les users qui ne passent pas par le chat. Petit dev, ~30 min.

- [ ] **8 triggers proactifs à câbler**
  Définis dans `WIP § 12` round précédent. Pas encore tous implémentés. À faire après stabilisation de la vague 3 :
  1. Clarification urgente (`request_clarification`) — déjà routé via `agent_insights`
  2. Alerte critique (`severity=critical`) — à câbler vers WA owner channel
  3. Paiement en retard — déjà détecté par `agent-checks`, à router vers WA owner
  4. Lot bloqué sans devis depuis 14j — à ajouter dans `agent-checks`
  5. Rappel programmé (`schedule_reminder`) — ✅ implémenté via `agent-scheduled-tick`
  6. Déblocage attendu non reçu — nécessite tracking sur `payment_events` type entrée
  7. Action automatique prise (debrief) — à câbler dans `log_insight`
  8. Décision à prendre — ✅ implémenté via `notify_owner_for_decision`

  UI Settings : checkboxes par catégorie pour activer/désactiver chaque trigger. Sinon risque de spam owner.

---

## Vue mobile — passes restantes (suite de WIP § 9)

Étapes 1-6+8 livrées (cf. WIP § 9). Reste :

- [ ] **ÉTAPE 7 — Touch targets 44px min** : surtout chevrons, icon buttons dans DocumentsView, ContactsSection. Recouvre N6a/N5b de l'audit UX #2.
- [ ] **ÉTAPE 9 — AnalysisResult blocs secondaires collapsés par défaut sur mobile** : aujourd'hui tous les blocs (Entreprise, Sécurité, Urbanisme…) sont déroulés → page très longue sur mobile. Collapse les blocs secondaires, garder l'essentiel ouvert (Conclusion + Prix marché).
- [ ] **ÉTAPE 10 — Homepage : résultat visuel + exemple concret** : la homepage parle au mobile mais ne montre pas un exemple concret de résultat d'analyse. Ajouter un screenshot annoté ou un mini-flow interactif.
- [ ] **PlanningTimeline mobile** (gros chantier) — le Gantt est galère sur petit écran. Recouvre N5c de l'audit UX #2.
- [ ] **ContactsSection + DocumentsView mobile** (LotBadge dropdown débordant, KPIs lisibles) — issues #16 du précédent audit.

---

## Cohérence Budget initial (estimation IA) ↔ Budget/Trésorerie (suivi réel)

UX à repenser — fracture entre les 2 phases du chantier.

Aujourd'hui on a deux mondes parallèles autour du budget :

- **Phase 1 — "Avant travaux"** : Accueil → Budget chantier → bouton "Affiner". Logique vague d'estimation IA (`market_prices`, qualification), l'utilisateur ne sait pas vraiment combien ça va coûter, on lui donne une fourchette. Réfine progressivement par questions (surface précise, choix matériaux, etc.).
- **Phase 2 — "On a lancé"** : Budget & Trésorerie. Logique de suivi de dépenses réelles. On a des devis signés, des factures, des paiements. Échéancier prévisionnel et réel. Cashflow.

### Le problème
Pas de **passerelle UX** entre les deux. Quand l'utilisateur passe de "j'ai mon estimation IA" à "j'ai mes devis et je commence à payer", il y a une rupture :
- Le budget IA initial n'apparaît plus en référence dans Budget & Trésorerie (sauf un encadré statique "budget cible XXX €").
- Pas de comparaison "estimation IA vs devis reçus" mise en avant — l'écart n'est visible qu'à travers les conseils proactifs (`buildConseils` "dépassement budget").
- L'utilisateur n'est pas guidé vers "tu peux maintenant figer ton budget réel à partir des devis validés" — on reste sur l'estimation initiale.

### Pistes de hitch / passerelle
- **Étape de transition explicite** : quand X% des lots ont un devis validé, proposer "Bascule vers le suivi réel — fige ton budget cible à partir des devis signés". Stocke un nouveau `budget_real` distinct du `budget_ia` initial.
- **Vue comparée side-by-side** dans Budget & Trésorerie : "Estimation IA initiale | Devis validés | Écart | % engagement". Visible en haut de l'onglet.
- **Sur l'écran Affiner** : à la fin du flow d'affinage, CTA explicite "Tu as ton estimation. Maintenant uploade tes devis pour passer en suivi de dépenses réelles" → routage vers tab Budget.
- **Ligne du temps narrative** dans l'Accueil : "Phase 1 estimation → Phase 2 suivi → Phase 3 bilan" avec progression visible (pourcentage de devis validés).

### À décider avant d'attaquer
- Faut-il créer un champ `budget_real_locked` distinct de `budget_ia` ?
- Le passage Phase 1 → Phase 2 est-il automatique (heuristique sur nb devis validés) ou manuel (CTA user) ?
- Faut-il garder l'estimation IA visible en permanence comme "rétroviseur" ou la masquer après bascule ?

---

## Idées produit en réflexion (pas codées)

- [ ] **"Joindre une preuve a posteriori"**
  Quand un frais est déclaré au chat, l'utilisateur reçoit le ticket plusieurs jours après. Pouvoir uploader le ticket et "promouvoir" le frais en `ticket_caisse` rattaché au document. Évite la double saisie.

- [ ] **Notification push proactive**
  Aujourd'hui les insights critical apparaissent dans le fil d'activité + WhatsApp digest. Pour des alertes vraiment urgentes (paiement à faire dans 24h, retard critique chantier), envisager push browser ou email immédiat. *(Recouvre P10 ci-dessus — à fusionner.)*

- [ ] **Rapport PDF chantier**
  À la fin du chantier, générer un PDF récap : timeline, lots, devis, factures, photos, total dépensé vs budget initial. Genre "livret de fin de chantier" remis au propriétaire.

- [ ] **Mode "invité collaborateur"**
  Inviter un conjoint / un proche à voir le chantier sans pouvoir tout modifier. Lecture + commentaires uniquement.

- [ ] **Recommandation artisan**
  Quand un lot a 0 devis depuis X jours, proposer une short-list d'artisans RGE / proches géographiquement / bien notés Google.

---

## Audit scalabilité + dette technique (2026-05-09)

Audit en 4 axes (DB/Supabase, edge functions/agent IA, dette code, coûts/observabilité). Les items déjà listés ailleurs dans ce TODO ne sont pas dupliqués — référencés inline.

**Verdict global** : aujourd'hui le projet scale bien jusqu'à ~30 chantiers actifs. Plafonds identifiés à 50-100 chantiers : (1) timeouts edge functions Supabase 60s sur extraction PDF gros, (2) cap Gemini 1k req/min sur batch evening, (3) queries DB en cascade sur views complexes (`payment_events_v`, `admin_kpis_*` non matérialisées). **Coût marginal estimé : ~€0.65-1.65/chantier actif/mois variable + ~€25-50/mois fixe (Supabase Pro + Vercel)**.

### P0 — Critique (à traiter avant 50 chantiers actifs)

- [ ] **Sentry / error tracking centralisé** — pas de Sentry installé. Silent failures détectés : whapi photo download (`webhooks/whapi.ts:69`), JSON truncation extraction (CLAUDE.md piège connu), agent tool_calls aborted, edge functions catch sans alerte. À faire : `npm i @sentry/node` + init dans edge functions Deno + serverless routes Vercel. ROI très haut, effort ~M (½ j).

- [ ] **Webhook idempotence whapi + SendGrid** — whapi peut retry une 2e fois en cas de timeout edge fn → INSERT `chantier_whatsapp_messages` même `id` deux fois (PK constraint silently fails). Fix : UPSERT par `message_id` (whapi) + idempotency key SendGrid inbound. Effort ~L (1-2h).

- [ ] **Timeouts explicites sur tous les fetch Gemini** — `analyze-quote` enchaîne 3 calls Gemini en série (extract → market-prices → summary). Si l'un stale, 60s Supabase atteint silencieusement. À faire : `AbortSignal.timeout(8000)` sur chaque fetch + circuit breaker partagé. Fichiers : `supabase/functions/analyze-quote/extract.ts`, `market-prices.ts`. Effort 4h.

- [ ] **Sanitize XSS sur `dangerouslySetInnerHTML`** — 5 utilisations détectées, dont 2 sans sanitize stricte (`ScreenAmeliorations.tsx`, `ChatDrawer.tsx`). Le contenu vient parfois de l'IA, donc injection possible. Fix : DOMPurify partout, ou regex stricte documentée. Effort 4h.

- [ ] **Gemini timeout sur gros PDF (>50 pages)** — `extract-document` peut hit le 240s edge function ceiling. À faire : chunk async + multi-part upload via Gemini Files API (déjà à moitié construit dans `extract.ts:86`). Effort ~M (½ j).

### P1 — Important (entre 50 et 100 chantiers)

- [ ] **Retry avec backoff exponentiel sur Gemini 429/500** — aujourd'hui `MAX_RETRIES=0` sur extract.ts:130 et market-prices.ts:802. Un 429 transitoire = 1 tool_call wasted, agent abandonne. Fix : 3 retries avec backoff (500ms → 2s → 8s) sur les codes retryables. Effort ~M (½ j).

- [ ] **Prompt caching côté agent orchestrator** — supprimé 2026-04-23 pour garantir sync, mais `context.ts` rebuild ~6-10k tokens à chaque appel (cf. CLAUDE.md). Réimplémenter via Gemini `cache_control={"type":"ephemeral", "ttl_seconds": 3600}` sur le system prompt + portion stable du contexte. Gain : ~30-40% sur LLM agent ≈ -€0.05-0.06/chantier/mois. *Recouvre P5 backlog archi agent IA*. Effort ~M (1 j).

- [ ] **Audit RLS systématique (152 policies)** — la migration `20260401400000_optimize_rls_indexes` a wrappé `(select auth.uid())` partiellement. Reste : `chantier_conversations`, `agent_pending_decisions` et autres avec EXISTS subqueries non corrélées → potentiel 100x slowdown sur 1M rows. Action : grep `IN (SELECT` dans toutes les policies + tester perf sur 10k rows + wrapper systématique. Effort ~H (1-2 j).

- [ ] **`payment_events_v` — vue UNION 3 branches sur JSONB** — `cashflow_terms` JSONB sans index, CROSS JOIN LATERAL + UNION ALL = O(N²) à O(N³). Risque timeout sur admin KPIs à 1M+ events. Refacto : table matérialisée incrémentale (refresh sur trigger) ou MATERIALIZED VIEW avec refresh cron 15min. Fichier : migration `20260428230000_drop_payment_events_legacy.sql:34-115`. Effort ~M (½-1 j).

- [ ] **Partitionnement temporel `agent_insights` / `agent_scheduled_actions`** — tables à croissance explosive (10-100k rows/jour à terme). Sans range partitioning par mois, WAL + VACUUM vont paralyser à 10M rows. Ajouter partitioning + politique d'archivage (insights > 90 j → cold storage). Effort ~M (½-1 j).

- [ ] **Fan-out cron evening — throttle + backoff** — `agent-orchestrator` MAX_FAN_OUT=200 hardcoded sans throttling Google Gemini (1k req/min cap). 200 invocations parallèles + 8 tool_rounds = pic 1600 req/min. Fix : queue + adaptive throttle si 429 détecté. *Recouvre P4 backlog archi agent IA*. Effort ~M (1 j).

- [ ] **Réduire 118 `as any` sans justification** — concentrés dans `conclusion.ts`, `budget.ts`, `BudgetTab.tsx`, `analyze-quote/index.ts`. Cherche : `grep -rn "as any" src/ | wc -l` = 118. Action : typage strict ou `// @ts-expect-error` justifié. Effort 2 j.

- [ ] **SendGrid 5/contact/24h cap non tracké** — CLAUDE.md mentionne le cap mais aucune table de comptage. 6e email = silently dropped, no user-facing error. Fix : table `email_rate_limits(contact_id, sent_at)` + check avant POST. Effort ~L (2-3h).

### P2 — Polish observabilité + qualité

- [ ] **Logger centralisé (268 console.log/error/warn non filtrés)** — risque fuite données sensibles en prod (CLAUDE.md règle "fuites de secrets"). Fix : `lib/logger.ts` avec `isDev ? console.log : noop`, et masquage automatique des `Bearer\s+[a-zA-Z0-9_.-]+`. Effort 4h.

- [ ] **`/api/health` endpoint** — pas de moyen de monitorer la plateforme except customer complaints. Fix : route Astro qui check Supabase ping + Gemini API + Stripe + whapi + SendGrid. Effort XS (15 min).

- [ ] **Code mort — `skipN8N`, `score_legacy`, hacks 2.5-flash** — `analyze-quote/index.ts:195` skipN8N jamais utilisé en prod ; `verdict-utils.ts:45,74,86` score_legacy duplique verdict_decisionnel ; prompt agent contient examples obsolètes (`register_avenant`). Effort 8h cumulé.

- [ ] **`lot_dependencies` batch delete/insert** — API planning fait `for (lotId, depIds)` → 1 SELECT + 1 DELETE + 1 INSERT par lot. Acceptable < 100 lots mais pas atomique. Fix : `DELETE ... IN (...)` + `INSERT ... VALUES (...)`. Fichier `src/pages/api/chantier/[id]/planning.ts:195-227`. Effort ~S (1h).

- [ ] **MATERIALIZED VIEWS pour `admin_kpis_*`** — 8+ vues temps-réel non matérialisées (daily_evolution, retention_weekly, documents safe_json) avec CTE complexes sur tables volumineuses. Cron `REFRESH MATERIALIZED VIEW` 15 min → gain ~100x sur dashboards admin. Fichier : `20260227200000_optimize_rls_views_constraints.sql:58-175`. Effort ~M (½ j).

- [ ] **Logs trop verbeux (1 MB/min en batch evening)** — 60+ console.log dans `analyze-quote` + agent-orchestrator log raw_body 2k chars sliced. Couper 80% des logs verbeux, garder WARN/ERROR + opt-in DEBUG. Effort 4h.

- [ ] **Stripe webhook CORS restreint** — `*` aujourd'hui (vercel.json header global). Restreindre à signature-only en prod (déjà signé mais belt-and-suspenders). Effort ~S (1h).

- [ ] **Hook CI types Supabase drift** — `src/integrations/supabase/types.ts` à jour aujourd'hui (2026-05-09) mais pas de garde-fou si une migration ajoute une colonne et types.ts n'est pas régénéré. Fix : GitHub Action qui run `supabase gen types` + diff fail si change. Effort ~S (1h).

### P3 — Nice to have

- [ ] **Correlation IDs end-to-end** — aucun trace ID partagé entre agent-orchestrator + tools + APIs. Debug en prod = matching manuel sur chantier_id + timestamp. Fix : injecter UUID au start de chaque run + propager via `X-Correlation-ID` sur tous les fetch. Effort ~M (½ j).

- [ ] **Tools dispatcher — runtime monitoring "Unknown tool"** — collisions noms checkées au boot ✅ mais hallucinations Gemini runtime → "Unknown tool" silencieux. Ajouter `console.error("[tools] ${chantierId} unknown: ${toolName}")` line 85 de `tools/index.ts`. Effort 30 min.

- [ ] **RLS `chantier_whatsapp_messages` optimisation** — triple subquery (chantier_id → groups → user_id). Index sur `group_id` créé récemment mais pattern reste lourd. Évaluer denormalization de `user_id` sur la table messages directement. Effort ~M (½ j).

### Quick wins isolables (< 4h, sans risque régression)

1. **`/api/health` endpoint** (15 min) — visibilité ops, pas d'effet de bord
2. **Logger centralisé** (4h) — supprime risque fuite secrets en logs
3. **DOMPurify sur dangerouslySetInnerHTML** (4h) — élimine 5 vecteurs XSS potentiels
4. **Sentry init basique** (1h sur edge fns + 30min sur API routes) — capture les silent fails immédiatement
5. **Webhook UPSERT idempotence** (2h) — évite double WhatsApp / double facturation
6. **Stripe CORS restreint** (1h) — durcissement low-effort

### Coûts marginaux estimés

| Composant | Par chantier actif / mois |
|---|---|
| Gemini extraction (1-2 devis) | €0.06-0.16 |
| Gemini agent (2-3 runs/jour) | €0.18-0.45 |
| Supabase (DB + edge fn marginal) | €0.05-0.10 |
| Vercel functions (Hobby = 0, Pro = ~€0.05) | €0-0.05 |
| WhatsApp (whapi, ~20-30 msg) | €0.40-1.20 |
| SendGrid + Google Places | €0-0.05 |
| **Total variable** | **€0.65-1.65** |
| **Fixe (Supabase Pro + Vercel Pro)** | **~€25-50/mois total** |

**Gains potentiels du prompt caching agent** : -30 à -40% sur LLM agent ≈ **-€0.05-0.06/chantier/mois** + meilleure latence.

**Plafonds identifiés** :
- Gemini free tier 1k req/min → ~100+ chantiers en batch evening = saturation
- Supabase edge function 60s timeout → extraction PDF >50 pages risquée
- Supabase free tier 5k queries/sec → fan-out 200 chantiers × 8 queries context = 1600 req/min spike OK mais sans marge

**Recommandation** : avant 30 chantiers, attaquer P0 (Sentry + idempotence + timeouts). Avant 50 chantiers, P1 (caching + RLS audit + payment_events_v + retry backoff). P2/P3 = polish à mesure que la base grossit.

---

## Comment ce fichier fonctionne

- **Quand on ajoute un item** : description courte + fichier:ligne quand pertinent + effort estimé si on l'a.
- **Quand on attaque un item** : retirer d'ici, créer une entrée `🟡 En cours` dans `WIP.md`.
- **Quand on finit un item** : retirer du WIP, ajouter à `FEATURES.md` si user-facing.
- **Quand on bloque** : reste dans WIP.md avec `🔴` et la raison ; ne pas remettre dans TODO.md.
