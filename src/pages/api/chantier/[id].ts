export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import type { UpdateChantierPayload } from '@/types/chantier-dashboard';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const VALID_PHASES = ['preparation', 'gros_oeuvre', 'second_oeuvre', 'finitions', 'reception'];

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

/** PATCH /api/chantier/[id] — Met à jour un chantier (nom, emoji, phase) */
export const PATCH: APIRoute = async ({ request, params }) => {
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

  let body: UpdateChantierPayload;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps de requête invalide' }), { status: 400, headers: CORS });
  }

  // Construit l'objet de mise à jour (seuls les champs fournis)
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.nom !== undefined) updates.nom = body.nom.trim();
  if (body.emoji !== undefined) updates.emoji = body.emoji;
  if (body.phase !== undefined) {
    if (!VALID_PHASES.includes(body.phase)) {
      return new Response(JSON.stringify({ error: 'Phase invalide' }), { status: 400, headers: CORS });
    }
    updates.phase = body.phase;
  }
  if (body.enveloppePrevue !== undefined) {
    if (typeof body.enveloppePrevue !== 'number' || body.enveloppePrevue < 0) {
      return new Response(JSON.stringify({ error: 'Enveloppe budgétaire invalide' }), { status: 400, headers: CORS });
    }
    updates.budget = body.enveloppePrevue;
  }

  // Vérifie que le chantier appartient à l'utilisateur ET met à jour
  const { data, error } = await supabase
    .from('chantiers')
    .update(updates)
    .eq('id', chantierId)
    .eq('user_id', user.id)
    .select('id, nom, emoji, budget, phase, updated_at')
    .single();

  if (error) {
    console.error('[api/chantier PATCH] update error:', error.message);
    return new Response(JSON.stringify({ error: 'Erreur lors de la mise à jour' }), { status: 500, headers: CORS });
  }
  if (!data) {
    return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });
  }

  return new Response(JSON.stringify({ chantier: data }), { status: 200, headers: CORS });
};

export const OPTIONS: APIRoute = () =>
  new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'PATCH,OPTIONS' } });
