// ============================================================
// VMD — vmd-on-signup
// Declenchee par un Database Webhook Supabase sur INSERT de vmd_signups.
// Envoie via Resend : (1) la notif admin (Julien + Johan), (2) le welcome au
// nouvel inscrit (template `vmd_welcome` via _shared/vmd-emails.ts).
// Resend : RESEND_API_KEY_VMD (nouveau compte Resend VMD ; domaine
// verifiermondevis.fr a verifier => expediteur bonjour@verifiermondevis.fr).
// Fallback sur RESEND_API_KEY (compte historique) si la cle VMD n'est pas posee.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderVmdEmail } from "../_shared/vmd-emails.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY_VMD") ?? Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Secret partage optionnel (header x-vmd-secret). Tant qu'il n'est pas pose, ouvert.
const SIGNUP_SECRET  = Deno.env.get("VMD_SIGNUP_SECRET") ?? "";

const ADMIN_EMAILS = ["julien@messagingme.fr", "bridey.johan@gmail.com"];
const FROM         = "VerifierMonDevis <bonjour@verifiermondevis.fr>";

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
    console.warn("[vmd-on-signup] RESEND_API_KEY_VMD manquant, email non envoye");
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
    console.error(`[vmd-on-signup] Resend ${res.status}:`, await res.text());
  }
}

Deno.serve(async (req: Request) => {
  if (SIGNUP_SECRET && req.headers.get("x-vmd-secret") !== SIGNUP_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  try {
    const payload = await req.json();
    // Database Webhook payload : { type:'INSERT', table:'vmd_signups', record:{...} }
    const rec = payload?.record ?? {};
    const userId: string | undefined = rec.user_id;
    if (!userId) return new Response("no user_id", { status: 200 });

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    // Donnees fraiches via auth (fallback sur le record du webhook).
    const { data } = await supabase.auth.admin.getUserById(userId);
    const user   = data?.user;
    const meta   = (user?.user_metadata ?? {}) as Record<string, string>;
    const email  = user?.email ?? rec.email ?? "";
    const prenom = (meta.first_name || (meta.full_name || meta.name || "").split(" ")[0] || rec.prenom || "").trim();
    const phone  = meta.phone ?? rec.phone ?? "";
    const source = rec.signup_source ?? meta.signup_source ?? "verifiermondevis";

    // 1) Notif admin (HTML simple, entrees user echappees)
    await sendEmail(
      ADMIN_EMAILS,
      `Nouvelle inscription VerifierMonDevis : ${email || "(email inconnu)"}`,
      `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0E1730">
         <h2 style="margin:0 0 12px">Nouvelle inscription VerifierMonDevis</h2>
         <ul style="line-height:1.7;padding-left:18px">
           <li><b>Email</b> : ${esc(email)}</li>
           <li><b>Prenom</b> : ${esc(prenom)}</li>
           <li><b>Telephone</b> : ${esc(phone)}</li>
           <li><b>Source</b> : ${esc(source)}</li>
           <li><b>Date</b> : ${new Date().toISOString()}</li>
         </ul>
       </div>`,
    );

    // 2) Welcome utilisateur — template `vmd_welcome`.
    if (email) {
      const { subject, html } = renderVmdEmail("vmd_welcome", { prenom });
      await sendEmail([email], subject, html);
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    // 200 volontaire : eviter que le webhook retente en boucle sur une erreur applicative.
    console.error("[vmd-on-signup]", (e as Error).message);
    return new Response("error", { status: 200 });
  }
});
