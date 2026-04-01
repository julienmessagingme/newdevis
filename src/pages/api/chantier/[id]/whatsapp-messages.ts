export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const { data, error } = await ctx.supabase
    .from('chantier_whatsapp_messages')
    .select('id, from_number, from_me, type, body, media_url, timestamp')
    .eq('chantier_id', params.id!)
    .order('timestamp', { ascending: true })
    .limit(50);

  if (error) return jsonError('Erreur base de données', 500);

  return jsonOk({ messages: data ?? [] });
};
