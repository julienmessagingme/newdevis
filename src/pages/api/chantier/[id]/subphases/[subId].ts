export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth, logChantierActivity } from '@/lib/api/apiHelpers';
import { canUseAdvancedPlanning } from '@/lib/auth/advancedPlanningAccess';
import { recomputeChantierDates, getChantierStartDate } from '@/lib/chantier/planningServer';

export const OPTIONS: APIRoute = () => optionsResponse('PATCH,DELETE,OPTIONS');

const STATUTS = ['a_faire', 'en_cours', 'termine'];

async function authPremium(request: Request, chantierId: string) {
  const ctx = await requireChantierAuth(request, chantierId);
  if (ctx instanceof Response) return ctx;
  if (!(await canUseAdvancedPlanning(ctx.supabase, ctx.user.id, ctx.user.email))) {
    return jsonError('Planning avancé réservé à l\'offre Multi', 403);
  }
  return ctx;
}

/** PATCH /api/chantier/[id]/subphases/[subId] — édite nom/durée/délai/lane/ordre/statut. */
export const PATCH: APIRoute = async ({ request, params }) => {
  const chantierId = params.id!;
  const subId = params.subId!;
  const ctx = await authPremium(request, chantierId);
  if (ctx instanceof Response) return ctx;

  const { data: sub } = await ctx.supabase
    .from('lot_subphases')
    .select('id, lot_id')
    .eq('id', subId)
    .eq('chantier_id', chantierId)
    .maybeSingle();
  if (!sub) return jsonError('Sous-phase introuvable', 404);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return jsonError('Corps de requête invalide', 400); }

  const update: Record<string, unknown> = {};
  if (typeof body.nom === 'string' && body.nom.trim()) update.nom = body.nom.trim();
  if (typeof body.duree_jours === 'number' && body.duree_jours > 0) update.duree_jours = Math.round(body.duree_jours);
  if (typeof body.delai_avant_jours === 'number' && body.delai_avant_jours >= 0) update.delai_avant_jours = Math.round(body.delai_avant_jours);
  if ('lane_index' in body) update.lane_index = typeof body.lane_index === 'number' ? body.lane_index : null;
  if (typeof body.ordre === 'number') update.ordre = body.ordre;
  if (typeof body.statut === 'string' && STATUTS.includes(body.statut)) update.statut = body.statut;

  if (Object.keys(update).length === 0) return jsonError('Aucun champ valide à mettre à jour', 400);

  const { error } = await ctx.supabase.from('lot_subphases').update(update).eq('id', subId).eq('chantier_id', chantierId);
  if (error) {
    console.error('[subphases PATCH] update error:', error.message);
    return jsonError('Erreur lors de la mise à jour de la sous-phase', 500);
  }

  // Recompute uniquement si un champ STRUCTUREL (durée/délai) a changé.
  if ('duree_jours' in update || 'delai_avant_jours' in update) {
    const startDate = await getChantierStartDate(ctx.supabase, chantierId);
    if (startDate) await recomputeChantierDates(ctx.supabase, chantierId, startDate);
  }
  try {
    await ctx.supabase.from('agent_context_cache').update({ invalidated: true }).eq('chantier_id', chantierId);
  } catch { /* non-bloquant */ }

  return jsonOk({ ok: true });
};

/** DELETE /api/chantier/[id]/subphases/[subId] — supprime (CASCADE nettoie les arêtes). */
export const DELETE: APIRoute = async ({ request, params }) => {
  const chantierId = params.id!;
  const subId = params.subId!;
  const ctx = await authPremium(request, chantierId);
  if (ctx instanceof Response) return ctx;

  const { data: sub } = await ctx.supabase
    .from('lot_subphases')
    .select('id, nom, lot_id')
    .eq('id', subId)
    .eq('chantier_id', chantierId)
    .maybeSingle();
  if (!sub) return jsonError('Sous-phase introuvable', 404);

  const { error } = await ctx.supabase.from('lot_subphases').delete().eq('id', subId).eq('chantier_id', chantierId);
  if (error) {
    console.error('[subphases DELETE] error:', error.message);
    return jsonError('Erreur lors de la suppression de la sous-phase', 500);
  }
  // Les arêtes planning_subphase_deps référençant cette sous-phase sont nettoyées
  // par le FK ON DELETE CASCADE — pas de cleanup applicatif nécessaire.

  const startDate = await getChantierStartDate(ctx.supabase, chantierId);
  if (startDate) await recomputeChantierDates(ctx.supabase, chantierId, startDate);

  await logChantierActivity(chantierId, {
    category: 'status_change',
    actor: 'user',
    summary: `Sous-phase supprimée — ${sub.nom ?? ''}`.trim(),
    metadata: { source: 'subphase_delete', lot_id: sub.lot_id },
  });
  try {
    await ctx.supabase.from('agent_context_cache').update({ invalidated: true }).eq('chantier_id', chantierId);
  } catch { /* non-bloquant */ }

  return jsonOk({ ok: true });
};
