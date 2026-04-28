# Refactor cashflow chantier — log d'exécution

> **Statut** : en cours (PR 2/5 mergée). PR3 prochaine.
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
