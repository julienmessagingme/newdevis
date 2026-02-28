import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://www.verifiermondevis.fr",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// TODO: Once domain is verified on Resend, switch from to alerts@verifiermondevis.fr
// and add "bridey.johan@gmail.com" back to RECIPIENTS
const RECIPIENTS = ["julien@messagingme.fr"];
const RESEND_API_URL = "https://api.resend.com/emails";
const ADMIN_URL = "https://www.verifiermondevis.fr/admin";

interface Alert {
  category: string;
  severity: "CRITIQUE" | "ERREUR" | "WARNING";
  title: string;
  message: string;
  analyses: { id: string; status: string; created_at: string; error_message?: string }[];
}

// ============ HEALTH CHECKS ============

async function checkStuckAnalyses(supabase: any): Promise<Alert | null> {
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("analyses")
    .select("id, status, created_at, error_message")
    .in("status", ["pending", "processing"])
    .lt("created_at", fifteenMinAgo)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("checkStuckAnalyses error:", error.message);
    return null;
  }

  if (!data || data.length === 0) return null;

  return {
    category: "stuck_analyses",
    severity: "CRITIQUE",
    title: `${data.length} analyse(s) bloquee(s)`,
    message: `${data.length} analyse(s) en attente depuis plus de 15 minutes.`,
    analyses: data,
  };
}

async function checkErrorSpike(supabase: any): Promise<Alert | null> {
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("analyses")
    .select("id, status, created_at, error_message")
    .in("status", ["error", "failed"])
    .gte("created_at", thirtyMinAgo)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("checkErrorSpike error:", error.message);
    return null;
  }

  if (!data || data.length < 3) return null;

  return {
    category: "error_spike",
    severity: "ERREUR",
    title: `Pic d'erreurs : ${data.length} en 30min`,
    message: `${data.length} analyses en erreur dans les 30 dernieres minutes.`,
    analyses: data,
  };
}

async function checkHighErrorRate(supabase: any): Promise<Alert | null> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: allRecent, error: allError } = await supabase
    .from("analyses")
    .select("id, status, created_at, error_message")
    .gte("created_at", oneHourAgo);

  if (allError) {
    console.error("checkHighErrorRate error:", allError.message);
    return null;
  }

  if (!allRecent || allRecent.length < 4) return null;

  const errors = allRecent.filter((a: any) => ["error", "failed"].includes(a.status));
  const errorRate = errors.length / allRecent.length;

  if (errorRate <= 0.5) return null;

  return {
    category: "high_error_rate",
    severity: "WARNING",
    title: `Taux d'erreur eleve : ${Math.round(errorRate * 100)}%`,
    message: `${errors.length}/${allRecent.length} analyses en erreur sur la derniere heure (${Math.round(errorRate * 100)}%).`,
    analyses: errors.slice(0, 10),
  };
}

// ============ EMAIL ============

function buildEmailHtml(alert: Alert): string {
  const colors = {
    CRITIQUE: { bg: "#dc2626", light: "#fef2f2", border: "#fca5a5" },
    ERREUR: { bg: "#ea580c", light: "#fff7ed", border: "#fdba74" },
    WARNING: { bg: "#ca8a04", light: "#fefce8", border: "#fde047" },
  };
  const c = colors[alert.severity];

  const rows = alert.analyses
    .map((a) => {
      const date = new Date(a.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
      const msg = a.error_message ? a.error_message.substring(0, 80) : "-";
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:13px">${a.id.substring(0, 8)}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${a.status}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${date}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:13px">${msg}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    <div style="background:${c.bg};padding:20px;color:#fff">
      <h1 style="margin:0;font-size:18px">[${alert.severity}] ${alert.title}</h1>
      <p style="margin:8px 0 0;opacity:0.9;font-size:14px">VerifierMonDevis — Alerte systeme</p>
    </div>
    <div style="padding:20px">
      <div style="background:${c.light};border:1px solid ${c.border};border-radius:6px;padding:12px;margin-bottom:16px">
        <p style="margin:0;font-size:14px">${alert.message}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:8px;text-align:left">ID</th>
            <th style="padding:8px;text-align:left">Statut</th>
            <th style="padding:8px;text-align:left">Date</th>
            <th style="padding:8px;text-align:left">Message</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:20px;text-align:center">
        <a href="${ADMIN_URL}" style="display:inline-block;background:${c.bg};color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">
          Ouvrir le dashboard admin
        </a>
      </div>
    </div>
    <div style="padding:12px 20px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:center">
      Alerte automatique — max 1 email par categorie par heure
    </div>
  </div>
</body>
</html>`;
}

async function sendAlert(alert: Alert, resendApiKey: string): Promise<{ ok: boolean; error?: string }> {
  const now = new Date();
  const hourKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}-${String(now.getUTCHours()).padStart(2, "0")}`;
  const idempotencyKey = `${alert.category}_${hourKey}`;

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

    console.log(`Alert sent: ${alert.category} (idempotency: ${idempotencyKey})`);
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
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Run all checks in parallel
    const [stuck, errorSpike, highErrorRate] = await Promise.all([
      checkStuckAnalyses(supabase),
      checkErrorSpike(supabase),
      checkHighErrorRate(supabase),
    ]);

    const alerts = [stuck, errorSpike, highErrorRate].filter(Boolean) as Alert[];
    const sent: string[] = [];
    const errors: { category: string; error: string }[] = [];

    // Send emails for triggered alerts
    for (const alert of alerts) {
      const result = await sendAlert(alert, resendApiKey);
      if (result.ok) {
        sent.push(alert.category);
      } else if (result.error) {
        errors.push({ category: alert.category, error: result.error });
      }
    }

    const result = {
      checked_at: new Date().toISOString(),
      alerts_triggered: alerts.map((a) => a.category),
      alerts_sent: sent,
      send_errors: errors.length > 0 ? errors : undefined,
    };

    console.log("System alerts check:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Unexpected error:", error instanceof Error ? error.message : error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
