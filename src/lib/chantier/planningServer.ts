/**
 * Helpers serveur du planning (lecture/écriture DB). Séparé de planningUtils.ts
 * (fonctions pures) pour garder ces dernières testables sans Supabase.
 *
 * recomputeChantierDates est subphase-aware : SANS sous-phase il reproduit
 * STRICTEMENT l'ancien recompute inline de planning.ts (computePlanningDates +
 * estimation des durées manquantes). AVEC sous-phases il bascule sur le CPM avancé
 * et persiste les dates des lots (dérivées) ET des sous-phases.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  estimateMissingPlanningData,
  computePlanningDates,
  computeAdvancedPlanning,
  buildAdvancedNodeGraph,
  hasCycleInNodeDeps,
  type DependencyMap,
} from '@/lib/chantier/planningUtils';
import type { LotChantier, Subphase, PlanningEdge } from '@/types/chantier-ia';

export interface SubphaseDepRow extends PlanningEdge {
  id?: string;
}

const SUBPHASE_SELECT =
  'id, lot_id, chantier_id, nom, ordre, duree_jours, delai_avant_jours, date_debut, date_fin, statut, lane_index';
const DEP_SELECT = 'id, from_lot_id, from_subphase_id, to_lot_id, to_subphase_id';

export async function loadLotDependencies(supabase: SupabaseClient, lotIds: string[]): Promise<DependencyMap> {
  const deps = new Map<string, Set<string>>();
  if (lotIds.length === 0) return deps;
  const { data } = await supabase.from('lot_dependencies').select('lot_id, depends_on_id').in('lot_id', lotIds);
  for (const row of (data ?? []) as Array<{ lot_id: string; depends_on_id: string }>) {
    if (!deps.has(row.lot_id)) deps.set(row.lot_id, new Set());
    deps.get(row.lot_id)!.add(row.depends_on_id);
  }
  return deps;
}

export async function loadSubphases(supabase: SupabaseClient, chantierId: string): Promise<Subphase[]> {
  const { data } = await supabase
    .from('lot_subphases')
    .select(SUBPHASE_SELECT)
    .eq('chantier_id', chantierId)
    .order('ordre', { ascending: true });
  return (data ?? []) as Subphase[];
}

export async function loadSubphaseDeps(supabase: SupabaseClient, chantierId: string): Promise<SubphaseDepRow[]> {
  const { data } = await supabase
    .from('planning_subphase_deps')
    .select(DEP_SELECT)
    .eq('chantier_id', chantierId);
  return (data ?? []) as SubphaseDepRow[];
}

/** startDate du chantier (date_debut_chantier) ou null si non démarré. */
export async function getChantierStartDate(supabase: SupabaseClient, chantierId: string): Promise<Date | null> {
  const { data } = await supabase
    .from('chantiers')
    .select('date_debut_chantier')
    .eq('id', chantierId)
    .single();
  return data?.date_debut_chantier ? new Date(data.date_debut_chantier as string) : null;
}

/**
 * Recalcule et persiste les dates du chantier (lots + sous-phases).
 * No-op silencieux si aucun lot. À appeler après tout changement structurel
 * (durée/délai/dépendance, lot OU sous-phase).
 */
export async function recomputeChantierDates(
  supabase: SupabaseClient,
  chantierId: string,
  startDate: Date,
): Promise<void> {
  const { data: allLotsRaw } = await supabase
    .from('lots_chantier')
    .select('id, nom, emoji, role, job_type, duree_jours, delai_avant_jours, ordre')
    .eq('chantier_id', chantierId)
    .order('ordre', { ascending: true });
  const allLots = (allLotsRaw ?? []) as LotChantier[];
  if (allLots.length === 0) return;

  // Estime + persiste les duree_jours manquantes (identique à l'ancien inline).
  const needEstimate = allLots.some(l => l.duree_jours == null || (l.duree_jours as number) <= 0);
  if (needEstimate) {
    const estimated = estimateMissingPlanningData(allLots);
    const updates = estimated
      .filter(lot => {
        const o = allLots.find(l => l.id === lot.id);
        return o && (o.duree_jours == null || (o.duree_jours as number) <= 0);
      })
      .map(lot => supabase.from('lots_chantier').update({ duree_jours: lot.duree_jours }).eq('id', lot.id));
    await Promise.all(updates);
    for (const lot of estimated) {
      const o = allLots.find(l => l.id === lot.id);
      if (o && (o.duree_jours == null || (o.duree_jours as number) <= 0)) o.duree_jours = lot.duree_jours ?? null;
    }
  }

  const lotDeps = await loadLotDependencies(supabase, allLots.map(l => l.id));
  const subphases = await loadSubphases(supabase, chantierId);

  if (subphases.length > 0) {
    const edges = await loadSubphaseDeps(supabase, chantierId);
    const { lots: cLots, subphases: cSubs } = computeAdvancedPlanning(allLots, subphases, lotDeps, edges, startDate);
    await Promise.all([
      ...cLots
        .filter(l => l.date_debut && l.date_fin)
        .map(l => supabase.from('lots_chantier').update({ date_debut: l.date_debut, date_fin: l.date_fin }).eq('id', l.id)),
      ...cSubs
        .filter(s => s.date_debut && s.date_fin)
        .map(s => supabase.from('lot_subphases').update({ date_debut: s.date_debut, date_fin: s.date_fin }).eq('id', s.id)),
    ]);
  } else {
    const computed = computePlanningDates(allLots, startDate, lotDeps);
    await Promise.all(
      computed
        .filter(l => l.date_debut && l.date_fin)
        .map(l => supabase.from('lots_chantier').update({ date_debut: l.date_debut, date_fin: l.date_fin }).eq('id', l.id)),
    );
  }
}

/**
 * True si ajouter `newEdge` créerait un cycle dans le graphe avancé du chantier.
 * Utilise EXACTEMENT la même normalisation que le CPM (buildAdvancedNodeGraph),
 * donc la détection colle à la réalité du calcul des dates.
 */
export async function wouldCreateCycle(
  supabase: SupabaseClient,
  chantierId: string,
  newEdge: PlanningEdge,
): Promise<boolean> {
  const [lotsRaw, subphases, existing] = await Promise.all([
    supabase.from('lots_chantier').select('id, duree_jours, delai_avant_jours, ordre').eq('chantier_id', chantierId),
    loadSubphases(supabase, chantierId),
    loadSubphaseDeps(supabase, chantierId),
  ]);
  const lots = (lotsRaw.data ?? []) as LotChantier[];
  const lotDeps = await loadLotDependencies(supabase, lots.map(l => l.id));
  const { nodes, nodeDeps } = buildAdvancedNodeGraph(lots, subphases, lotDeps, [...existing, newEdge]);
  return hasCycleInNodeDeps(nodeDeps, nodes.map(n => n.id));
}
