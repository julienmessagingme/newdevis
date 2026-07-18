/**
 * POST /api/desinscription
 *
 * Endpoint de désinscription publique par email (sans UUID).
 * Complète la voie 1-click /desinscription?u=<uuid> pour les cas où le
 * destinataire ne peut pas ou ne veut pas cliquer sur le lien intégré.
 *
 * RGPD-safe : la réponse est toujours identique (success), qu'un compte
 * existe ou non pour cet email. Cela évite de leaker qui est inscrit et
 * réduit le vecteur d'abus (enum email).
 *
 * Rate-limit léger côté client : le formulaire redirige vers /desinscription
 * ?done=1 après submit. Le SQL `mark_email_opt_out` est idempotent — si l'email
 * n'est pas dans la base, il retourne 0 sans erreur.
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.SUPABASE_URL;
const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
const resendKey = import.meta.env.RESEND_API_KEY_VMD || import.meta.env.RESEND_API_KEY;

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function redirectTo(path: string) {
  return new Response(null, {
    status: 303,
    headers: { Location: path },
  });
}

/**
 * Envoie un mail de confirmation de désinscription — best-effort, ne bloque
 * jamais la réponse au client (l'opt-out est déjà appliqué en DB).
 * Envoyé depuis bonjour@verifiermondevis.fr (domaine vérifié sur Resend).
 */
async function sendConfirmationEmail(email: string, brandLabel: string): Promise<void> {
  if (!resendKey) {
    console.warn('[desinscription] RESEND_API_KEY absent — mail de confirmation skip');
    return;
  }

  const subject = 'Confirmation de votre désinscription';
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#F7F7F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1A1A1A;line-height:1.6;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #E5E5E0;border-radius:12px;padding:32px;">
    <p style="margin:0 0 16px;font-size:16px;">Bonjour,</p>
    <p style="margin:0 0 16px;font-size:15px;">
      Votre demande de désinscription a bien été enregistrée. L'adresse
      <strong>${email}</strong> ne recevra plus d'emails de ${brandLabel}.
    </p>
    <p style="margin:0 0 16px;font-size:15px;">
      Cet opt-out s'applique aux séquences de bienvenue, d'engagement et de
      conversion sur les deux services VerifierMonDevis et GérerMonChantier.
      Les emails contractuels liés à un paiement en cours (facturation,
      renouvellement) restent envoyés — c'est une obligation légale.
    </p>
    <p style="margin:0 0 24px;font-size:15px;">
      Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet
      email — aucun compte n'est supprimé, il suffit de vous réinscrire depuis
      notre site pour recevoir nos communications à nouveau.
    </p>
    <p style="margin:0 0 4px;font-size:14px;color:#666;">
      L'équipe VerifierMonDevis
    </p>
    <p style="margin:0;font-size:12px;color:#999;">
      https://www.verifiermondevis.fr
    </p>
  </div>
  <p style="max-width:560px;margin:16px auto 0;font-size:11px;color:#999;text-align:center;">
    Cet email a été envoyé automatiquement à la suite de votre demande sur
    verifiermondevis.fr/desinscription. Vous ne pouvez pas répondre à cette
    adresse. Pour toute question, écrivez à contact@verifiermondevis.fr.
  </p>
</body></html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'VerifierMonDevis <bonjour@verifiermondevis.fr>',
        to: [email],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[desinscription] Resend HTTP', res.status, detail.substring(0, 200));
    }
  } catch (e) {
    console.error('[desinscription] Resend send failed:', e instanceof Error ? e.message : e);
  }
}

function detectBrandLabel(request: Request): string {
  const host = request.headers.get('host') ?? '';
  return host.includes('gerermonchantier') ? 'GérerMonChantier' : 'VerifierMonDevis';
}

export const POST: APIRoute = async ({ request }) => {
  try {
    let email = '';
    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      email = String(form.get('email') ?? '').trim().toLowerCase();
    } else {
      const body = await request.json().catch(() => ({}));
      email = String(body?.email ?? '').trim().toLowerCase();
    }

    if (!email || !EMAIL_REGEX.test(email)) {
      return redirectTo('/desinscription?error=email');
    }

    if (!supabaseUrl || !serviceKey) {
      console.error('[desinscription] Missing Supabase env');
      return redirectTo(`/desinscription?done=1&e=${encodeURIComponent(email)}`);
    }

    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Appelle la fonction SQL — idempotente, retourne 0 si l'email n'existe pas.
    const { data: nbFlipped, error } = await sb.rpc('mark_email_opt_out', { p_email: email });

    if (error) {
      console.error('[desinscription] rpc error:', error.message);
      // On redirige quand même vers success — RGPD favorable : on préfère
      // sur-répondre "désinscrit" que révéler qu'un email n'existe pas.
    }

    // Envoi de la confirmation par email — best-effort, ne bloque pas la
    // redirection. Envoyé uniquement si au moins une table a été flippée
    // (nbFlipped >= 1) pour éviter d'envoyer un mail à quelqu'un qui n'était
    // pas dans la base (protection anti-abus léger).
    if (typeof nbFlipped === 'number' && nbFlipped >= 1) {
      const brandLabel = detectBrandLabel(request);
      // Fire-and-forget avec await pour que Vercel ne coupe pas la fonction.
      await sendConfirmationEmail(email, brandLabel);
    }

    return redirectTo(`/desinscription?done=1&e=${encodeURIComponent(email)}`);
  } catch (err) {
    console.error('[desinscription] unexpected:', err instanceof Error ? err.message : err);
    return redirectTo('/desinscription?error=server');
  }
};
