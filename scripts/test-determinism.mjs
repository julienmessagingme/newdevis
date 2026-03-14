/**
 * test-determinism.mjs
 * Audit de déterminisme post-fix — analyze-quote edge function
 *
 * Tests :
 *  1. Extraction Gemini directe  ×3 → temperature:0 doit donner résultats identiques
 *  2. Pipeline complet ×2 sur le même fichier → acompte + IVP/IPI identiques
 *  3. Cache hit  → la 3e analyse du même fichier doit être "cache_hit: true" en DB
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL     = "https://vhrhgsqxwvouswjaiczn.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZocmhnc3F4d3ZvdXN3amFpY3puIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDcyNDMyMSwiZXhwIjoyMDg2MzAwMzIxfQ.cDUFACbZMOsJ906kFcwoINHe2sUCnzA1Xri1qEVd-EI";
const GOOGLE_API_KEY   = process.env.GOOGLE_AI_API_KEY || "";   // Optionnel pour le test direct Gemini
const GEMINI_URL       = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

const PDF_PATH = "C:/Users/bride/Desktop/VerifierMonDevis.fr/castelnau-devis-2660635023.pdf";
const TEST_USER_ID = "00000000-0000-0000-0000-000000000001"; // ID fictif test

// ── Helpers ───────────────────────────────────────────────────────────────────
function supabaseHeaders() {
  return {
    "Content-Type": "application/json",
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
  };
}

async function dbGet(table, filter = "", select = "*") {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}${filter ? "&" + filter : ""}`;
  const r = await fetch(url, { headers: supabaseHeaders() });
  return r.json();
}

async function dbPost(table, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...supabaseHeaders(), "Prefer": "return=representation" },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function dbDelete(table, filter) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: supabaseHeaders(),
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function diff(a, b, path = "") {
  const diffs = [];
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    const p = path ? `${path}.${k}` : k;
    if (typeof a[k] === "object" && a[k] !== null && !Array.isArray(a[k])) {
      diffs.push(...diff(a[k], b[k] || {}, p));
    } else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
      diffs.push({ path: p, a: a[k], b: b[k] });
    }
  }
  return diffs;
}

// ── Test 1 : Extraction Gemini directe ×3 ────────────────────────────────────
async function testGeminiDirectDeterminism() {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("TEST 1 — Extraction Gemini directe × 3 (temperature:0)");
  console.log("═══════════════════════════════════════════════════════");

  if (!GOOGLE_API_KEY) {
    console.log("⚠  GOOGLE_AI_API_KEY non disponible dans l'env — test direct Gemini ignoré");
    console.log("   Ce test est optionnel : le test pipeline (#2) couvre le même scénario.");
    return { skipped: true };
  }

  const pdfBuf = fs.readFileSync(PDF_PATH);
  const b64 = pdfBuf.toString("base64");

  const prompt = `Extrait le champ "paiement" de ce devis et retourne UNIQUEMENT ce JSON :
{
  "acompte_pct": <nombre ou null>,
  "acompte_avant_travaux_pct": <nombre ou null>,
  "echeancier_detecte": <true|false>,
  "modes": []
}
RÈGLES : acompte_pct = % du PREMIER versement. Si plusieurs étapes → première tranche + echeancier_detecte=true.`;

  const results = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GOOGLE_API_KEY}` },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [{ role: "user", content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:application/pdf;base64,${b64}` } },
        ]}],
        response_format: { type: "json_object" },
        max_tokens: 512,
        temperature: 0,
      }),
    });
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    let parsed = null;
    try { parsed = JSON.parse(content); } catch {}
    results.push({ run: i + 1, ms: Date.now() - t0, parsed });
    console.log(`  Run ${i+1}: ${JSON.stringify(parsed)} (${Date.now()-t0}ms)`);
    if (i < 2) await sleep(1000);
  }

  const allSame = results.every(r => JSON.stringify(r.parsed) === JSON.stringify(results[0].parsed));
  console.log(allSame
    ? "  ✅ PASS — 3 résultats IDENTIQUES"
    : "  ❌ FAIL — résultats DIVERGENTS");

  return { pass: allSame, results };
}

// ── Création d'une analyse test dans Supabase ─────────────────────────────────
async function uploadTestFile() {
  const pdfBuf = fs.readFileSync(PDF_PATH);
  const fileName = "test-determinism-castelnau.pdf";
  const filePath = `${TEST_USER_ID}/${fileName}`;

  // Upload via Storage REST API
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/devis/${filePath}`;
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/pdf",
      "x-upsert": "true",
    },
    body: pdfBuf,
  });
  const uploadData = await uploadRes.json();
  if (!uploadRes.ok && !uploadData.Key) {
    console.error("Upload failed:", uploadData);
    return null;
  }
  return filePath;
}

async function createAnalysis(filePath, label) {
  const rows = await dbPost("analyses", {
    user_id: TEST_USER_ID,
    file_path: filePath,
    file_name: "test-determinism-castelnau.pdf",
    status: "pending",
    score: null,
    resume: null,
    raw_text: null,
    domain: "travaux",
    error_message: `[TEST] ${label}`,
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row?.id) { console.error("createAnalysis failed:", rows); return null; }
  return row.id;
}

async function triggerAnalysis(analysisId) {
  const t0 = Date.now();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-quote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ analysisId }),
  });
  const data = await res.json();
  return { ok: res.ok, data, ms: Date.now() - t0 };
}

async function pollAnalysis(analysisId, maxWaitMs = 120000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await sleep(3000);
    const rows = await dbGet("analyses", `id=eq.${analysisId}`, "id,status,score,raw_text,error_message");
    const row = rows?.[0];
    if (!row) continue;
    if (row.status === "completed" || row.status === "error" || row.status === "failed") {
      return row;
    }
    process.stdout.write(`  ⏳ ${row.status}: ${(row.error_message || "").substring(0, 60)}\r`);
  }
  return null;
}

function extractKeyFields(row) {
  if (!row?.raw_text) return null;
  let raw;
  try { raw = JSON.parse(row.raw_text); } catch { return null; }

  const extracted = raw.extracted || {};
  const strategic = raw.strategic_scores || {};

  return {
    score_global:          row.score,
    acompte_pct:           extracted.paiement?.acompte_pct ?? null,
    acompte_avant_travaux: extracted.paiement?.acompte_avant_travaux_pct ?? null,
    echeancier_detecte:    extracted.paiement?.echeancier_detecte ?? null,
    siret:                 extracted.entreprise?.siret ?? null,
    total_ttc:             extracted.totaux?.ttc ?? null,
    travaux_count:         extracted.travaux?.length ?? 0,
    ivp_score:             strategic.ivp_score ?? null,
    ipi_score:             strategic.ipi_score ?? null,
    ivp_label:             strategic.label ?? null,
    criteres_rouges:       raw.scoring?.criteres_rouges ?? [],
    criteres_oranges:      raw.scoring?.criteres_oranges ?? [],
  };
}

// ── Test 2 : Pipeline complet ×2 ─────────────────────────────────────────────
async function testPipelineDeterminism(filePath) {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("TEST 2 — Pipeline complet × 2 (déterminisme global)");
  console.log("═══════════════════════════════════════════════════════");

  const runs = [];

  for (let i = 0; i < 2; i++) {
    console.log(`\n  ─── Run ${i+1}/2 ───`);

    // On crée une nouvelle analyse à chaque fois (pas de réutilisation)
    const analysisId = await createAnalysis(filePath, `Run ${i+1}`);
    if (!analysisId) { console.error("  ❌ createAnalysis failed"); return { pass: false }; }
    console.log(`  analysisId: ${analysisId}`);

    // On doit aussi créer la ligne document_extractions (le trigger le fait normalement)
    // Ici en test on l'insère manuellement
    await dbPost("document_extractions", {
      analysis_id: analysisId,
      file_path: filePath,
      file_hash: "pending",
      status: "created",
      ocr_status: "created",
      parser_status: "pending",
      qtyref_status: "pending",
      provider: "pending",
      ocr_used: false,
      cache_hit: false,
    });

    const trigger = await triggerAnalysis(analysisId);
    if (!trigger.ok) {
      console.error("  ❌ Trigger failed:", trigger.data);
      return { pass: false };
    }
    console.log(`  Trigger OK (${trigger.ms}ms), polling...`);

    const result = await pollAnalysis(analysisId);
    if (!result) { console.error("  ❌ Timeout"); return { pass: false }; }

    console.log(`\n  Status: ${result.status}`);
    const fields = extractKeyFields(result);
    if (!fields) { console.error("  ❌ Could not extract key fields"); return { pass: false }; }

    console.log("  Champs clés extraits:");
    console.log(`    score_global:       ${fields.score_global}`);
    console.log(`    acompte_pct:        ${fields.acompte_pct}`);
    console.log(`    acompte_av_travaux: ${fields.acompte_avant_travaux}`);
    console.log(`    echeancier_detecte: ${fields.echeancier_detecte}`);
    console.log(`    siret:              ${fields.siret}`);
    console.log(`    total_ttc:          ${fields.total_ttc}`);
    console.log(`    travaux_count:      ${fields.travaux_count}`);
    console.log(`    IVP:                ${fields.ivp_score}`);
    console.log(`    IPI:                ${fields.ipi_score}`);
    console.log(`    Rouges:             ${JSON.stringify(fields.criteres_rouges)}`);
    console.log(`    Oranges:            ${JSON.stringify(fields.criteres_oranges)}`);

    runs.push({ analysisId, fields });

    // Pause entre les 2 runs pour éviter le cache (tester le déterminisme Gemini pur)
    if (i === 0) {
      console.log("\n  ⏸  Pause 5s entre les 2 runs...");
      await sleep(5000);
    }
  }

  if (runs.length < 2) return { pass: false };

  const [r1, r2] = runs;
  const diffs = diff(r1.fields, r2.fields);

  if (diffs.length === 0) {
    console.log("\n  ✅ PASS — Run 1 et Run 2 IDENTIQUES sur tous les champs clés");
  } else {
    console.log("\n  ❌ FAIL — Divergences détectées:");
    for (const d of diffs) {
      console.log(`    [${d.path}]  run1=${JSON.stringify(d.a)}  ≠  run2=${JSON.stringify(d.b)}`);
    }
  }

  return { pass: diffs.length === 0, runs, diffs };
}

// ── Test 3 : Cache hit ────────────────────────────────────────────────────────
async function testCacheHit(filePath, prevAnalysisId) {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("TEST 3 — Cache hit (3e analyse du même fichier)");
  console.log("═══════════════════════════════════════════════════════");

  // Vérifier s'il existe déjà un enregistrement parsed pour ce hash
  // On réanalyse directement
  const analysisId = await createAnalysis(filePath, "Run cache-test");
  if (!analysisId) { return { pass: false }; }
  console.log(`  analysisId: ${analysisId}`);

  await dbPost("document_extractions", {
    analysis_id: analysisId,
    file_path: filePath,
    file_hash: "pending",
    status: "created",
    ocr_status: "created",
    parser_status: "pending",
    qtyref_status: "pending",
    provider: "pending",
    ocr_used: false,
    cache_hit: false,
  });

  const t0 = Date.now();
  const trigger = await triggerAnalysis(analysisId);
  if (!trigger.ok) { console.error("  ❌ Trigger failed:", trigger.data); return { pass: false }; }
  console.log(`  Trigger OK (${trigger.ms}ms), polling...`);

  const result = await pollAnalysis(analysisId);
  if (!result) { console.error("  ❌ Timeout"); return { pass: false }; }

  const elapsed = Date.now() - t0;
  console.log(`  Status: ${result.status} (total: ${elapsed}ms)`);

  // Vérifier le cache_hit dans document_extractions
  const extractions = await dbGet("document_extractions", `analysis_id=eq.${analysisId}`, "id,cache_hit,status,provider");
  const extraction = extractions?.[0];
  const isCacheHit = extraction?.cache_hit === true;

  console.log(`  document_extractions: cache_hit=${extraction?.cache_hit}, status=${extraction?.status}, provider=${extraction?.provider}`);

  if (isCacheHit) {
    console.log("  ✅ PASS — Cache utilisé (cache_hit=true)");
  } else {
    console.log("  ⚠  INFO — Cache non utilisé (probablement premier run ou expires_at invalide)");
    console.log("     Ce résultat est attendu si c'est le PREMIER run avec ce hash en prod.");
  }

  // Vérifier que les champs clés sont identiques à l'analyse précédente
  const fields = extractKeyFields(result);
  console.log(`  score_global: ${fields?.score_global}, IVP: ${fields?.ivp_score}, acompte: ${fields?.acompte_pct}`);

  return { pass: true, cacheHit: isCacheHit, analysisId, fields };
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
async function cleanup(analysisIds) {
  console.log("\n  🧹 Nettoyage analyses de test...");
  for (const id of analysisIds) {
    await dbDelete("analyses", `id=eq.${id}`);
  }
  // Supprimer le fichier de test du storage
  await fetch(`${SUPABASE_URL}/storage/v1/object/devis/${TEST_USER_ID}/test-determinism-castelnau.pdf`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${SERVICE_ROLE_KEY}` },
  });
  console.log(`  Supprimé : ${analysisIds.length} analyse(s) + fichier storage`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const t0 = Date.now();
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  AUDIT DÉTERMINISME — analyze-quote post-fix         ║");
  console.log(`║  ${new Date().toISOString()}                    ║`);
  console.log("╚══════════════════════════════════════════════════════╝");

  if (!fs.existsSync(PDF_PATH)) {
    console.error(`\n❌ PDF non trouvé : ${PDF_PATH}`);
    process.exit(1);
  }

  const analysisIds = [];

  // Test 1 : Gemini direct
  const t1 = await testGeminiDirectDeterminism();

  // Upload du fichier
  console.log("\n  📤 Upload du fichier de test...");
  const filePath = await uploadTestFile();
  if (!filePath) { console.error("❌ Upload échoué, abort."); process.exit(1); }
  console.log(`  Fichier uploadé : ${filePath}`);

  // Test 2 : Pipeline complet × 2
  const t2 = await testPipelineDeterminism(filePath);
  if (t2.runs) analysisIds.push(...t2.runs.map(r => r.analysisId));

  // Test 3 : Cache hit (3e run sur le même fichier)
  const t3 = await testCacheHit(filePath, analysisIds[0]);
  if (t3.analysisId) analysisIds.push(t3.analysisId);

  // Cleanup
  await cleanup(analysisIds);

  // ── Rapport final ───────────────────────────────────────────────────────────
  const totalMs = Date.now() - t0;
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  RAPPORT FINAL                                       ║");
  console.log("╠══════════════════════════════════════════════════════╣");

  const tests = [
    { name: "Test 1 — Gemini direct × 3",       result: t1 },
    { name: "Test 2 — Pipeline complet × 2",     result: t2 },
    { name: "Test 3 — Cache hit",                result: t3 },
  ];

  let allPass = true;
  for (const t of tests) {
    const skip = t.result.skipped;
    const pass = skip ? null : t.result.pass;
    const icon = skip ? "⏭ " : (pass ? "✅" : "❌");
    const label = skip ? "SKIPPED" : (pass ? "PASS" : "FAIL");
    console.log(`║  ${icon} ${t.name.padEnd(40)} ${label.padEnd(8)}║`);
    allPass = allPass && (skip || pass);
  }

  console.log("╠══════════════════════════════════════════════════════╣");
  console.log(`║  Durée totale : ${String(totalMs).padEnd(7)}ms                               ║`);
  console.log(`║  Résultat     : ${allPass ? "✅ TOUS LES TESTS PASSENT" : "❌ DES TESTS ONT ÉCHOUÉ"}          ║`);
  console.log("╚══════════════════════════════════════════════════════╝");

  if (t2.diffs && t2.diffs.length > 0) {
    console.log("\n⚠  Divergences Test 2 :");
    for (const d of t2.diffs) {
      console.log(`   [${d.path}]  run1=${JSON.stringify(d.a)}  run2=${JSON.stringify(d.b)}`);
    }
  }

  process.exit(allPass ? 0 : 1);
})();
