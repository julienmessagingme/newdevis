export const prerender = false;

/**
 * POST /api/analyse/[id]/mark-failed
 *
 * Marque une analyse bloquée en "processing" comme "failed".
 * Appelé par le frontend quand isStuck se déclenche (> 3 min sans progression).
 * Protégé : seul le propriétaire de l'analyse peut la marquer comme échouée.
 */

import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";
import { jsonOk, jsonError, optionsResponse } from "@/lib/apiHelpers";

export const POST: APIRoute = async ({ params, request }) => {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "").trim();
  if (!token) return jsonError("Non autorisé", 401);

  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceKey  = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return jsonError("Configuration serveur manquante", 500);

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return jsonError("Non autorisé", 401);

  const analysisId = params.id!;

  // Vérifie que l'analyse appartient à l'utilisateur ET est bien bloquée en processing
  const { data: analysis } = await (supabase as any)
    .from("analyses")
    .select("id, user_id, status, created_at")
    .eq("id", analysisId)
    .single();

  if (!analysis) return jsonError("Analyse introuvable", 404);
  if (analysis.user_id !== user.id) return jsonError("Accès refusé", 403);

  // Seulement si l'analyse est en cours depuis plus de 2 minutes (évite les faux positifs)
  const createdAt = new Date(analysis.created_at).getTime();
  const ageMs = Date.now() - createdAt;
  if (analysis.status !== "processing" && analysis.status !== "pending") {
    return jsonOk({ skipped: true, reason: "already_resolved", status: analysis.status });
  }
  if (ageMs < 2 * 60 * 1000) {
    return jsonOk({ skipped: true, reason: "too_recent" });
  }

  await (supabase as any)
    .from("analyses")
    .update({
      status: "failed",
      error_message: "Délai d'analyse dépassé. Le service d'IA n'a pas répondu à temps. Veuillez réessayer.",
    })
    .eq("id", analysisId);

  return jsonOk({ marked_failed: true });
};

export const OPTIONS: APIRoute = () => optionsResponse("POST,OPTIONS");
