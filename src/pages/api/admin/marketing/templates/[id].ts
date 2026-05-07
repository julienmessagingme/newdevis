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
    const { data, error } = await sb
      .schema('marketing' as never)
      .from('script_templates')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[marketing/templates/:id GET] Supabase error:', error.message, error.code);
      return jsonError(error.message || 'Erreur Supabase', 500);
    }
    if (!data) return jsonError('Template non trouvé', 404);

    const template = {
      ...data,
      total_uses: data.total_uses ?? 0,
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
    const { data, error } = await sb
      .schema('marketing' as never)
      .from('script_templates')
      .update(updates)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('[marketing/templates/:id PATCH] Supabase error:', error.message, error.code);
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
