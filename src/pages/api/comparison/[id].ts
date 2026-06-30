export const prerender = false;

import type { APIRoute } from "astro";
import { optionsResponse, jsonOk, jsonError, requireAuth } from "@/lib/api/apiHelpers";

/**
 * GET /api/comparison/[id]    — fetch détail
 * PATCH /api/comparison/[id]  — éditer title
 * DELETE /api/comparison/[id] — supprimer
 */

export const GET: APIRoute = async ({ request, params }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  const id = params.id;
  if (!id) return jsonError("id manquant", 400);

  const { data, error } = await supabase
    .from("comparisons")
    .select("id, title, analysis_ids, verdict, perimeter, status, error_message, created_at, updated_at, user_id")
    .eq("id", id)
    .single();

  if (error || !data) return jsonError("Comparaison introuvable", 404);
  if (data.user_id !== user.id) {
    // Vérif admin
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) return jsonError("Accès refusé", 403);
  }

  return jsonOk(data);
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  const id = params.id;
  if (!id) return jsonError("id manquant", 400);

  let body: any;
  try { body = await request.json(); } catch { return jsonError("JSON invalide", 400); }

  const updatePayload: Record<string, any> = {};
  if (typeof body.title === "string") updatePayload.title = body.title.slice(0, 200);
  if (!Object.keys(updatePayload).length) return jsonError("Aucun champ à modifier", 400);

  const { data, error } = await supabase
    .from("comparisons")
    .update(updatePayload)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, title, updated_at")
    .single();

  if (error || !data) return jsonError(`Update failed: ${error?.message ?? "not found"}`, 404);
  return jsonOk(data);
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  const id = params.id;
  if (!id) return jsonError("id manquant", 400);

  const { error } = await supabase
    .from("comparisons")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return jsonError(`Delete failed: ${error.message}`, 500);
  return jsonOk({ success: true });
};

export const OPTIONS: APIRoute = () => optionsResponse("GET,PATCH,DELETE,OPTIONS");
