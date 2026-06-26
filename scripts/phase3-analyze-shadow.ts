#!/usr/bin/env tsx
/**
 * scripts/phase3-analyze-shadow.ts
 *
 * 🟢 Phase 3.2 — Rapport d'analyse du shadow run extract_v2 vs extract_v1
 *
 * Lit la table extract_comparisons + agrège les divergences pour produire
 * un rapport markdown lisible par Julien :
 *
 *   docs/refonte/RAPPORT-SHADOW-V2.md
 *
 * USAGE :
 *   npx tsx scripts/phase3-analyze-shadow.ts
 *
 * Quand le rapport montre :
 *   - V2 success rate > 95%
 *   - Divergences explicables (V2 corrige des cas V1 cassait, pas l'inverse)
 *   - Durée V2 < 1.5× durée V1
 * → on peut envisager Phase 3.3 (bascule contrôlée, EXTRACT_V2_ENABLED=on).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUTPUT = join(ROOT, "docs", "refonte", "RAPPORT-SHADOW-V2.md");

// .env loader
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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

interface ComparisonRow {
  id: string;
  analysis_id: string;
  file_name: string | null;
  diff: Record<string, any>;
  v1_duration_ms: number | null;
  v2_duration_ms: number | null;
  v2_success: boolean;
  v2_error: string | null;
  created_at: string;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

async function main(): Promise<void> {
  console.log("🟢 Phase 3.2 — Analyse shadow run extract_v2\n");

  // Fetch toutes les comparaisons (paginated)
  const all: ComparisonRow[] = [];
  const pageSize = 500;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("extract_comparisons")
      .select("id, analysis_id, file_name, diff, v1_duration_ms, v2_duration_ms, v2_success, v2_error, created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) {
      console.error("❌ Erreur fetch :", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    all.push(...(data as ComparisonRow[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  if (all.length === 0) {
    console.log("⏸️  Aucune comparaison shadow dans extract_comparisons.");
    console.log("    → Vérifier que EXTRACT_V2_ENABLED=shadow est bien posée côté edge function");
    console.log("    → Vérifier que des analyses ont été lancées depuis l'activation");
    process.exit(0);
  }

  console.log(`✓ ${all.length} comparaisons shadow collectées\n`);

  // Stats globales
  const v2Success = all.filter((r) => r.v2_success);
  const v2Fail = all.filter((r) => !r.v2_success);
  const successRate = (v2Success.length / all.length) * 100;

  const v1Durations = all.map((r) => r.v1_duration_ms ?? 0).filter((d) => d > 0);
  const v2Durations = v2Success.map((r) => r.v2_duration_ms ?? 0).filter((d) => d > 0);
  const v1MedDuration = median(v1Durations);
  const v2MedDuration = median(v2Durations);

  // Catégorisation des divergences
  let nbIdentiques = 0;
  let nbDivergencesMajeures = 0; // iban/siret/type différents
  let nbDivergencesMineures = 0; // travaux ou totaux différents
  const ecartsHt: number[] = [];
  const ecartsTravaux: number[] = [];
  const erreursTopV2 = new Map<string, number>();

  for (const c of all) {
    if (!c.v2_success) {
      const cat = (c.v2_error ?? "unknown").split(":")[0];
      erreursTopV2.set(cat, (erreursTopV2.get(cat) ?? 0) + 1);
      continue;
    }
    const d = c.diff ?? {};
    const ibanOk = d.iban_match !== false;
    const siretOk = d.siret_match !== false;
    const typeOk = d.type_document_match !== false;
    const htDiff = Math.abs(typeof d.totaux_ht_diff === "number" ? d.totaux_ht_diff : 0);
    const nbTravauxDiff = Math.abs(typeof d.nb_travaux_diff === "number" ? d.nb_travaux_diff : 0);

    ecartsHt.push(htDiff);
    ecartsTravaux.push(nbTravauxDiff);

    if (!ibanOk || !siretOk || !typeOk) {
      nbDivergencesMajeures++;
    } else if (htDiff > 10 || nbTravauxDiff > 0) {
      nbDivergencesMineures++;
    } else {
      nbIdentiques++;
    }
  }

  const htMedian = median(ecartsHt);
  const travauxMedian = median(ecartsTravaux);

  // Critère de bascule (Phase 3.3)
  const successOK = successRate >= 95;
  const durationOK = v2MedDuration < v1MedDuration * 1.5;
  const divergencesOK = nbDivergencesMajeures / all.length < 0.1; // < 10% de divergences majeures
  const greenLight = successOK && durationOK && divergencesOK;

  // Rapport
  const lines: string[] = [];
  lines.push(`# Rapport shadow run extract_v2 — Phase 3.2\n`);
  lines.push(`**Date** : ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`**Volume** : ${all.length} analyses shadow collectées`);
  lines.push(`**Période** : ${all.at(-1)?.created_at?.slice(0, 10)} → ${all[0]?.created_at?.slice(0, 10)}\n`);
  lines.push(`---\n`);

  lines.push(`## Verdict bascule Phase 3.3\n`);
  lines.push(`${greenLight ? "🟢 **FEU VERT**" : "🔴 **PAS ENCORE**"} — critères :`);
  lines.push(`- ${successOK ? "✅" : "❌"} V2 success rate >= 95% (actuel : ${successRate.toFixed(1)}%)`);
  lines.push(`- ${durationOK ? "✅" : "❌"} V2 durée médiane < 1.5× V1 (actuel : V1=${v1MedDuration.toFixed(0)}ms · V2=${v2MedDuration.toFixed(0)}ms)`);
  lines.push(`- ${divergencesOK ? "✅" : "❌"} Divergences majeures < 10% (actuel : ${((nbDivergencesMajeures / all.length) * 100).toFixed(1)}%)`);
  lines.push("");

  if (greenLight) {
    lines.push(`→ Sur les 3 critères, V2 est prêt pour Phase 3.3 (bascule contrôlée, EXTRACT_V2_ENABLED=on).`);
    lines.push(`→ Recommandation : lire les divergences majeures restantes (section 3) pour décider si on accepte le résiduel.`);
  } else {
    lines.push(`→ Avant bascule, corriger les points marqués ❌ ci-dessus.`);
    lines.push(`→ Si V2 plante souvent : voir section "Top erreurs V2"`);
    lines.push(`→ Si V2 est lent : voir maxOutputTokens / prompt verbosité`);
    lines.push(`→ Si divergences IBAN/SIRET/type : améliorer le prompt v2 sur ces champs`);
  }
  lines.push("");

  lines.push(`---\n`);
  lines.push(`## Stats globales\n`);
  lines.push(`| Indicateur | Valeur |`);
  lines.push(`|---|---|`);
  lines.push(`| Total analyses shadow | ${all.length} |`);
  lines.push(`| V2 success | ${v2Success.length} (${successRate.toFixed(1)}%) |`);
  lines.push(`| V2 fail | ${v2Fail.length} (${((v2Fail.length / all.length) * 100).toFixed(1)}%) |`);
  lines.push(`| V1 durée médiane | ${v1MedDuration.toFixed(0)} ms |`);
  lines.push(`| V2 durée médiane | ${v2MedDuration.toFixed(0)} ms |`);
  lines.push(`| Ratio V2/V1 durée | ${v1MedDuration > 0 ? (v2MedDuration / v1MedDuration).toFixed(2) : "—"} |`);
  lines.push(`| Résultats identiques (HT + travaux) | ${nbIdentiques} (${((nbIdentiques / all.length) * 100).toFixed(1)}%) |`);
  lines.push(`| Divergences mineures (HT > 10€ OU travaux ≠) | ${nbDivergencesMineures} |`);
  lines.push(`| Divergences majeures (IBAN/SIRET/type ≠) | ${nbDivergencesMajeures} |`);
  lines.push(`| Écart HT médian | ${htMedian.toFixed(0)} € |`);
  lines.push(`| Δ nb travaux médian | ${travauxMedian.toFixed(1)} |`);
  lines.push("");

  // Top erreurs V2
  if (v2Fail.length > 0) {
    lines.push(`---\n`);
    lines.push(`## Top erreurs V2 (${v2Fail.length} échecs)\n`);
    lines.push(`| Code erreur | Occurrences |`);
    lines.push(`|---|---:|`);
    const sortedErr = [...erreursTopV2.entries()].sort((a, b) => b[1] - a[1]);
    for (const [err, count] of sortedErr.slice(0, 10)) {
      lines.push(`| \`${err}\` | ${count} |`);
    }
    lines.push("");
  }

  // Divergences majeures détaillées
  if (nbDivergencesMajeures > 0) {
    lines.push(`---\n`);
    lines.push(`## Divergences majeures (${nbDivergencesMajeures}) — IBAN / SIRET / type_document différents\n`);
    lines.push(`Ces cas méritent une revue ligne par ligne pour comprendre si V2 fait mieux ou moins bien que V1.\n`);
    lines.push(`| created_at | file_name | analysis_id | summary | erreur V2 |`);
    lines.push(`|---|---|---|---|---|`);
    const majeures = all
      .filter((c) => {
        if (!c.v2_success) return false;
        const d = c.diff ?? {};
        return d.iban_match === false || d.siret_match === false || d.type_document_match === false;
      })
      .slice(0, 30);
    for (const c of majeures) {
      const summary = String(c.diff?.summary ?? "—").slice(0, 100);
      lines.push(
        `| ${c.created_at.slice(0, 16).replace("T", " ")} | ${c.file_name ?? "—"} | ${c.analysis_id.slice(0, 8)} | ${summary} | — |`,
      );
    }
    if (nbDivergencesMajeures > 30) lines.push(`| ... | | | | +${nbDivergencesMajeures - 30} autres |`);
    lines.push("");
  }

  // Comparaisons les plus récentes (pour debug)
  lines.push(`---\n`);
  lines.push(`## 20 dernières comparaisons (debug)\n`);
  lines.push(`| created_at | file_name | V1 (ms) | V2 (ms) | V2 success | summary |`);
  lines.push(`|---|---|---:|---:|---|---|`);
  for (const c of all.slice(0, 20)) {
    const summary = String(c.diff?.summary ?? c.v2_error ?? "—").slice(0, 80);
    lines.push(
      `| ${c.created_at.slice(0, 16).replace("T", " ")} | ${c.file_name ?? "—"} | ${c.v1_duration_ms ?? "—"} | ${c.v2_duration_ms ?? "—"} | ${c.v2_success ? "✅" : "❌"} | ${summary} |`,
    );
  }
  lines.push("");

  writeFileSync(OUTPUT, lines.join("\n"), "utf-8");

  console.log(`✓ Rapport généré : ${OUTPUT}\n`);
  console.log(`📊 Verdict bascule : ${greenLight ? "🟢 FEU VERT" : "🔴 PAS ENCORE"}`);
  console.log(`   Success rate V2 : ${successRate.toFixed(1)}%`);
  console.log(`   Ratio durée V2/V1 : ${v1MedDuration > 0 ? (v2MedDuration / v1MedDuration).toFixed(2) : "—"}`);
  console.log(`   Divergences majeures : ${((nbDivergencesMajeures / all.length) * 100).toFixed(1)}%`);
}

main().catch((err) => {
  console.error("❌ Erreur :", err);
  process.exit(1);
});
