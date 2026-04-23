export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuthOrAgent } from '@/lib/apiHelpers';
import { estimateMissingPlanningData, computePlanningDates } from '@/lib/planningUtils';

/**
 * POST /api/chantier/[id]/lots
 * Crée un lot individuel dans un chantier.
 * Body: { nom: string, emoji?: string, jobType?: string }
 * Auto-estime duree_jours/ordre_planning/parallel_group pour que le lot apparaisse
 * immédiatement dans le planning Gantt (utilise TRADE_DURATIONS via nom).
 */
export const POST: APIRoute = async ({ request, params }) => {
  const ctx = await requireChantierAuthOrAgent(request, params.id!);
  if (ctx instanceof Response) return ctx;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError('Corps de requête invalide', 400);
  }

  const nom = typeof body.nom === 'string' ? body.nom.trim() : '';
  if (!nom) {
    return jsonError('Le nom du lot est requis', 400);
  }

  const { data, error } = await ctx.supabase
    .from('lots_chantier')
    .insert({
      chantier_id: params.id!,
      nom,
      emoji: typeof body.emoji === 'string' ? body.emoji : null,
      job_type: typeof body.jobType === 'string' ? body.jobType : null,
      statut: 'a_trouver',
    })
    .select('id, nom, emoji, job_type, statut')
    .single();

  if (error) {
    console.error('[api/chantier/lots POST] error:', error.message);
    return jsonError('Erreur lors de la création du lot', 500);
  }

  // Auto-remplit durée manquante + crée dépendances par défaut basées sur
  // l'ordre métier BTP (TRADE_DURATIONS). Puis recompute les dates.
  try {
    const { data: allLots } = await ctx.supabase
      .from('lots_chantier')
      .select('id, nom, role, job_type, statut, ordre, duree_jours, delai_avant_jours')
      .eq('chantier_id', params.id!);

    if (allLots && allLots.length > 0) {
      const { inferDefaultPredecessors } = await import('@/lib/planningUtils');
      const enriched = estimateMissingPlanningData(allLots as any);
      const durationUpdates = enriched
        .filter(lot => {
          const orig = allLots.find((l: any) => l.id === lot.id);
          return orig && (orig.duree_jours == null || (orig.duree_jours as number) <= 0);
        })
        .map(lot => ctx.supabase.from('lots_chantier').update({
          duree_jours: lot.duree_jours,
        }).eq('id', lot.id));
      if (durationUpdates.length > 0) await Promise.all(durationUpdates);

      // Dépendances par défaut pour le NOUVEAU lot (s'il n'en a pas déjà)
      const newLotId = data?.id as string | undefined;
      if (newLotId) {
        const { data: existingDeps } = await ctx.supabase
          .from('lot_dependencies')
          .select('lot_id')
          .eq('lot_id', newLotId)
          .limit(1);
        const hasDeps = Array.isArray(existingDeps) && existingDeps.length > 0;
        if (!hasDeps) {
          const newLot = enriched.find(l => l.id === newLotId);
          const others = enriched.filter(l => l.id !== newLotId);
          if (newLot) {
            const predIds = inferDefaultPredecessors(newLot, others);
            if (predIds.length > 0) {
              await ctx.supabase
                .from('lot_dependencies')
                .insert(predIds.map(pid => ({ lot_id: newLotId, depends_on_id: pid })));
            }
          }
        }
      }

      // Recompute dates avec les deps courantes
      const { data: chantier } = await ctx.supabase
        .from('chantiers').select('date_debut_chantier').eq('id', params.id!).single();
      if (chantier?.date_debut_chantier) {
        const { data: depsRows } = await ctx.supabase
          .from('lot_dependencies')
          .select('lot_id, depends_on_id')
          .in('lot_id', enriched.map(l => l.id));
        const depsMap = new Map<string, Set<string>>();
        for (const row of (depsRows ?? []) as Array<{ lot_id: string; depends_on_id: string }>) {
          if (!depsMap.has(row.lot_id)) depsMap.set(row.lot_id, new Set());
          depsMap.get(row.lot_id)!.add(row.depends_on_id);
        }
        const computed = computePlanningDates(enriched as any, new Date(chantier.date_debut_chantier), depsMap);
        const dateUpdates = computed
          .filter(lot => lot.date_debut && lot.date_fin)
          .map(lot => ctx.supabase.from('lots_chantier')
            .update({ date_debut: lot.date_debut, date_fin: lot.date_fin })
            .eq('id', lot.id));
        if (dateUpdates.length > 0) await Promise.all(dateUpdates);
      }
    }
  } catch (e) {
    console.warn('[api/chantier/lots POST] auto-planning failed:', e instanceof Error ? e.message : e);
  }

  // Invalidate agent context cache (new lot = stale context)
  ctx.supabase.from('agent_context_cache')
    .update({ invalidated: true })
    .eq('chantier_id', params.id!)
    .then(() => {}).catch(() => {});

  return jsonOk({ lot: data }, 201);
};

/**
 * PATCH /api/chantier/[id]/lots
 * Met à jour un lot (statut, nom). Utilisé par l'agent IA via update_lot_status.
 * Body: { lot_id: string, statut?: string, nom?: string }
 */
export const PATCH: APIRoute = async ({ request, params }) => {
  const ctx = await requireChantierAuthOrAgent(request, params.id!);
  if (ctx instanceof Response) return ctx;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return jsonError('Corps invalide', 400); }

  const lotId = typeof body.lot_id === 'string' ? body.lot_id : '';
  if (!lotId) return jsonError('lot_id requis', 400);

  const VALID_STATUTS = ['a_trouver', 'a_faire', 'en_cours', 'termine'];
  const patch: Record<string, unknown> = {};
  if (typeof body.statut === 'string' && VALID_STATUTS.includes(body.statut)) patch.statut = body.statut;
  if (typeof body.nom === 'string' && body.nom.trim()) patch.nom = body.nom.trim();

  if (Object.keys(patch).length === 0) return jsonError('Aucun champ valide à mettre à jour', 400);

  const { data, error } = await ctx.supabase
    .from('lots_chantier')
    .update(patch)
    .eq('id', lotId)
    .eq('chantier_id', params.id!)
    .select('id, nom, statut')
    .single();

  if (error) {
    console.error('[api/chantier/lots PATCH] error:', error.message);
    return jsonError('Erreur lors de la mise à jour du lot', 500);
  }

  // Invalidate agent context cache
  ctx.supabase.from('agent_context_cache')
    .update({ invalidated: true })
    .eq('chantier_id', params.id!)
    .then(() => {}).catch(() => {});

  return jsonOk({ lot: data });
};

// ── GET /api/chantier/[id]/lots ──────────────────────────────────────────────
// Liste les lots réels du chantier depuis lots_chantier (pas les fallback metadata).

export const GET: APIRoute = async ({ request, params }) => {
  const ctx = await requireChantierAuthOrAgent(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const { data: lots, error } = await ctx.supabase
    .from('lots_chantier')
    .select('id, nom, emoji, statut, ordre, job_type, role')
    .eq('chantier_id', params.id!)
    .order('ordre', { ascending: true });

  if (error) {
    console.error('[api/chantier/lots GET] error:', error.message);
    return jsonError('Erreur chargement lots', 500);
  }

  return jsonOk({ lots: lots ?? [] });
};

export const OPTIONS: APIRoute = () => optionsResponse();
