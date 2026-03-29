export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';

// ── GET — conversation detail + messages, auto mark-read ─────────────────

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;
  const convId = params.convId!;

  // Verify conversation belongs to this chantier
  const { data: conversation, error: convError } = await ctx.supabase
    .from('chantier_conversations')
    .select('*')
    .eq('id', convId)
    .eq('chantier_id', chantierId)
    .single();

  if (convError || !conversation)
    return jsonError('Conversation introuvable', 404);

  // Fetch messages
  const { data: messages } = await ctx.supabase
    .from('chantier_messages')
    .select('*')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true });

  // Auto mark-read
  await ctx.supabase
    .from('chantier_conversations')
    .update({ unread_count: 0 })
    .eq('id', convId);

  return jsonOk({
    conversation,
    messages: messages ?? [],
  });
};

// ── PATCH — mark conversation as read ────────────────────────────────────

export const PATCH: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;
  const convId = params.convId!;

  const { error } = await ctx.supabase
    .from('chantier_conversations')
    .update({ unread_count: 0 })
    .eq('id', convId)
    .eq('chantier_id', chantierId);

  if (error) return jsonError(error.message, 500);
  return jsonOk({ success: true });
};

// ── OPTIONS ──────────────────────────────────────────────────────────────

export const OPTIONS: APIRoute = () => optionsResponse();
