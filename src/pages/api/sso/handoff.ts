/**
 * SSO handoff cross-domaine pour passer un user authentifié depuis
 * verifiermondevis.fr vers gerermonchantier.fr (ou inversement) sans
 * nouveau login.
 *
 * Mécanisme : on appelle `supabase.auth.admin.generateLink({ type: 'magiclink' })`
 * côté serveur (avec service_role) — cette méthode admin **n'envoie PAS d'email**,
 * elle retourne juste l'`action_link` qui est l'URL Supabase qui valide une session.
 * Le client navigue vers `action_link` → Supabase 302 vers `redirectTo` avec les
 * tokens dans le hash → la page `auth/callback.astro` parse et stocke en localStorage
 * de l'origine cible.
 *
 * Sécurité :
 * - Le caller doit fournir un Bearer JWT valide (le sien) → on vérifie via
 *   `supabase.auth.admin.getUser(token)`. Sans ça, n'importe qui pourrait
 *   demander un magic link pour n'importe quel email.
 * - L'email du magic link est extrait du JWT vérifié, pas du body — pas
 *   moyen de demander un handoff pour un autre user.
 * - `targetPath` est validé (doit commencer par "/", pas "//" pour anti
 *   open-redirect).
 * - `redirectTo` doit être dans la whitelist Supabase (configurée Dashboard).
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const ORIGIN_BY_BRAND = {
  vmd: 'https://www.verifiermondevis.fr',
  gmc: 'https://gerermonchantier.fr',
} as const;

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), { status, headers: CORS });
}

export const POST: APIRoute = async ({ request }) => {
  // 1. Auth caller via Bearer JWT
  const auth = request.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return jsonError('Authentification manquante', 401);

  // 2. Parse body
  let body: { targetBrand?: string; targetPath?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError('Corps de requête invalide', 400);
  }

  const targetBrand = body.targetBrand;
  if (targetBrand !== 'vmd' && targetBrand !== 'gmc') {
    return jsonError('targetBrand doit être "vmd" ou "gmc"', 400);
  }
  const targetPath = typeof body.targetPath === 'string' ? body.targetPath : '/';
  if (!targetPath.startsWith('/') || targetPath.startsWith('//')) {
    return jsonError('targetPath invalide', 400);
  }

  // 3. Vérifie le token côté serveur (anti-spoof)
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('[SSO] Missing Supabase env vars');
    return jsonError('Serveur mal configuré', 500);
  }
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user?.email) {
    return jsonError('Token invalide ou user sans email', 401);
  }
  const email = userData.user.email;

  // 4. Génère le magic link via admin API (pas d'email envoyé)
  const targetOrigin = ORIGIN_BY_BRAND[targetBrand];
  const redirectTo = `${targetOrigin}/auth/callback?next=${encodeURIComponent(targetPath)}`;

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo },
  });

  if (linkError || !linkData?.properties?.action_link) {
    console.error('[SSO] generateLink failed:', linkError?.message);
    return jsonError('Échec génération du lien de handoff', 500);
  }

  return new Response(
    JSON.stringify({ handoff_url: linkData.properties.action_link }),
    { status: 200, headers: CORS },
  );
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
};
