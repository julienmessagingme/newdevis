export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuthOrAgent } from '@/lib/apiHelpers';
import { estimateMissingPlanningData, computePlanningDates, type DependencyMap } from '@/lib/planningUtils';

type LotRow = {
  id: string;
  chantier_id?: string;
  nom?: string | null;
  emoji?: string | null;
  role?: string | null;
  job_type?: string | null;
  statut?: string | null;
  ordre?: number | null;
  duree_jours?: number | null;
  delai_avant_jours?: number | null;
  date_debut?: string | null;
  date_fin?: string | null;
  ordre_planning?: number | null;
  parallel_group?: number | null;
  lane_index?: number | null;
  budget_min_ht?: number | null;
  budget_avg_ht?: number | null;
  budget_max_ht?: number | null;
};

const LOT_SELECT =
  'id, nom, emoji, role, statut, ordre, duree_jours, date_debut, date_fin, ordre_planning, parallel_group, delai_avant_jours, lane_index, budget_min_ht, budget_avg_ht, budget_max_ht';

async function loadDependencies(
  supabase: { from: (table: string) => unknown },
  lotIds: string[],
): Promise<DependencyMap> {
  const deps = new Map<string, Set<string>>();
  if (lotIds.length === 0) return deps;
  const { data } = await (supabase as any)
    .from('lot_dependencies')
    .select('lot_id, depends_on_id')
    .in('lot_id', lotIds);
  for (const row of (data ?? []) as Array<{ lot_id: string; depends_on_id: string }>) {
    if (!deps.has(row.lot_id)) deps.set(row.lot_id, new Set());
    deps.get(row.lot_id)!.add(row.depends_on_id);
  }
  return deps;
}

function depsToJSON(deps: DependencyMap): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of deps) out[k] = Array.from(v);
  return out;
}

/**
 * GET /api/chantier/[id]/planning
 * Retourne les lots + leur graphe de dépendances + date_debut_chantier.
 */
export const GET: APIRoute = async ({ request, params }) => {
  const ctx = await requireChantierAuthOrAgent(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const [chantierRes, lotsRes] = await Promise.all([
    ctx.supabase
      .from('chantiers')
      .select('date_debut_chantier, date_fin_souhaitee')
      .eq('id', params.id!)
      .single(),
    ctx.supabase
      .from('lots_chantier')
      .select(LOT_SELECT)
      .eq('chantier_id', params.id!)
      .order('ordre', { ascending: true }),
  ]);

  if (lotsRes.error) {
    console.error('[api/chantier/planning GET] error:', lotsRes.error.message);
    return jsonError('Erreur lors de la récupération du planning', 500);
  }

  const chantier = chantierRes.data;
  const lots = (lotsRes.data ?? []) as LotRow[];
  const deps = await loadDependencies(ctx.supabase, lots.map(l => l.id));

  return jsonOk({
    dateDebutChantier: chantier?.date_debut_chantier ?? null,
    dateFinSouhaitee: chantier?.date_fin_souhaitee ?? null,
    lots,
    dependencies: depsToJSON(deps),
  });
};

/**
 * PATCH /api/chantier/[id]/planning
 *
 * Body:
 * {
 *   dateDebutChantier?: string (ISO date),
 *   lots?: Array<{ id, duree_jours?, delai_avant_jours? }>,
 *   dependencies?: Record<string, string[]>   // lot_id → full list of depends_on_ids
 * }
 *
 * Recalcule TOUTES les dates par tri topologique (CPM) quand quoi que ce soit
 * de structurel change (durée, délai, deps, date de début).
 */
export const PATCH: APIRoute = async ({ request, params }) => {
  const ctx = await requireChantierAuthOrAgent(request, params.id!);
  if (ctx instanceof Response) return ctx;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError('Corps de requête invalide', 400);
  }

  const chantierId = params.id!;

  // 1. date_debut_chantier
  if (typeof body.dateDebutChantier === 'string') {
    const { error } = await ctx.supabase
      .from('chantiers')
      .update({ date_debut_chantier: body.dateDebutChantier })
      .eq('id', chantierId);
    if (error) {
      console.error('[api/chantier/planning PATCH] chantier update error:', error.message);
      return jsonError('Erreur lors de la mise à jour de la date de début', 500);
    }
  }

  // 2. Updates per-lot (durée / délai uniquement — dates dérivées)
  const lotUpdates = Array.isArray(body.lots) ? (body.lots as Array<Record<string, unknown>>) : [];

  // Pré-calcule les lots qui envoient date_debut sans delai_avant_jours (legacy
  // tool update_lot_dates). On convertit date_debut → delai_avant_jours pour
  // que le tool legacy fonctionne même sans redeployer l'edge function.
  const legacyDatedLotIds = lotUpdates
    .filter(lot => typeof lot.id === 'string' && typeof lot.date_debut === 'string' && typeof lot.delai_avant_jours !== 'number')
    .map(lot => lot.id as string);

  const legacyCurrentDates = new Map<string, { date_debut: string; delai_avant_jours: number | null }>();
  if (legacyDatedLotIds.length > 0) {
    const { data: curRows } = await ctx.supabase
      .from('lots_chantier')
      .select('id, date_debut, delai_avant_jours')
      .in('id', legacyDatedLotIds)
      .eq('chantier_id', chantierId);
    for (const row of (curRows ?? []) as Array<{ id: string; date_debut: string | null; delai_avant_jours: number | null }>) {
      if (row.date_debut) {
        legacyCurrentDates.set(row.id, { date_debut: row.date_debut, delai_avant_jours: row.delai_avant_jours });
      }
    }
  }

  const lotUpdatePromises = lotUpdates
    .filter(lot => typeof lot.id === 'string')
    .map(lot => {
      const update: Record<string, unknown> = {};
      if (typeof lot.duree_jours === 'number') update.duree_jours = lot.duree_jours;
      if (typeof lot.delai_avant_jours === 'number') update.delai_avant_jours = lot.delai_avant_jours;
      if ('lane_index' in lot) update.lane_index = lot.lane_index;
      // Compat legacy : convertit date_debut → delai_avant_jours
      if (typeof lot.date_debut === 'string' && typeof update.delai_avant_jours !== 'number') {
        const cur = legacyCurrentDates.get(lot.id as string);
        if (cur) {
          const old = new Date(cur.date_debut);
          const target = new Date(lot.date_debut as string);
          const diffCalDays = Math.round((target.getTime() - old.getTime()) / (24 * 60 * 60 * 1000));
          // Conversion calendaire → jours ouvrés (approximation 5/7)
          const diffBizDays = Math.round(diffCalDays * 5 / 7);
          if (diffBizDays !== 0) {
            update.delai_avant_jours = (cur.delai_avant_jours ?? 0) + diffBizDays;
          }
        }
      }
      if (Object.keys(update).length === 0) return null;
      return ctx.supabase.from('lots_chantier').update(update).eq('id', lot.id as string).eq('chantier_id', chantierId);
    })
    .filter(Boolean);

  const results = await Promise.all(lotUpdatePromises);
  for (const r of results) {
    if (r && typeof r === 'object' && 'error' in r && (r as { error: unknown }).error) {
      console.error('[api/chantier/planning PATCH] lot update error:', (r as { error: { message?: string } }).error);
    }
  }

  // 3. Dépendances — body.dependencies = { lot_id: [depends_on_id,...] }
  //    Pour chaque lot listé : on remplace ses prédécesseurs en BDD (delete puis insert).
  const depsInput = (body.dependencies && typeof body.dependencies === 'object')
    ? (body.dependencies as Record<string, unknown>)
    : null;

  let anyDepsChanged = false;
  if (depsInput) {
    for (const [lotId, depIdsRaw] of Object.entries(depsInput)) {
      if (typeof lotId !== 'string') continue;
      if (!Array.isArray(depIdsRaw)) continue;
      const depIds = depIdsRaw.filter(d => typeof d === 'string' && d !== lotId) as string[];

      // Récupère deps actuelles
      const { data: currentDeps } = await ctx.supabase
        .from('lot_dependencies')
        .select('depends_on_id')
        .eq('lot_id', lotId);

      const current = new Set((currentDeps ?? []).map((r: { depends_on_id: string }) => r.depends_on_id));
      const wanted = new Set(depIds);

      const toDelete = [...current].filter(d => !wanted.has(d));
      const toInsert = [...wanted].filter(d => !current.has(d));

      if (toDelete.length > 0) {
        await ctx.supabase
          .from('lot_dependencies')
          .delete()
          .eq('lot_id', lotId)
          .in('depends_on_id', toDelete);
        anyDepsChanged = true;
      }
      if (toInsert.length > 0) {
        await ctx.supabase
          .from('lot_dependencies')
          .insert(toInsert.map(d => ({ lot_id: lotId, depends_on_id: d })));
        anyDepsChanged = true;
      }
    }
  }

  // 4. Récupère startDate (réponse + recalc)
  const { data: chantierRow } = await ctx.supabase
    .from('chantiers')
    .select('date_debut_chantier')
    .eq('id', chantierId)
    .single();

  const startDateStr = typeof body.dateDebutChantier === 'string'
    ? body.dateDebutChantier
    : chantierRow?.date_debut_chantier;

  // 5. Recalcul global si quoi que ce soit a changé structurellement
  const structuralLotChange = lotUpdates.some(l =>
    typeof l.id === 'string' && (
      typeof l.duree_jours === 'number'
      || typeof l.delai_avant_jours === 'number'
      || typeof l.date_debut === 'string' // compat legacy tool update_lot_dates
    ),
  );
  const needsGlobalRecalc = anyDepsChanged
    || structuralLotChange
    || typeof body.dateDebutChantier === 'string'
    || (lotUpdates.length === 0 && !depsInput); // PATCH vide = "recompact"

  if (needsGlobalRecalc && startDateStr) {
    const { data: allLotsRaw } = await ctx.supabase
      .from('lots_chantier')
      .select('id, nom, emoji, role, job_type, duree_jours, delai_avant_jours, ordre')
      .eq('chantier_id', chantierId)
      .order('ordre', { ascending: true });

    const allLots = (allLotsRaw ?? []) as LotRow[];

    if (allLots.length > 0) {
      // Auto-remplir duree_jours manquantes
      const needDurationEstimate = allLots.some(l => l.duree_jours == null || (l.duree_jours as number) <= 0);
      if (needDurationEstimate) {
        const estimated = estimateMissingPlanningData(allLots as any);
        const estimateUpdates = estimated
          .filter(lot => {
            const orig = allLots.find(l => l.id === lot.id);
            return orig && (orig.duree_jours == null || (orig.duree_jours as number) <= 0);
          })
          .map(lot => ctx.supabase.from('lots_chantier').update({
            duree_jours: lot.duree_jours,
          }).eq('id', lot.id));
        await Promise.all(estimateUpdates);
        for (const lot of estimated) {
          const orig = allLots.find(l => l.id === lot.id);
          if (orig && (orig.duree_jours == null || (orig.duree_jours as number) <= 0)) {
            orig.duree_jours = lot.duree_jours ?? null;
          }
        }
      }

      // Charge les dépendances de TOUS les lots du chantier
      const depsMap = await loadDependencies(ctx.supabase, allLots.map(l => l.id));

      const computed = computePlanningDates(allLots as any, new Date(startDateStr), depsMap);

      // Persiste les dates
      const dateUpdates = computed
        .filter(lot => lot.date_debut && lot.date_fin)
        .map(lot => ctx.supabase.from('lots_chantier')
          .update({ date_debut: lot.date_debut, date_fin: lot.date_fin })
          .eq('id', lot.id));
      await Promise.all(dateUpdates);
    }
  }

  // 6. Retourne l'état final
  const { data: finalLots } = await ctx.supabase
    .from('lots_chantier')
    .select(LOT_SELECT)
    .eq('chantier_id', chantierId)
    .order('ordre', { ascending: true });

  const finalDeps = await loadDependencies(ctx.supabase, (finalLots ?? []).map((l: LotRow) => l.id));

  // Invalidate agent context cache
  ctx.supabase.from('agent_context_cache')
    .update({ invalidated: true })
    .eq('chantier_id', chantierId)
    .then(() => {}).catch(() => {});

  return jsonOk({
    dateDebutChantier: startDateStr ?? null,
    lots: finalLots ?? [],
    dependencies: depsToJSON(finalDeps),
  });
};

export const OPTIONS: APIRoute = async () => optionsResponse();
