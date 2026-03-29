export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';

/**
 * GET /api/chantier/[id]/planning
 * Retourne les lots avec champs planning + date_debut_chantier.
 */
export const GET: APIRoute = async ({ request, params }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  // Date de début du chantier
  const { data: chantier } = await ctx.supabase
    .from('chantiers')
    .select('date_debut_chantier')
    .eq('id', params.id!)
    .single();

  // Lots avec champs planning
  const { data: lots, error } = await ctx.supabase
    .from('lots_chantier')
    .select('id, nom, emoji, role, statut, ordre, duree_jours, date_debut, date_fin, ordre_planning, parallel_group, budget_min_ht, budget_avg_ht, budget_max_ht')
    .eq('chantier_id', params.id!)
    .order('ordre_planning', { ascending: true, nullsFirst: false })
    .order('ordre', { ascending: true });

  if (error) {
    console.error('[api/chantier/planning GET] error:', error.message);
    return jsonError('Erreur lors de la récupération du planning', 500);
  }

  return jsonOk({
    dateDebutChantier: chantier?.date_debut_chantier ?? null,
    lots: lots ?? [],
  });
};

/**
 * PATCH /api/chantier/[id]/planning
 * Met à jour le planning : dates, durées, ordres, groupes parallèles.
 * Body: {
 *   dateDebutChantier?: string (ISO date),
 *   lots?: Array<{ id: string, duree_jours?: number, ordre_planning?: number, parallel_group?: number | null }>
 * }
 * Recalcule automatiquement les date_debut/date_fin de chaque lot.
 */
export const PATCH: APIRoute = async ({ request, params }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError('Corps de requête invalide', 400);
  }

  const chantierId = params.id!;

  // 1. Mettre à jour date_debut_chantier si fournie
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

  // 2. Mettre à jour les lots individuellement
  const lotUpdates = Array.isArray(body.lots) ? body.lots as Array<Record<string, unknown>> : [];

  for (const lot of lotUpdates) {
    if (typeof lot.id !== 'string') continue;

    const update: Record<string, unknown> = {};
    if (typeof lot.duree_jours === 'number') update.duree_jours = lot.duree_jours;
    if (typeof lot.ordre_planning === 'number') update.ordre_planning = lot.ordre_planning;
    if ('parallel_group' in lot) update.parallel_group = lot.parallel_group;

    if (Object.keys(update).length === 0) continue;

    const { error } = await ctx.supabase
      .from('lots_chantier')
      .update(update)
      .eq('id', lot.id)
      .eq('chantier_id', chantierId);

    if (error) {
      console.error(`[api/chantier/planning PATCH] lot ${lot.id} error:`, error.message);
    }
  }

  // 3. Recalculer les dates si on a une date de début
  const { data: chantier } = await ctx.supabase
    .from('chantiers')
    .select('date_debut_chantier')
    .eq('id', chantierId)
    .single();

  const startDateStr = typeof body.dateDebutChantier === 'string'
    ? body.dateDebutChantier
    : chantier?.date_debut_chantier;

  if (startDateStr) {
    // Récupérer tous les lots mis à jour
    const { data: allLots } = await ctx.supabase
      .from('lots_chantier')
      .select('id, duree_jours, ordre_planning, parallel_group')
      .eq('chantier_id', chantierId)
      .order('ordre_planning', { ascending: true, nullsFirst: false });

    if (allLots && allLots.length > 0) {
      // Import dynamique pour éviter les problèmes de module dans Astro SSR
      const { computePlanningDates } = await import('@/lib/planningUtils');
      const startDate = new Date(startDateStr);
      const computed = computePlanningDates(allLots as any, startDate);

      // Batch update des dates calculées
      for (const lot of computed) {
        if (lot.date_debut && lot.date_fin) {
          await ctx.supabase
            .from('lots_chantier')
            .update({ date_debut: lot.date_debut, date_fin: lot.date_fin })
            .eq('id', lot.id);
        }
      }
    }
  }

  // 4. Retourner le planning mis à jour
  const { data: updatedLots } = await ctx.supabase
    .from('lots_chantier')
    .select('id, nom, emoji, role, statut, ordre, duree_jours, date_debut, date_fin, ordre_planning, parallel_group, budget_min_ht, budget_avg_ht, budget_max_ht')
    .eq('chantier_id', chantierId)
    .order('ordre_planning', { ascending: true, nullsFirst: false })
    .order('ordre', { ascending: true });

  return jsonOk({
    dateDebutChantier: startDateStr ?? null,
    lots: updatedLots ?? [],
  });
};

export const OPTIONS: APIRoute = async () => optionsResponse();
