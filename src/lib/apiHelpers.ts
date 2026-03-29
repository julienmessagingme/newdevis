import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ── CORS ────────────────────────────────────────────────────────────────────

export const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export function optionsResponse(methods = 'GET,POST,PATCH,DELETE,OPTIONS') {
  return new Response(null, {
    status: 204,
    headers: {
      ...CORS,
      'Access-Control-Allow-Methods': methods,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

// ── Response builders ───────────────────────────────────────────────────────

export function jsonOk<T>(data: T, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export function jsonError(error: string, status = 400) {
  return new Response(JSON.stringify({ error }), { status, headers: CORS });
}

// ── Supabase client (service role) ──────────────────────────────────────────

export function createServiceClient(): SupabaseClient {
  return createClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

// ── Authentication ──────────────────────────────────────────────────────────

export interface AuthContext {
  user: { id: string; email?: string };
  supabase: SupabaseClient;
}

/**
 * Vérifie le Bearer token et retourne le user + supabase client.
 * Retourne null si non authentifié.
 */
export async function authenticate(request: Request): Promise<AuthContext | null> {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const supabase = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser(auth.slice(7));
  if (!user) return null;
  return { user: { id: user.id, email: user.email ?? undefined }, supabase };
}

/**
 * Authentifie OU retourne une Response 401.
 * Usage: const ctx = await requireAuth(request); if (ctx instanceof Response) return ctx;
 */
export async function requireAuth(request: Request): Promise<AuthContext | Response> {
  const ctx = await authenticate(request);
  if (!ctx) return jsonError('Non autorisé', 401);
  return ctx;
}

// ── Ownership ───────────────────────────────────────────────────────────────

/**
 * Vérifie que le chantier appartient à l'utilisateur.
 * Retourne true si OK, false sinon.
 */
export async function verifyChantierOwnership(
  supabase: SupabaseClient,
  chantierId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('chantiers')
    .select('id')
    .eq('id', chantierId)
    .eq('user_id', userId)
    .single();
  return !!data;
}

/**
 * Authentifie + vérifie ownership du chantier.
 * Retourne le contexte auth OU une Response d'erreur.
 */
export async function requireChantierAuth(
  request: Request,
  chantierId: string,
): Promise<AuthContext | Response> {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const owns = await verifyChantierOwnership(ctx.supabase, chantierId, ctx.user.id);
  if (!owns) return jsonError('Chantier introuvable', 404);
  return ctx;
}

// ── Body parsing ────────────────────────────────────────────────────────────

export async function parseJsonBody<T = Record<string, unknown>>(request: Request): Promise<T | Response> {
  try {
    return await request.json() as T;
  } catch {
    return jsonError('Corps de requête invalide', 400);
  }
}
