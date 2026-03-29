export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';
import { estimateMissingPlanningData } from '@/lib/planningUtils';

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
    .select('date_debut_chantier, date_fin_souhaitee')
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
    dateFinSouhaitee: chantier?.date_fin_souhaitee ?? null,
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
    if (typeof lot.date_debut === 'string') update.date_debut = lot.date_debut;
    if (typeof lot.date_fin === 'string') update.date_fin = lot.date_fin;

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

  // 3. Recalculer les dates — SAUF pour les lots qui ont des dates explicites dans le body
  //    (déplacement manuel = dates directes, pas de recalcul en cascade)
  const lotsWithExplicitDates = new Set<string>();
  for (const lot of lotUpdates) {
    if (typeof lot.id === 'string' && (typeof lot.date_debut === 'string' || typeof lot.date_fin === 'string')) {
      lotsWithExplicitDates.add(lot.id);
    }
  }

  // Si le body ne contient QUE des lots avec dates explicites (= move), pas de recalcul global
  const needsGlobalRecalc = lotUpdates.length === 0
    || lotUpdates.some(l => typeof l.id === 'string' && !lotsWithExplicitDates.has(l.id as string) && (typeof l.duree_jours === 'number' || typeof l.ordre_planning === 'number'))
    || typeof body.dateDebutChantier === 'string';

  if (needsGlobalRecalc) {
    const { data: chantier } = await ctx.supabase
      .from('chantiers')
      .select('date_debut_chantier')
      .eq('id', chantierId)
      .single();

    const startDateStr = typeof body.dateDebutChantier === 'string'
      ? body.dateDebutChantier
      : chantier?.date_debut_chantier;

    if (startDateStr) {
      const { data: allLots } = await ctx.supabase
        .from('lots_chantier')
        .select('id, nom, emoji, role, job_type, duree_jours, ordre_planning, parallel_group, ordre')
        .eq('chantier_id', chantierId)
        .order('ordre', { ascending: true });

      if (allLots && allLots.length > 0) {
        // Auto-estimer les durées et ordres manquants
        const lotsNeedEstimate = allLots.some(l => l.duree_jours == null || l.ordre_planning == null);
        if (lotsNeedEstimate) {
          const estimated = estimateMissingPlanningData(allLots as any);
          for (const lot of estimated) {
            const original = allLots.find(l => l.id === lot.id);
            if (original && (original.duree_jours == null || original.ordre_planning == null)) {
              await ctx.supabase
                .from('lots_chantier')
                .update({
                  duree_jours: lot.duree_jours,
                  ordre_planning: lot.ordre_planning,
                  parallel_group: lot.parallel_group,
                })
                .eq('id', lot.id);
              original.duree_jours = lot.duree_jours;
              original.ordre_planning = lot.ordre_planning;
              original.parallel_group = lot.parallel_group;
            }
          }
        }

        const { computePlanningDates } = await import('@/lib/planningUtils');
        const startDate = new Date(startDateStr);
        const computed = computePlanningDates(allLots as any, startDate);

        // Update dates — SAUF les lots déplacés manuellement
        for (const lot of computed) {
          if (lot.date_debut && lot.date_fin && !lotsWithExplicitDates.has(lot.id)) {
            await ctx.supabase
              .from('lots_chantier')
              .update({ date_debut: lot.date_debut, date_fin: lot.date_fin })
              .eq('id', lot.id);
          }
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
