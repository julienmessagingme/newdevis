#!/usr/bin/env tsx
/**
 * scripts/phase1-7-by-metier.ts
 *
 * 🟢 Phase 1.7 — Inventaire par métier des observations prix réels
 *
 * Pour aider à choisir par quel métier commencer le recalibrage du catalogue,
 * ce script agrège les observations issues des analyses passées :
 *   - Pour chaque ligne devis qui a matché une entrée catalogue
 *   - Compte les observations par metier (market_prices.metier)
 *   - Trie par volume desc
 *   - Liste, pour chaque métier, les top catégories (job_type_label)
 *
 * Output : docs/refonte/RAPPORT-METIERS-VOLUME.md
 *
 * Reco : commencer le recalibrage par le métier qui a le plus de signal
 * (le plus haut dans le tableau).
 *
 * USAGE :
 *   npx tsx scripts/phase1-7-by-metier.ts
 *   npx tsx scripts/phase1-7-by-metier.ts --min-obs 5    # filtre catégories < 5 obs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
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

const args = process.argv.slice(2);
const minObs = Number(args[args.indexOf("--min-obs") + 1] ?? "1");

interface MarketEntry {
  id: string;
  job_type: string;
  label: string;
  metier: string | null;
  nature_prix: string | null;
  unit: string | null;
}

interface JobAgg {
  job_type: string;
  label: string;
  metier: string;
  nature_prix: string;
  unit: string;
  obs_count: number;
  obs_total_ht: number;
}

function safeParse(s: unknown): any {
  if (!s || typeof s !== "string") return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  console.log("🟢 Phase 1.7 — Inventaire par métier des observations\n");

  // 1) Charger le catalogue (mapping job_type → metier)
  console.log("⏳ Chargement catalogue market_prices…");
  const catalog = new Map<string, MarketEntry>();
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("market_prices")
      .select("id, job_type, label, metier, nature_prix, unit")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`market_prices: ${error.message}`);
    if (!data?.length) break;
    for (const e of data as MarketEntry[]) catalog.set(e.job_type, e);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  console.log(`✓ ${catalog.size} entrées catalogue chargées`);

  // 2) Parcourir toutes les analyses complétées avec raw_text non null
  console.log("\n⏳ Parcours des analyses…");
  let totalAnalyses = 0;
  let totalGroupsMatched = 0;
  const jobAgg = new Map<string, JobAgg>();
  let analysesFrom = 0;
  while (true) {
    const { data, error } = await supabase
      .from("analyses")
      .select("id, raw_text")
      .not("raw_text", "is", null)
      .eq("status", "completed")
      .range(analysesFrom, analysesFrom + 200 - 1);
    if (error) throw new Error(`analyses: ${error.message}`);
    if (!data?.length) break;

    for (const a of data) {
      totalAnalyses++;
      const raw = safeParse(a.raw_text);
      const groups = Array.isArray(raw?.n8n_price_data) ? raw.n8n_price_data : [];
      for (const g of groups) {
        if (!g || typeof g !== "object") continue;
        const jobType = String(g.job_type ?? "").trim();
        if (!jobType) continue;
        const devisTotal = typeof g.devis_total_ht === "number" ? g.devis_total_ht : 0;
        if (devisTotal <= 0) continue;
        const entry = catalog.get(jobType);
        if (!entry) continue;
        totalGroupsMatched++;
        const key = jobType;
        const existing = jobAgg.get(key);
        if (existing) {
          existing.obs_count++;
          existing.obs_total_ht += devisTotal;
        } else {
          jobAgg.set(key, {
            job_type: jobType,
            label: entry.label,
            metier: entry.metier ?? "(non classé)",
            nature_prix: entry.nature_prix ?? "?",
            unit: entry.unit ?? "?",
            obs_count: 1,
            obs_total_ht: devisTotal,
          });
        }
      }
    }
    if (data.length < 200) break;
    analysesFrom += 200;
  }
  console.log(`✓ ${totalAnalyses} analyses parcourues · ${totalGroupsMatched} groupes matchés au catalogue`);

  // 3) Agrégation par métier
  interface MetierAgg {
    metier: string;
    nb_categories: number;
    nb_obs: number;
    total_ht: number;
    top_categories: { job_type: string; label: string; obs_count: number; obs_total_ht: number }[];
  }
  const metierAgg = new Map<string, MetierAgg>();
  for (const j of jobAgg.values()) {
    if (j.obs_count < minObs) continue;
    const m = metierAgg.get(j.metier) ?? {
      metier: j.metier,
      nb_categories: 0,
      nb_obs: 0,
      total_ht: 0,
      top_categories: [],
    };
    m.nb_categories++;
    m.nb_obs += j.obs_count;
    m.total_ht += j.obs_total_ht;
    m.top_categories.push({
      job_type: j.job_type,
      label: j.label,
      obs_count: j.obs_count,
      obs_total_ht: j.obs_total_ht,
    });
    metierAgg.set(j.metier, m);
  }
  for (const m of metierAgg.values()) {
    m.top_categories.sort((a, b) => b.obs_count - a.obs_count);
  }

  const sortedMetiers = [...metierAgg.values()].sort((a, b) => b.nb_obs - a.nb_obs);

  // 4) Rapport
  const lines: string[] = [];
  lines.push(`# Inventaire par métier — observations prix réels\n`);
  lines.push(`**Date** : ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`**Volume** : ${totalAnalyses} analyses parcourues · ${totalGroupsMatched} groupes matchés au catalogue`);
  lines.push(`**Filtre** : catégories avec >= ${minObs} observations\n`);
  lines.push(`---\n`);

  lines.push(`## Verdict — par quel métier commencer ?\n`);
  if (sortedMetiers.length === 0) {
    lines.push(`⚠️ Aucun métier avec assez d'observations pour démarrer.\n`);
  } else {
    const top = sortedMetiers[0];
    lines.push(`🟢 **Démarre par : \`${top.metier}\`** — ${top.nb_obs} observations sur ${top.nb_categories} catégories (~${Math.round(top.total_ht)}€ HT cumulés).\n`);
    lines.push(`C'est le métier où tu as le plus de signal. Tu peux lancer ensuite :\n`);
    lines.push("```bash");
    lines.push(`npx tsx scripts/phase1-7-recalibrage-fourchettes.ts --metier ${top.metier}`);
    lines.push("```");
    lines.push(`\n(le flag \`--metier\` n'existe peut-être pas encore dans phase1-7 — à ajouter si besoin)\n`);
  }
  lines.push(`---\n`);

  lines.push(`## Tableau récapitulatif\n`);
  lines.push(`| Rang | Métier | Catégories | Observations | Volume €HT cumulé |`);
  lines.push(`|---:|---|---:|---:|---:|`);
  for (let i = 0; i < sortedMetiers.length; i++) {
    const m = sortedMetiers[i];
    lines.push(
      `| ${i + 1} | \`${m.metier}\` | ${m.nb_categories} | ${m.nb_obs} | ${Math.round(m.total_ht).toLocaleString("fr-FR")} € |`,
    );
  }
  lines.push("");

  lines.push(`---\n`);
  lines.push(`## Détail par métier (top 5 catégories chacun)\n`);
  for (const m of sortedMetiers) {
    lines.push(`### \`${m.metier}\` — ${m.nb_obs} obs · ${m.nb_categories} cat · ~${Math.round(m.total_ht).toLocaleString("fr-FR")}€\n`);
    lines.push(`| job_type | label | obs | total €HT |`);
    lines.push(`|---|---|---:|---:|`);
    for (const c of m.top_categories.slice(0, 5)) {
      lines.push(
        `| \`${c.job_type}\` | ${c.label.slice(0, 60)} | ${c.obs_count} | ${Math.round(c.obs_total_ht).toLocaleString("fr-FR")} |`,
      );
    }
    if (m.top_categories.length > 5) {
      lines.push(`| ... | (+${m.top_categories.length - 5} autres catégories) | | |`);
    }
    lines.push("");
  }

  const outDir = join(ROOT, "docs", "refonte");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const out = join(outDir, "RAPPORT-METIERS-VOLUME.md");
  writeFileSync(out, lines.join("\n"), "utf-8");

  console.log(`\n✓ Rapport écrit : ${out}`);
  if (sortedMetiers.length > 0) {
    const top = sortedMetiers[0];
    console.log(`\n🟢 Métier à attaquer en premier : ${top.metier} (${top.nb_obs} obs · ${top.nb_categories} cat)`);
  }
}

main().catch((err) => {
  console.error("❌ Erreur :", err);
  process.exit(1);
});
