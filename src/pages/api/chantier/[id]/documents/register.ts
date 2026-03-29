export const prerender = false;

import type { APIRoute } from 'astro';
import type { DocumentType } from '@/types/chantier-ia';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';

const BUCKET          = 'chantier-documents';
const SIGNED_TTL      = 3_600;

const VALID_TYPES = new Set<DocumentType>([
  'devis', 'facture', 'photo', 'plan', 'autorisation', 'assurance', 'autre',
]);

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
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;

  let body: {
    nom?: string; documentType?: DocumentType; lotId?: string | null;
    bucketPath?: string; nomFichier?: string; mimeType?: string | null; tailleOctets?: number | null;
  };
  try { body = await request.json(); }
  catch { return jsonError('Corps invalide', 400); }

  const nom          = body.nom?.trim() ?? '';
  const documentType = body.documentType ?? 'autre';
  const bucketPath   = body.bucketPath ?? '';

  if (!nom)                           return jsonError('Nom requis', 400);
  if (!VALID_TYPES.has(documentType)) return jsonError('Type invalide', 400);
  if (!bucketPath)                    return jsonError('bucketPath requis', 400);

  // Validation lot — '' → null pour éviter "invalid input syntax for type uuid"
  let lotId: string | null = body.lotId || null;
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
    return jsonError(insertErr?.message ?? 'Erreur DB', 500);
  }

  const { data: s } = await ctx.supabase.storage
    .from(BUCKET).createSignedUrl(bucketPath, SIGNED_TTL);

  return jsonOk({ document: { ...doc, signedUrl: s?.signedUrl ?? null } }, 201);
};

export const OPTIONS: APIRoute = () => optionsResponse();
