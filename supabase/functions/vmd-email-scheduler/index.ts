// ============================================================
// VMD — vmd-email-scheduler
// Cron quotidien (pg_cron) : sequence d'onboarding des nouveaux comptes VMD.
// Ancre = vmd_signups.created_at (e = jours depuis l'inscription).
//
//   J+1  vmd_negociate       (toujours)
//   J+3  vmd_compare         (toujours ; cadre Pass)
//   J+5  vmd_chantier        (pont GMC + offre)   -> SKIP si deja dans le funnel GMC
//   J+8  vmd_aides           (pont GMC aides)     -> SKIP si deja dans le funnel GMC
//   J+12 vmd_pass            (Pass Serenite)      -> SEULEMENT si >=2 analyses ET pas premium
//   J+18 vmd_chantier_final  (derniere invitation GMC) -> SKIP si deja dans le funnel GMC
//
// Le welcome (vmd_welcome, immediat) est envoye par vmd-on-signup, pas ici.
// Anti-doublon : vmd_email_log (unique user_id+template_id), reservation log-first.
// 1 email/user/run. Dry-run : POST {"dry":true}.
// Resend : RESEND_API_KEY_VMD (fallback RESEND_API_KEY).
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderVmdEmail, type VmdEmailId } from "../_shared/vmd-emails.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY_VMD") ?? Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM           = "VerifierMonDevis <bonjour@verifiermondevis.fr>";
const DAY_MS         = 86_400_000;
// Fenetre d'audience : la sequence se termine a J+18, on scanne ~25j (marge).
const WINDOW_DAYS    = 25;

type Signup = { user_id: string; created_at: string };
type Ctx = { e: number; hasGmc: boolean; isPremium: boolean; nbAnalyses: number };

// Jalons : id + jour declencheur + condition contextuelle.
const MILESTONES: { id: VmdEmailId; due: (e: number) => boolean; allow: (c: Ctx) => boolean }[] = [
  { id: "vmd_negociate",      due: (e) => e >= 1,  allow: () => true },
  { id: "vmd_compare",        due: (e) => e >= 3,  allow: () => true },
  { id: "vmd_chantier",       due: (e) => e >= 5,  allow: (c) => !c.hasGmc },
  { id: "vmd_aides",          due: (e) => e >= 8,  allow: (c) => !c.hasGmc },
  { id: "vmd_pass",           due: (e) => e >= 12, allow: (c) => !c.isPremium && c.nbAnalyses >= 2 },
  { id: "vmd_chantier_final", due: (e) => e >= 18, allow: (c) => !c.hasGmc },
];

function pickTemplate(already: Set<string>, ctx: Ctx): VmdEmailId | null {
  for (const m of MILESTONES) {
    if (!m.due(ctx.e)) continue;       // pas encore l'heure
    if (already.has(m.id)) continue;    // deja envoye
    if (!m.allow(ctx)) continue;        // condition contextuelle non remplie (skip definitif ce run)
    return m.id;
  }
  return null;
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn("[vmd-scheduler] RESEND_API_KEY_VMD manquant, email non envoye");
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!res.ok) {
    console.error(`[vmd-scheduler] Resend ${res.status}:`, await res.text());
    return false;
  }
  return true;
}

Deno.serve(async (req: Request) => {
  let dry = false;
  try {
    const b = await req.json();
    dry = b?.dry === true;
  } catch {
    // pas de body => run normal
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const now = Date.now();
  const sinceIso = new Date(now - WINDOW_DAYS * DAY_MS).toISOString();

  const { data: signups, error } = await sb
    .from("vmd_signups")
    .select("user_id, created_at")
    .gte("created_at", sinceIso)
    // RGPD : exclut les users qui ont demande la desinscription (email_opt_out=true).
    // La colonne a un DEFAULT FALSE via la migration 20260702 donc pas besoin de gerer NULL.
    .eq("email_opt_out", false);

  if (error) {
    console.error("[vmd-scheduler] query signups:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  const planned: { user_id: string; template_id: string; email?: string }[] = [];
  let sent = 0;

  for (const s of (signups ?? []) as Signup[]) {
    const e = Math.floor((now - new Date(s.created_at).getTime()) / DAY_MS);
    if (e < 1) continue; // rien avant J+1 (le welcome est gere par vmd-on-signup)

    // Deja envoyes.
    const { data: logs } = await sb
      .from("vmd_email_log")
      .select("template_id")
      .eq("user_id", s.user_id);
    const already = new Set((logs ?? []).map((l) => l.template_id as string));

    // User : email + prenom. Pas d'email => on saute.
    const { data: ud } = await sb.auth.admin.getUserById(s.user_id);
    const email = ud?.user?.email ?? "";
    if (!email) continue;
    const um = (ud?.user?.user_metadata ?? {}) as Record<string, string>;
    const prenom = (um.first_name || (um.full_name || um.name || "").split(" ")[0] || "").trim();

    // Contexte comportemental : premium (Pass) + nb d'analyses + deja dans le funnel GMC.
    const { data: sub } = await sb
      .from("subscriptions")
      .select("status, plan, lifetime_analysis_count")
      .eq("user_id", s.user_id)
      .maybeSingle();
    const isPremium = sub?.status === "active" || sub?.plan === "pass_serenite";
    const nbAnalyses = (sub?.lifetime_analysis_count as number | undefined) ?? 0;

    const { data: gmc } = await sb
      .from("gmc_subscriptions")
      .select("user_id")
      .eq("user_id", s.user_id)
      .maybeSingle();
    const hasGmc = !!gmc;

    const pick = pickTemplate(already, { e, hasGmc, isPremium, nbAnalyses });
    if (!pick) continue;

    planned.push({ user_id: s.user_id, template_id: pick });
    if (dry) continue;

    // Reservation log-first (idempotente) : sur conflit unique => deja envoye, on saute.
    const { data: ins, error: insErr } = await sb
      .from("vmd_email_log")
      .insert({ user_id: s.user_id, template_id: pick })
      .select("id")
      .maybeSingle();
    if (insErr || !ins) continue;

    const { subject, html } = renderVmdEmail(pick, { prenom });
    const ok = await sendEmail(email, subject, html);
    if (ok) {
      sent++;
      planned[planned.length - 1].email = email;
    } else {
      await sb.from("vmd_email_log").delete().eq("id", ins.id); // echec => retentera
    }
  }

  return new Response(JSON.stringify({ dry, candidates: planned.length, sent, planned }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
