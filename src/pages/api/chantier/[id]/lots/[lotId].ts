export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';
import { computePlanningDates, type DependencyMap } from '@/lib/planningUtils';

/**
 * DELETE /api/chantier/[id]/lots/[lotId]
 *
 * Supprime le lot, puis :
 * 1. Les dépendances où ce lot apparaît sont auto-nettoyées (FK CASCADE)
 * 2. Les lots qui dépendaient de lui voient leurs predecessors re-pointer vers
 *    les ancêtres du lot supprimé (transfert de dépendance — conserve la
 *    cohérence de la chaîne).
 * 3. Recompute les dates via computePlanningDates(deps).
 */
export const DELETE: APIRoute = async ({ request, params }) => {
  if (!params.lotId) return jsonError('Paramètres manquants', 400);

  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;
  const lotId = params.lotId;

  // 1. Récupère les dépendances du lot avant suppression (pour transfert)
  const { data: lotPredecessors } = await ctx.supabase
    .from('lot_dependencies')
    .select('depends_on_id')
    .eq('lot_id', lotId);

  const { data: lotSuccessors } = await ctx.supabase
    .from('lot_dependencies')
    .select('lot_id')
    .eq('depends_on_id', lotId);

  const predIds = (lotPredecessors ?? []).map((r: { depends_on_id: string }) => r.depends_on_id);
  const succIds = (lotSuccessors ?? []).map((r: { lot_id: string }) => r.lot_id);

  // 2. Supprime le lot — cascade les lot_dependencies automatiquement
  const { error: delError } = await ctx.supabase
    .from('lots_chantier')
    .delete()
    .eq('id', lotId)
    .eq('chantier_id', chantierId);

  if (delError) {
    console.error('[api/chantier/lots DELETE] error:', delError.message);
    return jsonError('Erreur lors de la suppression', 500);
  }

  // 3. Transfère les dépendances : chaque successor du lot supprimé hérite des
  //    prédécesseurs du lot supprimé. Ex : A → X → B avec X supprimé → A → B.
  if (succIds.length > 0 && predIds.length > 0) {
    const transferRows: Array<{ lot_id: string; depends_on_id: string }> = [];
    for (const s of succIds) {
      for (const p of predIds) {
        if (s !== p) transferRows.push({ lot_id: s, depends_on_id: p });
      }
    }
    if (transferRows.length > 0) {
      await ctx.supabase
        .from('lot_dependencies')
        .upsert(transferRows, { onConflict: 'lot_id,depends_on_id', ignoreDuplicates: true });
    }
  }

  // 4. Recompute dates
  try {
    const [chantierRes, lotsRes] = await Promise.all([
      ctx.supabase
        .from('chantiers')
        .select('date_debut_chantier')
        .eq('id', chantierId)
        .single(),
      ctx.supabase
        .from('lots_chantier')
        .select('id, nom, emoji, role, job_type, duree_jours, delai_avant_jours, ordre')
        .eq('chantier_id', chantierId),
    ]);

    const startDateStr = chantierRes.data?.date_debut_chantier;
    const remainingLots = (lotsRes.data ?? []) as any[];

    if (startDateStr && remainingLots.length > 0) {
      const lotIds = remainingLots.map(l => l.id);
      const { data: depsRows } = await ctx.supabase
        .from('lot_dependencies')
        .select('lot_id, depends_on_id')
        .in('lot_id', lotIds);

      const depsMap: DependencyMap = new Map();
      for (const row of (depsRows ?? []) as Array<{ lot_id: string; depends_on_id: string }>) {
        if (!depsMap.has(row.lot_id)) depsMap.set(row.lot_id, new Set());
        depsMap.get(row.lot_id)!.add(row.depends_on_id);
      }

      const computed = computePlanningDates(remainingLots, new Date(startDateStr), depsMap);
      const dateUpdates = computed
        .filter(l => l.date_debut && l.date_fin)
        .map(l => ctx.supabase
          .from('lots_chantier')
          .update({ date_debut: l.date_debut, date_fin: l.date_fin })
          .eq('id', l.id));
      await Promise.all(dateUpdates);

      // Invalidate agent cache
      ctx.supabase.from('agent_context_cache')
        .update({ invalidated: true })
        .eq('chantier_id', chantierId)
        .then(() => {}).catch(() => {});
    }
  } catch (e) {
    console.error('[api/chantier/lots DELETE] recompact error:', e);
  }

  return jsonOk({ success: true });
};

export const OPTIONS: APIRoute = () => optionsResponse();
