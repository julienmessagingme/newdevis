export const prerender = false;

import type { APIRoute } from "astro";
import { optionsResponse, jsonOk, jsonError, requireAuth } from "@/lib/api/apiHelpers";

const ENGINE_VERSION_FALLBACK = "1.0.0-refonte";

/**
 * POST /api/admin/reviews/[id]/decide
 *
 * Action de l'expert sur une analyse en pending_review.
 *
 * Body :
 *   {
 *     action: "validated" | "corrected" | "rejected",
 *     // Si action='corrected', les champs corrigés (sinon ignorés) :
 *     corrected_verdict_global?: "dans_la_norme" | "eleve_justifie" | "a_negocier" | "a_risque",
 *     corrected_verdict_decisionnel?: "signer" | "signer_avec_negociation" | "ne_pas_signer",
 *     corrected_surcout_min?: number,
 *     corrected_surcout_max?: number,
 *     corrected_anomalies?: any[],
 *     expert_notes?: string
 *   }
 *
 * Effets :
 *   1. UPDATE analyses SET review_status = 'validated' | 'corrected' | 'auto_approved' (si rejected),
 *      review_notes, reviewed_at, reviewed_by
 *   2. INSERT analysis_corrections avec snapshot du conclusion_ia original
 *   3. Si action='corrected', mise à jour de conclusion_ia avec les valeurs expertisées
 *      (verdict, surcout, anomalies) pour que le user voie le verdict corrigé.
 *
 * NB : pas de modification serveur du verdict_decisionnel automatique — c'est l'expert qui décide.
 */
export const POST: APIRoute = async ({ request, params }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  const id = params.id;
  if (!id) return jsonError("ID manquant", 400);

  // Vérifier admin
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleData) return jsonError("Accès refusé", 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonError("Body JSON invalide", 400);
  }

  const action = body.action;
  if (!["validated", "corrected", "rejected"].includes(action)) {
    return jsonError("action invalide (validated | corrected | rejected)", 400);
  }

  // Fetch l'analyse actuelle (snapshot)
  const { data: analysis, error: fetchErr } = await supabase
    .from("analyses")
    .select("id, conclusion_ia, review_status, file_name, user_id")
    .eq("id", id)
    .single();
  if (fetchErr || !analysis) return jsonError("Analyse introuvable", 404);

  if (analysis.review_status !== "pending_review") {
    return jsonError(
      `Cette analyse n'est pas en attente (status=${analysis.review_status})`,
      409,
    );
  }

  // Parse conclusion actuelle
  let conclusionOriginal: any = null;
  try {
    conclusionOriginal =
      typeof analysis.conclusion_ia === "string" ? JSON.parse(analysis.conclusion_ia) : null;
  } catch {
    conclusionOriginal = null;
  }
  if (!conclusionOriginal) {
    return jsonError("conclusion_ia illisible pour cette analyse", 500);
  }

  const engineVersion =
    typeof conclusionOriginal.engine_version === "string"
      ? conclusionOriginal.engine_version
      : ENGINE_VERSION_FALLBACK;

  // Détermine le nouveau review_status
  const newReviewStatus =
    action === "rejected" ? "auto_approved" : action; // rejected = remet en auto, faux positif

  // Si correction, on construit la nouvelle conclusion (override des champs)
  let conclusionToPersist: any = conclusionOriginal;
  let correctedVerdictGlobal: string | null = null;
  let correctedVerdictDecisionnel: string | null = null;
  let correctedSurcoutMin: number | null = null;
  let correctedSurcoutMax: number | null = null;
  let correctedAnomalies: any[] | null = null;

  if (action === "corrected") {
    correctedVerdictGlobal =
      typeof body.corrected_verdict_global === "string" ? body.corrected_verdict_global : null;
    correctedVerdictDecisionnel =
      typeof body.corrected_verdict_decisionnel === "string"
        ? body.corrected_verdict_decisionnel
        : null;
    correctedSurcoutMin =
      typeof body.corrected_surcout_min === "number" ? body.corrected_surcout_min : null;
    correctedSurcoutMax =
      typeof body.corrected_surcout_max === "number" ? body.corrected_surcout_max : null;
    correctedAnomalies = Array.isArray(body.corrected_anomalies) ? body.corrected_anomalies : null;

    // Construit la conclusion corrigée à persister dans analyses.conclusion_ia
    conclusionToPersist = { ...conclusionOriginal };
    if (correctedVerdictGlobal) conclusionToPersist.verdict_global = correctedVerdictGlobal;
    if (correctedVerdictDecisionnel)
      conclusionToPersist.verdict_decisionnel = correctedVerdictDecisionnel;
    if (correctedSurcoutMin !== null || correctedSurcoutMax !== null) {
      conclusionToPersist.surcout_global = {
        min: correctedSurcoutMin ?? conclusionOriginal.surcout_global?.min ?? 0,
        max: correctedSurcoutMax ?? conclusionOriginal.surcout_global?.max ?? 0,
      };
    }
    if (correctedAnomalies) {
      conclusionToPersist.anomalies = correctedAnomalies;
      conclusionToPersist.has_anomalies = correctedAnomalies.length > 0;
    }
    // Marque la conclusion comme expert-reviewed
    conclusionToPersist.expert_reviewed = true;
    conclusionToPersist.expert_reviewed_at = new Date().toISOString();
  }

  const expertNotes = typeof body.expert_notes === "string" ? body.expert_notes : null;

  // INSERT analysis_corrections (audit trail)
  const reviewTriggers = Array.isArray(body.review_triggers) ? body.review_triggers : [];

  const { error: insertErr } = await supabase.from("analysis_corrections").insert({
    analysis_id: id,
    reviewed_by_user_id: user.id,
    reviewed_by_email: user.email ?? "(inconnu)",
    action,
    corrected_verdict_global: correctedVerdictGlobal,
    corrected_verdict_decisionnel: correctedVerdictDecisionnel,
    corrected_surcout_min: correctedSurcoutMin,
    corrected_surcout_max: correctedSurcoutMax,
    corrected_anomalies: correctedAnomalies,
    original_conclusion: conclusionOriginal,
    review_triggers: reviewTriggers,
    expert_notes: expertNotes,
    engine_version: engineVersion,
  });

  if (insertErr) {
    return jsonError(`Insert correction failed: ${insertErr.message}`, 500);
  }

  // UPDATE analyses
  const updatePayload: any = {
    review_status: newReviewStatus,
    review_notes: expertNotes,
    reviewed_at: new Date().toISOString(),
    reviewed_by: user.id,
  };
  if (action === "corrected") {
    updatePayload.conclusion_ia = JSON.stringify(conclusionToPersist);
  }

  const { error: updateErr } = await supabase
    .from("analyses")
    .update(updatePayload)
    .eq("id", id);

  if (updateErr) {
    return jsonError(`Update analysis failed: ${updateErr.message}`, 500);
  }

  return jsonOk({
    success: true,
    action,
    review_status: newReviewStatus,
  });
};

export const OPTIONS: APIRoute = () => optionsResponse("POST,OPTIONS");
