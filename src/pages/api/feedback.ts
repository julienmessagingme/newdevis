export const prerender = false;

/**
 * POST /api/feedback
 *
 * Persiste un feedback utilisateur sur une analyse (table `analysis_feedback`).
 * Idempotent par (user_id, analysis_id) : 2e soumission = UPDATE via ON CONFLICT.
 *
 * Body : { analysis_id: string,
 *          choice: "positive" | "neutral" | "negative",
 *          text?: string,
 *          verdict_at_submission?: "VERT" | "ORANGE" | "ROUGE" | null,
 *          tags?: string[]  // V3.4.20+ — chips causes du feedback négatif
 *        }
 *
 * Auth : Bearer JWT obligatoire — on persiste sous user_id du token, jamais du body
 * (sinon n'importe qui pourrait submit un feedback au nom d'un autre).
 */

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireAuth } from '@/lib/api/apiHelpers';

const CHOICES = new Set(['positive', 'neutral', 'negative']);
const VERDICTS = new Set(['VERT', 'ORANGE', 'ROUGE']);
const TEXT_MAX = 500;

// V3.4.20+ — Causes possibles d'un feedback négatif. Whitelist enforced côté API
// pour éviter qu'on accumule des tags arbitraires en base. Toute autre cause
// doit être décrite via le champ `text` libre.
const ALLOWED_TAGS = new Set([
  'mauvaise_entreprise',    // entreprise affichée ≠ celle du devis (cas Renovation Man)
  'faux_radiee',            // entreprise dite radiée alors qu'elle est active (cas homonyme V3.4.19)
  'siret_non_extrait',      // SIRET du PDF pas capté par l'extraction
  'prix_marche_incorrect',  // fourchette marché pas pertinente
  'verdict_incoherent',     // le verdict ne reflète pas la situation réelle
  'mauvais_type_doc',       // estimation/MOE/diagnostic traité comme devis (cas courtier V3.4.20)
  'autre',                  // free text obligatoire dans ce cas
]);

export const POST: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError('Body JSON invalide', 400);
  }

  const analysisId = typeof body.analysis_id === 'string' ? body.analysis_id : null;
  const choice = typeof body.choice === 'string' ? body.choice : null;
  const textRaw = typeof body.text === 'string' ? body.text.trim() : '';
  const verdict = typeof body.verdict_at_submission === 'string' ? body.verdict_at_submission : null;
  const tagsRaw = Array.isArray(body.tags) ? body.tags : [];

  if (!analysisId || !/^[0-9a-f-]{36}$/i.test(analysisId)) {
    return jsonError('analysis_id manquant ou invalide', 400);
  }
  if (!choice || !CHOICES.has(choice)) {
    return jsonError('choice doit valoir "positive", "neutral" ou "negative"', 400);
  }
  const text = textRaw.slice(0, TEXT_MAX) || null;
  const verdictAtSubmission = verdict && VERDICTS.has(verdict) ? verdict : null;

  // V3.4.20+ — Filtrage whitelist des tags + dédoublonnage. Les tags ne sont
  // acceptés que sur les feedbacks négatifs ; sur positive/neutral on les
  // ignore silencieusement (UI ne devrait pas les envoyer mais sécurité défense
  // en profondeur).
  const tags: string[] = choice === 'negative'
    ? Array.from(new Set(tagsRaw.filter(t => typeof t === 'string' && ALLOWED_TAGS.has(t)) as string[])).slice(0, 7)
    : [];

  // Vérifie que l'analyse existe (le user_id de l'analyse est validé via RLS
  // sur INSERT — un user ne peut soumettre que pour ses propres analyses).
  // En revanche on accepte qu'un admin commente n'importe quelle analyse via la
  // policy "user_id = auth.uid()" : il commentera "ses propres" analyses.
  const { error: insertError } = await (supabase as any)
    .from('analysis_feedback')
    .upsert(
      {
        analysis_id: analysisId,
        user_id: user.id,
        choice,
        text,
        verdict_at_submission: verdictAtSubmission,
        tags,
      },
      { onConflict: 'user_id,analysis_id' },
    );

  if (insertError) {
    console.error('[api/feedback] insert error:', insertError.message);
    // 23503 = foreign key violation (analysis_id n'existe pas ou pas le bon user)
    if (insertError.code === '23503') {
      return jsonError('Analyse introuvable', 404);
    }
    return jsonError('Erreur lors de la sauvegarde', 500);
  }

  return jsonOk({ ok: true });
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
