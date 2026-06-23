export const prerender = false;

import type { APIRoute } from "astro";
import { optionsResponse, jsonOk, jsonError, requireAuth } from "@/lib/api/apiHelpers";

/**
 * GET /api/admin/reviews/[id]
 *
 * Détail complet d'une analyse pour la revue : conclusion_ia parsée + raw_text
 * parsé (pour accéder à n8n_price_data, extracted, etc.) + métadonnées.
 *
 * Réponse :
 *   {
 *     analysis: { id, file_name, status, created_at, user_id, review_status, ... },
 *     conclusion: ConclusionData parsé,
 *     raw: { extracted, n8n_price_data, ... },
 *     review_triggers: string[] (raisons Piste C — devinées rétroactivement)
 *   }
 */
export const GET: APIRoute = async ({ request, params }) => {
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

  // Fetch analyse complète
  const { data: analysis, error } = await supabase
    .from("analyses")
    .select(
      "id, file_name, file_path, status, created_at, user_id, conclusion_ia, raw_text, review_status, review_notes, reviewed_at, reviewed_by",
    )
    .eq("id", id)
    .single();

  if (error || !analysis) {
    return jsonError("Analyse introuvable", 404);
  }

  // Safe parse JSON
  const safeParse = (s: unknown): any => {
    if (!s || typeof s !== "string") return null;
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  const conclusion = safeParse(analysis.conclusion_ia);
  const raw = safeParse(analysis.raw_text);

  // Devine les triggers Piste C qui ont flagged cette analyse
  const review_triggers: string[] = [];
  if (conclusion) {
    const verdictG = conclusion.verdict_global;
    if (verdictG === "a_risque" || verdictG === "refuser") {
      review_triggers.push(`verdict=${verdictG}`);
    }
    const surcoutMax = conclusion.surcout_global?.max ?? 0;
    if (surcoutMax > 2000) {
      review_triggers.push(`surcout_max=${Math.round(surcoutMax)}€`);
    }
    const nbAnomalies = Array.isArray(conclusion.anomalies) ? conclusion.anomalies.length : 0;
    if (nbAnomalies >= 2) {
      review_triggers.push(`anomalies=${nbAnomalies}`);
    }
    if (conclusion.is_foreign_quote) review_triggers.push("bypass=foreign");
    if (conclusion.is_incomplete_quote) review_triggers.push("bypass=incomplete");
    if (conclusion.hors_scope) review_triggers.push("bypass=hors_scope");
    if (conclusion.estimation_courtier) review_triggers.push("bypass=courtier");

    // Ratio aberrant (Phase 0.1)
    if (Array.isArray(raw?.n8n_price_data)) {
      let worstRatio = 0;
      let worstLabel = "";
      for (const g of raw.n8n_price_data) {
        if (!g || typeof g !== "object") continue;
        const group = g as any;
        const devisTotal = typeof group.devis_total_ht === "number" ? group.devis_total_ht : 0;
        if (devisTotal <= 0) continue;
        const prices = Array.isArray(group.prices) ? group.prices : [];
        const qty = typeof group.main_quantity === "number" && group.main_quantity > 0 ? group.main_quantity : 1;
        let theoMax = 0;
        for (const p of prices) {
          theoMax += (typeof p.price_max_unit_ht === "number" ? p.price_max_unit_ht : 0) * qty;
          theoMax += typeof p.fixed_max_ht === "number" ? p.fixed_max_ht : 0;
        }
        if (theoMax <= 0) continue;
        const ratio = devisTotal / theoMax;
        if (ratio > worstRatio) {
          worstRatio = ratio;
          worstLabel = String(group.job_type_label ?? group.job_type ?? "?");
        }
      }
      if (worstRatio > 5) {
        review_triggers.push(`ratio_aberrant=${worstRatio.toFixed(1)}× ("${worstLabel}")`);
      }
    }
  }

  // Fetch corrections antérieures (s'il y en a — utile si on re-revoit après update IA)
  const { data: corrections } = await supabase
    .from("analysis_corrections")
    .select("id, action, reviewed_at, reviewed_by_email, expert_notes")
    .eq("analysis_id", id)
    .order("reviewed_at", { ascending: false });

  return jsonOk({
    analysis,
    conclusion,
    raw,
    review_triggers,
    previous_corrections: corrections ?? [],
  });
};

export const OPTIONS: APIRoute = () => optionsResponse("GET,OPTIONS");
