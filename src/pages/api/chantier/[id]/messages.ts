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

// ── POST — send a message to a contact via SendGrid ──────────────────────

export const POST: APIRoute = async ({ params, request }) => {
  const ctx = await authenticate(request);
  if (!ctx) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });

  const chantierId = params.id!;
  if (!await verifyOwnership(ctx.supabase, chantierId, ctx.user.id))
    return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });

  const body = await request.json();
  const contactId = body.contact_id;
  const subject   = (body.subject ?? '').trim();
  const bodyText  = (body.body ?? '').trim();

  if (!contactId || !subject || !bodyText)
    return new Response(JSON.stringify({ error: 'contact_id, subject et body requis' }), { status: 400, headers: CORS });

  // Fetch contact (scoped to this chantier)
  const { data: contact, error: contactErr } = await ctx.supabase
    .from('contacts_chantier')
    .select('id, nom, email, telephone')
    .eq('id', contactId)
    .eq('chantier_id', chantierId)
    .single();

  if (contactErr || !contact)
    return new Response(JSON.stringify({ error: 'Contact introuvable' }), { status: 404, headers: CORS });

  if (!contact.email)
    return new Response(JSON.stringify({ error: 'Ce contact n\'a pas d\'adresse email' }), { status: 400, headers: CORS });

  // Find or create conversation
  const { data: existingConv } = await ctx.supabase
    .from('chantier_conversations')
    .select('id, reply_address')
    .eq('chantier_id', chantierId)
    .eq('contact_id', contactId)
    .single();

  let conversationId: string;
  let replyAddress: string;

  const replyDomain = import.meta.env.REPLY_EMAIL_DOMAIN || 'reply.verifiermondevis.fr';

  if (existingConv) {
    conversationId = existingConv.id;
    replyAddress   = existingConv.reply_address;
  } else {
    // Generate ID upfront so we can build the reply_address before INSERT
    const newId = crypto.randomUUID();
    replyAddress = `chantier-${chantierId}+${newId}@${replyDomain}`;

    const { data: newConv, error: convErr } = await ctx.supabase
      .from('chantier_conversations')
      .insert({
        id:            newId,
        chantier_id:   chantierId,
        contact_id:    contactId,
        user_id:       ctx.user.id,
        contact_name:  contact.nom,
        contact_email: contact.email,
        contact_phone: contact.telephone,
        reply_address: replyAddress,
      })
      .select('id')
      .single();

    if (convErr || !newConv)
      return new Response(JSON.stringify({ error: convErr?.message ?? 'Erreur création conversation' }), { status: 500, headers: CORS });

    conversationId = newConv.id;
  }

  // Insert message
  const { data: message, error: msgErr } = await ctx.supabase
    .from('chantier_messages')
    .insert({
      conversation_id: conversationId,
      direction:       'outbound',
      subject,
      body_text:       bodyText,
      status:          'sent',
    })
    .select('id')
    .single();

  if (msgErr || !message)
    return new Response(JSON.stringify({ error: msgErr?.message ?? 'Erreur création message' }), { status: 500, headers: CORS });

  // Build sender display name
  const firstName = ctx.user.user_metadata?.first_name ?? '';
  const lastName  = ctx.user.user_metadata?.last_name ?? '';
  const userName  = [firstName, lastName].filter(Boolean).join(' ') || ctx.user.email || 'Utilisateur';

  // Send via SendGrid
  const sendgridApiKey = import.meta.env.SENDGRID_API_KEY;
  let sendFailed = false;
  let sendError: string | undefined;

  if (!sendgridApiKey) {
    console.warn('[messages] SENDGRID_API_KEY not configured — message stored but not sent');
    sendFailed = true;
    sendError  = 'SENDGRID_API_KEY not configured';
  } else {
    try {
      const sgMail = await import('@sendgrid/mail');
      sgMail.default.setApiKey(sendgridApiKey);
      await sgMail.default.send({
        to:      contact.email,
        from:    { email: replyAddress, name: `${userName} via VerifierMonDevis` },
        replyTo: replyAddress,
        subject,
        text:    bodyText,
      });
    } catch (err: unknown) {
      sendFailed = true;
      sendError  = err instanceof Error ? err.message : 'SendGrid error';
      console.error('[messages] SendGrid send error:', sendError);
    }
  }

  // If send failed, update message status
  if (sendFailed) {
    await ctx.supabase
      .from('chantier_messages')
      .update({ status: 'failed' })
      .eq('id', message.id);
  }

  // Update conversation last_message_at
  await ctx.supabase
    .from('chantier_conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);

  return new Response(JSON.stringify({
    success: true,
    conversationId,
    messageId: message.id,
    ...(sendFailed ? { sendError } : {}),
  }), { status: sendFailed ? 200 : 200, headers: CORS });
};

// ── OPTIONS ────────────────────────────────────────────────────────────────

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type' },
  });
};
