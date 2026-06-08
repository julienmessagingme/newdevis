/**
 * Tests — CPM généralisé (sous-phases). Étape 1 du sous-planning.
 * Exécuter : npx tsx src/lib/chantier/planningUtils.subphases.test.ts
 *
 * Couvre : équivalence anti-régression (zéro sous-phase = computePlanningDates),
 * sub→sub même lot, sub→sub cross-lot, lot→lot mixte, cycle, dérivation conteneur,
 * délai sur sous-phase, et computeAdvancedStartDateFromEnd.
 */
import {
  computePlanningDates,
  computeAdvancedPlanning,
  computeStartDateFromEnd,
  computeAdvancedStartDateFromEnd,
  buildAdvancedNodeGraph,
  hasCycleInNodeDeps,
  businessDaysBetween,
  type DependencyMap,
} from './planningUtils';
import type { LotChantier, Subphase, PlanningEdge } from '../../types/chantier-ia';

let passed = 0, failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) passed++;
  else { failed++; console.error('  FAIL: ' + msg); }
}
function eq(a: unknown, b: unknown, msg: string) {
  assert(a === b, `${msg} (got ${String(a)} / expected ${String(b)})`);
}

// ── builders ──────────────────────────────────────────────────────────────────
const lot = (id: string, duree: number | null, extra: Partial<LotChantier> = {}): LotChantier =>
  ({ id, nom: id, statut: 'ok' as LotChantier['statut'], ordre: 0, duree_jours: duree, delai_avant_jours: 0, ...extra });
const sub = (id: string, lot_id: string, duree: number | null, extra: Partial<Subphase> = {}): Subphase =>
  ({ id, lot_id, nom: id, duree_jours: duree, delai_avant_jours: 0, ...extra });
const deps = (pairs: Array<[string, string[]]>): DependencyMap =>
  new Map(pairs.map(([k, v]) => [k, new Set(v)]));
const NODEPS: DependencyMap = new Map();
const eSub = (fromSub: string, toSub: string): PlanningEdge => ({ from_subphase_id: fromSub, to_subphase_id: toSub });
const eLotDependsSub = (fromLot: string, toSub: string): PlanningEdge => ({ from_lot_id: fromLot, to_subphase_id: toSub });
const START = new Date('2026-04-06'); // lundi
const findSub = (r: { subphases: Subphase[] }, id: string) => r.subphases.find(s => s.id === id)!;
const findLot = (r: { lots: LotChantier[] }, id: string) => r.lots.find(l => l.id === id)!;

// ── A. Équivalence anti-régression : zéro sous-phase = computePlanningDates ─────
{
  const scenarios: Array<{ name: string; lots: LotChantier[]; d: DependencyMap }> = [
    { name: 'chaîne A→B→C', lots: [lot('A', 5), lot('B', 3), lot('C', 4)], d: deps([['B', ['A']], ['C', ['B']]]) },
    { name: 'parallèle B,C après A', lots: [lot('A', 5), lot('B', 3), lot('C', 4)], d: deps([['B', ['A']], ['C', ['A']]]) },
    { name: 'multi-parent D←B,C', lots: [lot('A', 5), lot('B', 3), lot('C', 4), lot('D', 2)], d: deps([['B', ['A']], ['C', ['A']], ['D', ['B', 'C']]]) },
    { name: 'avec délai', lots: [lot('A', 5), lot('B', 3, { delai_avant_jours: 2 })], d: deps([['B', ['A']]]) },
    { name: 'lot invalide (duree 0)', lots: [lot('A', 5), lot('B', 0), lot('C', 4)], d: deps([['C', ['A']]]) },
  ];
  for (const sc of scenarios) {
    const simple = computePlanningDates(sc.lots, START, sc.d);
    const adv = computeAdvancedPlanning(sc.lots, [], sc.d, [], START).lots;
    for (let i = 0; i < simple.length; i++) {
      eq(adv[i].date_debut, simple[i].date_debut, `[équiv ${sc.name}] ${simple[i].id} date_debut`);
      eq(adv[i].date_fin, simple[i].date_fin, `[équiv ${sc.name}] ${simple[i].id} date_fin`);
    }
  }
}

// ── B. sub→sub même lot + dérivation conteneur ─────────────────────────────────
{
  const subs = [sub('me', 'P', 3), sub('tp', 'P', 2)];
  const r = computeAdvancedPlanning([lot('P', null)], subs, NODEPS, [eSub('tp', 'me')], START);
  const me = findSub(r, 'me'), tp = findSub(r, 'tp'), P = findLot(r, 'P');
  eq(tp.date_debut, me.date_fin, '[B] tp démarre à la fin de me (FtS)');
  eq(P.date_debut, me.date_debut, '[B] conteneur P.date_debut = min sous-phases');
  eq(P.date_fin, tp.date_fin, '[B] conteneur P.date_fin = max sous-phases');
}

// ── C. sub→sub CROSS-LOT (le cas Électricité / Mise en eau) ────────────────────
{
  const subs = [sub('me', 'P', 3), sub('pose', 'E', 4)];
  const r = computeAdvancedPlanning([lot('P', null), lot('E', null)], subs, NODEPS, [eSub('pose', 'me')], START);
  const me = findSub(r, 'me'), pose = findSub(r, 'pose'), E = findLot(r, 'E');
  eq(pose.date_debut, me.date_fin, '[C] Électricité.pose démarre à la fin de Plombier.me');
  eq(E.date_debut, pose.date_debut, '[C] conteneur E.date_debut = pose.date_debut');
}

// ── D. lot→lot où LES DEUX ont des sous-phases ─────────────────────────────────
{
  const subs = [sub('a1', 'A', 2), sub('a2', 'A', 3), sub('b1', 'B', 2)];
  const r = computeAdvancedPlanning([lot('A', null), lot('B', null)], subs, deps([['B', ['A']]]), [eSub('a2', 'a1')], START);
  const a1 = findSub(r, 'a1'), a2 = findSub(r, 'a2'), b1 = findSub(r, 'b1'), A = findLot(r, 'A'), B = findLot(r, 'B');
  eq(b1.date_debut, a2.date_fin, '[D] B.b1 (entrée) démarre à la sortie de A (a2)');
  eq(A.date_debut, a1.date_debut, '[D] A.date_debut = a1');
  eq(A.date_fin, a2.date_fin, '[D] A.date_fin = a2');
  eq(B.date_debut, b1.date_debut, '[D] B.date_debut = b1');
}

// ── E. lot→lot où UN SEUL a des sous-phases ────────────────────────────────────
{
  // E1 : A sans sous-phase, B (avec sous-phase b1) dépend de A
  const r1 = computeAdvancedPlanning([lot('A', 5), lot('B', null)], [sub('b1', 'B', 2)], deps([['B', ['A']]]), [], START);
  eq(findSub(r1, 'b1').date_debut, findLot(r1, 'A').date_fin, '[E1] b1 démarre à la fin du lot A (sans sous-phase)');

  // E2 : A (avec sous-phase a1) , B sans sous-phase dépend de A
  const r2 = computeAdvancedPlanning([lot('A', null), lot('B', 3)], [sub('a1', 'A', 4)], deps([['B', ['A']]]), [], START);
  eq(findLot(r2, 'B').date_debut, findSub(r2, 'a1').date_fin, '[E2] lot B démarre à la sortie (a1) du lot A');
}

// ── F. Cycle inter-sous-phases : ne crashe pas, produit des dates ───────────────
{
  const subs = [sub('s1', 'X', 2), sub('s2', 'X', 2)];
  let threw = false;
  let r: { subphases: Subphase[] } | null = null;
  try { r = computeAdvancedPlanning([lot('X', null)], subs, NODEPS, [eSub('s1', 's2'), eSub('s2', 's1')], START); }
  catch { threw = true; }
  assert(!threw, '[F] cycle ne lève pas d’exception');
  assert(!!r && findSub(r, 's1').date_debut != null && findSub(r, 's2').date_debut != null, '[F] toutes les sous-phases ont une date malgré le cycle');
}

// ── G. délai sur sous-phase ────────────────────────────────────────────────────
{
  const subs = [sub('me', 'P', 3), sub('tp', 'P', 2, { delai_avant_jours: 2 })];
  const r = computeAdvancedPlanning([lot('P', null)], subs, NODEPS, [eSub('tp', 'me')], START);
  const me = findSub(r, 'me'), tp = findSub(r, 'tp');
  eq(businessDaysBetween(new Date(me.date_fin!), new Date(tp.date_debut!)), 2, '[G] tp démarre 2 jours ouvrés après la fin de me');
}

// ── H. lot dépend de sa PROPRE sous-phase (edge lot→sub interne) ────────────────
// Le CPM ne doit pas boucler : entryNodesOf(lot avec sous-phases) renvoie les
// sous-phases d'entrée, donc l'arête from_lot=L / to_sub=(sous-phase de L) relie
// les entrées de L à cette sous-phase (à éviter à l'API, mais ne doit pas crasher).
{
  const subs = [sub('x1', 'L', 2), sub('x2', 'L', 2)];
  let threw = false;
  try { computeAdvancedPlanning([lot('L', null)], subs, NODEPS, [eLotDependsSub('L', 'x1')], START); }
  catch { threw = true; }
  assert(!threw, '[H] arête lot→sa-propre-sous-phase ne crashe pas');
}

// ── I. computeAdvancedStartDateFromEnd ≡ computeStartDateFromEnd (zéro sous-phase) ─
{
  const lots = [lot('A', 5), lot('B', 3), lot('C', 4)];
  const d = deps([['B', ['A']], ['C', ['B']]]);
  const endDate = new Date('2026-09-30');
  const simple = computeStartDateFromEnd(lots, endDate, d);
  const adv = computeAdvancedStartDateFromEnd(lots, [], d, [], endDate);
  eq(adv.toISOString(), simple.toISOString(), '[I] startDate avancée = simple sans sous-phase');
}

// ── J. Verrou de comportement de computePlanningDates (garde le refactor forwardPass) ─
// Assertions INDÉPENDANTES (durées en jours ouvrés + relations FtS), pour prouver que
// l'extraction de forwardPass n'a pas changé le calcul d'origine.
{
  const lots = [lot('A', 5), lot('B', 3, { delai_avant_jours: 2 }), lot('C', 4)];
  const d = deps([['B', ['A']], ['C', ['A']]]);
  const r = computePlanningDates(lots, START, d);
  const A = r.find(l => l.id === 'A')!, B = r.find(l => l.id === 'B')!, C = r.find(l => l.id === 'C')!;
  // A démarre à la startDate (aucun délai, aucun prédécesseur)
  eq(businessDaysBetween(START, new Date(A.date_debut!)), 0, '[J] A démarre à startDate');
  eq(businessDaysBetween(new Date(A.date_debut!), new Date(A.date_fin!)), 5, '[J] A dure 5 j ouvrés');
  // B dépend de A + délai 2 : debut = A.fin + 2 j ouvrés
  eq(businessDaysBetween(new Date(A.date_fin!), new Date(B.date_debut!)), 2, '[J] B démarre 2 j après A (délai)');
  eq(businessDaysBetween(new Date(B.date_debut!), new Date(B.date_fin!)), 3, '[J] B dure 3 j ouvrés');
  // C dépend de A sans délai : debut = A.fin
  eq(C.date_debut, A.date_fin, '[J] C démarre à la fin de A (FtS, parallèle à B)');
  eq(businessDaysBetween(new Date(C.date_debut!), new Date(C.date_fin!)), 4, '[J] C dure 4 j ouvrés');
}

// ── K. Détection de cycle (garde API) ─────────────────────────────────────────
{
  const cyc = (lots: LotChantier[], subs: Subphase[], d: DependencyMap, edges: PlanningEdge[]) => {
    const g = buildAdvancedNodeGraph(lots, subs, d, edges);
    return hasCycleInNodeDeps(g.nodeDeps, g.nodes.map(n => n.id));
  };
  // pas de cycle : chaîne sub→sub
  assert(!cyc([lot('P', null)], [sub('me', 'P', 3), sub('tp', 'P', 2)], NODEPS, [eSub('tp', 'me')]), '[K] chaîne sans cycle');
  // cycle direct sub↔sub
  assert(cyc([lot('X', null)], [sub('s1', 'X', 2), sub('s2', 'X', 2)], NODEPS, [eSub('s1', 's2'), eSub('s2', 's1')]), '[K] cycle direct détecté');
  // cycle CROSS-NIVEAU : a1 dépend de b1 (edge) ET lot B dépend de lot A (lotDep) → b1 dépend de a1
  assert(
    cyc([lot('A', null), lot('B', null)], [sub('a1', 'A', 2), sub('b1', 'B', 2)], deps([['B', ['A']]]), [eSub('a1', 'b1')]),
    '[K] cycle cross-niveau (edge + lotDep) détecté',
  );
  // pas de cycle : lots simples sans sous-phase, chaîne lot→lot
  assert(!cyc([lot('A', 3), lot('B', 2)], [], deps([['B', ['A']]]), []), '[K] lot→lot simple sans cycle');
}

// ── résumé ──────────────────────────────────────────────────────────────────────
console.log(`\nplanningUtils.subphases.test — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
