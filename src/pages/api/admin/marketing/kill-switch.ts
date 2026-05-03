export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, parseJsonBody } from '@/lib/apiHelpers';
import { requireAdmin } from '@/lib/adminAuth';
import { marketingFetch, marketingErrorResponse } from '@/lib/marketingApi';

interface KillSwitchBody {
  paused?: boolean;
  reason?: string;
}

export const POST: APIRoute = async ({ request }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  const body = await parseJsonBody<KillSwitchBody>(request);
  if (body instanceof Response) return body;

  if (typeof body.paused !== 'boolean') {
    return jsonError('Champ "paused" (boolean) requis', 400);
  }
  const reason = body.reason?.trim();
  if (body.paused === true && !reason) {
    return jsonError('Une raison est obligatoire pour pauser le système', 400);
  }
  if (reason && reason.length > 500) {
    return jsonError('Raison trop longue (max 500 caractères)', 400);
  }

  try {
    const data = await marketingFetch('/api/kill-switch', {
      method: 'POST',
      body: { paused: body.paused, reason: reason || null },
      timeoutMs: 15_000,
    });
    return jsonOk(data);
  } catch (err) {
    return marketingErrorResponse(err);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
