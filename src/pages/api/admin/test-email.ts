export const prerender = false;

/**
 * POST /api/admin/test-email
 *
 * 2026-09-10 (demande Johan) — SAVOIR AVANT, PAS APRÈS, SI L'E-MAIL PART.
 *
 * Le 09/09, `decide.ts` s'est mis à retourner la raison exacte d'un échec
 * d'envoi et l'écran de revue à l'afficher. Utile — mais on ne l'apprend qu'en
 * traitant une vraie revue, donc sur le dos d'un vrai utilisateur. Le jour où un
 * artisan est venu tester son propre devis, la question s'est posée autrement :
 * « il faut qu'on soit pro et vérifier qu'il parte bien ».
 *
 * Cette route envoie la notification de revue **à l'adresse de l'admin
 * connecté**, par EXACTEMENT le même chemin de code que l'envoi réel — même
 * fonction, même clé, même expéditeur, même gabarit. Ce qu'elle renvoie vaut
 * donc pour les vrais envois.
 *
 * ⚠️ Elle n'écrit rien et ne touche à aucune analyse : ni `review_status`, ni
 * `conclusion_ia`, ni `analysis_corrections`. C'est un test d'acheminement, pas
 * une décision.
 *
 * ⚠️ Le destinataire n'est JAMAIS choisi par l'appelant. Il est lu dans le jeton
 * de l'admin connecté — sans quoi la route deviendrait un moyen d'envoyer un
 * e-mail à n'importe qui depuis notre domaine.
 */

import type { APIRoute } from "astro";
import { jsonOk, jsonError, requireAuth, optionsResponse } from "@/lib/api/apiHelpers";
import { sendReviewNotificationEmail } from "@/lib/integrations/reviewNotificationEmail";
import { diagnosticCleResend } from "@/lib/integrations/resendKey";

export const POST: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;

  const { data: roleData } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleData) return jsonError("Accès refusé", 403);

  const destinataire = ctx.user.email;
  if (!destinataire) {
    return jsonOk({
      ok: false,
      raison: "votre compte admin n'a pas d'adresse email — test impossible",
      destinataire: null,
    });
  }

  const resultat = await sendReviewNotificationEmail({
    toEmail: destinataire,
    prenom: null,
    // Le gabarit attend un nom de fichier et un identifiant d'analyse ; on les
    // rend explicitement reconnaissables pour que le mail reçu ne puisse pas
    // être confondu avec une vraie notification.
    fileName: "TEST D'ACHEMINEMENT — aucune analyse concernée",
    analysisId: "00000000-0000-0000-0000-000000000000",
    action: "validated",
  });

  return jsonOk({
    ...resultat,
    destinataire,
    // Présence et forme de la clé, jamais sa valeur : de quoi distinguer
    // « aucune clé » de « clé présente mais refusée par Resend ».
    cle: diagnosticCleResend(),
  });
};

export const OPTIONS: APIRoute = () => optionsResponse("POST,OPTIONS");
