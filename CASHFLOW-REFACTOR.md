# Refactor cashflow chantier — log d'exécution

> **Statut** : ✅ TERMINÉ (PRs 1-5 mergées 2026-04-28). À supprimer après stabilisation des tests E2E.
> **But** : unifier les 3 voies de saisie de dépense (cf. WIP.md §11) sous une architecture où `documents_chantier` + `cashflow_extras` sont les seules sources de vérité, et `payment_events_v` (VIEW) est le consommateur unique pour Échéancier/Trésorerie.
> **À supprimer après PR5** stabilisée et merge complète. Garder pour pouvoir tracer en cas de bug pendant les tests.

---

## Architecture cible

```
┌────────────────────────┐         ┌─────────────────┐
│  documents_chantier    │         │ cashflow_extras │
│  (devis, facture,      │         │ (déblocage      │
│   ticket, frais)       │         │  crédit, apport)│
│                        │         │                 │
│  + cashflow_terms      │         │                 │
│    JSONB array         │         │                 │
└──────────┬─────────────┘         └────────┬────────┘
           │                                │
           └──────────┬─────────────────────┘
                      ▼
        ┌──────────────────────────────┐
        │   VIEW payment_events_v       │
        │   (UNION 3 branches)          │
        └──────────────┬────────────────┘
                       ▼
        ┌──────────────────────────────┐
        │  Échéancier / Trésorerie /    │
        │  Cashflow KPI / Frontend      │
        └──────────────────────────────┘
```

---

## PR1 — `cashflow_extras` + backfill (mergée 2026-04-28)

**Commit** : `e4a6b50` `feat(chantier): add cashflow_extras table (PR 1/5 refactor voies dépense)`

### Changements DB

- **CREATE TABLE** `public.cashflow_extras`
  - colonnes : `id, project_id, label, amount, due_date, status, paid_at, financing_source, notes, created_at, updated_at, created_by`
  - 2 indexes : `(project_id, due_date)`, `(project_id, status) WHERE status != 'cancelled'`
  - 3 triggers : `touch_updated_at`, `set_created_by`, `set_paid_at`
  - RLS : `(select auth.uid())` wrapper
- **Backfill** : 3 rows (10 500€) copiées depuis `payment_events WHERE source_type='manuel' AND NOT is_override`

### Migrations

- `supabase/migrations/20260428201638_add_cashflow_extras.sql`

### État après PR1

| Table | Rows | Somme |
|---|---|---|
| `payment_events` | 58 (intacte) | — |
| `cashflow_extras` | 3 | 10 500€ |

### Aucune écriture re-routée
Le code applicatif continue d'écrire 100% dans `payment_events` legacy. `cashflow_extras` est dormante en attendant la bascule.

### Rollback PR1

```sql
DROP TABLE IF EXISTS public.cashflow_extras CASCADE;
DROP FUNCTION IF EXISTS public.touch_cashflow_extras_updated_at();
DROP FUNCTION IF EXISTS public.set_cashflow_extras_created_by();
DROP FUNCTION IF EXISTS public.set_cashflow_extras_paid_at();
```

---

## PR2 — `cashflow_terms` + VIEW `payment_events_v` (mergée 2026-04-28)

**Commit** : `a0015d4` `feat(chantier): cashflow_terms + VIEW payment_events_v (PR 2/5 refactor)`

### Cleanup orphans préalable

`DELETE FROM payment_events` 29 rows orphelins :
- 24 events / 147 602€ — chantier "Portail, Clôture et Terrasse Bois" (devis re-uploadés, events jamais nettoyés)
- 4 events / 4 067€ — chantier supprimé (CASCADE foiré historiquement)
- 1 event / 438€ — chantier "Rénovation complète maison et IPN"

Justification : dette de tests dev, aucune donnée business.

### Changements DB

- **ALTER TABLE** `documents_chantier ADD COLUMN cashflow_terms JSONB NOT NULL DEFAULT '[]'`
  - CHECK : `jsonb_typeof(cashflow_terms) = 'array'`
- **Backfill** : 26 docs avec versements depuis `payment_events` legacy non-override
  - Format élément : `{ amount, due_date, status, label }`
- **CREATE EXTENSION** `uuid-ossp` (qualifié `extensions.*`)
- **CREATE VIEW** `payment_events_v` (3 branches UNION ALL)
  - Branche 1 : Frais & ticket_caisse → 1 event auto-paid (date = created_at)
  - Branche 2 : Devis & factures → expand `cashflow_terms` array (`term_index` exposé)
  - Branche 3 : `cashflow_extras` (status != 'cancelled')
  - Colonnes exposées : `id, project_id, source_type, source_id, term_index, lot_id, amount, due_date, status, label, financing_source, is_override, origin, created_at`
  - IDs déterministes via `uuid_generate_v5(uuid_ns_url(), 'cashflow:{doc_id}:{idx}')`

### Migrations

- `supabase/migrations/20260428210000_cleanup_orphan_payment_events.sql`
- `supabase/migrations/20260428210100_add_cashflow_terms_and_view.sql`

### Validation Sumcheck (effectuée en prod)

| Catégorie | Legacy | VIEW | Match |
|---|---|---|---|
| devis+facture | 26 events / 139 171.83€ | 26 / 139 171.83€ | ✅ exact |
| manuel | 3 / 10 500€ | 3 / 10 500€ | ✅ exact |
| **frais (NEW gain)** | 0 (invisible) | 3 / 900€ | ✨ feature |

Total VIEW : 32 events / 150 571.83€

### État après PR2

| Table / VIEW | Rows |
|---|---|
| `payment_events` legacy | 29 (intacte, rollback dispo) |
| `cashflow_extras` | 3 |
| `documents_chantier.cashflow_terms` | 26 docs renseignés |
| `payment_events_v` VIEW | 32 events |

### Aucun consommateur ne lit la VIEW pour l'instant
Le code applicatif (`/api/chantier/[id]/payment-events` GET, hook `usePaymentEvents`, etc.) continue de lire `payment_events` legacy. La VIEW est créée pour comparaison / future bascule en PR3.

### Rollback PR2

```sql
DROP VIEW IF EXISTS public.payment_events_v;
ALTER TABLE public.documents_chantier DROP CONSTRAINT IF EXISTS documents_chantier_cashflow_terms_is_array;
ALTER TABLE public.documents_chantier DROP COLUMN IF EXISTS cashflow_terms;
-- Cleanup payment_events n'est pas reversible (orphelins déjà supprimés)
```

---

## PR3 — Bascule API en lecture + dual-write (mergée 2026-04-28)

**Commit principal** : `feat(chantier): API lit VIEW + dual-write (PR 3/5)`

### Objectif
Switcher l'API en lecture sur `payment_events_v` ET commencer à écrire en parallèle dans le nouveau chemin (cashflow_terms / cashflow_extras), tout en continuant d'écrire dans `payment_events` legacy. PR4 enlèvera l'écriture legacy.

### Changements DB

- Migration `20260428220000_cashflow_terms_event_id.sql` :
  - Wipe + re-backfill `cashflow_terms` avec `{ event_id, amount, due_date, status, label }` (event_id = legacy.id pour matcher 1:1)
  - VIEW `payment_events_v` recompilée : branche 2 utilise `(term->>'event_id')::uuid` comme id
  - Wrap `BEGIN/COMMIT` pour atomicité

### Changements code

- `src/lib/paymentEvents.ts` :
  - `PaymentEvent.id` ajouté (UUID pré-généré via `randomUUID()`)
  - Nouveau `writeCashflowTermsForDoc()` helper
  - `generatePaymentEventsFromAnalyse` et `*FromConditions` dual-écrivent cashflow_terms après INSERT legacy
  - `overridePreviousDevisEvents` vide aussi cashflow_terms du devis parent
  - **Order critique** : override déplacé en DERNIER step (sinon échec d'insertion = perte du devis parent visuellement)

- `src/pages/api/chantier/[id]/payment-events.ts` :
  - **GET** : lit `payment_events_v` (paramètre `include_override` conservé pour rétro-compat mais sans effet)
  - **POST manuel** : INSERT legacy + INSERT cashflow_extras avec **shared UUID**
  - **POST analyse** : appelle `generatePaymentEventsFromAnalyse` (dual-write), re-fetch sur la VIEW
  - **PATCH** : refus 422 pour `source_type='frais'`. Dual-update legacy + (cashflow_extras OU cashflow_terms[term_index]). Logique "Solde restant" propagée
  - **DELETE** : refus 422 pour frais. Dual-delete

- `supabase/functions/analyze-quote/index.ts` :
  - Bloc PAYMENT EVENTS dupliqué dans l'edge function : ajout du dual-write
    (UUID par event + UPDATE doc.cashflow_terms après INSERT legacy)
  - **Critique** : sans cette correction, tous les devis uploadés étaient invisibles
    dans la VIEW (le hash UUID v5 ne matchait aucun event_id)

### État après PR3

| Source | Comportement |
|---|---|
| GET API | Lit `payment_events_v` (VIEW) — frais désormais visibles en Échéancier (gain de feature) |
| POST/PATCH/DELETE | Dual-write : `payment_events` legacy + `cashflow_extras` OU `cashflow_terms` |
| Edge fn `analyze-quote` | Dual-write idem |
| `budget.ts` | **Inchangé** — lit toujours `payment_events` legacy. Cohérent grâce au dual-write. À switcher en PR4 |

### Risques connus (acceptés pour PR3, à corriger PR4)

1. **Drift legacy/new path silencieux** : si l'INSERT/UPDATE du chemin legacy réussit puis le dual-write échoue (réseau, erreur transient), la VIEW ne voit pas l'event mais legacy oui. Logs `[paymentEvents] writeCashflowTerms error` permettent de détecter. Stable car single-user, low concurrency.
2. **`is_override` dead code** : `usePaymentEvents.ts`, `CashflowProjection.tsx`, `payment-events.ts` ligne 144 contiennent encore `!e.is_override` qui sont des no-ops contre la VIEW. À nettoyer en PR5.
3. **`budget.ts` lit legacy** : après PR4 (stop écriture legacy), budget.ts cassera. À switcher en PR4 vers la VIEW.
4. **Solde restant edge case** : si le SELECT du doc échoue dans le PATCH, le legacy a la "Solde restant" mais cashflow_terms ne l'a pas. Visible côté Budget mais pas Échéancier. Single-user, transient. Risque accepté.
5. **`overridePreviousDevisEvents` order** : si l'INSERT facture réussit puis writeCashflowTerms échoue puis override échoue, on a duplicate display (devis pending + facture pending). Recoverable par re-trigger.

### Tests à faire avant PR4

- [ ] Échéancier d'un chantier existant : montant total identique avant/après bascule
- [ ] Upload nouveau devis (PDF) : analyse → events visibles dans Échéancier ET Budget
- [ ] Upload nouvelle facture liée à un devis existant : ancien devis disparaît, nouvelle facture apparaît
- [ ] Frais agent IA `register_expense` : visible Budget + Échéancier (gain de feature)
- [ ] Saisie "+ dépense" Échéancier : crée extra, visible Échéancier
- [ ] Marquer un event payé : status pending → paid se reflète Budget + Échéancier
- [ ] Versements multiples (acompte+solde) : 2 events visibles
- [ ] Paiement partiel (mark paid avec amount < planned) : "Solde restant" apparaît

### Rollback PR3

```sql
-- 1. Re-créer ancienne version VIEW (id v5-derived) — voir PR2 migration
-- 2. Wipe cashflow_terms (les rebackfill auto au prochain pipeline)
UPDATE documents_chantier SET cashflow_terms = '[]';
-- 3. Reverter le code (git revert <commit_pr3>)
-- payment_events legacy reste intacte → l'app reprend en lecture legacy
```

---

## PR4 — Stop écriture legacy + switch budget.ts (mergée 2026-04-28)

### Objectif
Couper TOUTES les écritures vers `payment_events` legacy. La table reste en lecture-seule pour rollback éventuel jusqu'au PR5 (drop). Les écritures vont :
- `cashflow_extras` pour les mouvements manuels
- `documents_chantier.cashflow_terms` pour les versements de devis/facture

### Changements code

- **`src/lib/paymentEvents.ts`** :
  - `insertPaymentEvents` devient un stub no-op (gardé pour rétro-compat des callers)
  - `overridePreviousDevisEvents` ne touche plus à legacy, vide juste cashflow_terms du devis parent
  - `generatePaymentEventsFromAnalyse` et `*FromConditions` : retire DELETE + INSERT legacy
  - Pipeline simplifié : extract → transform → writeCashflowTermsForDoc → override

- **`src/pages/api/chantier/[id]/payment-events.ts`** :
  - **POST manuel** : INSERT cashflow_extras seulement
  - **PATCH** : UPDATE cashflow_extras OU cashflow_terms[term_index] uniquement
  - **PATCH "Solde restant"** : géré entièrement via cashflow_terms (find/update/append)
  - **PATCH cleanup remainder** : guard `origin === 'document'` ajouté
  - **DELETE** : delete cashflow_extras OU retrait du term uniquement

- **`supabase/functions/analyze-quote/index.ts`** :
  - Retire INSERT legacy
  - Écrit uniquement cashflow_terms

- **`supabase/functions/agent-checks/index.ts`** :
  - **CHECK 2 (Overdue payments)** : switch sur `payment_events_v` (sinon les nouveaux events seraient invisibles à ce check)

- **`src/pages/api/chantier/[id]/budget.ts`** :
  - 2 queries `payment_events` → `payment_events_v`
  - `eq('is_override', false)` retiré (no-op)
  - `neq('source_type', 'frais')` ajouté à query "paid" pour éviter double-count avec `alwaysPaid`

### Code review appliqué (2 critiques + 3 importants)

1. ✅ `agent-checks` switché sur la VIEW (sinon overdue checks aveugles aux nouveaux events)
2. ⚠️ `documents.ts:134` ne passe pas `originalDevisId` pour les factures — pré-existant. Pour le moment, l'override automatique ne se déclenche que via POST `/payment-events` avec `originalDevisId` explicite. À fixer en PR5 (ou plus tard, peu de cas en pratique).
3. ✅ Guards `origin === 'document'` ajoutés sur PATCH steps 3-4
4. ✅ Docstrings mises à jour (writeCashflowTermsForDoc, overridePreviousDevisEvents)
5. ✅ TODO marker pour `funding_source_id` silencieusement ignoré

### État après PR4

| Composant | État |
|---|---|
| `payment_events` legacy | LECTURE-SEULE — 29 rows historiques figés |
| `cashflow_extras` | Source de vérité mouvements manuels |
| `documents_chantier.cashflow_terms` | Source de vérité versements devis/facture |
| `payment_events_v` VIEW | Consommé par tous les readers |
| Edge functions `analyze-quote`, `agent-checks` | À redéployer (modifs source) |

### Risques connus restants (à fixer en PR5)

1. **`documents.ts` import devis n'override pas le parent** : si un facture est uploadée via VMD import (rare flow), le devis parent n'est pas invalidé. Le user verra duplicate display. Workaround : passer par AddDocumentModal ou POST `/payment-events` direct.
2. **`is_override` dead code** dans frontend hooks (`usePaymentEvents`, `CashflowProjection`) : à nettoyer
3. **Comments stale** dans paymentEvents.ts (étapes pipeline numérotées)

### Tests à faire avant PR5 (drop legacy)

- [ ] Vérifier prod : `SELECT count(*) FROM payment_events_v` doit donner identique avant/après PR4
- [ ] Upload nouveau devis → events visibles
- [ ] Upload facture liée → ancien devis masqué (override)
- [ ] Marquer paid en partiel → "Solde restant" apparaît
- [ ] Marquer paid → revenir pending → "Solde restant" disparaît
- [ ] `register_expense` agent → frais visible Échéancier
- [ ] `add_payment_event` agent → mouvement visible Échéancier
- [ ] DELETE event → disparaît partout

### Rollback PR4

⚠️ Plus complexe que PR3 — les nouveaux events depuis PR4 ne sont plus dans legacy.

```bash
# 1. Revert code commits
git revert <commit_pr4>
# 2. Backfill legacy depuis cashflow_terms + cashflow_extras (script à écrire)
# 3. Redéployer edge functions analyze-quote + agent-checks
```

---

## PR5 — Cleanup final + DROP legacy (mergée 2026-04-28)

### Objectif
Supprimer définitivement `payment_events` legacy + nettoyer le code mort.

### Changements DB

- Migration `20260428230000_drop_payment_events_legacy.sql` :
  - `DROP TABLE payment_events CASCADE`
  - `ALTER cashflow_extras ADD COLUMN funding_source_id UUID REFERENCES chantier_entrees(id) ON DELETE SET NULL`
  - VIEW `payment_events_v` recompilée : retire `is_override` (toujours false), expose `funding_source_id`
  - Wrap BEGIN/COMMIT

### Changements code

- `src/hooks/usePaymentEvents.ts` :
  - Retire `!e.is_override` filters (3 occurrences) — la VIEW ne contient plus de overrides
  - Type `PaymentEvent` mis à jour : retire `is_override`, ajoute `term_index`/`origin`/`funding_source_id`, `source_type` étendu à `'frais'`
- `src/components/chantier/cockpit/CashflowProjection.tsx` : retire le filter `!e.is_override`
- `src/pages/api/chantier/[id]/payment-events.ts` :
  - Retire le param `include_override` (no-op depuis PR3)
  - Retire le filter `!e.is_override` dans `allocatedBySource`
  - Restaure `funding_source_id` dans le PATCH (route vers cashflow_extras / cashflow_terms)
- `src/lib/paymentEvents.ts` :
  - Retire le stub `insertPaymentEvents` (no-op)
  - Docstrings nettoyées (pipeline simplifié, plus de référence à legacy)

### Vérifications post-PR5 en prod

```sql
SELECT
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='payment_events') AS legacy_exists,  -- false ✓
  (SELECT COUNT(*) FROM payment_events_v) AS view_total_events,                                          -- 32 ✓
  (SELECT COUNT(*) FROM cashflow_extras) AS extras_count;                                                -- 3 ✓
```

### État après PR5

| Composant | État |
|---|---|
| `payment_events` legacy | DROPPED 🚮 |
| `cashflow_extras` | 3 rows + colonne `funding_source_id` |
| `documents_chantier.cashflow_terms` | Source de vérité versements |
| `payment_events_v` VIEW | Sans `is_override`, expose `funding_source_id` |
| Frontend `usePaymentEvents` | Type PaymentEvent à jour |

### Risques résiduels (pas bloquants — à fixer si besoin)

1. **`documents.ts` VMD import** ne passe pas `originalDevisId` pour les factures (flow rare — VMD import standard est devis only)
2. Tests E2E pas encore lancés — à faire pour valider tous les scénarios

### Rollback PR5

⚠️ Irréversible sans script de restauration de `payment_events` depuis cashflow_terms + cashflow_extras.

---

## Décisions actées (validées avec user)

1. **Frais = `paid` automatique en dur**. Pas de gestion CB débit différé (overkill).
2. **Voie 3 (déblocage crédit, apport perso) reste dans `cashflow_extras`** indéfiniment, même après upload d'une pièce justificative.
3. **Mécanisme `is_override`** : sera supprimé en PR5 (la VIEW dérive l'override implicitement via présence/absence de cashflow_terms).
4. **Performance** : volume actuel < 100 events/chantier. Pas de matérialisation de la VIEW pour l'instant.
5. **Logique de dérivation des versements** reste en Node (`paymentEvents.ts`), la VIEW lit juste un JSONB pré-calculé.

---

## Comportements attendus pendant la phase de transition (PR3 à PR5)

- L'app continue de fonctionner exactement comme aujourd'hui jusqu'à PR3 inclus (lecture migrée).
- En PR3, l'Échéancier va commencer à afficher les frais (gain de feature, pas une régression).
- En PR4, les nouveaux docs uploadés écriront dans le NOUVEAU pipeline. Les anciens docs avec cashflow_terms backfillés continuent de fonctionner.
- En PR5, la table `payment_events` legacy disparaît. Pas de retour en arrière simple.

---

## Tests E2E à faire avant chaque PR

1. **Échéancier d'un chantier existant** : montant total et liste de versements identiques avant/après bascule.
2. **Upload d'un nouveau devis** : analyse → events apparaissent en Échéancier.
3. **Upload d'une nouvelle facture** : event "à payer" apparaît, montant correct.
4. **Frais agent IA** (`register_expense`) : visible en Budget ET Échéancier (gain de feature).
5. **Saisie Échéancier "+ dépense"** : crée un extra, visible en Échéancier seulement.
6. **Marquer un event payé** : transition status pending → paid, montant payé reflété en Budget.
7. **Versements multiples (acompte + solde)** : 2 events affichés, datés correctement.

---

## Diagnostic en cas de problème pendant les tests

### "L'Échéancier est vide / a perdu des montants"

```sql
-- Vérif que la VIEW retourne bien les events
SELECT source_type, COUNT(*), SUM(amount)
FROM payment_events_v
WHERE project_id = '<chantier_id>'
GROUP BY source_type;

-- Comparer avec legacy
SELECT source_type, COUNT(*), SUM(amount)
FROM payment_events
WHERE project_id = '<chantier_id>' AND COALESCE(is_override,false) = false
GROUP BY source_type;
```

### "Un nouveau devis ne génère pas d'events"

```sql
-- Vérif que cashflow_terms est bien rempli après upload
SELECT id, document_type, depense_type, devis_statut, jsonb_array_length(cashflow_terms) AS n_terms
FROM documents_chantier
WHERE chantier_id = '<chantier_id>'
ORDER BY created_at DESC LIMIT 5;
```

### "Les frais n'apparaissent pas en Échéancier"

```sql
SELECT id, montant, depense_type, created_at
FROM documents_chantier
WHERE depense_type IN ('frais','ticket_caisse')
  AND chantier_id = '<chantier_id>';

-- La VIEW devrait avoir 1 event paid auto par ligne ci-dessus
SELECT id, source_id, amount, status, label
FROM payment_events_v
WHERE source_type = 'frais' AND project_id = '<chantier_id>';
```

---

## Liens

- Plan détaillé initial : conversation 2026-04-28
- WIP.md §11 : entrée d'origine
- DOCUMENTATION.md : architecture chantier (à mettre à jour après PR5)
