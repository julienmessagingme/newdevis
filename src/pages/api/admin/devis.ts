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
  //
  // ATTENTION schéma :
  //  - `conclusion_ia` est une colonne TEXT (JSON sérialisé) — JSON.parse requis.
  //  - `multiple_quotes` + `global_metrics` ne sont PAS des colonnes — ils vivent
  //    dans `raw_text` (TEXT, JSON sérialisé aussi). Cf. analyze-quote/index.ts:
  //    le rawDataForDebug contient { multiple_quotes, global_metrics, ... }.
  const { data, error } = await supabase
    .from('analyses')
    .select('id, file_name, file_path, created_at, user_id, score, status, conclusion_ia, raw_text')
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

  // Parser TEXT → object de façon sûre (les anciennes analyses peuvent avoir
  // un raw_text non-JSON ou un conclusion_ia mal formé).
  const safeParse = (s: unknown): any => {
    if (!s || typeof s !== 'string') return null;
    try { return JSON.parse(s); } catch { return null; }
  };

  const normalized = (data ?? []).map((row: any) => {
    const rawObj        = safeParse(row.raw_text);
    const conclusionObj = safeParse(row.conclusion_ia);
    const multi         = rawObj?.document_detection?.multiple_quotes === true
                          || rawObj?.multiple_quotes === true;
    const globalMetrics = rawObj?.global_metrics ?? null;

    // 1) Multi-devis : global_metrics.verdict_global est la source canonique.
    if (multi && globalMetrics?.verdict_global) {
      const fromGlobal = mapVerdictToScore(globalMetrics.verdict_global);
      if (fromGlobal) {
        return {
          id: row.id, file_name: row.file_name, file_path: row.file_path,
          created_at: row.created_at, user_id: row.user_id, status: row.status,
          score: fromGlobal,
        };
      }
    }
    // 2) Mono-devis : conclusion_ia.verdict_global (post-escalade garde cohérence).
    const fromConclusion = mapVerdictToScore(conclusionObj?.verdict_global);
    if (fromConclusion) {
      return {
        id: row.id, file_name: row.file_name, file_path: row.file_path,
        created_at: row.created_at, user_id: row.user_id, status: row.status,
        score: fromConclusion,
      };
    }
    // 3) Fallback legacy.
    return {
      id: row.id, file_name: row.file_name, file_path: row.file_path,
      created_at: row.created_at, user_id: row.user_id, status: row.status,
      score: row.score,
    };
  });

  return jsonOk({ devis: normalized });
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
