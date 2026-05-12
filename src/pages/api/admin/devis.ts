export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireAuth } from '@/lib/api/apiHelpers';

export const GET: APIRoute = async ({ request }) => {
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

  // Récupérer les 30 derniers devis (tous utilisateurs, bypass RLS via service_role)
  // V3.4.6 — on lit conclusion_ia.verdict_global comme source unique (cf. CLAUDE.md
  // V3.3.1 règle #1 et #6). Le `score` legacy peut diverger après escalade par
  // la garde de cohérence (ex: hero "+18 600€" + escalade en a_negocier, mais
  // score legacy resté à "VERT" si pas d'anomalie identifiée poste par poste).
  const { data, error } = await supabase
    .from('analyses')
    .select('id, file_name, file_path, created_at, user_id, score, status, conclusion_ia, global_metrics, multiple_quotes')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    return jsonError(error.message, 500);
  }

  // Mapping verdict_global → score affiché en admin (même règle que AnalysisResult.tsx).
  type AdminScore = 'VERT' | 'ORANGE' | 'ROUGE' | null;
  const mapVerdictToScore = (v: unknown): AdminScore => {
    if (typeof v !== 'string') return null;
    switch (v) {
      case 'signer':                 return 'VERT';
      case 'signer_avec_negociation':
      case 'a_negocier':             return 'ORANGE';
      case 'ne_pas_signer':
      case 'refuser':                return 'ROUGE';
      default:                       return null;
    }
  };

  const normalized = (data ?? []).map((row: any) => {
    // 1) Multi-devis : global_metrics.verdict_global est la source canonique.
    //    (cf. AnalysisResult.tsx — branche multi).
    if (row.multiple_quotes === true && row.global_metrics?.verdict_global) {
      const fromGlobal = mapVerdictToScore(row.global_metrics.verdict_global);
      if (fromGlobal) {
        return { ...row, score: fromGlobal };
      }
    }
    // 2) Mono-devis : conclusion_ia.verdict_global (post-escalade garde cohérence).
    const fromConclusion = mapVerdictToScore(row.conclusion_ia?.verdict_global);
    if (fromConclusion) {
      return { ...row, score: fromConclusion };
    }
    // 3) Fallback legacy : si conclusion_ia n'est pas encore généré, on garde
    //    le score colonne (visible "en attente" pour les analyses très anciennes
    //    ou si la conclusion n'a jamais été générée).
    return row;
  });

  // On n'expose pas les blobs JSON volumineux côté client.
  const slimDevis = normalized.map(({ conclusion_ia: _ci, global_metrics: _gm, ...rest }) => rest);

  return jsonOk({ devis: slimDevis });
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
