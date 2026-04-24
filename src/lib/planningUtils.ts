/**
 * Planning utilities — fonctions pures partagées entre frontend et API.
 * Gère le calcul des dates, jours ouvrés, et ordonnancement des lots.
 */
import type { LotChantier } from '@/types/chantier-ia';

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

/** Map des dépendances : lot_id → Set des prédécesseurs */
export type DependencyMap = Map<string, Set<string>>;

/**
 * Recalcule date_debut et date_fin par tri topologique + forward pass.
 *
 * Algorithme CPM (Critical Path Method, multi-parent) :
 * 1. Pour chaque lot, on calcule ses prédécesseurs depuis depsMap
 * 2. Tri topologique (Kahn) : respecte l'ordre des dépendances
 * 3. Forward pass :
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

  const valid = lots.filter(l => l.duree_jours != null && l.duree_jours > 0);
  const invalid = lots.filter(l => l.duree_jours == null || l.duree_jours <= 0);
  const lotById = new Map(valid.map(l => [l.id, l]));

  // Tri topologique (Kahn). Tracks in-degree of chaque lot parmi les valides.
  const inDegree = new Map<string, number>();
  const successors = new Map<string, string[]>();
  for (const lot of valid) {
    inDegree.set(lot.id, 0);
    successors.set(lot.id, []);
  }
  for (const lot of valid) {
    const lotDeps = deps.get(lot.id);
    if (!lotDeps) continue;
    for (const depId of lotDeps) {
      if (!lotById.has(depId)) continue; // dep invalide (lot inexistant) ignorée
      inDegree.set(lot.id, (inDegree.get(lot.id) ?? 0) + 1);
      successors.get(depId)!.push(lot.id);
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
  // Cycles éventuels : lots restants → ajoutés à la fin avec deps ignorées
  for (const lot of valid) if (!topo.includes(lot.id)) topo.push(lot.id);

  // Forward pass : calcule date_debut / date_fin
  const dateMap = new Map<string, { debut: Date; fin: Date }>();
  for (const id of topo) {
    const lot = lotById.get(id)!;
    let earliest = new Date(startDate);
    const lotDeps = deps.get(id);
    if (lotDeps) {
      for (const depId of lotDeps) {
        const depDates = dateMap.get(depId);
        if (depDates && depDates.fin > earliest) earliest = depDates.fin;
      }
    }
    const delay = Math.max(0, lot.delai_avant_jours ?? 0);
    const debut = delay > 0 ? addBusinessDays(earliest, delay) : earliest;
    const fin = addBusinessDays(debut, lot.duree_jours!);
    dateMap.set(id, { debut, fin });
  }

  // Applique les dates aux lots (préserve l'ordre d'entrée)
  const result = lots.map(lot => {
    const dates = dateMap.get(lot.id);
    if (!dates) return lot;
    return {
      ...lot,
      date_debut: dates.debut.toISOString().split('T')[0],
      date_fin: dates.fin.toISOString().split('T')[0],
    };
  });
  return result;
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

/** Génère les labels de semaines (S1, S2...) avec la date de début de chaque semaine */
export function getWeekLabels(startDate: Date, totalWeeks: number): { label: string; date: string }[] {
  const labels: { label: string; date: string }[] = [];
  for (let i = 0; i < totalWeeks; i++) {
    const weekStart = new Date(startDate);
    weekStart.setDate(weekStart.getDate() + i * 7);
    labels.push({
      label: `S${i + 1}`,
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
