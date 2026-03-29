export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';

// ── GET — list conversations for a chantier ─────────────────────────────────

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;

  // Fetch all conversations for this chantier
  const { data: conversations, error: convError } = await ctx.supabase
    .from('chantier_conversations')
    .select('*')
    .eq('chantier_id', chantierId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (convError)
    return jsonError(convError.message, 500);

  if (!conversations || conversations.length === 0)
    return jsonOk({ conversations: [] });

  // Fetch the last message for each conversation in a single query
  const convIds = conversations.map(c => c.id);
  const { data: lastMessages } = await ctx.supabase
    .from('chantier_messages')
    .select('*')
    .in('conversation_id', convIds)
    .order('created_at', { ascending: false });

  // Build a map: conversation_id → last message
  const lastMessageMap = new Map<string, typeof lastMessages extends (infer T)[] | null ? T : never>();
  for (const msg of lastMessages ?? []) {
    if (!lastMessageMap.has(msg.conversation_id)) {
      lastMessageMap.set(msg.conversation_id, msg);
    }
  }

  // Merge last message into each conversation
  const result = conversations.map(conv => ({
    ...conv,
    last_message: lastMessageMap.get(conv.id) ?? null,
  }));

  return jsonOk({ conversations: result });
};

// ── OPTIONS ─────────────────────────────────────────────────────────────────

export const OPTIONS: APIRoute = () => optionsResponse();
