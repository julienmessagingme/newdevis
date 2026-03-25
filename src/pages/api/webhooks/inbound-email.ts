export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseService = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

const HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function makeClient() {
  return createClient(supabaseUrl, supabaseService);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract the reply address from a "to" field.
 * SendGrid may send: "chantier-xxx+yyy@reply.verifiermondevis.fr"
 * or: "Some Name <chantier-xxx+yyy@reply.verifiermondevis.fr>"
 * or multiple addresses comma-separated.
 */
function extractReplyAddress(toField: string): string | null {
  // Look for an address matching chantier-...@...
  const match = toField.match(/<?([^<>\s,]*chantier-[^<>\s,@]+@[^<>\s,>]+)>?/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Strip quoted text and signatures from email body.
 * Simple heuristic: cut at first line starting with ">" or "On ... wrote:"
 * or common signature markers.
 */
function stripQuotedText(text: string): string {
  const lines = text.split('\n');
  const cutMarkers = [
    /^>/, // quoted lines
    /^On .+ wrote:$/i,
    /^Le .+ a \u00e9crit\s?:$/i, // French: "Le ... a écrit :"
    /^-{2,}\s*(?:Original Message|Message d'origine)/i,
    /^_{2,}/,
    /^Envoy\u00e9 depuis/i, // "Envoyé depuis mon iPhone" etc.
    /^Sent from/i,
    /^Get Outlook/i,
  ];

  const cleanLines: string[] = [];
  for (const line of lines) {
    if (cutMarkers.some(re => re.test(line.trim()))) break;
    cleanLines.push(line);
  }

  return cleanLines.join('\n').trim();
}

// ── Parse request body (formData or JSON) ─────────────────────────────────────

interface InboundFields {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
}

async function parseInboundPayload(request: Request): Promise<InboundFields | null> {
  const contentType = request.headers.get('content-type') ?? '';

  // Try multipart/form-data first (SendGrid default)
  if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
    try {
      const formData = await request.formData();
      return {
        to:      (formData.get('to') as string) ?? '',
        from:    (formData.get('from') as string) ?? '',
        subject: (formData.get('subject') as string) ?? '',
        text:    (formData.get('text') as string) ?? '',
        html:    (formData.get('html') as string) ?? '',
      };
    } catch (err) {
      console.error('[inbound-email] formData parse error:', err instanceof Error ? err.message : err);
    }
  }

  // Fallback: JSON
  try {
    const json = await request.json();
    return {
      to:      json.to ?? '',
      from:    json.from ?? '',
      subject: json.subject ?? '',
      text:    json.text ?? '',
      html:    json.html ?? '',
    };
  } catch (err) {
    console.error('[inbound-email] JSON parse error:', err instanceof Error ? err.message : err);
  }

  return null;
}

// ── POST — receive inbound email from SendGrid Inbound Parse ──────────────────

export const POST: APIRoute = async ({ request }) => {
  // Always return 200 to prevent SendGrid retries
  const ok = (body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status: 200, headers: HEADERS });

  try {
    if (!supabaseUrl || !supabaseService) {
      console.error('[inbound-email] Missing Supabase config');
      return ok({ error: 'config_missing' });
    }

    // 1. Parse payload
    const fields = await parseInboundPayload(request);
    if (!fields || !fields.to) {
      console.warn('[inbound-email] Could not parse payload or missing "to" field');
      return ok({ ignored: true, reason: 'unparseable' });
    }

    console.log(`[inbound-email] Received email from=${fields.from} to=${fields.to} subject="${fields.subject}"`);

    // 2. Extract reply address from "to" field
    const replyAddress = extractReplyAddress(fields.to);
    if (!replyAddress) {
      console.warn('[inbound-email] No chantier reply address found in "to":', fields.to);
      return ok({ ignored: true, reason: 'no_reply_address' });
    }

    const supabase = makeClient();

    // 3. Find conversation by reply_address
    const { data: conversation, error: convError } = await supabase
      .from('chantier_conversations')
      .select('id, chantier_id, user_id, contact_name, unread_count')
      .eq('reply_address', replyAddress)
      .single();

    if (convError || !conversation) {
      // Try matching just the local part (before @)
      const localPart = replyAddress.split('@')[0];
      const { data: convFallback } = await supabase
        .from('chantier_conversations')
        .select('id, chantier_id, user_id, contact_name, unread_count')
        .ilike('reply_address', `${localPart}@%`)
        .single();

      if (!convFallback) {
        console.warn('[inbound-email] No conversation found for reply_address:', replyAddress);
        return ok({ ignored: true, reason: 'conversation_not_found' });
      }

      // Use fallback result
      Object.assign(conversation ?? {}, convFallback);
      if (!conversation) {
        // Process with convFallback directly
        return await processInbound(supabase, convFallback, fields, ok);
      }
    }

    return await processInbound(supabase, conversation, fields, ok);

  } catch (err) {
    console.error('[inbound-email] Unexpected error:', err instanceof Error ? err.message : err);
    return ok({ error: 'internal_error' });
  }
};

// ── Process the inbound message ───────────────────────────────────────────────

async function processInbound(
  supabase: ReturnType<typeof makeClient>,
  conversation: { id: string; chantier_id: string; user_id: string; contact_name: string; unread_count: number },
  fields: InboundFields,
  ok: (body: Record<string, unknown>) => Response,
): Promise<Response> {

  // 4. Clean body text
  const cleanedText = stripQuotedText(fields.text || '');

  // 5. Insert inbound message
  const { error: msgErr } = await supabase
    .from('chantier_messages')
    .insert({
      conversation_id: conversation.id,
      direction:       'inbound',
      subject:         fields.subject || null,
      body_text:       cleanedText || null,
      body_html:       fields.html || null,
      status:          'delivered',
    });

  if (msgErr) {
    console.error('[inbound-email] Failed to insert message:', msgErr.message);
    return ok({ error: 'insert_failed' });
  }

  // 6. Update conversation: increment unread_count + last_message_at
  const currentUnread = conversation.unread_count ?? 0;
  await supabase
    .from('chantier_conversations')
    .update({
      unread_count:    currentUnread + 1,
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversation.id);

  // 7. Send notification email to the client
  try {
    await sendNotificationEmail(supabase, conversation);
  } catch (err) {
    // Non-blocking — log but don't fail the webhook
    console.error('[inbound-email] Notification email failed:', err instanceof Error ? err.message : err);
  }

  console.log(`[inbound-email] Message stored for conversation ${conversation.id}`);
  return ok({ success: true, conversationId: conversation.id });
}

// ── Notification email to the chantier owner ──────────────────────────────────

async function sendNotificationEmail(
  supabase: ReturnType<typeof makeClient>,
  conversation: { id: string; chantier_id: string; user_id: string; contact_name: string },
) {
  const sendgridApiKey = import.meta.env.SENDGRID_API_KEY;
  if (!sendgridApiKey) {
    console.warn('[inbound-email] SENDGRID_API_KEY not configured — skipping notification');
    return;
  }

  // Get user email
  const { data: { user } } = await supabase.auth.admin.getUserById(conversation.user_id);
  if (!user?.email) {
    console.warn('[inbound-email] Could not find user email for notification');
    return;
  }

  // Get chantier name
  const { data: chantier } = await supabase
    .from('chantiers')
    .select('nom')
    .eq('id', conversation.chantier_id)
    .single();

  const chantierNom  = chantier?.nom ?? 'votre chantier';
  const contactName  = conversation.contact_name ?? 'Un artisan';
  const chantierUrl  = `https://www.verifiermondevis.fr/mon-chantier/${conversation.chantier_id}`;

  const sgMail = await import('@sendgrid/mail');
  sgMail.default.setApiKey(sendgridApiKey);

  await sgMail.default.send({
    to:   user.email,
    from: { email: 'noreply@verifiermondevis.fr', name: 'VerifierMonDevis' },
    subject: `Nouvelle r\u00e9ponse de ${contactName} - ${chantierNom}`,
    text: [
      `${contactName} a r\u00e9pondu \u00e0 votre message sur le chantier "${chantierNom}".`,
      '',
      `Consultez la r\u00e9ponse : ${chantierUrl}`,
    ].join('\n'),
  });
}

// ── OPTIONS (CORS preflight) ──────────────────────────────────────────────────

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      ...HEADERS,
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
