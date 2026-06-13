export const prerender = false;

// ============================================================
// GMC — /api/gmc-ensure-trial
// Cree l'essai GMC pour un inscrit Google OAuth. Le trigger SQL d'essai se base
// sur signup_source dans les metadonnees, absent en OAuth (metadonnees = Google)
// => les signups Google ne creaient pas d'essai (donc ni welcome ni sequence).
// Cet endpoint, appele par /auth/callback pour un NOUVEL utilisateur sur le
// domaine GMC, insere la ligne gmc_subscriptions (service_role, RLS sans policy).
// L'INSERT declenche le Database Webhook -> gmc-on-signup (welcome) + entree dans
// le scheduler. Idempotent : ON CONFLICT (user_id) ne fait rien.
// ============================================================

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const JSON_HEADERS: Record<string, string> = { 'Content-Type': 'application/json' };
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
const TRIAL_DAYS = 30;

export const POST: APIRoute = async ({ request }) => {
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Configuration serveur manquante' }), { status: 500, headers: JSON_HEADERS });
  }

  // Auth : Bearer = access token de l'utilisateur tout juste authentifie (OAuth).
  const authz = request.headers.get('authorization') || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  if (!token) {
    return new Response(JSON.stringify({ error: 'Token manquant' }), { status: 401, headers: JSON_HEADERS });
  }

  const admin = createClient(supabaseUrl, supabaseServiceKey);
  // Verifie le token et recupere l'utilisateur reel (pas d'usurpation possible).
  const { data: u, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !u?.user) {
    return new Response(JSON.stringify({ error: 'Token invalide' }), { status: 401, headers: JSON_HEADERS });
  }
  const userId = u.user.id;

  const now = Date.now();
  const { error } = await admin.from('gmc_subscriptions').insert({
    user_id: userId,
    status: 'trial',
    plan: 'gmc_essentiel',
    trial_started_at: new Date(now).toISOString(),
    trial_ends_at: new Date(now + TRIAL_DAYS * 86_400_000).toISOString(),
    signup_source: 'gerermonchantier',
  });

  // 23505 = unique_violation : l'essai existe deja (idempotent), pas une erreur.
  if (error && error.code !== '23505') {
    console.error('[gmc-ensure-trial] insert:', error.message);
    return new Response(JSON.stringify({ error: 'Erreur creation essai' }), { status: 500, headers: JSON_HEADERS });
  }

  // created=true uniquement si on vient reellement d'inserer (=> le webhook welcome part).
  return new Response(JSON.stringify({ success: true, created: !error }), { status: 200, headers: JSON_HEADERS });
};
