// ============================================================
// GMC — gmc-on-signup
// Declenchee par un Database Webhook Supabase sur INSERT de gmc_subscriptions.
// Envoie via Resend : (1) la notif admin a nous, (2) le welcome au nouvel inscrit
// (template Claude Design `gmc_welcome` via _shared/gmc-emails.ts).
// Resend : RESEND_API_KEY deja configuree (cf. system-alerts). Domaine
// gerermonchantier.fr verifie => expediteur bonjour@gerermonchantier.fr.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderGmcEmail } from "../_shared/gmc-emails.ts";

const RESEND_API_KEY  = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Secret partage optionnel : si pose (env GMC_SIGNUP_SECRET) + header x-gmc-secret
// configure sur la webhook, on rejette les appels non signes. Tant qu'il n'est pas
// pose, la fonction reste ouverte (= comportement actuel, non bloquant).
const SIGNUP_SECRET   = Deno.env.get("GMC_SIGNUP_SECRET") ?? "";

const ADMIN_EMAILS = ["julien@messagingme.fr", "bridey.johan@gmail.com"];
const FROM         = "GererMonChantier <bonjour@gerermonchantier.fr>";
const APP_URL      = "https://gerermonchantier.fr/mon-chantier";

// Echappe les entrees utilisateur avant injection dans le HTML des emails.
function esc(s: unknown): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

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
  // Auth optionnelle par secret partage (cf. SIGNUP_SECRET).
  if (SIGNUP_SECRET && req.headers.get("x-gmc-secret") !== SIGNUP_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

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

    // 1) Notif admin (HTML simple, entrees user echappees)
    await sendEmail(
      ADMIN_EMAILS,
      `Nouvelle inscription GMC : ${email || "(email inconnu)"}`,
      `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0E1730">
         <h2 style="margin:0 0 12px">Nouvelle inscription GererMonChantier</h2>
         <ul style="line-height:1.7;padding-left:18px">
           <li><b>Email</b> : ${esc(email)}</li>
           <li><b>Nom</b> : ${esc(prenom)} ${esc(nom)}</li>
           <li><b>Telephone</b> : ${esc(meta.phone)}</li>
           <li><b>Source</b> : ${esc(source)}</li>
           <li><b>Date</b> : ${new Date().toISOString()}</li>
         </ul>
       </div>`,
    );

    // 2) Welcome utilisateur — template Claude Design `gmc_welcome`.
    // Le chantier n'est en general pas encore cree au signup => nom_chantier vide
    // => le template retombe sur "votre chantier".
    if (email) {
      const { subject, html } = renderGmcEmail("gmc_welcome", {
        prenom,
        nom_chantier: meta.nom_chantier ?? "",
        lien_cta: APP_URL,
        lien_desinscription: "mailto:contact@gerermonchantier.fr?subject=Désinscription",
      });
      await sendEmail([email], subject, html);
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    // 200 volontaire : eviter que le webhook retente en boucle sur une erreur applicative.
    console.error("[gmc-on-signup]", (e as Error).message);
    return new Response("error", { status: 200 });
  }
});
