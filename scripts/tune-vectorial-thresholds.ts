#!/usr/bin/env tsx
/**
 * scripts/tune-vectorial-thresholds.ts
 *
 * 🟢 Diagnostic des seuils confidence vectoriels.
 *
 * Constat de phase1-7-by-metier.ts : 0 obs HIGH sur 1743 matchings réels.
 * Le seuil HIGH à 0.85 a été fixé au design (mai 2026) sans données réelles.
 * Asymétrie texte court (catalogue) vs texte long (devis) → similarities
 * concentrées dans 0.70-0.85 selon la doc.
 *
 * Ce script :
 *  1. Scan toutes les analyses, extrait vectorial.top_similarity de chaque match
 *  2. Calcule la distribution réelle (histogramme par bucket 0.02)
 *  3. Pour chaque seuil candidat (0.70 → 0.85), montre combien d'obs basculeraient
 *  4. Propose un seuil optimal selon 2 critères : volume HIGH ≥ 300 obs
 *     et écart MEDIAN-HIGH cohérent
 *  5. Écrit docs/refonte/RAPPORT-TUNING-SEUILS.md
 *
 * Pas de mutation DB. Lecture seule. Décision laissée à l'humain.
 *
 * USAGE :
 *   npx tsx scripts/tune-vectorial-thresholds.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
function loadEnvFile(name: string): boolean {
  const p = join(ROOT, name);
  if (!existsSync(p)) return false;
  for (const line of readFileSync(p, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
  return true;
}
loadEnvFile(".env.local");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Env vars manquantes");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface Observation {
  similarity: number;
  job_type_label: string;
  analysis_id: string;
  confidence: string;
  devis_total: number;
  top_candidate_label: string | null;
  top_candidate_similarity: number | null;
  second_candidate_similarity: number | null;
}

function safeParse(s: unknown): any {
  if (!s || typeof s !== "string") return null;
  try { return JSON.parse(s); } catch { return null; }
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}
function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(s.length - 1, Math.floor((p / 100) * s.length)));
  return s[idx];
}

async function main(): Promise<void> {
  console.log("🟢 Diagnostic seuils vectoriels — distribution des similarities réelles\n");

  // 1. Collecter toutes les observations
  console.log("⏳ Scan des analyses…");
  const observations: Observation[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("analyses")
      .select("id, raw_text")
      .not("raw_text", "is", null)
      .eq("status", "completed")
      .range(from, from + 200 - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const a of data) {
      const raw = safeParse(a.raw_text);
      const groups = Array.isArray(raw?.n8n_price_data) ? raw.n8n_price_data : [];
      for (const g of groups) {
        const sim = g?.vectorial?.top_similarity;
        if (typeof sim !== "number" || sim <= 0) continue;
        const candidates = Array.isArray(g?.vectorial?.all_candidates) ? g.vectorial.all_candidates : [];
        observations.push({
          similarity: sim,
          job_type_label: String(g.job_type_label ?? "?"),
          analysis_id: a.id,
          confidence: String(g?.vectorial?.confidence ?? "?"),
          devis_total: typeof g.devis_total_ht === "number" ? g.devis_total_ht : 0,
          top_candidate_label: candidates[0]?.label ?? null,
          top_candidate_similarity: candidates[0]?.similarity ?? null,
          second_candidate_similarity: candidates[1]?.similarity ?? null,
        });
      }
    }
    if (data.length < 200) break;
    from += 200;
  }
  console.log(`✓ ${observations.length} observations collectées (avec vectorial.top_similarity > 0)\n`);

  if (!observations.length) {
    console.log("⏸️  Aucune observation. Vérifier que le pipeline V3.5 vectoriel a tourné.");
    return;
  }

  // 2. Stats globales
  const sims = observations.map((o) => o.similarity);
  const minSim = Math.min(...sims);
  const maxSim = Math.max(...sims);
  const medSim = median(sims);
  const p10 = percentile(sims, 10);
  const p25 = percentile(sims, 25);
  const p75 = percentile(sims, 75);
  const p90 = percentile(sims, 90);

  console.log(`──── Stats globales ────`);
  console.log(`  min       : ${minSim.toFixed(4)}`);
  console.log(`  P10       : ${p10.toFixed(4)}`);
  console.log(`  P25       : ${p25.toFixed(4)}`);
  console.log(`  médiane   : ${medSim.toFixed(4)}`);
  console.log(`  P75       : ${p75.toFixed(4)}`);
  console.log(`  P90       : ${p90.toFixed(4)}`);
  console.log(`  max       : ${maxSim.toFixed(4)}`);

  // 3. Histogramme par bucket de 0.02
  console.log(`\n──── Histogramme (bucket 0.02) ────`);
  const bucketSize = 0.02;
  const buckets = new Map<string, number>();
  for (const sim of sims) {
    const b = Math.floor(sim / bucketSize) * bucketSize;
    const key = b.toFixed(2);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const sortedBuckets = [...buckets.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
  const maxCount = Math.max(...buckets.values());
  for (const [b, count] of sortedBuckets) {
    const barLen = Math.round((count / maxCount) * 50);
    const bar = "█".repeat(barLen);
    const pct = ((count / sims.length) * 100).toFixed(1);
    console.log(`  ${b}-${(Number(b) + bucketSize).toFixed(2)} ${bar.padEnd(50)} ${count.toString().padStart(4)} (${pct}%)`);
  }

  // 4. Tableau seuils candidats
  console.log(`\n──── Si tu mets HIGH au seuil X, alors… ────`);
  const candidates = [0.70, 0.72, 0.74, 0.75, 0.76, 0.77, 0.78, 0.79, 0.80, 0.82, 0.85];
  console.log(`  Seuil HIGH | Obs HIGH | %      | Obs MEDIUM | Obs <MEDIUM`);
  console.log(`  -----------|----------|--------|------------|------------`);
  const lowMediumBound = 0.65;
  for (const c of candidates) {
    const high = sims.filter((s) => s >= c).length;
    const med = sims.filter((s) => s >= lowMediumBound && s < c).length;
    const low = sims.filter((s) => s < lowMediumBound).length;
    const pct = ((high / sims.length) * 100).toFixed(1);
    console.log(`  ${c.toFixed(2)}       | ${high.toString().padStart(8)} | ${pct.padStart(5)}% | ${med.toString().padStart(10)} | ${low.toString().padStart(10)}`);
  }

  // 5. Recommandation
  const targetHigh = Math.max(300, Math.floor(sims.length * 0.3));
  let recommendedThreshold = 0.85;
  for (const c of candidates.slice().reverse()) {
    const high = sims.filter((s) => s >= c).length;
    if (high >= targetHigh) {
      recommendedThreshold = c;
      break;
    }
  }
  const recommendedHigh = sims.filter((s) => s >= recommendedThreshold).length;
  const recommendedMed = sims.filter((s) => s >= lowMediumBound && s < recommendedThreshold).length;

  console.log(`\n──── 🟢 Recommandation ────`);
  console.log(`  Seuil HIGH proposé : ${recommendedThreshold.toFixed(2)}`);
  console.log(`  Volume HIGH attendu : ${recommendedHigh} obs (${((recommendedHigh / sims.length) * 100).toFixed(1)}% de l'historique)`);
  console.log(`  Volume MEDIUM attendu : ${recommendedMed} obs`);
  console.log(`  Critère utilisé : seuil le plus haut donnant ≥ ${targetHigh} obs HIGH`);
  console.log(`\n  ⚠️ MEDIUM_BOUND (0.65) est aussi à vérifier mais le critique est HIGH.`);

  // 6. Rapport markdown
  const lines: string[] = [];
  lines.push(`# Tuning seuils vectoriels — distribution réelle\n`);
  lines.push(`**Date** : ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`**Volume** : ${observations.length} observations avec \`vectorial.top_similarity > 0\`\n`);

  lines.push(`## 🟢 Recommandation\n`);
  lines.push(`**Nouveau seuil HIGH proposé** : \`${recommendedThreshold.toFixed(2)}\` (au lieu de 0.85)\n`);
  lines.push(`Avec ce seuil :`);
  lines.push(`- **${recommendedHigh}** observations basculent en HIGH (${((recommendedHigh / sims.length) * 100).toFixed(1)}% de l'historique)`);
  lines.push(`- **${recommendedMed}** observations restent en MEDIUM (>= ${lowMediumBound.toFixed(2)} et < ${recommendedThreshold.toFixed(2)})`);
  lines.push(`- Avant : 0 HIGH / ${observations.filter((o) => o.confidence === "medium").length} MEDIUM\n`);

  lines.push(`## Statistiques globales\n`);
  lines.push(`| Métrique | Valeur |`);
  lines.push(`|---|---|`);
  lines.push(`| Min similarity | ${minSim.toFixed(4)} |`);
  lines.push(`| P10 | ${p10.toFixed(4)} |`);
  lines.push(`| P25 | ${p25.toFixed(4)} |`);
  lines.push(`| Médiane | ${medSim.toFixed(4)} |`);
  lines.push(`| P75 | ${p75.toFixed(4)} |`);
  lines.push(`| P90 | ${p90.toFixed(4)} |`);
  lines.push(`| Max similarity | ${maxSim.toFixed(4)} |\n`);

  lines.push(`## Distribution (histogramme par bucket 0.02)\n`);
  lines.push(`| Tranche | Observations | % cumul. |`);
  lines.push(`|---|---:|---:|`);
  let cum = 0;
  for (const [b, count] of sortedBuckets) {
    cum += count;
    const pct = ((cum / sims.length) * 100).toFixed(1);
    lines.push(`| ${b}–${(Number(b) + bucketSize).toFixed(2)} | ${count} | ${pct}% |`);
  }
  lines.push("");

  lines.push(`## Si on fixe HIGH au seuil X…\n`);
  lines.push(`| Seuil HIGH | Obs HIGH | % | Obs MEDIUM (≥0.65) | Obs <MED |`);
  lines.push(`|---|---:|---:|---:|---:|`);
  for (const c of candidates) {
    const high = sims.filter((s) => s >= c).length;
    const med = sims.filter((s) => s >= lowMediumBound && s < c).length;
    const low = sims.filter((s) => s < lowMediumBound).length;
    const pct = ((high / sims.length) * 100).toFixed(1);
    const marker = c === recommendedThreshold ? " 🟢" : "";
    lines.push(`| ${c.toFixed(2)}${marker} | ${high} | ${pct}% | ${med} | ${low} |`);
  }
  lines.push("");

  lines.push(`## Décision suivante\n`);
  lines.push(`Si tu valides le seuil \`${recommendedThreshold.toFixed(2)}\` :`);
  lines.push(`1. Modifier la constante \`SIMILARITY_THRESHOLD_HIGH\` dans \`supabase/functions/analyze-quote/market-matcher-vectorial.ts\``);
  lines.push(`2. Redéployer l'edge function : \`npx supabase functions deploy analyze-quote --project-ref vhrhgsqxwvouswjaiczn\``);
  lines.push(`3. Relancer \`scripts/phase1-7-by-metier.ts\` → tu verras enfin du signal HIGH`);
  lines.push(`4. Attaquer Phase 1.7 (\`scripts/phase1-7-recalibrage-fourchettes.ts\`) sur le métier prioritaire\n`);
  lines.push(`⚠️ Le seuil est rétro-actif uniquement pour les NOUVELLES analyses. Les analyses passées gardent leur classification confidence d'origine dans \`raw_text\`. Pas grave : Phase 1.7 utilise \`top_similarity\` directe + recompare au nouveau seuil au moment du calcul.\n`);

  const outDir = join(ROOT, "docs", "refonte");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const out = join(outDir, "RAPPORT-TUNING-SEUILS.md");
  writeFileSync(out, lines.join("\n"), "utf-8");
  console.log(`\n📁 Rapport écrit : ${out}`);
}

main().catch((err) => {
  console.error("❌ Erreur :", err);
  process.exit(1);
});
