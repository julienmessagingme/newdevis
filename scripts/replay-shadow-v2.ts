#!/usr/bin/env tsx
/**
 * scripts/replay-shadow-v2.ts
 *
 * 🟢 Phase 3.2 — Replay shadow run sur les analyses existantes
 *
 * Au lieu d'attendre 3-5 jours d'analyses naturelles pour alimenter
 * extract_comparisons, on rejoue analyze-quote sur N analyses passées.
 * V1 retourne le même résultat (comportement inchangé), V2 shadow se
 * branche automatiquement (EdgeRuntime.waitUntil), et le diff atterrit
 * dans extract_comparisons.
 *
 * USAGE :
 *   npx tsx scripts/replay-shadow-v2.ts                # 50 plus récentes
 *   npx tsx scripts/replay-shadow-v2.ts --count 100    # 100 analyses
 *   npx tsx scripts/replay-shadow-v2.ts --ids uuid1,uuid2,uuid3
 *   npx tsx scripts/replay-shadow-v2.ts --concurrency 3  # par défaut 3
 *
 * Sélection : par défaut, analyses récentes avec PDF présent ET
 * conclusion_ia non null (= analyses complètes), ordonnées par
 * created_at DESC. On évite les analyses ratées ou abandonnées.
 *
 * Coût estimé : ~0.01-0.02€ par analyse (V1 + V2 Gemini). 50 analyses ≈ 1€.
 * Durée : ~30-60s par analyse, ~5-10 min en parallèle (concurrency=3).
 *
 * ⚠️ Side effect : analyze-quote re-écrit conclusion_ia et raw_text.
 * Si le moteur a évolué depuis l'analyse initiale, le verdict peut
 * changer. C'est acceptable car le moteur actuel est plus fiable que
 * l'ancien.
 *
 * IMPORTANT : ce script suppose que EXTRACT_V2_ENABLED=shadow est posé
 * côté Supabase. Sans ça, V2 ne tourne pas et extract_comparisons reste
 * vide. Vérifier : `npx supabase secrets list --project-ref vhrhgsqxwvouswjaiczn`.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

const FUNCTIONS_URL = SUPABASE_URL.replace(".supabase.co", ".functions.supabase.co");

const args = process.argv.slice(2);
function getArg(name: string): string | null {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1] ?? null;
}
const countArg = Number(getArg("--count") ?? "50");
const idsArg = getArg("--ids");
const concurrency = Number(getArg("--concurrency") ?? "3");

interface Analysis {
  id: string;
  file_name: string | null;
  created_at: string;
}

async function fetchTargetAnalyses(): Promise<Analysis[]> {
  if (idsArg) {
    const ids = idsArg.split(",").map((s) => s.trim()).filter(Boolean);
    const { data, error } = await supabase
      .from("analyses")
      .select("id, file_name, created_at")
      .in("id", ids);
    if (error) throw new Error(`fetch failed: ${error.message}`);
    return (data ?? []) as Analysis[];
  }
  const { data, error } = await supabase
    .from("analyses")
    .select("id, file_name, created_at, file_path, conclusion_ia")
    .not("conclusion_ia", "is", null)
    .not("file_path", "is", null)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(countArg);
  if (error) throw new Error(`fetch failed: ${error.message}`);
  return (data ?? []) as Analysis[];
}

async function relaunchAnalysis(a: Analysis): Promise<{ ok: boolean; error?: string; durationMs: number }> {
  const t0 = performance.now();
  try {
    const res = await fetch(`${FUNCTIONS_URL}/analyze-quote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ analysisId: a.id }),
    });
    const durationMs = Math.round(performance.now() - t0);
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, error: `${res.status}: ${txt.slice(0, 200)}`, durationMs };
    }
    return { ok: true, durationMs };
  } catch (e) {
    const durationMs = Math.round(performance.now() - t0);
    return { ok: false, error: e instanceof Error ? e.message : String(e), durationMs };
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T, idx: number) => Promise<R>,
  limit: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function workerLoop() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, workerLoop);
  await Promise.all(workers);
  return results;
}

async function main(): Promise<void> {
  console.log("🟢 Replay shadow V2 sur analyses existantes\n");

  const analyses = await fetchTargetAnalyses();
  if (!analyses.length) {
    console.log("⏸️  Aucune analyse à rejouer.");
    return;
  }
  console.log(`✓ ${analyses.length} analyse(s) sélectionnée(s) (concurrency=${concurrency})\n`);
  console.log(`Plus ancienne : ${analyses.at(-1)?.created_at?.slice(0, 16)}`);
  console.log(`Plus récente  : ${analyses[0]?.created_at?.slice(0, 16)}\n`);

  // Compter les comparisons AVANT
  const { count: countBefore } = await supabase
    .from("extract_comparisons")
    .select("*", { count: "exact", head: true });
  console.log(`📊 extract_comparisons avant : ${countBefore ?? "?"} entrées\n`);

  let okCount = 0;
  let failCount = 0;
  await runWithConcurrency(
    analyses,
    async (a, idx) => {
      const label = `[${(idx + 1).toString().padStart(2, " ")}/${analyses.length}]`;
      console.log(`${label} → ${a.file_name?.slice(0, 50) ?? a.id.slice(0, 8)}…`);
      const r = await relaunchAnalysis(a);
      if (r.ok) {
        okCount++;
        console.log(`${label} ✓ replay OK (${r.durationMs}ms)`);
      } else {
        failCount++;
        console.log(`${label} ✗ ${r.error}`);
      }
    },
    concurrency,
  );

  console.log(`\n──── Résultat ────`);
  console.log(`✓ ${okCount} succès · ✗ ${failCount} échecs`);

  // Attendre 30s pour laisser le shadow V2 se propager
  console.log(`\n⏳ Attente 30s pour laisser V2 shadow finir d'insérer…`);
  await new Promise((r) => setTimeout(r, 30000));

  const { count: countAfter } = await supabase
    .from("extract_comparisons")
    .select("*", { count: "exact", head: true });
  console.log(`📊 extract_comparisons après : ${countAfter ?? "?"} entrées (Δ +${(countAfter ?? 0) - (countBefore ?? 0)})\n`);

  console.log(`👉 Lance le rapport décisionnel :`);
  console.log(`   npx tsx scripts/phase3-analyze-shadow.ts`);
}

main().catch((err) => {
  console.error("❌ Erreur :", err);
  process.exit(1);
});
