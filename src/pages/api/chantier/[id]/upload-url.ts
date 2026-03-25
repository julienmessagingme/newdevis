export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseService = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET          = 'chantier-documents';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function makeClient() {
  return createClient(supabaseUrl, supabaseService);
}

async function authenticate(request: Request) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const supabase = makeClient();
  const { data: { user } } = await supabase.auth.getUser(auth.slice(7));
  return user ? { user, supabase } : null;
}

// ── POST /api/chantier/[id]/upload-url ──────────────────────────────────────
// Génère une URL signée pour upload direct depuis le navigateur vers Supabase Storage.
// Contourne la limite Vercel de 4.5 Mo sur les corps de requête serverless.
//
// Body JSON : { filename: string }
// Réponse   : { signedUrl: string, bucketPath: string }

export const POST: APIRoute = async ({ params, request }) => {
  const ctx = await authenticate(request);
  if (!ctx) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  const chantierId = params.id!;

  // Ownership
  const { data: chantier } = await ctx.supabase
    .from('chantiers').select('id')
    .eq('id', chantierId).eq('user_id', ctx.user.id).single();
  if (!chantier) return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });

  let body: { filename?: string };
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'Corps invalide' }), { status: 400, headers: CORS }); }

  const filename = body.filename ?? 'document';
  const ext      = filename.includes('.') ? `.${filename.split('.').pop()!.toLowerCase()}` : '';
  const uuid     = crypto.randomUUID();
  const bucketPath = `${ctx.user.id}/${chantierId}/${uuid}${ext}`;

  const { data, error } = await ctx.supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(bucketPath);

  if (error || !data) {
    console.error('[upload-url] createSignedUploadUrl error:', error?.message);
    return new Response(JSON.stringify({ error: 'Impossible de générer l\'URL d\'upload' }), { status: 500, headers: CORS });
  }

  return new Response(JSON.stringify({ signedUrl: data.signedUrl, bucketPath }), { status: 200, headers: CORS });
};

export const OPTIONS: APIRoute = () =>
  new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST,OPTIONS' } });
