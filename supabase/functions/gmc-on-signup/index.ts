// ============================================================
// GMC — gmc-on-signup
// Declenchee par un Database Webhook Supabase sur INSERT de gmc_subscriptions.
// Envoie via Resend : (1) la notif admin a nous, (2) le welcome au nouvel inscrit.
// Resend : RESEND_API_KEY deja configuree (cf. system-alerts). Domaine
// gerermonchantier.fr verifie => expediteur bonjour@gerermonchantier.fr.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY  = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ADMIN_EMAILS = ["julien@messagingme.fr", "bridey.johan@gmail.com"];
const FROM         = "GererMonChantier <bonjour@gerermonchantier.fr>";
const APP_URL      = "https://gerermonchantier.fr/mon-chantier";

async function sendEmail(to: string[], subject: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn("[gmc-on-signup] RESEND_API_KEY manquant, email non envoye");
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) {
    console.error(`[gmc-on-signup] Resend ${res.status}:`, await res.text());
  }
}

Deno.serve(async (req: Request) => {
  try {
    const payload = await req.json();
    // Database Webhook payload : { type:'INSERT', table:'gmc_subscriptions', record:{...} }
    const userId: string | undefined = payload?.record?.user_id;
    if (!userId) return new Response("no user_id", { status: 200 });

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !data?.user) {
      console.error("[gmc-on-signup] user introuvable", error?.message);
      return new Response("user not found", { status: 200 });
    }
    const user   = data.user;
    const email  = user.email ?? "";
    const meta   = (user.user_metadata ?? {}) as Record<string, string>;
    const prenom = meta.first_name ?? "";
    const nom    = meta.last_name ?? "";
    const source = meta.signup_source ?? payload?.record?.signup_source ?? "";

    // 1) Notif admin (HTML simple, pas besoin de template design)
    await sendEmail(
      ADMIN_EMAILS,
      `Nouvelle inscription GMC : ${email || "(email inconnu)"}`,
      `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0E1730">
         <h2 style="margin:0 0 12px">Nouvelle inscription GererMonChantier</h2>
         <ul style="line-height:1.7;padding-left:18px">
           <li><b>Email</b> : ${email}</li>
           <li><b>Nom</b> : ${prenom} ${nom}</li>
           <li><b>Telephone</b> : ${meta.phone ?? ""}</li>
           <li><b>Source</b> : ${source}</li>
           <li><b>Date</b> : ${new Date().toISOString()}</li>
         </ul>
       </div>`,
    );

    // 2) Welcome utilisateur
    // TODO : remplacer le HTML ci-dessous par le template `gmc_welcome` de Claude Design.
    if (email) {
      await sendEmail(
        [email],
        "Bienvenue sur GererMonChantier, votre mois offert demarre",
        `<div style="font-family:Arial,sans-serif;font-size:15px;color:#0E1730;line-height:1.6">
           <p>Bonjour ${prenom || ""},</p>
           <p>Bienvenue ! Votre <b>mois d'essai gratuit</b> (sans carte bancaire) vient de demarrer.
              Decrivez votre chantier, et votre Pilote IA structure les lots, le planning et le budget.</p>
           <p><a href="${APP_URL}" style="display:inline-block;background:#F58A06;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px">Acceder a mon chantier</a></p>
           <p style="color:#677084;font-size:13px">A tout moment, vous gardez le dernier mot.</p>
         </div>`,
      );
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    // 200 volontaire : eviter que le webhook retente en boucle sur une erreur applicative.
    console.error("[gmc-on-signup]", (e as Error).message);
    return new Response("error", { status: 200 });
  }
});
