export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';

// ── GET — conversation detail + messages, auto mark-read ─────────────────

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;
  const convId = params.convId!;

  // Parallel fetch: conversation (with ownership check) + messages
  // Messages are only returned after ownership check passes, so no data leak.
  const [convRes, messagesRes] = await Promise.all([
    ctx.supabase
      .from('chantier_conversations')
      .select('*')
      .eq('id', convId)
      .eq('chantier_id', chantierId)
      .single(),
    ctx.supabase
      .from('chantier_messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true }),
  ]);

  if (convRes.error || !convRes.data)
    return jsonError('Conversation introuvable', 404);

  // Auto mark-read (after ownership check)
  await ctx.supabase
    .from('chantier_conversations')
    .update({ unread_count: 0 })
    .eq('id', convId);

  return jsonOk({
    conversation: convRes.data,
    messages: messagesRes.data ?? [],
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
