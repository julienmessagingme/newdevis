#!/usr/bin/env tsx
/**
 * scripts/preview-review-email.ts
 *
 * Génère 3 fichiers HTML locaux (un par action : validated / corrected /
 * rejected) à partir du helper src/lib/integrations/reviewNotificationEmail.ts.
 *
 * Pas d'envoi Resend. Juste de la prévisualisation pour valider la mise en
 * forme + le wording AVANT de mettre l'envoi en production.
 *
 * USAGE :
 *   npx tsx scripts/preview-review-email.ts
 *
 * Ouvre ensuite les 3 fichiers générés dans ton navigateur (le script affiche
 * les chemins exacts à la fin).
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Reproduction locale de buildHtml (le helper n'exporte pas buildHtml pour
// rester minimal côté prod ; on duplique ici à des fins de preview SEULEMENT).
// Si tu modifies le helper, mets aussi à jour ce fichier de preview.

type ReviewAction = "validated" | "corrected" | "rejected";

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

interface Scenario {
  toEmail: string;
  prenom: string;
  fileName: string;
  analysisId: string;
  action: ReviewAction;
  verdictDecisionnel: string;
}

function buildHtml(s: Scenario): string {
  const hero = HERO_BY_ACTION[s.action];
  const decisionnel = s.verdictDecisionnel;
  const verdictLabel = VERDICT_DECISIONNEL_LABEL[decisionnel] ?? "Verdict mis à jour";
  const colors = VERDICT_BADGE_COLOR[decisionnel] ?? VERDICT_BADGE_COLOR.signer;
  const link = `https://www.verifiermondevis.fr/analyse/${encodeURIComponent(s.analysisId)}`;
  const greeting = s.prenom
    ? `Bonjour <strong style="color:#0E1730;">${esc(s.prenom)}</strong>,`
    : `Bonjour,`;
  const fileLine = s.fileName
    ? `<p style="margin:0 0 18px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:14px;color:#6B7280;line-height:1.65;">Document analysé : <strong style="color:#374151;">${esc(s.fileName)}</strong></p>`
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
<title>${esc(SUBJECT_BY_ACTION[s.action])}</title>
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

const SCENARIOS: Scenario[] = [
  {
    toEmail: "marie.dupont@example.fr",
    prenom: "Marie",
    fileName: "Devis-toiture.pdf",
    analysisId: "8060adbf-31fb-4cda-8a07-e2f17fab3cfc",
    action: "validated",
    verdictDecisionnel: "signer",
  },
  {
    toEmail: "marie.dupont@example.fr",
    prenom: "Marie",
    fileName: "Devis-renovation-sdb.pdf",
    analysisId: "d3b3f014-7441-42fb-b3b7-95c7b56eb521",
    action: "corrected",
    verdictDecisionnel: "signer_avec_negociation",
  },
  {
    toEmail: "marie.dupont@example.fr",
    prenom: "Marie",
    fileName: "Devis-store-velux.pdf",
    analysisId: "bd222544-e5bd-478a-bbb9-9bcf2dff5698",
    action: "rejected",
    verdictDecisionnel: "ne_pas_signer",
  },
];

const out = join(ROOT, "scratchpad", "email-previews");
if (!existsSync(out)) mkdirSync(out, { recursive: true });

console.log("🟢 Génération des previews email\n");

const indexLines: string[] = [
  `<!doctype html><html><head><meta charset="utf-8"><title>Previews email revue expert</title>`,
  `<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#0E1730}h1{font-size:22px}h2{font-size:16px;margin-top:24px;color:#374151}a{display:inline-block;margin-right:12px;padding:8px 16px;background:#2563EB;color:#fff;border-radius:6px;text-decoration:none;font-size:14px}.subject{color:#6B7280;font-style:italic;margin-top:4px;font-size:14px}.from{color:#9CA3AF;font-size:13px;margin-bottom:8px}</style>`,
  `</head><body><h1>Previews — emails de revue expert</h1>`,
  `<p class="from">De : VerifierMonDevis &lt;contact@verifiermondevis.fr&gt;<br/>Pour : marie.dupont@example.fr (exemple)</p>`,
];

for (const s of SCENARIOS) {
  const html = buildHtml(s);
  const filename = `review-${s.action}.html`;
  const filepath = join(out, filename);
  writeFileSync(filepath, html, "utf-8");
  console.log(`  ✓ ${s.action.padEnd(10)} → ${filepath}`);
  console.log(`     Objet  : ${SUBJECT_BY_ACTION[s.action]}`);
  console.log(`     Verdict: ${VERDICT_DECISIONNEL_LABEL[s.verdictDecisionnel]}\n`);

  indexLines.push(
    `<h2>${s.action.toUpperCase()} (verdict ${s.verdictDecisionnel})</h2>`,
    `<p class="subject">Objet : « ${SUBJECT_BY_ACTION[s.action]} »</p>`,
    `<a href="./${filename}">Ouvrir le mail</a>`,
  );
}

const indexPath = join(out, "index.html");
indexLines.push(`</body></html>`);
writeFileSync(indexPath, indexLines.join("\n"), "utf-8");

console.log(`📁 Tous les previews + index dans : ${out}`);
console.log(`\n👉 Ouvre ce fichier dans ton navigateur :`);
console.log(`   ${indexPath}`);
