export const prerender = false;

import type { APIRoute } from 'astro';
import { requireArtisanToken, jsonOk, jsonError, optionsResponse } from '@/lib/api/apiHelpers';

const BUCKET = 'chantier-documents';

// POST /api/artisan/upload-url — URL signée pour upload direct navigateur → Storage
// (contourne la limite Vercel 4.5 Mo). Chemin scopé artisan/{chantierId}/{contactId}/...
// → isolation + hors policy RLS storage client (l'artisan n'a pas d'auth.uid()).
export const POST: APIRoute = async ({ request }) => {
  const ctx = await requireArtisanToken(request);
  if (ctx instanceof Response) return ctx;
  const { supabase, contactId, chantierId } = ctx;

  let body: { filename?: string };
  try { body = await request.json(); }
  catch { return jsonError('Corps invalide', 400); }

  const filename = body.filename ?? 'document';
  const ext = filename.includes('.') ? `.${filename.split('.').pop()!.toLowerCase()}` : '';
  const uuid = crypto.randomUUID();
  const bucketPath = `artisan/${chantierId}/${contactId}/${uuid}${ext}`;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(bucketPath);
  if (error || !data) {
    console.error('[artisan/upload-url] error:', error?.message);
    return jsonError("Impossible de générer l'URL d'upload", 500);
  }
  return jsonOk({ signedUrl: data.signedUrl, bucketPath });
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
