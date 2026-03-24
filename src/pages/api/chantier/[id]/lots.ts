export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * POST /api/chantier/[id]/lots
 * Crée un lot individuel dans un chantier.
 * Body: { nom: string, emoji?: string, jobType?: string }
 */
export const POST: APIRoute = async ({ request, params }) => {
  const chantierId = params.id;
  if (!chantierId) {
    return new Response(JSON.stringify({ error: 'ID chantier manquant' }), { status: 400, headers: CORS });
  }

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

  const { data: chantier } = await supabase
    .from('chantiers')
    .select('id')
    .eq('id', chantierId)
    .eq('user_id', user.id)
    .single();

  if (!chantier) {
    return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps de requête invalide' }), { status: 400, headers: CORS });
  }

  const nom = typeof body.nom === 'string' ? body.nom.trim() : '';
  if (!nom) {
    return new Response(JSON.stringify({ error: 'Le nom du lot est requis' }), { status: 400, headers: CORS });
  }

  const { data, error } = await supabase
    .from('lots_chantier')
    .insert({
      chantier_id: chantierId,
      nom,
      emoji: typeof body.emoji === 'string' ? body.emoji : null,
      job_type: typeof body.jobType === 'string' ? body.jobType : null,
      statut: 'a_trouver',
    })
    .select('id, nom, emoji, job_type, statut')
    .single();

  if (error) {
    console.error('[api/chantier/lots POST] error:', error.message);
    return new Response(JSON.stringify({ error: 'Erreur lors de la création du lot' }), { status: 500, headers: CORS });
  }

  return new Response(JSON.stringify({ lot: data }), { status: 201, headers: CORS });
};

export const OPTIONS: APIRoute = () =>
  new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
