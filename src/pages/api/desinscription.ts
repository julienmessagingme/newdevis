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

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function redirectTo(path: string) {
  return new Response(null, {
    status: 303,
    headers: { Location: path },
  });
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
    const { error } = await sb.rpc('mark_email_opt_out', { p_email: email });

    if (error) {
      console.error('[desinscription] rpc error:', error.message);
      // On redirige quand même vers success — RGPD favorable : on préfère
      // sur-répondre "désinscrit" que révéler qu'un email n'existe pas.
    }

    return redirectTo(`/desinscription?done=1&e=${encodeURIComponent(email)}`);
  } catch (err) {
    console.error('[desinscription] unexpected:', err instanceof Error ? err.message : err);
    return redirectTo('/desinscription?error=server');
  }
};
