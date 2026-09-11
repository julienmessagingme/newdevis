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
 * 🔴 2026-09-11 — CE SCRIPT TENAIT UNE COPIE DU GABARIT, ET ELLE A PÉRIMÉ.
 * L'en-tête disait « le helper n'exporte pas buildHtml […] on duplique ici à
 * des fins de preview SEULEMENT. Si tu modifies le helper, mets aussi à jour ce
 * fichier. » Personne ne le fait : le jour où le texte de `rejected` a changé
 * (retrait de la mention « faux positif », retour Johan), l'aperçu affichait
 * toujours l'ancien. **Un outil censé valider le wording avant envoi ne peut
 * pas avoir son propre wording** — il aurait fait approuver un texte qui n'est
 * pas celui qui part. Le helper exporte désormais `buildHtml` et
 * `subjectForAction`, et ce fichier ne contient plus que les scénarios.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildHtml,
  subjectForAction,
  type ReviewAction,
} from "../src/lib/integrations/reviewNotificationEmail";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const VERDICT_LABEL: Record<string, string> = {
  signer: "Vous pouvez signer",
  signer_avec_negociation: "À négocier avant signature",
  ne_pas_signer: "Ne pas signer en l'état",
};

interface Scenario {
  toEmail: string;
  prenom: string;
  fileName: string;
  analysisId: string;
  action: ReviewAction;
  verdictDecisionnel: string;
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

console.log("🟢 Génération des previews email (gabarit de PRODUCTION)\n");

const indexLines: string[] = [
  `<!doctype html><html><head><meta charset="utf-8"><title>Previews email revue expert</title>`,
  `<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#0E1730}h1{font-size:22px}h2{font-size:16px;margin-top:24px;color:#374151}a{display:inline-block;margin-right:12px;padding:8px 16px;background:#2563EB;color:#fff;border-radius:6px;text-decoration:none;font-size:14px}.subject{color:#6B7280;font-style:italic;margin-top:4px;font-size:14px}.from{color:#9CA3AF;font-size:13px;margin-bottom:8px}</style>`,
  `</head><body><h1>Previews — emails de revue expert</h1>`,
  `<p class="from">De : VerifierMonDevis &lt;contact@verifiermondevis.fr&gt;<br/>Pour : marie.dupont@example.fr (exemple)</p>`,
];

for (const s of SCENARIOS) {
  const html = buildHtml({
    toEmail: s.toEmail,
    prenom: s.prenom,
    fileName: s.fileName,
    analysisId: s.analysisId,
    action: s.action,
    verdictDecisionnel: s.verdictDecisionnel,
  });
  const filename = `review-${s.action}.html`;
  const filepath = join(out, filename);
  writeFileSync(filepath, html, "utf-8");
  console.log(`  ✓ ${s.action.padEnd(10)} → ${filepath}`);
  console.log(`     Objet  : ${subjectForAction(s.action)}`);
  console.log(`     Verdict: ${VERDICT_LABEL[s.verdictDecisionnel]}\n`);

  indexLines.push(
    `<h2>${s.action.toUpperCase()} (verdict ${s.verdictDecisionnel})</h2>`,
    `<p class="subject">Objet : « ${subjectForAction(s.action)} »</p>`,
    `<a href="./${filename}">Ouvrir le mail</a>`,
  );
}

const indexPath = join(out, "index.html");
indexLines.push(`</body></html>`);
writeFileSync(indexPath, indexLines.join("\n"), "utf-8");

console.log(`📁 Tous les previews + index dans : ${out}`);
console.log(`\n👉 Ouvre ce fichier dans ton navigateur :`);
console.log(`   ${indexPath}`);
