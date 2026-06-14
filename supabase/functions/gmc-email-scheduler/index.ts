// ============================================================
// GMC — gmc-email-scheduler
// Cron quotidien (pg_cron) : pilote TOUT le cycle de vie email, d'apres le statut
// + les dates de gmc_subscriptions (aucun appel Stripe ici ; l'edge function a la
// cle Resend, contrairement a Vercel ou le webhook ne peut pas envoyer).
//
//   trial    : engagement (J1/3/7/14) + reengage (pas connecte >5j, hors conversion)
//              + conversion (J-7/J-3/J-1/fin, -50% des J-3) + winback (J+3/10/21)
//   active   : paid_welcome (immediat) -> paid_onboard (J+2) -> paid_checkin (J+14)
//              -> multi_nudge (Essentiel, J+30) ; renewal_notice (annuels, J-3, par periode)
//   past_due : dunning   ·   expired : winback (essai expire) OU goodbye (abonne resilie)
//   tous     : upsell_multi sur tentative de 2e chantier (flag multi_intent_at pose par le gate)
//
// Le cron `gmc-trial-expire-daily` flippe trial -> expired a J30 (statut propre). La
// suite winback (POST_TRIAL) est pilotee par `l` (jours avant trial_ends_at) et rejouable
// que la ligne soit encore 'trial' ou deja 'expired' : le flip ne casse jamais la sequence.
// goodbye ne part QUE pour un abonne payant resilie (stripe_subscription_id present),
// jamais pour un essai expire.
//
// Ancres temporelles "payant" = sent_at du gmc_paid_welcome (pas de colonne dediee).
// Activite "reengage" = auth.users.last_sign_in_at (vraie derniere connexion).
// Anti-doublon : gmc_email_log (unique user_id+template_id), reservation log-first.
// Le renewal_notice se dedup PAR PERIODE via un logId suffixe par la date d'echeance.
// 1 email/user/run. Dry-run : POST {"dry":true}.
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
const MULTI_URL      = `${BASE}/gmc-abonnement?plan=multi`;
// Lien -50% : ouvre la checkout Essentiel mensuel avec le coupon applique.
const OFFER_URL      = `${BASE}/gmc-abonnement?plan=essentiel&interval=month&offer=1`;
const DAY_MS         = 86_400_000;

// Jalons de l'essai AVANT echeance (status='trial').
// e = jours depuis trial_started_at ; l = jours avant trial_ends_at.
const PRE_TRIAL: { id: GmcEmailId; due: (e: number, l: number) => boolean }[] = [
  { id: "gmc_activate",       due: (e) => e >= 1 },
  { id: "gmc_value_features", due: (e) => e >= 3 },
  { id: "gmc_trust",          due: (e) => e >= 7 },
  { id: "gmc_midtrial",       due: (e) => e >= 14 },
  { id: "gmc_trial_j7",       due: (_e, l) => l <= 7 },
  { id: "gmc_trial_j3",       due: (_e, l) => l <= 3 },
  { id: "gmc_trial_j1",       due: (_e, l) => l <= 1 },
];

// Jalons APRES echeance de l'essai. Pilotes par `l` seul (jours avant trial_ends_at, negatif)
// donc rejouables que la ligne soit encore 'trial' (cron pas encore passe) ou deja 'expired'.
const POST_TRIAL: { id: GmcEmailId; due: (l: number) => boolean }[] = [
  { id: "gmc_trial_ended",   due: (l) => l <= 0 },
  { id: "gmc_winback_1",     due: (l) => l <= -3 },
  { id: "gmc_winback_2",     due: (l) => l <= -10 },
  { id: "gmc_winback_offer", due: (l) => l <= -21 },
];

function ctaFor(id: GmcEmailId): string {
  switch (id) {
    case "gmc_trial_j3": case "gmc_trial_j1": case "gmc_trial_ended": case "gmc_winback_offer":
      return OFFER_URL; // -50% applique
    case "gmc_upsell_multi": case "gmc_multi_nudge":
      return MULTI_URL;
    case "gmc_trial_j7": case "gmc_winback_1": case "gmc_winback_2":
    case "gmc_dunning": case "gmc_goodbye": case "gmc_renewal_notice":
      return SUBSCRIBE_URL;
    default:
      return APP_URL; // activate/value/trust/midtrial/reengage/paid_welcome/paid_onboard/paid_checkin
  }
}

function fmtDateFR(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return "";
  }
}

type Sub = {
  user_id: string;
  status: string;
  plan: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  multi_intent_at: string | null;
  stripe_subscription_id: string | null;
};

type Ctx = { hasChantier: boolean; lastSeenMs: number | null; paidWelcomeSentMs: number | null };
type Pick = { id: GmcEmailId; logId: string; vars?: Record<string, string> };

// Choisit l'email du non envoye pour un abonnement, selon statut + dates + contexte.
function pickTemplate(sub: Sub, already: Set<string>, now: number, ctx: Ctx): Pick | null {
  const isMulti = (sub.status === "active" || sub.status === "past_due") && sub.plan === "gmc_multi";

  // 0. Upsell Multi — tentative de 2e chantier (signal fort, prioritaire). Tous statuts non-Multi.
  if (sub.multi_intent_at && !isMulti && !already.has("gmc_upsell_multi")) {
    return { id: "gmc_upsell_multi", logId: "gmc_upsell_multi" };
  }

  // Jours avant la fin d'essai (negatif = depasse). Sert au trial ET au winback post-essai.
  const l = sub.trial_ends_at ? Math.ceil((new Date(sub.trial_ends_at).getTime() - now) / DAY_MS) : 999;

  switch (sub.status) {
    case "trial": {
      if (!sub.trial_started_at) return null;
      const e = Math.floor((now - new Date(sub.trial_started_at).getTime()) / DAY_MS);

      // Reengage : un chantier existe mais l'utilisateur ne s'est pas connecte depuis >5j,
      // hors phase conversion (l>7), une seule fois.
      if (ctx.hasChantier && ctx.lastSeenMs && now - ctx.lastSeenMs > 5 * DAY_MS
          && e >= 5 && l > 7 && !already.has("gmc_reengage")) {
        return { id: "gmc_reengage", logId: "gmc_reengage" };
      }

      const ids = [
        ...PRE_TRIAL.filter((m) => m.due(e, l)).map((m) => m.id),
        ...POST_TRIAL.filter((m) => m.due(l)).map((m) => m.id),
      ];
      const next = ids.find((id) => !already.has(id));
      return next ? { id: next, logId: next } : null;
    }
    case "active": {
      if (!already.has("gmc_paid_welcome")) return { id: "gmc_paid_welcome", logId: "gmc_paid_welcome" };
      const anchor = ctx.paidWelcomeSentMs;
      if (anchor) {
        const days = (now - anchor) / DAY_MS;
        if (days >= 2 && !already.has("gmc_paid_onboard")) return { id: "gmc_paid_onboard", logId: "gmc_paid_onboard" };
        if (days >= 14 && !already.has("gmc_paid_checkin")) return { id: "gmc_paid_checkin", logId: "gmc_paid_checkin" };
        if (days >= 30 && sub.plan === "gmc_essentiel" && !already.has("gmc_multi_nudge")) {
          return { id: "gmc_multi_nudge", logId: "gmc_multi_nudge" };
        }
      }
      // Renouvellement : annuels uniquement (le mensuel auto-renew = bruit), J-3, une fois par periode.
      if (sub.current_period_end && anchor) {
        const endMs = new Date(sub.current_period_end).getTime();
        const annual = endMs - anchor > 180 * DAY_MS;
        const daysToRenew = (endMs - now) / DAY_MS;
        if (annual && daysToRenew <= 3 && daysToRenew > -1) {
          const logId = `gmc_renewal_notice:${new Date(sub.current_period_end).toISOString().slice(0, 10)}`;
          if (!already.has(logId)) {
            const montant = sub.plan === "gmc_multi" ? "210 € / an" : "120 € / an";
            return { id: "gmc_renewal_notice", logId, vars: { montant, date_renouvellement: fmtDateFR(endMs) } };
          }
        }
      }
      return null;
    }
    case "past_due":
      return already.has("gmc_dunning") ? null : { id: "gmc_dunning", logId: "gmc_dunning" };
    case "expired": {
      // Abonne payant resilie -> goodbye. Essai expire jamais paye -> suite winback (POST_TRIAL).
      if (sub.stripe_subscription_id) {
        return already.has("gmc_goodbye") ? null : { id: "gmc_goodbye", logId: "gmc_goodbye" };
      }
      if (sub.trial_ends_at) {
        const next = POST_TRIAL.filter((m) => m.due(l)).map((m) => m.id).find((id) => !already.has(id));
        return next ? { id: next, logId: next } : null;
      }
      return null;
    }
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
    .select("user_id, status, plan, trial_started_at, trial_ends_at, current_period_end, multi_intent_at, stripe_subscription_id")
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
      .select("template_id, sent_at")
      .eq("user_id", s.user_id);
    const already = new Set((logs ?? []).map((l) => l.template_id as string));
    const pw = (logs ?? []).find((l) => l.template_id === "gmc_paid_welcome");
    const paidWelcomeSentMs = pw?.sent_at ? new Date(pw.sent_at as string).getTime() : null;

    // Utilisateur : email + prenom + derniere connexion (last_sign_in_at = activite reelle,
    // signal du reengage). Pas d'email => rien a envoyer, on saute.
    const { data: ud } = await sb.auth.admin.getUserById(s.user_id);
    const email = ud?.user?.email ?? "";
    if (!email) continue;
    const um = (ud?.user?.user_metadata ?? {}) as Record<string, string>;
    const prenom = (um.first_name || (um.full_name || um.name || "").split(" ")[0] || "").trim();
    const lastSeenMs = ud?.user?.last_sign_in_at ? new Date(ud.user.last_sign_in_at as string).getTime() : null;

    // Premier chantier : nom (vars email) + presence (reengage).
    const { data: ch } = await sb
      .from("chantiers")
      .select("nom")
      .eq("user_id", s.user_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const nomChantier = (ch?.nom as string) ?? "";

    const pick = pickTemplate(s, already, now, { hasChantier: !!ch, lastSeenMs, paidWelcomeSentMs });
    if (!pick) continue;

    planned.push({ user_id: s.user_id, template_id: pick.logId, status: s.status });
    if (dry) continue;

    // Reservation log-first (idempotente) : sur conflit unique => deja envoye, on saute.
    const { data: ins, error: insErr } = await sb
      .from("gmc_email_log")
      .insert({ user_id: s.user_id, template_id: pick.logId })
      .select("id")
      .maybeSingle();
    if (insErr || !ins) continue;

    const { subject, html } = renderGmcEmail(pick.id, {
      prenom,
      nom_chantier: nomChantier,
      lien_cta: ctaFor(pick.id),
      ...(pick.vars ?? {}),
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
