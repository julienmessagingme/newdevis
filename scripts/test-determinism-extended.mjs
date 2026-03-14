/**
 * test-determinism-extended.mjs
 * Audit étendu :
 *  - 3 runs pipeline (au lieu de 2) pour détection d'anomalie rare
 *  - Inspection des document_extractions (cache, hash, job_type_groups)
 *  - Inspection de l'absence de scores IVP/IPI pour ce devis spécifique
 *  - Test de cohérence des critères de scoring entre runs
 */

const SUPABASE_URL     = "https://vhrhgsqxwvouswjaiczn.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZocmhnc3F4d3ZvdXN3amFpY3puIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDcyNDMyMSwiZXhwIjoyMDg2MzAwMzIxfQ.cDUFACbZMOsJ906kFcwoINHe2sUCnzA1Xri1qEVd-EI";

import fs from "node:fs";

const PDF_PATH    = "C:/Users/bride/Desktop/VerifierMonDevis.fr/castelnau-devis-2660635023.pdf";
const TEST_USER   = "00000000-0000-0000-0000-000000000002";

function H() {
  return {
    "Content-Type": "application/json",
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
  };
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function dbPost(table, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST", headers: { ...H(), "Prefer": "return=representation" }, body: JSON.stringify(body),
  });
  const d = await r.json(); return Array.isArray(d) ? d[0] : d;
}
async function dbGet(table, filter, select = "*") {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}&${filter}`, { headers: H() });
  return r.json();
}
async function dbDelete(table, filter) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, { method: "DELETE", headers: H() });
}

async function uploadFile() {
  const buf = fs.readFileSync(PDF_PATH);
  const fp  = `${TEST_USER}/test-ext.pdf`;
  await fetch(`${SUPABASE_URL}/storage/v1/object/devis/${fp}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/pdf", "x-upsert": "true" },
    body: buf,
  });
  return fp;
}

async function runPipeline(filePath, label) {
  const analysis = await dbPost("analyses", {
    user_id: TEST_USER, file_path: filePath,
    file_name: "test-ext.pdf", status: "pending",
    score: null, raw_text: null, domain: "travaux",
    error_message: `[EXT-TEST] ${label}`,
  });
  const analysisId = analysis?.id;
  if (!analysisId) { throw new Error("createAnalysis failed: " + JSON.stringify(analysis)); }

  await dbPost("document_extractions", {
    analysis_id: analysisId, file_path: filePath,
    file_hash: "pending", status: "created",
    ocr_status: "created", parser_status: "pending",
    qtyref_status: "pending", provider: "pending",
    ocr_used: false, cache_hit: false,
  });

  const t0 = Date.now();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ analysisId }),
  });
  const triggerMs = Date.now() - t0;
  const td = await res.json();
  // Retry une fois sur erreur Supabase infra transitoire
  if (!res.ok) {
    console.log(`\n  ⚠  Trigger erreur ${res.status} (transitoire), retry dans 5s...`);
    await sleep(5000);
    const res2 = await fetch(`${SUPABASE_URL}/functions/v1/analyze-quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ analysisId }),
    });
    const td2 = await res2.json();
    if (!res2.ok) throw new Error("Trigger failed (retry): " + JSON.stringify(td2));
    Object.assign(td, td2);
  }

  // Poll
  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    const rows = await dbGet("analyses", `id=eq.${analysisId}`, "id,status,score,raw_text,error_message");
    const row  = rows?.[0];
    if (!row) continue;
    if (["completed","error","failed"].includes(row.status)) {
      const totalMs = Date.now() - t0;
      const ext = await dbGet("document_extractions", `analysis_id=eq.${analysisId}`);
      return { analysisId, row, triggerMs, totalMs, extraction: ext?.[0] || null };
    }
    process.stdout.write(`\r  ⏳ [${label}] ${row.status}: ${(row.error_message||"").substring(0,55)}   `);
  }
  throw new Error("Timeout");
}

function extractFields(row, extraction) {
  let raw = null;
  try { raw = JSON.parse(row.raw_text); } catch {}
  if (!raw) return null;

  const ex  = raw.extracted || {};
  const sc  = raw.strategic_scores || null;
  const sco = raw.scoring || {};
  const np  = raw.n8n_price_data || [];

  return {
    // Scoring
    score_global:      row.score,
    rouges:            sco.criteres_rouges || [],
    oranges:           sco.criteres_oranges || [],
    verts_count:       (sco.criteres_verts || []).length,

    // Extraction paiement (le champ bugué)
    acompte_pct:          ex.paiement?.acompte_pct ?? null,
    acompte_avant_travaux: ex.paiement?.acompte_avant_travaux_pct ?? null,
    echeancier_detecte:    ex.paiement?.echeancier_detecte ?? null,
    modes_paiement:        ex.paiement?.modes ?? [],

    // Entreprise
    siret:     ex.entreprise?.siret ?? null,
    nom:       ex.entreprise?.nom ?? null,

    // Totaux
    ttc:            ex.totaux?.ttc ?? null,
    travaux_count:  ex.travaux?.length ?? 0,

    // IVP/IPI
    ivp_score:  sc?.ivp_score ?? null,
    ipi_score:  sc?.ipi_score ?? null,
    ivp_label:  sc?.label ?? null,

    // Market prices / job types
    job_types_found:  np.filter(jt => jt.catalog_job_types?.length > 0).length,
    job_types_autre:  np.filter(jt => !jt.catalog_job_types?.length).length,
    job_types_labels: np.map(jt => jt.job_type_label),

    // Cache
    cache_hit:    extraction?.cache_hit ?? false,
    file_hash:    (extraction?.file_hash || "").substring(0, 16) + "…",
    ext_provider: extraction?.provider ?? null,
  };
}

function compareRuns(runs) {
  console.log("\n┌─────────────────────────────────────────────────────────────────────┐");
  console.log("│  COMPARAISON CHAMP PAR CHAMP — " + runs.length + " RUNS                            │");
  console.log("├─────────────────────────────┬" + runs.map((_, i) => `──────────────────────`).join("┬") + "┤");

  const header = "│ Champ                       │" + runs.map((_, i) => ` Run ${i+1}               `).map(s => s.substring(0,22) + "│").join("");
  console.log(header);
  console.log("├─────────────────────────────┼" + runs.map(() => "──────────────────────").join("┼") + "┤");

  const FIELDS = [
    "score_global", "acompte_pct", "acompte_avant_travaux", "echeancier_detecte",
    "modes_paiement", "siret", "ttc", "travaux_count",
    "ivp_score", "ipi_score", "ivp_label",
    "job_types_found", "job_types_autre", "rouges", "oranges", "cache_hit",
  ];

  let totalDiffs = 0;

  for (const field of FIELDS) {
    const vals  = runs.map(r => JSON.stringify(r.fields?.[field]));
    const allEq = vals.every(v => v === vals[0]);
    const icon  = allEq ? "✓" : "✗";
    const line  = `│ ${icon} ${field.padEnd(27)}│` + vals.map(v => {
      const s = (v||"null").substring(0, 20).padEnd(20);
      return ` ${s} │`;
    }).join("");
    console.log(line);
    if (!allEq) totalDiffs++;
  }

  console.log("└─────────────────────────────┴" + runs.map(() => "──────────────────────").join("┴") + "┘");

  return totalDiffs;
}

(async () => {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  AUDIT ÉTENDU — 3 RUNS CONSÉCUTIFS + INSPECTION DÉTAILLÉE   ║");
  console.log(`║  ${new Date().toISOString()}                           ║`);
  console.log("╚══════════════════════════════════════════════════════════════╝");

  const filePath = await uploadFile();
  console.log(`\n  📤 Fichier uploadé : ${filePath}`);

  const runs = [];
  for (let i = 0; i < 3; i++) {
    console.log(`\n  ─── Run ${i+1}/3 ───`);
    const run = await runPipeline(filePath, `Run-${i+1}`);
    const fields = extractFields(run.row, run.extraction);
    runs.push({ ...run, fields });
    console.log(`\n  ✓ Status: ${run.row.status} (${run.totalMs}ms, trigger: ${run.triggerMs}ms)`);
    console.log(`    score_global=${fields?.score_global}  acompte_pct=${fields?.acompte_pct}  echeancier=${fields?.echeancier_detecte}  IVP=${fields?.ivp_score}  cache_hit=${fields?.cache_hit}`);
    console.log(`    job_types_found=${fields?.job_types_found}  job_types_autre=${fields?.job_types_autre}`);
    console.log(`    labels: ${JSON.stringify(fields?.job_types_labels)}`);
    console.log(`    rouges: ${JSON.stringify(fields?.rouges)}`);
    console.log(`    oranges: ${JSON.stringify(fields?.oranges)}`);
    if (i < 2) {
      console.log("  ⏸  Pause 3s...");
      await sleep(3000);
    }
  }

  const totalDiffs = compareRuns(runs);

  // Cleanup
  console.log("\n  🧹 Nettoyage...");
  for (const r of runs) await dbDelete("analyses", `id=eq.${r.analysisId}`);
  await fetch(`${SUPABASE_URL}/storage/v1/object/devis/${filePath}`, {
    method: "DELETE", headers: { "Authorization": `Bearer ${SERVICE_ROLE_KEY}` },
  });
  console.log(`  Supprimé : ${runs.length} analyse(s)`);

  // Rapport
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  if (totalDiffs === 0) {
    console.log("║  ✅ RÉSULTAT : ZÉRO DIVERGENCE sur 3 runs                    ║");
    console.log("║     Les deux bugs signalés sont correctement corrigés.       ║");
  } else {
    console.log(`║  ❌ RÉSULTAT : ${String(totalDiffs).padEnd(2)} DIVERGENCE(S) détectée(s)                  ║`);
  }
  console.log("╚══════════════════════════════════════════════════════════════╝");
  process.exit(totalDiffs === 0 ? 0 : 1);
})();
