export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireAuth, parseJsonBody } from '@/lib/apiHelpers';
import type { ArtisanIA, ChantierIAResult } from '@/types/chantier-ia';

/** POST /api/chantier/sauvegarder — Sauvegarde le résultat IA en base */
export const POST: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  const rawBody = await parseJsonBody<{ result: ChantierIAResult }>(request);
  if (rawBody instanceof Response) return rawBody;

  const result = rawBody.result;
  if (!result?.nom) {
    return jsonError('Corps de requête invalide', 400);
  }

  const { artisans, aides, formalites, roadmap, taches, ...rest } = result;
  const metadonnees = JSON.stringify({
    // Tableaux (lot 1)
    artisans,
    roadmap,
    formalites,
    aides,
    // Champs scalaires manquants — lot 2
    lignesBudget:      result.lignesBudget       ?? [],
    prochaineAction:   result.prochaineAction,
    description:       result.description        ?? '',
    dureeEstimeeMois:  result.dureeEstimeeMois    ?? 0,
    financement:       result.financement         ?? 'apport',
    // Signaux de fiabilité — lot 8A
    estimationSignaux: result.estimationSignaux  ?? null,
  });

  // Créer le chantier
  const { data: chantier, error: insertError } = await supabase
    .from('chantiers')
    .insert({
      user_id: user.id,
      nom: result.nom,
      emoji: result.emoji,
      budget: result.budgetTotal,
      phase: 'preparation',
      type_projet: result.typeProjet,
      mensualite: result.mensualite ?? null,
      duree_credit: result.dureeCredit ?? null,
      metadonnees,
    })
    .select('id')
    .single();

  if (insertError || !chantier) {
    console.error('[api/chantier/sauvegarder] insert error:', insertError?.message);
    return jsonError('Erreur lors de la création du chantier', 500);
  }

  const chantierId = chantier.id;

  // Créer les lots depuis les artisans IA — même pattern que les todos
  if (Array.isArray(artisans) && artisans.length > 0) {
    const { error: lotsError } = await supabase.from('lots_chantier').insert(
      (artisans as ArtisanIA[]).map((a, i) => ({
        chantier_id: chantierId,
        nom: a.metier,
        statut: a.statut,
        ordre: i,
        emoji: a.emoji ?? null,
        role: a.role ?? null,
        // Planning IA
        duree_jours: a.duree_jours_estime ?? null,
        ordre_planning: a.ordre_planning ?? (i + 1),
        parallel_group: a.parallel_group ?? null,
      })),
    );
    if (lotsError) {
      console.error('[api/chantier/sauvegarder] lots error:', lotsError.message);
    }

    // ── Enrichissement budget : lookup market_prices par job_type ─────────────
    try {
      const artisansWithJobType = (artisans as ArtisanIA[]).filter(
        (a) => a.job_type && a.quantite && a.quantite > 0,
      );

      if (artisansWithJobType.length > 0) {
        const jobTypes = artisansWithJobType.map((a) => a.job_type as string);

        const { data: prices, error: pricesError } = await supabase
          .from('market_prices')
          .select(
            'job_type, unit, price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht,' +
            'fixed_min_ht, fixed_avg_ht, fixed_max_ht, ratio_materiaux, ratio_main_oeuvre',
          )
          .in('job_type', jobTypes);

        if (pricesError) {
          console.error('[api/chantier/sauvegarder] market_prices lookup error:', pricesError.message);
        } else if (prices && prices.length > 0) {
          const priceMap = new Map(prices.map((p) => [p.job_type, p]));

          for (const artisan of artisansWithJobType ?? []) {
            const price = priceMap.get(artisan.job_type as string);
            if (!artisan.quantite) continue;
            if (!price) {
              console.warn('[api/chantier/sauvegarder] market price not found for job_type:', artisan.job_type);
              continue;
            }

            const q          = artisan.quantite;
            const rM         = Number(price.ratio_materiaux   ?? 0.40);
            const rMO        = Number(price.ratio_main_oeuvre ?? 0.55);
            const ratioTotal = rM + rMO;
            const safeRM     = ratioTotal >= 1 ? 0.40 : rM;
            const safeRMO    = ratioTotal >= 1 ? 0.55 : rMO;

            const calcBudget = (unitP: number | null, fixed: number | null) =>
              q * (Number(unitP) || 0) + (Number(fixed) || 0);

            const budgetMin = calcBudget(price.price_min_unit_ht, price.fixed_min_ht);
            const budgetAvg = calcBudget(price.price_avg_unit_ht, price.fixed_avg_ht);
            const budgetMax = calcBudget(price.price_max_unit_ht, price.fixed_max_ht);

            const { error: updateError } = await supabase
              .from('lots_chantier')
              .update({
                job_type:       artisan.job_type,
                quantite:       q,
                unite:          price.unit ?? null,
                budget_min_ht:  Math.round(budgetMin),
                budget_avg_ht:  Math.round(budgetAvg),
                budget_max_ht:  Math.round(budgetMax),
                materiaux_ht:   Math.round(budgetAvg * safeRM),
                main_oeuvre_ht: Math.round(budgetAvg * safeRMO),
                divers_ht:      Math.round(budgetAvg * Math.max(0, 1 - safeRM - safeRMO)),
              })
              .eq('chantier_id', chantierId)
              .eq('nom', artisan.metier);

            if (updateError) {
              console.error('[api/chantier/sauvegarder] lot budget update error:', updateError.message);
            }
          }
        }
      }
    } catch (enrichError) {
      console.error('[api/chantier/sauvegarder] enrichissement budget error:', enrichError instanceof Error ? enrichError.message : String(enrichError));
      // Non-bloquant : le chantier est sauvegardé, l'enrichissement échoue silencieusement
    }

    // ── Calcul des dates du planning ──────────────────────────────────────────
    try {
      const dateDebutChantier = result?.dateDebutChantier as string | null | undefined;
      if (dateDebutChantier) {
        // Stocker la date de début sur le chantier
        await supabase.from('chantiers').update({ date_debut_chantier: dateDebutChantier }).eq('id', chantierId);

        // Récupérer les lots créés pour calculer les dates
        const { data: lotsForPlanning } = await supabase
          .from('lots_chantier')
          .select('id, duree_jours, ordre_planning, parallel_group')
          .eq('chantier_id', chantierId)
          .order('ordre_planning', { ascending: true, nullsFirst: false });

        if (lotsForPlanning && lotsForPlanning.length > 0) {
          const { computePlanningDates } = await import('@/lib/planningUtils');
          const computed = computePlanningDates(lotsForPlanning as any, new Date(dateDebutChantier));
          for (const lot of computed) {
            if (lot.date_debut && lot.date_fin) {
              await supabase.from('lots_chantier')
                .update({ date_debut: lot.date_debut, date_fin: lot.date_fin })
                .eq('id', lot.id);
            }
          }
        }
      }
    } catch (planningError) {
      console.error('[api/chantier/sauvegarder] planning dates error:', planningError instanceof Error ? planningError.message : String(planningError));
    }
  }

  // Créer les todos
  if (taches?.length) {
    const { error: todosError } = await supabase.from('todo_chantier').insert(
      taches.map((t, i) => ({
        chantier_id: chantierId,
        titre: t.titre,
        priorite: t.priorite,
        done: t.done,
        ordre: i,
      }))
    );
    if (todosError) {
      console.error('[api/chantier/sauvegarder] todos error:', todosError.message);
    }
  }

  return jsonOk({ chantierId, success: true }, 201);
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
