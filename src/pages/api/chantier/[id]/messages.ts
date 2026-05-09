export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuthOrAgent, createServiceClient } from '@/lib/apiHelpers';

// ── POST — send a message to a contact via SendGrid ──────────────────────

export const POST: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuthOrAgent(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;
  const body = await request.json();
  const contactId = body.contact_id;
  // Sanitize subject : strip CRLF pour éviter une injection d'en-têtes SMTP
  // (Subject: foo\r\nBcc: hijack@evil.com → hijack du destinataire).
  const subject   = (body.subject ?? '').trim().replace(/[\r\n]+/g, ' ');
  const bodyText  = (body.body ?? '').trim();

  if (!contactId || !subject || !bodyText)
    return jsonError('contact_id, subject et body requis', 400);

  // Fetch contact (scoped to this chantier)
  const { data: contact, error: contactErr } = await ctx.supabase
    .from('contacts_chantier')
    .select('id, nom, email, telephone')
    .eq('id', contactId)
    .eq('chantier_id', chantierId)
    .single();

  if (contactErr || !contact)
    return jsonError('Contact introuvable', 404);

  if (!contact.email)
    return jsonError('Ce contact n\'a pas d\'adresse email', 400);

  // Rate limit anti-spam : 5 emails outbound max vers ce contact / 24h.
  // Protège contre boucle agent / hallucination "envoie à tous les artisans"
  // ET contre clics manuels excessifs côté Messagerie. Compté via les rows
  // chantier_messages déjà persistées (source unique de vérité — recouvre
  // l'agent et l'UI sans tracker l'origine séparément).
  //
  // ⚠️ Race window connue : check + INSERT non atomiques. Si 2 requêtes
  // simultanées passent le check à 4 messages, les 2 peuvent INSERT → 6 au
  // total. Window très étroite en pratique (ms entre check et insert) et
  // la 7e requête sera bien bloquée. Acceptable pour ce cap soft.
  // Pour atomiser strictement : RPC Postgres `enqueue_email_with_cap()` qui
  // fait check + INSERT dans une transaction. Pas critique aujourd'hui.
  const since24h = new Date(Date.now() - 86_400_000).toISOString();
  const { data: convCheck } = await ctx.supabase
    .from('chantier_conversations')
    .select('id')
    .eq('chantier_id', chantierId)
    .eq('contact_id', contactId)
    .maybeSingle();
  if (convCheck?.id) {
    const { count: recentCount } = await ctx.supabase
      .from('chantier_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', convCheck.id)
      .eq('direction', 'outbound')
      .gte('created_at', since24h);
    if ((recentCount ?? 0) >= 5) {
      return jsonError(
        `Cap de 5 emails sortants sur 24h atteint pour ${contact.nom}. Patientez avant d'en envoyer un nouveau.`,
        429,
      );
    }
  }

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
      return jsonError(convErr?.message ?? 'Erreur création conversation', 500);

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
    return jsonError(msgErr?.message ?? 'Erreur création message', 500);

  // Build sender display name. En mode user JWT, ctx.user.user_metadata est rempli.
  // En mode agent (X-Agent-Key), ctx.user = { id } seulement → on doit fetch via auth admin
  // pour récupérer le nom. Sinon le mail serait signé "Utilisateur" → mauvaise UX.
  let firstName = ctx.user.user_metadata?.first_name ?? '';
  let lastName  = ctx.user.user_metadata?.last_name ?? '';
  let userEmail = ctx.user.email ?? '';
  if (!firstName && !lastName && !userEmail) {
    // Mode agent : récupère le profil via auth.admin (service role).
    const adminClient = createServiceClient();
    const { data: u } = await adminClient.auth.admin.getUserById(ctx.user.id);
    firstName = u?.user?.user_metadata?.first_name ?? '';
    lastName  = u?.user?.user_metadata?.last_name ?? '';
    userEmail = u?.user?.email ?? '';
  }
  const userName  = [firstName, lastName].filter(Boolean).join(' ') || userEmail || 'Utilisateur';

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

  return jsonOk({
    success: true,
    conversationId,
    messageId: message.id,
    ...(sendFailed ? { sendError } : {}),
  });
};

// ── OPTIONS ────────────────────────────────────────────────────────────────

export const OPTIONS: APIRoute = () => optionsResponse();
