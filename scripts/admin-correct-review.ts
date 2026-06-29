#!/usr/bin/env tsx
/**
 * scripts/admin-correct-review.ts
 *
 * 🟢 Utilitaire admin — correction d'une revue déjà tranchée par erreur.
 *
 * Le bouton "Valider (IA juste)" / "Corriger" / "Rejeter" dans /admin/reviews
 * pose un review_status définitif. La route API /api/admin/reviews/[id]/decide
 * refuse ensuite toute modification (409 si analyse pas en pending_review).
 *
 * Ce script bypasse cette garde EN ÉCRITURE DIRECTE via service_role :
 *   1. INSERT une nouvelle ligne analysis_corrections (audit trail conservé)
 *   2. UPDATE analyses.conclusion_ia avec les overrides
 *   3. UPDATE analyses.review_status = 'corrected'
 *
 * L'ancienne décision reste tracée dans analysis_corrections — l'audit trail
 * montre le "validated par erreur puis corrected ensuite".
 *
 * USAGE :
 *   npx tsx scripts/admin-correct-review.ts \
 *     --id <analysis_uuid> \
 *     --verdict-global dans_la_norme \
 *     --verdict-decisionnel signer \
 *     --surcout-min 0 \
 *     --surcout-max 0 \
 *     --clear-anomalies \
 *     --notes "Faux positif Piste C — devis correct, ne mérite pas l'orange."
 *
 * Valeurs possibles :
 *   --verdict-global     : dans_la_norme | eleve_justifie | a_negocier | a_risque
 *   --verdict-decisionnel: signer | signer_avec_negociation | ne_pas_signer
 *   --clear-anomalies    : flag (vide la liste des anomalies)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sendReviewNotificationEmail } from "../src/lib/integrations/reviewNotificationEmail.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function loadEnvFile(name: string): boolean {
  const p = join(ROOT, name);
  if (!existsSync(p)) return false;
  const content = readFileSync(p, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
  return true;
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Env vars manquantes (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function getArg(name: string): string | null {
  const args = process.argv.slice(2);
  const i = args.indexOf(name);
  if (i === -1) return null;
  return args[i + 1] ?? null;
}
function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(name);
}

const id = getArg("--id");
const verdictGlobal = getArg("--verdict-global");
const verdictDecisionnel = getArg("--verdict-decisionnel");
const surcoutMin = getArg("--surcout-min");
const surcoutMax = getArg("--surcout-max");
const clearAnomalies = hasFlag("--clear-anomalies");
const notes = getArg("--notes");
const skipEmail = hasFlag("--no-email");

if (!id) {
  console.error("❌ --id <analysis_uuid> requis");
  process.exit(1);
}

const VALID_GLOBAL = ["dans_la_norme", "eleve_justifie", "a_negocier", "a_risque"];
const VALID_DECISIONNEL = ["signer", "signer_avec_negociation", "ne_pas_signer"];
if (verdictGlobal && !VALID_GLOBAL.includes(verdictGlobal)) {
  console.error(`❌ --verdict-global invalide (attendu : ${VALID_GLOBAL.join("|")})`);
  process.exit(1);
}
if (verdictDecisionnel && !VALID_DECISIONNEL.includes(verdictDecisionnel)) {
  console.error(`❌ --verdict-decisionnel invalide (attendu : ${VALID_DECISIONNEL.join("|")})`);
  process.exit(1);
}

async function main(): Promise<void> {
  console.log(`🟢 Correction admin pour analyse ${id}\n`);

  // 1) Fetch l'analyse
  const { data: analysis, error: fetchErr } = await supabase
    .from("analyses")
    .select("id, file_name, conclusion_ia, review_status, user_id")
    .eq("id", id)
    .single();
  if (fetchErr || !analysis) {
    console.error(`❌ Analyse introuvable : ${fetchErr?.message ?? "no data"}`);
    process.exit(1);
  }

  console.log(`✓ Analyse trouvée : ${analysis.file_name ?? "(sans nom)"}`);
  console.log(`  review_status actuel = ${analysis.review_status}`);

  let conclusionOriginal: any = null;
  try {
    conclusionOriginal =
      typeof analysis.conclusion_ia === "string" ? JSON.parse(analysis.conclusion_ia) : null;
  } catch {
    conclusionOriginal = null;
  }
  if (!conclusionOriginal) {
    console.error("❌ conclusion_ia illisible");
    process.exit(1);
  }

  const engineVersion =
    typeof conclusionOriginal.engine_version === "string"
      ? conclusionOriginal.engine_version
      : "1.0.0-refonte";

  // 2) Patch la conclusion comme decide.ts le fait
  const patched: any = { ...conclusionOriginal };
  if (verdictGlobal) patched.verdict_global = verdictGlobal;
  if (verdictDecisionnel) patched.verdict_decisionnel = verdictDecisionnel;
  if (surcoutMin !== null || surcoutMax !== null) {
    patched.surcout_global = {
      min: surcoutMin !== null ? Number(surcoutMin) : conclusionOriginal.surcout_global?.min ?? 0,
      max: surcoutMax !== null ? Number(surcoutMax) : conclusionOriginal.surcout_global?.max ?? 0,
    };
  }
  if (clearAnomalies) {
    patched.anomalies = [];
    patched.has_anomalies = false;
  }
  patched.expert_reviewed = true;
  patched.expert_reviewed_at = new Date().toISOString();
  patched.expert_corrected_via_script = true; // marqueur audit

  console.log("\n─── Patch appliqué ──");
  if (verdictGlobal) console.log(`  verdict_global       → ${verdictGlobal}`);
  if (verdictDecisionnel) console.log(`  verdict_decisionnel  → ${verdictDecisionnel}`);
  if (surcoutMin !== null || surcoutMax !== null)
    console.log(`  surcout              → ${patched.surcout_global.min}€ – ${patched.surcout_global.max}€`);
  if (clearAnomalies) console.log(`  anomalies            → []`);

  // 3) INSERT analysis_corrections (nouvelle ligne, audit trail conservé)
  const { error: insErr } = await supabase.from("analysis_corrections").insert({
    analysis_id: id,
    reviewed_by_user_id: null, // service_role, pas un user
    reviewed_by_email: "script:admin-correct-review.ts",
    action: "corrected",
    corrected_verdict_global: verdictGlobal,
    corrected_verdict_decisionnel: verdictDecisionnel,
    corrected_surcout_min: surcoutMin !== null ? Number(surcoutMin) : null,
    corrected_surcout_max: surcoutMax !== null ? Number(surcoutMax) : null,
    corrected_anomalies: clearAnomalies ? [] : null,
    original_conclusion: conclusionOriginal,
    review_triggers: [],
    expert_notes: notes ?? "(correction admin via script)",
    engine_version: engineVersion,
  });
  if (insErr) {
    console.error(`❌ Insert analysis_corrections failed: ${insErr.message}`);
    process.exit(1);
  }
  console.log("\n✓ Ligne analysis_corrections insérée (action=corrected)");

  // 4) UPDATE analyses
  const { error: updErr } = await supabase
    .from("analyses")
    .update({
      review_status: "corrected",
      review_notes: notes ?? "(correction admin via script)",
      reviewed_at: new Date().toISOString(),
      conclusion_ia: JSON.stringify(patched),
    })
    .eq("id", id);
  if (updErr) {
    console.error(`❌ Update analyses failed: ${updErr.message}`);
    process.exit(1);
  }
  console.log("✓ Analyses.conclusion_ia + review_status mis à jour\n");

  // 5) Notification email user (sauf --no-email)
  if (skipEmail) {
    console.log("⏭  Envoi email skippé (--no-email)");
  } else if (!analysis.user_id) {
    console.log("⏭  Pas de user_id sur l'analyse → email skippé");
  } else {
    try {
      const { data: userData } = await supabase.auth.admin.getUserById(analysis.user_id);
      const recipient = userData?.user;
      const meta = (recipient?.user_metadata ?? {}) as Record<string, string>;
      const prenom =
        (meta.first_name || (meta.full_name || meta.name || "").split(" ")[0] || "").trim() || null;
      if (recipient?.email) {
        const sent = await sendReviewNotificationEmail({
          toEmail: recipient.email,
          prenom,
          fileName: (analysis as any).file_name ?? null,
          analysisId: id!,
          action: "corrected",
          verdictDecisionnel: patched.verdict_decisionnel ?? verdictDecisionnel,
          verdictGlobal: patched.verdict_global ?? verdictGlobal,
        });
        console.log(
          sent
            ? `✓ Email envoyé à ${recipient.email}`
            : `⚠️  Email NON envoyé (cf. logs au-dessus)`,
        );
      } else {
        console.log("⏭  Pas d'email sur le compte user → email skippé");
      }
    } catch (e) {
      console.error(
        "⚠️  Erreur envoi email :",
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  console.log("\n🟢 Correction appliquée. L'utilisateur verra le verdict corrigé au prochain refresh.");
  console.log("   Audit trail : 2 lignes analysis_corrections (decision initiale + correction script).");
}

main().catch((err) => {
  console.error("❌ Erreur :", err);
  process.exit(1);
});
