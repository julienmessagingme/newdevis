/**
 * POST /api/chantier/[id]/assistant/message
 * Envoie un message utilisateur à l'assistant et retourne la réponse de l'agent.
 * Synchrone : attend la réponse avant de répondre au client.
 * Auth : JWT user uniquement (pas de X-Agent-Key — conversation privée).
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import {
  requireChantierAuth,
  optionsResponse,
  jsonOk,
  jsonError,
  createServiceClient,
} from '@/lib/apiHelpers';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseService = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');

export const POST: APIRoute = async ({ request, params }) => {
  const chantierId = params.id as string;
  const ctx = await requireChantierAuth(request, chantierId);
  if (ctx instanceof Response) return ctx;

  let body: { message?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError('Corps invalide', 400);
  }

  const userMessage = (body.message ?? '').trim();
  if (!userMessage) return jsonError('Message vide', 400);

  const supabase = createServiceClient();

  // 1. Fetch conversation history (last 40 messages for context, keeping tool messages too)
  const { data: historyRows } = await supabase
    .from('chantier_assistant_messages')
    .select('id, role, content, tool_calls, tool_call_id, agent_initiated, is_read, created_at')
    .eq('chantier_id', chantierId)
    .order('created_at', { ascending: true })
    .limit(40);

  const conversationHistory = historyRows ?? [];

  // 2. Insert user message into DB
  const { data: userMsgRow, error: insertErr } = await supabase
    .from('chantier_assistant_messages')
    .insert({
      chantier_id:    chantierId,
      role:           'user',
      content:        userMessage,
      agent_initiated: false,
      is_read:        true, // user's own message is always "read"
    })
    .select('id, created_at')
    .single();

  if (insertErr) {
    console.error('[assistant/message] insert user msg error:', insertErr.message);
    return jsonError('Erreur de base de données', 500);
  }

  // 3. Call agent-orchestrator in interactive mode (synchronous — wait for response)
  let agentResponse: { response_text: string; tool_calls_executed: string[] };
  try {
    const orchestratorRes = await fetch(`${supabaseUrl}/functions/v1/agent-orchestrator`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseService}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        run_type: 'interactive',
        chantier_id: chantierId,
        user_message: userMessage,
        conversation_history: conversationHistory,
      }),
    });

    if (!orchestratorRes.ok) {
      const errText = await orchestratorRes.text().catch(() => '');
      console.error('[assistant/message] orchestrator error:', orchestratorRes.status, errText.slice(0, 200));
      throw new Error(`Orchestrator ${orchestratorRes.status}`);
    }

    agentResponse = await orchestratorRes.json();
  } catch (err) {
    console.error('[assistant/message] call error:', (err as Error).message);
    // Insert a fallback error message so the chat doesn't hang
    await supabase.from('chantier_assistant_messages').insert({
      chantier_id:    chantierId,
      role:           'assistant',
      content:        "Désolé, je rencontre une erreur temporaire. Réessaie dans un instant.",
      agent_initiated: false,
      is_read:        false,
    }).catch(() => {});
    return jsonError('Agent temporairement indisponible', 503);
  }

  const responseText = agentResponse.response_text ?? '';
  const toolsExecuted = agentResponse.tool_calls_executed ?? [];

  // 4. Insert assistant response into DB
  const { data: assistantMsgRow } = await supabase
    .from('chantier_assistant_messages')
    .insert({
      chantier_id:    chantierId,
      role:           'assistant',
      content:        responseText,
      agent_initiated: false,
      is_read:        false,
    })
    .select('id, created_at')
    .single();

  return jsonOk({
    user_message: {
      id:         userMsgRow.id,
      role:       'user',
      content:    userMessage,
      created_at: userMsgRow.created_at,
    },
    assistant_message: {
      id:         assistantMsgRow?.id ?? null,
      role:       'assistant',
      content:    responseText,
      created_at: assistantMsgRow?.created_at ?? new Date().toISOString(),
    },
    tools_executed: toolsExecuted,
  });
};
