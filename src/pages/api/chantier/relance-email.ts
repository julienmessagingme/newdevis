export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseService = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabase() {
  return createClient(supabaseUrl, supabaseService);
}

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
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: CORS });
  }

  const token = authHeader.slice(7);
  const supabase = getSupabase();

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Token invalide' }), { status: 401, headers: CORS });
  }

  let body: RelanceEmailBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps de requête invalide' }), { status: 400, headers: CORS });
  }

  const { chantierId, artisanNom, artisanEmail, artisanPhone, senderName, senderEmail, subject, contenu, type } = body;

  if (!chantierId || !artisanEmail || !contenu || !subject) {
    return new Response(JSON.stringify({ error: 'Champs requis manquants (chantierId, artisanEmail, subject, contenu)' }), { status: 400, headers: CORS });
  }

  // Verify chantier ownership
  const { data: chantier } = await supabase
    .from('chantiers')
    .select('id')
    .eq('id', chantierId)
    .eq('user_id', user.id)
    .single();

  if (!chantier) {
    return new Response(JSON.stringify({ error: 'Chantier introuvable' }), { status: 404, headers: CORS });
  }

  // SMTP config
  const smtpHost = import.meta.env.SMTP_HOST;
  const smtpPort = Number(import.meta.env.SMTP_PORT) || 587;
  const smtpUser = import.meta.env.SMTP_USER;
  const smtpPass = import.meta.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.error('[relance-email] SMTP config missing');
    return new Response(JSON.stringify({ error: 'Configuration email non disponible' }), { status: 500, headers: CORS });
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

    return new Response(JSON.stringify({
      success: true,
      relanceId: relance?.id || null,
    }), { status: 200, headers: CORS });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    console.error('[relance-email] SMTP error:', message);
    return new Response(JSON.stringify({ error: `Échec de l'envoi: ${message}` }), { status: 500, headers: CORS });
  }
};

export const OPTIONS: APIRoute = () =>
  new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
