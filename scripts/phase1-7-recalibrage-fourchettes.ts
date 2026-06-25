#!/usr/bin/env tsx
/**
 * scripts/phase1-7-recalibrage-fourchettes.ts
 *
 * 🟢 Phase 1.7 — Recalibrage fourchettes catalogue vs prix réels observés (L1)
 *
 * Le PDF de refonte cite :
 *   "On a ~1 200 devis-postes déjà observés, dont 94 % avec un prix unitaire
 *    recalculable : une mine pour vérifier le catalogue."
 *
 * Et en point de vigilance :
 *   "Risque de validation circulaire : ne pas recalibrer uniquement sur nos
 *    propres observations (si elles sont mal extraites, on valide une erreur
 *    par elle-même). Croiser avec des prix externes sur les postes sensibles."
 *
 * Ce script flag les divergences, il NE corrige PAS automatiquement.
 * Julien revoit chaque proposition manuellement.
 *
 * Pipeline :
 *   1. Fetch toutes les analyses avec raw_text non null + engine_version
 *      compatible (1.0.0-refonte ou V3.5.x)
 *   2. Pour chaque analyse, parse raw_text.n8n_price_data
 *   3. Pour chaque groupe avec job_type connu + devis_total_ht > 0 + qty > 0,
 *      calculer prix_unitaire_observe = devis_total_ht / main_quantity
 *   4. Aggregate par job_type : médiane, Q1, Q3, count, p10, p90
 *   5. Fetch market_prices, join sur job_type
 *   6. Pour chaque entrée avec count >= 3 (sinon trop peu d'observations) :
 *      - Compare médiane_obs vs (min, avg, max) catalogue
 *      - Évalue "couverture" : (Q1_obs, Q3_obs) inclus dans (min_cat, max_cat) ?
 *      - Flag si écart médiane > 30% OU couverture < 50%
 *   7. Génère RAPPORT-RECALIBRAGE.md
 *
 * USAGE :
 *   npx tsx scripts/phase1-7-recalibrage-fourchettes.ts
 *
 * Sortie : docs/refonte/catalogue-classement/RAPPORT-RECALIBRAGE.md
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUTPUT = join(ROOT, "docs", "refonte", "catalogue-classement", "RAPPORT-RECALIBRAGE.md");

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

// ──────────────────────────────────────────────────────────────────────────────
// Seuils de détection des divergences
// ──────────────────────────────────────────────────────────────────────────────

const MIN_OBSERVATIONS = 3; // Pas de flag avec moins de 3 observations (bruit statistique)
const ECART_MEDIANE_MAX_PCT = 0.30; // Flag si médiane catalogue dévie > 30% de médiane observée
const FORFAIT_KEYWORDS = new Set(["forfait", "fft", "fft.", "ff", "ens"]);

// ──────────────────────────────────────────────────────────────────────────────
// Statistiques
// ──────────────────────────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

interface Observation {
  prix_unitaire: number;
  qty: number;
  devis_total: number;
  analysis_id: string;
}

interface Stats {
  count: number;
  median: number;
  q1: number;
  q3: number;
  p10: number;
  p90: number;
  min: number;
  max: number;
}

function computeStats(values: number[]): Stats {
  return {
    count: values.length,
    median: median(values),
    q1: quantile(values, 0.25),
    q3: quantile(values, 0.75),
    p10: quantile(values, 0.10),
    p90: quantile(values, 0.90),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Types catalogue
// ──────────────────────────────────────────────────────────────────────────────

interface MarketEntry {
  id: number;
  job_type: string;
  label: string;
  unit: string | null;
  metier: string | null;
  nature_prix: string | null;
  price_min_unit_ht: number | null;
  price_avg_unit_ht: number | null;
  price_max_unit_ht: number | null;
  fixed_min_ht: number | null;
  fixed_avg_ht: number | null;
  fixed_max_ht: number | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Fetch + Aggregate
// ──────────────────────────────────────────────────────────────────────────────

async function fetchAllAnalyses(): Promise<Array<{ id: string; raw_text: string | null }>> {
  console.log("📥 Fetch analyses (paginated, raw_text non null)...");
  const all: Array<{ id: string; raw_text: string | null }> = [];
  const pageSize = 500;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("analyses")
      .select("id, raw_text")
      .not("raw_text", "is", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) {
      console.error("❌ Erreur fetch analyses :", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
    process.stdout.write(`  ... ${all.length} fetchées\r`);
  }
  console.log(`✓ ${all.length} analyses fetchées (avec raw_text)`);
  return all;
}

function aggregateObservations(
  analyses: Array<{ id: string; raw_text: string | null }>,
): Map<string, Observation[]> {
  console.log("🔬 Aggrégation des observations par job_type...");
  const obsByJobType = new Map<string, Observation[]>();
  let parsedOK = 0;
  let parsedKO = 0;
  let groupsTotal = 0;
  let groupsUsable = 0;

  for (const a of analyses) {
    if (!a.raw_text) continue;
    let raw: any;
    try {
      raw = JSON.parse(a.raw_text);
      parsedOK++;
    } catch {
      parsedKO++;
      continue;
    }
    const priceData = Array.isArray(raw.n8n_price_data) ? raw.n8n_price_data : [];
    for (const g of priceData) {
      if (!g || typeof g !== "object") continue;
      groupsTotal++;
      const jobType: string | undefined = g.job_type;
      if (!jobType || typeof jobType !== "string") continue;
      const devisTotal = typeof g.devis_total_ht === "number" ? g.devis_total_ht : 0;
      const qty = typeof g.main_quantity === "number" && g.main_quantity > 0 ? g.main_quantity : 0;
      if (devisTotal <= 0 || qty <= 0) continue;

      // Skip les forfaits (qty=1 typique mais prix non comparable au m²)
      const mainUnit = (g.main_unit ?? "").toString().toLowerCase().trim();
      if (FORFAIT_KEYWORDS.has(mainUnit)) continue;
      if (qty === 1 && (mainUnit === "" || mainUnit === "u")) continue;

      const prixObs = devisTotal / qty;
      // Filtre aberrant : 0 < prix < 1M €/unité (au-delà c'est probablement un bug d'extraction)
      if (prixObs <= 0 || prixObs > 1_000_000) continue;

      groupsUsable++;
      if (!obsByJobType.has(jobType)) obsByJobType.set(jobType, []);
      obsByJobType.get(jobType)!.push({
        prix_unitaire: prixObs,
        qty,
        devis_total: devisTotal,
        analysis_id: a.id,
      });
    }
  }
  console.log(`✓ Analyses parsées : ${parsedOK} OK, ${parsedKO} KO`);
  console.log(`✓ Groupes priceData : ${groupsTotal} total, ${groupsUsable} utilisables (qty>0, devis>0, non-forfait)`);
  console.log(`✓ job_types distincts observés : ${obsByJobType.size}\n`);
  return obsByJobType;
}

async function fetchCatalogue(): Promise<MarketEntry[]> {
  const { data, error } = await supabase
    .from("market_prices")
    .select(
      "id, job_type, label, unit, metier, nature_prix, price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht, fixed_min_ht, fixed_avg_ht, fixed_max_ht",
    )
    .order("job_type", { ascending: true })
    .limit(2000);
  if (error) {
    console.error("❌ Erreur fetch market_prices :", error.message);
    process.exit(1);
  }
  return (data ?? []) as MarketEntry[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Analyse divergences
// ──────────────────────────────────────────────────────────────────────────────

interface Divergence {
  id: number;
  job_type: string;
  label: string;
  metier: string | null;
  unit: string | null;
  /** Stats catalogue */
  cat_min: number | null;
  cat_avg: number | null;
  cat_max: number | null;
  /** Stats observées */
  obs_count: number;
  obs_median: number;
  obs_q1: number;
  obs_q3: number;
  obs_p10: number;
  obs_p90: number;
  /** Diagnostic */
  ecart_pct: number; // (médiane_obs − médiane_cat) / médiane_cat
  couvre_q1q3: boolean;
  flag_severity: "vert" | "orange" | "rouge";
  proposition: string;
}

function analyseDivergence(
  entry: MarketEntry,
  observations: Observation[],
): Divergence | null {
  if (observations.length < MIN_OBSERVATIONS) return null;

  const prices = observations.map((o) => o.prix_unitaire);
  const stats = computeStats(prices);

  const catMin = entry.price_min_unit_ht;
  const catMax = entry.price_max_unit_ht;
  const catAvg = entry.price_avg_unit_ht;

  // Entrée forfait sans price_unit_ht — skip
  if ((catMin === null || catMin === 0) && (catMax === null || catMax === 0)) return null;

  const catMed = catAvg && catAvg > 0 ? catAvg : ((catMin ?? 0) + (catMax ?? 0)) / 2;
  const ecart = catMed > 0 ? (stats.median - catMed) / catMed : 0;
  const couvre =
    catMin !== null &&
    catMax !== null &&
    stats.q1 >= catMin * 0.7 &&
    stats.q3 <= catMax * 1.3;

  let severity: "vert" | "orange" | "rouge" = "vert";
  let proposition = "Catalogue OK — couverture cohérente avec les observations";

  if (Math.abs(ecart) > ECART_MEDIANE_MAX_PCT) {
    severity = "rouge";
    const direction = ecart > 0 ? "SOUS-ÉVALUÉ" : "SUR-ÉVALUÉ";
    proposition = `Catalogue ${direction} : médiane observée ${stats.median.toFixed(2)} ≠ médiane catalogue ${catMed.toFixed(2)} (écart ${(ecart * 100).toFixed(0)}%). Suggérer fourchette [${stats.p10.toFixed(2)}, ${stats.p90.toFixed(2)}]`;
  } else if (!couvre) {
    severity = "orange";
    proposition = `Fourchette catalogue [${(catMin ?? 0).toFixed(2)}, ${(catMax ?? 0).toFixed(2)}] ne couvre pas la zone Q1-Q3 observée [${stats.q1.toFixed(2)}, ${stats.q3.toFixed(2)}]. Élargir vers [${stats.p10.toFixed(2)}, ${stats.p90.toFixed(2)}]`;
  }

  return {
    id: entry.id,
    job_type: entry.job_type,
    label: entry.label,
    metier: entry.metier,
    unit: entry.unit,
    cat_min: catMin,
    cat_avg: catAvg,
    cat_max: catMax,
    obs_count: stats.count,
    obs_median: stats.median,
    obs_q1: stats.q1,
    obs_q3: stats.q3,
    obs_p10: stats.p10,
    obs_p90: stats.p90,
    ecart_pct: ecart,
    couvre_q1q3: couvre,
    flag_severity: severity,
    proposition,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("🟢 Phase 1.7 — Recalibrage fourchettes vs prix réels observés\n");

  const analyses = await fetchAllAnalyses();
  const observations = aggregateObservations(analyses);
  const catalogue = await fetchCatalogue();
  console.log(`✓ ${catalogue.length} entrées catalogue\n`);

  const divergences: Divergence[] = [];
  let withObs = 0;
  let noObs = 0;
  for (const entry of catalogue) {
    const obs = observations.get(entry.job_type);
    if (!obs || obs.length === 0) {
      noObs++;
      continue;
    }
    withObs++;
    const d = analyseDivergence(entry, obs);
    if (d) divergences.push(d);
  }

  const nbRouge = divergences.filter((d) => d.flag_severity === "rouge").length;
  const nbOrange = divergences.filter((d) => d.flag_severity === "orange").length;
  const nbVert = divergences.filter((d) => d.flag_severity === "vert").length;

  console.log(`📊 Synthèse :`);
  console.log(`   ${withObs} entrées catalogue avec observations`);
  console.log(`   ${noObs} entrées catalogue jamais matchées (pas d'observation)`);
  console.log(`   ${divergences.length} entrées analysables (>= ${MIN_OBSERVATIONS} obs)`);
  console.log(`   🔴 ${nbRouge} divergences MAJEURES (écart médiane > ${ECART_MEDIANE_MAX_PCT * 100}%)`);
  console.log(`   🟠 ${nbOrange} divergences ZONE (fourchette ne couvre pas Q1-Q3)`);
  console.log(`   🟢 ${nbVert} cohérentes\n`);

  // Tri par sévérité puis count décroissant
  const severityOrder = { rouge: 0, orange: 1, vert: 2 };
  divergences.sort((a, b) => {
    if (a.flag_severity !== b.flag_severity) {
      return severityOrder[a.flag_severity] - severityOrder[b.flag_severity];
    }
    return b.obs_count - a.obs_count;
  });

  // Rapport
  const lines: string[] = [];
  lines.push(`# Rapport recalibrage fourchettes — Phase 1.7\n`);
  lines.push(`**Date** : ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`**Source** : \`scripts/phase1-7-recalibrage-fourchettes.ts\``);
  lines.push(`**Méthode** : confrontation catalogue (${catalogue.length} entrées) vs prix unitaires observés dans ${analyses.length} analyses passées.\n`);
  lines.push(`⚠️ **Risque de validation circulaire** (PDF point de vigilance) : ces propositions sont basées sur nos propres observations. Si l'extraction est mal lue sur certains postes, on validerait une erreur par elle-même. **Julien valide manuellement chaque proposition rouge**. Pour les postes sensibles, croiser avec prix externes (Batiprix, Capeb, etc.).\n`);
  lines.push(`---\n`);
  lines.push(`## Synthèse\n`);
  lines.push(`| Statut | Nb | Action |`);
  lines.push(`|---|---:|---|`);
  lines.push(`| 🔴 Divergence majeure (écart médiane > ${ECART_MEDIANE_MAX_PCT * 100}%) | ${nbRouge} | UPDATE fourchette (validation Julien requise) |`);
  lines.push(`| 🟠 Couverture insuffisante (Q1-Q3 hors fourchette) | ${nbOrange} | Élargir la fourchette (souple) |`);
  lines.push(`| 🟢 Catalogue cohérent | ${nbVert} | Aucune action |`);
  lines.push(`| Entrées sans observations | ${noObs} | Hors scope (pas de données pour comparer) |`);
  lines.push(`| Entrées avec < ${MIN_OBSERVATIONS} obs | ${withObs - divergences.length} | Insuffisant statistiquement, on garde tel quel |`);
  lines.push("");
  lines.push(`---\n`);

  // Section divergences rouges
  lines.push(`## 1. Divergences MAJEURES (${nbRouge}) — validation Julien requise\n`);
  if (nbRouge === 0) {
    lines.push(`Aucune divergence majeure. Le catalogue est globalement bien calibré sur les observations.\n`);
  } else {
    lines.push(`| id | métier | job_type | label | obs (count) | médiane obs | catalogue [min, avg, max] | écart | proposition |`);
    lines.push(`|---|---|---|---|---:|---:|---|---:|---|`);
    for (const d of divergences.filter((x) => x.flag_severity === "rouge")) {
      const cat = `[${(d.cat_min ?? 0).toFixed(0)}, ${(d.cat_avg ?? 0).toFixed(0)}, ${(d.cat_max ?? 0).toFixed(0)}]`;
      lines.push(
        `| ${d.id} | \`${d.metier ?? "—"}\` | \`${d.job_type}\` | ${d.label} | ${d.obs_count} | ${d.obs_median.toFixed(2)} | ${cat} | ${(d.ecart_pct * 100).toFixed(0)}% | ${d.proposition} |`,
      );
    }
    lines.push("");
  }

  // Section divergences oranges
  lines.push(`## 2. Couverture insuffisante (${nbOrange}) — élargir fourchette\n`);
  if (nbOrange === 0) {
    lines.push(`Aucune divergence de couverture.\n`);
  } else {
    lines.push(`| id | métier | job_type | label | obs | Q1-Q3 obs | catalogue | proposition |`);
    lines.push(`|---|---|---|---|---:|---|---|---|`);
    for (const d of divergences.filter((x) => x.flag_severity === "orange").slice(0, 50)) {
      const cat = `[${(d.cat_min ?? 0).toFixed(0)}, ${(d.cat_max ?? 0).toFixed(0)}]`;
      const q1q3 = `[${d.obs_q1.toFixed(2)}, ${d.obs_q3.toFixed(2)}]`;
      lines.push(
        `| ${d.id} | \`${d.metier ?? "—"}\` | \`${d.job_type}\` | ${d.label} | ${d.obs_count} | ${q1q3} | ${cat} | ${d.proposition} |`,
      );
    }
    if (nbOrange > 50) lines.push(`| ... | | | | | | | ... (+${nbOrange - 50} autres) |`);
    lines.push("");
  }

  // Section vertes (résumé seulement)
  lines.push(`## 3. Catalogue cohérent (${nbVert})\n`);
  lines.push(`${nbVert} entrées sont en zone verte (médiane observée dans la fourchette catalogue, écart < ${ECART_MEDIANE_MAX_PCT * 100}%). Pas d'action nécessaire.\n`);

  // Section entrées sans observations
  lines.push(`## 4. Entrées catalogue jamais matchées (${noObs})\n`);
  lines.push(`${noObs} entrées catalogue n'ont jamais été matchées dans les analyses passées. Cela peut signifier :`);
  lines.push(`- elles couvrent des cas rares (ex: ouvrages_geothermie, ouvrages_ascenseur)`);
  lines.push(`- OU le matcher V3.5 ne les trouve jamais (problème d'empreintes ou de couverture sémantique)`);
  lines.push(`- OU notre échantillon de devis ne couvre pas ces métiers`);
  lines.push("");
  lines.push(`Pas d'action automatique. Si Julien identifie des cas où le matcher devrait les trouver et ne les trouve pas → Phase 1.6 (régénération embeddings) ou enrichissement libellés.\n`);

  lines.push(`---\n`);
  lines.push(`## Workflow recommandé Julien\n`);
  lines.push(`1. **Relire les ${nbRouge} divergences rouges en priorité** (top de la table section 1)`);
  lines.push(`2. **Pour chaque proposition acceptée**, écrire dans un nouveau fichier \`phase1-7-recalibrage.sql\` :`);
  lines.push(`\`\`\`sql`);
  lines.push(`UPDATE public.market_prices SET`);
  lines.push(`  price_min_unit_ht = <nouveau_min>,`);
  lines.push(`  price_avg_unit_ht = <nouvelle_med>,`);
  lines.push(`  price_max_unit_ht = <nouveau_max>`);
  lines.push(`WHERE id = <id>;`);
  lines.push(`\`\`\``);
  lines.push(`3. **Pour les rouges refusées** (validation circulaire suspectée) → marquer dans notes_julien.md pour mémoire`);
  lines.push(`4. **Les oranges** peuvent attendre — élargissement souple, faisable en lot plus tard`);
  lines.push(`5. **Après application du SQL** → relancer Phase 1.6 (régénération embeddings) si les libellés ont aussi changé`);

  writeFileSync(OUTPUT, lines.join("\n"), "utf-8");

  console.log(`✓ Rapport généré : ${OUTPUT}\n`);
  console.log(`👉 Ouvre RAPPORT-RECALIBRAGE.md pour voir le détail`);
}

main().catch((err) => {
  console.error("❌ Erreur :", err);
  process.exit(1);
});
