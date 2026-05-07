export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, createServiceClient } from '@/lib/apiHelpers';
import { requireAdmin } from '@/lib/adminAuth';

export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  const url = new URL(request.url);
  const product = url.searchParams.get('product');
  const narrativeType = url.searchParams.get('narrative_type');
  const mood = url.searchParams.get('mood');

  try {
    const sb = createServiceClient();
    const { data, error } = await sb.rpc('get_marketing_templates');

    if (error) {
      console.error('[marketing/templates] RPC error:', error.message, error.code, error.details);
      return jsonError(error.message || 'Erreur Supabase', 500);
    }

    let templates = (data ?? []).map((t: Record<string, unknown>) => ({
      id: t.id,
      product: t.product,
      narrative_type: t.narrative_type,
      format_size: t.format_size,
      title: t.title,
      mood: t.mood,
      is_active: t.is_active,
      total_uses: (t.total_uses as number) ?? 0,
      slides: t.slides,
      last_usage: null,
      cooldown_until: {},
    }));

    if (product) templates = templates.filter((t: Record<string, unknown>) => t.product === product);
    if (narrativeType) templates = templates.filter((t: Record<string, unknown>) => t.narrative_type === narrativeType);
    if (mood) templates = templates.filter((t: Record<string, unknown>) => t.mood === mood);

    return jsonOk({ templates });
  } catch (err) {
    const msg = err instanceof Error ? err.message
      : (typeof err === 'object' && err && 'message' in err) ? String((err as { message: unknown }).message)
      : 'Erreur inconnue';
    console.error('[marketing/templates] catch:', msg);
    return jsonError(msg, 500);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
