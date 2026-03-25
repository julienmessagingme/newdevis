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

// ── GET — list conversations for a chantier ─────────────────────────────────

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await authenticate(request);
  if (!ctx) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  const chantierId = params.id!;
  if (!await verifyOwnership(ctx.supabase, chantierId, ctx.user.id))
    return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });

  // Fetch all conversations for this chantier
  const { data: conversations, error: convError } = await ctx.supabase
    .from('chantier_conversations')
    .select('*')
    .eq('chantier_id', chantierId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (convError)
    return new Response(JSON.stringify({ error: convError.message }), { status: 500, headers: CORS });

  if (!conversations || conversations.length === 0)
    return new Response(JSON.stringify({ conversations: [] }), { headers: CORS });

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

  return new Response(JSON.stringify({ conversations: result }), { headers: CORS });
};

// ── OPTIONS ─────────────────────────────────────────────────────────────────

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type' },
  });
};
