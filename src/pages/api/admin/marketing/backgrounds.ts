export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, createServiceClient } from '@/lib/apiHelpers';
import { requireAdmin } from '@/lib/adminAuth';

export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;

  const url = new URL(request.url);
  const category = url.searchParams.get('category');
  const mood = url.searchParams.get('mood');

  try {
    const sb = createServiceClient();
    let query = sb
      .schema('marketing' as never)
      .from('backgrounds')
      .select('id, category, url, compatible_moods, width, height, created_at')
      .order('created_at', { ascending: false });

    if (category) query = query.eq('category', category);
    if (mood) query = query.contains('compatible_moods', [mood]);

    const { data, error } = await query;
    if (error) throw error;

    return jsonOk({ backgrounds: data ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return jsonError(msg, 500);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
