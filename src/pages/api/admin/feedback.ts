export const prerender = false;

/**
 * GET /api/admin/feedback
 *
 * Liste paginée des feedbacks utilisateur (table `analysis_feedback`).
 * Filtrable par choice (positive/neutral/negative) via query param ?choice=...
 * Limite par défaut : 50 entrées les plus récentes.
 *
 * Auth : Bearer JWT obligatoire + rôle admin dans user_roles.
 *
 * Réponse : {
 *   feedback: Array<{
 *     id, analysis_id, user_id, choice, text, verdict_at_submission,
 *     created_at, user_email, file_name
 *   }>,
 *   counts: { total, positive, neutral, negative }
 * }
 */

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireAuth } from '@/lib/api/apiHelpers';

const ALLOWED_CHOICES = new Set(['positive', 'neutral', 'negative']);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export const GET: APIRoute = async ({ request, url }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  // Vérifier que l'appelant est admin
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (!roleData) {
    return jsonError('Accès refusé', 403);
  }

  const choiceFilter = url.searchParams.get('choice');
  const limitRaw = parseInt(url.searchParams.get('limit') || '', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), MAX_LIMIT) : DEFAULT_LIMIT;

  // ── Compteurs par choice (sur l'ensemble, pas seulement la fenêtre paginée)
  // Utilisé pour le badge "32 / 14 / 9" dans le header admin.
  const { data: countsRows, error: countsError } = await (supabase as any)
    .from('analysis_feedback')
    .select('choice');

  if (countsError) {
    console.error('[api/admin/feedback] counts error:', countsError.message);
    return jsonError('Erreur lors du chargement des compteurs', 500);
  }

  const counts = { total: 0, positive: 0, neutral: 0, negative: 0 };
  for (const row of (countsRows ?? []) as Array<{ choice: string }>) {
    counts.total++;
    if (row.choice === 'positive') counts.positive++;
    else if (row.choice === 'neutral') counts.neutral++;
    else if (row.choice === 'negative') counts.negative++;
  }

  // ── Liste paginée
  let query = (supabase as any)
    .from('analysis_feedback')
    .select('id, analysis_id, user_id, choice, text, verdict_at_submission, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (choiceFilter && ALLOWED_CHOICES.has(choiceFilter)) {
    query = query.eq('choice', choiceFilter);
  }

  const { data: feedback, error } = await query;
  if (error) {
    console.error('[api/admin/feedback] list error:', error.message);
    return jsonError('Erreur lors du chargement', 500);
  }

  // ── Enrichir avec user_email + file_name de l'analyse
  // 2 requêtes parallèles, jointes côté Node (Supabase ne joint pas auth.users).
  const userIds = Array.from(new Set((feedback ?? []).map((f: any) => f.user_id)));
  const analysisIds = Array.from(new Set((feedback ?? []).map((f: any) => f.analysis_id)));

  const [{ data: { users } = { users: [] }, error: usersError }, { data: analyses, error: analysesError }] = await Promise.all([
    userIds.length > 0
      ? (supabase as any).auth.admin.listUsers({ perPage: 1000 })
      : Promise.resolve({ data: { users: [] } }),
    analysisIds.length > 0
      ? (supabase as any).from('analyses').select('id, file_name').in('id', analysisIds)
      : Promise.resolve({ data: [] }),
  ]);

  if (usersError) console.warn('[api/admin/feedback] users lookup partial:', usersError.message);
  if (analysesError) console.warn('[api/admin/feedback] analyses lookup partial:', analysesError.message);

  const emailById = new Map<string, string>();
  for (const u of (users ?? []) as Array<{ id: string; email?: string }>) {
    if (u.email) emailById.set(u.id, u.email);
  }
  const fileNameById = new Map<string, string>();
  for (const a of (analyses ?? []) as Array<{ id: string; file_name?: string }>) {
    if (a.file_name) fileNameById.set(a.id, a.file_name);
  }

  const enriched = (feedback ?? []).map((f: any) => ({
    ...f,
    user_email: emailById.get(f.user_id) ?? null,
    file_name: fileNameById.get(f.analysis_id) ?? null,
  }));

  return jsonOk({ feedback: enriched, counts });
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
