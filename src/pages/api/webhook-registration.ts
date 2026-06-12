export const prerender = false;

import type { APIRoute } from 'astro';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export const POST: APIRoute = async ({ request }) => {
  let body: {
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    accept_commercial?: boolean;
    /** Domaine d'entrée — `verifiermondevis` ou `gerermonchantier`.
     * Tracé pour l'analytics d'acquisition. À terme, sera persisté
     * en DB (colonne `subscriptions.signup_source` ou similaire). */
    signup_source?: string;
  };

  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Corps de requête invalide' }),
      { status: 400, headers: CORS },
    );
  }

  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return new Response(
      JSON.stringify({ error: 'Email requis' }),
      { status: 400, headers: CORS },
    );
  }

  // Whitelist des sources autorisées pour éviter d'avoir n'importe quelle string
  // arbitraire envoyée à l'analytics depuis le client.
  const allowedSources = ['verifiermondevis', 'gerermonchantier'];
  const signupSource = body.signup_source && allowedSources.includes(body.signup_source)
    ? body.signup_source
    : 'verifiermondevis';

  // 2026-06-12 — Webhook MessagingMe RETIRÉ (bricolage initial non fonctionnel).
  // Les side-effects d'inscription (essai GMC + emails welcome / notif admin) passent
  // désormais côté serveur : trigger DB sur auth.users + edge function Resend.
  // Endpoint conservé en no-op pour ne pas casser l'appel encore présent dans
  // callback.astro (à nettoyer une fois le flux serveur en place).
  void email; void signupSource;

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: CORS },
  );
};
