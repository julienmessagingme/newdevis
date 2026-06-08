export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuthOrAgent, logChantierActivity } from '@/lib/api/apiHelpers';
import type { DependencyMap } from '@/lib/chantier/planningUtils';
import type { Subphase } from '@/types/chantier-ia';
import { recomputeChantierDates, loadSubphases, loadSubphaseDeps } from '@/lib/chantier/planningServer';

type LotRow = {
  id: string;
  chantier_id?: string;
  nom?: string | null;
  emoji?: string | null;
  role?: string | null;
  job_type?: string | null;
  statut?: string | null;
  ordre?: number | null;
  duree_jours?: number | null;
  delai_avant_jours?: number | null;
  date_debut?: string | null;
  date_fin?: string | null;
  ordre_planning?: number | null;
  parallel_group?: number | null;
  lane_index?: number | null;
  budget_min_ht?: number | null;
  budget_avg_ht?: number | null;
  budget_max_ht?: number | null;
};

const LOT_SELECT =
  'id, nom, emoji, role, statut, ordre, duree_jours, date_debut, date_fin, ordre_planning, parallel_group, delai_avant_jours, lane_index, budget_min_ht, budget_avg_ht, budget_max_ht';

async function loadDependencies(
  supabase: { from: (table: string) => unknown },
  lotIds: string[],
): Promise<DependencyMap> {
  const deps = new Map<string, Set<string>>();
  if (lotIds.length === 0) return deps;
  const { data } = await (supabase as any)
    .from('lot_dependencies')
    .select('lot_id, depends_on_id')
    .in('lot_id', lotIds);
  for (const row of (data ?? []) as Array<{ lot_id: string; depends_on_id: string }>) {
    if (!deps.has(row.lot_id)) deps.set(row.lot_id, new Set());
    deps.get(row.lot_id)!.add(row.depends_on_id);
  }
  return deps;
}

function depsToJSON(deps: DependencyMap): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of deps) out[k] = Array.from(v);
  return out;
}

function groupSubphasesByLot(subs: Subphase[]): Record<string, Subphase[]> {
  const out: Record<string, Subphase[]> = {};
  for (const s of subs) (out[s.lot_id] ??= []).push(s);
  return out;
}

/**
 * GET /api/chantier/[id]/planning
 * Retourne les lots + leur graphe de dépendances + date_debut_chantier.
 */
export const GET: APIRoute = async ({ request, params }) => {
  const ctx = await requireChantierAuthOrAgent(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const [chantierRes, lotsRes] = await Promise.all([
    ctx.supabase
      .from('chantiers')
      .select('date_debut_chantier, date_fin_souhaitee')
      .eq('id', params.id!)
      .single(),
    ctx.supabase
      .from('lots_chantier')
      .select(LOT_SELECT)
      .eq('chantier_id', params.id!)
      .order('ordre', { ascending: true }),
  ]);

  if (lotsRes.error) {
    console.error('[api/chantier/planning GET] error:', lotsRes.error.message);
    return jsonError('Erreur lors de la récupération du planning', 500);
  }

  const chantier = chantierRes.data;
  const lots = (lotsRes.data ?? []) as LotRow[];
  const [deps, subphases, subphaseDeps] = await Promise.all([
    loadDependencies(ctx.supabase, lots.map(l => l.id)),
    loadSubphases(ctx.supabase, params.id!),
    loadSubphaseDeps(ctx.supabase, params.id!),
  ]);

  return jsonOk({
    dateDebutChantier: chantier?.date_debut_chantier ?? null,
    dateFinSouhaitee: chantier?.date_fin_souhaitee ?? null,
    lots,
    dependencies: depsToJSON(deps),
    subphases: groupSubphasesByLot(subphases),
    subphaseDeps,
  });
};

/**
 * PATCH /api/chantier/[id]/planning
 *
 * Body:
 * {
 *   dateDebutChantier?: string (ISO date),
 *   lots?: Array<{ id, duree_jours?, delai_avant_jours? }>,
 *   dependencies?: Record<string, string[]>   // lot_id → full list of depends_on_ids
 * }
 *
 * Recalcule TOUTES les dates par tri topologique (CPM) quand quoi que ce soit
 * de structurel change (durée, délai, deps, date de début).
 */
export const PATCH: APIRoute = async ({ request, params }) => {
  const ctx = await requireChantierAuthOrAgent(request, params.id!);
  if (ctx instanceof Response) return ctx;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError('Corps de requête invalide', 400);
  }

  const chantierId = params.id!;

  // 1. date_debut_chantier + date_fin_souhaitee (objectif persistant)
  {
    const chantierPatch: Record<string, string> = {};
    if (typeof body.dateDebutChantier === 'string') chantierPatch.date_debut_chantier = body.dateDebutChantier;
    if (typeof body.dateFinSouhaitee === 'string')  chantierPatch.date_fin_souhaitee  = body.dateFinSouhaitee;
    if (Object.keys(chantierPatch).length > 0) {
      const { error } = await ctx.supabase
        .from('chantiers')
        .update(chantierPatch)
        .eq('id', chantierId);
      if (error) {
        console.error('[api/chantier/planning PATCH] chantier update error:', error.message);
        return jsonError('Erreur lors de la mise à jour des dates du chantier', 500);
      }
    }
  }

  // 2. Updates per-lot (durée / délai uniquement — dates dérivées)
  const lotUpdates = Array.isArray(body.lots) ? (body.lots as Array<Record<string, unknown>>) : [];

  // Pré-calcule les lots qui envoient date_debut sans delai_avant_jours (legacy
  // tool update_lot_dates). On convertit date_debut → delai_avant_jours pour
  // que le tool legacy fonctionne même sans redeployer l'edge function.
  const legacyDatedLotIds = lotUpdates
    .filter(lot => typeof lot.id === 'string' && typeof lot.date_debut === 'string' && typeof lot.delai_avant_jours !== 'number')
    .map(lot => lot.id as string);

  const legacyCurrentDates = new Map<string, { date_debut: string; delai_avant_jours: number | null }>();
  if (legacyDatedLotIds.length > 0) {
    const { data: curRows } = await ctx.supabase
      .from('lots_chantier')
      .select('id, date_debut, delai_avant_jours')
      .in('id', legacyDatedLotIds)
      .eq('chantier_id', chantierId);
    for (const row of (curRows ?? []) as Array<{ id: string; date_debut: string | null; delai_avant_jours: number | null }>) {
      if (row.date_debut) {
        legacyCurrentDates.set(row.id, { date_debut: row.date_debut, delai_avant_jours: row.delai_avant_jours });
      }
    }
  }

  const lotUpdatePromises = lotUpdates
    .filter(lot => typeof lot.id === 'string')
    .map(lot => {
      const update: Record<string, unknown> = {};
      if (typeof lot.duree_jours === 'number') update.duree_jours = lot.duree_jours;
      if (typeof lot.delai_avant_jours === 'number') update.delai_avant_jours = lot.delai_avant_jours;
      if ('lane_index' in lot) update.lane_index = lot.lane_index;
      // Compat legacy : convertit date_debut → delai_avant_jours
      if (typeof lot.date_debut === 'string' && typeof update.delai_avant_jours !== 'number') {
        const cur = legacyCurrentDates.get(lot.id as string);
        if (cur) {
          const old = new Date(cur.date_debut);
          const target = new Date(lot.date_debut as string);
          const diffCalDays = Math.round((target.getTime() - old.getTime()) / (24 * 60 * 60 * 1000));
          // Conversion calendaire → jours ouvrés (approximation 5/7)
          const diffBizDays = Math.round(diffCalDays * 5 / 7);
          if (diffBizDays !== 0) {
            update.delai_avant_jours = (cur.delai_avant_jours ?? 0) + diffBizDays;
          }
        }
      }
      if (Object.keys(update).length === 0) return null;
      return ctx.supabase.from('lots_chantier').update(update).eq('id', lot.id as string).eq('chantier_id', chantierId);
    })
    .filter(Boolean);

  const results = await Promise.all(lotUpdatePromises);
  for (const r of results) {
    if (r && typeof r === 'object' && 'error' in r && (r as { error: unknown }).error) {
      console.error('[api/chantier/planning PATCH] lot update error:', (r as { error: { message?: string } }).error);
    }
  }

  // 3. Dépendances — body.dependencies = { lot_id: [depends_on_id,...] }
  //    Pour chaque lot listé : on remplace ses prédécesseurs en BDD (delete puis insert).
  const depsInput = (body.dependencies && typeof body.dependencies === 'object')
    ? (body.dependencies as Record<string, unknown>)
    : null;

  let anyDepsChanged = false;
  if (depsInput) {
    // Validation + normalisation upfront : (lot_id, [depends_on_ids])
    const wantedByLot = new Map<string, Set<string>>();
    for (const [lotId, depIdsRaw] of Object.entries(depsInput)) {
      if (typeof lotId !== 'string') continue;
      if (!Array.isArray(depIdsRaw)) continue;
      const cleanDeps = depIdsRaw.filter(
        (d): d is string => typeof d === 'string' && d !== lotId,
      );
      wantedByLot.set(lotId, new Set(cleanDeps));
    }

    if (wantedByLot.size > 0) {
      const lotIds = Array.from(wantedByLot.keys());

      // 1 SELECT global pour tous les lots concernés.
      const { data: currentRows } = await ctx.supabase
        .from('lot_dependencies')
        .select('lot_id, depends_on_id')
        .in('lot_id', lotIds);

      const currentByLot = new Map<string, Set<string>>();
      for (const row of (currentRows ?? []) as Array<{ lot_id: string; depends_on_id: string }>) {
        let entry = currentByLot.get(row.lot_id);
        if (!entry) { entry = new Set(); currentByLot.set(row.lot_id, entry); }
        entry.add(row.depends_on_id);
      }

      // Diff en mémoire : nouvelles paires à insérer + paires obsolètes par lot.
      const rowsToInsert: Array<{ lot_id: string; depends_on_id: string }> = [];
      const toDeleteByLot = new Map<string, string[]>();
      for (const [lotId, wantedSet] of wantedByLot.entries()) {
        const currentSet = currentByLot.get(lotId) ?? new Set<string>();
        for (const depId of currentSet) {
          if (!wantedSet.has(depId)) {
            const arr = toDeleteByLot.get(lotId) ?? [];
            arr.push(depId);
            toDeleteByLot.set(lotId, arr);
          }
        }
        for (const depId of wantedSet) {
          if (!currentSet.has(depId)) rowsToInsert.push({ lot_id: lotId, depends_on_id: depId });
        }
      }

      // ── Ordre INSERT-then-DELETE pour garantir un état dégradé safe ─────────
      // Si l'INSERT échoue, on conserve les anciennes deps (pas de perte).
      // Si l'INSERT réussit mais le DELETE échoue, on a des deps stales (les
      // anciennes coexistent avec les nouvelles) — incohérent mais réparable
      // au prochain edit user. C'est BIEN MIEUX que l'inverse (DELETE puis
      // INSERT échoue = lot avec 0 dépendance alors qu'il devrait en avoir).
      // Pas de transaction PostgREST pure côté JS Supabase — pour vraiment
      // atomiser il faudrait une RPC SQL dédiée (à faire si bug détecté).

      // 1 INSERT batch idempotent (PK composite (lot_id, depends_on_id)).
      if (rowsToInsert.length > 0) {
        const { error: insertErr } = await ctx.supabase
          .from('lot_dependencies')
          .upsert(rowsToInsert, { onConflict: 'lot_id,depends_on_id', ignoreDuplicates: true });
        if (insertErr) {
          console.error('[planning] lot_dependencies insert failed:', insertErr.message);
          // On bail-out : ne pas tenter le DELETE si l'INSERT a échoué, sinon
          // on aggrave l'état (perte des anciennes ET pas de nouvelles).
          throw new Error(`Erreur dépendances : ${insertErr.message}`);
        }
        anyDepsChanged = true;
      }

      // DELETE des paires obsolètes — un DELETE par lot (filtré par lot_id +
      // depends_on_id IN (...)). Promise.all pour parallélisme.
      if (toDeleteByLot.size > 0) {
        const deleteResults = await Promise.all(
          Array.from(toDeleteByLot.entries()).map(([lotId, depIds]) =>
            ctx.supabase
              .from('lot_dependencies')
              .delete()
              .eq('lot_id', lotId)
              .in('depends_on_id', depIds),
          ),
        );
        for (const r of deleteResults) {
          if (r.error) {
            console.error('[planning] lot_dependencies delete partial fail:', r.error.message);
            // On ne throw pas : les nouvelles deps sont déjà en place,
            // on accepte un état "stale mais cohérent" plutôt qu'un erreur 500.
          }
        }
        anyDepsChanged = true;
      }
    }
  }

  // 4. Récupère startDate (réponse + recalc)
  const { data: chantierRow } = await ctx.supabase
    .from('chantiers')
    .select('date_debut_chantier, date_fin_souhaitee')
    .eq('id', chantierId)
    .single();

  const startDateStr = typeof body.dateDebutChantier === 'string'
    ? body.dateDebutChantier
    : chantierRow?.date_debut_chantier;

  // 5. Recalcul global si quoi que ce soit a changé structurellement
  const structuralLotChange = lotUpdates.some(l =>
    typeof l.id === 'string' && (
      typeof l.duree_jours === 'number'
      || typeof l.delai_avant_jours === 'number'
      || typeof l.date_debut === 'string' // compat legacy tool update_lot_dates
    ),
  );
  const needsGlobalRecalc = anyDepsChanged
    || structuralLotChange
    || typeof body.dateDebutChantier === 'string'
    || (lotUpdates.length === 0 && !depsInput); // PATCH vide = "recompact"

  if (needsGlobalRecalc && startDateStr) {
    // Recompute subphase-aware : CPM simple si aucune sous-phase (comportement
    // historique identique), CPM avancé + persistance des dates sous-phases sinon.
    await recomputeChantierDates(ctx.supabase, chantierId, new Date(startDateStr));
  }

  // 6. Retourne l'état final
  const { data: finalLots } = await ctx.supabase
    .from('lots_chantier')
    .select(LOT_SELECT)
    .eq('chantier_id', chantierId)
    .order('ordre', { ascending: true });

  const [finalDeps, finalSubphases, finalSubphaseDeps] = await Promise.all([
    loadDependencies(ctx.supabase, (finalLots ?? []).map((l: LotRow) => l.id)),
    loadSubphases(ctx.supabase, chantierId),
    loadSubphaseDeps(ctx.supabase, chantierId),
  ]);

  // Invalidate agent context cache — AWAITED pour que l'invalidation soit
  // committée AVANT que la fonction Vercel se termine. Fire-and-forget peut
  // être coupé côté serverless (bug : cache restait stale après D&D).
  try {
    await ctx.supabase.from('agent_context_cache')
      .update({ invalidated: true })
      .eq('chantier_id', chantierId);
  } catch (e) {
    console.warn('[planning PATCH] cache invalidation failed:', e instanceof Error ? e.message : String(e));
  }

  // 7. Journal — trace les VRAIS changements de planning dans la timeline.
  //    But : un décalage MANUEL dans le Gantt (drag/resize/dépendances) était
  //    invisible dans le Journal (les actions agent y sont déjà via tool_calls).
  //    On NE loggue PAS le recompact pur (PATCH vide) — uniquement un vrai diff.
  {
    const dateDebutChanged = typeof body.dateDebutChantier === 'string';
    const dateFinChanged = typeof body.dateFinSouhaitee === 'string';
    if (structuralLotChange || anyDepsChanged || dateDebutChanged || dateFinChanged) {
      const touchedIds = new Set<string>([
        ...lotUpdates.filter(l => typeof l.id === 'string').map(l => l.id as string),
        ...(depsInput ? Object.keys(depsInput) : []),
      ]);
      const names = (finalLots ?? [])
        .filter((l: LotRow) => touchedIds.has(l.id))
        .map((l: LotRow) => l.nom)
        .filter((n): n is string => typeof n === 'string' && n.length > 0);
      const parts: string[] = [];
      if (structuralLotChange || anyDepsChanged) {
        if (names.length === 0) parts.push('recalcul des dates');
        else if (names.length <= 4) parts.push(`lot(s) : ${names.join(', ')}`);
        else parts.push(`${names.length} lots ajustés`);
      }
      if (dateDebutChanged) parts.push('date de début');
      if (dateFinChanged) parts.push('objectif de livraison');
      await logChantierActivity(chantierId, {
        category: 'status_change',
        actor: ctx.isAgent ? 'agent' : 'user',
        summary: `Planning modifié — ${parts.join(' · ')}`,
        metadata: { source: 'planning_patch' },
      });
    }
  }

  const finSouhaitee = typeof body.dateFinSouhaitee === 'string'
    ? body.dateFinSouhaitee
    : chantierRow?.date_fin_souhaitee ?? null;

  return jsonOk({
    dateDebutChantier: startDateStr ?? null,
    dateFinSouhaitee: finSouhaitee,
    lots: finalLots ?? [],
    dependencies: depsToJSON(finalDeps),
    subphases: groupSubphasesByLot(finalSubphases),
    subphaseDeps: finalSubphaseDeps,
  });
};

export const OPTIONS: APIRoute = async () => optionsResponse();
