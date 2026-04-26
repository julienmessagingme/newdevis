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

### Vague 1 — Tools réactifs (court terme, après P1+P2)

#### `register_payment(artisan_or_lot_hint, amount_paid, date_paid?)`
*(Anciennement appelé `update_facture_statut` — renommé pour clarifier que c'est un enregistrement de paiement, pas une mutation directe.)*

**Logique 100% côté serveur**, l'agent transmet juste les params :

| Cas | Détection serveur | Action |
|---|---|---|
| **A. Match parfait** | 1 facture statut `recue`, montant restant ≈ `amount_paid` (±5€) | UPDATE `payee` + `montant_paye`. Return ok. |
| **B. Match partiel** | 1 facture, montant restant > `amount_paid` | UPDATE `payee_partiellement` + `montant_paye+=`. Return ok + reste à payer. |
| **C. Aucune facture** | 0 facture pour cet artisan | Return `{ ok: false, reason: "no_facture", message: "Aucune facture en attente. Tu veux que j'enregistre comme frais ?" }` |
| **D. Ambigu** | N factures candidates (>1) | Return `{ ok: false, reason: "ambiguous", candidates: [...] }`. Agent re-demande. |
| **E. Trop-perçu** | Montant > restant | Return `{ ok: false, reason: "amount_exceeds" }`. Agent demande confirmation. |

**Désaffectation** : non. Mono-directionnel (recue → payee, pas l'inverse). Erreur = correction manuelle UI.

#### `update_devis_statut(devis_id, statut)`
Statuts : `en_cours | a_relancer | valide | attente_facture`. Simple PATCH.

#### `move_document_to_lot(doc_id, lot_id)`
Suite à `request_clarification` "je pense que cette photo est mal affectée". User confirme → bouge en DB. Aujourd'hui le user doit drag-and-drop manuellement dans Documents.

#### `update_contact(contact_id, telephone?, email?, role?, notes?)`
"Jean a changé de numéro" / "ajoute un mail à Marc". Pas d'`add_contact` — les contacts arrivent via VerifierMonDevis ou ajout manuel UI uniquement.

### Vague 2 — Élargir le scope (après vague 1)

#### `add_payment_event(type, label, amount, due_date, lot_id?)`
*"Le crédit débloque 30k le 15 mai"* / *"Le plombier demande 30% à la commande"*. Alimente directement l'Échéancier (sinon vide tant que user ne saisit pas à la main). Énorme valeur tréso.

#### `send_email(to, subject, body, conversation_id?)`
Beaucoup d'artisans ne sont qu'en email. Pipeline SendGrid déjà en place, manque juste le tool.

### Vague 3 — Pro-actif (dépend P1 + canal WhatsApp privé)

#### Canal WhatsApp privé user ↔ agent
- À la création du chantier (ou via Settings) : créer groupe WhatsApp **avec UNIQUEMENT le user** (numéro pris de son profile). Nom : *"📋 Mon Chantier — [Nom]"*.
- Stocker `chantier_whatsapp_groups.is_owner_channel = true` (nouvelle colonne)
- Toutes les notifs proactives partent là.
- Webhook entrant : reconnaît ce JID → route vers orchestrator avec contexte "private channel" → l'agent sait que c'est une réponse privée du owner.

#### `schedule_reminder(due_at, reminder_text, lot_id?)`
- Agent calcule `due_at` depuis le langage naturel ("dans 3 jours" / "vendredi" → ISO datetime). Si flou → demande "c'est pour quand ?".
- Stockage : nouvelle table `agent_scheduled_actions(id, chantier_id, due_at, action_type, payload jsonb, status pending|fired|cancelled, created_at)`
- Cron : edge function `agent-scheduled-tick` toutes les **15min** → fetch `pending WHERE due_at <= now() LIMIT 50` → fire WhatsApp dans canal privé → status='fired'

#### Workflow "Décision à prendre" (utilise P1)
Pas un tool dédié, c'est un comportement orchestrator activé par :
1. Section "DÉTECTION DE DÉCISION" dans `prompt.ts` : *"Quand un message externe propose un changement (montant, date, ajout/retrait), tu DOIS notifier le owner via canal privé via `notify_owner_for_decision` et NE PAS répondre à l'artisan tant que le owner n'a pas validé."*
2. Tool `notify_owner_for_decision` (P1) : crée pending decision + envoie WhatsApp + set expected_action.
3. Quand owner répond, orchestrator résout la décision pending.

#### 8 triggers proactifs WhatsApp privé
1. Clarification urgente (`request_clarification`)
2. Alerte critique (`severity=critical`)
3. Paiement en retard
4. Lot bloqué sans devis depuis 14j
5. Rappel programmé (`schedule_reminder`)
6. Déblocage attendu non reçu
7. Action automatique prise (debrief)
8. Décision à prendre (P1)

UI Settings : checkboxes par catégorie pour activer/désactiver. Sinon spam.

---

## Comment maintenir ce document

- Quand on **commence** une feature → ajouter une section ici avec 🟡
- Quand on la **finit en prod** → soit on supprime la section (si stable), soit on la garde avec ✅ jusqu'à la prochaine revue puis on l'archive
- Quand on **change d'avis** ou on **bloque** → 🔴 + raison
- Réfléchir à passer en revue ce doc à chaque session de travail (au début ou à la fin)
- `FEATURES.md` ne décrit que ce qui est ⚙️ stable en prod. Tout le reste vit ici.
