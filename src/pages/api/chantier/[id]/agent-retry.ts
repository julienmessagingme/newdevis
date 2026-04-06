export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth, createServiceClient } from '@/lib/apiHelpers';

// ── POST — re-trigger agent on a specific message after clarification ───────
// Body: { message_id: string }
// 1. Fetch the original message from chantier_whatsapp_messages
// 2. Invalidate agent_context_cache (contacts changed)
// 3. Call agent-orchestrator for this single chantier

export const POST: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return jsonError('Corps invalide', 400); }

  const messageId = typeof body.message_id === 'string' ? body.message_id : '';
  if (!messageId) return jsonError('message_id requis', 400);

  // 1. Verify message exists and belongs to this chantier
  const { data: msg } = await ctx.supabase
    .from('chantier_whatsapp_messages')
    .select('id, chantier_id, from_number, body, timestamp')
    .eq('id', messageId)
    .eq('chantier_id', chantierId)
    .single();

  if (!msg) return jsonError('Message introuvable', 404);

  // 2. Invalidate context cache (contacts have changed after clarification)
  const serviceClient = createServiceClient();
  await serviceClient
    .from('agent_context_cache')
    .update({ invalidated: true })
    .eq('chantier_id', chantierId);

  // 3. Call agent-orchestrator for this chantier (fire-and-forget)
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  fetch(`${supabaseUrl}/functions/v1/agent-orchestrator`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chantier_id: chantierId,
      run_type: 'morning',  // morning = analyse messages & agir. evening = digest journal.
    }),
  }).catch(() => {});

  // 4. Mark the clarification insight as read
  if (typeof body.insight_id === 'string') {
    await ctx.supabase
      .from('agent_insights')
      .update({ read_by_user: true })
      .eq('id', body.insight_id)
      .eq('chantier_id', chantierId);
  }

  // 5. Complete the clarification task if provided
  if (typeof body.task_id === 'string') {
    await ctx.supabase
      .from('todo_chantier')
      .update({ done: true })
      .eq('id', body.task_id)
      .eq('chantier_id', chantierId);
  }

  return jsonOk({ ok: true, message: 'Agent re-triggered after clarification' });
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
