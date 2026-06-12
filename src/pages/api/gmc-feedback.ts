export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const JSON_HEADERS: Record<string, string> = { 'Content-Type': 'application/json' };

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = import.meta.env.RESEND_API_KEY;
const ADMIN_EMAILS = ['julien@messagingme.fr', 'bridey.johan@gmail.com'];

function clip(s: unknown, max: number): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  return t ? t.slice(0, max) : null;
}
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const POST: APIRoute = async ({ request }) => {
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Configuration serveur manquante' }), { status: 500, headers: JSON_HEADERS });
  }

  let body: { source?: string; reason?: string; comment?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps de requête invalide' }), { status: 400, headers: JSON_HEADERS });
  }

  const reason = clip(body.reason, 160);
  const comment = clip(body.comment, 2000);
  const source = clip(body.source, 60) ?? 'page';
  let email = clip(body.email, 200);
  if (email) {
    email = email.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) email = null;
  }

  // Au moins une raison OU un commentaire : on ne stocke pas les soumissions vides.
  if (!reason && !comment) {
    return new Response(JSON.stringify({ error: 'Avis vide' }), { status: 400, headers: JSON_HEADERS });
  }

  const userAgent = (request.headers.get('user-agent') || '').slice(0, 300);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { error } = await supabase
    .from('gmc_feedback')
    .insert({ source, reason, comment, email, user_agent: userAgent });

  if (error) {
    console.error('[gmc-feedback] insert:', error.message);
    return new Response(JSON.stringify({ error: 'Erreur lors de l\'enregistrement' }), { status: 500, headers: JSON_HEADERS });
  }

  // Notif admin best-effort : ne fire que si RESEND_API_KEY est present cote Vercel.
  // L'avis est deja stocke quoi qu'il arrive.
  if (RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'GererMonChantier <bonjour@gerermonchantier.fr>',
          to: ADMIN_EMAILS,
          subject: `Avis GMC (${source})${reason ? ' : ' + reason : ''}`,
          html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0E1730;line-height:1.7">
            <h2 style="margin:0 0 12px">Nouvel avis GererMonChantier</h2>
            <p><b>Source</b> : ${esc(source)}</p>
            <p><b>Raison</b> : ${reason ? esc(reason) : '(non précisée)'}</p>
            <p><b>Commentaire</b> :<br>${comment ? esc(comment).replace(/\n/g, '<br>') : '(aucun)'}</p>
            <p><b>Email</b> : ${email ? esc(email) : '(non fourni)'}</p>
          </div>`,
        }),
      });
    } catch (e) {
      console.error('[gmc-feedback] resend:', (e as Error).message);
    }
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: JSON_HEADERS });
};
