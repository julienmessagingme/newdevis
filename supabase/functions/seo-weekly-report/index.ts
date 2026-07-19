// ============================================================================
// seo-weekly-report — rapport hebdomadaire Google Search Console
// ============================================================================
//
// Chaque lundi 09:00 UTC (cf. migration 20260711_seo_weekly_stats.sql), cette
// fonction :
//
//   1. S'authentifie sur Google via Service Account (JWT RS256 signé avec la
//      clé privée, échangé contre un access token OAuth2).
//   2. Interroge Search Console API pour la semaine écoulée
//      (lundi → dimanche N-1) — dimensions : query + page.
//   3. Agrège en 5 clusters : observatoire / guides / centre-aide / landing /
//      autres, plus le total global.
//   4. Compare à la semaine N-2 (via seo_weekly_stats) pour calculer les
//      variations impressions / clics / position.
//   5. Stocke chaque cluster dans seo_weekly_stats (unique par week_start).
//   6. Envoie un rapport HTML par email à Julien + Johan via Resend.
//   7. Déclenche une alerte si impressions globales chutent > 20% vs N-2.
//
// Variables d'env requises (Supabase Function Secrets) :
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injectées)
//   - GSC_SERVICE_ACCOUNT_EMAIL  ← email du service account Google
//   - GSC_PRIVATE_KEY            ← clé privée RSA au format PEM
//                                  (retours à la ligne remplacés par \n si stockés en 1 ligne)
//   - GSC_SITE_URL               ← "sc-domain:verifiermondevis.fr"
//                                  ou "https://www.verifiermondevis.fr/"
//   - RESEND_API_KEY             ← clé Resend (fallback RESEND_API_KEY_VMD)
//   - SEO_REPORT_TO              ← "julien@messagingme.fr,bridey.johan@gmail.com"
//                                  (défaut si non défini)
//
// Ne bloque JAMAIS sur une erreur non-critique — on préfère un rapport
// dégradé qu'aucun rapport. Toutes les erreurs sont loguées.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GSC_EMAIL    = Deno.env.get("GSC_SERVICE_ACCOUNT_EMAIL") ?? "";
const GSC_KEY_RAW  = Deno.env.get("GSC_PRIVATE_KEY") ?? "";
const GSC_SITE_URL = Deno.env.get("GSC_SITE_URL") ?? "sc-domain:verifiermondevis.fr";
const RESEND_KEY   = Deno.env.get("RESEND_API_KEY") ?? Deno.env.get("RESEND_API_KEY_VMD") ?? "";
const REPORT_TO    = (Deno.env.get("SEO_REPORT_TO") ?? "julien@messagingme.fr,bridey.johan@gmail.com")
  .split(",").map((s) => s.trim()).filter(Boolean);

const SEARCH_CONSOLE_URL = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE_URL)}/searchAnalytics/query`;
const OAUTH_TOKEN_URL    = "https://oauth2.googleapis.com/token";
const OAUTH_SCOPE        = "https://www.googleapis.com/auth/webmasters.readonly";

type Cluster = "global" | "observatoire" | "guides" | "centre-aide" | "landing" | "autres";

interface GscRow {
  keys: string[]; // [query, page]
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface ClusterStats {
  cluster: Cluster;
  impressions: number;
  clicks: number;
  positionSum: number; // pour moyenne pondérée
  positionWeights: number;
  topQueries: Array<{ query: string; impressions: number; clicks: number; position: number }>;
  topPages: Array<{ page: string; impressions: number; clicks: number; position: number }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH GOOGLE — JWT RS256 signé + échange contre access token
// ═══════════════════════════════════════════════════════════════════════════

function base64UrlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const clean = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(clean);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getGoogleAccessToken(): Promise<string> {
  if (!GSC_EMAIL || !GSC_KEY_RAW) {
    throw new Error("GSC_SERVICE_ACCOUNT_EMAIL ou GSC_PRIVATE_KEY absent des variables d'environnement");
  }

  // Reconstitue les retours à la ligne si la clé a été stockée en 1 ligne.
  const pemKey = GSC_KEY_RAW.includes("\\n") ? GSC_KEY_RAW.replace(/\\n/g, "\n") : GSC_KEY_RAW;

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: GSC_EMAIL,
    scope: OAUTH_SCOPE,
    aud: OAUTH_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };

  const header = { alg: "RS256", typ: "JWT" };
  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const claimsB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(claims)));
  const signInput = `${headerB64}.${claimsB64}`;

  const keyBuf = pemToArrayBuffer(pemKey);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBuf,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signInput),
  );

  const jwt = `${signInput}.${base64UrlEncode(signature)}`;

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OAuth token exchange failed: ${res.status} ${body.substring(0, 300)}`);
  }
  const json = await res.json();
  if (!json.access_token) throw new Error("access_token manquant dans la réponse OAuth");
  return json.access_token as string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH CONSOLE — query une plage de dates
// ═══════════════════════════════════════════════════════════════════════════

async function fetchGscRows(
  token: string,
  startDate: string,
  endDate: string,
): Promise<GscRow[]> {
  const rows: GscRow[] = [];
  let startRow = 0;
  const rowLimit = 5000;

  while (true) {
    const res = await fetch(SEARCH_CONSOLE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ["query", "page"],
        rowLimit,
        startRow,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Search Console API failed: ${res.status} ${body.substring(0, 300)}`);
    }
    const json = await res.json();
    const batch: GscRow[] = json.rows ?? [];
    rows.push(...batch);
    if (batch.length < rowLimit) break;
    startRow += rowLimit;
    // Safety cap : 25 000 rows max par run
    if (startRow >= 25000) break;
  }
  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// AGRÉGATION PAR CLUSTER
// ═══════════════════════════════════════════════════════════════════════════

function clusterOf(page: string): Cluster {
  try {
    const url = new URL(page);
    const p = url.pathname;
    if (p.startsWith("/observatoire/") || p === "/observatoire") return "observatoire";
    if (p.startsWith("/guides/") || p === "/guides") return "guides";
    if (p.startsWith("/centre-aide/") || p === "/centre-aide") return "centre-aide";
    // Landing = home + pages marketing directes principales
    if (p === "/" || p === "/nouvelle-analyse" || p === "/comparateur" || p === "/pass-serenite") return "landing";
    return "autres";
  } catch {
    return "autres";
  }
}

function newClusterStats(cluster: Cluster): ClusterStats {
  return {
    cluster,
    impressions: 0,
    clicks: 0,
    positionSum: 0,
    positionWeights: 0,
    topQueries: [],
    topPages: [],
  };
}

function aggregateRows(rows: GscRow[]): Map<Cluster, ClusterStats> {
  const clusters = new Map<Cluster, ClusterStats>();
  const clusterList: Cluster[] = ["global", "observatoire", "guides", "centre-aide", "landing", "autres"];
  for (const c of clusterList) clusters.set(c, newClusterStats(c));

  // Aggrège par (cluster, query) et (cluster, page) pour éviter les doublons
  const perClusterQueries = new Map<Cluster, Map<string, { impressions: number; clicks: number; positionSum: number }>>();
  const perClusterPages   = new Map<Cluster, Map<string, { impressions: number; clicks: number; positionSum: number }>>();
  for (const c of clusterList) {
    perClusterQueries.set(c, new Map());
    perClusterPages.set(c, new Map());
  }

  for (const row of rows) {
    const [query, page] = row.keys;
    const cluster = clusterOf(page);

    // Update cluster + global
    for (const c of [cluster, "global" as Cluster]) {
      const s = clusters.get(c)!;
      s.impressions += row.impressions;
      s.clicks += row.clicks;
      s.positionSum += row.position * row.impressions;
      s.positionWeights += row.impressions;

      // Query agrégée
      const qMap = perClusterQueries.get(c)!;
      const q = qMap.get(query) ?? { impressions: 0, clicks: 0, positionSum: 0 };
      q.impressions += row.impressions;
      q.clicks += row.clicks;
      q.positionSum += row.position * row.impressions;
      qMap.set(query, q);

      // Page agrégée
      const pMap = perClusterPages.get(c)!;
      const p = pMap.get(page) ?? { impressions: 0, clicks: 0, positionSum: 0 };
      p.impressions += row.impressions;
      p.clicks += row.clicks;
      p.positionSum += row.position * row.impressions;
      pMap.set(page, p);
    }
  }

  // Top 15 queries + top 10 pages par cluster
  for (const c of clusterList) {
    const s = clusters.get(c)!;
    s.topQueries = [...perClusterQueries.get(c)!.entries()]
      .map(([query, v]) => ({
        query,
        impressions: v.impressions,
        clicks: v.clicks,
        position: v.impressions > 0 ? v.positionSum / v.impressions : 0,
      }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 15);
    s.topPages = [...perClusterPages.get(c)!.entries()]
      .map(([page, v]) => ({
        page,
        impressions: v.impressions,
        clicks: v.clicks,
        position: v.impressions > 0 ? v.positionSum / v.impressions : 0,
      }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 10);
  }

  return clusters;
}

// ═══════════════════════════════════════════════════════════════════════════
// DATE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function formatDate(d: Date): string {
  return d.toISOString().substring(0, 10);
}

function lastCompleteWeek(now: Date): { start: string; end: string } {
  // Semaine ISO : lundi → dimanche
  const day = now.getUTCDay(); // 0=dim, 1=lun, ...
  const daysToLastMonday = day === 0 ? 13 : day + 6; // rembobine au lundi 2 semaines avant
  const start = new Date(now);
  start.setUTCDate(now.getUTCDate() - daysToLastMonday);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start: formatDate(start), end: formatDate(end) };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPARAISON avec la semaine précédente stockée
// ═══════════════════════════════════════════════════════════════════════════

interface PriorStats {
  impressions: number;
  clicks: number;
  avg_position: number | null;
}

async function fetchPriorWeek(
  supabase: ReturnType<typeof createClient>,
  weekStart: string,
  cluster: Cluster,
): Promise<PriorStats | null> {
  const { data } = await supabase
    .from("seo_weekly_stats")
    .select("impressions, clicks, avg_position")
    .lt("week_start", weekStart)
    .eq("cluster", cluster)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as PriorStats | null) ?? null;
}

function variation(current: number, prior: number | null | undefined): string {
  if (prior === null || prior === undefined) return "—";
  if (prior === 0) return current === 0 ? "0%" : "+∞%";
  const pct = ((current - prior) / prior) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL HTML (Resend)
// ═══════════════════════════════════════════════════════════════════════════

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("fr-FR");
}

function fmtPos(n: number): string {
  return n === 0 ? "—" : n.toFixed(1);
}

function fmtCtr(clicks: number, impressions: number): string {
  if (impressions === 0) return "—";
  return `${((clicks / impressions) * 100).toFixed(2)}%`;
}

interface EmailData {
  weekStart: string;
  weekEnd: string;
  clusters: Map<Cluster, ClusterStats>;
  priors: Map<Cluster, PriorStats | null>;
  alert: string | null;
}

function buildEmailHtml(d: EmailData): string {
  const clusterOrder: Cluster[] = ["global", "observatoire", "guides", "centre-aide", "landing", "autres"];
  const clusterLabels: Record<Cluster, string> = {
    global: "Global",
    observatoire: "Observatoire",
    guides: "Guides",
    "centre-aide": "Centre d'aide",
    landing: "Landing",
    autres: "Autres",
  };

  const clusterRows = clusterOrder
    .map((c) => {
      const s = d.clusters.get(c)!;
      const p = d.priors.get(c) ?? null;
      const avgPos = s.positionWeights > 0 ? s.positionSum / s.positionWeights : 0;
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E5E0;font-weight:${c === "global" ? "600" : "400"};">${esc(clusterLabels[c])}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E5E0;text-align:right;">${fmtInt(s.impressions)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E5E0;text-align:right;color:#666;font-size:13px;">${esc(variation(s.impressions, p?.impressions))}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E5E0;text-align:right;">${fmtInt(s.clicks)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E5E0;text-align:right;color:#666;font-size:13px;">${esc(variation(s.clicks, p?.clicks))}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E5E0;text-align:right;">${fmtCtr(s.clicks, s.impressions)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E5E0;text-align:right;">${fmtPos(avgPos)}</td>
      </tr>`;
    })
    .join("");

  const globalStats = d.clusters.get("global")!;
  const topQueriesRows = globalStats.topQueries.slice(0, 15).map((q) => `<tr>
    <td style="padding:6px 10px;border-bottom:1px solid #F0F0EA;">${esc(q.query)}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #F0F0EA;text-align:right;">${fmtInt(q.impressions)}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #F0F0EA;text-align:right;">${fmtInt(q.clicks)}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #F0F0EA;text-align:right;">${fmtPos(q.position)}</td>
  </tr>`).join("");

  const topPagesRows = globalStats.topPages.slice(0, 10).map((p) => `<tr>
    <td style="padding:6px 10px;border-bottom:1px solid #F0F0EA;">${esc(p.page)}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #F0F0EA;text-align:right;">${fmtInt(p.impressions)}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #F0F0EA;text-align:right;">${fmtInt(p.clicks)}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #F0F0EA;text-align:right;">${fmtPos(p.position)}</td>
  </tr>`).join("");

  const alertBanner = d.alert
    ? `<div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;padding:14px 18px;margin-bottom:18px;color:#78350F;font-weight:600;">⚠ ${esc(d.alert)}</div>`
    : "";

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#F7F7F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1A1A1A;line-height:1.5;">
  <div style="max-width:780px;margin:0 auto;background:#ffffff;border:1px solid #E5E5E0;border-radius:12px;padding:28px;">
    <h1 style="margin:0 0 4px;font-size:20px;font-weight:600;">Rapport SEO hebdomadaire</h1>
    <p style="margin:0 0 24px;color:#666;font-size:13px;">Du ${esc(d.weekStart)} au ${esc(d.weekEnd)} — comparé à la semaine précédente</p>

    ${alertBanner}

    <h2 style="margin:8px 0 12px;font-size:15px;font-weight:600;">Vue par cluster</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:28px;">
      <thead>
        <tr style="background:#F7F7F5;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">
          <th style="padding:8px 12px;text-align:left;">Cluster</th>
          <th style="padding:8px 12px;text-align:right;">Impressions</th>
          <th style="padding:8px 12px;text-align:right;">Δ</th>
          <th style="padding:8px 12px;text-align:right;">Clics</th>
          <th style="padding:8px 12px;text-align:right;">Δ</th>
          <th style="padding:8px 12px;text-align:right;">CTR</th>
          <th style="padding:8px 12px;text-align:right;">Position</th>
        </tr>
      </thead>
      <tbody>${clusterRows}</tbody>
    </table>

    <h2 style="margin:8px 0 12px;font-size:15px;font-weight:600;">Top 15 requêtes (global)</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:28px;">
      <thead>
        <tr style="background:#F7F7F5;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">
          <th style="padding:6px 10px;text-align:left;">Requête</th>
          <th style="padding:6px 10px;text-align:right;">Impr.</th>
          <th style="padding:6px 10px;text-align:right;">Clics</th>
          <th style="padding:6px 10px;text-align:right;">Pos.</th>
        </tr>
      </thead>
      <tbody>${topQueriesRows}</tbody>
    </table>

    <h2 style="margin:8px 0 12px;font-size:15px;font-weight:600;">Top 10 pages (global)</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#F7F7F5;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">
          <th style="padding:6px 10px;text-align:left;">Page</th>
          <th style="padding:6px 10px;text-align:right;">Impr.</th>
          <th style="padding:6px 10px;text-align:right;">Clics</th>
          <th style="padding:6px 10px;text-align:right;">Pos.</th>
        </tr>
      </thead>
      <tbody>${topPagesRows}</tbody>
    </table>

    <p style="margin:32px 0 0;font-size:12px;color:#999;">
      Source : Google Search Console — site ${esc(GSC_SITE_URL)}.<br>
      Envoyé automatiquement chaque lundi 09:00 UTC.<br>
      Historique complet dans <code>public.seo_weekly_stats</code>.
    </p>
  </div>
</body></html>`;
}

async function sendEmail(subject: string, html: string): Promise<void> {
  if (!RESEND_KEY) {
    console.warn("[seo-weekly-report] RESEND_API_KEY absent — email skip");
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "VerifierMonDevis SEO <bonjour@verifiermondevis.fr>",
      to: REPORT_TO,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[seo-weekly-report] Resend HTTP", res.status, body.substring(0, 200));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (_req) => {
  const startedAt = Date.now();
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Auth Google
    const token = await getGoogleAccessToken();

    // 2. Fenêtre = lundi → dimanche de la semaine écoulée
    const { start, end } = lastCompleteWeek(new Date());
    console.log(`[seo-weekly-report] Fenêtre : ${start} → ${end}`);

    // 3. Query Search Console
    const rows = await fetchGscRows(token, start, end);
    console.log(`[seo-weekly-report] ${rows.length} rows reçues`);

    // 4. Agrégation par cluster
    const clusters = aggregateRows(rows);

    // 5. Récupère les stats semaine N-2 pour chaque cluster
    const priors = new Map<Cluster, PriorStats | null>();
    for (const [c] of clusters) {
      priors.set(c, await fetchPriorWeek(supabase, start, c));
    }

    // 6. Insert / upsert dans seo_weekly_stats
    for (const [c, s] of clusters) {
      const avgPos = s.positionWeights > 0 ? s.positionSum / s.positionWeights : null;
      const ctr = s.impressions > 0 ? s.clicks / s.impressions : null;
      const { error } = await supabase
        .from("seo_weekly_stats")
        .upsert({
          week_start: start,
          week_end: end,
          cluster: c,
          impressions: s.impressions,
          clicks: s.clicks,
          ctr,
          avg_position: avgPos,
          top_queries: s.topQueries,
          top_pages: s.topPages,
          captured_at: new Date().toISOString(),
        }, { onConflict: "week_start,cluster" });
      if (error) console.error(`[seo-weekly-report] upsert ${c} failed:`, error.message);
    }

    // 7. Alerte si chute majeure
    let alert: string | null = null;
    const globalStats = clusters.get("global")!;
    const globalPrior = priors.get("global");
    if (globalPrior && globalPrior.impressions > 0) {
      const dropPct = ((globalStats.impressions - globalPrior.impressions) / globalPrior.impressions) * 100;
      if (dropPct < -20) {
        alert = `Chute d'impressions globale de ${dropPct.toFixed(0)}% vs semaine précédente (${fmtInt(globalPrior.impressions)} → ${fmtInt(globalStats.impressions)}). À investiguer.`;
      }
    }

    // 8. Email de rapport
    const html = buildEmailHtml({
      weekStart: start,
      weekEnd: end,
      clusters,
      priors,
      alert,
    });
    const subject = alert
      ? `⚠ SEO — Chute impressions semaine ${start}`
      : `SEO — Rapport semaine ${start}`;
    await sendEmail(subject, html);

    const elapsed = Date.now() - startedAt;
    console.log(`[seo-weekly-report] OK en ${elapsed}ms`);
    return new Response(
      JSON.stringify({ ok: true, week_start: start, rows: rows.length, alert, elapsed_ms: elapsed }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[seo-weekly-report] Fatal:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
