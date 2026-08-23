/**
 * GET/POST /api/analyse/[id]/outcome — issue du devis via la bannière in-app.
 *
 * 2026-08-24 (boucle de capture des issues). GET : l'issue enregistrée (ou
 * null) pour décider d'afficher la bannière « Ce devis, finalement ? ».
 * POST : enregistre le choix de l'utilisateur connecté (source 'banner').
 * Auth : propriétaire de l'analyse uniquement (Bearer).
 */
import type { APIRoute } from 'astro';
import { jsonOk, jsonError, optionsResponse, requireAuth, createServiceClient } from '@/lib/api/apiHelpers';

export const prerender = false;

const CHOICES = new Set(['signe_tel_quel', 'signe_apres_negociation', 'non_signe', 'hesite']);

async function loadOwnedAnalysis(request: Request, analysisId: string) {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const supabase = createServiceClient();
  const { data: analysis } = await supabase
    .from('analyses')
    .select('id, user_id, conclusion_ia')
    .eq('id', analysisId)
    .single();
  if (!analysis || analysis.user_id !== ctx.user.id) return jsonError('Analyse introuvable', 404);
  return { supabase, analysis, userId: ctx.user.id };
}

export const GET: APIRoute = async ({ params, request }) => {
  const res = await loadOwnedAnalysis(request, params.id!);
  if (res instanceof Response) return res;
  const { supabase } = res;
  const { data } = await supabase
    .from('analysis_outcomes')
    .select('outcome, remise_montant, created_at')
    .eq('analysis_id', params.id!)
    .maybeSingle();
  return jsonOk({ outcome: data ?? null });
};

export const POST: APIRoute = async ({ params, request }) => {
  const res = await loadOwnedAnalysis(request, params.id!);
  if (res instanceof Response) return res;
  const { supabase, analysis, userId } = res;

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return jsonError('Corps JSON invalide', 400); }

  const outcome = String(body.outcome ?? '');
  if (!CHOICES.has(outcome)) return jsonError('outcome invalide', 400);
  const remiseRaw = Number(body.remise_montant);
  const remise = Number.isFinite(remiseRaw) && remiseRaw >= 0 && remiseRaw < 1_000_000 ? remiseRaw : null;

  let verdict: string | null = null;
  try {
    const ci = typeof analysis.conclusion_ia === 'string'
      ? JSON.parse(analysis.conclusion_ia)
      : analysis.conclusion_ia;
    verdict = ci?.verdict_decisionnel ?? null;
  } catch { /* snapshot optionnel */ }

  const { error } = await supabase.from('analysis_outcomes').upsert({
    analysis_id: params.id!,
    user_id: userId,
    outcome,
    ...(remise !== null ? { remise_montant: remise } : {}),
    verdict_decisionnel: verdict,
    source: 'banner',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'analysis_id' });
  if (error) return jsonError(error.message, 500);
  return jsonOk({ ok: true });
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,POST,OPTIONS');
