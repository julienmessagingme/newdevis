export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth, logChantierActivity } from '@/lib/api/apiHelpers';
import { canUseAdvancedPlanning } from '@/lib/auth/advancedPlanningAccess';
import { recomputeChantierDates, getChantierStartDate, loadSubphases } from '@/lib/chantier/planningServer';

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');

/**
 * POST /api/chantier/[id]/lots/[lotId]/subphases
 * Crée une sous-phase. Réservé premium (requireChantierAuth + canUseAdvancedPlanning).
 */
export const POST: APIRoute = async ({ request, params }) => {
  const chantierId = params.id!;
  const lotId = params.lotId!;

  const ctx = await requireChantierAuth(request, chantierId);
  if (ctx instanceof Response) return ctx;
  if (!(await canUseAdvancedPlanning(ctx.supabase, ctx.user.id, ctx.user.email))) {
    return jsonError('Planning avancé réservé à l\'abonnement premium', 403);
  }

  // Le lot appartient-il bien à ce chantier ?
  const { data: lot } = await ctx.supabase
    .from('lots_chantier')
    .select('id')
    .eq('id', lotId)
    .eq('chantier_id', chantierId)
    .maybeSingle();
  if (!lot) return jsonError('Lot introuvable', 404);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return jsonError('Corps de requête invalide', 400); }

  const nom = typeof body.nom === 'string' ? body.nom.trim() : '';
  if (!nom) return jsonError('Nom de sous-phase requis', 400);

  // Défaut duree_jours = 1 si absent/invalide (sinon le lot conteneur n'aurait
  // pas de dates dérivées — cf. revue étape 1).
  const dureeRaw = typeof body.duree_jours === 'number' ? body.duree_jours : NaN;
  const duree_jours = Number.isFinite(dureeRaw) && dureeRaw > 0 ? Math.round(dureeRaw) : 1;
  const delai_avant_jours = typeof body.delai_avant_jours === 'number' && body.delai_avant_jours >= 0
    ? Math.round(body.delai_avant_jours) : 0;
  const lane_index = typeof body.lane_index === 'number' ? body.lane_index : null;

  // ordre par défaut = max(ordre des sous-phases du lot) + 1
  const existing = await loadSubphases(ctx.supabase, chantierId);
  const ordre = typeof body.ordre === 'number'
    ? body.ordre
    : existing.filter(s => s.lot_id === lotId).reduce((m, s) => Math.max(m, s.ordre ?? 0), -1) + 1;

  const { data: created, error } = await ctx.supabase
    .from('lot_subphases')
    .insert({ lot_id: lotId, chantier_id: chantierId, nom, duree_jours, delai_avant_jours, lane_index, ordre, statut: 'a_faire' })
    .select('*')
    .single();
  if (error || !created) {
    console.error('[subphases POST] insert error:', error?.message);
    return jsonError('Erreur lors de la création de la sous-phase', 500);
  }

  // Recompute si le chantier a une date de début (sinon dates restent nulles).
  const startDate = await getChantierStartDate(ctx.supabase, chantierId);
  if (startDate) await recomputeChantierDates(ctx.supabase, chantierId, startDate);

  await logChantierActivity(chantierId, {
    category: 'status_change',
    actor: 'user',
    summary: `Sous-phase ajoutée — ${nom}`,
    metadata: { source: 'subphase_create', lot_id: lotId },
  });
  try {
    await ctx.supabase.from('agent_context_cache').update({ invalidated: true }).eq('chantier_id', chantierId);
  } catch { /* non-bloquant */ }

  return jsonOk({ subphase: created }, 201);
};
