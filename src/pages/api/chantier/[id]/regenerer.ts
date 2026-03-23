export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import type { ArtisanIA, ChantierIAResult } from '@/types/chantier-ia';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const supabaseUrl     = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseService = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

async function authCtx(request: Request, chantierId: string) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const supabase = createClient(supabaseUrl, supabaseService);
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return null;
  const { data: chantier } = await supabase
    .from('chantiers').select('id').eq('id', chantierId).eq('user_id', user.id).single();
  if (!chantier) return null;
  return supabase;
}

/** PATCH /api/chantier/[id]/regenerer — Met à jour un chantier existant avec un nouveau résultat IA */
export const PATCH: APIRoute = async ({ params, request }) => {
  const id = params.id ?? '';
  const sb = await authCtx(request, id);
  if (!sb) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  let result: ChantierIAResult;
  try {
    const body = await request.json();
    result = body.result;
    if (!result?.nom) throw new Error('result.nom manquant');
  } catch {
    return new Response(JSON.stringify({ error: 'Corps invalide' }), { status: 400, headers: CORS });
  }

  const { artisans, aides, formalites, roadmap, taches, ..._ } = result;

  const metadonnees = JSON.stringify({
    artisans,
    roadmap,
    formalites,
    aides,
    lignesBudget:      result.lignesBudget       ?? [],
    prochaineAction:   result.prochaineAction,
    description:       result.description        ?? '',
    dureeEstimeeMois:  result.dureeEstimeeMois    ?? 0,
    financement:       result.financement         ?? 'apport',
    estimationSignaux: result.estimationSignaux  ?? null,
  });

  // 1. Mettre à jour la table chantiers
  const { error: updateError } = await sb
    .from('chantiers')
    .update({
      nom: result.nom,
      emoji: result.emoji,
      budget: result.budgetTotal,
      type_projet: result.typeProjet,
      mensualite: result.mensualite ?? null,
      duree_credit: result.dureeCredit ?? null,
      metadonnees,
    })
    .eq('id', id);

  if (updateError) {
    return new Response(JSON.stringify({ error: updateError.message }), { status: 500, headers: CORS });
  }

  // 2. Remplacer les lots : supprimer les anciens, insérer les nouveaux
  await sb.from('lots_chantier').delete().eq('chantier_id', id);

  if (Array.isArray(artisans) && artisans.length > 0) {
    const { error: lotsError } = await sb.from('lots_chantier').insert(
      (artisans as ArtisanIA[]).map((a, i) => ({
        chantier_id: id,
        nom: a.metier,
        statut: a.statut,
        ordre: i,
        emoji: a.emoji ?? null,
        role: a.role ?? null,
      })),
    );
    if (lotsError) {
      console.error('[regenerer] lots error:', lotsError.message);
    }

    // Enrichissement budget via market_prices
    try {
      const artisansWithJobType = (artisans as ArtisanIA[]).filter(
        (a) => a.job_type && a.quantite && a.quantite > 0,
      );
      if (artisansWithJobType.length > 0) {
        const jobTypes = artisansWithJobType.map((a) => a.job_type as string);
        const { data: prices } = await sb
          .from('market_prices')
          .select(
            'job_type, unit, price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht,' +
            'fixed_min_ht, fixed_avg_ht, fixed_max_ht, ratio_materiaux, ratio_main_oeuvre',
          )
          .in('job_type', jobTypes);

        if (prices && prices.length > 0) {
          const priceMap = new Map(prices.map((p) => [p.job_type, p]));
          for (const artisan of artisansWithJobType) {
            const price = priceMap.get(artisan.job_type as string);
            if (!price || !artisan.quantite) continue;
            const q = artisan.quantite;
            const rM  = Number(price.ratio_materiaux   ?? 0.40);
            const rMO = Number(price.ratio_main_oeuvre ?? 0.55);
            const rT  = rM + rMO;
            const sRM = rT >= 1 ? 0.40 : rM;
            const sRMO= rT >= 1 ? 0.55 : rMO;
            const calc = (u: number | null, f: number | null) => q * (Number(u) || 0) + (Number(f) || 0);
            await sb.from('lots_chantier').update({
              job_type:       artisan.job_type,
              quantite:       q,
              unite:          price.unit ?? null,
              budget_min_ht:  Math.round(calc(price.price_min_unit_ht, price.fixed_min_ht)),
              budget_avg_ht:  Math.round(calc(price.price_avg_unit_ht, price.fixed_avg_ht)),
              budget_max_ht:  Math.round(calc(price.price_max_unit_ht, price.fixed_max_ht)),
              materiaux_ht:   Math.round(calc(price.price_avg_unit_ht, price.fixed_avg_ht) * sRM),
              main_oeuvre_ht: Math.round(calc(price.price_avg_unit_ht, price.fixed_avg_ht) * sRMO),
              divers_ht:      Math.round(calc(price.price_avg_unit_ht, price.fixed_avg_ht) * Math.max(0, 1 - sRM - sRMO)),
            }).eq('chantier_id', id).eq('nom', artisan.metier);
          }
        }
      }
    } catch (e) {
      console.error('[regenerer] enrichissement error:', e instanceof Error ? e.message : String(e));
    }
  }

  // 3. Remplacer les tâches
  await sb.from('todo_chantier').delete().eq('chantier_id', id);

  if (Array.isArray(taches) && taches.length > 0) {
    await sb.from('todo_chantier').insert(
      taches.map((t, i) => ({
        chantier_id: id,
        titre: t.titre,
        priorite: t.priorite,
        done: t.done,
        ordre: i,
      })),
    );
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
};

export const OPTIONS: APIRoute = () =>
  new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'PATCH,OPTIONS' } });
