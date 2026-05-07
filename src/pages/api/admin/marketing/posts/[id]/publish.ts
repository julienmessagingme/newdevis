export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, parseJsonBody, createServiceClient } from '@/lib/apiHelpers';
import { requireAdmin } from '@/lib/adminAuth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PublishBody {
  external_url?: string;
  external_id?: string;
}

export const POST: APIRoute = async ({ request, params }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  const id = params.id;
  if (!id || !UUID_RE.test(id)) return jsonError('id invalide (UUID requis)', 400);

  let body: PublishBody = {};
  const contentLength = request.headers.get('content-length');
  if (contentLength && contentLength !== '0') {
    const parsed = await parseJsonBody<PublishBody>(request);
    if (parsed instanceof Response) return parsed;
    body = parsed;
  }

  if (body.external_url && body.external_url.length > 2048) {
    return jsonError('external_url trop longue (max 2048)', 400);
  }
  if (body.external_url && !/^https?:\/\//i.test(body.external_url)) {
    return jsonError('external_url doit commencer par http(s)://', 400);
  }

  try {
    const sb = createServiceClient();

    const updates: Record<string, unknown> = {
      status: 'published',
      published_at: new Date().toISOString(),
    };
    if (body.external_url) updates.external_url = body.external_url;
    if (body.external_id) updates.external_id = body.external_id;

    const { data, error } = await sb
      .schema('marketing' as never)
      .from('posts')
      .update(updates)
      .eq('id', id)
      .is('deleted_at', null)
      .select('id, status, published_at')
      .maybeSingle();

    if (error) throw error;
    if (!data) return jsonError('Post introuvable', 404);

    return jsonOk({ ok: true, post: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return jsonError(msg, 500);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
