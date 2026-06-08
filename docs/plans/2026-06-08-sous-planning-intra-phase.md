# Recherche / conception — Sous-planning intra-phase + toggle planning simplifié/avancé

> Date : 2026-06-08. Statut : RECHERCHE (pas encore planifié ni codé).
> Auteur : investigation via 2 explorations de code (sous-système planning + blast radius cross-onglets).

## 1. Le besoin (reformulé)

Aujourd'hui, une "phase d'intervenant" du planning = un **lot** (`lots_chantier`), ordonnancé entre lots par un DAG Finish-to-Start (`lot_dependencies`) + un moteur CPM, affiché en Gantt.

On veut pouvoir **découper un lot en sous-phases** avec leurs propres dépendances, y compris **inter-lots** (exemple : "Électricité" démarre quand la sous-phase "Mise en eau" du lot "Plombier" est terminée). Plus :
- **2 vues du planning via un toggle** : "simplifiée" (l'actuelle, au niveau lot) et "avancée" (avec les sous-phases).
- En vue avancée, **cliquer sur une pastille** (barre de lot) ouvre un panneau en bas pour **découper le lot en sous-phases**.

## 2. État actuel du code (ce sur quoi on construit)

### Modèle de données
- `lots_chantier` : `id, chantier_id, nom, role, emoji, statut, ordre, job_type, budget_*_ht, duree_jours, date_debut, date_fin, delai_avant_jours, lane_index`. **Aucune colonne `parent_id`** : pas de hiérarchie aujourd'hui.
- `lot_dependencies` : `(lot_id, depends_on_id)`, Finish-to-Start pur, multi-parent, FK CASCADE. Pas de type de lien ni de lag.
- `duree_jours` est la **seule donnée structurelle** : `date_debut`/`date_fin` sont **calculées par le CPM puis persistées**.
- Liens : `documents_chantier.lot_id` (devis/factures/photos rattachés à un lot), `contacts_chantier.lot_id` (intervenant rattaché à un lot). La relation est inverse (le doc/contact pointe vers le lot, pas l'inverse).

### Moteur CPM (`src/lib/chantier/planningUtils.ts`)
Fonction pure `computePlanningDates(lots, startDate, depsMap)` :
1. filtre les lots valides (`duree_jours > 0`),
2. construit le graphe (inDegree + successors),
3. tri topologique de Kahn (cycles renvoyés en fin, fallback sûr),
4. forward pass : `debut = max(fin des prédécesseurs, startDate) + delai_avant_jours (jours ouvrés)`, `fin = debut + duree_jours (jours ouvrés)`.
Helpers : `addBusinessDays`, `businessDaysBetween`, `inferDefaultPredecessors`, `computeStartDateFromEnd`. **C'est une fonction sur (noeuds, arêtes), réutilisable telle quelle pour un graphe plus large.**

### API
- `GET /api/chantier/[id]/planning` renvoie `{ dateDebutChantier, dateFinSouhaitee, lots[], dependencies{} }`.
- `PATCH /api/chantier/[id]/planning` : met à jour durées/délais/lanes + diff des dépendances + recompute global + persiste les dates + invalide `agent_context_cache` + log `chantier_activity`.
- `POST /planning/shift-lot` (cascade vs détache), `POST /lots`, `DELETE /lots/[lotId]` (bridge des dépendances).

### Hook `usePlanning.ts`
State `{ lots, deps (Map), startDate, dateFinSouhaitee, ... }`. **Anti-rollback réseau** via `reqSeqRef` (les réponses périmées sont ignorées). Updates optimistes locales + PATCH. Dispatch `chantierPlanningChanged` après succès.

### UI Gantt (`cockpit/planning/PlanningTimeline.tsx`)
Barres positionnées en pixels depuis les dates CPM. Lanes en first-fit + `lane_index` explicite. **Drag & drop uniquement** (`handleLotMoveWithLane` : pixel → `delai_avant_jours` + recâblage des deps). **Il n'existe AUCUN `onClick` sur les barres** aujourd'hui : à ajouter pour ouvrir le panneau de découpage.
À ne pas confondre : `TimelineHorizontale.tsx` = roadmap macro IA, pas le Gantt des lots.

## 3. Décision d'architecture : table séparée `lot_subphases` (Option A) — RECOMMANDÉ

Deux options ont été évaluées.

### Option A — Nouvelle table `lot_subphases` (+ `subphase_dependencies`) — RECOMMANDÉ
Les sous-phases vivent dans une table à part. `lots_chantier` n'est **pas touché**.

**Pourquoi c'est le bon choix : le blast radius s'effondre.** Tous les consommateurs de `lots_chantier` (budget, trésorerie, documents, agent-checks, tools de l'agent IA, ProCard/IntervenantsListView de l'accueil) **continuent de fonctionner au niveau lot, sans modification**. Les risques majeurs identifiés (double-comptage budget, prolifération d'alertes, date de réception polluée, statut agrégé) **disparaissent par construction**, car ces systèmes ne voient jamais les sous-phases.

C'est aussi cohérent avec l'intention produit : on découpe une phase pour **ordonnancer** plus finement, pas pour la re-budgéter. Le budget, le devis, la facture, l'intervenant restent au niveau du lot.

### Option B — Colonne `parent_id` sur `lots_chantier` — REJETÉ pour V1
Une sous-phase serait un lot avec `parent_id`. Avantage : CPM et dépendances unifiés d'office. **Mais** : chaque consommateur de `lots_chantier` devrait ajouter un filtre `parent_id IS NULL` (budget, `estimatedEnd` de l'accueil, agent-checks, `sum_travaux_*` qui double-compterait, sélecteurs de lot, ProCard...). Énorme surface de régression sur des agrégations que le `CLAUDE.md` documente comme fragiles. À éviter.

## 4. Le point dur : le CPM avec dépendances inter-niveaux

Le besoin "Électricité démarre quand Mise en eau (sous-phase du Plombier) est terminée" implique une **dépendance d'un lot vers une sous-phase d'un autre lot**. C'est le seul vrai défi technique.

### Approche retenue : un graphe de noeuds unifié AU MOMENT DU CALCUL
Le CPM reste une fonction sur (noeuds, arêtes). On lui passe un espace de noeuds combiné, sans changer le stockage :
- Espace d'ids : `lot:<uuid>` et `sub:<uuid>`.
- Un lot **sans** sous-phases = 1 noeud (comme aujourd'hui).
- Un lot **avec** sous-phases : ses sous-phases deviennent les noeuds de calcul ; le lot parent est un **conteneur** dont les dates sont **dérivées** : `date_debut(parent) = min(date_debut sous-phases)`, `date_fin(parent) = max(date_fin sous-phases)`.
- Arêtes : union de `lot_dependencies` (lot→lot, conservées pour la vue simplifiée et les lots sans sous-phases) + `subphase_dependencies` (sub→sub, y compris **inter-lots**). Une dépendance "lot→lot" entre deux lots qui ont des sous-phases se résout naturellement (le successeur démarre après `max(fin)` du prédécesseur = sa dernière sous-phase).

**Conséquence élégante** : `lot.date_fin` reste rempli après calcul (= max des sous-phases), donc `DashboardHome.estimatedEnd = max(lot.date_fin)` **continue de marcher sans modification**. Idem la bulle Planning.

### Généralisation minimale de `computePlanningDates`
Garder la signature actuelle pour le chemin simplifié. Ajouter une variante (ou un paramètre) qui accepte une liste de noeuds génériques `{ id, duree_jours, delai_avant_jours }` + une depsMap générique sur ces ids. Le forward pass est identique. Après calcul, on reventile : noeuds `sub:` → table sous-phases ; agrégation min/max → dates du lot parent ; noeuds `lot:` → lots sans sous-phases.

## 5. Schéma SQL proposé (additif, non-breaking)

```sql
CREATE TABLE lot_subphases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id            UUID NOT NULL REFERENCES lots_chantier(id) ON DELETE CASCADE,
  nom               TEXT NOT NULL,
  ordre             INTEGER NOT NULL DEFAULT 0,
  duree_jours       INTEGER,
  delai_avant_jours INTEGER NOT NULL DEFAULT 0,
  date_debut        DATE,
  date_fin          DATE,
  statut            TEXT NOT NULL DEFAULT 'a_faire',
  lane_index        INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE subphase_dependencies (
  subphase_id   UUID REFERENCES lot_subphases(id) ON DELETE CASCADE,
  depends_on_id UUID REFERENCES lot_subphases(id) ON DELETE CASCADE,
  PRIMARY KEY (subphase_id, depends_on_id),
  CHECK (subphase_id <> depends_on_id)
);
```

RLS calquée sur `lot_dependencies` (join `lots_chantier → chantiers` + `(select auth.uid())` wrappé, cf. règle CLAUDE.md). FK CASCADE = nettoyage auto quand un lot ou une sous-phase est supprimé.

**Question ouverte** pour les dépendances inter-lots lot↔sous-phase : soit on autorise `subphase_dependencies.depends_on_id` à pointer une sous-phase d'un autre lot (cas couvert tel quel), soit on a besoin d'une 3e table d'arêtes mixtes `lot↔sub`. Recommandation : **commencer par sub→sub inter-lots** (couvre l'exemple Électricité/Mise en eau si "Électricité" est elle-même modélisée en sous-phase, ou via une dépendance lot→lot existante qui hérite du max). À trancher en planification selon les cas réels visés.

## 6. Plan, hook, UI

- **API** : `GET /planning` renvoie en plus `subphases: { lot_id: [...] }` et `subphase_dependencies: { sub_id: [...] }`. Nouveaux endpoints (ou extension du PATCH planning) pour CRUD sous-phases + leurs deps. Le recompute global construit le graphe unifié.
- **Hook** : étendre `usePlanning` avec `subphases` + actions (add/update/delete subphase, set deps). **Piège** : le `reqSeqRef` est un compteur global ; batcher les écritures sous-phase OU lui donner un compteur dédié pour éviter que des PATCH concurrents invalident leurs réponses.
- **UI** :
  - Toggle "Simplifié / Avancé" persisté en `localStorage` (clé par chantier, comme les autres toggles du cockpit). Simplifié = `PlanningTimeline` actuel inchangé.
  - Avancé : rendu des sous-phases (lot "dépliable" en sous-bandes, ou sous-barres dans la lane du lot). Ajouter un `onClick` sur la barre (n'existe pas aujourd'hui) qui ouvre en bas un panneau de découpage. **Réutiliser `cockpit/PanneauDetail.tsx`** (déjà présent) comme socle du panneau.
  - Le D&D des sous-phases réutilise la logique `handleLotMoveWithLane` (à abstraire pour qu'elle opère sur un noeud générique).

## 7. Blast radius — ce qui change vs ce qui ne bouge pas (avec Option A)

| Onglet / système | Impact avec Option A | Sévérité |
|---|---|---|
| **Budget** (`api/.../budget.ts`) | Aucun. Documents restent sur le lot, agrégation par lot inchangée. | 🟢 |
| **Trésorerie / Échéancier** | Aucun (join `lots_chantier(nom)` inchangé). | 🟢 |
| **Documents** | Aucun si les docs restent rattachés au lot. Le sélecteur de lot reste plat. | 🟢 |
| **Lots / Intervenants** (ProCard, IntervenantsListView, LotDetail) | Aucun : ils itèrent `lots_chantier`, qui n'a pas changé. Option : afficher un indicateur "N sous-phases". | 🟢 |
| **DashboardHome / bulle Planning** | Aucun : `estimatedEnd = max(lot.date_fin)` marche car `lot.date_fin` reste dérivé (max des sous-phases). | 🟢 |
| **Agent IA (tools, context, agent-checks)** | Aucun en V1 si l'agent reste au niveau lot. Les sous-phases ne sont pas exposées au contexte agent. | 🟢 |
| **Journal / activité** | Aucun en V1 (on ne loggue pas les changements de sous-phase, ou alors avec le `lot_id` parent). | 🟢 |
| **CPM** (`planningUtils.ts`) | Généralisation (graphe de noeuds unifié). Coeur du chantier technique. | 🟡 |
| **API planning + hook usePlanning** | Extension (CRUD sous-phases + deps, recompute unifié). | 🟡 |
| **UI Gantt** | Toggle + vue avancée + onClick + panneau de découpage. Gros du travail UI. | 🟡 |

**C'est tout l'intérêt de l'Option A** : 7 systèmes en 🟢 (transparents), 3 en 🟡 (le périmètre planning lui-même, bien circonscrit). Avec l'Option B, la majorité passerait en 🟡/🔴.

## 8. Décisions produit à trancher AVANT de planifier

1. **Budget des sous-phases** : V1 = pas de budget par sous-phase (le budget reste au lot). Confirmer.
2. **Statut** : V1 = `lot.statut` reste piloté manuellement / par l'agent (pas de rollup auto depuis les sous-phases) pour ne toucher à aucun consommateur de statut. Les sous-phases ont leur propre `statut` informatif dans le planning avancé. OK ?
3. **Portée des dépendances inter-lots** : a-t-on besoin d'arêtes mixtes lot↔sous-phase, ou sub→sub inter-lots suffit pour les cas réels ? (impacte le schéma).
4. **Intervenant d'une sous-phase** : hérite du lot, ou peut être un contact différent ? (V1 : hérite du lot, recommandé).
5. **Agent IA** : V1 = l'agent ignore les sous-phases (pilote au niveau lot). Phase 2 = on enrichit le contexte + tools pour qu'il manipule les sous-phases. OK de différer ?

## 9. Séquençage de build proposé (chaque étape commit-able, revertable)

- **Étape 0 — Migration SQL** (additive) : `lot_subphases` + `subphase_dependencies` + RLS. Zéro impact prod.
- **Étape 1 — CPM généralisé** : refacto `computePlanningDates` en graphe de noeuds + tests unitaires (le projet a déjà des tests `*.test.ts` lancés via `npx tsx`). Pas encore branché.
- **Étape 2 — API** : extension `GET/PATCH planning` + CRUD sous-phases, recompute unifié, dérivation date du lot parent.
- **Étape 3 — Hook** : `usePlanning` gère les sous-phases (avec gestion du `reqSeqRef`).
- **Étape 4 — UI toggle + vue avancée** : toggle persistant, rendu sous-phases, `onClick` barre → panneau de découpage (socle `PanneauDetail`), D&D sous-phases.
- **Étape 5 — Polissage** : empty states, mobile (`useIsMobile` si l'UX diverge), a11y aria-labels.
- **Phase 2 (différée)** — exposer les sous-phases à l'agent IA + journal.

## 10. Pièges connus à respecter (issus du code + CLAUDE.md)

- **Anti-rollback `reqSeqRef`** : ne pas laisser des PATCH sous-phase concurrents s'invalider. Batcher ou compteur dédié.
- **Dates dérivées ET persistées** : toute modif d'une sous-phase doit déclencher le recompute en cascade (sous-phases → date du lot → CPM inter-lots → lots dépendants).
- **`inferDefaultPredecessors`** se base sur le `nom` : risque de dépendances auto-circulaires si les sous-phases ont des noms proches du lot ("Maçonnerie phase 1" vs "Maçonnerie"). Ne pas faire passer les sous-phases par cette heuristique.
- **Toggle plein écran** : si la vue avancée devient un layout pleine hauteur, respecter la règle `overflow-hidden` du `<main>` cockpit (cf. CLAUDE.md).
- **`ChantierCockpit`/onglets** : si le panneau de découpage est un layout app, attention au `max-h-[calc(100vh-...)]` (piège documenté).
- **Statut à 2 enums** : la colonne `statut` de `lots_chantier` mélange déjà 2 jeux de valeurs (`a_trouver/a_contacter/ok` vs `a_faire/en_cours/termine`). Pour les sous-phases, partir d'un enum propre dès le départ.

## 11. Verdict

Faisable, avec un **risque maîtrisé** grâce à l'Option A (table séparée) qui isole la feature dans le périmètre planning. Le seul vrai morceau de R&D est le **CPM généralisé sur un graphe de noeuds lot+sous-phase**, qui reste une extension d'une fonction pure déjà bien faite. L'UI (toggle + panneau de découpage + D&D des sous-phases) est le plus gros volume de travail mais sans risque de régression sur les autres onglets.
