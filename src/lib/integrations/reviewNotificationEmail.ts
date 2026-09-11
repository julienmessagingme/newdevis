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

import { resendApiKey, diagnosticCleResend } from "./resendKey";

export type ReviewAction = "validated" | "corrected" | "rejected";

/**
 * Le resultat de l envoi, avec sa RAISON.
 *
 * Un booleen ne suffisait pas : quand Julien n a rien recu le 06/09, rien ne
 * permettait de dire si la cle manquait, si Resend avait refuse, ou si le mail
 * etait parti en indesirables. La raison remonte jusqu a l ecran de revue.
 */
export interface ResultatEnvoi {
  ok: boolean;
  raison: string;
}

export interface ReviewEmailInput {
  toEmail: string;
  prenom?: string | null;
  fileName: string | null;
  analysisId: string;
  action: ReviewAction;
  verdictDecisionnel?: string | null; // signer | signer_avec_negociation | ne_pas_signer
  verdictGlobal?: string | null; // dans_la_norme | a_negocier | a_risque | ...
  /**
   * 2026-09-10 — Phrase de contexte affichée sous l'intro.
   *
   * Créée pour le rattrapage des notifications jamais parties entre le 29/06 et
   * le 09/09 : 37 analyses relues par un humain, 30 utilisateurs, aucun prévenu.
   * Leur écrire deux mois plus tard en laissant croire que la relecture date du
   * jour serait pire que le silence — la date figure sur leur propre page. On
   * dit donc quand la relecture a eu lieu et pourquoi le message arrive tard.
   *
   * Champ générique et non « spécial rattrapage » : tout envoi différé ou
   * rejoué aura le même besoin.
   */
  noteContexte?: string | null;
}

export const subjectForAction = (action: ReviewAction): string => SUBJECT_BY_ACTION[action];

const SUBJECT_BY_ACTION: Record<ReviewAction, string> = {
  validated: "✓ Votre analyse a été confirmée par notre expert",
  corrected: "✓ Votre analyse a été ajustée par notre expert",
  rejected: "✓ Votre analyse a été confirmée par notre expert",
};

/**
 * 2026-09-11 (retour Johan) — `validated` et `rejected` disent à l'utilisateur
 * EXACTEMENT la même chose : un expert a relu, le verdict tient. La distinction
 * est INTERNE — elle dit si le déclencheur de revue était justifié, pas si
 * l'analyse est bonne — et elle n'a aucun sens pour le lecteur.
 *
 * 🔴 ON NE SE JUSTIFIE PAS. Le message de `rejected` annonçait « le signal qui
 * avait déclenché une revue manuelle s'est avéré un faux positif ». C'est notre
 * vocabulaire d'ingénierie : il nomme un mécanisme que le lecteur ignore, et il
 * l'invite à douter d'un verdict qu'on est précisément en train de lui
 * confirmer. Une bonne nouvelle n'a pas besoin d'exposer la plomberie qui l'a
 * produite.
 *
 * Le texte est donc PARTAGÉ, pas recopié : deux formulations jumelles
 * finiraient par diverger, et l'une des deux redeviendrait bavarde.
 */
const HERO_CONFIRME = {
  title: "Votre analyse est confirmée",
  intro:
    "Notre expert vient de relire votre analyse. Le verdict que vous avez consulté est confirmé — vous pouvez vous y fier pour la suite.",
};

const HERO_BY_ACTION: Record<ReviewAction, { title: string; intro: string }> = {
  validated: HERO_CONFIRME,
  corrected: {
    title: "Votre analyse a été ajustée",
    intro:
      "Notre expert vient de relire votre analyse et a ajusté le verdict pour mieux refléter la réalité de votre devis. Consultez la nouvelle version.",
  },
  rejected: HERO_CONFIRME,
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

/**
 * 2026-09-11 — EXPORTÉ pour que la prévisualisation montre le VRAI gabarit.
 * `scripts/preview-review-email.ts` en tenait une copie locale « faute
 * d'export » : le jour où le texte de `rejected` a changé ici, l'aperçu
 * affichait encore l'ancien. Un outil censé valider le wording avant envoi ne
 * peut pas avoir son propre wording.
 * ⚠️ `subjectForAction` est exporté pour la même raison.
 */
export function buildHtml(input: ReviewEmailInput): string {
  const { prenom, fileName, analysisId, action, verdictDecisionnel, noteContexte } = input;
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
        ${noteContexte
          ? `<p style="margin:14px 0 0;padding:12px 14px;background:#F9FAFB;border-left:3px solid #D1D5DB;border-radius:6px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:14px;color:#6B7280;line-height:1.7;">${esc(noteContexte)}</p>`
          : ""}
        ${verdictBadge}
        ${cta}
        <p style="margin:24px 0 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:13px;color:#6B7280;line-height:1.65;text-align:center;">Vous pouvez répondre directement à cet email si vous avez une question.</p>

        <!-- 2026-08-18 — Invitation Trustpilot au pic de satisfaction (un expert
             humain vient de relire le devis). Envoyée à TOUS les utilisateurs
             revus, quel que soit le verdict — pas de review gating (règles
             Trustpilot). -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
          <tr><td style="padding:18px 20px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;">
            <p style="margin:0 0 6px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#0E1730;">Votre avis compte ⭐</p>
            <p style="margin:0 0 12px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:13px;color:#4B5563;line-height:1.6;">Votre devis a été relu par notre expert — dites en 2 minutes ce que vous avez pensé du service. Chaque avis aide d'autres particuliers à éviter les mauvaises surprises sur leurs travaux.</p>
            <a href="https://fr.trustpilot.com/evaluate/verifiermondevis.fr" style="display:inline-block;background:#FFFFFF;border:1px solid #CBD5E1;color:#0E1730;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:13px;font-weight:600;text-decoration:none;padding:9px 18px;border-radius:8px;">Donner mon avis sur Trustpilot</a>
          </td></tr>
        </table>
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
export async function sendReviewNotificationEmail(
  input: ReviewEmailInput,
): Promise<ResultatEnvoi> {
  // ⚠️ Lecture au RUNTIME via `resendApiKey()`, jamais `import.meta.env` :
  // Vite inline cette dernière au build et supprime tout le bloc d'envoi.
  // Trois routes du projet en étaient mortes sans que rien ne le signale.
  const RESEND_API_KEY = resendApiKey();
  if (!RESEND_API_KEY) {
    const raison = diagnosticCleResend();
    console.warn(`[reviewEmail] email NON envoyé — ${raison}`);
    return { ok: false, raison };
  }
  if (!input.toEmail || !input.toEmail.includes("@")) {
    const raison = `adresse destinataire invalide : « ${input.toEmail} »`;
    console.warn(`[reviewEmail] ${raison}`);
    return { ok: false, raison };
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
        // contact@verifiermondevis.fr = adresse pro standard (à laquelle un user
        // peut répondre directement, cf. ligne "Vous pouvez répondre à cet email"
        // dans le template). Le domaine verifiermondevis.fr est déjà vérifié dans
        // Resend (cf. bonjour@verifiermondevis.fr déjà utilisé par vmd-on-signup).
        from: "VerifierMonDevis <contact@verifiermondevis.fr>",
        reply_to: "contact@verifiermondevis.fr",
        to: [input.toEmail],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      // Le corps de la réponse porte la vraie cause — domaine non vérifié, clé
      // révoquée, destinataire refusé. Sans lui, « échec » n'aide personne.
      const detail = (await res.text()).slice(0, 300);
      const raison = `Resend a refusé (HTTP ${res.status}) : ${detail}`;
      console.error(`[reviewEmail] ${raison}`);
      return { ok: false, raison };
    }
    console.log(
      `[reviewEmail] envoyé à ${input.toEmail} (action=${input.action}, analysis=${input.analysisId.slice(0, 8)})`,
    );
    return { ok: true, raison: `envoyé à ${input.toEmail}` };
  } catch (e) {
    const raison = `appel à Resend impossible : ${e instanceof Error ? e.message : String(e)}`;
    console.error(`[reviewEmail] ${raison}`);
    return { ok: false, raison };
  }
}
