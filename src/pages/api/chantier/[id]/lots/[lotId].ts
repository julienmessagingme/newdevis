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
 * DELETE /api/chantier/[id]/lots/[lotId]
 * Supprime un lot du chantier.
 */
export const DELETE: APIRoute = async ({ request, params }) => {
  const chantierId = params.id;
  const lotId = params.lotId;
  if (!chantierId || !lotId) {
    return new Response(JSON.stringify({ error: 'Paramètres manquants' }), { status: 400, headers: CORS });
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

  // Vérifier ownership via le chantier
  const { data: chantier } = await supabase
    .from('chantiers')
    .select('id')
    .eq('id', chantierId)
    .eq('user_id', user.id)
    .single();

  if (!chantier) {
    return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });
  }

  const { error } = await supabase
    .from('lots_chantier')
    .delete()
    .eq('id', lotId)
    .eq('chantier_id', chantierId);

  if (error) {
    console.error('[api/chantier/lots DELETE] error:', error.message);
    return new Response(JSON.stringify({ error: 'Erreur lors de la suppression' }), { status: 500, headers: CORS });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
};

export const OPTIONS: APIRoute = () =>
  new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
