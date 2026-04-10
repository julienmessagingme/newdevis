export const prerender = false;

import type { APIRoute } from 'astro';
import {
  optionsResponse, jsonOk, jsonError,
  requireChantierAuth, authenticateUserOrAgent,
} from '@/lib/apiHelpers';

// ── GET — list agent insights for a chantier (user auth) ────────────────────

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get('unread') === 'true';
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
  const type = url.searchParams.get('type');

  let query = ctx.supabase
    .from('agent_insights')
    .select('id, type, severity, title, body, source_event, actions_taken, needs_confirmation, read_by_user, created_at')
    .eq('chantier_id', params.id!)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) query = query.eq('read_by_user', false);
  if (type) query = query.eq('type', type);

  // Parallel fetch: insights list + unread count (independent queries)
  const [listRes, countRes] = await Promise.all([
    query,
    ctx.supabase
      .from('agent_insights')
      .select('id', { count: 'exact', head: true })
      .eq('chantier_id', params.id!)
      .eq('read_by_user', false),
  ]);

  if (listRes.error) return jsonError(listRes.error.message, 500);

  return jsonOk({ insights: listRes.data ?? [], unread_count: countRes.count ?? 0 });
};

// ── POST — create insight (agent auth via X-Agent-Key OR user auth) ─────────

export const POST: APIRoute = async ({ params, request }) => {
  const auth = await authenticateUserOrAgent(request);
  if (!auth) return jsonError('Non autorisé', 401);

  const chantierId = params.id!;

  // If agent, verify chantier exists and get user_id
  // If user, verify ownership
  let userId: string;

  if (auth.isAgent) {
    const { data: chantier } = await auth.supabase
      .from('chantiers')
      .select('user_id')
      .eq('id', chantierId)
      .single();
    if (!chantier) return jsonError('Chantier introuvable', 404);
    userId = chantier.user_id;
  } else {
    const { data: owns } = await auth.supabase
      .from('chantiers')
      .select('id')
      .eq('id', chantierId)
      .eq('user_id', auth.user.id)
      .single();
    if (!owns) return jsonError('Chantier introuvable', 404);
    userId = auth.user.id;
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return jsonError('Corps invalide', 400); }

  // Validate required fields
  const type = body.type as string;
  const severity = body.severity as string;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const insightBody = typeof body.body === 'string' ? body.body.trim() : '';

  if (!title || !insightBody) return jsonError('title et body requis', 400);

  const validTypes = [
    'planning_impact', 'budget_alert', 'payment_overdue', 'conversation_summary',
    'risk_detected', 'digest', 'lot_status_change', 'needs_clarification',
  ];
  if (!validTypes.includes(type)) return jsonError(`type invalide: ${type}`, 400);

  const validSeverities = ['info', 'warning', 'critical'];
  if (severity && !validSeverities.includes(severity)) return jsonError(`severity invalide: ${severity}`, 400);

  // Deduplicate: skip if same title exists within 24h
  const yesterday = new Date(Date.now() - 86400000).toISOString();

  const { data: existing } = await auth.supabase
    .from('agent_insights')
    .select('id')
    .eq('chantier_id', chantierId)
    .eq('title', title)
    .gte('created_at', yesterday)
    .limit(1);

  if (existing && existing.length > 0) {
    return jsonOk({ insight: existing[0], deduplicated: true });
  }

  const { data, error } = await auth.supabase
    .from('agent_insights')
    .insert({
      chantier_id: chantierId,
      user_id: userId,
      type,
      severity: severity || 'info',
      title,
      body: insightBody,
      source_event: body.source_event ?? null,
      actions_taken: body.actions_taken ?? body.actions_summary ?? [],
      needs_confirmation: body.needs_confirmation === true,
    })
    .select()
    .single();

  if (error) return jsonError(error.message, 500);
  return jsonOk({ insight: data }, 201);
};

// ── PATCH — mark insight(s) as read (user auth) ─────────────────────────────

export const PATCH: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return jsonError('Corps invalide', 400); }

  // Mark single insight as read
  if (typeof body.insight_id === 'string') {
    const { data, error } = await ctx.supabase
      .from('agent_insights')
      .update({ read_by_user: true })
      .eq('id', body.insight_id)
      .eq('chantier_id', params.id!)
      .select()
      .single();

    if (error) return jsonError(error.message, 500);
    return jsonOk({ insight: data });
  }

  // Mark all as read
  if (body.mark_all_read === true) {
    const { error } = await ctx.supabase
      .from('agent_insights')
      .update({ read_by_user: true })
      .eq('chantier_id', params.id!)
      .eq('read_by_user', false);

    if (error) return jsonError(error.message, 500);
    return jsonOk({ ok: true });
  }

  return jsonError('insight_id ou mark_all_read requis', 400);
};

// ── OPTIONS ─────────────────────────────────────────────────────────────────

export const OPTIONS: APIRoute = () => optionsResponse();
