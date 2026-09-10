export const prerender = false;

/**
 * POST /api/admin/rattrapage-notifications
 *
 * 2026-09-10 — PRÉVENIR CEUX QUI NE L'ONT JAMAIS ÉTÉ.
 *
 * Entre le 29/06 et le 09/09, aucune notification de revue n'est partie : la clé
 * Resend présente dans Vercel venait d'un autre compte, où `verifiermondevis.fr`
 * n'est pas vérifié. Mesuré : 37 analyses relues par un humain, 30 utilisateurs,
 * tous joignables, aucun prévenu.
 *
 * ⚠️ **Pourquoi une route et non un script** : la clé Resend n'existe que dans
 * l'environnement Vercel. Un script local ne peut pas envoyer, et faire circuler
 * la clé pour qu'il le puisse serait un très mauvais échange.
 *
 * ── Trois décisions, et leurs raisons ──
 *
 * 1. **Seulement les analyses CORRIGÉES.** Écrire deux mois après pour annoncer
 *    « votre analyse était juste » n'apporte rien. Quand le contenu a réellement
 *    changé, le message garde sa valeur même tard.
 * 2. **Un seul message par personne**, sur son analyse corrigée la plus récente.
 *    Trois mails d'un coup ressembleraient à un incident, pas à une attention.
 * 3. **On dit le retard.** La date de relecture figure sur la page de
 *    l'utilisateur : laisser croire que la correction date du jour se verrait, et
 *    vaudrait moins que le silence.
 */

import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";
import { jsonOk, jsonError, requireAuth, optionsResponse } from "@/lib/api/apiHelpers";
import { sendReviewNotificationEmail } from "@/lib/integrations/reviewNotificationEmail";

/**
 * ⚠️ Date à partir de laquelle l'envoi normal refonctionne (clé ajoutée dans
 * Vercel, confirmée par le bouton « Tester l'envoi »). Les analyses statuées
 * depuis ONT été notifiées par le chemin habituel : les inclure enverrait un
 * second message, avec des excuses pour un retard qui n'a pas eu lieu. Cas réel
 * évité : le devis d'un artisan corrigé à 19 h 35, dont la notification était
 * partie dans la seconde.
 */
const NOTIFICATION_RETABLIE_LE = "2026-09-10";

/** Nos propres comptes : s'écrire des excuses à soi-même n'a aucun sens. */
const ADRESSES_INTERNES = new Set([
  "bridey.johan@gmail.com",
  "julien.dumas@gmail.com",
  "julien@messagingme.fr",
]);

/** Marqueur de déduplication, posé dans `vmd_email_log`. */
const TEMPLATE_ID = "rattrapage_revue_2026_09";

/**
 * ⚠️ Envoi par petits lots : une fonction serverless a un budget de quelques
 * secondes. Vingt envois d'affilée le dépasseraient, et un dépassement au
 * milieu d'une boucle d'e-mails est exactement ce qu'on ne veut pas. L'écran
 * rappelle la route tant qu'il reste des destinataires.
 */
const LOT = 8;

export const POST: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;

  const { data: roleData } = await ctx.supabase
    .from("user_roles").select("role")
    .eq("user_id", ctx.user.id).eq("role", "admin").maybeSingle();
  if (!roleData) return jsonError("Accès refusé", 403);

  const body = await request.json().catch(() => ({}));
  const simulation = body?.dry !== false;

  const admin = createClient(
    process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false } },
  );

  const { data: analyses, error } = await admin
    .from("analyses")
    .select("id,user_id,file_name,reviewed_at,conclusion_ia")
    .eq("review_status", "corrected")
    .lt("reviewed_at", NOTIFICATION_RETABLIE_LE)
    .order("reviewed_at", { ascending: false });
  if (error) return jsonError(error.message, 500);

  // Une seule analyse par utilisateur : la plus récemment corrigée.
  const parUtilisateur = new Map<string, (typeof analyses)[number]>();
  for (const a of analyses ?? []) if (!parUtilisateur.has(a.user_id)) parUtilisateur.set(a.user_id, a);

  const { data: dejaFaits } = await admin
    .from("vmd_email_log").select("user_id").eq("template_id", TEMPLATE_ID);
  const notifies = new Set((dejaFaits ?? []).map((r) => r.user_id));

  const candidats: Array<{ userId: string; email: string; prenom: string | null; a: (typeof analyses)[number] }> = [];
  for (const [userId, a] of parUtilisateur) {
    if (notifies.has(userId)) continue;
    const { data: u } = await admin.auth.admin.getUserById(userId);
    const email = u?.user?.email;
    if (!email || ADRESSES_INTERNES.has(email.toLowerCase())) continue;
    const meta = (u.user.user_metadata ?? {}) as Record<string, string>;
    const prenom =
      (meta.first_name || (meta.full_name || meta.name || "").split(" ")[0] || "").trim() || null;
    candidats.push({ userId, email, prenom, a });
  }

  if (simulation) {
    return jsonOk({
      simulation: true,
      restants: candidats.length,
      destinataires: candidats.map((c) => ({
        email: c.email,
        relu_le: c.a.reviewed_at,
        fichier: c.a.file_name,
      })),
    });
  }

  const dateFr = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "";

  const resultats: Array<{ email: string; ok: boolean; raison: string }> = [];
  for (const c of candidats.slice(0, LOT)) {
    const conclusion = typeof c.a.conclusion_ia === "string"
      ? JSON.parse(c.a.conclusion_ia)
      : (c.a.conclusion_ia as Record<string, unknown> | null);
    const r = await sendReviewNotificationEmail({
      toEmail: c.email,
      prenom: c.prenom,
      fileName: c.a.file_name ?? null,
      analysisId: c.a.id,
      action: "corrected",
      verdictDecisionnel: (conclusion as any)?.verdict_decisionnel ?? null,
      verdictGlobal: (conclusion as any)?.verdict_global ?? null,
      noteContexte:
        `Cette relecture a eu lieu le ${dateFr(c.a.reviewed_at)}. Notre message ne vous est jamais ` +
        `parvenu en raison d'un problème technique de notre côté, que nous venons de corriger — ` +
        `nous vous prions de nous en excuser.`,
    });
    // Journalisé APRÈS chaque envoi réussi, un par un : une interruption au
    // milieu du lot ne doit pas provoquer de doublon à la reprise. Sur un
    // rattrapage, écrire deux fois est pire que ne pas écrire.
    if (r.ok) {
      await admin.from("vmd_email_log").insert({ user_id: c.userId, template_id: TEMPLATE_ID });
    }
    resultats.push({ email: c.email, ok: r.ok, raison: r.raison });
  }

  return jsonOk({
    simulation: false,
    envoyes: resultats.filter((r) => r.ok).length,
    echecs: resultats.filter((r) => !r.ok).length,
    restants: Math.max(0, candidats.length - resultats.length),
    resultats,
  });
};

export const OPTIONS: APIRoute = () => optionsResponse("POST,OPTIONS");
