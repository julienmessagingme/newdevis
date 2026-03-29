export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';

const BUCKET          = 'chantier-documents';

// ── POST /api/chantier/[id]/upload-url ──────────────────────────────────────
// Génère une URL signée pour upload direct depuis le navigateur vers Supabase Storage.
// Contourne la limite Vercel de 4.5 Mo sur les corps de requête serverless.
//
// Body JSON : { filename: string }
// Réponse   : { signedUrl: string, bucketPath: string }

export const POST: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;

  let body: { filename?: string };
  try { body = await request.json(); }
  catch { return jsonError('Corps invalide', 400); }

  const filename = body.filename ?? 'document';
  const ext      = filename.includes('.') ? `.${filename.split('.').pop()!.toLowerCase()}` : '';
  const uuid     = crypto.randomUUID();
  const bucketPath = `${ctx.user.id}/${chantierId}/${uuid}${ext}`;

  const { data, error } = await ctx.supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(bucketPath);

  if (error || !data) {
    console.error('[upload-url] createSignedUploadUrl error:', error?.message);
    return jsonError('Impossible de générer l\'URL d\'upload', 500);
  }

  return jsonOk({ signedUrl: data.signedUrl, bucketPath });
};

export const OPTIONS: APIRoute = () => optionsResponse();
