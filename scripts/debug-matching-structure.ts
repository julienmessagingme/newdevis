#!/usr/bin/env tsx
/**
 * Debug rapide : dump la structure de raw_text.n8n_price_data
 * sur 3 analyses récentes pour comprendre où vit `job_type`.
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

const { data } = await supabase
  .from("analyses")
  .select("id, file_name, created_at, raw_text")
  .not("raw_text", "is", null)
  .eq("status", "completed")
  .order("created_at", { ascending: false })
  .limit(3);

for (const a of data ?? []) {
  console.log(`\n📄 ${a.file_name} — ${a.id.slice(0, 8)} — ${a.created_at.slice(0, 16)}`);
  let raw: any = null;
  try {
    raw = typeof a.raw_text === "string" ? JSON.parse(a.raw_text) : null;
  } catch (e) {
    console.log("  raw_text parse failed:", (e as Error).message);
    continue;
  }
  console.log("  top-level keys :", Object.keys(raw ?? {}).join(", "));
  const groups = raw?.n8n_price_data;
  if (!Array.isArray(groups)) {
    console.log("  n8n_price_data absent ou pas array");
    continue;
  }
  console.log(`  n8n_price_data : ${groups.length} groupes`);
  for (const g of groups.slice(0, 2)) {
    console.log("  ─ groupe ──────");
    console.log("    keys :", Object.keys(g).join(", "));
    console.log("    job_type :", g.job_type);
    console.log("    job_type_label :", g.job_type_label);
    console.log("    catalog_job_types :", JSON.stringify(g.catalog_job_types));
    console.log("    prices.length :", Array.isArray(g.prices) ? g.prices.length : "?");
    if (Array.isArray(g.prices) && g.prices.length > 0) {
      console.log("    prices[0] keys :", Object.keys(g.prices[0]).join(", "));
      console.log("    prices[0].job_type :", g.prices[0].job_type);
      console.log("    prices[0].label :", g.prices[0].label);
    }
    console.log("    vectorial :", g.vectorial ? Object.keys(g.vectorial).join(", ") : "(absent)");
    if (g.vectorial) {
      console.log("    vectorial.confidence :", g.vectorial.confidence);
      console.log("    vectorial.top_similarity :", g.vectorial.top_similarity);
      if (Array.isArray(g.vectorial.all_candidates) && g.vectorial.all_candidates.length > 0) {
        console.log("    vectorial.all_candidates.length :", g.vectorial.all_candidates.length);
        console.log("    vectorial.all_candidates[0] keys :", Object.keys(g.vectorial.all_candidates[0]).join(", "));
        console.log("    vectorial.all_candidates[0].job_type :", g.vectorial.all_candidates[0].job_type);
      }
    }
    console.log("    devis_total_ht :", g.devis_total_ht);
  }
}
