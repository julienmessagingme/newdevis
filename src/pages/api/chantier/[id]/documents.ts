export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import type { DocumentType } from '@/types/chantier-ia';

const supabaseUrl     = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseService = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET          = 'chantier-documents';
const MAX_BYTES       = 10 * 1024 * 1024; // 10 Mo — cohérent avec bucket file_size_limit
const SIGNED_TTL      = 3_600;            // 1h

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const VALID_TYPES = new Set<DocumentType>([
  'devis', 'facture', 'photo', 'plan', 'autorisation', 'assurance', 'autre',
]);

// ── Helpers ─────────────────────────────────────────────────────────────────

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

async function verifyChantierOwnership(
  supabase: ReturnType<typeof makeClient>,
  chantierId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('chantiers').select('id')
    .eq('id', chantierId).eq('user_id', userId).single();
  return !!data;
}

// ── GET /api/chantier/[id]/documents ────────────────────────────────────────
// Liste les documents du chantier avec URL signées (TTL 1h).

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await authenticate(request);
  if (!ctx) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  const chantierId = params.id!;
  if (!await verifyChantierOwnership(ctx.supabase, chantierId, ctx.user.id))
    return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });

  const { data: docs, error } = await ctx.supabase
    .from('documents_chantier')
    .select('*')
    .eq('chantier_id', chantierId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[api/documents] GET error:', error.message);
    return new Response(JSON.stringify({ error: 'Erreur chargement documents' }), { status: 500, headers: CORS });
  }

  // Génération des URLs signées en batch
  const enriched = await Promise.all(
    (docs ?? []).map(async (doc) => {
      const { data: s } = await ctx.supabase.storage
        .from(BUCKET).createSignedUrl(doc.bucket_path, SIGNED_TTL);
      return { ...doc, signedUrl: s?.signedUrl ?? null };
    }),
  );

  return new Response(JSON.stringify({ documents: enriched }), { status: 200, headers: CORS });
};

// ── POST /api/chantier/[id]/documents ───────────────────────────────────────
// Enregistre les métadonnées après l'upload client direct vers Supabase Storage.
// Valide la taille côté serveur (2e garde après bucket file_size_limit + UI).

export const POST: APIRoute = async ({ params, request }) => {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer '))
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  const supabase = makeClient();
  const { data: { user } } = await supabase.auth.getUser(auth.slice(7));
  if (!user)
    return new Response(JSON.stringify({ error: 'Token invalide' }), { status: 401, headers: CORS });

  const chantierId = params.id!;
  if (!await verifyChantierOwnership(supabase, chantierId, user.id))
    return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });

  let body: {
    bucketPath: string;
    nom: string;
    nomFichier: string;
    documentType: DocumentType;
    lotId?: string | null;
    tailleOctets?: number | null;
    mimeType?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps de requête invalide' }), { status: 400, headers: CORS });
  }

  const { bucketPath, nom, nomFichier, documentType, lotId = null, tailleOctets = null, mimeType = null } = body;

  // Validations
  if (!bucketPath?.trim() || !nom?.trim() || !nomFichier?.trim())
    return new Response(JSON.stringify({ error: 'Champs obligatoires manquants' }), { status: 400, headers: CORS });

  if (!VALID_TYPES.has(documentType))
    return new Response(JSON.stringify({ error: 'Type de document invalide' }), { status: 400, headers: CORS });

  // Validation taille serveur (cohérente avec limit bucket + UI)
  if (tailleOctets !== null && tailleOctets > MAX_BYTES)
    return new Response(JSON.stringify({ error: 'Fichier trop volumineux (max 10 Mo)' }), { status: 400, headers: CORS });

  // Sécurité : le chemin doit commencer par l'user_id pour respecter les policies storage
  if (!bucketPath.startsWith(`${user.id}/`))
    return new Response(JSON.stringify({ error: 'Chemin storage invalide' }), { status: 400, headers: CORS });

  // Validation lot si fourni
  if (lotId) {
    const { data: lot } = await supabase
      .from('lots_chantier').select('id')
      .eq('id', lotId).eq('chantier_id', chantierId).single();
    if (!lot)
      return new Response(JSON.stringify({ error: 'Lot invalide' }), { status: 400, headers: CORS });
  }

  const { data: doc, error: insertError } = await supabase
    .from('documents_chantier')
    .insert({
      chantier_id:   chantierId,
      lot_id:        lotId,
      document_type: documentType,
      source:        'manual_upload',
      nom:           nom.trim(),
      nom_fichier:   nomFichier,
      bucket_path:   bucketPath,
      taille_octets: tailleOctets,
      mime_type:     mimeType,
    })
    .select()
    .single();

  if (insertError || !doc) {
    console.error('[api/documents] POST insert error:', insertError?.message);
    return new Response(JSON.stringify({ error: 'Erreur lors de l\'enregistrement' }), { status: 500, headers: CORS });
  }

  const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(bucketPath, SIGNED_TTL);

  return new Response(
    JSON.stringify({ document: { ...doc, signedUrl: s?.signedUrl ?? null } }),
    { status: 201, headers: CORS },
  );
};

export const OPTIONS: APIRoute = () =>
  new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } });
