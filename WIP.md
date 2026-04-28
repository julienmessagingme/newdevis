# WIP — Features en cours, à finir, à valider

Document vivant — état réel des chantiers en cours sur GérerMonChantier. Différent de `FEATURES.md` qui décrit ce qui MARCHE en prod. Ici on liste ce qui est commencé sans être complètement fini, les idées en discussion, les dettes techniques, et les choses à valider après le prochain déploiement.

**Légende** :
- 🟢 Quasi prêt — manque test ou polish
- 🟡 En route — moitié fait, sait ce qui manque
- 🟠 En réflexion — décidé mais pas commencé
- 🔴 Bloqué / à arbitrer
- ✅ Fait → à archiver à la prochaine revue

---

## 1. Intégration OpenClaw (mode agent alternatif)

🟡 **Partiellement implémentée — utilisable mais incomplète.**

### Ce qui marche
- UI Settings (`Settings.tsx`) : choix du mode `edge_function` / `openclaw` / `disabled`, formulaire URL + token + agent_id
- API `/api/chantier/agent-config` GET/PUT pour persister la config
- Helper `triggerAgentIfOpenClaw(event)` dans `apiHelpers.ts` qui forward un event à l'instance OpenClaw du user

### Ce qui manque
- **Le chat user → OpenClaw n'est pas branché.** Quand l'utilisateur tape dans le chat de l'onglet Assistant, on appelle toujours `edge_function` (= notre Gemini). Si mode = openclaw, ses messages devraient être routés vers son instance OpenClaw, pas vers nous. Aujourd'hui le toggle openclaw ne change quasi rien côté chat.
- Triggers actifs uniquement sur :
  - Webhook WhatsApp entrant (`webhooks/whapi.ts`)
  - Webhook email entrant (`webhooks/inbound-email.ts`)
- Triggers manquants pour mode openclaw :
  - Upload de document
  - Affectation de lot à un document
  - Cron quotidien 19h (digest)
  - Création de chantier
- **Pas de feedback côté UI** : l'utilisateur ne sait pas si l'instance OpenClaw a bien reçu l'event ni si elle a répondu.
- Pas de page de doc pour expliquer comment configurer son instance OpenClaw (URL exposée publiquement, format event attendu, etc.)

### Décisions à prendre
- Quand mode = openclaw : on désactive complètement le chat edge_function, ou on offre les 2 (chat user → notre IA, événements → OpenClaw) ?
- Format événement standard à exposer (schéma JSON publique) ?

---

## 2. Suivi des décisions IA — fil d'activité

🟢 **Live mais à monitorer.**

### Ce qui marche (deployé 2026-04-25)
- Onglet Assistant en 2 colonnes (chat à gauche, fil d'activité à droite)
- Reset à minuit Paris
- Mélange tool_calls + agent_insights, tri chrono desc
- Auto-refresh toutes les 20s
- Daily digest 19h annexe maintenant 3 sections déterministes au journal (décisions / alertes / clarifications)

### À valider après usage réel
- L'affichage des libellés decisions (ex: "Lot décalé +5j (cascade)") couvre-t-il bien tous les cas d'usage ? Ajouter des branches dans `formatDecision()` au fur et à mesure des feedbacks.
- Le reset à minuit Paris utilise une approximation UTC+2 (DST). En hiver ça décale d'1h. Acceptable pour l'instant — à corriger si les utilisateurs voient apparaître des items "d'hier" entre minuit et 1h du matin.
- Auto-refresh 20s : peut-être trop fréquent si la page est en arrière-plan. Couper si `document.hidden` ?

---

## 3. Catégorie "frais" — déclaration sans pièce jointe

🟢 **Live, à finir d'instrumenter.**

### Ce qui marche (deployé 2026-04-23)
- Tool agent `register_expense` avec dialogue "pour quel lot ?"
- Création / réutilisation auto d'un lot "Divers" si l'utilisateur n'a pas de lot précis
- Affichage dans Budget/Trésorerie (badge ambre "📝 X€ frais"), dans LotDetail (section dédiée), dans IntervenantsListView, dans DocumentsView (catégorie "Frais déclarés")
- API `/api/chantier/[id]/documents/depense-rapide` accepte auth agent
- Type `DepenseType` étendu, migration DB CHECK constraint en place
- `noDevis` ignore les frais (plus d'alerte "Devis manquant" sur frais isolés)

### Ce qui manque / améliorations
- **Bouton manuel "Déclarer un frais" depuis l'UI** (pas seulement via chat). Aujourd'hui un user qui n'utilise pas le chat ne peut pas en créer. Ajouter dans `DepenseRapideModal` une option "frais" et un raccourci dans l'onglet Budget.
- Pas de moyen de joindre une preuve a posteriori à un frais (transformer un frais en ticket_caisse une fois la pièce uploadée).
- Pas de section "Frais annexes" dans le tableau Budget agrégé du chantier (visible seulement par lot).

### ✅ Cohérence des 3 voies de saisie de dépense (résolu 2026-04-28)

Refactor en 5 PRs (PR1→PR5) — voir [`CASHFLOW-REFACTOR.md`](CASHFLOW-REFACTOR.md). Architecture finale :
- `documents_chantier.cashflow_terms` JSONB = source des versements de devis/facture
- `cashflow_extras` table = mouvements purs sans pièce (déblocage crédit, apport)
- VIEW `payment_events_v` = consommée par Échéancier/Trésorerie/Budget
- Table `payment_events` legacy supprimée

Plus de désync possible architecture-level. Frais visibles dans Échéancier (gain de feature). Statuts dérivés d'une seule règle.

À déplacer vers `FEATURES.md` après stabilisation des tests E2E.

---

## 4. Planning CPM — points restants

🟡 **Modèle solide mais features encore en route.**

Hérité de la session précédente (cf. CLAUDE.md "TODO — prochaine session") :

1. `chantier-qualifier` edge function : ajouter une question "date de démarrage souhaitée" lors de la création.
2. `LotIntervenantCard.tsx` : afficher "S3–S5 · 2 semaines" (semaine de début → semaine de fin) sur les cartes lot.
3. `LotDetail.tsx` : section Planning éditable inline (durée + recompute cascade visible).
4. `DashboardHome.tsx` : intégrer le `PlanningWidget` mini-Gantt entre la barre de progression et les recos IA.

### À valider en prod
- `arrange_lot` (chain_after / parallel_with) écrit maintenant dans `lot_dependencies` (au lieu de `ordre_planning` legacy). Vérifier en prod que la lane visuelle suit bien (corrigé 2026-04-23).
- D&D persiste `delai_avant_jours` correctement (corrigé 2026-04-23). Re-tester drag de Carreleur.

---

## 5. Cron timeout — fan-out pattern

🟠 **Décidé, pas commencé.**

Le cron quotidien `agent-orchestrator-evening-digest` traite les chantiers actifs en batches de 3. Au-delà de ~10 chantiers actifs, on risque le timeout edge function 60s.

**Solution** : edge function "dispatcher" qui fire N appels indépendants à l'edge function `agent-orchestrator` (1 par chantier). Pas bloquant — juste à anticiper avant que la base utilisateur grossisse.

---

## 6. Migration `useInsights` legacy → `agent_insights`

🟠 **Dette technique, pas urgent.**

6 composants utilisent encore `cockpit/useInsights.ts` (ancien système Gemini MOE — appel éphémère sans persistance) :
- `BudgetTresorerie.tsx`
- `AnalyseDevisSection.tsx`
- `LotCard.tsx`
- `LotIntervenantCard.tsx`
- `BudgetKpiCard.tsx`
- `dashboardHelpers.ts`

À terme : remplacer par lecture des `agent_insights` persistants (mêmes données mais cachées + traçables). Pas urgent — ça marche aujourd'hui.

---

## 7. Type debt — `assistant.ts` DevisInfo

🟡 **Quick fix.**

L'interface `DevisInfo` dans `api/chantier/assistant.ts` ne déclare pas `lot_id` / `lot_nom` alors que ces champs sont injectés runtime via spread. La détection mismatch fonctionne mais le type TS ment. Fix : ajouter ces champs à l'interface (5 minutes).

---

## 8. WhatsApp multi-groupes — feature complète mais peu testée prod

🟢 **Live, à valider en conditions réelles.**

Toute la chaîne marche en théorie :
- Création groupe via API whapi (`/api/chantier/[id]/whatsapp`)
- Stockage `chantier_whatsapp_groups` + `chantier_whatsapp_members`
- Webhook `whapi.ts` reçoit messages + events (join/leave)
- UI `WhatsAppGroupsPanel` + `WhatsAppThread` avec bulles colorées par rôle

Scénario prod à valider end-to-end : créer un groupe → vérifier que les membres apparaissent → recevoir un message → confirmer que les bulles s'affichent avec les bons rôles → tester le filtre par groupe.

---

## 9. Vue mobile — passes restantes

🟠 **Backlog mobile P0 cockpit (cf. CLAUDE.md "Status des P0 mobile cockpit").**

Closed : BudgetTab table, BudgetKpiDashboard, ArtisanDrawer, MessagerieSection, ActionBar, AddDocumentModal.

À faire :
- `PlanningTimeline` (#12) — gros chantier mobile, le Gantt est galère sur petit écran
- `ContactsSection`, `DocumentsView` (#16)
- Touch targets chevrons (#17)
- `Button size=icon` à passer à 44px min (#18)

---

## 10. Cohérence Budget initial (estimation IA) ↔ Budget/Trésorerie (suivi réel)

🟠 **UX à repenser — fracture entre les 2 phases du chantier.**

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

### À décider
- Faut-il créer un champ `budget_real_locked` distinct de `budget_ia` ?
- Le passage Phase 1 → Phase 2 est-il automatique (heuristique sur nb devis validés) ou manuel (CTA user) ?
- Faut-il garder l'estimation IA visible en permanence comme "rétroviseur" ou la masquer après bascule ?

---

## 11. Idées en réflexion (pas codées)

### 🟠 "Joindre une preuve a posteriori"
Quand un frais est déclaré au chat, l'utilisateur reçoit le ticket plusieurs jours après. Pouvoir uploader le ticket et "promouvoir" le frais en `ticket_caisse` rattaché au document. Évite la double saisie.

### 🟠 Notification push proactive
Aujourd'hui les insights critical apparaissent dans le fil d'activité + WhatsApp digest. Pour des alertes vraiment urgentes (paiement à faire dans 24h, retard critique chantier), envisager push browser ou email immédiat.

### 🟠 Rapport PDF chantier
À la fin du chantier, générer un PDF récap : timeline, lots, devis, factures, photos, total dépensé vs budget initial. Genre "livret de fin de chantier" remis au propriétaire.

### 🟠 Mode "invité collaborateur"
Inviter un conjoint / un proche à voir le chantier sans pouvoir tout modifier. Lecture + commentaires uniquement.

### 🟠 Recommandation artisan
Quand un lot a 0 devis depuis X jours, proposer une short-list d'artisans RGE / proches géographiquement / bien notés Google.

---

## 12. Architecture agent IA — évolution

🟡 **En cours d'implémentation** (session 2026-04-26).

Diagnostic post-revue : l'archi actuelle (1 edge function Deno + Gemini function calling + boucle 3 rounds + history 20 msgs) est solide pour aujourd'hui mais va plafonner sur 3 axes : workflows multi-tour pendants, croissance du nombre de tools (17 → 25+), croissance du nombre de chantiers actifs.

**Pas de rewrite**, évolution incrémentale.

### 🔴 P1 — `agent_pending_decisions` table + tool `notify_owner_for_decision`
**Pourquoi maintenant** : sans store explicite, la feature "décision à prendre" (artisan demande +800€ → agent demande au user → user répond 4h plus tard) sera fragile. La conversation history (20 msgs) ne suffit pas comme mémoire.
**Quoi** : table `agent_pending_decisions(id, chantier_id, source_event, question, expected_action_payload jsonb, expires_at, status pending|resolved|expired|cancelled)` + tool `notify_owner_for_decision(question, action_payload, expires_in_hours)` qui crée la ligne + envoie WhatsApp privé. Quand le user répond OUI/NON dans le canal privé, l'orchestrator récupère la pending non-expirée la plus récente et exécute.

### 🟡 P2 — Modularisation `tools.ts`
**Pourquoi maintenant** : avec 25+ tools à venir, le switch/case dans 1 fichier de 842 lignes devient ingérable.
**Quoi** : split par domaine
```
supabase/functions/agent-orchestrator/tools/
  index.ts         ← dispatcher + ACTION_TOOLS guard
  read.ts          ← get_chantier_summary, get_chantier_data, etc.
  planning.ts      ← update_planning, shift_lot, arrange_lot
  documents.ts     ← move_document_to_lot, register_payment
  finance.ts       ← register_expense, add_payment_event
  comm.ts          ← send_whatsapp_message, send_email, notify_owner_for_decision
  scheduled.ts    ← schedule_reminder
  status.ts        ← update_lot_status, mark_lot_completed, update_devis_statut
  contacts.ts      ← update_contact
```
Chaque module exporte `{ schemas: [...], handlers: { name: handler } }`. L'index assemble.

### 🟢 P3 — `MAX_TOOL_ROUNDS = 8` + cap tokens cumulés
**Pourquoi** : un workflow type "Reçoit msg artisan → vérifie planning → propose au user → notif 2 autres artisans → update planning → add payment_event" = 5-7 tool_calls. Aujourd'hui MAX=3 → l'agent abandonne en plein milieu.
**Quoi** : passer à 8 rounds. Ajouter un cap `MAX_TOTAL_TOKENS_PER_RUN = 100000` pour couper net si emballement.

### 🟠 P4 — Fan-out cron evening
**Pourquoi** : aujourd'hui batch 3 séquentiels → > 30-50 chantiers actifs = timeout edge function 60s.
**Quoi** : edge function "dispatcher" qui fire N invocations indépendantes (1 par chantier) au lieu de boucler. Chaque invocation = 1 chantier, timeout indépendant.

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

### 🟠 P10 — Canaux proactifs alternatifs (Web Push / email)

⚠️ **À ne pas confondre avec la vague 3** qui livre le canal proactif principal **via WhatsApp privé** (groupe "Mon Chantier — X" avec uniquement le user dedans). P10 = canaux **alternatifs** pour les users qui ne veulent pas / ne peuvent pas WhatsApp.

Pistes :
- **Web Push API** (notif browser) : permission demandée au premier login, push depuis edge function via VAPID. Fonctionne même app fermée si browser ouvert.
- **Email transactionnel SendGrid** : digest quotidien ou notif immédiate sur les triggers critiques (alertes, clarifications urgentes).

Settings UI à enrichir : checkboxes par canal (WhatsApp / Web Push / Email) × par catégorie de trigger (clarifications / alertes critiques / rappels / etc.). Sinon spam.

Pas urgent : à activer si on identifie une cohorte significative de users sans WhatsApp.

---

## 13. Tools agent IA — vagues à implémenter

🟠 **Prêts à coder dès que P1+P2 livrés** (P1 nécessaire pour vague 3, P2 nécessaire pour ne pas exploser le monolithe).

### ✅ Vague 1 — LIVRÉE 2026-04-26

`register_payment` (matching A/B/C/D/E + match faible/fort), `update_devis_statut`, `move_document_to_lot`, `update_contact` (avec normalisation téléphone). Cf. `FEATURES.md § 14.B/C/D/E` pour le détail.

### ✅ Vague 2 — LIVRÉE 2026-04-26

`add_payment_event(label, amount, due_date)` (avec validation YYYY-MM-DD strict) et `send_email(contact_id, subject, body)` (rate-limit 5/contact/24h, sanitize CRLF subject, fallback userName via auth admin en mode agent). Cf. `FEATURES.md § 14.C` et `§ 14.G`.

### ✅ Vague 3 — LIVRÉE 2026-04-26

- **Canal WhatsApp privé owner** : flag `chantier_whatsapp_groups.is_owner_channel = true`, contrainte unique partial index. Tool `create_owner_whatsapp_channel`. Webhook whapi route les messages owner channel en mode `interactive` avec historique 20 derniers msgs restauré.
- **`schedule_reminder(due_at_local, tz, reminder_text, lot_id?)`** : table `agent_scheduled_actions` avec status `pending|firing|fired|cancelled|failed`. Cap 30 rappels pending par chantier. Format heure locale + tz côté agent — serveur convertit UTC via `Intl.DateTimeFormat` (gère DST).
- **`cancel_reminder(reminder_id)`** : annule un pending. L'agent voit la liste dans le contexte (limit 10 plus proches).
- **Edge function `agent-scheduled-tick`** : cron pg_cron toutes les 15min. Auth Bearer service_role OU X-Cron-Secret. RPC `claim_pending_reminders` avec FOR UPDATE SKIP LOCKED → atomic claim. Process parallèle batches 8.
- **Workflow décision à prendre** : tool `notify_owner_for_decision` (P1) + `resolve_pending_decision` (livrés round précédent). Section prompt "DÉTECTION DE DÉCISION À ARBITRER" et "DÉCISIONS EN ATTENTE".

### 🟠 Vague 3 reste à coder — UI activation canal owner

Bouton dans Settings (chantier) "Activer notifications WhatsApp IA" qui appelle `POST /api/chantier/[id]/whatsapp { is_owner_channel: true }`. Aujourd'hui c'est l'agent qui peut le créer via `create_owner_whatsapp_channel` à la demande user au chat. Mais idéal : exposer aussi le bouton UI pour les users qui ne passent pas par le chat. Petit dev, ~30 min.

### 🟠 Vague 3 — 8 triggers proactifs à câbler

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

## 14. Versements échelonnés + cohérence Budget

✅ **Livré 2026-04-28, à valider en prod.**

### Ce qui a été livré
- **`VersementsDrawer.tsx`** : drawer slide-right plein écran mobile / 400px desktop. Affiche les versements passés (payés) + les échéances en attente liées à un artisan. Créer / modifier (label + montant + date) / supprimer chaque versement.
- **Règle plafond** : la somme des versements ne peut pas dépasser le budget engagé (cap validé à la saisie).
- **Prompt justificatif** : après chaque création de versement, invite à joindre un justificatif.
- **API `payment-events.ts`** : PATCH supporte `due_date` + `label`. POST supporte `paid: true`. DELETE endpoint ajouté.
- **Prop chain `initialEnveloppePrevue`** : `DashboardUnified → TresoreriePanel → BudgetTab → BudgetKpiDashboard`. Valeur depuis `chantiers.enveloppe_prevue` (DB), plus d'auto-init localStorage.
- **`ticket_caisse` + `achat_materiaux` + `frais` = toujours Payé** : badge statique vert sans dropdown. Comptés en `paye` dans les totaux (plus de faux "à payer"). Plus d'alerte "Devis manquant" pour ces types.

### À valider
- Flux complet versements : créer → cashflow → modifier → supprimer → refresh immédiat.
- Cap plafond bloque bien un ajout dépassant le budget engagé.
- Un ticket de caisse n'apparaît plus dans le solde "à payer".

---

## 15. Fix analyse devis — géolocalisation ABF + prix marché

🟢 **Commité 2026-04-28 (commit `f9b39ff`), à déployer edge function.**

### Géolocalisation ABF (`verify.ts`)
`if (hasAddressData)` — tente la géolocalisation dès qu'on a `code_postal` OU `ville` OU `adresse_chantier` (avant : bloqué si `code_postal` null).

### Prix marché (`market-prices.ts`)
Fuzzy fallback normalisé (lowercase + trim + espaces→underscores) sur les identifiants Gemini avant de rejeter en "Autre".

### ⚠️ Déploiement requis
```bash
npx supabase login
npx supabase functions deploy analyze-quote --project-ref vhrhgsqxwvouswjaiczn
```
Sans ce déploiement, les fixes restent dans le code source mais pas en prod.

---

## 16. Score HubSpot — Tap Targets + JS Libraries

✅ **Livré 2026-04-28.**

Rapport HubSpot : Mobile 20/30 (FAIL Tap Targets) + Security 5/10 (FAIL Secure JS Libraries).

### Tap Targets corrigés
Tous les éléments interactifs sur la landing portés à ≥ 44px sur mobile :
- Cookie banner "Refuser"/"Accepter" : `h-9` → `h-11` mobile (`sm:h-9` desktop inchangé)
- Newsletter : bouton × `p-1` → `p-3`, submit `h-10` → `h-11`, "Non merci" + `py-3`
- Menu mobile Header : bouton "En savoir plus" + `py-3`, liens sous-menu + `py-3 block`, liens utilisateur `py-1.5` → `py-3`

### JS Libraries
`npm update` — toutes les dépendances montées dans leur plage semver (`@supabase/supabase-js` 2.90→2.105, `dompurify` 3.3→3.4, `jspdf` 4.0→4.2, etc.).

3 CVE restantes (astro XSS `define:vars`, `@astrojs/vercel` path override, `vite` esbuild) nécessitent des upgrades majeurs (astro 5→6, vercel adapter 9→10). **Non appliquées** : `define:vars` n'est pas utilisé dans le projet (XSS non exploitable), les deux autres sont server-side (non détectables par le scanner browser). À traiter quand Astro 6 sera stable et que la migration sera planifiée.

---

## 16. Dette technique — whapi read receipts & queries

🟡 **Backlog technique issu du code review** — pas bloquant, à traiter quand on retouche les zones concernées.

### `[whapi-read-receipts]`

- [ ] **Batcher les upserts statuts dans le webhook** — `src/pages/api/webhooks/whapi.ts`
  La boucle `for...of statuses` fait 1 SELECT + 1 UPSERT par status. Sur un groupe de 20+ membres lisant simultanément, whapi peut envoyer 50+ statuts en un seul batch → 100+ requêtes série. Fix : grouper par `message_id`, 1 `select().in()` pour les lookups chantier_id, puis `Promise.all` sur les upserts.

- [ ] **Logger `outgoingRes.error` explicitement** — `supabase/functions/agent-orchestrator/context.ts`
  Si la requête `whatsapp_outgoing_messages` plante (table absente, timeout), l'erreur est avalée silencieusement via `outgoingRes.data ?? []`. Ajouter un `console.error('[context] outgoing read receipts query failed:', outgoingRes.error.message)`.

- [ ] **Renommer `group_jid` → `chat_jid`** dans `whatsapp_outgoing_messages` — migration future
  Le digest du soir envoie en DM (`@s.whatsapp.net`), pas dans un groupe. La colonne s'appelle `group_jid` mais peut contenir un JID personnel. Créer une migration `ALTER TABLE whatsapp_outgoing_messages RENAME COLUMN group_jid TO chat_jid` et mettre à jour les refs dans `index.ts` et `context.ts`.

- [ ] **Batcher le lookup chantier_id dans le bloc statuts** — `src/pages/api/webhooks/whapi.ts`
  Le bloc statuts fait un SELECT par `message_id` distinct pour résoudre le `chantier_id`. Grouper les `message_id` uniques et faire un seul `select().in()` avant la boucle d'upsert.

---

## Comment maintenir ce document

- Quand on **commence** une feature → ajouter une section ici avec 🟡
- Quand on la **finit en prod** → soit on supprime la section (si stable), soit on la garde avec ✅ jusqu'à la prochaine revue puis on l'archive
- Quand on **change d'avis** ou on **bloque** → 🔴 + raison
- Réfléchir à passer en revue ce doc à chaque session de travail (au début ou à la fin)
- `FEATURES.md` ne décrit que ce qui est ⚙️ stable en prod. Tout le reste vit ici.
