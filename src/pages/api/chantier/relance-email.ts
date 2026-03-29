export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireAuth, parseJsonBody } from '@/lib/apiHelpers';
import nodemailer from 'nodemailer';

interface RelanceEmailBody {
  chantierId: string;
  artisanNom: string;
  artisanEmail: string;
  artisanPhone?: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  contenu: string;
  type: string;
}

export const POST: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  const body = await parseJsonBody<RelanceEmailBody>(request);
  if (body instanceof Response) return body;

  const { chantierId, artisanNom, artisanEmail, artisanPhone, senderName, senderEmail, subject, contenu, type } = body;

  if (!chantierId || !artisanEmail || !contenu || !subject) {
    return jsonError('Champs requis manquants (chantierId, artisanEmail, subject, contenu)', 400);
  }

  // Verify chantier ownership
  const { data: chantier } = await supabase
    .from('chantiers')
    .select('id')
    .eq('id', chantierId)
    .eq('user_id', user.id)
    .single();

  if (!chantier) {
    return jsonError('Chantier introuvable', 404);
  }

  // SMTP config
  const smtpHost = import.meta.env.SMTP_HOST;
  const smtpPort = Number(import.meta.env.SMTP_PORT) || 587;
  const smtpUser = import.meta.env.SMTP_USER;
  const smtpPass = import.meta.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.error('[relance-email] SMTP config missing');
    return jsonError('Configuration email non disponible', 500);
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: false, // STARTTLS
      auth: { user: smtpUser, pass: smtpPass },
    });

    const fromName = senderName ? `${senderName} via VerifierMonDevis` : 'VerifierMonDevis';

    await transporter.sendMail({
      from: `"${fromName}" <${smtpUser}>`,
      replyTo: senderEmail || undefined,
      to: artisanEmail,
      subject,
      text: contenu,
    });

    // Save relance to DB
    const { data: relance, error: dbError } = await supabase
      .from('relances')
      .insert({
        chantier_id: chantierId,
        artisan_nom: artisanNom || 'Artisan',
        artisan_email: artisanEmail,
        artisan_phone: artisanPhone || null,
        type: type || 'relance_delai',
        contenu,
        channel: 'email',
        envoye_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (dbError) {
      console.error('[relance-email] DB insert error:', dbError.message);
      // Email was sent successfully, just log the DB error
    }

    return jsonOk({
      success: true,
      relanceId: relance?.id || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    console.error('[relance-email] SMTP error:', message);
    return jsonError(`Échec de l'envoi: ${message}`, 500);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
