export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonError } from '@/lib/apiHelpers';
import { requireAdmin } from '@/lib/adminAuth';
import { marketingFetchRaw, marketingErrorResponse } from '@/lib/marketingApi';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: APIRoute = async ({ request, params }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  const id = params.id;
  if (!id || !UUID_RE.test(id)) return jsonError('id invalide (UUID requis)', 400);

  try {
    const upstream = await marketingFetchRaw(`/api/posts/${id}/download-zip`, {
      method: 'GET',
      timeoutMs: 90_000,
      signal: request.signal,
    });

    // Forward body stream + headers utiles (Content-Type, Content-Disposition)
    const headers = new Headers();
    const ct = upstream.headers.get('content-type');
    headers.set('Content-Type', ct ?? 'application/zip');

    const cd = upstream.headers.get('content-disposition');
    headers.set(
      'Content-Disposition',
      cd ?? `attachment; filename="post-${id}.zip"`,
    );

    const cl = upstream.headers.get('content-length');
    if (cl) headers.set('Content-Length', cl);

    headers.set('Cache-Control', 'no-store');

    return new Response(upstream.body, { status: 200, headers });
  } catch (err) {
    return marketingErrorResponse(err);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
