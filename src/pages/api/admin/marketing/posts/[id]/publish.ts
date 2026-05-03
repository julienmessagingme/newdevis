export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, parseJsonBody } from '@/lib/apiHelpers';
import { requireAdmin } from '@/lib/adminAuth';
import { marketingFetch, marketingErrorResponse } from '@/lib/marketingApi';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PublishBody {
  external_url?: string;
  external_id?: string;
  snapshot_kpis?: {
    impressions?: number;
    reach?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
    clicks?: number;
    profile_visits?: number;
    follows?: number;
  };
}

export const POST: APIRoute = async ({ request, params }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  const id = params.id;
  if (!id || !UUID_RE.test(id)) return jsonError('id invalide (UUID requis)', 400);

  // Body optionnel — FastAPI accepte un body vide pour mark-published
  let body: PublishBody = {};
  const contentLength = request.headers.get('content-length');
  if (contentLength && contentLength !== '0') {
    const parsed = await parseJsonBody<PublishBody>(request);
    if (parsed instanceof Response) return parsed;
    body = parsed;
  }

  // Validation légère côté proxy (FastAPI revalide derrière)
  if (body.external_url && body.external_url.length > 2048) {
    return jsonError('external_url trop longue (max 2048)', 400);
  }
  if (body.external_url && !/^https?:\/\//i.test(body.external_url)) {
    return jsonError('external_url doit commencer par http(s)://', 400);
  }

  try {
    const data = await marketingFetch(`/api/posts/${id}/mark-published`, {
      method: 'POST',
      body,
      timeoutMs: 30_000,
    });
    return jsonOk(data);
  } catch (err) {
    return marketingErrorResponse(err);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
