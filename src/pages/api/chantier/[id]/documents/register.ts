export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import type { DocumentType } from '@/types/chantier-ia';

const supabaseUrl     = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseService = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET          = 'chantier-documents';
const SIGNED_TTL      = 3_600;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const VALID_TYPES = new Set<DocumentType>([
  'devis', 'facture', 'photo', 'plan', 'autorisation', 'assurance', 'autre',
]);

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

// ── POST /api/chantier/[id]/documents/register ───────────────────────────────
// Enregistre en base les métadonnées d'un fichier déjà uploadé directement dans
// Supabase Storage via URL signée (bypass Vercel 4.5 Mo).
//
// Body JSON :
//   nom          string
//   documentType DocumentType
//   lotId        string | null
//   bucketPath   string   ← chemin dans le bucket chantier-documents
//   nomFichier   string
//   mimeType     string | null
//   tailleOctets number | null

export const POST: APIRoute = async ({ params, request }) => {
  const ctx = await authenticate(request);
  if (!ctx) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  const chantierId = params.id!;

  const { data: chantier } = await ctx.supabase
    .from('chantiers').select('id')
    .eq('id', chantierId).eq('user_id', ctx.user.id).single();
  if (!chantier) return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });

  let body: {
    nom?: string; documentType?: DocumentType; lotId?: string | null;
    bucketPath?: string; nomFichier?: string; mimeType?: string | null; tailleOctets?: number | null;
  };
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'Corps invalide' }), { status: 400, headers: CORS }); }

  const nom          = body.nom?.trim() ?? '';
  const documentType = body.documentType ?? 'autre';
  const bucketPath   = body.bucketPath ?? '';

  if (!nom)                           return new Response(JSON.stringify({ error: 'Nom requis' }), { status: 400, headers: CORS });
  if (!VALID_TYPES.has(documentType)) return new Response(JSON.stringify({ error: 'Type invalide' }), { status: 400, headers: CORS });
  if (!bucketPath)                    return new Response(JSON.stringify({ error: 'bucketPath requis' }), { status: 400, headers: CORS });

  // Validation lot
  let lotId: string | null = body.lotId ?? null;
  if (lotId) {
    const { data: lot } = await ctx.supabase
      .from('lots_chantier').select('id')
      .eq('id', lotId).eq('chantier_id', chantierId).single();
    if (!lot) lotId = null;
  }

  const { data: doc, error: insertErr } = await ctx.supabase
    .from('documents_chantier')
    .insert({
      chantier_id:   chantierId,
      lot_id:        lotId,
      type:          documentType,
      document_type: documentType,
      source:        'manual_upload',
      nom,
      nom_fichier:   body.nomFichier ?? '',
      bucket_path:   bucketPath,
      taille_octets: body.tailleOctets ?? null,
      mime_type:     body.mimeType ?? null,
    })
    .select()
    .single();

  if (insertErr || !doc) {
    console.error('[register] insert error:', insertErr?.message);
    return new Response(JSON.stringify({ error: insertErr?.message ?? 'Erreur DB' }), { status: 500, headers: CORS });
  }

  const { data: s } = await ctx.supabase.storage
    .from(BUCKET).createSignedUrl(bucketPath, SIGNED_TTL);

  return new Response(
    JSON.stringify({ document: { ...doc, signedUrl: s?.signedUrl ?? null } }),
    { status: 201, headers: CORS },
  );
};

export const OPTIONS: APIRoute = () =>
  new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST,OPTIONS' } });
