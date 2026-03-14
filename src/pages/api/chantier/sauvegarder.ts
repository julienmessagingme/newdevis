export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import type { ArtisanIA, ChantierIAResult } from '@/types/chantier-ia';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

/** POST /api/chantier/sauvegarder — Sauvegarde le résultat IA en base */
export const POST: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });
  }

  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Token invalide' }), { status: 401, headers: CORS });
  }

  let result: ChantierIAResult;
  try {
    const body = await request.json();
    result = body.result;
    if (!result?.nom) throw new Error('result.nom manquant');
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Corps de requête invalide' }), { status: 400, headers: CORS });
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
    return new Response(JSON.stringify({ error: 'Erreur lors de la création du chantier' }), { status: 500, headers: CORS });
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

  return new Response(JSON.stringify({ chantierId, success: true }), { status: 201, headers: CORS });
};

export const OPTIONS: APIRoute = () =>
  new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST,OPTIONS' } });
