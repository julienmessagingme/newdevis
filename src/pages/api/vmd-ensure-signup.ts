export const prerender = false;

// ============================================================
// VMD — /api/vmd-ensure-signup
// Cree la ligne vmd_signups pour un inscrit Google OAuth. Le trigger SQL se base
// sur signup_source dans les metadonnees, absent en OAuth (metadonnees = Google)
// => les signups Google ne creaient pas de ligne (donc ni welcome ni sequence).
// Cet endpoint, appele par /auth/callback pour un NOUVEL utilisateur sur le
// domaine VMD, insere la ligne (service_role, RLS sans policy). L'INSERT declenche
// le Database Webhook -> vmd-on-signup (welcome + notif admin). Idempotent.
// ============================================================

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

const JSON_HEADERS: Record<string, string> = { 'Content-Type': 'application/json' };
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

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
  const user = u.user;
  const meta = (user.user_metadata ?? {}) as Record<string, string>;
  const prenom = (meta.first_name || (meta.full_name || meta.name || '').split(' ')[0] || '').trim();

  const { error } = await admin.from('vmd_signups').insert({
    user_id: user.id,
    email: user.email ?? null,
    prenom: prenom || null,
    phone: meta.phone ?? null,
    signup_source: 'verifiermondevis',
  });

  // 23505 = unique_violation : la ligne existe deja (idempotent), pas une erreur.
  if (error && error.code !== '23505') {
    console.error('[vmd-ensure-signup] insert:', error.message);
    return new Response(JSON.stringify({ error: 'Erreur creation signup' }), { status: 500, headers: JSON_HEADERS });
  }

  // created=true uniquement si on vient reellement d'inserer (=> le webhook welcome part).
  return new Response(JSON.stringify({ success: true, created: !error }), { status: 200, headers: JSON_HEADERS });
};
