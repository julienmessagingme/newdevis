export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk } from '@/lib/apiHelpers';
import { requireAdmin } from '@/lib/adminAuth';
import { marketingFetch, marketingErrorResponse } from '@/lib/marketingApi';

export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  const url = new URL(request.url);
  const params = new URLSearchParams();
  for (const key of ['category', 'mood']) {
    const val = url.searchParams.get(key);
    if (val) params.set(key, val);
  }

  try {
    const qs = params.toString();
    const data = await marketingFetch(`/api/backgrounds${qs ? `?${qs}` : ''}`, {
      timeoutMs: 15_000,
    });
    return jsonOk(data);
  } catch (err) {
    return marketingErrorResponse(err);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
