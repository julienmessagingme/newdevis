export const prerender = false;

import type { APIRoute } from "astro";
import { optionsResponse, jsonOk, jsonError, requireAuth, createServiceClient } from "@/lib/api/apiHelpers";

/**
 * GET /api/admin/reviews
 *
 * Liste les analyses en review_status='pending_review' (Piste C V3.5.16).
 * Utilise la vue admin_pending_reviews créée en Phase 2.1.
 *
 * Réponse :
 *   {
 *     reviews: [{ id, file_name, verdict_global, surcout_max, nb_anomalies, ... }],
 *     count: number
 *   }
 */
export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  // Vérifier que l'appelant est admin
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!roleData) {
    return jsonError("Accès refusé", 403);
  }

  // Lecture depuis la vue admin_pending_reviews (pré-calcule les champs JSON).
  // 2026-08-25 — client service_role : la vue joint auth.users (emails) et
  // n'est plus SELECTable par anon/authenticated (alerte auth_users_exposed
  // du 23/08, migration 20260825100000). Le check admin ci-dessus reste le gate.
  const service = createServiceClient();
  const { data, error } = await service
    .from("admin_pending_reviews")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return jsonError(error.message, 500);
  }

  // 2026-08-27 — avis de l'agent relecteur IA (colonne analyses, absente de la
  // vue) mergé par analysis_id pour affichage dans l'écran de revue.
  if (data && data.length > 0) {
    const ids = data.map((r: Record<string, unknown>) => r.analysis_id ?? r.id).filter(Boolean);
    const { data: opinions } = await service
      .from("analyses")
      .select("id, ai_review_opinion, ai_reviewed_at")
      .in("id", ids as string[]);
    const byId = new Map((opinions ?? []).map((o) => [o.id, o]));
    for (const r of data as Array<Record<string, unknown>>) {
      const o = byId.get((r.analysis_id ?? r.id) as string);
      r.ai_review_opinion = o?.ai_review_opinion ?? null;
      r.ai_reviewed_at = o?.ai_reviewed_at ?? null;
    }
  }

  // Compteur global (pour affichage "12 analyses en attente")
  const { count, error: countError } = await supabase
    .from("analyses")
    .select("id", { count: "exact", head: true })
    .eq("review_status", "pending_review");

  if (countError) {
    return jsonError(countError.message, 500);
  }

  return jsonOk({
    reviews: data ?? [],
    count: count ?? 0,
  });
};

export const OPTIONS: APIRoute = () => optionsResponse("GET,OPTIONS");
