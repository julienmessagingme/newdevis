# Plan de test fonctionnel — Agent IA GérerMonChantier

Scénarios end-to-end pour valider l'agent IA avec **3 numéros WhatsApp réels** :

| Rôle | Numéro | Description |
|---|---|---|
| **GMC** | `+33 6 33 92 15 77` (33633921577) | Numéro contrôlé par notre instance whapi.cloud. C'est l'agent qui parle. |
| **USER** (toi, Julien) | _ton numéro perso_ | Le propriétaire du chantier. Reçoit les notifs proactives, répond, donne des instructions. |
| **ARTISAN** (un autre numéro WhatsApp à toi ou à Johan) | _numéro test_ | Joue le rôle d'un artisan (plombier, maçon, etc.) qui envoie des messages dans un groupe chantier. |

> **Avant de commencer** : le numéro USER doit être inscrit comme téléphone dans le profil du compte de test (Paramètres → Coordonnées). Sinon `create_owner_whatsapp_channel` échouera avec "Téléphone client manquant".

> **Pour observer ce qui se passe** :
> - Onglet **Assistant chantier** → panneau droit "Activité IA" pour voir tool_calls + insights en temps réel
> - Onglet **Journal de chantier** pour voir le digest du soir
> - SQL `SELECT * FROM agent_runs WHERE chantier_id = '...' ORDER BY created_at DESC LIMIT 10` pour voir les runs LLM bruts

---

## Setup initial (à faire UNE fois avant tous les tests)

### Étape 1 — Créer un chantier de test
1. Login en tant que USER
2. `/mon-chantier/nouveau` → mode "Flexible" → description : *"rénovation cuisine 12m² avec changement plomberie et électricité, tout refaire en standard, code postal 75011, démarrage dans 1 mois, budget 20k€"*
3. Répondre aux questions de qualification
4. Attendre la génération (5 lots créés : Démolition, Plombier, Électricien, Plaquiste, Carreleur)

### Étape 2 — Créer 2 contacts artisans
Onglet **Contacts** → + Ajouter contact :
- Nom : `Plombier Test` · Tél : _le numéro ARTISAN_ · Rôle : `Plombier` · Lot : `Plombier`
- (Optionnel : un 2e contact `Électricien Test` avec un autre numéro si tu en as un)

### Étape 3 — Créer le canal WhatsApp privé owner (canal IA)
**Option A** — via UI (à venir, pas encore livré) : bouton "Activer notifications WhatsApp IA" dans Paramètres

**Option B** — via le chat Assistant :
- Dire à l'agent : *"crée mon canal WhatsApp privé"*
- L'agent appelle `create_owner_whatsapp_channel` → tu reçois une invitation WhatsApp pour rejoindre le groupe **"📋 Mon Chantier (canal IA)"** avec uniquement toi + GMC dedans
- Vérifier : `SELECT group_jid FROM chantier_whatsapp_groups WHERE chantier_id = '...' AND is_owner_channel = true`

### Étape 4 — Créer un groupe WhatsApp avec l'artisan
Onglet **Messagerie** → onglet WhatsApp → + Créer groupe → sélectionner Plombier Test → confirme.
Tu reçois (toi + Plombier Test) une invitation pour rejoindre **"Plombier Test - [Nom Chantier]"**. Le numéro GMC est aussi dans le groupe.

---

## ✅ Scénario 1 — Détection de décision à arbitrer (cas flagship)

**Pain testé** : un artisan annonce un surcoût en cours de chantier. L'agent doit notifier le user, attendre validation, exécuter.

### Étape 1 — L'artisan envoie un surcoût
**Depuis le numéro ARTISAN**, dans le groupe WhatsApp **Plombier Test** :
> "Bonjour, finalement il faut +800€ pour la pompe de relevage qui n'était pas dans le devis initial. Vous validez ?"

### Étape 2 — Vérifier que l'agent réagit (~30s à 2min)
**Logs à checker** :
- `SELECT * FROM agent_runs WHERE chantier_id = '...' ORDER BY created_at DESC LIMIT 1` → doit montrer un run récent en mode `morning` avec un tool_call `notify_owner_for_decision`
- `SELECT * FROM agent_pending_decisions WHERE chantier_id = '...' AND status = 'pending' ORDER BY created_at DESC` → doit avoir une nouvelle ligne avec :
  - `question` : *"Le plombier annonce +800€ (pompe de relevage). Tu valides ?"* (ou variante)
  - `expected_action` : `{ "tool": "register_expense", "args": { "amount": 800, "label": "...", "lot_name": "Plombier" } }` (ou similaire)

### Étape 3 — USER reçoit la notif WhatsApp
**Depuis ton numéro USER**, dans le canal privé **📋 Mon Chantier (canal IA)** : un message arrive de GMC avec la question.

### Étape 4 — USER répond OUI
**Depuis USER**, dans le canal privé : tape *"oui ok"*.

**Vérifier** (~30s) :
- `SELECT * FROM agent_pending_decisions WHERE id = '...'` → `status` doit être passé à `resolved`, `resolved_answer = 'oui ok'`
- `SELECT * FROM documents_chantier WHERE chantier_id = '...' AND depense_type = 'frais' ORDER BY created_at DESC LIMIT 1` → doit avoir une nouvelle entrée frais 800€ rattachée au lot Plombier
- Dans l'app, onglet **Budget & Trésorerie** → ligne "Frais 800€" visible sur le lot Plombier

### Étape 5 — Test inverse : USER répond NON
Refais l'étape 1 (artisan envoie un autre surcoût *"+200€ pour un raccord"*).
À l'étape 4, depuis USER tape *"non, on annule"*.

**Vérifier** :
- Pending status passe à `cancelled`, pas de frais créé

### Étape 6 — Test pré-check négatif
À l'étape 4, depuis USER tape *"ok mais en fait non"*. **Doit être détecté comme négatif** (pré-check sur les mots de refus).

---

## ✅ Scénario 2 — Rappel programmé proactif

**Pain testé** : le user veut être rappelé d'une chose précise à une date donnée, sans devoir y penser.

### Étape 1 — Programmer le rappel
**Depuis l'onglet Assistant chantier** (chat web), tape :
> "rappelle-moi dans 5 minutes de tester le plombier"

### Étape 2 — Vérifier la création
- `SELECT * FROM agent_scheduled_actions WHERE source = 'tool:schedule_reminder' ORDER BY created_at DESC LIMIT 1` → doit montrer :
  - `due_at` ≈ now() + 5 minutes (UTC)
  - `payload.text` contient "tester le plombier"
  - `status = 'pending'`

### Étape 3 — Attendre 15 minutes max
Le cron `agent-scheduled-tick` tourne toutes les 15min. Donc ton rappel à 5 minutes partira au prochain tick (entre maintenant et +15min).

### Étape 4 — USER reçoit la notif WhatsApp
Tu dois recevoir dans le canal privé **📋 Mon Chantier (canal IA)** :
> "⏰ Rappel : tester le plombier"

**Vérifier en DB** : `SELECT status, fired_at, fired_result FROM agent_scheduled_actions WHERE id = '...'` → `status = 'fired'`, `fired_result = {"ok": true}`.

### Étape 5 — Tester l'annulation
**Depuis chat Assistant**, programme un rappel à +10min, puis dans la conversation tape :
> "annule mon rappel pour le plombier"

L'agent doit appeler `cancel_reminder(reminder_id)` → status passe à `cancelled`. Pas de WhatsApp envoyé au tick suivant.

### Étape 6 — Tester sans canal owner configuré
Si tu testes sur un chantier SANS canal owner privé activé : `schedule_reminder` doit refuser immédiatement avec :
> *"Pas de canal WhatsApp privé configuré. Sans ce canal, le rappel ne pourrait pas partir. Propose au user d'appeler create_owner_whatsapp_channel d'abord."*

---

## ✅ Scénario 3 — Mismatch document détecté + clarification

**Pain testé** : l'agent détecte qu'une photo / document semble mal classé.

### Étape 1 — ARTISAN envoie une photo dans le mauvais groupe
Si tu as 2 lots Plombier ET Électricien avec leurs groupes : depuis ARTISAN, envoie une **photo de prise électrique** dans le groupe **Plombier Test**.

### Étape 2 — Pipeline auto
- La photo est sauvegardée dans `documents_chantier` rattachée au lot Plombier
- L'edge function `describe` (Gemini Vision) décrit "prise électrique murale"
- L'agent orchestrator détecte le **mismatch** : description "électrique" vs lot "Plombier"
- Crée un insight `needs_clarification` + appelle `request_clarification`

### Étape 3 — Vérifier
- `SELECT * FROM agent_insights WHERE type = 'needs_clarification' ORDER BY created_at DESC LIMIT 1` → titre du genre "Photo mal affectée ? Plombier vs Électricien"
- Visible dans le panneau **Activité IA** côté UI

### Étape 4 — USER confirme la correction via chat
Dans Assistant chat :
> "oui c'était bien pour Électricien, déplace-la"

L'agent appelle `move_document_to_lot(doc_id, lot_id_electricien)` → la photo bouge en DB. Visible dans LotDetail Électricien.

---

## ✅ Scénario 4 — Frais déclaré au chat

**Pain testé** : le user fait un achat libre chez Leroy Merlin et veut le tracker.

### Étape 1 — Déclarer
Dans Assistant chat :
> "j'ai claqué 200€ chez Leroy Merlin pour de l'élec"

### Étape 2 — L'agent matche le lot
L'agent appelle `register_expense(amount=200, label="...", lot_name="Électricien", vendor="Leroy Merlin", depense_type="frais")`.

**Vérifier** :
- Frais visible dans **Budget & Trésorerie** sur le lot Électricien (badge ambre 📝 "200€ frais")
- Visible dans **LotDetail Électricien** → section "Frais annexes déclarés"

### Étape 3 — Test sans lot précisé
Tape juste : *"j'ai dépensé 50€"*.
L'agent doit demander en TEXTE : *"Pour quel lot cette dépense ?"*. Si tu réponds *"divers"*, l'agent crée un lot "Divers" automatiquement et y rattache le frais.

---

## ✅ Scénario 5 — Décalage planning par chat

**Pain testé** : le user veut bouger un lot rapidement.

### Étape 1 — Demander le décalage
Dans Assistant chat :
> "tu peux décaler le plombier d'1 semaine ?"

### Étape 2 — L'agent doit demander cascade ou détaché
Si Plombier a des successeurs (Plaquiste, Carreleur), l'agent répond en TEXTE :
> *"Derrière Plombier il y a Plaquiste et Carreleur. On cascade (= décale aussi tout ce qui suit) ou on détache (= Plombier devient indépendant, les suivants restent à leur date) ?"*

### Étape 3 — Tu réponds "oui cascade"
L'agent appelle `shift_lot(lot_id_plombier, jours=5, cascade=true)`.

**Vérifier** :
- Onglet **Planning** → Plombier décalé visuellement, Plaquiste et Carreleur aussi
- `SELECT date_debut, date_fin FROM lots_chantier WHERE chantier_id = '...'` → dates mises à jour

### Étape 4 — Test détaché
Refais avec *"non, juste Plombier"* → `cascade=false`. Plombier va sur une side lane indépendante, Plaquiste/Carreleur restent.

---

## ✅ Scénario 6 — Email entrant artisan

**Pain testé** : un artisan répond par email (pas WhatsApp), l'agent doit le voir.

### Étape 1 — Setup
Le contact `Plombier Test` doit avoir un email enregistré. Dans Assistant chat ajoute via :
> "ajoute marc.plombier@example.com comme email à Plombier Test"

L'agent appelle `update_contact(contact_id, email=...)`.

### Étape 2 — USER envoie un email via Messagerie
Onglet **Messagerie** → Email → Compose → choisir Plombier Test → sujet "Devis pompe" → message → envoyer.

### Étape 3 — ARTISAN répond depuis sa boîte mail
À l'adresse `chantier-{id}+{convId}@reply.verifiermondevis.fr`, ARTISAN répond *"OK pour 800€, je viens lundi"*.

### Étape 4 — Vérifier
- SendGrid Inbound Parse → webhook `/api/webhooks/inbound-email` insère dans `chantier_messages` direction `inbound`
- L'orchestrator est déclenché en mode morning → analyse le message
- Si l'agent détecte une décision (montant proposé) → notif owner channel (cf. scénario 1)

---

## ✅ Scénario 7 — Validation devis par chat

**Pain testé** : choisir parmi 2 devis et marquer celui retenu.

### Étape 1 — Setup
Avoir uploadé 2 devis pour le lot Plombier (analysés par VMD).

### Étape 2 — Décision
Dans Assistant chat :
> "valide le devis du plombier qui a le meilleur score"

L'agent doit :
- Lister les 2 devis avec leur score
- Demander confirmation si nécessaire
- Appeler `update_devis_statut(devis_id, statut='valide')`

### Étape 3 — Vérifier
- Devis passé en `valide` côté Budget & Trésorerie
- Status badge mis à jour

---

## ✅ Scénario 8 — Add payment event (échéance future)

**Pain testé** : déclarer une rentrée d'argent attendue.

### Étape 1 — Déclarer
Dans Assistant chat :
> "le crédit débloque 30000€ le 15 mai"

L'agent appelle `add_payment_event(label='Déblocage crédit', amount=30000, due_date='2026-05-15')`.

### Étape 2 — Vérifier
- Onglet **Budget & Trésorerie** → vue Échéancier → ligne visible le 15 mai
- Vue **Cashflow** → courbe solde prévisionnel monte de 30k€ ce jour-là

---

## ✅ Scénario 9 — Send email avec rate-limit

**Pain testé** : éviter le spam si l'agent boucle.

### Étape 1 — Envoyer 5 emails au même artisan en 24h
Via chat ou via Messagerie, envoie 5 emails consécutifs à Plombier Test.

### Étape 2 — Tenter le 6e
Demande à l'agent d'envoyer un 6e email à Plombier Test.

L'agent doit refuser avec :
> *"Cap atteint : 5 emails envoyés à Plombier Test dans les 24h. Demande au user d'attendre demain ou d'envoyer manuellement via la Messagerie."*

---

## ✅ Scénario 10 — Digest journal du soir

**Pain testé** : avoir une vue récap quotidienne sans devoir scroller tous les onglets.

### Étape 1 — Faire de l'activité dans la journée
Effectuer 2-3 actions sur le chantier (frais déclaré, validation devis, message reçu).

### Étape 2 — Attendre 19h Paris
Le cron `agent-orchestrator-evening-digest` tourne à 17h UTC = 19h Paris.

### Étape 3 — Vérifier le journal
- Onglet **Journal de chantier** → date d'aujourd'hui → markdown généré par Gemini avec récap des événements + 3 sections déterministes :
  - ⚙️ Décisions prises aujourd'hui
  - ⚠️ Alertes du jour
  - ❓ Clarifications demandées
- USER reçoit aussi un message WhatsApp dans le canal owner si activité significative

---

## 🐛 Cas d'erreur à valider

### Cas E1 — Numéro inconnu envoie un message
Depuis un numéro **non enregistré comme contact**, envoie un message dans un groupe WhatsApp du chantier.
L'agent doit appeler `request_clarification` → crée un insight + tâche urgente "Identifier le contact 33XXX".
Visible dans panneau Activité IA + onglet Tâches.

### Cas E2 — register_payment ambigu
Si tu as 2 factures plombier en attente : demande *"j'ai payé 1500€ au plombier"*.
L'agent doit appeler `register_payment` qui retourne `reason='ambiguous'` avec la liste des candidates → l'agent demande au user laquelle.

### Cas E3 — schedule_reminder sans canal owner
Sur un chantier de test SANS canal owner privé : *"rappelle-moi demain"*.
L'agent doit refuser et proposer `create_owner_whatsapp_channel` d'abord.

### Cas E4 — schedule_reminder dans le passé
*"rappelle-moi hier"* → l'agent doit comprendre que c'est nonsense, demander une clarification, ou refuser proprement (refus si due_at < now-5min).

---

## 🔍 Outils de debug

### Voir tous les tool_calls récents
```sql
SELECT
  created_at,
  role,
  LEFT(content, 100) AS preview,
  jsonb_array_length(COALESCE(tool_calls, '[]'::jsonb)) AS nb_tool_calls,
  jsonb_path_query_array(tool_calls, '$[*].tool')::text AS tools_called
FROM chantier_assistant_messages
WHERE chantier_id = 'YOUR_CHANTIER_ID'
ORDER BY created_at DESC
LIMIT 20;
```

### Voir les runs LLM (avec tokens consommés)
```sql
SELECT
  created_at,
  run_type,
  messages_analyzed,
  insights_created,
  jsonb_array_length(actions_taken) AS nb_actions
FROM agent_runs
WHERE chantier_id = 'YOUR_CHANTIER_ID'
ORDER BY created_at DESC
LIMIT 10;
```

### Voir les pending decisions
```sql
SELECT id, question, expected_action, status, expires_at, resolved_answer
FROM agent_pending_decisions
WHERE chantier_id = 'YOUR_CHANTIER_ID'
ORDER BY created_at DESC;
```

### Voir les rappels programmés
```sql
SELECT id, due_at, status, payload->>'text' AS text, fired_result
FROM agent_scheduled_actions
WHERE chantier_id = 'YOUR_CHANTIER_ID'
ORDER BY due_at DESC;
```

### Trigger manuel le cron de rappels (pour ne pas attendre 15min)
```sql
SELECT net.http_post(
  url := 'https://vhrhgsqxwvouswjaiczn.supabase.co/functions/v1/agent-scheduled-tick',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'agent_cron_secret' LIMIT 1)
  ),
  body := '{}'::jsonb
);
-- Puis :
SELECT id, status_code, content::text FROM net._http_response ORDER BY created DESC LIMIT 1;
```

### Logs edge function (si quelque chose merde)
- Via Supabase Dashboard → Edge Functions → Logs (1h glissante)
- Ou via supabase CLI : `supabase functions logs agent-orchestrator --project-ref vhrhgsqxwvouswjaiczn`

---

## 🧪 Tests techniques whapi (read receipts + presence)

Ces tests valident l'intégration whapi.cloud côté serveur — pas la couche conversationnelle agent. À cocher au fur et à mesure des passes.

### `[whapi-read-receipts]`

- [ ] Webhook `POST /api/webhooks/whapi` avec payload contenant uniquement `statuses[]` (pas de `messages[]` ni `events[]`) → vérifier que l'early return ne court-circuite pas le bloc statuts et que les rows s'insèrent dans `whatsapp_message_statuses`.
- [ ] Tool `get_message_read_status` appelé avec un numéro sans aucun statut en base → réponse `{ ok: true, result: "Aucun accusé de lecture trouvé..." }` sans erreur.
- [ ] Double-envoi du même status whapi (même `message_id` + `viewer_id`) → idempotence via `ON CONFLICT` : UPDATE sans erreur, pas de doublon.

### `[whapi-presence]`

- [ ] Créer un groupe en sélectionnant un contact `has_whatsapp = false` : (a) le numéro est absent de l'appel whapi de création de groupe, (b) row inséré dans `chantier_whatsapp_members` avec `excluded_no_whatsapp = true`, (c) panel membres → 3e section "Sans WhatsApp" affichée, (d) modale → contact grisé, badge orange, décoché par défaut.
- [ ] PATCH d'un groupe existant en ajoutant un contact `has_whatsapp = false` → mêmes vérifications (a–d) + réponse API `{ added: 0, excluded: 1 }`.
- [ ] `POST /api/chantier/[id]/contacts` avec un numéro fixe (non-WhatsApp) → après quelques secondes : `has_whatsapp = false` et `whatsapp_checked_at` rempli en base, réponse API immédiate (fire-and-forget non bloquant).
- [ ] `POST /api/chantier/[id]/contacts` avec un vrai numéro WhatsApp → `has_whatsapp = true` et `whatsapp_checked_at` rempli.
- [ ] Digest du soir `agent-orchestrator` : section "CONTACTS SANS WHATSAPP" présente dans le prompt (logs Supabase), aucune tâche de relance WhatsApp créée pour un contact `has_whatsapp = false`.

---

## 🎯 Critères de réussite

Un scénario est **validé** si :
1. ✅ Le tool attendu est bien appelé (visible dans `agent_runs.actions_taken` ou `chantier_assistant_messages.tool_calls`)
2. ✅ L'effet en base est correct (DB mise à jour, status correct, etc.)
3. ✅ L'effet en UI est visible (sans avoir à recharger 10 fois)
4. ✅ Le message WhatsApp est reçu (si applicable) avec le bon contenu
5. ✅ Pas d'erreur silencieuse (tools/index.ts dispatcher logs `console.warn` les blocages)

Si un scénario échoue : commencer par **l'outil de debug** correspondant (queries SQL ci-dessus), puis vérifier les logs edge function. Mettre une issue ou un message à Claude pour diagnostic.
