export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import type { ChantierIAResult } from '@/types/chantier-ia';

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
  const metadonnees = JSON.stringify({ artisans, roadmap, formalites, aides });

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

  // Créer les formalités dans documents_chantier
  if (formalites?.length) {
    const { error: formalitesError } = await supabase.from('documents_chantier').insert(
      formalites.map((f) => ({
        chantier_id: chantierId,
        nom: f.nom,
        type: 'formalite',
        statut: 'a_completer',
        url: '',
      }))
    );
    if (formalitesError) {
      console.error('[api/chantier/sauvegarder] formalites error:', formalitesError.message);
    }
  }

  return new Response(JSON.stringify({ chantierId, success: true }), { status: 201, headers: CORS });
};

export const OPTIONS: APIRoute = () =>
  new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST,OPTIONS' } });
