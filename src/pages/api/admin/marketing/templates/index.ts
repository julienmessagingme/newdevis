export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { optionsResponse, jsonOk, jsonError } from '@/lib/apiHelpers';
import { requireAdmin } from '@/lib/adminAuth';

function marketingClient() {
  return createClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.SUPABASE_SERVICE_ROLE_KEY,
    { db: { schema: 'marketing' } },
  );
}

export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  const url = new URL(request.url);
  const product = url.searchParams.get('product');
  const narrativeType = url.searchParams.get('narrative_type');
  const mood = url.searchParams.get('mood');

  try {
    const sb = marketingClient();
    let query = sb
      .from('script_templates')
      .select('id, product, narrative_type, format_size, title, mood, is_active, total_uses, slides')
      .order('id');

    if (product) query = query.eq('product', product);
    if (narrativeType) query = query.eq('narrative_type', narrativeType);
    if (mood) query = query.eq('mood', mood);

    const { data, error } = await query;
    if (error) throw error;

    const templates = (data ?? []).map((t: Record<string, unknown>) => ({
      id: t.id,
      product: t.product,
      narrative_type: t.narrative_type,
      format_size: t.format_size,
      title: t.title,
      mood: t.mood,
      is_active: t.is_active,
      total_uses: t.total_uses ?? 0,
      last_usage: null,
      cooldown_until: {},
    }));

    return jsonOk({ templates });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return jsonError(msg, 500);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
