// ============================================================
// GMC — gmc-email-scheduler
// Cron quotidien (pg_cron) : envoie la séquence d'engagement de l'essai gratuit,
// pilotée par le TEMPS (jours depuis trial_started_at), sans dépendance Stripe.
//
// Phase A (live) : 4 emails d'engagement qui poussent vers le cockpit.
//   J1  → gmc_activate · J3 → gmc_value_features · J7 → gmc_trust · J14 → gmc_midtrial
// Phase B (avec Stripe, plus tard) : conversion (J-7/J-3/J-1/fin), winback, série payant.
//
// Anti-doublon : table gmc_email_log (unique user_id+template_id), réservation
// "log-first" avant envoi (rollback si l'envoi échoue). 1 email/user/run max
// (le plus ancien jalon dû non encore envoyé) => pas de rafale de rattrapage.
// Dry-run : POST body {"dry":true} renvoie le plan sans rien envoyer ni logger.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderGmcEmail, type GmcEmailId } from "../_shared/gmc-emails.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM           = "GererMonChantier <bonjour@gerermonchantier.fr>";
const APP_URL        = "https://www.gerermonchantier.fr/mon-chantier";
const DAY_MS         = 86_400_000;

// Séquence d'engagement (essai actif). Ordre croissant de jour.
const SCHEDULE: { day: number; id: GmcEmailId }[] = [
  { day: 1,  id: "gmc_activate" },
  { day: 3,  id: "gmc_value_features" },
  { day: 7,  id: "gmc_trust" },
  { day: 14, id: "gmc_midtrial" },
];

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
    .select("user_id, trial_started_at")
    .eq("status", "trial")
    .not("trial_started_at", "is", null);

  if (error) {
    console.error("[scheduler] query subs:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  const planned: { user_id: string; template_id: string; elapsed: number; email?: string }[] = [];
  let sent = 0;

  for (const s of subs ?? []) {
    const elapsed = Math.floor((now - new Date(s.trial_started_at as string).getTime()) / DAY_MS);
    const due = SCHEDULE.filter((x) => x.day <= elapsed);
    if (due.length === 0) continue;

    const { data: logs } = await sb
      .from("gmc_email_log")
      .select("template_id")
      .eq("user_id", s.user_id);
    const already = new Set((logs ?? []).map((l) => l.template_id as string));

    const next = due.find((x) => !already.has(x.id)); // plus ancien jalon non envoyé
    if (!next) continue;

    planned.push({ user_id: s.user_id as string, template_id: next.id, elapsed });
    if (dry) continue;

    // Réservation log-first (idempotente) : sur conflit unique => déjà envoyé, on saute.
    const { data: ins, error: insErr } = await sb
      .from("gmc_email_log")
      .insert({ user_id: s.user_id, template_id: next.id })
      .select("id")
      .maybeSingle();
    if (insErr || !ins) continue;

    const { data: ud } = await sb.auth.admin.getUserById(s.user_id as string);
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

    const { subject, html } = renderGmcEmail(next.id, {
      prenom,
      nom_chantier: nomChantier,
      lien_cta: APP_URL,
    });
    const ok = await sendEmail(email, subject, html);
    if (ok) {
      sent++;
      planned[planned.length - 1].email = email;
    } else {
      await sb.from("gmc_email_log").delete().eq("id", ins.id); // échec => retentera au prochain run
    }
  }

  return new Response(JSON.stringify({ dry, candidates: planned.length, sent, planned }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
