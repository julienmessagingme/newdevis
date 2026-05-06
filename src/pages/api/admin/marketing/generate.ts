export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, parseJsonBody } from '@/lib/apiHelpers';
import { requireAdmin } from '@/lib/adminAuth';
import { marketingFetch, marketingErrorResponse } from '@/lib/marketingApi';

const VALID_PLATFORMS = new Set(['instagram', 'facebook', 'tiktok']);

export const POST: APIRoute = async ({ request }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  const body = await parseJsonBody<{ platform?: string; script_id?: string }>(request);
  if (body instanceof Response) return body;

  const platform = body.platform ?? 'instagram';
  if (!VALID_PLATFORMS.has(platform)) {
    return jsonError(`Plateforme invalide : ${platform}`, 400);
  }

  try {
    const data = await marketingFetch('/api/generate', {
      method: 'POST',
      body: { platform, script_id: body.script_id ?? null },
      timeoutMs: 60_000,
    });
    return jsonOk(data);
  } catch (err) {
    return marketingErrorResponse(err);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
