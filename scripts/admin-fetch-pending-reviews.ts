#!/usr/bin/env tsx
/**
 * scripts/admin-fetch-pending-reviews.ts
 *
 * 🟢 Phase 2.4 — Aide-mémoire pour faire des revues humaines sans naviguer dans /admin/reviews
 *
 * Liste les analyses `review_status = 'pending_review'` avec, pour chacune :
 *  - identité (file_name, email user, date)
 *  - déclencheurs Piste C (réplique de l'algorithme src/pages/api/admin/reviews/[id].ts)
 *  - conclusion_ia : verdict, surcout, anomalies, raisons
 *  - extraction : type doc, total HT, nb travaux + 10 lignes représentatives
 *  - matching catalogue : tous les groupes du n8n_price_data avec leur classification
 *  - bypass actifs (foreign / incomplete / hors_scope / courtier)
 *
 * Tente de télécharger les PDFs dans scratchpad/pending-pdfs/ pour relecture.
 *
 * USAGE :
 *   npx tsx scripts/admin-fetch-pending-reviews.ts
 *   npx tsx scripts/admin-fetch-pending-reviews.ts --id <analysis_id>   (1 seule analyse, détail max)
 *   npx tsx scripts/admin-fetch-pending-reviews.ts --no-pdf             (skip download PDFs)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SCRATCH = join(
  process.env.LOCALAPPDATA ?? process.env.HOME ?? ROOT,
  "Temp",
  "claude",
  "C--Users-bride-projets-newdevis--claude-worktrees-upbeat-volhard-f2b29e",
  "pending-pdfs",
);

// .env loader (cf. scripts/phase3-analyze-shadow.ts)
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

const args = process.argv.slice(2);
const onlyId = args.includes("--id") ? args[args.indexOf("--id") + 1] : null;
const skipPdf = args.includes("--no-pdf");

interface AnalysisRow {
  id: string;
  file_name: string | null;
  file_path: string | null;
  status: string | null;
  created_at: string;
  user_id: string | null;
  conclusion_ia: string | null;
  raw_text: string | null;
  review_status: string;
  review_notes: string | null;
}

function safeParse(s: unknown): any {
  if (!s || typeof s !== "string") return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function computeTriggers(conclusion: any, raw: any): string[] {
  const triggers: string[] = [];
  if (!conclusion) return triggers;

  const verdictG = conclusion.verdict_global;
  if (verdictG === "a_risque" || verdictG === "refuser") {
    triggers.push(`verdict=${verdictG}`);
  }
  const surcoutMax = conclusion.surcout_global?.max ?? 0;
  if (surcoutMax > 2000) triggers.push(`surcout_max=${Math.round(surcoutMax)}€`);
  const nbAnomalies = Array.isArray(conclusion.anomalies) ? conclusion.anomalies.length : 0;
  if (nbAnomalies >= 2) triggers.push(`anomalies=${nbAnomalies}`);
  if (conclusion.is_foreign_quote) triggers.push("bypass=foreign");
  if (conclusion.is_incomplete_quote) triggers.push("bypass=incomplete");
  if (conclusion.hors_scope) triggers.push("bypass=hors_scope");
  if (conclusion.estimation_courtier) triggers.push("bypass=courtier");

  // Ratio aberrant (Piste C élargie Phase 0.1)
  if (Array.isArray(raw?.n8n_price_data)) {
    let worstRatio = 0;
    let worstLabel = "";
    for (const g of raw.n8n_price_data) {
      if (!g || typeof g !== "object") continue;
      const group = g as any;
      const devisTotal = typeof group.devis_total_ht === "number" ? group.devis_total_ht : 0;
      if (devisTotal <= 0) continue;
      const prices = Array.isArray(group.prices) ? group.prices : [];
      const qty =
        typeof group.main_quantity === "number" && group.main_quantity > 0 ? group.main_quantity : 1;
      let theoMax = 0;
      for (const p of prices) {
        theoMax += (typeof p.price_max_unit_ht === "number" ? p.price_max_unit_ht : 0) * qty;
        theoMax += typeof p.fixed_max_ht === "number" ? p.fixed_max_ht : 0;
      }
      if (theoMax <= 0) continue;
      const ratio = devisTotal / theoMax;
      if (ratio > worstRatio) {
        worstRatio = ratio;
        worstLabel = String(group.job_type_label ?? group.job_type ?? "?");
      }
    }
    if (worstRatio > 5) {
      triggers.push(`ratio_aberrant=${worstRatio.toFixed(1)}× ("${worstLabel}")`);
    }
  }

  return triggers;
}

function classifyGroup(group: any): { tag: string; ratioMax: number | null } {
  const devis = typeof group.devis_total_ht === "number" ? group.devis_total_ht : 0;
  const prices = Array.isArray(group.prices) ? group.prices : [];
  const qty =
    typeof group.main_quantity === "number" && group.main_quantity > 0 ? group.main_quantity : 1;
  if (!prices.length) return { tag: "Non comparable", ratioMax: null };
  let theoMin = 0;
  let theoMax = 0;
  for (const p of prices) {
    theoMin += (typeof p.price_min_unit_ht === "number" ? p.price_min_unit_ht : 0) * qty;
    theoMin += typeof p.fixed_min_ht === "number" ? p.fixed_min_ht : 0;
    theoMax += (typeof p.price_max_unit_ht === "number" ? p.price_max_unit_ht : 0) * qty;
    theoMax += typeof p.fixed_max_ht === "number" ? p.fixed_max_ht : 0;
  }
  if (theoMax <= 0) return { tag: "Non comparable", ratioMax: null };
  const ratio = devis / theoMax;
  let tag: string;
  if (devis <= theoMin * 1.1) tag = "Prix correct (vert)";
  else if (devis <= theoMax) tag = "Dans fourchette";
  else if (ratio <= 1.5) tag = "Légèrement élevé";
  else if (ratio <= 2) tag = "Survalué";
  else tag = "🔴 Anomalie marché";
  return { tag, ratioMax: ratio };
}

async function getEmail(userId: string | null): Promise<string> {
  if (!userId) return "(anonyme)";
  try {
    const { data } = await supabase.auth.admin.getUserById(userId);
    return data?.user?.email ?? `(uid ${userId.slice(0, 8)})`;
  } catch {
    return `(uid ${userId.slice(0, 8)})`;
  }
}

async function downloadPdf(filePath: string, fileName: string): Promise<string | null> {
  // file_path est typiquement le chemin storage Supabase, ex: "userid/uuid/document.pdf"
  // Try bucket "documents" puis "analyses" puis "uploads"
  const candidates = ["documents", "analyses", "uploads", "devis"];
  for (const bucket of candidates) {
    const { data, error } = await supabase.storage.from(bucket).download(filePath);
    if (error || !data) continue;
    const buf = Buffer.from(await data.arrayBuffer());
    if (!existsSync(SCRATCH)) mkdirSync(SCRATCH, { recursive: true });
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const out = join(SCRATCH, safeName);
    writeFileSync(out, buf);
    return out;
  }
  return null;
}

function summarizeConclusion(c: any): string {
  if (!c) return "(conclusion_ia illisible)";
  const lines: string[] = [];
  lines.push(`  verdict_global       = ${c.verdict_global ?? "—"}`);
  lines.push(`  verdict_decisionnel  = ${c.verdict_decisionnel ?? "—"}`);
  const sMin = c.surcout_global?.min ?? 0;
  const sMax = c.surcout_global?.max ?? 0;
  lines.push(`  surcout              = ${Math.round(sMin)}€ – ${Math.round(sMax)}€`);
  const nbAnom = Array.isArray(c.anomalies) ? c.anomalies.length : 0;
  lines.push(`  anomalies            = ${nbAnom}`);
  if (c.is_foreign_quote) lines.push(`  bypass               = foreign (${c.foreign_quote?.country_label ?? "?"})`);
  if (c.is_incomplete_quote) lines.push(`  bypass               = incomplete`);
  if (c.hors_scope) lines.push(`  bypass               = hors_scope`);
  if (c.estimation_courtier) lines.push(`  bypass               = courtier`);
  if (c.comparison_indicative) lines.push(`  flag                 = comparison_indicative`);
  if (c.phrase_intro) lines.push(`  intro                = ${String(c.phrase_intro).slice(0, 200)}`);
  if (Array.isArray(c.points_ok) && c.points_ok.length) {
    lines.push(`  points_ok (${c.points_ok.length}):`);
    for (const p of c.points_ok.slice(0, 5)) lines.push(`    + ${String(p).slice(0, 140)}`);
  }
  if (Array.isArray(c.alertes) && c.alertes.length) {
    lines.push(`  alertes (${c.alertes.length}):`);
    for (const a of c.alertes.slice(0, 5)) lines.push(`    ! ${String(a).slice(0, 140)}`);
  }
  if (Array.isArray(c.anomalies) && c.anomalies.length) {
    lines.push(`  anomalies détaillées (${c.anomalies.length}):`);
    for (const a of c.anomalies.slice(0, 5)) {
      const t = a?.titre ?? a?.title ?? "?";
      const exp = a?.explication ?? a?.detail ?? "";
      lines.push(`    🔴 ${String(t).slice(0, 100)}`);
      if (exp) lines.push(`       → ${String(exp).slice(0, 200)}`);
    }
  }
  if (Array.isArray(c.actions_avant_signature) && c.actions_avant_signature.length) {
    lines.push(`  actions_avant_signature (${c.actions_avant_signature.length}):`);
    for (const a of c.actions_avant_signature.slice(0, 5))
      lines.push(`    👉 ${String(a).slice(0, 200)}`);
  }
  return lines.join("\n");
}

function summarizeExtraction(raw: any): string {
  if (!raw) return "(raw_text illisible)";
  const ext = raw.extracted ?? raw.extracted_data ?? raw;
  if (!ext || typeof ext !== "object") return "(extracted introuvable)";
  const lines: string[] = [];
  lines.push(`  type_document        = ${ext.type_document ?? "—"}`);
  lines.push(`  entreprise           = ${ext.entreprise?.nom ?? "—"}`);
  lines.push(`  siret                = ${ext.entreprise?.siret ?? "—"}`);
  lines.push(`  iban                 = ${ext.entreprise?.iban ?? "—"}`);
  const totHt = ext.totaux?.ht ?? null;
  const totTtc = ext.totaux?.ttc ?? null;
  lines.push(
    `  total HT / TTC       = ${totHt ?? "?"}€ / ${totTtc ?? "?"}€`,
  );
  if (ext.country_code && ext.country_code !== "FR")
    lines.push(`  country_code         = ${ext.country_code} ⚠️ devis étranger`);
  if (ext.acompte) lines.push(`  acompte              = ${JSON.stringify(ext.acompte).slice(0, 200)}`);
  if (Array.isArray(ext.echeancier) && ext.echeancier.length) {
    lines.push(`  echeancier (${ext.echeancier.length}):`);
    for (const e of ext.echeancier.slice(0, 6))
      lines.push(`    - ${e.etape ?? "?"} = ${e.pourcentage ?? "?"}% (${e.montant ?? "?"}€)`);
  }
  const travaux = Array.isArray(ext.travaux) ? ext.travaux : [];
  lines.push(`  travaux              = ${travaux.length} lignes`);
  for (const t of travaux.slice(0, 12)) {
    const lib = String(t.libelle ?? "—").slice(0, 70);
    const qty = t.quantite ?? "?";
    const unit = t.unite ?? "?";
    const mont = t.montant ?? "?";
    lines.push(`    • ${qty} ${unit} | ${mont}€ | ${lib}`);
  }
  if (travaux.length > 12) lines.push(`    ... +${travaux.length - 12} lignes`);
  if (Array.isArray(ext.clauses_litigieuses) && ext.clauses_litigieuses.length) {
    lines.push(`  clauses_litigieuses (${ext.clauses_litigieuses.length}):`);
    for (const c of ext.clauses_litigieuses.slice(0, 5))
      lines.push(`    ⚠️ ${String(c.type ?? "?")}: "${String(c.citation ?? "").slice(0, 150)}"`);
  }
  return lines.join("\n");
}

function summarizeMatching(raw: any): string {
  if (!raw) return "(pas de matching)";
  const groups = Array.isArray(raw.n8n_price_data) ? raw.n8n_price_data : [];
  if (!groups.length) return "  (aucun groupe matché — pipeline V3.5 ligne-par-ligne ou bypass)";
  const lines: string[] = [];
  lines.push(`  ${groups.length} groupes / lignes matchés :`);
  for (const g of groups.slice(0, 30)) {
    const lab = String(g.job_type_label ?? g.job_type ?? "?").slice(0, 60);
    const devis = g.devis_total_ht ?? 0;
    const { tag, ratioMax } = classifyGroup(g);
    const ratioStr = ratioMax !== null ? ` (×${ratioMax.toFixed(2)})` : "";
    lines.push(`    • [${tag}] ${lab} — ${devis}€${ratioStr}`);
  }
  if (groups.length > 30) lines.push(`    ... +${groups.length - 30}`);
  return lines.join("\n");
}

async function main(): Promise<void> {
  console.log("🟢 Phase 2.4 — Fetch des analyses pending_review\n");

  let query = supabase
    .from("analyses")
    .select(
      "id, file_name, file_path, status, created_at, user_id, conclusion_ia, raw_text, review_status, review_notes",
    )
    .eq("review_status", "pending_review")
    .order("created_at", { ascending: false });

  if (onlyId) query = supabase
    .from("analyses")
    .select(
      "id, file_name, file_path, status, created_at, user_id, conclusion_ia, raw_text, review_status, review_notes",
    )
    .eq("id", onlyId);

  const { data, error } = await query;
  if (error) {
    console.error("❌ Erreur fetch :", error.message);
    process.exit(1);
  }
  const rows = (data ?? []) as AnalysisRow[];

  if (!rows.length) {
    console.log(`⏸️  Aucune analyse ${onlyId ? "avec cet id" : "pending_review"} trouvée.`);
    process.exit(0);
  }

  console.log(`✓ ${rows.length} analyse(s) à revoir\n`);
  console.log("═".repeat(80));

  for (const a of rows) {
    const email = await getEmail(a.user_id);
    const conclusion = safeParse(a.conclusion_ia);
    const raw = safeParse(a.raw_text);
    const triggers = computeTriggers(conclusion, raw);

    console.log(`\n📄 ${a.file_name ?? "(sans nom)"}`);
    console.log(`   id           : ${a.id}`);
    console.log(`   user         : ${email}`);
    console.log(`   créée le     : ${a.created_at.slice(0, 19).replace("T", " ")}`);
    console.log(`   status       : ${a.status ?? "?"}`);
    console.log(`   review       : ${a.review_status}`);
    console.log(`   file_path    : ${a.file_path ?? "—"}`);
    console.log(`   triggers     : ${triggers.length ? triggers.join(" · ") : "(aucun)"}\n`);

    console.log("─── 🧠 LECTURE IA actuelle ──────────────────────────────────────────────");
    console.log(summarizeConclusion(conclusion));

    console.log("\n─── 📄 EXTRACTION (ce que le moteur a LU du PDF) ───────────────────────");
    console.log(summarizeExtraction(raw));

    console.log("\n─── 🎯 MATCHING CATALOGUE (poste par poste) ─────────────────────────────");
    console.log(summarizeMatching(raw));

    if (!skipPdf && a.file_path && a.file_name) {
      console.log("\n─── 📁 PDF ──────────────────────────────────────────────────────────────");
      const localPath = await downloadPdf(a.file_path, a.file_name);
      if (localPath) console.log(`  ✓ téléchargé : ${localPath}`);
      else console.log(`  ✗ download échoué (vérifier nom du bucket Storage ou RLS)`);
    }

    console.log("\n" + "═".repeat(80));
  }

  console.log(`\n✓ ${rows.length} analyse(s) listée(s).`);
  if (!skipPdf) console.log(`PDFs téléchargés dans : ${SCRATCH}\n`);
}

main().catch((err) => {
  console.error("❌ Erreur :", err);
  process.exit(1);
});
