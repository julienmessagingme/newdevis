#!/usr/bin/env tsx
/**
 * scripts/phase3-detail-divergences.ts
 *
 * Affiche le détail riche des comparaisons V1/V2 en divergence MAJEURE
 * (iban/siret/type_document/is_foreign différents).
 *
 * Pour chaque cas : V1 a lu X, V2 a lu Y, sur chaque champ critique.
 * On peut alors décider : V2 corrige V1 (GAIN) ou V2 régresse (BUG).
 *
 * USAGE :
 *   npx tsx scripts/phase3-detail-divergences.ts
 *   npx tsx scripts/phase3-detail-divergences.ts --limit 10
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
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

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const args = process.argv.slice(2);
const limit = Number(args[args.indexOf("--limit") + 1] ?? "50");

function fmt(v: unknown, maxLen = 60): string {
  if (v === null || v === undefined) return "—";
  const s = String(v);
  return s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s;
}

async function main(): Promise<void> {
  console.log("🟢 Détail des divergences majeures V1 vs V2\n");

  const { data, error } = await supabase
    .from("extract_comparisons")
    .select("id, analysis_id, file_name, extract_v1, extract_v2, diff, v1_duration_ms, v2_duration_ms, v2_success, created_at")
    .eq("v2_success", true)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("❌", error.message);
    process.exit(1);
  }
  if (!data?.length) {
    console.log("Aucune comparaison trouvée.");
    return;
  }

  // Filtre divergences majeures
  const majeures = data.filter((c) => {
    const d = c.diff ?? {};
    return d.iban_match === false || d.siret_match === false || d.type_document_match === false || d.is_foreign_match === false;
  });

  console.log(`📊 ${data.length} comparaisons V2 réussies · ${majeures.length} divergences majeures\n`);
  console.log("─".repeat(120));

  let idx = 0;
  for (const c of majeures.slice(0, limit)) {
    idx++;
    const v1 = (c.extract_v1 ?? {}) as any;
    const v2 = (c.extract_v2 ?? {}) as any;
    const d = (c.diff ?? {}) as any;

    console.log(`\n[${idx}/${majeures.length}] ${c.file_name ?? "(sans nom)"} — ${c.created_at.slice(0, 16).replace("T", " ")}`);
    console.log(`  analysis_id : ${c.analysis_id}`);
    console.log(`  durée       : V1=${c.v1_duration_ms}ms · V2=${c.v2_duration_ms}ms`);
    console.log(`  summary     : ${fmt(d.summary, 110)}`);
    console.log("");

    const fields: Array<[string, any, any, boolean]> = [
      ["type_document", v1.type_document, v2.type_document, d.type_document_match !== false],
      ["entreprise.nom", v1.entreprise?.nom, v2.entreprise?.nom, true],
      ["siret", v1.entreprise?.siret, v2.entreprise?.siret, d.siret_match !== false],
      ["iban", v1.entreprise?.iban, v2.entreprise?.iban, d.iban_match !== false],
      ["is_foreign", v1.is_foreign_quote, v2.is_foreign_quote, d.is_foreign_match !== false],
      ["totaux.ht", v1.totaux?.ht, v2.totaux?.ht, true],
      ["nb_travaux", Array.isArray(v1.travaux) ? v1.travaux.length : 0, Array.isArray(v2.travaux) ? v2.travaux.length : 0, true],
    ];

    for (const [label, v1Val, v2Val, equal] of fields) {
      const marker = equal ? " " : "✗";
      const v1Str = fmt(v1Val, 50).padEnd(52);
      const v2Str = fmt(v2Val, 50);
      console.log(`  ${marker} ${label.padEnd(16)} V1: ${v1Str} V2: ${v2Str}`);
    }

    console.log("─".repeat(120));
  }

  console.log(`\n✓ ${Math.min(majeures.length, limit)} divergences détaillées affichées`);
  if (majeures.length > limit) {
    console.log(`   (+${majeures.length - limit} autres non affichées — --limit ${majeures.length} pour tout voir)`);
  }
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
