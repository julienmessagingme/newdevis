// ============================================================
// Email Resend — notification user après revue expert (validation/correction/rejet).
//
// Déclenché à la fin de /api/admin/reviews/[id]/decide.ts ET de
// scripts/admin-correct-review.ts. Tient enfin la promesse du bandeau bleu
// "Validation expert en cours sous 24h — vous serez notifié par email".
//
// Pattern Resend identique à supabase/functions/vmd-on-signup/index.ts
// (RESEND_API_KEY_VMD prioritaire, fallback RESEND_API_KEY, expéditeur
// bonjour@verifiermondevis.fr).
//
// Best-effort : ne throw jamais. Si Resend plante, on log + on retourne false.
// ============================================================

export type ReviewAction = "validated" | "corrected" | "rejected";

export interface ReviewEmailInput {
  toEmail: string;
  prenom?: string | null;
  fileName: string | null;
  analysisId: string;
  action: ReviewAction;
  verdictDecisionnel?: string | null; // signer | signer_avec_negociation | ne_pas_signer
  verdictGlobal?: string | null; // dans_la_norme | a_negocier | a_risque | ...
}

const SUBJECT_BY_ACTION: Record<ReviewAction, string> = {
  validated: "✓ Votre analyse a été confirmée par notre expert",
  corrected: "✓ Votre analyse a été ajustée par notre expert",
  rejected: "✓ Votre analyse a été confirmée par notre expert",
};

const HERO_BY_ACTION: Record<ReviewAction, { title: string; intro: string }> = {
  validated: {
    title: "Votre analyse est confirmée",
    intro:
      "Notre expert vient de valider l'analyse IA de votre devis. Le verdict que vous avez consulté est juste — vous pouvez vous y fier pour la suite.",
  },
  corrected: {
    title: "Votre analyse a été ajustée",
    intro:
      "Notre expert vient de relire votre analyse et a ajusté le verdict pour mieux refléter la réalité de votre devis. Consultez la nouvelle version.",
  },
  rejected: {
    title: "Votre analyse est confirmée",
    intro:
      "Notre expert vient de relire votre analyse. Le signal qui avait déclenché une revue manuelle s'est avéré un faux positif — le verdict initial est correct.",
  },
};

const VERDICT_DECISIONNEL_LABEL: Record<string, string> = {
  signer: "Vous pouvez signer",
  signer_avec_negociation: "À négocier avant signature",
  ne_pas_signer: "Ne pas signer en l'état",
};

const VERDICT_BADGE_COLOR: Record<string, { bg: string; fg: string; border: string }> = {
  signer: { bg: "#ECFDF5", fg: "#065F46", border: "#10B981" },
  signer_avec_negociation: { bg: "#FFFBEB", fg: "#92400E", border: "#F59E0B" },
  ne_pas_signer: { bg: "#FEF2F2", fg: "#991B1B", border: "#EF4444" },
};

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml(input: ReviewEmailInput): string {
  const { prenom, fileName, analysisId, action, verdictDecisionnel } = input;
  const hero = HERO_BY_ACTION[action];
  const decisionnel = verdictDecisionnel ?? "signer";
  const verdictLabel = VERDICT_DECISIONNEL_LABEL[decisionnel] ?? "Verdict mis à jour";
  const colors = VERDICT_BADGE_COLOR[decisionnel] ?? VERDICT_BADGE_COLOR.signer;

  const link = `https://www.verifiermondevis.fr/analyse/${encodeURIComponent(analysisId)}`;
  const greeting = prenom
    ? `Bonjour <strong style="color:#0E1730;">${esc(prenom)}</strong>,`
    : `Bonjour,`;

  const fileLine = fileName
    ? `<p style="margin:0 0 18px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:14px;color:#6B7280;line-height:1.65;">Document analysé : <strong style="color:#374151;">${esc(fileName)}</strong></p>`
    : "";

  const verdictBadge = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 24px;">
      <tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:${colors.bg};border:2px solid ${colors.border};border-radius:12px;">
          <tr><td style="padding:14px 28px;">
            <p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:18px;font-weight:700;color:${colors.fg};line-height:1.3;">${esc(verdictLabel)}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>`;

  const cta = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;">
      <tr><td align="center">
        <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${link}" style="height:52px;v-text-anchor:middle;width:300px;" arcsize="22%" stroke="f" fillcolor="#2563EB"><w:anchorlock/><center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:17px;font-weight:700;">Consulter mon analyse</center></v:roundrect><![endif]-->
        <!--[if !mso]><!-->
        <a href="${link}" style="display:inline-block;background:#2563EB;color:#FFFFFF;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:17px;font-weight:700;text-decoration:none;padding:15px 40px;border-radius:12px;line-height:1.2;mso-hide:all;">Consulter mon analyse</a>
        <!--<![endif]-->
      </td></tr>
    </table>`;

  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(SUBJECT_BY_ACTION[action])}</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
<div style="display:none;font-size:1px;color:#F3F4F6;max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(hero.intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F3F4F6;">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <tr><td style="padding:32px 32px 8px;text-align:center;">
        <img src="https://www.verifiermondevis.fr/email/logo-vmd-icon.png" alt="VerifierMonDevis" width="48" height="48" style="border:0;display:inline-block;"/>
      </td></tr>
      <tr><td style="padding:8px 32px 32px;">
        <p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:15px;color:#4B5563;line-height:1.78;">${greeting}</p>
        <h1 style="margin:14px 0 12px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:24px;font-weight:700;color:#0E1730;line-height:1.3;letter-spacing:-0.02em;">${esc(hero.title)}</h1>
        ${fileLine}
        <p style="margin:0 0 8px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:15px;color:#4B5563;line-height:1.78;">${esc(hero.intro)}</p>
        ${verdictBadge}
        ${cta}
        <p style="margin:24px 0 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:13px;color:#6B7280;line-height:1.65;text-align:center;">Vous pouvez répondre directement à cet email si vous avez une question.</p>
      </td></tr>
      <tr><td style="padding:18px 32px 28px;border-top:1px solid #E5E7EB;background:#F9FAFB;">
        <p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:12px;color:#9CA3AF;line-height:1.6;text-align:center;">VerifierMonDevis.fr — l'expert qui vérifie vos devis avant signature.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/**
 * Envoie l'email de notification au user après une revue expert.
 * Best-effort : ne throw jamais. Retourne `true` si Resend a accepté la requête,
 * `false` sinon. À appeler en fire-and-forget après le UPDATE analyses.
 */
export async function sendReviewNotificationEmail(input: ReviewEmailInput): Promise<boolean> {
  const RESEND_API_KEY =
    process.env.RESEND_API_KEY_VMD ?? process.env.RESEND_API_KEY ?? "";
  if (!RESEND_API_KEY) {
    console.warn("[reviewEmail] RESEND_API_KEY manquant — email non envoyé");
    return false;
  }
  if (!input.toEmail || !input.toEmail.includes("@")) {
    console.warn(`[reviewEmail] email destinataire invalide : "${input.toEmail}"`);
    return false;
  }

  const subject = SUBJECT_BY_ACTION[input.action];
  const html = buildHtml(input);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "VerifierMonDevis <bonjour@verifiermondevis.fr>",
        to: [input.toEmail],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      console.error(`[reviewEmail] Resend ${res.status}:`, await res.text());
      return false;
    }
    console.log(
      `[reviewEmail] envoyé à ${input.toEmail} (action=${input.action}, analysis=${input.analysisId.slice(0, 8)})`,
    );
    return true;
  } catch (e) {
    console.error("[reviewEmail] fetch failed:", e instanceof Error ? e.message : String(e));
    return false;
  }
}
