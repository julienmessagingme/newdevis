export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuthOrAgent } from '@/lib/apiHelpers';
import { computePlanningDates, type DependencyMap } from '@/lib/planningUtils';

/**
 * POST /api/chantier/[id]/planning/shift-lot
 *
 * Body : { lot_id, jours, cascade, raison }
 *
 * cascade=true  → applique delai_avant_jours sur le lot, cascade DAG naturelle.
 * cascade=false → DÉTACHE le lot de sa chaîne :
 *   - Les successeurs directs perdent le lot et héritent des prédécesseurs du lot
 *     (bridge → ils restent à leur position).
 *   - Le lot devient autonome (deps vides) sur une nouvelle side lane.
 *   - delai_avant_jours appliqué sur le lot.
 *
 * Recompute global après modif. Auth user OU X-Agent-Key.
 */
export const POST: APIRoute = async ({ request, params }) => {
  const ctx = await requireChantierAuthOrAgent(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const body = await request.json().catch(() => null) as {
    lot_id?: string; jours?: number; cascade?: boolean; raison?: string;
  } | null;
  if (!body?.lot_id || typeof body.jours !== 'number' || typeof body.cascade !== 'boolean') {
    return jsonError('Paramètres manquants : lot_id, jours, cascade requis', 400);
  }
  const chantierId = params.id!;
  const { lot_id, jours, cascade } = body;

  // Charge le lot + chantier
  const [lotRes, chRes] = await Promise.all([
    ctx.supabase.from('lots_chantier')
      .select('id, delai_avant_jours, lane_index')
      .eq('id', lot_id).eq('chantier_id', chantierId).single(),
    ctx.supabase.from('chantiers')
      .select('date_debut_chantier').eq('id', chantierId).single(),
  ]);
  const lot = lotRes.data as { id: string; delai_avant_jours: number | null; lane_index: number | null } | null;
  if (!lot) return jsonError('Lot introuvable', 404);
  const startDateStr = chRes.data?.date_debut_chantier as string | null | undefined;
  if (!startDateStr) return jsonError('Date de début du chantier manquante', 400);

  if (cascade) {
    // Mode cascade : juste appliquer delai. Recompute via DAG fait le reste.
    await ctx.supabase.from('lots_chantier')
      .update({ delai_avant_jours: (lot.delai_avant_jours ?? 0) + jours })
      .eq('id', lot_id).eq('chantier_id', chantierId);
  } else {
    // Mode détache : récupère deps actuelles et successeurs
    const [predRes, succRes, allLotsRes] = await Promise.all([
      ctx.supabase.from('lot_dependencies').select('depends_on_id').eq('lot_id', lot_id),
      ctx.supabase.from('lot_dependencies').select('lot_id').eq('depends_on_id', lot_id),
      ctx.supabase.from('lots_chantier').select('id, lane_index').eq('chantier_id', chantierId),
    ]);
    const lotPreds = (predRes.data ?? []).map((r: { depends_on_id: string }) => r.depends_on_id);
    const directSuccs = (succRes.data ?? []).map((r: { lot_id: string }) => r.lot_id);
    const allLots = (allLotsRes.data ?? []) as Array<{ id: string; lane_index: number | null }>;

    // Bridge : chaque successeur perd lot_id, hérite des prédécesseurs du lot
    for (const succId of directSuccs) {
      await ctx.supabase.from('lot_dependencies')
        .delete()
        .eq('lot_id', succId).eq('depends_on_id', lot_id);
      if (lotPreds.length > 0) {
        const rows = lotPreds
          .filter(p => p !== succId)
          .map(p => ({ lot_id: succId, depends_on_id: p }));
        if (rows.length > 0) {
          await ctx.supabase.from('lot_dependencies')
            .upsert(rows, { onConflict: 'lot_id,depends_on_id', ignoreDuplicates: true });
        }
      }
    }

    // Vide les deps du lot (autonome)
    await ctx.supabase.from('lot_dependencies').delete().eq('lot_id', lot_id);

    // Nouvelle side lane (max + 1)
    const maxLane = allLots.reduce((m, l) => Math.max(m, l.lane_index ?? -1), -1);
    await ctx.supabase.from('lots_chantier')
      .update({
        lane_index: maxLane + 1,
        delai_avant_jours: (lot.delai_avant_jours ?? 0) + jours,
      })
      .eq('id', lot_id).eq('chantier_id', chantierId);
  }

  // Recompute global des dates via CPM
  const { data: freshLotsRaw } = await ctx.supabase
    .from('lots_chantier')
    .select('id, nom, duree_jours, delai_avant_jours, ordre')
    .eq('chantier_id', chantierId);
  const freshLots = (freshLotsRaw ?? []) as any[];
  const lotIds = freshLots.map(l => l.id);
  const { data: freshDepsRows } = await ctx.supabase
    .from('lot_dependencies')
    .select('lot_id, depends_on_id')
    .in('lot_id', lotIds);
  const freshDeps: DependencyMap = new Map();
  for (const r of (freshDepsRows ?? []) as Array<{ lot_id: string; depends_on_id: string }>) {
    if (!freshDeps.has(r.lot_id)) freshDeps.set(r.lot_id, new Set());
    freshDeps.get(r.lot_id)!.add(r.depends_on_id);
  }
  const computed = computePlanningDates(freshLots, new Date(startDateStr), freshDeps);
  await Promise.all(
    computed
      .filter(l => l.date_debut && l.date_fin)
      .map(l => ctx.supabase.from('lots_chantier')
        .update({ date_debut: l.date_debut, date_fin: l.date_fin })
        .eq('id', l.id)),
  );

  // Invalidate agent cache
  ctx.supabase.from('agent_context_cache')
    .update({ invalidated: true })
    .eq('chantier_id', chantierId)
    .then(() => {}).catch(() => {});

  return jsonOk({
    success: true,
    mode: cascade ? 'cascade' : 'detach',
    lot_id,
    jours_applied: jours,
  });
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
