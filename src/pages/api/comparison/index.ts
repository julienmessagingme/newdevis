export const prerender = false;

import type { APIRoute } from "astro";
import { optionsResponse, jsonOk, jsonError, requireAuth } from "@/lib/api/apiHelpers";
import {
  computeComparatorVerdict,
  type AnalysisInput,
} from "@/lib/comparator/verdictEngine";

/**
 * POST /api/comparison
 *
 * Body : { analysis_ids: string[2..4], title?: string }
 *
 * Crée une comparaison, calcule le verdict, persiste. Retourne l'id + verdict.
 *
 * Paywall V1 : 1 comparaison gratuite / mois par user. Au-delà, paywall Pass.
 * (Pour l'instant : on accepte la 1ère et on flagge la suivante — pas de blocage
 * Stripe en V1, juste un flag pour future itération.)
 */
export const POST: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonError("Body JSON invalide", 400);
  }

  const analysisIds = Array.isArray(body.analysis_ids)
    ? body.analysis_ids.filter((s: any) => typeof s === "string")
    : [];
  if (analysisIds.length < 2 || analysisIds.length > 4) {
    return jsonError("analysis_ids doit contenir entre 2 et 4 ids", 400);
  }
  const title = typeof body.title === "string" ? body.title.slice(0, 200) : null;

  // Fetch les N analyses (et vérifier ownership)
  const { data: analyses, error: fetchErr } = await supabase
    .from("analyses")
    .select("id, file_name, conclusion_ia, raw_text, score, user_id, status")
    .in("id", analysisIds);
  if (fetchErr) return jsonError(`Erreur fetch analyses: ${fetchErr.message}`, 500);
  if (!analyses || analyses.length !== analysisIds.length) {
    return jsonError("Une ou plusieurs analyses introuvables", 404);
  }
  for (const a of analyses) {
    if (a.user_id !== user.id) return jsonError("Accès refusé sur une analyse", 403);
    if (a.status !== "completed") return jsonError(`Analyse ${a.id.slice(0, 8)} non finalisée`, 400);
  }

  // Safe parse
  const safeParse = (s: unknown): any => {
    if (!s || typeof s !== "string") return s;
    try { return JSON.parse(s); } catch { return null; }
  };

  const inputs: AnalysisInput[] = analyses.map((a) => ({
    id: a.id,
    file_name: a.file_name,
    conclusion_ia: safeParse(a.conclusion_ia),
    raw_text: safeParse(a.raw_text),
    score_data: safeParse(a.score),
  }));

  // Calcul verdict
  let verdict;
  try {
    verdict = computeComparatorVerdict(inputs);
  } catch (e) {
    return jsonError(
      `Erreur calcul verdict : ${e instanceof Error ? e.message : String(e)}`,
      500,
    );
  }

  const status =
    verdict.status === "rejected_perimeter" ? "rejected_perimeter" : "ready";
  const errorMessage = verdict.status === "rejected_perimeter" ? verdict.rejection_reason ?? null : null;

  // INSERT comparison
  const { data: created, error: insertErr } = await supabase
    .from("comparisons")
    .insert({
      user_id: user.id,
      title:
        title ??
        `Comparaison ${analysisIds.length} devis · ${new Date().toLocaleDateString("fr-FR")}`,
      analysis_ids: analysisIds,
      verdict: verdict.status === "ready" ? verdict : null,
      perimeter: verdict.perimeter,
      status,
      error_message: errorMessage,
    })
    .select("id, created_at")
    .single();

  if (insertErr) {
    return jsonError(`Insert comparison failed: ${insertErr.message}`, 500);
  }

  return jsonOk({
    success: true,
    id: created.id,
    created_at: created.created_at,
    status,
    verdict: verdict.status === "ready" ? verdict : null,
    error_message: errorMessage,
  });
};

/**
 * GET /api/comparison — liste des comparaisons de l'utilisateur
 */
export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  const { data, error } = await supabase
    .from("comparisons")
    .select("id, title, analysis_ids, status, error_message, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return jsonError(`Fetch failed: ${error.message}`, 500);
  return jsonOk({ comparisons: data ?? [] });
};

export const OPTIONS: APIRoute = () => optionsResponse("GET,POST,OPTIONS");
