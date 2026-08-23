// ============================================================================
// vmd-outcome-scheduler — relance J+15 « Ce devis, finalement ? » (2026-08-24)
//
// Cron quotidien 08:20 UTC (migration 20260824_analysis_outcomes.sql).
// Cible : analyses `completed` créées il y a 15 à 30 jours, jamais relancées
// (outcome_request_sent_at null), sans issue déjà enregistrée, user non
// opt-out (vmd_signups.email_opt_out).
//
// Email à UN CLIC : 4 boutons → GET /api/analyse/outcome-click sur Vercel,
// signé HMAC-SHA256(analysisId, AGENT_SECRET_KEY) — personne ne peut
// enregistrer une issue pour une analyse qu'il ne possède pas sans le mail.
//
// Chaque réponse alimente analysis_outcomes = la donnée qui rend
// l'Observatoire prédictif (taux de signature par verdict / niveau de prix).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AGENT_SECRET_KEY = Deno.env.get("AGENT_SECRET_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY_VMD") ?? Deno.env.get("RESEND_API_KEY") ?? "";

const SITE = "https://www.verifiermondevis.fr";
const BATCH_MAX = 40; // borne par run — le cron quotidien rattrape le reste

async function hmacHex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function btn(href: string, label: string, bg: string, fg: string, border: string): string {
  return `<a href="${href}" style="display:block;background:${bg};color:${fg};border:1px solid ${border};font-family:'DM Sans',Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;padding:13px 18px;border-radius:10px;margin:0 0 10px;text-align:center;">${label}</a>`;
}

function buildHtml(fileName: string | null, links: Record<string, string>): string {
  const fileLine = fileName
    ? `<p style="margin:0 0 18px;font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#6B7280;">Votre devis : <strong style="color:#374151;">${esc(fileName)}</strong></p>`
    : "";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Ce devis, finalement ?</title></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:'DM Sans',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F3F4F6;"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
<tr><td style="padding:32px 32px 8px;text-align:center;"><img src="${SITE}/email/logo-vmd-icon.png" alt="VerifierMonDevis" width="48" height="48" style="border:0;display:inline-block;"/></td></tr>
<tr><td style="padding:8px 32px 32px;">
<h1 style="margin:10px 0 12px;font-size:22px;font-weight:700;color:#0E1730;line-height:1.3;">Ce devis, finalement&nbsp;?</h1>
${fileLine}
<p style="margin:0 0 20px;font-size:15px;color:#4B5563;line-height:1.7;">Il y a deux semaines, nous avons analysé votre devis. Dites-nous en <strong>un clic</strong> ce qu'il est devenu — votre réponse enrichit nos statistiques publiques et aide d'autres particuliers à mieux négocier.</p>
${btn(links.signe_tel_quel, "✅ Signé tel quel", "#ECFDF5", "#065F46", "#10B981")}
${btn(links.signe_apres_negociation, "🤝 Signé après négociation", "#EFF6FF", "#1E40AF", "#3B82F6")}
${btn(links.non_signe, "❌ Pas signé", "#FEF2F2", "#991B1B", "#FCA5A5")}
${btn(links.hesite, "🤔 J'hésite encore", "#F8FAFC", "#334155", "#CBD5E1")}
<p style="margin:20px 0 0;font-size:12.5px;color:#9CA3AF;line-height:1.6;text-align:center;">Un clic suffit — merci ! Vous pouvez répondre à cet email si vous avez une question.</p>
</td></tr>
<tr><td style="padding:16px 32px 24px;border-top:1px solid #E5E7EB;background:#F9FAFB;"><p style="margin:0;font-size:12px;color:#9CA3AF;text-align:center;">VerifierMonDevis.fr — l'avis d'un expert avant votre signature.</p></td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (_req) => {
  if (!AGENT_SECRET_KEY || !RESEND_API_KEY) {
    console.error("[outcome-scheduler] AGENT_SECRET_KEY ou RESEND_API_KEY manquant");
    return new Response(JSON.stringify({ ok: false, error: "missing secrets" }), { status: 500 });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const now = Date.now();
  const from = new Date(now - 30 * 86400_000).toISOString();
  const to = new Date(now - 15 * 86400_000).toISOString();

  const { data: candidates, error } = await supabase
    .from("analyses")
    .select("id, user_id, file_name, created_at")
    .eq("status", "completed")
    .is("outcome_request_sent_at", null)
    .not("user_id", "is", null)
    .gte("created_at", from)
    .lte("created_at", to)
    .limit(BATCH_MAX);
  if (error) {
    console.error("[outcome-scheduler] select analyses:", error.message);
    return new Response(JSON.stringify({ ok: false }), { status: 500 });
  }
  if (!candidates?.length) {
    console.log("[outcome-scheduler] aucune analyse à relancer");
    return new Response(JSON.stringify({ ok: true, sent: 0 }));
  }

  // Issues déjà connues + opt-out RGPD
  const ids = candidates.map((a) => a.id);
  const userIds = [...new Set(candidates.map((a) => a.user_id))];
  const [{ data: outcomes }, { data: optOuts }] = await Promise.all([
    supabase.from("analysis_outcomes").select("analysis_id").in("analysis_id", ids),
    supabase.from("vmd_signups").select("user_id").in("user_id", userIds).eq("email_opt_out", true),
  ]);
  const hasOutcome = new Set((outcomes ?? []).map((o) => o.analysis_id));
  const optedOut = new Set((optOuts ?? []).map((o) => o.user_id));

  let sent = 0;
  for (const a of candidates) {
    if (hasOutcome.has(a.id)) {
      // Issue déjà connue (bannière) → pas de relance, mais on stampe pour sortir du scope.
      await supabase.from("analyses").update({ outcome_request_sent_at: new Date().toISOString() }).eq("id", a.id);
      continue;
    }
    if (optedOut.has(a.user_id)) continue;

    const { data: userData } = await supabase.auth.admin.getUserById(a.user_id);
    const email = userData?.user?.email;
    if (!email || !email.includes("@") || email.endsWith("@anonymous.local")) continue;

    const token = await hmacHex(a.id, AGENT_SECRET_KEY);
    const mk = (choice: string) => `${SITE}/api/analyse/outcome-click?id=${a.id}&t=${token}&choice=${choice}`;
    const html = buildHtml(a.file_name, {
      signe_tel_quel: mk("signe_tel_quel"),
      signe_apres_negociation: mk("signe_apres_negociation"),
      non_signe: mk("non_signe"),
      hesite: mk("hesite"),
    });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "VerifierMonDevis <bonjour@verifiermondevis.fr>",
        reply_to: "contact@verifiermondevis.fr",
        to: [email],
        subject: "Ce devis, finalement ? (1 clic pour nous dire)",
        html,
      }),
    });
    if (!res.ok) {
      console.error(`[outcome-scheduler] Resend ${res.status} pour ${a.id.slice(0, 8)}:`, (await res.text()).slice(0, 200));
      continue;
    }
    await supabase.from("analyses").update({ outcome_request_sent_at: new Date().toISOString() }).eq("id", a.id);
    sent++;
    console.log(`[outcome-scheduler] relance envoyée — analyse ${a.id.slice(0, 8)}`);
  }

  console.log(`[outcome-scheduler] terminé : ${sent} email(s) envoyé(s) / ${candidates.length} candidat(s)`);
  return new Response(JSON.stringify({ ok: true, sent, candidates: candidates.length }));
});
