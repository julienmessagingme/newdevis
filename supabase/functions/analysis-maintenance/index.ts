/**
 * analysis-maintenance — cron toutes les 15 min
 *
 * 1. Détecte les analyses en erreur/failed récentes (< 2h) non encore retentées
 * 2. Retente automatiquement jusqu'à MAX_RETRIES fois (marqué dans error_message)
 * 3. Envoie un email admin :
 *    - Analyses retentées automatiquement
 *    - Analyses en échec persistant (déjà retentées, besoin d'intervention)
 *
 * Auth : X-Cron-Secret (même pattern que agent-scheduled-tick)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET       = Deno.env.get("AGENT_CRON_SECRET") ?? "";
const RESEND_API_KEY    = Deno.env.get("RESEND_API_KEY") ?? "";

const RECIPIENTS  = ["julien@messagingme.fr"];
const ADMIN_URL   = "https://www.verifiermondevis.fr/admin";
const MAX_RETRIES = 2;               // max tentatives auto avant escalade admin
const RETRY_TAG   = "[auto-retry-"; // marqueur dans error_message pour suivre les tentatives
const MAX_BATCH   = 10;             // max analyses retentées par run (évite surcharge)
const WINDOW_H    = 4;              // fenêtre de recherche en heures

// ── Helpers ──────────────────────────────────────────────────────────────────

function getRetryCount(errorMessage: string | null): number {
  if (!errorMessage) return 0;
  const match = errorMessage.match(/\[auto-retry-(\d+)\]/);
  return match ? parseInt(match[1], 10) : 0;
}

function tagRetry(errorMessage: string | null, attempt: number): string {
  const base = (errorMessage ?? "")
    .replace(/\s*\[auto-retry-\d+\]/g, "")
    .trim();
  return `${base} [auto-retry-${attempt}]`.trim();
}

// ── Email ─────────────────────────────────────────────────────────────────────

interface AnalysisRow {
  id: string;
  status: string;
  error_message: string | null;
  created_at: string;
  file_name?: string | null;
  user_id?: string | null;
}

function buildMaintenanceEmail(
  retried: AnalysisRow[],
  persistent: AnalysisRow[],
): string {
  const now = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" });

  const retriedRows = retried.map((a) => {
    const date = new Date(a.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
    const attempt = getRetryCount(a.error_message) + 1;
    return `<tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:12px">${a.id.slice(0, 8)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${a.file_name ?? "—"}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${date}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:12px">${(a.error_message ?? "—").slice(0, 60)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center">Tentative ${attempt}/${MAX_RETRIES}</td>
    </tr>`;
  }).join("");

  const persistentRows = persistent.map((a) => {
    const date = new Date(a.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
    return `<tr style="background:#fef2f2">
      <td style="padding:8px;border-bottom:1px solid #fca5a5;font-family:monospace;font-size:12px">${a.id.slice(0, 8)}</td>
      <td style="padding:8px;border-bottom:1px solid #fca5a5">${a.file_name ?? "—"}</td>
      <td style="padding:8px;border-bottom:1px solid #fca5a5">${date}</td>
      <td style="padding:8px;border-bottom:1px solid #fca5a5;font-size:12px;color:#dc2626">${(a.error_message ?? "—").slice(0, 80)}</td>
      <td style="padding:8px;border-bottom:1px solid #fca5a5;color:#dc2626;font-weight:600">⛔ Intervention requise</td>
    </tr>`;
  }).join("");

  const hasPersistent = persistent.length > 0;
  const headerBg = hasPersistent ? "#dc2626" : "#2563eb";
  const headerTitle = hasPersistent
    ? `⛔ ${persistent.length} analyse(s) en échec persistant — intervention requise`
    : `🔄 Maintenance automatique — ${retried.length} analyse(s) relancée(s)`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:700px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <div style="background:${headerBg};padding:20px;color:#fff">
    <h1 style="margin:0;font-size:18px">${headerTitle}</h1>
    <p style="margin:8px 0 0;opacity:.85;font-size:13px">VerifierMonDevis — Maintenance automatique · ${now}</p>
  </div>
  <div style="padding:20px">

    ${retried.length > 0 ? `
    <h2 style="font-size:15px;margin:0 0 12px;color:#1d4ed8">🔄 Analyses relancées automatiquement (${retried.length})</h2>
    <p style="font-size:13px;color:#6b7280;margin-bottom:12px">Ces analyses ont été re-soumises automatiquement. Si elles échouent à nouveau, une alerte sera envoyée.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:#eff6ff">
          <th style="padding:8px;text-align:left">ID</th>
          <th style="padding:8px;text-align:left">Fichier</th>
          <th style="padding:8px;text-align:left">Date originale</th>
          <th style="padding:8px;text-align:left">Erreur</th>
          <th style="padding:8px;text-align:left">Tentative</th>
        </tr>
      </thead>
      <tbody>${retriedRows}</tbody>
    </table>` : ""}

    ${persistent.length > 0 ? `
    <h2 style="font-size:15px;margin:${retried.length > 0 ? "24px" : "0"} 0 12px;color:#dc2626">⛔ Échecs persistants — intervention manuelle requise (${persistent.length})</h2>
    <p style="font-size:13px;color:#6b7280;margin-bottom:12px">Ces analyses ont déjà été retentées ${MAX_RETRIES} fois automatiquement et échouent encore. Inspection manuelle nécessaire.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:#fef2f2">
          <th style="padding:8px;text-align:left">ID</th>
          <th style="padding:8px;text-align:left">Fichier</th>
          <th style="padding:8px;text-align:left">Date</th>
          <th style="padding:8px;text-align:left">Dernière erreur</th>
          <th style="padding:8px;text-align:left">Statut</th>
        </tr>
      </thead>
      <tbody>${persistentRows}</tbody>
    </table>` : ""}

    <div style="margin-top:20px;text-align:center">
      <a href="${ADMIN_URL}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">
        Ouvrir le dashboard admin
      </a>
    </div>
  </div>
  <div style="padding:12px 20px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:center">
    Maintenance automatique VerifierMonDevis — fenêtre ${WINDOW_H}h — max ${MAX_RETRIES} tentatives
  </div>
</div>
</body>
</html>`;
}

async function sendEmail(subject: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn("[maintenance] RESEND_API_KEY manquant — email non envoyé");
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "VerifierMonDevis <onboarding@resend.dev>",
        to: RECIPIENTS,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[maintenance] Resend error ${res.status}: ${body}`);
    } else {
      console.log("[maintenance] Email admin envoyé");
    }
  } catch (err) {
    console.error("[maintenance] sendEmail crash:", err instanceof Error ? err.message : err);
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  // Auth : X-Cron-Secret OU service_role Bearer
  const cronHeader   = req.headers.get("X-Cron-Secret");
  const authHeader   = req.headers.get("Authorization")?.replace("Bearer ", "").trim();
  const isAuthorized = (CRON_SECRET && cronHeader === CRON_SECRET)
                    || (SERVICE_ROLE_KEY && authHeader === SERVICE_ROLE_KEY);

  if (!isAuthorized) {
    console.error("[maintenance] Unauthorized request");
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const windowStart = new Date(Date.now() - WINDOW_H * 60 * 60 * 1000).toISOString();

    // ── 1. Trouver les analyses en erreur dans la fenêtre ──────────────────────
    const { data: failed, error: fetchErr } = await supabase
      .from("analyses")
      .select("id, status, error_message, created_at, file_name, user_id")
      .in("status", ["error", "failed"])
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(50);

    if (fetchErr) {
      console.error("[maintenance] fetch error:", fetchErr.message);
      return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 });
    }

    if (!failed || failed.length === 0) {
      console.log("[maintenance] Aucune analyse en erreur dans la fenêtre — RAS");
      return new Response(JSON.stringify({ ok: true, retried: 0, persistent: 0 }), { status: 200 });
    }

    console.log(`[maintenance] ${failed.length} analyses en erreur trouvées`);

    const toRetry: AnalysisRow[]     = [];
    const persistent: AnalysisRow[]  = [];

    for (const analysis of failed as AnalysisRow[]) {
      const retryCount = getRetryCount(analysis.error_message);
      if (retryCount < MAX_RETRIES) {
        toRetry.push(analysis);
      } else {
        persistent.push(analysis);
      }
    }

    // ── 2. Retenter les analyses éligibles ─────────────────────────────────────
    const actuallyRetried: AnalysisRow[] = [];
    const retryBatch = toRetry.slice(0, MAX_BATCH);

    for (const analysis of retryBatch) {
      const attempt = getRetryCount(analysis.error_message) + 1;
      const newErrorMsg = tagRetry(analysis.error_message, attempt);

      try {
        // Marquer la tentative AVANT d'invoquer (évite double-retry si crash)
        await supabase
          .from("analyses")
          .update({
            status: "pending",
            error_message: newErrorMsg,
          })
          .eq("id", analysis.id);

        // Re-invoquer analyze-quote
        const { error: invokeErr } = await supabase.functions.invoke("analyze-quote", {
          body: { analysisId: analysis.id },
        });

        if (invokeErr) {
          console.error(`[maintenance] invoke failed for ${analysis.id}:`, invokeErr.message);
          // Remettre en error (la tentative sera comptée lors du prochain check)
          await supabase
            .from("analyses")
            .update({ status: "error", error_message: `${newErrorMsg} — invoke failed: ${invokeErr.message}` })
            .eq("id", analysis.id);
        } else {
          console.log(`[maintenance] Retried ${analysis.id} (attempt ${attempt}/${MAX_RETRIES})`);
          actuallyRetried.push({ ...analysis, error_message: newErrorMsg });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[maintenance] crash retrying ${analysis.id}:`, msg);
      }
    }

    // ── 3. Email admin si des actions ont été prises ───────────────────────────
    const needsEmail = actuallyRetried.length > 0 || persistent.length > 0;
    if (needsEmail) {
      const subject = persistent.length > 0
        ? `⛔ [VerifierMonDevis] ${persistent.length} analyse(s) en échec persistant`
        : `🔄 [VerifierMonDevis] ${actuallyRetried.length} analyse(s) relancée(s) automatiquement`;

      const html = buildMaintenanceEmail(actuallyRetried, persistent);
      await sendEmail(subject, html);
    }

    const result = {
      ok: true,
      found: failed.length,
      retried: actuallyRetried.length,
      persistent: persistent.length,
      skipped: toRetry.length - actuallyRetried.length,
    };
    console.log("[maintenance] Done:", result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[maintenance] Unexpected error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});
