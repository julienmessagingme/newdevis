# Plan d'implémentation — Sous-planning intra-phase (V1)

> Date : 2026-06-08. Statut : PLAN (prêt à exécuter). Recherche associée : `2026-06-08-sous-planning-intra-phase.md`.
> Décisions produit figées : budget au niveau lot · statut manuel (pas de rollup) · dépendances cross-métier OUI · agent IA en Phase 2 · intervenant hérité du lot.

## Périmètre V1

**Dans le périmètre** : table sous-phases + dépendances généralisées, CPM multi-niveaux, API, hook, UI Gantt avancée avec toggle + panneau de découpage au clic, **+ seam d'habilitation premium (gate serveur + toggle verrouillé)**.

**Hors périmètre V1 (intacts)** : Budget, Trésorerie, Documents, accueil (ProCard/IntervenantsListView), agent IA (orchestrator + tools + checks), journal. Ils restent au niveau lot. Aucune modification.

**Principe directeur** : le lot reste l'unité de budget/devis/facture/intervenant/statut. La sous-phase est une unité **d'ordonnancement uniquement**. `lots_chantier` n'est jamais modifié structurellement ; ses `date_debut`/`date_fin` restent remplis (dérivés des sous-phases), donc tous les lecteurs actuels continuent de marcher.

## Gating premium (feature réservée à l'abonnement GMC)

Le planning avancé (sous-phases) est une **capacité premium**. Le paywall GMC n'étant pas encore construit, on pose un **seam** minimal maintenant, branchable plus tard sur `getAccessState` du plan de monétisation figé.

- **Habilités** : `admin` + beta/allowlist (`hasGmcAccess` actuel = Julien + Johan) + `subscribed` + `trial_active`. **Verrouillé** : `free` / `trial_expired`.
- **Gate serveur (obligatoire)** : helper `canUseAdvancedPlanning(userId)` + garde `requireAdvancedPlanning(request)` (sur le modèle de `requireChantierAuthOrAgent`). Appliqué sur TOUS les endpoints CRUD sous-phases → **403** si non habilité. Sans ça, l'API est contournable.
- **Gate client (UX seulement)** : le toggle "Avancé" s'affiche en état verrouillé (cadenas + CTA "Passer au premium") si non habilité. Jamais le contrôle de sécurité principal.
- **Aujourd'hui** : `canUseAdvancedPlanning` retourne `true` pour admin + allowlist (donc Julien/Johan testent), `false` sinon. **Demain** : on remplace l'implémentation interne par la lecture du tier d'abonnement GMC, sans toucher aux call sites. C'est le point de raccordement exact du futur paywall.
- **Ne PAS** réutiliser `getPremiumStatus`/`subscriptions` (système premium VMD / Pass Sérénité) : c'est un autre produit, un acheteur VMD ne doit pas hériter du planning avancé GMC.

---

## Étape 0 — Migration SQL (additive, zéro impact prod)

**Fichier** : `supabase/migrations/20260608_001_lot_subphases.sql`

```sql
-- Sous-phases d'un lot (ordonnancement fin). Le lot reste l'unité budget/statut.
CREATE TABLE lot_subphases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id            UUID NOT NULL REFERENCES lots_chantier(id) ON DELETE CASCADE,
  chantier_id       UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  nom               TEXT NOT NULL,
  ordre             INTEGER NOT NULL DEFAULT 0,
  duree_jours       INTEGER,
  delai_avant_jours INTEGER NOT NULL DEFAULT 0,
  date_debut        DATE,
  date_fin          DATE,
  statut            TEXT NOT NULL DEFAULT 'a_faire'
                    CHECK (statut IN ('a_faire','en_cours','termine')),
  lane_index        INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lot_subphases_lot ON lot_subphases(lot_id);
CREATE INDEX idx_lot_subphases_chantier ON lot_subphases(chantier_id);

-- Dépendances du graphe AVANCÉ. Un endpoint = un lot OU une sous-phase.
-- Couvre le cross-métier : "sous-phase Électricité dépend de sous-phase Mise en eau (autre lot)".
-- IMPORTANT : ne stocke QUE les arêtes impliquant >= 1 sous-phase. Le lot->lot pur
-- reste dans lot_dependencies (pas de double source de vérité).
-- Colonnes FK nullables (PAS de polymorphe kind+id) pour garder le CASCADE automatique
-- : supprimer un lot ou une sous-phase nettoie ses arêtes sans logique applicative.
CREATE TABLE planning_subphase_deps (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id      UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  -- successeur (le noeud qui DÉPEND) : exactement une des deux colonnes
  from_lot_id      UUID REFERENCES lots_chantier(id) ON DELETE CASCADE,
  from_subphase_id UUID REFERENCES lot_subphases(id) ON DELETE CASCADE,
  -- prédécesseur (le noeud DONT on dépend) : exactement une des deux colonnes
  to_lot_id        UUID REFERENCES lots_chantier(id) ON DELETE CASCADE,
  to_subphase_id   UUID REFERENCES lot_subphases(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ( ((from_lot_id IS NOT NULL)::int + (from_subphase_id IS NOT NULL)::int) = 1 ),
  CHECK ( ((to_lot_id   IS NOT NULL)::int + (to_subphase_id   IS NOT NULL)::int) = 1 ),
  -- au moins une sous-phase impliquée (sinon ça appartient à lot_dependencies)
  CHECK ( from_subphase_id IS NOT NULL OR to_subphase_id IS NOT NULL ),
  -- pas de self-loop
  CHECK ( from_subphase_id IS NULL OR from_subphase_id IS DISTINCT FROM to_subphase_id )
);
CREATE INDEX idx_psd_chantier ON planning_subphase_deps(chantier_id);
CREATE INDEX idx_psd_from_sub ON planning_subphase_deps(from_subphase_id);
CREATE INDEX idx_psd_to_sub ON planning_subphase_deps(to_subphase_id);
CREATE UNIQUE INDEX uniq_psd_edge ON planning_subphase_deps(
  COALESCE(from_lot_id, from_subphase_id), COALESCE(to_lot_id, to_subphase_id)
);

ALTER TABLE lot_subphases ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_subphase_deps ENABLE ROW LEVEL SECURITY;

-- RLS calquée sur lot_dependencies : accès si on possède le chantier. (select auth.uid()) wrappé.
CREATE POLICY "subphases_owner_all" ON lot_subphases
  FOR ALL USING (
    EXISTS (SELECT 1 FROM chantiers c
            WHERE c.id = lot_subphases.chantier_id
              AND c.user_id = (select auth.uid()))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM chantiers c
            WHERE c.id = lot_subphases.chantier_id
              AND c.user_id = (select auth.uid()))
  );

CREATE POLICY "psd_owner_all" ON planning_subphase_deps
  FOR ALL USING (
    EXISTS (SELECT 1 FROM chantiers c
            WHERE c.id = planning_subphase_deps.chantier_id
              AND c.user_id = (select auth.uid()))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM chantiers c
            WHERE c.id = planning_subphase_deps.chantier_id
              AND c.user_id = (select auth.uid()))
  );
```

> Vérifier le vrai nom de la colonne d'ownership de `chantiers` (probablement `user_id`) avant push, et le pattern RLS exact d'une policy existante sur `lot_dependencies`.

**Note `chantier_id` redondant sur `lot_subphases`** : volontaire, évite un join pour la RLS et les filtres (le `lot_id` donne déjà le chantier, mais le dénormaliser simplifie les requêtes et les policies). À garder cohérent à l'insert.

**Vérification** : `npx supabase db push --linked` ; `list_tables` confirme les 2 tables ; insert/select de test via SQL editor sous un user owner et un non-owner (RLS).

**Commit** : `feat(planning): tables lot_subphases + planning_subphase_deps (migration additive)`

---

## Étape 1 — CPM généralisé sur graphe de noeuds (coeur technique)

**Fichiers** : `src/lib/chantier/planningUtils.ts` (extension) + `src/lib/chantier/planningUtils.subphases.test.ts` (nouveau).

**Ne PAS casser** `computePlanningDates` existant (utilisé partout). On AJOUTE une couche.

### Nouveaux types
```ts
type PlanningNode = { id: string; kind: 'lot' | 'subphase'; duree_jours: number; delai_avant_jours: number };
type NodeDepsMap = Map<string, Set<string>>; // nodeId -> set des prédécesseurs nodeId
type NodeId = string; // format "lot:<uuid>" | "sub:<uuid>"
```

### Nouvelle fonction `computeAdvancedPlanning(lots, subphases, lotDeps, subphaseDeps, startDate)`
Algorithme :
1. **Construire les noeuds** : chaque sous-phase → noeud `sub:<id>`. Chaque lot SANS sous-phase → noeud `lot:<id>`. Un lot AVEC sous-phases n'est pas un noeud (conteneur).
2. **Normaliser les arêtes en node→node** :
   - `planning_subphase_deps` : `from`/`to` déjà typés. Si un endpoint est un lot AVEC sous-phases, l'éclater :
     - prédécesseur = un lot avec sous-phases → utiliser **toutes ses sous-phases "finissantes"** (sans successeur interne) comme sources.
     - successeur = un lot avec sous-phases → utiliser ses **sous-phases "de départ"** (sans prédécesseur interne) comme cibles.
   - `lot_dependencies` (lot A → lot B, B dépend de A) : éclater pareil en node→node (source = fin de A, cible = départ de B). Conserve la vue simplifiée et les lots sans sous-phases.
3. **Forward pass** : réutiliser exactement la logique existante (tri Kahn + `addBusinessDays`), mais sur la `NodeDepsMap`.
4. **Reventiler** : noeuds `sub:` → dates des sous-phases ; pour chaque lot AVEC sous-phases : `date_debut = min(subStarts)`, `date_fin = max(subEnds)` ; noeuds `lot:` → dates du lot.

### Aussi : généraliser `computeStartDateFromEnd` (gap revue)
`updateEndDate` (quand le chantier n'a pas démarré) calcule la date de début en remontant la longueur du chemin critique. Avec des sous-phases, le chemin critique passe par le graphe de noeuds. `computeStartDateFromEnd` doit donc consommer le **même graphe unifié**, sinon la date de début "remontée depuis la date de fin souhaitée" sera fausse. Ajouter une variante node-aware + un test dédié.

### Tests (`npx tsx`) — cas obligatoires
- **Régression** : un chantier SANS aucune sous-phase → sorties identiques à `computePlanningDates` actuel (mêmes dates).
- sub→sub même lot (Mise en eau puis Test pression).
- **sub→sub cross-lot** (Électricité après Mise en eau du Plombier) → date Électricité = fin Mise en eau (+ délai).
- lot→lot où les deux ont des sous-phases (le successeur démarre après la dernière sous-phase du prédécesseur).
- lot→lot où un seul a des sous-phases.
- cycle inter-niveaux → ne crashe pas (fallback Kahn).
- dérivation conteneur : `lot.date_fin === max(subphases.date_fin)`.

**Vérification** : `npx tsx src/lib/chantier/planningUtils.subphases.test.ts` (0 régression sur l'existant).

**Commit** : `feat(planning): CPM généralisé multi-niveaux (lots + sous-phases) + tests`

---

## Étape 1bis — Seam d'habilitation premium

**Fichiers** : `src/lib/auth/advancedPlanningAccess.ts` (nouveau) + `src/lib/api/apiHelpers.ts` (garde) + `src/pages/api/gmc/advanced-planning-access.ts` (endpoint lecture pour le client).

- `canUseAdvancedPlanning(userId): Promise<boolean>` — V1 : `true` si admin (table `user_roles`) OU email dans `hasGmcAccess` (beta/allowlist). Stub branchable : un `TODO` clair pour, plus tard, renvoyer `true` aussi si tier d'abonnement GMC ∈ {subscribed, trial_active}. **Ne lit jamais le JWT claim, toujours la DB** (cf. règle anti-bypass du plan paywall).
- `requireAdvancedPlanning(request)` dans `apiHelpers.ts` : `requireAuth` + `canUseAdvancedPlanning` → `403` sinon. Réutilisé par tous les endpoints sous-phases (étape 2).
- Endpoint `GET /api/gmc/advanced-planning-access` → `{ allowed: boolean, reason }` pour que l'UI sache afficher le toggle déverrouillé ou verrouillé. Hook client `useAdvancedPlanningAccess()`.

**Habilités V1** : admin + allowlist. **Demain** : ajouter subscribed + trial_active quand le paywall GMC existe, dans `canUseAdvancedPlanning` uniquement (call sites inchangés).

**Vérification** : test unitaire `advancedPlanningAccess.test.ts` (admin → true, allowlist → true, autre → false). Test API : un user non habilité reçoit 403 sur un POST sous-phase.

**Commit** : `feat(planning): seam d'habilitation premium pour le planning avancé`

---

## Étape 2 — API planning étendue

**Fichier principal** : `src/pages/api/chantier/[id]/planning.ts`.

### GET — enrichir la réponse
Ajouter au payload :
```json
{
  "subphases": { "<lot_id>": [ { id, nom, ordre, duree_jours, delai_avant_jours, date_debut, date_fin, statut, lane_index } ] },
  "subphaseDeps": [ { from_kind, from_id, to_kind, to_id } ]
}
```

### Recompute — basculer sur le graphe unifié
Quand le chantier a au moins une sous-phase, le recompute utilise `computeAdvancedPlanning` et persiste : dates des sous-phases (`lot_subphases`) ET dates dérivées des lots (`lots_chantier`). Sinon, chemin actuel inchangé.

### CRUD sous-phases
Nouveaux endpoints (ou actions dans le PATCH planning, au choix d'implémentation — préférer des routes dédiées pour la clarté) :
- `POST /api/chantier/[id]/lots/[lotId]/subphases` : créer une sous-phase (recompute global après).
- `PATCH /api/chantier/[id]/subphases/[subId]` : maj `nom/duree_jours/delai_avant_jours/lane_index/statut/ordre` (recompute si champ structurel).
- `DELETE /api/chantier/[id]/subphases/[subId]` : suppression + bridge des `planning_subphase_deps` (comme le bridge de `DELETE /lots/[lotId]`).
- `PUT /api/chantier/[id]/subphases/deps` : remplace les dépendances (diff insert-before-delete, comme la gestion `lot_dependencies` actuelle).

**Règles à respecter** :
- Après tout changement structurel : recompute global (sous-phases → dates lots → CPM inter-lots) + persist.
- Invalider `agent_context_cache` (déjà fait dans le PATCH planning).
- Logger dans `chantier_activity` avec le **`lot_id` parent** (pas le sub_id) pour que le journal reste lisible au niveau lot. NE PAS sur-logger les micro-éditions de sous-phase.
- **Ne PAS** faire passer les sous-phases par `inferDefaultPredecessors` (heuristique sur le nom → risque de deps circulaires).
- Auth : `requireChantierAuthOrAgent` comme les autres routes chantier, **+ `requireAdvancedPlanning` (étape 1bis)** sur tous les endpoints CRUD sous-phases → 403 si non habilité premium. Le GET `/planning` peut renvoyer les sous-phases à tout le monde (lecture), c'est l'ÉCRITURE qui est gardée (et l'UI cache le toggle si non habilité).

**Vérification** : tests manuels via `curl`/preview ; créer 2 sous-phases, une dep cross-lot, vérifier les dates renvoyées par GET.

**Commit** : `feat(planning): API CRUD sous-phases + recompute unifié`

---

## Étape 3 — Hook `usePlanning`

**Fichier** : `src/hooks/usePlanning.ts`.

- Étendre `PlanningState` : `subphases: Map<lotId, Subphase[]>`, `subphaseDeps: SubphaseEdge[]`.
- Actions : `addSubphase(lotId, payload)`, `updateSubphase(subId, patch)`, `deleteSubphase(subId)`, `setSubphaseDeps(edges)`.
- **Piège `reqSeqRef`** : le compteur est global. Soit batcher les écritures sous-phase dans un seul appel, soit introduire un `reqSeqRef` dédié au sous-graphe pour éviter que des PATCH concurrents invalident leurs réponses. Recommandation : un seul point d'envoi batché par interaction (comme `applyDragChange`).
- Recompute optimiste local : réutiliser `computeAdvancedPlanning` côté client pour un feedback immédiat (comme `recomputeLocal` actuel).
- Dispatcher `chantierPlanningChanged` après succès (déjà en place) pour rafraîchir la bulle accueil.

**Vérification** : build + smoke test dans la preview (ajout/suppression sous-phase reflété sans F5).

**Commit** : `feat(planning): usePlanning gère les sous-phases (optimiste + anti-rollback)`

---

## Étape 4 — UI : toggle + vue avancée + panneau de découpage

**Fichiers** : `src/components/chantier/cockpit/PlanningChantier.tsx`, `planning/PlanningTimeline.tsx`, nouveau `planning/SubphasePanel.tsx`, réutilisation `cockpit/PanneauDetail.tsx`.

### Toggle Simplifié / Avancé
- Composant toggle dans `PlanningChantier` (header planning). Persistance `localStorage` clé `planning_view_<chantierId>` (`'simple' | 'advanced'`).
- Mode **simplifié** = `PlanningTimeline` actuel, strictement inchangé (zéro régression).
- **Gating premium** : via `useAdvancedPlanningAccess()` (étape 1bis). Si non habilité → le toggle "Avancé" est affiché **verrouillé** (cadenas + CTA "Passer au premium"), le clic n'active pas la vue avancée mais ouvre l'upsell. Le mode simplifié reste accessible à tous. Le gate réel est serveur (l'UI n'est que cosmétique).
- **Widget accueil** (`PlanningWidget`) : reste au niveau lot en V1 (dates conteneur), n'affiche pas les sous-phases. Acté, pas un oubli.

### Mode avancé
- Rendu des sous-phases : un lot avec sous-phases devient "dépliable" (sous-bandes sous la barre du lot, ou sous-barres dans la lane). La barre du lot reste affichée comme conteneur (min→max).
- **Ajouter un `onClick` sur la barre de lot** (n'existe pas aujourd'hui : seulement `onPointerDown` pour le drag). Attention à distinguer clic vs début de drag (seuil de déplacement, ou clic sur une zone dédiée type chevron "découper").
- Le clic ouvre **en bas** un panneau (`SubphasePanel`, socle `PanneauDetail.tsx`) :
  - liste des sous-phases du lot (nom, durée, statut),
  - ajout/suppression/réordonnancement,
  - définition des dépendances (y compris cross-lot : sélecteur de sous-phase d'un autre lot),
  - **prévention des cycles (gap revue)** : avant d'enregistrer une nouvelle dépendance, vérifier qu'elle ne crée pas de cycle dans le graphe de noeuds unifié (lot + sous-phases). Si cycle → refus + message clair ("cette dépendance créerait une boucle"). Ne PAS se reposer uniquement sur le fallback Kahn du CPM (il produit des dates silencieusement fausses).
  - **affichage des statuts des sous-phases (gap revue)** : montrer le statut de chaque sous-phase. Rappel décision V1 : le statut du lot reste manuel (pas de rollup), donc un lot "terminé" peut coexister avec une sous-phase "en cours" — l'afficher explicitement évite que ça paraisse buggé.
  - édition durée/délai.
- D&D des sous-phases : abstraire `handleLotMoveWithLane` pour qu'il opère sur un noeud générique (lot ou sous-phase) → pixel vers `delai_avant_jours`.

### Règles UI (CLAUDE.md)
- Si le panneau crée un layout pleine hauteur : respecter `overflow-hidden` du `<main>` cockpit, pas de `max-h-[calc(100vh-...)]` hardcodé.
- Mobile : si l'UX avancée diverge fortement, pattern `useIsMobile()` + composant dédié (sinon Tailwind responsive). La vue avancée peut rester desktop-first en V1 (le découpage fin est plutôt une action desktop).
- a11y : boutons icon-only du panneau avec `aria-label` + icônes `aria-hidden`, panneau `role="dialog"`/section nommée.

**Vérification** : QA navigateur (skill `qa`) sur preview : toggle, clic barre, ajout sous-phase, dep cross-lot, vérifier que la barre du lot se met à jour (dates dérivées), et que la vue simplifiée est inchangée.

**Commit** : `feat(planning): vue avancée + toggle + panneau de découpage en sous-phases`

---

## Étape 5 — Polissage + doc

- Empty states (`EmptyState`), micro-copy, haptics si actions mobiles.
- **Tracking Amplitude** : `advanced_planning_enabled` (toggle activé), `subphase_created`, `subphase_dep_created`, et `advanced_planning_upsell_shown`/`_clicked` (clic sur le toggle verrouillé). Utile pour mesurer l'adoption ET l'intérêt premium (argument de conversion).
- Revue de code structurée (skill `/revue`) : correctness CPM, RLS, cas limites deps cross-lot, anti-rollback, **gate premium serveur**.
- Mettre à jour la doc : `DOCUMENTATION.md` (nouvelles tables + routes), `FEATURES.md` (feature user-facing), retirer l'entrée de `WIP.md`, et `CLAUDE.md` (pièges : CPM multi-niveaux, reqSeqRef sous-graphe, ne pas passer les sous-phases par inferDefaultPredecessors).
- `WIP.md` : créer l'entrée 🟡 dès le début de l'étape 0.

**Commit** : `docs(planning): documentation sous-phases + features`

---

## Phase 2 (différée, hors V1) — Agent IA

Quand on voudra que l'agent manipule les sous-phases :
- `context.ts` : exposer la hiérarchie (sous-phases sous chaque lot) dans le contexte agent.
- Tools : `update_planning`/`shift_lot`/`arrange_lot` acceptent un node sous-phase ; nouveaux `add_subphase`/`set_subphase_dep` ; `get_chantier_planning` renvoie la hiérarchie.
- Garde anti double-comptage si jamais des budgets descendaient un jour au niveau sous-phase (pas le cas en V1).
- agent-checks : ne PAS itérer les sous-phases (rester au niveau lot) pour éviter la prolifération d'alertes.

---

## Récapitulatif des risques et parades

| Risque | Parade |
|---|---|
| Régression CPM sur l'existant | Test "zéro sous-phase = sorties identiques" obligatoire (étape 1) |
| **Arêtes orphelines à la suppression** (gap revue) | Colonnes FK nullables + `ON DELETE CASCADE` (pas de table polymorphe) → nettoyage auto |
| Cycles inter-niveaux | **Prévention à la création côté UI** (refus + message) + fallback Kahn en filet + test dédié |
| **Contournement du gate premium par l'API** (gap revue) | Gate SERVEUR `requireAdvancedPlanning` sur toutes les écritures sous-phase (l'UI n'est que cosmétique) |
| **`computeStartDateFromEnd` faux avec sous-phases** (gap revue) | Généraliser aussi cette fonction au graphe de noeuds + test |
| `reqSeqRef` global invalide des réponses | Batch unique par interaction ou compteur dédié sous-graphe |
| Dates conteneur incohérentes | Dérivation min/max systématique au recompute + persist |
| Clic vs drag sur la barre | Zone "découper" dédiée (chevron) ou seuil de déplacement |
| Deps circulaires via `inferDefaultPredecessors` | Ne jamais y faire passer les sous-phases |
| Statut lot "terminé" + sous-phase "en cours" | Incohérence assumée V1 (statut manuel) ; afficher les statuts des sous-phases pour la transparence |
| Blast cross-onglets | Garanti nul par l'Option A (lot reste l'unité budget/statut) |
