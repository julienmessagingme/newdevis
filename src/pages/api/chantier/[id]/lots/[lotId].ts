export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';
import { computePlanningDates } from '@/lib/planningUtils';

/**
 * DELETE /api/chantier/[id]/lots/[lotId]
 * Supprime un lot du chantier, puis recompacte les dates des lots restants
 * (pour éviter les trous dans la timeline Gantt).
 */
export const DELETE: APIRoute = async ({ request, params }) => {
  if (!params.lotId) {
    return jsonError('Paramètres manquants', 400);
  }

  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;

  const { error } = await ctx.supabase
    .from('lots_chantier')
    .delete()
    .eq('id', params.lotId)
    .eq('chantier_id', chantierId);

  if (error) {
    console.error('[api/chantier/lots DELETE] error:', error.message);
    return jsonError('Erreur lors de la suppression', 500);
  }

  // Recompacte le planning : remet les dates des lots restants bout-à-bout
  // à partir de la date_debut_chantier, sans trou laissé par le lot supprimé.
  try {
    const [chantierRes, lotsRes] = await Promise.all([
      ctx.supabase
        .from('chantiers')
        .select('date_debut_chantier')
        .eq('id', chantierId)
        .single(),
      ctx.supabase
        .from('lots_chantier')
        .select('id, nom, emoji, role, job_type, duree_jours, ordre_planning, parallel_group, ordre')
        .eq('chantier_id', chantierId),
    ]);

    const startDateStr = chantierRes.data?.date_debut_chantier;
    const remainingLots = lotsRes.data ?? [];

    if (startDateStr && remainingLots.length > 0) {
      const computed = computePlanningDates(remainingLots as any, new Date(startDateStr));
      const dateUpdates = computed
        .filter(l => l.date_debut && l.date_fin)
        .map(l => ctx.supabase
          .from('lots_chantier')
          .update({ date_debut: l.date_debut, date_fin: l.date_fin })
          .eq('id', l.id));
      await Promise.all(dateUpdates);

      // Invalidate agent context cache (planning changed)
      ctx.supabase.from('agent_context_cache')
        .update({ invalidated: true })
        .eq('chantier_id', chantierId)
        .then(() => {}).catch(() => {});
    }
  } catch (e) {
    console.error('[api/chantier/lots DELETE] recompact error:', e);
    // Non-bloquant : le lot est supprimé, le recompactage peut rater
  }

  return jsonOk({ success: true });
};

export const OPTIONS: APIRoute = () => optionsResponse();
