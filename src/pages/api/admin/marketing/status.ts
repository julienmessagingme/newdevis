export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk } from '@/lib/api/apiHelpers';
import { requireAdmin } from '@/lib/auth/adminAuth';
import { marketingFetch, marketingErrorResponse } from '@/lib/integrations/marketingApi';

export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  try {
    const data = await marketingFetch('/api/status', { timeoutMs: 15_000 });
    return jsonOk(data);
  } catch (err) {
    return marketingErrorResponse(err);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
