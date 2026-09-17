export const prerender = false;

import type { APIRoute } from "astro";
import { optionsResponse, jsonOk, jsonError, requireAuth, createServiceClient } from "@/lib/api/apiHelpers";

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
      "id, file_name, file_path, status, created_at, user_id, conclusion_ia, raw_text, review_status, review_notes, reviewed_at, reviewed_by, ai_review_opinion, ai_reviewed_at",
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

    // 2026-09-15 — l'arbitre du rapprochement. Contrairement aux autres
    // déclencheurs, celui-ci n'est PAS deviné rétroactivement : il est écrit
    // dans la conclusion au moment de l'analyse, donc c'est le vrai motif.
    const arb = (conclusion as Record<string, unknown>).arbitrage_rapprochement as
      { conteste?: unknown[]; ecart_conteste?: number } | undefined;
    if (Array.isArray(arb?.conteste) && arb.conteste.length > 0) {
      // ⚠️ Même libellé que `detectReviewTriggers` (montant compris) : deux
      // formulations pour le même déclencheur finiraient par diverger, et
      // l'expert ne saurait plus si l'écran lui dit la même chose que le moteur.
      review_triggers.push(
        `arbitre_conteste=${arb.conteste.length} référence(s) · ${Math.round(Number(arb.ecart_conteste ?? 0))} €`,
      );
    }
  }

  // Fetch corrections antérieures (s'il y en a — utile si on re-revoit après update IA)
  const { data: corrections } = await supabase
    .from("analysis_corrections")
    .select("id, action, reviewed_at, reviewed_by_email, expert_notes")
    .eq("analysis_id", id)
    .order("reviewed_at", { ascending: false });

  // 🔴 2026-09-17 — LE JOURNAL DES NOTIFICATIONS (demande Johan : « ferme
  // l'angle mort des mails de revue »). La raison d'un échec ne vivait que dans
  // le bandeau affiché au moment du clic ; dix minutes plus tard, « est-ce que
  // le mail est parti ? » n'avait plus de réponse.
  // ⚠️ Lecture via `service` : la table porte des adresses e-mail et n'est
  // ouverte qu'à `service_role` (même régime que la vue de la file).
  const { data: notifications } = await createServiceClient()
    .from("review_notification_log")
    .select("action, envoye, raison, to_email, created_at")
    .eq("analysis_id", id)
    .order("created_at", { ascending: false });

  return jsonOk({
    analysis,
    conclusion,
    raw,
    review_triggers,
    previous_corrections: corrections ?? [],
    // 2026-09-17 — « est-ce que le mail est parti ? » doit avoir une réponse
    // APRÈS le clic, pas seulement pendant. Journal écrit par le helper d'envoi.
    notifications: notifications ?? [],
  });
};

export const OPTIONS: APIRoute = () => optionsResponse("GET,OPTIONS");
