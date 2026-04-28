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

### 🔴 Cohérence "frais agent IA" ↔ "+ dépense" UI Échéancier
🟡 À traiter — les deux entrées créent des objets différents et l'utilisateur perd le fil.
- Quand on dit à l'agent *"rajoute 500€ de frais chez Point P"* → `register_expense` crée un `documents_chantier` avec `depense_type='frais'`, document_type='facture', factureStatut='payee'. Visible dans Budget par lot, mais **pas** dans l'Échéancier (pas de `payment_event` créé).
- Quand on clique **"+ dépense"** dans l'onglet Échéancier (UI) → ça crée un `payment_event` libre avec `is_override=true`, sans documents_chantier. Visible dans cashflow et échéancier, mais **pas** dans la section "Frais annexes" du lot.
- Conséquences :
  - Un même achat saisi par les 2 voies apparaît à 2 endroits différents et compté 2x dans le budget global.
  - Si on saisit via agent → invisible dans l'Échéancier/cashflow.
  - Si on saisit via UI → invisible dans le lot.
- **À décider** : unifier sous un même flux. Options :
  - (A) `register_expense` crée AUSSI un `payment_event` lié au `documents_chantier.id` (source_type='document_chantier'). L'UI "+dépense" appelle la même mécanique. Une seule source de vérité.
  - (B) Distinguer explicitement "frais avec impact cashflow" vs "frais hors cashflow" et le proposer au user (mais double UX = mauvais).
- Recommandation pressentie : (A). Demande au user de valider l'approche avant code.

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

## 10. Idées en réflexion (pas codées)

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

## 11. Architecture agent IA — évolution

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

### 🟠 P5 et au-delà → voir [`TODO.md`](TODO.md)

POC Claude Sonnet 4.7 + prompt caching, multi-agents chaînés, frameworks (Vercel AI SDK / Mastra), state machine explicite. Toutes des évolutions à valider sur data, pas sur intuition.

---

## 12. Tools agent IA — vagues à implémenter

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

## 13. Versements échelonnés — VersementsDrawer

✅ **Livré 2026-04-28, à valider en prod.**

### Ce qui a été livré
- **`VersementsDrawer.tsx`** : drawer slide-right plein écran mobile / 400px desktop. Affiche les versements passés (payés) + les échéances en attente liées à un artisan (filtre `source_id in sourceIds || id in knownEventIds`). Permet créer / modifier (label + montant + date) / supprimer chaque versement.
- **Règle plafond** : la somme des versements ne peut pas dépasser le budget engagé de l'artisan (cap validé à la saisie avec message d'erreur inline).
- **Prompt justificatif** : après chaque création de versement, invite l'utilisateur à joindre un justificatif.
- **`BudgetBar`** : barre de progression colorée (vert ≤ 80%, orange ≤ 100%, rouge > 100%) avec sous-total visible.
- **API `payment-events.ts`** : PATCH supporte maintenant `due_date` et `label`. POST supporte `paid: true` (statut `paid` + date = aujourd'hui). DELETE endpoint ajouté.
- **Prop chain `initialEnveloppePrevue`** : `DashboardUnified → TresoreriePanel → BudgetTab → BudgetKpiDashboard`. La valeur vient de `chantiers.enveloppe_prevue` (DB), plus d'auto-init depuis `engageReel`. useEffect d'auto-init supprimé.

### À valider
- Tester le flux complet : créer un versement → vérifier affichage dans cashflow et échéancier → modifier → supprimer.
- Vérifier que le cap plafond bloque bien un ajout dépassant le budget engagé.
- Vérifier que la suppression supprime bien le `payment_event` et que le rafraîchissement est immédiat.

---

## 14. Fix analyse devis — géolocalisation ABF + prix marché

🟢 **Commité 2026-04-28 (commit `f9b39ff`), à déployer edge function.**

### Géolocalisation ABF (`verify.ts`)
- **Avant** : `if (codePostal)` bloquait tout le bloc géorisques / patrimoine / GPU quand Gemini n'isolait pas le code postal comme champ séparé.
- **Après** : `if (hasAddressData)` — tente la géolocalisation dès qu'on a `code_postal` OU `ville` OU `adresse_chantier`. La query est construite en concaténant les 3 (ce qui est dispo).

### Prix marché (`market-prices.ts`)
- **Avant** : validation stricte `validJobTypes.has(jtype)` — une variation de casse ou d'espace envoyait le groupe en "Autre".
- **Après** : fuzzy fallback normalisé (lowercase + trim + espaces→underscores) avant de rejeter. Log `[MarketPrices] Fuzzy match "X" → "Y"` pour debug.

### ⚠️ Déploiement requis
```bash
npx supabase login
npx supabase functions deploy analyze-quote --project-ref vhrhgsqxwvouswjaiczn
```
Sans ce déploiement, les fixes restent dans le code source mais pas en prod.

---

## Comment maintenir ce document

- Quand on **commence** une feature → ajouter une section ici avec 🟡
- Quand on la **finit en prod** → soit on supprime la section (si stable), soit on la garde avec ✅ jusqu'à la prochaine revue puis on l'archive
- Quand on **change d'avis** ou on **bloque** → 🔴 + raison
- Réfléchir à passer en revue ce doc à chaque session de travail (au début ou à la fin)
- `FEATURES.md` ne décrit que ce qui est ⚙️ stable en prod. Tout le reste vit ici.
