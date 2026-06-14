// ============================================================
// GMC — gmc-email-scheduler
// Cron quotidien (pg_cron) : pilote TOUT le cycle de vie email, d'apres le statut
// + les dates de gmc_subscriptions (aucun appel Stripe ici ; l'edge function a la
// cle Resend, contrairement a Vercel ou le webhook ne peut pas envoyer).
//
//   trial    : engagement (J1/3/7/14 depuis trial_started_at)
//              + conversion (J-7/J-3/J-1/fin avant trial_ends_at ; -50% des J-3)
//              + winback (J+3/J+10/J+21 apres la fin ; l'essai ne bascule jamais
//                en 'expired' tout seul, donc on le rattrape ici)
//   active   : gmc_paid_welcome (une fois)
//   past_due : gmc_dunning (une fois)
//   expired  : gmc_goodbye (une fois — abonnement resilie)
//
// Anti-doublon : table gmc_email_log (unique user_id+template_id), reservation
// "log-first" avant envoi (rollback si l'envoi echoue). 1 email/user/run max
// (le plus ancien jalon du non encore envoye) => pas de rafale de rattrapage.
// Dry-run : POST body {"dry":true} renvoie le plan sans rien envoyer ni logger.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderGmcEmail, type GmcEmailId } from "../_shared/gmc-emails.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM           = "GererMonChantier <bonjour@gerermonchantier.fr>";
const BASE           = "https://www.gerermonchantier.fr";
const APP_URL        = `${BASE}/mon-chantier`;
const SUBSCRIBE_URL  = `${BASE}/gmc-abonnement`;
// Lien -50% : ouvre la checkout Essentiel mensuel avec le coupon applique.
const OFFER_URL      = `${BASE}/gmc-abonnement?plan=essentiel&interval=month&offer=1`;
const DAY_MS         = 86_400_000;

// Jalons de l'essai (status='trial'), du plus tot au plus tard.
// e = jours depuis trial_started_at ; l = jours avant trial_ends_at (negatif = depasse).
const TRIAL_MILESTONES: { id: GmcEmailId; due: (e: number, l: number) => boolean }[] = [
  { id: "gmc_activate",       due: (e) => e >= 1 },
  { id: "gmc_value_features", due: (e) => e >= 3 },
  { id: "gmc_trust",          due: (e) => e >= 7 },
  { id: "gmc_midtrial",       due: (e) => e >= 14 },
  { id: "gmc_trial_j7",       due: (_e, l) => l <= 7 },
  { id: "gmc_trial_j3",       due: (_e, l) => l <= 3 },
  { id: "gmc_trial_j1",       due: (_e, l) => l <= 1 },
  { id: "gmc_trial_ended",    due: (_e, l) => l <= 0 },
  { id: "gmc_winback_1",      due: (_e, l) => l <= -3 },
  { id: "gmc_winback_2",      due: (_e, l) => l <= -10 },
  { id: "gmc_winback_offer",  due: (_e, l) => l <= -21 },
];

// CTA par template : offre -50% pour les jalons qui l'annoncent, page d'abonnement
// pour les relances sans offre, cockpit pour l'engagement + le welcome payant.
const OFFER_IDS = new Set<GmcEmailId>([
  "gmc_trial_j3", "gmc_trial_j1", "gmc_trial_ended", "gmc_winback_offer",
]);
const SUBSCRIBE_IDS = new Set<GmcEmailId>([
  "gmc_trial_j7", "gmc_winback_1", "gmc_winback_2", "gmc_dunning", "gmc_goodbye",
]);
function ctaFor(id: GmcEmailId): string {
  if (OFFER_IDS.has(id)) return OFFER_URL;
  if (SUBSCRIBE_IDS.has(id)) return SUBSCRIBE_URL;
  return APP_URL;
}

type Sub = {
  user_id: string;
  status: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
};

// Choisit le template du non encore envoye pour un abonnement, selon son statut.
function pickTemplate(sub: Sub, already: Set<string>, now: number): GmcEmailId | null {
  switch (sub.status) {
    case "trial": {
      if (!sub.trial_started_at) return null;
      const e = Math.floor((now - new Date(sub.trial_started_at).getTime()) / DAY_MS);
      const l = sub.trial_ends_at
        ? Math.ceil((new Date(sub.trial_ends_at).getTime() - now) / DAY_MS)
        : 999;
      const due = TRIAL_MILESTONES.filter((m) => m.due(e, l));
      return due.find((m) => !already.has(m.id))?.id ?? null;
    }
    case "active":
      return already.has("gmc_paid_welcome") ? null : "gmc_paid_welcome";
    case "past_due":
      return already.has("gmc_dunning") ? null : "gmc_dunning";
    case "expired":
      return already.has("gmc_goodbye") ? null : "gmc_goodbye";
    default:
      return null;
  }
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn("[scheduler] RESEND_API_KEY manquant, email non envoye");
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!res.ok) {
    console.error(`[scheduler] Resend ${res.status}:`, await res.text());
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

  const { data: subs, error } = await sb
    .from("gmc_subscriptions")
    .select("user_id, status, trial_started_at, trial_ends_at")
    .in("status", ["trial", "active", "past_due", "expired"]);

  if (error) {
    console.error("[scheduler] query subs:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  const planned: { user_id: string; template_id: string; status: string; email?: string }[] = [];
  let sent = 0;

  for (const s of (subs ?? []) as Sub[]) {
    const { data: logs } = await sb
      .from("gmc_email_log")
      .select("template_id")
      .eq("user_id", s.user_id);
    const already = new Set((logs ?? []).map((l) => l.template_id as string));

    const tpl = pickTemplate(s, already, now);
    if (!tpl) continue;

    planned.push({ user_id: s.user_id, template_id: tpl, status: s.status });
    if (dry) continue;

    // Reservation log-first (idempotente) : sur conflit unique => deja envoye, on saute.
    const { data: ins, error: insErr } = await sb
      .from("gmc_email_log")
      .insert({ user_id: s.user_id, template_id: tpl })
      .select("id")
      .maybeSingle();
    if (insErr || !ins) continue;

    const { data: ud } = await sb.auth.admin.getUserById(s.user_id);
    const email = ud?.user?.email ?? "";
    const um = (ud?.user?.user_metadata ?? {}) as Record<string, string>;
    const prenom = (um.first_name || (um.full_name || um.name || "").split(" ")[0] || "").trim();

    let nomChantier = "";
    const { data: ch } = await sb
      .from("chantiers")
      .select("nom")
      .eq("user_id", s.user_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (ch?.nom) nomChantier = ch.nom as string;

    if (!email) {
      await sb.from("gmc_email_log").delete().eq("id", ins.id); // rollback
      continue;
    }

    const { subject, html } = renderGmcEmail(tpl, {
      prenom,
      nom_chantier: nomChantier,
      lien_cta: ctaFor(tpl),
    });
    const ok = await sendEmail(email, subject, html);
    if (ok) {
      sent++;
      planned[planned.length - 1].email = email;
    } else {
      await sb.from("gmc_email_log").delete().eq("id", ins.id); // echec => retentera
    }
  }

  return new Response(JSON.stringify({ dry, candidates: planned.length, sent, planned }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
