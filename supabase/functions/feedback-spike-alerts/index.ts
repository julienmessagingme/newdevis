// ============================================================================
// feedback-spike-alerts — cron d'alerte pic de feedbacks négatifs
// ============================================================================
// Angle mort du monitoring existant (system-alerts, analysis-maintenance) :
// un MAUVAIS VERDICT (ex: entreprise "radiée" à tort, verdict incohérent avec
// la réalité) n'est PAS une erreur technique. Statut de l'analyse = 'completed',
// pas d'exception, pas de retry — aucun cron actuel ne le détecte.
//
// Ce cron scanne les feedbacks négatifs récents (`analysis_feedback` avec
// choice='negative') et déclenche une alerte email si :
//   - ≥3 feedbacks négatifs de MÊME tag sur 1 heure -> pic structurel
//     (ex: 3× 'faux_radiee' = bug détection status entreprise)
//   - OU ≥5 feedbacks négatifs total sur 1 heure -> pic global
//     (indépendamment du tag, quelque chose ne va pas dans le pipeline)
//
// Fréquence exécution : /30 min (schedule dans la migration).
// Dédup : Idempotency-Key basée sur les IDs feedbacks (comme system-alerts).
// Destinataires : julien@messagingme.fr + bridey.johan@gmail.com.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://www.verifiermondevis.fr",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RECIPIENTS = ["julien@messagingme.fr", "bridey.johan@gmail.com"];
const RESEND_API_URL = "https://api.resend.com/emails";
const ADMIN_URL = "https://www.verifiermondevis.fr/admin";

const SPIKE_WINDOW_MINUTES = 60;
const SPIKE_MIN_SAME_TAG   = 3;  // ≥ N feedbacks négatifs du même tag = pic structurel
const SPIKE_MIN_TOTAL      = 5;  // ≥ N feedbacks négatifs tous tags = pic global

// Libellés lisibles des tags (whitelist alignée avec migration 20260520_001)
const TAG_LABELS: Record<string, string> = {
  mauvaise_entreprise:  "Mauvaise entreprise",
  faux_radiee:          "Faux radiée",
  siret_non_extrait:    "SIRET non extrait",
  prix_marche_incorrect:"Prix marché incorrect",
  verdict_incoherent:   "Verdict incohérent",
  mauvais_type_doc:     "Mauvais type de doc",
  autre:                "Autre",
};

interface Feedback {
  id: string;
  analysis_id: string;
  tags: string[];
  text: string | null;
  verdict_at_submission: string | null;
  created_at: string;
}

interface Alert {
  category: string;
  severity: "CRITIQUE" | "ERREUR" | "WARNING";
  title: string;
  message: string;
  tagLabel: string | null;
  feedbacks: Feedback[];
}

// ============ CHECK ============

async function checkFeedbackSpike(supabase: any): Promise<Alert[]> {
  const sinceIso = new Date(Date.now() - SPIKE_WINDOW_MINUTES * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("analysis_feedback")
    .select("id, analysis_id, tags, text, verdict_at_submission, created_at")
    .eq("choice", "negative")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("checkFeedbackSpike error:", error.message);
    return [];
  }
  const negatives = (data ?? []) as Feedback[];
  if (negatives.length === 0) return [];

  const alerts: Alert[] = [];

  // 1) Pics par tag (chaque tag qui atteint le seuil déclenche une alerte dédiée)
  const byTag = new Map<string, Feedback[]>();
  for (const f of negatives) {
    for (const t of f.tags ?? []) {
      if (!byTag.has(t)) byTag.set(t, []);
      byTag.get(t)!.push(f);
    }
  }
  for (const [tag, feedbacks] of byTag.entries()) {
    if (feedbacks.length >= SPIKE_MIN_SAME_TAG) {
      const label = TAG_LABELS[tag] ?? tag;
      alerts.push({
        category: `feedback_spike_tag_${tag}`,
        severity: "ERREUR",
        title: `${feedbacks.length} feedback(s) négatifs "${label}" en ${SPIKE_WINDOW_MINUTES} min`,
        message: `Pic structurel détecté : ${feedbacks.length} utilisateurs ont signalé "${label}" sur leur analyse depuis moins d'${SPIKE_WINDOW_MINUTES} minutes. Suggère un bug ciblé sur ce type de vérification à investiguer d'urgence.`,
        tagLabel: label,
        feedbacks: feedbacks.slice(0, 20),
      });
    }
  }

  // 2) Pic global (indépendamment des tags) — seulement s'il n'y a pas déjà eu
  //    d'alerte tag-spécifique (sinon on double-notifie sur la même situation).
  if (alerts.length === 0 && negatives.length >= SPIKE_MIN_TOTAL) {
    alerts.push({
      category: "feedback_spike_global",
      severity: "WARNING",
      title: `Pic feedback négatifs : ${negatives.length} en ${SPIKE_WINDOW_MINUTES} min`,
      message: `${negatives.length} feedbacks négatifs enregistrés sur la dernière heure (aucun tag ne domine). Peut indiquer un problème global de pipeline ou de wording verdict à investiguer.`,
      tagLabel: null,
      feedbacks: negatives.slice(0, 20),
    });
  }

  return alerts;
}

// ============ EMAIL ============

function buildEmailHtml(alert: Alert): string {
  const colors = {
    CRITIQUE: { bg: "#dc2626", light: "#fef2f2", border: "#fca5a5" },
    ERREUR:   { bg: "#ea580c", light: "#fff7ed", border: "#fdba74" },
    WARNING:  { bg: "#ca8a04", light: "#fefce8", border: "#fde047" },
  };
  const c = colors[alert.severity];

  const rows = alert.feedbacks
    .map((f) => {
      const date = new Date(f.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
      const tags = (f.tags ?? []).map((t) => TAG_LABELS[t] ?? t).join(", ") || "-";
      const verdict = f.verdict_at_submission ?? "-";
      const text = f.text ? f.text.substring(0, 100).replace(/[<>]/g, "") : "-";
      const analyseId = f.analysis_id.substring(0, 8);
      const link = `${ADMIN_URL}?analyse=${f.analysis_id}`;
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:13px">
          <a href="${link}" style="color:${c.bg};text-decoration:none">${analyseId}</a>
        </td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:13px">${verdict}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:13px">${tags}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:13px">${date}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:13px;font-style:italic">${text}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    <div style="background:${c.bg};padding:20px;color:#fff">
      <h1 style="margin:0;font-size:18px">[${alert.severity}] ${alert.title}</h1>
      <p style="margin:8px 0 0;opacity:0.9;font-size:14px">VerifierMonDevis — Feedback utilisateur</p>
    </div>
    <div style="padding:20px">
      <div style="background:${c.light};border:1px solid ${c.border};border-radius:6px;padding:12px;margin-bottom:16px">
        <p style="margin:0;font-size:14px">${alert.message}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:8px;text-align:left">Analyse</th>
            <th style="padding:8px;text-align:left">Verdict</th>
            <th style="padding:8px;text-align:left">Tags</th>
            <th style="padding:8px;text-align:left">Date</th>
            <th style="padding:8px;text-align:left">Commentaire</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:20px;text-align:center">
        <a href="${ADMIN_URL}" style="display:inline-block;background:${c.bg};color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">
          Voir les feedbacks dans l'admin
        </a>
      </div>
    </div>
    <div style="padding:12px 20px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:center">
      Alerte pic feedback — dédup par IDs (mêmes feedbacks = pas de renvoi)
    </div>
  </div>
</body>
</html>`;
}

async function sendAlert(alert: Alert, resendApiKey: string): Promise<{ ok: boolean; error?: string }> {
  // Idempotency key basée sur les IDs des feedbacks — mêmes signalements = même clé =
  // pas de renvoi. Nouveau feedback = IDs changent = email envoyé.
  const idsFingerprint = alert.feedbacks.map((f) => f.id.slice(0, 8)).sort().join("-");
  const idempotencyKey = `${alert.category}_${idsFingerprint}`;

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: "VerifierMonDevis <onboarding@resend.dev>",
        to: RECIPIENTS,
        subject: `[${alert.severity}] ${alert.title}`,
        html: buildEmailHtml(alert),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Resend error (${res.status}):`, body);
      return { ok: false, error: `${res.status}: ${body}` };
    }

    console.log(`Feedback spike alert sent: ${alert.category} (idempotency: ${idempotencyKey})`);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("sendAlert error:", msg);
    return { ok: false, error: msg };
  }
}

// ============ HANDLER ============

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const alerts = await checkFeedbackSpike(supabase);
    const sent: string[] = [];
    const errors: { category: string; error: string }[] = [];

    for (const alert of alerts) {
      const result = await sendAlert(alert, resendApiKey);
      if (result.ok) sent.push(alert.category);
      else if (result.error) errors.push({ category: alert.category, error: result.error });
    }

    const result = {
      checked_at: new Date().toISOString(),
      alerts_triggered: alerts.map((a) => a.category),
      alerts_sent: sent,
      send_errors: errors.length > 0 ? errors : undefined,
    };
    console.log("Feedback spike alerts check:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Unexpected error:", error instanceof Error ? error.message : error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
