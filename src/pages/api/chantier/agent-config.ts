export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireAuth } from '@/lib/apiHelpers';

// ── GET — read agent config for current user ────────────────────────────────

export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;

  const { data, error } = await ctx.supabase
    .from('agent_config')
    .select('agent_mode, openclaw_url, openclaw_agent_id, created_at, updated_at')
    .eq('user_id', ctx.user.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = not found — that's fine, return defaults
    return jsonError(error.message, 500);
  }

  // If no config, return defaults (edge_function mode)
  if (!data) {
    return jsonOk({
      config: {
        agent_mode: 'edge_function',
        openclaw_url: null,
        openclaw_agent_id: null,
      },
    });
  }

  return jsonOk({ config: data });
};

// ── PUT — update agent config ───────────────────────────────────────────────

export const PUT: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return jsonError('Corps invalide', 400); }

  const mode = body.agent_mode as string;
  const validModes = ['edge_function', 'openclaw', 'disabled'];
  if (mode && !validModes.includes(mode)) {
    return jsonError(`agent_mode invalide: ${mode}. Valeurs: ${validModes.join(', ')}`, 400);
  }

  // Validate OpenClaw fields when switching to openclaw mode
  if (mode === 'openclaw') {
    if (!body.openclaw_url || typeof body.openclaw_url !== 'string') {
      return jsonError('openclaw_url requis pour le mode openclaw', 400);
    }
    if (!body.openclaw_token || typeof body.openclaw_token !== 'string') {
      return jsonError('openclaw_token requis pour le mode openclaw', 400);
    }
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (mode) update.agent_mode = mode;
  if (typeof body.openclaw_url === 'string') update.openclaw_url = body.openclaw_url;
  if (typeof body.openclaw_token === 'string') update.openclaw_token = body.openclaw_token;
  if (typeof body.openclaw_agent_id === 'string') update.openclaw_agent_id = body.openclaw_agent_id;

  // Clear OpenClaw fields when switching away from openclaw
  if (mode && mode !== 'openclaw') {
    update.openclaw_url = null;
    update.openclaw_token = null;
    update.openclaw_agent_id = null;
  }

  // Upsert — create if doesn't exist
  const { data, error } = await ctx.supabase
    .from('agent_config')
    .upsert(
      { user_id: ctx.user.id, ...update },
      { onConflict: 'user_id' },
    )
    .select('agent_mode, openclaw_url, openclaw_agent_id, updated_at')
    .single();

  if (error) return jsonError(error.message, 500);
  return jsonOk({ config: data });
};

// ── OPTIONS ─────────────────────────────────────────────────────────────────

export const OPTIONS: APIRoute = () => optionsResponse('GET,PUT,OPTIONS');
