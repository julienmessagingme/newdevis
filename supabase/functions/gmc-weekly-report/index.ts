import { serviceRoleKey } from "../_shared/supabase-key.ts";
// ============================================================================
// gmc-weekly-report — rapport hebdomadaire GérerMonChantier
// ============================================================================
//
// Chaque lundi 08:00 UTC (cf. migration 20260724_gmc_weekly_stats.sql), cette
// fonction :
//
//   1. Calcule les KPIs de la semaine écoulée (lundi -> dimanche N-1) :
//      - Nouvelles inscriptions (total, par source)
//      - Activation rate à J+7 (% inscrits qui créent >=1 chantier)
//      - Trials encore actifs à J+14 (dernière connexion < 14j)
//      - Trials expirés sans conversion (churn essai)
//      - Conversions trial -> active dans la semaine
//      - Top 5 utilisateurs les plus actifs (nb chantiers + docs + last activity)
//   2. Compare aux stats de la semaine N-2 (stockées dans gmc_weekly_stats).
//   3. Upsert dans gmc_weekly_stats.
//   4. Envoie un rapport HTML par email via Resend.
//
// Zéro dépendance externe autre que Supabase. Zéro moteur touché.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = serviceRoleKey()!;
const RESEND_KEY   = Deno.env.get("RESEND_API_KEY_VMD") ?? Deno.env.get("RESEND_API_KEY") ?? "";
const REPORT_TO    = (Deno.env.get("GMC_REPORT_TO") ?? "julien@messagingme.fr,bridey.johan@gmail.com")
  .split(",").map((s) => s.trim()).filter(Boolean);

// ─── Helpers dates ──────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().substring(0, 10);
}

function lastCompleteWeek(now: Date): { start: string; end: string } {
  const day = now.getUTCDay();
  const daysToLastMonday = day === 0 ? 13 : day + 6;
  const start = new Date(now);
  start.setUTCDate(now.getUTCDate() - daysToLastMonday);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start: formatDate(start), end: formatDate(end) };
}

// ─── Helpers formatage ──────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return Math.round(n).toLocaleString("fr-FR");
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${n.toFixed(0)}%`;
}

function variation(current: number, prior: number | null | undefined): string {
  if (prior === null || prior === undefined) return "—";
  if (prior === 0) return current === 0 ? "0%" : "+∞%";
  const pct = ((current - prior) / prior) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}

// ─── Fetch stats semaine ────────────────────────────────────────────────────

interface WeekStats {
  inscriptions_total: number;
  inscriptions_via_gmc: number;
  inscriptions_via_vmd: number;
  inscrits_avec_chantier: number;
  activation_rate_j7: number | null;
  trial_actifs_j14: number;
  trial_ended_no_conversion: number;
  conversions_trial_paid: number;
  top_users: Array<{
    email: string;
    first_name: string | null;
    nb_chantiers: number;
    nb_docs: number;
    last_activity: string | null;
  }>;
}

async function computeWeekStats(
  supabase: ReturnType<typeof createClient>,
  weekStart: string,
  weekEnd: string,
): Promise<WeekStats> {
  // 1. Inscriptions de la semaine
  const { data: subs } = await supabase
    .from("gmc_subscriptions")
    .select("user_id, created_at, signup_source, status, trial_ends_at, plan")
    .gte("created_at", `${weekStart}T00:00:00Z`)
    .lte("created_at", `${weekEnd}T23:59:59Z`);

  const inscriptions = subs ?? [];
  const inscriptions_total = inscriptions.length;
  const inscriptions_via_gmc = inscriptions.filter((s) => s.signup_source === "gerermonchantier").length;
  const inscriptions_via_vmd = inscriptions.filter((s) => s.signup_source === "verifiermondevis").length;

  // 2. Activation J+7 — % inscrits qui ont créé >=1 chantier dans les 7 jours suivant leur inscription
  //    On regarde les inscrits de la semaine analysée (leur J+7 peut être dans le futur, mais
  //    on prend la meilleure vue disponible au moment de la mesure).
  let inscritsAvecChantier = 0;
  for (const sub of inscriptions) {
    const dayAfter = new Date(new Date(sub.created_at).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("chantiers")
      .select("id", { count: "exact", head: true })
      .eq("user_id", sub.user_id)
      .lte("created_at", dayAfter);
    if ((count ?? 0) > 0) inscritsAvecChantier++;
  }
  const activation_rate_j7 = inscriptions_total > 0
    ? Math.round((inscritsAvecChantier / inscriptions_total) * 100 * 100) / 100
    : null;

  // 3. Rétention : trials qui étaient actifs à J+14 (dernière connexion < 14 jours)
  //    On mesure sur les inscrits d'il y a 2-3 semaines (assez de recul).
  const cutoffStart = new Date(new Date(weekStart).getTime() - 21 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
  const cutoffEnd   = new Date(new Date(weekStart).getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
  const { data: oldTrials } = await supabase
    .from("gmc_subscriptions")
    .select("user_id, created_at")
    .eq("status", "trial")
    .gte("created_at", `${cutoffStart}T00:00:00Z`)
    .lte("created_at", `${cutoffEnd}T23:59:59Z`);

  let trial_actifs_j14 = 0;
  const now = Date.now();
  for (const t of (oldTrials ?? [])) {
    const { data: userInfo } = await supabase.auth.admin.getUserById(t.user_id);
    const last = userInfo?.user?.last_sign_in_at;
    if (last && (now - new Date(last).getTime()) < 14 * 24 * 60 * 60 * 1000) {
      trial_actifs_j14++;
    }
  }

  // 4. Trials expirés sans conversion (churn)
  const { count: expiredCount } = await supabase
    .from("gmc_subscriptions")
    .select("id", { count: "exact", head: true })
    .in("status", ["trial"])
    .gte("trial_ends_at", `${weekStart}T00:00:00Z`)
    .lte("trial_ends_at", `${weekEnd}T23:59:59Z`);
  const trial_ended_no_conversion = expiredCount ?? 0;

  // 5. Conversions trial → active dans la semaine
  //    On approxime en comptant les subs qui ont current_period_end défini pour la 1re fois
  //    dans la semaine (approximation Stripe webhook).
  const { count: convertedCount } = await supabase
    .from("gmc_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .not("stripe_subscription_id", "is", null)
    .gte("updated_at", `${weekStart}T00:00:00Z`)
    .lte("updated_at", `${weekEnd}T23:59:59Z`);
  const conversions_trial_paid = convertedCount ?? 0;

  // 6. Top 5 utilisateurs les plus actifs de la semaine (nb chantiers + docs)
  const topUsers: WeekStats["top_users"] = [];
  for (const sub of inscriptions) {
    const [{ count: nbChantiers }, { count: nbDocs }] = await Promise.all([
      supabase.from("chantiers").select("id", { count: "exact", head: true }).eq("user_id", sub.user_id),
      (async () => {
        const { data: cs } = await supabase.from("chantiers").select("id").eq("user_id", sub.user_id);
        const ids = (cs ?? []).map((c) => c.id);
        if (ids.length === 0) return { count: 0 };
        return supabase.from("documents_chantier").select("id", { count: "exact", head: true }).in("chantier_id", ids);
      })(),
    ]);
    const { data: userInfo } = await supabase.auth.admin.getUserById(sub.user_id);
    topUsers.push({
      email: userInfo?.user?.email ?? "—",
      first_name: (userInfo?.user?.user_metadata?.first_name as string | undefined) ?? null,
      nb_chantiers: nbChantiers ?? 0,
      nb_docs: nbDocs ?? 0,
      last_activity: userInfo?.user?.last_sign_in_at ?? null,
    });
  }
  topUsers.sort((a, b) => (b.nb_chantiers + b.nb_docs) - (a.nb_chantiers + a.nb_docs));

  return {
    inscriptions_total,
    inscriptions_via_gmc,
    inscriptions_via_vmd,
    inscrits_avec_chantier: inscritsAvecChantier,
    activation_rate_j7,
    trial_actifs_j14,
    trial_ended_no_conversion,
    conversions_trial_paid,
    top_users: topUsers.slice(0, 5),
  };
}

// ─── Email HTML ─────────────────────────────────────────────────────────────

interface EmailData {
  weekStart: string;
  weekEnd: string;
  current: WeekStats;
  prior: WeekStats | null;
}

function buildEmailHtml(d: EmailData): string {
  const c = d.current;
  const p = d.prior;

  const kpiRow = (label: string, cur: number | null | undefined, prev: number | null | undefined, isPct = false) => `<tr>
    <td style="padding:10px 14px;border-bottom:1px solid #F0F0EA;color:#333;">${esc(label)}</td>
    <td style="padding:10px 14px;border-bottom:1px solid #F0F0EA;text-align:right;font-weight:600;">${isPct ? fmtPct(cur) : fmtInt(cur)}</td>
    <td style="padding:10px 14px;border-bottom:1px solid #F0F0EA;text-align:right;color:#666;font-size:13px;">${esc(variation(cur ?? 0, prev))}</td>
  </tr>`;

  const topUsersRows = c.top_users.length > 0
    ? c.top_users.map((u) => `<tr>
        <td style="padding:6px 12px;border-bottom:1px solid #F5F5F0;">
          <a href="https://www.verifiermondevis.fr/admin/users/${encodeURIComponent(u.email)}" style="color:#0E4F86;text-decoration:none;">${esc(u.first_name ? `${u.first_name} · ${u.email}` : u.email)}</a>
        </td>
        <td style="padding:6px 12px;border-bottom:1px solid #F5F5F0;text-align:right;">${u.nb_chantiers}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #F5F5F0;text-align:right;">${u.nb_docs}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #F5F5F0;text-align:right;color:#666;font-size:12px;">${u.last_activity ? new Date(u.last_activity).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : "—"}</td>
      </tr>`).join("")
    : `<tr><td colspan="4" style="padding:16px;text-align:center;color:#999;font-style:italic;">Aucune inscription cette semaine.</td></tr>`;

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#F7F7F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1A1A1A;line-height:1.5;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #E5E5E0;border-radius:12px;padding:28px;">
    <h1 style="margin:0 0 4px;font-size:20px;font-weight:600;">Rapport hebdomadaire GérerMonChantier</h1>
    <p style="margin:0 0 24px;color:#666;font-size:13px;">Du ${esc(d.weekStart)} au ${esc(d.weekEnd)} — comparé à la semaine précédente</p>

    <h2 style="margin:8px 0 10px;font-size:14px;font-weight:600;color:#333;">Inscriptions</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
      <tbody>
        ${kpiRow("Total", c.inscriptions_total, p?.inscriptions_total)}
        ${kpiRow("↳ via GérerMonChantier", c.inscriptions_via_gmc, p?.inscriptions_via_gmc)}
        ${kpiRow("↳ via VerifierMonDevis", c.inscriptions_via_vmd, p?.inscriptions_via_vmd)}
      </tbody>
    </table>

    <h2 style="margin:8px 0 10px;font-size:14px;font-weight:600;color:#333;">Engagement</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
      <tbody>
        ${kpiRow("Inscrits avec chantier créé (J+7)", c.inscrits_avec_chantier, p?.inscrits_avec_chantier)}
        ${kpiRow("Activation rate J+7", c.activation_rate_j7, p?.activation_rate_j7, true)}
        ${kpiRow("Trials actifs à J+14 (rétention)", c.trial_actifs_j14, p?.trial_actifs_j14)}
      </tbody>
    </table>

    <h2 style="margin:8px 0 10px;font-size:14px;font-weight:600;color:#333;">Conversion & churn</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
      <tbody>
        ${kpiRow("Conversions trial → payant", c.conversions_trial_paid, p?.conversions_trial_paid)}
        ${kpiRow("Trials expirés sans conversion", c.trial_ended_no_conversion, p?.trial_ended_no_conversion)}
      </tbody>
    </table>

    <h2 style="margin:8px 0 10px;font-size:14px;font-weight:600;color:#333;">Top 5 inscrits actifs de la semaine</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#F7F7F5;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">
          <th style="padding:8px 12px;text-align:left;">Utilisateur</th>
          <th style="padding:8px 12px;text-align:right;">Chantiers</th>
          <th style="padding:8px 12px;text-align:right;">Docs</th>
          <th style="padding:8px 12px;text-align:right;">Dernière activité</th>
        </tr>
      </thead>
      <tbody>${topUsersRows}</tbody>
    </table>

    <p style="margin:24px 0 0;font-size:12px;color:#999;">
      Chaque nom est un lien vers sa fiche admin complète (chantiers, docs, timeline, mail perso).<br>
      Historique complet dans <code>public.gmc_weekly_stats</code>. Envoyé chaque lundi 08:00 UTC.
    </p>
  </div>
</body></html>`;
}

async function sendEmail(subject: string, html: string): Promise<void> {
  if (!RESEND_KEY) { console.warn("[gmc-weekly-report] RESEND_API_KEY absent — email skip"); return; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "GérerMonChantier <bonjour@gerermonchantier.fr>",
      to: REPORT_TO,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[gmc-weekly-report] Resend HTTP", res.status, body.substring(0, 200));
  }
}

// ─── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (_req) => {
  const startedAt = Date.now();
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { start, end } = lastCompleteWeek(new Date());
    console.log(`[gmc-weekly-report] Fenêtre : ${start} → ${end}`);

    const current = await computeWeekStats(supabase, start, end);

    const { data: priorRow } = await supabase
      .from("gmc_weekly_stats")
      .select("*")
      .lt("week_start", start)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle();
    const prior = (priorRow as WeekStats | null) ?? null;

    // Upsert la semaine courante
    const { error: upErr } = await supabase
      .from("gmc_weekly_stats")
      .upsert({
        week_start: start,
        week_end: end,
        inscriptions_total: current.inscriptions_total,
        inscriptions_via_gmc: current.inscriptions_via_gmc,
        inscriptions_via_vmd: current.inscriptions_via_vmd,
        inscrits_avec_chantier: current.inscrits_avec_chantier,
        activation_rate_j7: current.activation_rate_j7,
        trial_actifs_j14: current.trial_actifs_j14,
        trial_ended_no_conversion: current.trial_ended_no_conversion,
        conversions_trial_paid: current.conversions_trial_paid,
        top_users: current.top_users,
        captured_at: new Date().toISOString(),
      }, { onConflict: "week_start" });
    if (upErr) console.error("[gmc-weekly-report] upsert failed:", upErr.message);

    const html = buildEmailHtml({ weekStart: start, weekEnd: end, current, prior });
    const subject = `GMC — Rapport semaine ${start} (${current.inscriptions_total} inscrit${current.inscriptions_total > 1 ? "s" : ""})`;
    await sendEmail(subject, html);

    const elapsed = Date.now() - startedAt;
    console.log(`[gmc-weekly-report] OK en ${elapsed}ms`);
    return new Response(JSON.stringify({ ok: true, week_start: start, current, elapsed_ms: elapsed }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[gmc-weekly-report] Fatal:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
