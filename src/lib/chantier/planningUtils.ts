/**
 * Planning utilities — fonctions pures partagées entre frontend et API.
 * Gère le calcul des dates, jours ouvrés, et ordonnancement des lots.
 */
import type { LotChantier, Subphase, PlanningEdge } from '@/types/chantier-ia';

// ── Estimation automatique pour lots sans données planning ────────────────────

/** Durées moyennes par métier (jours ouvrés). Clé = mot-clé dans le nom du lot. */
const TRADE_DURATIONS: [RegExp, number, number][] = [
  // [pattern, duree_jours, ordre dans la séquence BTP]
  [/démol|dépose|démont/i,          3,  1],
  [/maçon|gros.?œuvre|fondation/i, 15,  2],
  [/charpent|ossature/i,           10,  3],
  [/couvreur|toiture|couverture/i,  8,  4],
  [/étanch/i,                       5,  5],
  [/menuiseri.*ext|fenêtre|baie|volet/i, 5, 6],
  [/plomb|sanitaire/i,              8,  7],
  [/électri|câblage/i,              8,  7],  // parallèle avec plombier
  [/chauffag|clim|pompe.*chaleur/i, 5,  7],  // parallèle aussi
  [/plaquis|cloison|plâtr|doublage/i, 10, 8],
  [/carrel|faïence/i,               8,  9],
  [/peint|enduit.*int|ravalement/i,  8, 10],
  [/menuiseri.*int|cuisine|dressing|placard/i, 5, 11],
  [/sol.*souple|parquet|stratifié/i, 5, 10],
  [/terrass/i,                       5,  2],
  [/piscin/i,                       15,  3],
  [/jardin|paysag|clôture/i,        5, 12],
  [/nettoyage|fin.*chantier/i,      2, 13],
  [/architect|maîtri/i,             3,  0],
  [/façad/i,                         8,  6],
  [/isol/i,                          8,  5],
];

/**
 * Pour des lots sans duree_jours / ordre_planning, estime des valeurs raisonnables
 * basées sur le nom du lot (détection du métier).
 * Retourne les lots enrichis (les lots déjà renseignés restent inchangés).
 */
export function estimateMissingPlanningData(lots: LotChantier[]): LotChantier[] {
  // Dans le modèle CPM, on remplit juste les durées manquantes. Les
  // dépendances sont gérées par la table lot_dependencies.
  return lots.map(lot => {
    if (lot.duree_jours != null && lot.duree_jours > 0) return lot;
    const nom = (lot.nom ?? '') + ' ' + (lot.role ?? '') + ' ' + (lot.job_type ?? '');
    let duree = 5;
    for (const [pattern, d] of TRADE_DURATIONS) {
      if (pattern.test(nom)) { duree = d; break; }
    }
    return { ...lot, duree_jours: lot.duree_jours ?? duree };
  });
}

/**
 * Heuristique "première dépendance" pour un nouveau lot sans prédécesseur.
 * Utilisée au backfill/création : cherche un lot cohérent métier pour en faire
 * son prédécesseur. Basé sur TRADE_DURATIONS (ordres métier standard).
 */
export function inferDefaultPredecessors(
  newLot: LotChantier,
  existingLots: LotChantier[],
): string[] {
  const nom = (newLot.nom ?? '') + ' ' + (newLot.role ?? '') + ' ' + (newLot.job_type ?? '');
  let myOrder: number | null = null;
  for (const [pattern, , o] of TRADE_DURATIONS) {
    if (pattern.test(nom)) { myOrder = o; break; }
  }
  if (myOrder == null) return [];
  // Predecessors candidats = lots avec TRADE order < mon order, plus proche d'abord
  const candidates: Array<{ id: string; order: number }> = [];
  for (const l of existingLots) {
    if (l.id === newLot.id) continue;
    const lnom = (l.nom ?? '') + ' ' + (l.role ?? '') + ' ' + (l.job_type ?? '');
    for (const [pattern, , o] of TRADE_DURATIONS) {
      if (pattern.test(lnom)) {
        if (o < myOrder) candidates.push({ id: l.id, order: o });
        break;
      }
    }
  }
  if (candidates.length === 0) return [];
  // Prend tous les prédécesseurs IMMÉDIATS (max order parmi les candidats)
  const maxOrder = Math.max(...candidates.map(c => c.order));
  return candidates.filter(c => c.order === maxOrder).map(c => c.id);
}

// ── Jours ouvrés ──────────────────────────────────────────────────────────────

/** Ajoute N jours ouvrés à une date (skip samedi/dimanche) */
export function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

/** Nombre de jours ouvrés entre 2 dates (exclusif de start, inclusif de end) */
export function businessDaysBetween(start: Date, end: Date): number {
  let count = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

// ── Calcul du planning (CPM : DAG + tri topologique) ─────────────────────────

/** Map des dépendances : id → Set des prédécesseurs. Le même type sert pour les
 *  lots (lot_id → preds) et pour le graphe de noeuds avancé (nodeId → preds). */
export type DependencyMap = Map<string, Set<string>>;
/** Alias sémantique pour le graphe de noeuds (lot:<id> | sub:<id>). */
export type NodeDepsMap = Map<string, Set<string>>;

/** Noeud minimal consommé par le forward pass (lot ou sous-phase). */
interface CpmNode {
  id: string;
  duree_jours?: number | null;
  delai_avant_jours?: number | null;
}

const toIso = (d: Date): string => d.toISOString().split('T')[0];

/**
 * Coeur CPM : tri topologique (Kahn) + forward pass sur un graphe de noeuds
 * générique. Partagé par computePlanningDates (lots seuls) et
 * computeAdvancedPlanning (lots + sous-phases). NE PAS dupliquer cette logique.
 *
 * - Filtre les noeuds invalides (duree_jours <= 0 / null) : ils n'obtiennent pas
 *   de dates (renvoyés tels quels par les appelants).
 * - Forward pass : debut = max(startDate, max(fin des prédécesseurs)) + delai ;
 *   fin = debut + duree_jours. Tout en jours ouvrés.
 * - Cycles : les noeuds restants sont ajoutés en fin de tri (défaut sûr — les
 *   cycles doivent être empêchés en amont côté API/UI).
 */
function forwardPass(
  nodes: CpmNode[],
  deps: NodeDepsMap,
  startDate: Date,
): Map<string, { debut: Date; fin: Date }> {
  const valid = nodes.filter(n => n.duree_jours != null && n.duree_jours > 0);
  const nodeById = new Map(valid.map(n => [n.id, n]));

  const inDegree = new Map<string, number>();
  const successors = new Map<string, string[]>();
  for (const n of valid) {
    inDegree.set(n.id, 0);
    successors.set(n.id, []);
  }
  for (const n of valid) {
    const nDeps = deps.get(n.id);
    if (!nDeps) continue;
    for (const depId of nDeps) {
      if (!nodeById.has(depId)) continue; // prédécesseur invalide/inexistant ignoré
      inDegree.set(n.id, (inDegree.get(n.id) ?? 0) + 1);
      successors.get(depId)!.push(n.id);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) if (deg === 0) queue.push(id);
  const topo: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    topo.push(id);
    for (const succ of successors.get(id) ?? []) {
      const d = (inDegree.get(succ) ?? 0) - 1;
      inDegree.set(succ, d);
      if (d === 0) queue.push(succ);
    }
  }
  for (const n of valid) if (!topo.includes(n.id)) topo.push(n.id);

  const dateMap = new Map<string, { debut: Date; fin: Date }>();
  for (const id of topo) {
    const node = nodeById.get(id)!;
    let earliest = new Date(startDate);
    const nDeps = deps.get(id);
    if (nDeps) {
      for (const depId of nDeps) {
        const depDates = dateMap.get(depId);
        if (depDates && depDates.fin > earliest) earliest = depDates.fin;
      }
    }
    const delay = Math.max(0, node.delai_avant_jours ?? 0);
    const debut = delay > 0 ? addBusinessDays(earliest, delay) : earliest;
    const fin = addBusinessDays(debut, node.duree_jours!);
    dateMap.set(id, { debut, fin });
  }
  return dateMap;
}

/**
 * Recalcule date_debut et date_fin des lots par tri topologique + forward pass.
 *
 * Algorithme CPM (Critical Path Method, multi-parent) :
 *    date_debut(L) = max(startDate, max(dep.date_fin pour dep ∈ deps(L))) + delai_avant_jours
 *    date_fin(L)   = date_debut(L) + duree_jours
 *
 * Les lots sans prédécesseurs démarrent à startDate. Les lots avec cycle sont
 * placés à startDate (défaut sûr — cycles devraient être empêchés côté API).
 */
export function computePlanningDates(
  lots: LotChantier[],
  startDate: Date,
  depsMap?: DependencyMap,
): LotChantier[] {
  const deps = depsMap ?? new Map<string, Set<string>>();
  const dateMap = forwardPass(lots, deps, startDate);
  return lots.map(lot => {
    const dates = dateMap.get(lot.id);
    if (!dates) return lot;
    return { ...lot, date_debut: toIso(dates.debut), date_fin: toIso(dates.fin) };
  });
}

/**
 * CPM avancé : calcule les dates sur un graphe unifié lots + sous-phases.
 *
 * - Un lot SANS sous-phase = un noeud `lot:<id>` (comportement identique au CPM simple).
 * - Un lot AVEC sous-phases = un conteneur : ses sous-phases sont les noeuds `sub:<id>`,
 *   et les dates du lot sont DÉRIVÉES (date_debut = min des sous-phases, date_fin = max).
 * - Les arêtes (PlanningEdge, convention from = dépendant / to = prédécesseur) sont
 *   normalisées en arêtes noeud→noeud. Un endpoint "lot avec sous-phases" est éclaté
 *   sur ses sous-phases de bord : entrée (sans prédécesseur interne) côté dépendant,
 *   sortie (sans successeur interne) côté prédécesseur.
 * - Les lot_dependencies (lot→lot) sont fusionnées dans le même graphe → un lot→lot
 *   où les deux ont des sous-phases relie sortie(préd) → entrée(succ).
 *
 * Sans aucune sous-phase, le résultat est STRICTEMENT identique à computePlanningDates
 * (cf. test d'équivalence anti-régression).
 */
export function computeAdvancedPlanning(
  lots: LotChantier[],
  subphases: Subphase[],
  lotDeps: DependencyMap,
  edges: PlanningEdge[],
  startDate: Date,
): { lots: LotChantier[]; subphases: Subphase[] } {
  const { nodes, nodeDeps } = buildAdvancedNodeGraph(lots, subphases, lotDeps, edges);

  const LOT = (id: string) => `lot:${id}`;
  const SUB = (id: string) => `sub:${id}`;
  const subsByLot = new Map<string, Subphase[]>();
  for (const s of subphases) {
    if (!subsByLot.has(s.lot_id)) subsByLot.set(s.lot_id, []);
    subsByLot.get(s.lot_id)!.push(s);
  }
  const lotHasSubs = (lotId: string) => (subsByLot.get(lotId)?.length ?? 0) > 0;

  const dateMap = forwardPass(nodes, nodeDeps, startDate);

  const outSubphases = subphases.map(s => {
    const dt = dateMap.get(SUB(s.id));
    return dt ? { ...s, date_debut: toIso(dt.debut), date_fin: toIso(dt.fin) } : s;
  });

  // Dérivation des dates conteneur (lot avec sous-phases = min/max de ses sous-phases).
  const subDatesByLot = new Map<string, { debut: Date; fin: Date }[]>();
  for (const s of subphases) {
    const dt = dateMap.get(SUB(s.id));
    if (!dt) continue;
    if (!subDatesByLot.has(s.lot_id)) subDatesByLot.set(s.lot_id, []);
    subDatesByLot.get(s.lot_id)!.push(dt);
  }
  const outLots = lots.map(lot => {
    if (lotHasSubs(lot.id)) {
      const dts = subDatesByLot.get(lot.id);
      if (!dts || dts.length === 0) return lot;
      const debut = new Date(Math.min(...dts.map(d => d.debut.getTime())));
      const fin = new Date(Math.max(...dts.map(d => d.fin.getTime())));
      return { ...lot, date_debut: toIso(debut), date_fin: toIso(fin) };
    }
    const dt = dateMap.get(LOT(lot.id));
    return dt ? { ...lot, date_debut: toIso(dt.debut), date_fin: toIso(dt.fin) } : lot;
  });

  return { lots: outLots, subphases: outSubphases };
}

/**
 * Construit le graphe de noeuds unifié (lot:<id> / sub:<id>) + la map de
 * dépendances noeud→noeud. Partagé par computeAdvancedPlanning (calcul des dates)
 * et hasCycleInNodeDeps (garde anti-cycle de l'API) → une seule source de vérité
 * pour l'éclatement entrée/sortie d'un lot avec sous-phases.
 */
export function buildAdvancedNodeGraph(
  lots: LotChantier[],
  subphases: Subphase[],
  lotDeps: DependencyMap,
  edges: PlanningEdge[],
): { nodes: CpmNode[]; nodeDeps: NodeDepsMap } {
  const LOT = (id: string) => `lot:${id}`;
  const SUB = (id: string) => `sub:${id}`;

  const subsByLot = new Map<string, Subphase[]>();
  for (const s of subphases) {
    if (!subsByLot.has(s.lot_id)) subsByLot.set(s.lot_id, []);
    subsByLot.get(s.lot_id)!.push(s);
  }
  const lotHasSubs = (lotId: string) => (subsByLot.get(lotId)?.length ?? 0) > 0;
  const subById = new Map(subphases.map(s => [s.id, s] as const));
  const sameLot = (a: string, b: string) => subById.get(a)?.lot_id === subById.get(b)?.lot_id;

  // Noeuds : lots sans sous-phase + toutes les sous-phases.
  const nodes: CpmNode[] = [];
  for (const lot of lots) {
    if (!lotHasSubs(lot.id)) {
      nodes.push({ id: LOT(lot.id), duree_jours: lot.duree_jours, delai_avant_jours: lot.delai_avant_jours });
    }
  }
  for (const s of subphases) {
    nodes.push({ id: SUB(s.id), duree_jours: s.duree_jours, delai_avant_jours: s.delai_avant_jours });
  }

  // Bords internes d'un lot : entrée = sans prédécesseur DU MÊME LOT ;
  // sortie = sans successeur DU MÊME LOT.
  const hasInternalPred = new Set<string>();
  const hasInternalSucc = new Set<string>();
  for (const e of edges) {
    if (e.from_subphase_id && e.to_subphase_id && sameLot(e.from_subphase_id, e.to_subphase_id)) {
      hasInternalPred.add(e.from_subphase_id); // from dépend de to (même lot)
      hasInternalSucc.add(e.to_subphase_id);
    }
  }
  const entryNodesOf = (lotId: string): string[] =>
    lotHasSubs(lotId)
      ? subsByLot.get(lotId)!.filter(s => !hasInternalPred.has(s.id)).map(s => SUB(s.id))
      : [LOT(lotId)];
  const exitNodesOf = (lotId: string): string[] =>
    lotHasSubs(lotId)
      ? subsByLot.get(lotId)!.filter(s => !hasInternalSucc.has(s.id)).map(s => SUB(s.id))
      : [LOT(lotId)];

  // Endpoint -> noeud(s). Côté dépendant un lot s'éclate sur ses entrées ; côté
  // prédécesseur un lot s'éclate sur ses sorties. Une sous-phase reste elle-même.
  const dependentNodes = (lotId?: string | null, subId?: string | null): string[] =>
    subId ? [SUB(subId)] : lotId ? entryNodesOf(lotId) : [];
  const dependencyNodes = (lotId?: string | null, subId?: string | null): string[] =>
    subId ? [SUB(subId)] : lotId ? exitNodesOf(lotId) : [];

  const nodeDeps: NodeDepsMap = new Map();
  const addEdge = (dependent: string, dependency: string) => {
    if (dependent === dependency) return;
    if (!nodeDeps.has(dependent)) nodeDeps.set(dependent, new Set());
    nodeDeps.get(dependent)!.add(dependency);
  };
  // 1. Arêtes impliquant >= 1 sous-phase
  for (const e of edges) {
    const deps = dependencyNodes(e.to_lot_id, e.to_subphase_id);
    const dependents = dependentNodes(e.from_lot_id, e.from_subphase_id);
    for (const dn of dependents) for (const pn of deps) addEdge(dn, pn);
  }
  // 2. lot_dependencies (lot→lot) fusionnées : lotId dépend de predId
  for (const [lotId, preds] of lotDeps) {
    for (const predId of preds) {
      for (const dn of entryNodesOf(lotId)) for (const pn of exitNodesOf(predId)) addEdge(dn, pn);
    }
  }
  return { nodes, nodeDeps };
}

/**
 * Détecte un cycle dans le graphe de noeuds (Kahn : si le tri topologique ne
 * consomme pas tous les noeuds → cycle). Utilisé par la garde anti-cycle de l'API
 * avant d'enregistrer une nouvelle dépendance de sous-phase.
 */
export function hasCycleInNodeDeps(nodeDeps: NodeDepsMap, nodeIds: string[]): boolean {
  const idSet = new Set(nodeIds);
  const inDeg = new Map<string, number>();
  const succ = new Map<string, string[]>();
  for (const id of nodeIds) { inDeg.set(id, 0); succ.set(id, []); }
  for (const id of nodeIds) {
    const preds = nodeDeps.get(id);
    if (!preds) continue;
    for (const p of preds) {
      if (!idSet.has(p)) continue;
      inDeg.set(id, (inDeg.get(id) ?? 0) + 1);
      succ.get(p)!.push(id);
    }
  }
  const queue: string[] = nodeIds.filter(id => (inDeg.get(id) ?? 0) === 0);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift()!;
    visited++;
    for (const s of succ.get(id) ?? []) {
      const d = (inDeg.get(s) ?? 0) - 1;
      inDeg.set(s, d);
      if (d === 0) queue.push(s);
    }
  }
  return visited < nodeIds.length;
}

/**
 * Calcul inverse : à partir d'une date de fin souhaitée, remonte en arrière
 * pour calculer la startDate nécessaire. Utilise le DAG pour trouver la durée
 * du chemin critique (longueur totale du plus long chemin dans le graph).
 */
export function computeStartDateFromEnd(
  lots: LotChantier[],
  endDate: Date,
  depsMap?: DependencyMap,
): Date {
  // Calcule les dates en partant d'aujourd'hui comme repère, puis prend la
  // plus tardive (= chemin critique). La durée critique = latest_fin - repère.
  const repere = new Date('2000-01-01');
  const computed = computePlanningDates(lots, repere, depsMap);
  let maxFin = repere;
  for (const l of computed) {
    if (l.date_fin) {
      const f = new Date(l.date_fin);
      if (f > maxFin) maxFin = f;
    }
  }
  const criticalDays = businessDaysBetween(repere, maxFin);
  return subtractBusinessDays(endDate, criticalDays);
}

/**
 * Variante avancée de computeStartDateFromEnd : remonte la startDate nécessaire en
 * tenant compte du graphe unifié lots + sous-phases (le chemin critique peut passer
 * par les sous-phases). Les dates conteneur des lots dérivent du min/max des sous-phases,
 * donc le max sur `computed.lots` couvre l'ensemble du graphe.
 */
export function computeAdvancedStartDateFromEnd(
  lots: LotChantier[],
  subphases: Subphase[],
  lotDeps: DependencyMap,
  edges: PlanningEdge[],
  endDate: Date,
): Date {
  const repere = new Date('2000-01-01');
  const { lots: computed } = computeAdvancedPlanning(lots, subphases, lotDeps, edges, repere);
  let maxFin = repere;
  for (const l of computed) {
    if (l.date_fin) {
      const f = new Date(l.date_fin);
      if (f > maxFin) maxFin = f;
    }
  }
  const criticalDays = businessDaysBetween(repere, maxFin);
  return subtractBusinessDays(endDate, criticalDays);
}

/** Soustrait N jours ouvrés d'une date (skip weekends) */
export function subtractBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let removed = 0;
  while (removed < days) {
    result.setDate(result.getDate() - 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) removed++;
  }
  return result;
}

// ── Formatage ─────────────────────────────────────────────────────────────────

/** "2 semaines", "3 jours", "1 semaine et 2 jours" */
export function formatDuration(days: number): string {
  if (days <= 0) return '—';
  const weeks = Math.floor(days / 5);
  const remaining = days % 5;

  if (weeks === 0) return `${remaining} jour${remaining > 1 ? 's' : ''}`;
  if (remaining === 0) return `${weeks} semaine${weeks > 1 ? 's' : ''}`;
  return `${weeks} sem. et ${remaining}j`;
}

/** Numéro de semaine relative (S1, S2...) depuis la date de début du chantier */
export function getWeekNumber(date: Date, startDate: Date): number {
  const diffMs = date.getTime() - startDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
}

/** Nombre total de semaines couvertes par le planning */
export function getTotalWeeks(lots: LotChantier[]): number {
  const withDates = lots.filter(l => l.date_debut && l.date_fin);
  if (withDates.length === 0) return 0;

  const starts = withDates.map(l => new Date(l.date_debut!).getTime());
  const ends = withDates.map(l => new Date(l.date_fin!).getTime());

  const earliest = Math.min(...starts);
  const latest = Math.max(...ends);
  const diffDays = Math.ceil((latest - earliest) / (1000 * 60 * 60 * 24));

  return Math.ceil(diffDays / 7) || 1;
}

/** Numéro de semaine ISO 8601 (1-53). Semaine 1 = celle qui contient le 1er jeudi de l'année.
 *  Aligné avec les calendriers FR/UE/Outlook (lundi = début de semaine). */
export function isoWeekNumber(d: Date): number {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = target.getUTCDay() === 0 ? 7 : target.getUTCDay(); // 1..7 (lundi=1)
  target.setUTCDate(target.getUTCDate() + 4 - dayNum); // jeudi de la semaine ISO
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/** Génère les labels de semaines avec numéro ISO (S27, S28…) + date de début de semaine.
 *  Avant : numérotation 1-based interne au chantier (S1, S2…) — incohérent avec un calendrier
 *  Outlook où chaque semaine a son numéro ISO unique. */
export function getWeekLabels(startDate: Date, totalWeeks: number): { label: string; date: string }[] {
  const labels: { label: string; date: string }[] = [];
  for (let i = 0; i < totalWeeks; i++) {
    const weekStart = new Date(startDate);
    weekStart.setDate(weekStart.getDate() + i * 7);
    labels.push({
      label: `S${isoWeekNumber(weekStart)}`,
      date: weekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
    });
  }
  return labels;
}

/** Parse une date ISO string en Date (safe, retourne null si invalide) */
export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
