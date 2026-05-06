export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, parseJsonBody } from '@/lib/apiHelpers';
import { requireAdmin } from '@/lib/adminAuth';
import { marketingFetch, marketingErrorResponse } from '@/lib/marketingApi';

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  const id = params.id;
  if (!id) return jsonError('Missing template id', 400);

  try {
    const data = await marketingFetch(`/api/templates/${encodeURIComponent(id)}`, {
      timeoutMs: 15_000,
    });
    return jsonOk(data);
  } catch (err) {
    return marketingErrorResponse(err);
  }
};

export const PATCH: APIRoute = async ({ params, request }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  const id = params.id;
  if (!id) return jsonError('Missing template id', 400);

  const body = await parseJsonBody(request);
  if (body instanceof Response) return body;

  try {
    const data = await marketingFetch(`/api/templates/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body,
      timeoutMs: 15_000,
    });
    return jsonOk(data);
  } catch (err) {
    return marketingErrorResponse(err);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,PATCH,OPTIONS');
