export const prerender = false;

import type { APIRoute } from 'astro';
import { requireArtisanToken, jsonOk, jsonError, optionsResponse, triggerAgentIfOpenClaw } from '@/lib/api/apiHelpers';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseService = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

// Sujet marqueur des messages postés via le portail artisan : sert à les ISOLER
// du reste de l'historique de la conversation (mails entrants du gestionnaire, etc.).
const ARTISAN_MESSAGE_SUBJECT = "Message depuis l'Espace Artisan";

// ── GET /api/artisan/message — historique des messages ENVOYÉS par l'artisan ──
// (uniquement ses messages entrants ; jamais les échanges sortants du gestionnaire).
export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireArtisanToken(request);
  if (ctx instanceof Response) return ctx;
  const { supabase, contactId, chantierId } = ctx;

  const { data: conv } = await supabase
    .from('chantier_conversations')
    .select('id')
    .eq('chantier_id', chantierId)
    .eq('contact_id', contactId)
    .maybeSingle();

  if (!conv) return jsonOk({ messages: [] });

  // IMPORTANT : ne renvoie QUE les messages postés via le portail (sujet dédié).
  // Sans ce filtre, on exposerait à l'artisan tout l'historique entrant de la
  // conversation (mails du gestionnaire, signatures, autres échanges) = fuite.
  const { data } = await supabase
    .from('chantier_messages')
    .select('id, body_text, created_at')
    .eq('conversation_id', conv.id)
    .eq('direction', 'inbound')
    .eq('subject', ARTISAN_MESSAGE_SUBJECT)
    .order('created_at', { ascending: false })
    .limit(50);

  return jsonOk({ messages: (data ?? []).map((m) => ({ id: m.id, body: m.body_text, created_at: m.created_at })) });
};

// ── POST /api/artisan/message — l'artisan écrit au chantier ───────────────────
// Le message atterrit dans la Messagerie cockpit (message ENTRANT du contact) et
// déclenche l'agent IA, qui notifie le gestionnaire. L'agent qui AGIT seul reste
// derrière le futur toggle agent_mode ; ici il relaie + alerte, le gestionnaire arbitre.
export const POST: APIRoute = async ({ request }) => {
  const ctx = await requireArtisanToken(request);
  if (ctx instanceof Response) return ctx;
  const { supabase, contactId, chantierId, userId } = ctx;

  let body: { message?: string; context?: string };
  try { body = await request.json(); }
  catch { return jsonError('Corps invalide', 400); }

  const raw = (body.message ?? '').trim();
  if (!raw) return jsonError('Message vide', 400);
  if (raw.length > 4000) return jsonError('Message trop long (4000 caractères max)', 400);
  const context = (body.context ?? '').trim().slice(0, 120);
  const text = context ? `[Concerne : ${context}]\n${raw}` : raw;

  // Contact (nom/email/tel pour la conversation).
  const { data: contact } = await supabase
    .from('contacts_chantier')
    .select('nom, email, telephone')
    .eq('id', contactId)
    .maybeSingle();

  // Find or create conversation (clé chantier × contact).
  const { data: existingConv } = await supabase
    .from('chantier_conversations')
    .select('id, unread_count')
    .eq('chantier_id', chantierId)
    .eq('contact_id', contactId)
    .maybeSingle();

  let conversationId: string;
  let unread = 0;

  if (existingConv) {
    conversationId = existingConv.id;
    unread = existingConv.unread_count ?? 0;

    // Cap anti-spam : 20 messages entrants / 24h pour cette conversation.
    const since24h = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await supabase
      .from('chantier_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('direction', 'inbound')
      .gte('created_at', since24h);
    if ((count ?? 0) >= 20) {
      return jsonError('Trop de messages envoyés récemment. Réessayez plus tard.', 429);
    }
  } else {
    const newId = crypto.randomUUID();
    const replyDomain = import.meta.env.REPLY_EMAIL_DOMAIN || 'reply.verifiermondevis.fr';
    const replyAddress = `chantier-${chantierId}+${newId}@${replyDomain}`;
    const { data: newConv, error: convErr } = await supabase
      .from('chantier_conversations')
      .insert({
        id: newId,
        chantier_id: chantierId,
        contact_id: contactId,
        user_id: userId,
        contact_name: contact?.nom ?? 'Artisan',
        contact_email: contact?.email ?? null,
        contact_phone: contact?.telephone ?? null,
        reply_address: replyAddress,
      })
      .select('id')
      .single();
    if (convErr || !newConv) {
      console.error('[artisan/message] conversation error:', convErr?.message);
      return jsonError('Impossible de créer la conversation', 500);
    }
    conversationId = newConv.id;
  }

  // Insert message ENTRANT.
  const { data: msg, error: msgErr } = await supabase
    .from('chantier_messages')
    .insert({
      conversation_id: conversationId,
      direction: 'inbound',
      subject: ARTISAN_MESSAGE_SUBJECT,
      body_text: text,
      status: 'delivered',
    })
    .select('id, body_text, created_at')
    .single();
  if (msgErr || !msg) {
    console.error('[artisan/message] message error:', msgErr?.message);
    return jsonError('Impossible d\'enregistrer le message', 500);
  }

  // Conversation : +1 non lu + last_message_at.
  await supabase
    .from('chantier_conversations')
    .update({ unread_count: unread + 1, last_message_at: new Date().toISOString() })
    .eq('id', conversationId);

  // Déclenche l'agent (mirror inbound-email) — best-effort, ne bloque pas la réponse.
  const { data: agentCfg } = await supabase
    .from('agent_config').select('agent_mode').eq('user_id', userId).maybeSingle();
  const agentMode = agentCfg?.agent_mode ?? 'edge_function';
  if (agentMode === 'openclaw') {
    triggerAgentIfOpenClaw({
      event_type: 'inbound_email',
      chantier_id: chantierId,
      user_id: userId,
      payload: { from: contact?.nom ?? 'Artisan', subject: 'Message Espace Artisan', body: text },
    });
  } else if (agentMode === 'edge_function') {
    fetch(`${supabaseUrl}/functions/v1/agent-orchestrator`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${supabaseService}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ chantier_id: chantierId, run_type: 'morning' }),
    }).catch(() => {});
  }

  return jsonOk({ message: { id: msg.id, body: msg.body_text, created_at: msg.created_at } }, 201);
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,POST,OPTIONS');
