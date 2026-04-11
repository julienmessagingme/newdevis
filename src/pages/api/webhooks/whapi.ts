export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { formatPhone } from '@/lib/whapiUtils';
import { triggerAgentIfOpenClaw } from '@/lib/apiHelpers';

const supabaseUrl     = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseService = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

function makeClient() {
  return createClient(supabaseUrl, supabaseService);
}

async function lookupGroupByJid(supabase: ReturnType<typeof makeClient>, groupJid: string) {
  const { data } = await supabase
    .from('chantier_whatsapp_groups')
    .select('id, chantier_id')
    .eq('group_jid', groupJid)
    .single();
  return data ?? null;
}

// whapi may send OPTIONS before POST
export const OPTIONS: APIRoute = () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });

export const POST: APIRoute = async ({ request }) => {
  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return new Response('OK', { status: 200 }); // always return 200 to whapi
  }

  if (!supabaseUrl || !supabaseService) {
    console.error('[whapi] Missing Supabase config');
    return new Response('OK', { status: 200 });
  }

  const messages: any[] = payload?.messages ?? [];
  const events: any[]   = payload?.events   ?? [];
  const statuses: any[] = payload?.statuses  ?? [];
  if (messages.length === 0 && events.length === 0 && statuses.length === 0) return new Response('OK', { status: 200 });

  const supabase = makeClient();
  const chantierOwnerCache = new Map<string, string>(); // chantier_id → user_id
  const agentTriggerChantierIds = new Set<string>(); // debounce: 1 trigger per chantier per batch
  const lastInboundMsg = new Map<string, { from: string; body: string }>(); // chantier_id → last msg

  for (const msg of messages) {
    // whapi uses chat_id for the group JID (not "to")
    const groupId = msg.chat_id ?? msg.to;
    // Only process group messages (chat_id ends with @g.us)
    if (!groupId?.endsWith('@g.us')) continue;
    // Skip non-message events (status updates etc.)
    if (!msg.id || !msg.type) continue;

    // Find chantier by group JID via new table
    const group = await lookupGroupByJid(supabase, groupId);
    if (!group) continue; // unknown group, skip

    // Extract body and media_url based on message type
    let body: string | null = null;
    let media_url: string | null = null;

    switch (msg.type) {
      case 'text':
        body = msg.text?.body ?? null;
        break;
      case 'image':
        body = msg.image?.caption ?? null;
        media_url = msg.image?.link ?? null;
        break;
      case 'video':
        body = msg.video?.caption ?? null;
        media_url = msg.video?.link ?? null;
        break;
      case 'document':
        body = msg.document?.filename ?? msg.document?.caption ?? null;
        media_url = msg.document?.link ?? null;
        break;
      case 'audio':
      case 'voice':
        body = '🎤 Message vocal';
        media_url = (msg.audio ?? msg.voice)?.link ?? null;
        break;
      default:
        body = msg.type; // fallback: just show type
    }

    const timestamp = msg.timestamp
      ? new Date(msg.timestamp * 1000).toISOString()
      : new Date().toISOString();

    // Upsert — idempotent: whapi may retry on non-2xx
    // Note: chantier_whatsapp_messages.group_id is TEXT storing the raw JID (intentional —
    // messages table predates the groups table and keeps the JID for direct filtering).
    // It is NOT a UUID FK; orphaned messages are retained if the group is deleted.
    const { error: upsertErr } = await supabase
      .from('chantier_whatsapp_messages')
      .upsert({
        id:          msg.id,
        chantier_id: group.chantier_id,
        group_id:    groupId,
        from_number: String(msg.from ?? ''),
        from_me:     msg.from_me ?? false,
        type:        msg.type,
        body,
        media_url,
        timestamp,
      }, { onConflict: 'id' });
    if (upsertErr) console.error('[whapi] upsert error:', upsertErr.message);

    // Collect chantier_id for batched agent trigger (debounce: 1 trigger per chantier per webhook batch)
    if (!msg.from_me) {
      agentTriggerChantierIds.add(group.chantier_id);
      lastInboundMsg.set(group.chantier_id, { from: String(msg.from ?? ''), body: body ?? '' });
    }
  }

  // ── Batched agent trigger: 1 per chantier (not per message) ──────────────
  for (const chantierId of agentTriggerChantierIds) {
    let ownerId = chantierOwnerCache.get(chantierId);
    if (!ownerId) {
      const { data: chantierOwner } = await supabase
        .from('chantiers').select('user_id').eq('id', chantierId).single();
      if (chantierOwner) { ownerId = chantierOwner.user_id; chantierOwnerCache.set(chantierId, ownerId); }
    }
    if (ownerId) {
      const { data: agentCfg } = await supabase
        .from('agent_config').select('agent_mode').eq('user_id', ownerId).single();
      const mode = agentCfg?.agent_mode ?? 'edge_function';

      if (mode === 'openclaw') {
        triggerAgentIfOpenClaw({
          event_type: 'whatsapp_message',
          chantier_id: chantierId,
          user_id: ownerId,
          payload: lastInboundMsg.get(chantierId) ?? { from: 'batch', body: `${messages.length} messages received` },
        });
      } else if (mode === 'edge_function') {
        fetch(`${supabaseUrl}/functions/v1/agent-orchestrator`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${supabaseService}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ chantier_id: chantierId, run_type: 'morning' }),
        }).catch(() => {});
      }
    }
  }

  for (const event of events) {
    const eventGroupJid = event.chat_id ?? event.group_id;
    if (!eventGroupJid) continue;
    const group = await lookupGroupByJid(supabase, eventGroupJid);
    if (!group) continue;

    if (event.type === 'group.participants.remove') {
      const phones: string[] = (event.participants ?? []).map((p: string) => formatPhone(p));
      if (phones.length > 0) {
        await supabase
          .from('chantier_whatsapp_members')
          .update({ status: 'removed', left_at: new Date().toISOString() })
          .eq('group_id', group.id)
          .in('phone', phones);
      }
    }

    if (event.type === 'group.participants.add') {
      const phones: string[] = (event.participants ?? []).map((p: string) => formatPhone(p));
      const upsertRows = phones.map((phone: string) => ({
        group_id: group.id,
        phone,
        name: phone,
        role: 'artisan',
        status: 'active',
        left_at: null,
      }));
      if (upsertRows.length > 0) {
        await supabase
          .from('chantier_whatsapp_members')
          .upsert(upsertRows, { onConflict: 'group_id,phone' });
      }
    }

    if (event.type === 'group.delete') {
      await supabase
        .from('chantier_whatsapp_groups')
        .delete()
        .eq('id', group.id);
    }
  }

  // ── Read receipts: statuts de lecture des messages sortants ───────────────
  // whapi pousse un objet Status par participant dès qu'un message passe
  // sent → delivered → read → played. On upsert avec ON CONFLICT pour l'idempotence.
  for (const s of statuses) {
    if (!s.id || !s.viewer_id || !s.status) continue;

    // On n'ingère que les statuts de messages qu'on a envoyés (whatsapp_outgoing_messages)
    const { data: outgoing } = await supabase
      .from('whatsapp_outgoing_messages')
      .select('chantier_id')
      .eq('id', s.id)
      .maybeSingle();
    if (!outgoing) continue;

    const { error: statusErr } = await supabase
      .from('whatsapp_message_statuses')
      .upsert({
        message_id:  s.id,
        chantier_id: outgoing.chantier_id,
        viewer_id:   s.viewer_id,
        status:      s.status,
        status_code: s.code ?? null,
        updated_at:  s.timestamp
          ? new Date(s.timestamp * 1000).toISOString()
          : new Date().toISOString(),
      }, { onConflict: 'message_id,viewer_id' });
    if (statusErr) console.error('[whapi] status upsert error:', statusErr.message);
  }

  return new Response('OK', { status: 200 });
};
