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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Agent-Key',
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

// ── Agent authentication (edge functions → API routes) ─────────────────────

/**
 * Vérifie le header X-Agent-Key pour l'authentification inter-service.
 * Utilisé par les edge functions (agent-orchestrator, agent-checks) pour appeler
 * les API routes sans JWT utilisateur.
 * Retourne un SupabaseClient service_role si la clé est valide, null sinon.
 */
export function authenticateAgentKey(request: Request): SupabaseClient | null {
  const agentKey = request.headers.get('X-Agent-Key');
  const expectedKey = import.meta.env.AGENT_SECRET_KEY;
  if (!agentKey || !expectedKey || agentKey !== expectedKey) return null;
  return createServiceClient();
}

/**
 * Authentifie soit par JWT (user) soit par X-Agent-Key (agent).
 * Pour les routes qui doivent être accessibles aux deux.
 * Retourne { user, supabase, isAgent } ou null.
 */
export async function authenticateUserOrAgent(
  request: Request,
): Promise<(AuthContext & { isAgent: boolean }) | null> {
  // Try agent key first (faster — no DB call)
  const agentClient = authenticateAgentKey(request);
  if (agentClient) {
    return { user: { id: 'agent', email: 'agent@system' }, supabase: agentClient, isAgent: true };
  }
  // Fall back to JWT
  const ctx = await authenticate(request);
  if (!ctx) return null;
  return { ...ctx, isAgent: false };
}

// ── Agent-aware chantier auth (JWT or X-Agent-Key) ───────────────────────

/**
 * Authentifie par JWT (user ownership) ou par X-Agent-Key (agent inter-service).
 * Pour les routes que l'agent IA appelle via tools.ts (taches, planning, lots).
 * - Agent: vérifie clé + chantier exists → retourne { user: { id: chantier.user_id }, supabase, isAgent: true }
 * - User: même logique que requireChantierAuth (JWT + ownership)
 * Retourne le contexte OU une Response d'erreur.
 */
export async function requireChantierAuthOrAgent(
  request: Request,
  chantierId: string,
): Promise<(AuthContext & { isAgent: boolean }) | Response> {
  // Try agent key first (faster — no DB call for auth)
  const agentClient = authenticateAgentKey(request);
  if (agentClient) {
    // Agent needs to know the chantier owner's user_id for RLS-scoped operations
    const { data: chantier } = await agentClient
      .from('chantiers')
      .select('user_id')
      .eq('id', chantierId)
      .single();
    if (!chantier) return jsonError('Chantier introuvable', 404);
    return { user: { id: chantier.user_id }, supabase: agentClient, isAgent: true };
  }
  // Fall back to JWT + ownership check
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const owns = await verifyChantierOwnership(ctx.supabase, chantierId, ctx.user.id);
  if (!owns) return jsonError('Chantier introuvable', 404);
  return { ...ctx, isAgent: false };
}

// ── OpenClaw real-time trigger (fire-and-forget) ───────────────────────────

/**
 * Trigger l'agent OpenClaw en temps réel (si l'utilisateur est en mode openclaw).
 * Edge function users → rien (traité par cron).
 * Appelé fire-and-forget depuis les webhooks (whapi, inbound-email).
 */
export async function triggerAgentIfOpenClaw(event: {
  event_type: string;
  chantier_id: string;
  user_id: string;
  payload: Record<string, unknown>;
}) {
  try {
    const supabase = createServiceClient();
    const { data: config } = await supabase
      .from('agent_config')
      .select('agent_mode, openclaw_url, openclaw_token, openclaw_agent_id')
      .eq('user_id', event.user_id)
      .single();

    if (config?.agent_mode !== 'openclaw' || !config.openclaw_url || !config.openclaw_token) return;

    const url = config.openclaw_url.replace(/\/$/, '');
    const p = event.payload as Record<string, string>;

    let message: string;
    switch (event.event_type) {
      case 'whatsapp_message':
        message = `[GererMonChantier] Message WhatsApp chantier ${event.chantier_id}\nDe: ${p.from}\nMessage: ${p.body}\n\nUtilise tes skills chantier-* pour analyser et agir.`;
        break;
      case 'inbound_email':
        message = `[GererMonChantier] Email reçu chantier ${event.chantier_id}\nDe: ${p.from}\nSujet: ${p.subject}\nContenu: ${p.body}\n\nUtilise tes skills chantier-*.`;
        break;
      case 'document_uploaded':
        message = `[GererMonChantier] Document uploadé chantier ${event.chantier_id}\nNom: ${p.nom}\nType: ${p.document_type}\n\nUtilise tes skills chantier-*.`;
        break;
      default:
        message = `[GererMonChantier] Event ${event.event_type} chantier ${event.chantier_id}\n${JSON.stringify(p)}`;
    }

    fetch(`${url}/hooks/agent`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.openclaw_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        name: 'GererMonChantier',
        agentId: config.openclaw_agent_id ?? undefined,
        sessionKey: `hook:chantier:${event.chantier_id}`,
        wakeMode: 'now',
        deliver: false,
      }),
    }).catch(() => {});
  } catch { /* silent fail — fire and forget */ }
}

// ── Body parsing ────────────────────────────────────────────────────────────

export async function parseJsonBody<T = Record<string, unknown>>(request: Request): Promise<T | Response> {
  try {
    return await request.json() as T;
  } catch {
    return jsonError('Corps de requête invalide', 400);
  }
}
