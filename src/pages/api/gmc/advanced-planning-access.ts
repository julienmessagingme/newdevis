export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, requireAuth } from '@/lib/api/apiHelpers';
import { getAdvancedPlanningAccess } from '@/lib/auth/advancedPlanningAccess';

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');

/**
 * GET /api/gmc/advanced-planning-access
 * Renvoie { allowed, reason } pour que l'UI affiche le toggle "Avancé" déverrouillé
 * ou verrouillé. La SÉCURITÉ réelle reste le garde serveur requireAdvancedPlanning
 * sur les écritures de sous-phases (cet endpoint n'est que cosmétique).
 */
export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const access = await getAdvancedPlanningAccess(ctx.supabase, ctx.user.id, ctx.user.email);
  return jsonOk(access);
};
