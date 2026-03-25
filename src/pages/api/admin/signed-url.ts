export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

export const POST: APIRoute = async ({ request }) => {
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Configuration manquante' }), { status: 500, headers: CORS });
  }

  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: CORS });
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  // Vérifier admin
  const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Token invalide' }), { status: 401, headers: CORS });
  }

  const { data: roleData } = await adminClient
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (!roleData) {
    return new Response(JSON.stringify({ error: 'Accès refusé' }), { status: 403, headers: CORS });
  }

  const { filePath } = await request.json();
  if (!filePath) {
    return new Response(JSON.stringify({ error: 'filePath manquant' }), { status: 400, headers: CORS });
  }

  // Générer la signed URL via service_role (bypass RLS storage)
  const { data, error } = await adminClient.storage
    .from('devis')
    .createSignedUrl(filePath, 60);

  if (error || !data?.signedUrl) {
    return new Response(JSON.stringify({ error: error?.message ?? 'Impossible de générer l\'URL' }), { status: 500, headers: CORS });
  }

  return new Response(JSON.stringify({ signedUrl: data.signedUrl }), { status: 200, headers: CORS });
};
