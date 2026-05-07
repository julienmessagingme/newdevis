export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, parseJsonBody, createServiceClient } from '@/lib/apiHelpers';
import { requireAdmin } from '@/lib/adminAuth';

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  const id = params.id;
  if (!id) return jsonError('Missing template id', 400);

  try {
    const sb = createServiceClient();
    const { data, error } = await sb.rpc('get_marketing_template', { p_id: id });

    if (error) {
      console.error('[marketing/templates/:id GET] RPC error:', error.message, error.code);
      return jsonError(error.message || 'Erreur Supabase', 500);
    }
    if (!data) return jsonError('Template non trouvé', 404);

    const template = {
      ...(data as Record<string, unknown>),
      total_uses: (data as Record<string, unknown>).total_uses ?? 0,
      last_usage: null,
      cooldown_until: {},
    };

    return jsonOk(template);
  } catch (err) {
    const msg = err instanceof Error ? err.message
      : (typeof err === 'object' && err && 'message' in err) ? String((err as { message: unknown }).message)
      : 'Erreur inconnue';
    console.error('[marketing/templates/:id GET] catch:', msg);
    return jsonError(msg, 500);
  }
};

export const PATCH: APIRoute = async ({ params, request }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  const id = params.id;
  if (!id) return jsonError('Missing template id', 400);

  const body = await parseJsonBody(request);
  if (body instanceof Response) return body;

  // Whitelist des champs modifiables
  const allowed = ['title', 'mood', 'caption', 'hashtags', 'is_active', 'slides'] as const;
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in (body as Record<string, unknown>)) {
      updates[key] = (body as Record<string, unknown>)[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return jsonError('Aucun champ modifiable fourni', 400);
  }

  try {
    const sb = createServiceClient();
    const { data, error } = await sb.rpc('update_marketing_template', {
      p_id: id,
      p_updates: JSON.stringify(updates),
    });

    if (error) {
      console.error('[marketing/templates/:id PATCH] RPC error:', error.message, error.code);
      return jsonError(error.message || 'Erreur Supabase', 500);
    }
    if (!data) return jsonError('Template non trouvé', 404);

    return jsonOk(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message
      : (typeof err === 'object' && err && 'message' in err) ? String((err as { message: unknown }).message)
      : 'Erreur inconnue';
    console.error('[marketing/templates/:id PATCH] catch:', msg);
    return jsonError(msg, 500);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,PATCH,OPTIONS');
