export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { optionsResponse, jsonOk, jsonError, parseJsonBody } from '@/lib/apiHelpers';
import { requireAdmin } from '@/lib/adminAuth';

function marketingClient() {
  return createClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.SUPABASE_SERVICE_ROLE_KEY,
    { db: { schema: 'marketing' } },
  );
}

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  const id = params.id;
  if (!id) return jsonError('Missing template id', 400);

  try {
    const sb = marketingClient();
    const { data, error } = await sb
      .from('script_templates')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return jsonError('Template non trouvé', 404);

    const template = {
      ...data,
      total_uses: data.total_uses ?? 0,
      last_usage: null,
      cooldown_until: {},
    };

    return jsonOk(template);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
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
    const sb = marketingClient();
    const { data, error } = await sb
      .from('script_templates')
      .update(updates)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    if (!data) return jsonError('Template non trouvé', 404);

    return jsonOk(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return jsonError(msg, 500);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,PATCH,OPTIONS');
