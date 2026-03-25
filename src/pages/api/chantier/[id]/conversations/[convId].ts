export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseService = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function makeClient() {
  return createClient(supabaseUrl, supabaseService);
}

async function authenticate(request: Request) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const supabase = makeClient();
  const { data: { user } } = await supabase.auth.getUser(auth.slice(7));
  return user ? { user, supabase } : null;
}

async function verifyOwnership(
  supabase: ReturnType<typeof makeClient>,
  chantierId: string,
  userId: string,
) {
  const { data } = await supabase
    .from('chantiers').select('id')
    .eq('id', chantierId).eq('user_id', userId).single();
  return !!data;
}

// ── GET — conversation detail + messages, auto mark-read ─────────────────

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await authenticate(request);
  if (!ctx) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  const chantierId = params.id!;
  if (!await verifyOwnership(ctx.supabase, chantierId, ctx.user.id))
    return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });

  const convId = params.convId!;

  // Verify conversation belongs to this chantier
  const { data: conversation, error: convError } = await ctx.supabase
    .from('chantier_conversations')
    .select('*')
    .eq('id', convId)
    .eq('chantier_id', chantierId)
    .single();

  if (convError || !conversation)
    return new Response(JSON.stringify({ error: 'Conversation introuvable' }), { status: 404, headers: CORS });

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

  return new Response(JSON.stringify({
    conversation,
    messages: messages ?? [],
  }), { headers: CORS });
};

// ── PATCH — mark conversation as read ────────────────────────────────────

export const PATCH: APIRoute = async ({ params, request }) => {
  const ctx = await authenticate(request);
  if (!ctx) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  const chantierId = params.id!;
  if (!await verifyOwnership(ctx.supabase, chantierId, ctx.user.id))
    return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });

  const convId = params.convId!;

  const { error } = await ctx.supabase
    .from('chantier_conversations')
    .update({ unread_count: 0 })
    .eq('id', convId)
    .eq('chantier_id', chantierId);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS });
  return new Response(JSON.stringify({ success: true }), { headers: CORS });
};

// ── OPTIONS ──────────────────────────────────────────────────────────────

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,PATCH,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type' },
  });
};
