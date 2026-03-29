export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';

/**
 * DELETE /api/chantier/[id]/lots/[lotId]
 * Supprime un lot du chantier.
 */
export const DELETE: APIRoute = async ({ request, params }) => {
  if (!params.lotId) {
    return jsonError('Paramètres manquants', 400);
  }

  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const { error } = await ctx.supabase
    .from('lots_chantier')
    .delete()
    .eq('id', params.lotId)
    .eq('chantier_id', params.id!);

  if (error) {
    console.error('[api/chantier/lots DELETE] error:', error.message);
    return jsonError('Erreur lors de la suppression', 500);
  }

  return jsonOk({ success: true });
};

export const OPTIONS: APIRoute = () => optionsResponse();
