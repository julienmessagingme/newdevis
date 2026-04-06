export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/apiHelpers';

/**
 * POST /api/chantier/[id]/lots
 * Crée un lot individuel dans un chantier.
 * Body: { nom: string, emoji?: string, jobType?: string }
 */
export const POST: APIRoute = async ({ request, params }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError('Corps de requête invalide', 400);
  }

  const nom = typeof body.nom === 'string' ? body.nom.trim() : '';
  if (!nom) {
    return jsonError('Le nom du lot est requis', 400);
  }

  const { data, error } = await ctx.supabase
    .from('lots_chantier')
    .insert({
      chantier_id: params.id!,
      nom,
      emoji: typeof body.emoji === 'string' ? body.emoji : null,
      job_type: typeof body.jobType === 'string' ? body.jobType : null,
      statut: 'a_trouver',
    })
    .select('id, nom, emoji, job_type, statut')
    .single();

  if (error) {
    console.error('[api/chantier/lots POST] error:', error.message);
    return jsonError('Erreur lors de la création du lot', 500);
  }

  // Invalidate agent context cache (new lot = stale context)
  ctx.supabase.from('agent_context_cache')
    .update({ invalidated: true })
    .eq('chantier_id', params.id!)
    .then(() => {}).catch(() => {});

  return jsonOk({ lot: data }, 201);
};

// ── GET /api/chantier/[id]/lots ──────────────────────────────────────────────
// Liste les lots réels du chantier depuis lots_chantier (pas les fallback metadata).

export const GET: APIRoute = async ({ request, params }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const { data: lots, error } = await ctx.supabase
    .from('lots_chantier')
    .select('id, nom, emoji, statut, ordre, job_type, role')
    .eq('chantier_id', params.id!)
    .order('ordre', { ascending: true });

  if (error) {
    console.error('[api/chantier/lots GET] error:', error.message);
    return jsonError('Erreur chargement lots', 500);
  }

  return jsonOk({ lots: lots ?? [] });
};

export const OPTIONS: APIRoute = () => optionsResponse();
