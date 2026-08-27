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
  const { data, error } = await createServiceClient()
    .from("admin_pending_reviews")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return jsonError(error.message, 500);
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
