export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/api/apiHelpers';
import { canUseAdvancedPlanning } from '@/lib/auth/advancedPlanningAccess';
import { recomputeChantierDates, getChantierStartDate, loadSubphases, wouldCreateCycle } from '@/lib/chantier/planningServer';
import type { PlanningEdge } from '@/types/chantier-ia';

export const OPTIONS: APIRoute = () => optionsResponse('POST,DELETE,OPTIONS');

async function authPremium(request: Request, chantierId: string) {
  const ctx = await requireChantierAuth(request, chantierId);
  if (ctx instanceof Response) return ctx;
  if (!(await canUseAdvancedPlanning(ctx.supabase, ctx.user.id, ctx.user.email))) {
    return jsonError('Planning avancé réservé à l\'abonnement premium', 403);
  }
  return ctx;
}

function parseEdge(body: Record<string, unknown>): PlanningEdge | null {
  const e: PlanningEdge = {
    from_lot_id: typeof body.from_lot_id === 'string' ? body.from_lot_id : null,
    from_subphase_id: typeof body.from_subphase_id === 'string' ? body.from_subphase_id : null,
    to_lot_id: typeof body.to_lot_id === 'string' ? body.to_lot_id : null,
    to_subphase_id: typeof body.to_subphase_id === 'string' ? body.to_subphase_id : null,
  };
  const fromCount = (e.from_lot_id ? 1 : 0) + (e.from_subphase_id ? 1 : 0);
  const toCount = (e.to_lot_id ? 1 : 0) + (e.to_subphase_id ? 1 : 0);
  if (fromCount !== 1 || toCount !== 1) return null;          // exactement un endpoint de chaque côté
  if (!e.from_subphase_id && !e.to_subphase_id) return null;  // au moins une sous-phase
  if (e.from_subphase_id && e.from_subphase_id === e.to_subphase_id) return null; // self-loop
  return e;
}

/**
 * POST /api/chantier/[id]/subphases/deps
 * Body = { from_lot_id|from_subphase_id, to_lot_id|to_subphase_id }
 * Convention : from = dépendant, to = prédécesseur (to se termine AVANT from).
 */
export const POST: APIRoute = async ({ request, params }) => {
  const chantierId = params.id!;
  const ctx = await authPremium(request, chantierId);
  if (ctx instanceof Response) return ctx;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return jsonError('Corps de requête invalide', 400); }

  const edge = parseEdge(body);
  if (!edge) return jsonError('Arête invalide (un endpoint de chaque côté, au moins une sous-phase, pas de boucle)', 400);

  // Appartenance des endpoints au chantier.
  const [lotsRes, subphases] = await Promise.all([
    ctx.supabase.from('lots_chantier').select('id').eq('chantier_id', chantierId),
    loadSubphases(ctx.supabase, chantierId),
  ]);
  const lotIds = new Set((lotsRes.data ?? []).map((l: { id: string }) => l.id));
  const subLotById = new Map(subphases.map(s => [s.id, s.lot_id]));

  const lotEndpointOk = (id?: string | null) => !id || lotIds.has(id);
  const subEndpointOk = (id?: string | null) => !id || subLotById.has(id);
  if (!lotEndpointOk(edge.from_lot_id) || !lotEndpointOk(edge.to_lot_id)
    || !subEndpointOk(edge.from_subphase_id) || !subEndpointOk(edge.to_subphase_id)) {
    return jsonError('Un des endpoints n\'appartient pas à ce chantier', 400);
  }

  // Garde : un lot ne peut pas dépendre de sa propre sous-phase (ni l'inverse).
  if (edge.from_lot_id && edge.to_subphase_id && subLotById.get(edge.to_subphase_id) === edge.from_lot_id) {
    return jsonError('Un lot ne peut pas dépendre de sa propre sous-phase', 400);
  }
  if (edge.from_subphase_id && edge.to_lot_id && subLotById.get(edge.from_subphase_id) === edge.to_lot_id) {
    return jsonError('Une sous-phase ne peut pas dépendre de son propre lot', 400);
  }

  // Garde anti-cycle (même normalisation que le CPM).
  if (await wouldCreateCycle(ctx.supabase, chantierId, edge)) {
    return jsonError('Cette dépendance créerait une boucle dans le planning', 409);
  }

  const { data: created, error } = await ctx.supabase
    .from('planning_subphase_deps')
    .insert({
      chantier_id: chantierId,
      from_lot_id: edge.from_lot_id ?? null,
      from_subphase_id: edge.from_subphase_id ?? null,
      to_lot_id: edge.to_lot_id ?? null,
      to_subphase_id: edge.to_subphase_id ?? null,
    })
    .select('id, from_lot_id, from_subphase_id, to_lot_id, to_subphase_id')
    .single();
  if (error || !created) {
    // 23505 = doublon (unique index uniq_psd_edge) → arête déjà présente
    if ((error as { code?: string } | null)?.code === '23505') return jsonError('Cette dépendance existe déjà', 409);
    console.error('[subphases/deps POST] insert error:', error?.message);
    return jsonError('Erreur lors de la création de la dépendance', 500);
  }

  const startDate = await getChantierStartDate(ctx.supabase, chantierId);
  if (startDate) await recomputeChantierDates(ctx.supabase, chantierId, startDate);
  try {
    await ctx.supabase.from('agent_context_cache').update({ invalidated: true }).eq('chantier_id', chantierId);
  } catch { /* non-bloquant */ }

  return jsonOk({ edge: created }, 201);
};

/** DELETE /api/chantier/[id]/subphases/deps?id=<edgeId> */
export const DELETE: APIRoute = async ({ request, params, url }) => {
  const chantierId = params.id!;
  const ctx = await authPremium(request, chantierId);
  if (ctx instanceof Response) return ctx;

  const edgeId = url.searchParams.get('id');
  if (!edgeId) return jsonError('Paramètre id requis', 400);

  const { error } = await ctx.supabase
    .from('planning_subphase_deps')
    .delete()
    .eq('id', edgeId)
    .eq('chantier_id', chantierId);
  if (error) {
    console.error('[subphases/deps DELETE] error:', error.message);
    return jsonError('Erreur lors de la suppression de la dépendance', 500);
  }

  const startDate = await getChantierStartDate(ctx.supabase, chantierId);
  if (startDate) await recomputeChantierDates(ctx.supabase, chantierId, startDate);
  try {
    await ctx.supabase.from('agent_context_cache').update({ invalidated: true }).eq('chantier_id', chantierId);
  } catch { /* non-bloquant */ }

  return jsonOk({ ok: true });
};
