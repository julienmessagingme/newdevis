import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { computeGmcInfo } from '@/lib/integrations/gmc-status-compute';
import { GMC_PAYMENTS_LIVE } from '@/lib/integrations/gmc-stripe-config';
import { evaluateArtisanAccess } from './artisanScope';

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

// ── Origine absolue de la requête (URLs de redirection Stripe, etc.) ─────────

/**
 * Origine absolue FIABLE de la requête, dérivée du header `Host`.
 *
 * NE PAS utiliser `new URL(request.url).origin` : sur Vercel SSR, `request.url`
 * résout vers `http://localhost:PORT/...` (URL interne du runtime serverless), ce
 * qui faisait pointer les `success_url` / `cancel_url` / `return_url` Stripe vers
 * localhost après paiement. Le header `Host`, lui, porte le vrai domaine public
 * (c'est ce qu'utilise déjà `middleware.ts`). On préserve l'hôte EXACT de
 * l'utilisateur (apex vs www, ou URL de preview) pour ne pas casser la session
 * localStorage par un saut d'origine.
 */
export function originFromRequest(request: Request): string {
  const host = request.headers.get('host');
  if (!host) return 'https://www.verifiermondevis.fr'; // fallback improbable sur Vercel
  const isLocal = host.startsWith('localhost') || host.startsWith('127.');
  const proto = request.headers.get('x-forwarded-proto') ?? (isLocal ? 'http' : 'https');
  return `${proto}://${host}`;
}

// ── Gate d'acces GMC (lecture seule apres essai expire / non paye) ───────────

/** Acces en ECRITURE GMC : essai en cours OU abonnement actif/past_due. Inactif
 *  tant que les paiements ne sont pas configures (GMC_PAYMENTS_LIVE = price env vars). */
export async function hasGmcWriteAccess(supabase: SupabaseClient, userId: string): Promise<boolean> {
  if (!GMC_PAYMENTS_LIVE) return true;
  const { data } = await supabase
    .from('gmc_subscriptions')
    .select('status, plan, trial_ends_at, current_period_end')
    .eq('user_id', userId)
    .maybeSingle();
  return computeGmcInfo(data, Date.now()).hasAccess;
}

/** Reponse 403 paywall : essai termine, abonnement requis pour ecrire. */
export function gmcPaywallResponse() {
  return new Response(
    JSON.stringify({
      error: 'Votre essai gratuit est terminé. Réabonnez-vous pour modifier votre chantier.',
      code: 'gmc_access_expired',
      upgrade_url: '/gmc-abonnement',
    }),
    { status: 403, headers: CORS },
  );
}

// ── Supabase client (service role) ──────────────────────────────────────────

export function createServiceClient(): SupabaseClient {
  return createClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

// ── Journal — timeline d'activité ───────────────────────────────────────────

/**
 * Logue un événement horodaté dans `chantier_activity` — alimente la timeline
 * du Journal de chantier (changements de statut surtout).
 *
 * Insert via service_role (bypass RLS). À AWAITER par l'appelant : sur Vercel
 * serverless un fire-and-forget peut être coupé avant l'écriture (cf. piège
 * fire-and-forget). N'échoue jamais le call principal — toute erreur est loggée
 * et avalée.
 */
export async function logChantierActivity(
  chantierId: string,
  event: {
    category: string;
    actor?: 'user' | 'agent' | 'system';
    summary: string;
    detail?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<void> {
  try {
    const sb = createServiceClient();
    const { error } = await sb.from('chantier_activity').insert({
      chantier_id: chantierId,
      category: event.category,
      actor: event.actor ?? 'user',
      summary: event.summary,
      detail: event.detail ?? null,
      metadata: event.metadata ?? null,
    });
    if (error) console.error('[logChantierActivity] insert error:', error.message);
  } catch (err) {
    console.error('[logChantierActivity] error:', err instanceof Error ? err.message : err);
  }
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
  // Lecture seule : bloque les ecritures user si l'acces GMC a expire.
  if (request.method !== 'GET' && !(await hasGmcWriteAccess(ctx.supabase, ctx.user.id))) {
    return gmcPaywallResponse();
  }
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
  // FALLBACK process.env — Astro/Vite peut inliner `import.meta.env.AGENT_SECRET_KEY`
  // à build-time à `undefined` pour les vars non-PUBLIC_. process.env est lu au runtime sur Vercel.
  const expectedKey = process.env.AGENT_SECRET_KEY ?? import.meta.env.AGENT_SECRET_KEY;
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
  // Lecture seule : bloque les ecritures user (jamais l'agent) si l'acces GMC a expire.
  if (request.method !== 'GET' && !(await hasGmcWriteAccess(ctx.supabase, ctx.user.id))) {
    return gmcPaywallResponse();
  }
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

// ── Espace Artisan : auth par token (magic-link, sans JWT Supabase) ──────────

export interface ArtisanTokenContext {
  contactId: string;
  chantierId: string;
  /** Owner du chantier — pour les checks abo. JAMAIS exposé à l'artisan. */
  userId: string;
  /** Service-role : DOIT être scopé manuellement par contactId/chantierId à chaque requête. */
  supabase: SupabaseClient;
}

/** 403 générique : ne révèle JAMAIS pourquoi l'accès est refusé (token / abo / contact). */
function artisanDenied(): Response {
  return new Response(
    JSON.stringify({ error: "Cet espace n'est pas accessible actuellement.", code: 'artisan_access_denied' }),
    { status: 403, headers: CORS },
  );
}

/**
 * Valide le token Espace Artisan EN LIVE à chaque requête (header `X-Artisan-Token`) :
 * token non révoqué + abo client actif + contact toujours rattaché au chantier.
 * Toujours via service-role (l'artisan n'a pas de JWT). La décision passe par la fonction
 * PURE testée `evaluateArtisanAccess`. Renvoie un contexte scopé OU un 403 générique.
 *
 * Usage : const ctx = await requireArtisanToken(request); if (ctx instanceof Response) return ctx;
 */
export async function requireArtisanToken(request: Request): Promise<ArtisanTokenContext | Response> {
  const token = request.headers.get('X-Artisan-Token') ?? request.headers.get('x-artisan-token');
  if (!token) return artisanDenied();

  const sb = createServiceClient();

  // 1. Token (service-role bypass RLS)
  const { data: tokenRow } = await sb
    .from('artisan_space_tokens')
    .select('id, chantier_id, contact_id, revoked_at')
    .eq('token', token)
    .maybeSingle();

  // 2. Chantier + owner (pour le gate abo)
  let chantier: { user_id: string } | null = null;
  if (tokenRow) {
    const { data } = await sb
      .from('chantiers')
      .select('user_id')
      .eq('id', tokenRow.chantier_id)
      .maybeSingle();
    chantier = data ?? null;
  }

  // 3. Abo client actif (hasGmcWriteAccess renvoie true si paywall off)
  const subActive = chantier ? await hasGmcWriteAccess(sb, chantier.user_id) : false;

  // 4. Contact toujours rattaché à CE chantier
  let contactOnChantier = false;
  if (tokenRow && chantier) {
    const { data: contact } = await sb
      .from('contacts_chantier')
      .select('id')
      .eq('id', tokenRow.contact_id)
      .eq('chantier_id', tokenRow.chantier_id)
      .maybeSingle();
    contactOnChantier = !!contact;
  }

  // 5. Décision PURE (testée)
  const verdict = evaluateArtisanAccess({
    tokenRow: tokenRow ? { revoked_at: tokenRow.revoked_at } : null,
    chantierExists: !!chantier,
    subActive,
    contactOnChantier,
  });
  if (!verdict.ok) {
    // Diagnostic INTERNE seulement (la réponse HTTP reste générique via artisanDenied).
    // Derrière un flag debug pour ne pas exposer la cause exacte du refus dans les logs.
    if (process.env.DEBUG_ARTISAN === 'true') console.warn('[requireArtisanToken] denied:', verdict.code);
    return artisanDenied();
  }

  // 6. last_used_at (best-effort, non bloquant)
  void sb
    .from('artisan_space_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', tokenRow!.id)
    .then(() => {}, () => {});

  return {
    contactId: tokenRow!.contact_id,
    chantierId: tokenRow!.chantier_id,
    userId: chantier!.user_id,
    supabase: sb,
  };
}
