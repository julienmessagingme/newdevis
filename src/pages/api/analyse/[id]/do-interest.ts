/**
 * POST /api/analyse/[id]/do-interest — mesure d'intérêt dommages-ouvrage.
 *
 * 2026-08-27 (décision Johan) — test de 3 mois : l'utilisateur clique
 * « oui, je suis intéressé » sous le conseil DO. AUCUN lead n'est transmis à
 * un tiers ; on mesure la demande avant de démarcher un courtier. Idempotent
 * (une ligne par analyse). Auth : propriétaire de l'analyse uniquement.
 */
import type { APIRoute } from 'astro';
import { jsonOk, jsonError, optionsResponse, requireAuth, createServiceClient } from '@/lib/api/apiHelpers';

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;

  const supabase = createServiceClient();
  const { data: analysis } = await supabase
    .from('analyses')
    .select('id, user_id, raw_text')
    .eq('id', params.id!)
    .single();
  if (!analysis || analysis.user_id !== ctx.user.id) return jsonError('Analyse introuvable', 404);

  // Montant HT du chantier — c'est la valeur du lead (prime DO = % des travaux)
  let montantHt: number | null = null;
  try {
    const raw = typeof analysis.raw_text === 'string' ? JSON.parse(analysis.raw_text) : analysis.raw_text;
    const ht = raw?.extracted?.totaux?.ht ?? raw?.extracted_data?.totaux?.ht;
    if (typeof ht === 'number' && ht > 0) montantHt = ht;
  } catch { /* montant optionnel */ }

  const { error } = await supabase.from('do_interest').upsert(
    { analysis_id: params.id!, user_id: ctx.user.id, montant_ht: montantHt },
    { onConflict: 'analysis_id' },
  );
  if (error) return jsonError(error.message, 500);

  console.log(`[do-interest] intérêt enregistré — analyse ${String(params.id).slice(0, 8)} (${montantHt ?? '?'} € HT)`);
  return jsonOk({ ok: true });
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
