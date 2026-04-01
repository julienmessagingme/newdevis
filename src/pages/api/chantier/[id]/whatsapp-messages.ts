export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const url = new URL(request.url);
  const groupJid = url.searchParams.get('groupJid');

  let query = ctx.supabase
    .from('chantier_whatsapp_messages')
    .select('id, from_number, from_me, type, body, media_url, timestamp, group_id')
    .eq('chantier_id', params.id!)
    .order('timestamp', { ascending: true })
    .limit(200);

  if (groupJid) {
    query = query.eq('group_id', groupJid);
  }

  const { data, error } = await query;

  if (error) return jsonError(error.message, 500);

  return jsonOk({ messages: data ?? [] });
};
