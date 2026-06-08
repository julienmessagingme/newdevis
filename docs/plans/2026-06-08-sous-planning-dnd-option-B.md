# Plan — Option B : Gantt unifié draggable (D&D des sous-phases)

> Date : 2026-06-08. Suite de la feature sous-planning (étapes 0-5 livrées). Décision : **Option B** — fusionner la vue avancée dans le Gantt existant (`PlanningTimeline`), avec sous-phases en sous-barres **draggables**, en généralisant le moteur D&D actuel. UN seul moteur, UX cohérente.

## Principe

- La vue **Simplifié** (`advanced=false`) reste **byte-identique** : tout le code nouveau est court-circuité quand `advanced=false`. C'est la garantie anti-régression n°1.
- La vue **Avancé** = le MÊME Gantt (grille semaines, zoom, header, `getBarStyle`, lanes), avec sous l'éventail de chaque lot ses **sous-phases en sous-barres**, draggables comme les lots.
- Réutilise `SubphasePanel` (clic sur un lot → panneau de découpage en bas).
- `SubPlanningView` (vue % séparée) est **retirée** une fois B1 en place (plus de divergence).

## Découpage en 3 incréments (chacun commit + build + revue)

### B1 — Rendu unifié (sous-barres lecture seule) + intégration toggle
**But** : voir les sous-phases sur le vrai Gantt (axe dates + zoom), sans drag encore. Déjà un gros gain UX vs la liste %.

- `PlanningChantier` : rend TOUJOURS `<PlanningTimeline advanced={advancedActive} />` (le toggle + gating premium restent ici, déjà faits). Retire le rendu de `SubPlanningView`.
- `PlanningTimeline` :
  - destructure `subphases`, `subphaseDeps`, `addSubphase`, `updateSubphase`, `deleteSubphase`, `addSubphaseDep`, `removeSubphaseDep` de `usePlanning`.
  - prop `advanced?: boolean`.
  - groupe les sous-phases par lot (`subsByLot`).
  - **rendu** : pour chaque lane, après la barre du lot, si `advanced` et lot a des sous-phases → rendre des **sous-rangs** (sous-barres positionnées par `getBarStyle` sur les dates de la sous-phase, couleur du lot atténuée). Ces sous-rangs sont dans la même zone scrollable (même grille).
  - **clic sur la barre d'un lot** (mode avancé) → `selectedLotId` → `SubphasePanel` rendu SOUS le Gantt. Distinguer clic vs drag : seuil de déplacement (si `deltaDays===0 && pas de changement de lane` au pointerup → c'est un clic) OU un petit bouton « découper » dédié dans la colonne nom (plus sûr). **Choix : bouton dédié** pour ne pas perturber le drag des lots.
- **Garde** : `advanced=false` → aucun sous-rang, aucun clic-panel. Strictement l'actuel.
- **Tests** : visuels (QA navigateur). Pas de nouvelle logique pure.

### B2 — Sous-barres draggables (timing : durée + délai)
**But** : resize d'une sous-barre = change sa durée ; drag horizontal = change son `delai_avant_jours`. Pas encore de réécriture de dépendances.

- Généraliser `GanttBar` pour accepter un « nœud » (`{ id, nom, emoji?, duree_jours, date_debut, date_fin }`) au lieu d'un `LotChantier` strict, + callbacks `onResize`/`onMove` génériques.
- Sous-barre : `onResize(deltaDays)` → `updateSubphase(subId, { duree_jours: max(1, duree+delta) })`. `onMove(deltaDays)` (sans changement de lane pour l'instant) → convertir en `delai_avant_jours` (même calcul pixel→jours ouvrés que `handleLotMoveWithLane`, extrait en helper).
- Optimisme : le hook `updateSubphase` est non-optimiste (refetch). Pour un drag fluide, ajouter un recompute optimiste local côté `usePlanning` (réutiliser `computeAdvancedPlanning`) — sinon la sous-barre « saute » après le refetch. **Sous-tâche** : ajouter `applySubphaseTimingOptimistic` au hook.
- **Tests** : pixel→delai déjà couvert pour les lots ; ajouter des cas sous-phase.

### B3 — Drag pour créer/réécrire les dépendances de sous-phases (le plus dur)
**But** : déposer une sous-phase après une autre (même lot OU autre lot) crée/réécrit l'arête `planning_subphase_deps`.

- Généraliser `handleLotMoveWithLane` en `handleNodeMove` opérant sur un graphe de nœuds (`lot:`/`sub:`) + arêtes mixtes. Réutilise déjà `buildAdvancedNodeGraph` (backend) — porter la logique de réécriture (transfert des successeurs, rebind, calcul délai) au niveau nœud côté client.
- Détection de lane : les sous-rangs portent `data-node-id` + `data-lot-id` ; le drop résout la cible (sous-phase prédécesseur) → `addSubphaseDep({ from_subphase_id: dragged, to_subphase_id|to_lot_id: target })`.
- **Garde anti-cycle** : déjà serveur (`wouldCreateCycle` → 409) ; afficher le refus. Optionnel : pré-check client pour un feedback immédiat.
- **Tests** : nouveaux cas drag→edge (création, rewire, refus cycle).

## Risques & garde-fous

- **Régression vue simplifiée** : tout le neuf derrière `if (advanced)`. Tester : `advanced=false` = Gantt identique pixel.
- **Drag lot vs drag sous-phase** : deux niveaux de barres dans la même zone scrollable → bien séparer les handlers (les sous-barres ont leur propre `onMove`/`onResize` qui ne déclenchent PAS `handleLotMoveWithLane`).
- **Lanes des sous-phases** : V1 = une sous-phase par sous-rang (pas de first-fit complexe entre sous-phases parallèles d'un même lot). Le parallélisme intra-lot viendra après si besoin.
- **QA navigateur OBLIGATOIRE** à chaque incrément (la qualité du D&D est visuelle/interactive — non vérifiable en headless). Idéalement test live par Julien (premium-gated à son compte).
- **`reqSeqRef`** : le drag optimiste de sous-phase (B2) doit passer par le même mécanisme anti-rollback que les lots.

## Ordre recommandé

B1 (visuel unifié, faible risque, gros gain UX) → QA → B2 (drag timing) → QA → B3 (drag dépendances, le plus dur) → QA. Chaque incrément est livrable indépendamment ; on peut s'arrêter après B1 ou B2 et garder le panneau pour le reste.
