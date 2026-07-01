#!/usr/bin/env tsx
/**
 * scripts/seo/generate-etudes-vmd.ts
 *
 * 🟢 Bloc C — Génération automatique des pages /etudes-vmd/[slug] basées sur
 * les données réelles de la table `analyses` et `analysis_corrections`.
 *
 * Chaque page est un MDX statique committé dans src/data/etudes-vmd/[slug].json
 * (les routes Astro lisent ce JSON au build pour générer les pages).
 *
 * Études générées :
 *   1. /etudes-vmd/erreurs-frequentes  — top 10 anomalies par fréquence
 *   2. /etudes-vmd/postes-surfactures  — top postes au ratio devis/marché le + élevé
 *   3. /etudes-vmd/prix-variables      — top postes avec variance max
 *   4. /etudes-vmd/oublis-frequents    — top postes manquants des devis
 *   5. /etudes-vmd/erreurs-tva         — fréquence des erreurs de TVA détectées
 *
 * Lancement manuel quand on veut un refresh :
 *   npx tsx scripts/seo/generate-etudes-vmd.ts
 *
 * Commit les fichiers générés ensuite. Vercel rebuild → pages mises à jour.
 *
 * Pourquoi statique et pas SSR : SEO (indexé), perf (CDN), et coût (zéro DB hit
 * au runtime). On accepte que les données soient "des semaines passées".
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const OUTPUT_DIR = join(ROOT, "src", "data", "observatoire");

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
loadEnvFile(".env");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

interface EtudeData {
  slug: string;
  title: string;
  description: string;
  lastGenerated: string;
  totalAnalyses: number;
  intro: string;
  stats: Array<{
    rank: number;
    label: string;
    value: string;
    subtitle?: string;
    context?: string;
  }>;
  methodology: string;
}

function safeParse(s: unknown): any {
  if (!s || typeof s !== "string") return s;
  try { return JSON.parse(s); } catch { return null; }
}

// ──────────────────────────────────────────────────────────────────────
// Étude 1 — Erreurs les plus fréquentes (depuis analysis_corrections)
// ──────────────────────────────────────────────────────────────────────

async function generateErreursFrequentes(): Promise<EtudeData> {
  // Récupère les corrections expertes (action='corrected') et compte les
  // anomalies par type/titre.
  const { data: corrections, error } = await supabase
    .from("analysis_corrections")
    .select("corrected_anomalies, original_conclusion, expert_notes")
    .in("action", ["corrected", "validated"])
    .limit(1000);

  if (error) throw new Error(error.message);

  // Aggrégation par "type d'anomalie" depuis original_conclusion.anomalies
  const counts = new Map<string, number>();
  let withAnomalies = 0;
  for (const c of corrections ?? []) {
    const orig = c.original_conclusion as any;
    const anomalies = Array.isArray(orig?.anomalies) ? orig.anomalies : [];
    if (anomalies.length > 0) withAnomalies++;
    for (const a of anomalies) {
      const titre = String(a?.titre ?? a?.title ?? "").trim();
      if (!titre) continue;
      const key = titre.slice(0, 80);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  return {
    slug: "erreurs-frequentes",
    title: "Les erreurs les plus fréquentes dans les devis travaux",
    description: `Top 10 des erreurs détectées par notre IA sur ${corrections?.length ?? 0} devis analysés. Données réelles, mises à jour mensuellement.`,
    lastGenerated: new Date().toISOString(),
    totalAnalyses: corrections?.length ?? 0,
    intro: `Sur ${corrections?.length ?? 0} devis analysés et validés par notre expert, ${withAnomalies} contiennent au moins une anomalie. Voici les 10 erreurs les plus fréquentes, classées par occurrence.`,
    stats: sorted.map(([label, count], idx) => ({
      rank: idx + 1,
      label,
      value: `${count} occurrences`,
      subtitle: `${Math.round((count / (corrections?.length ?? 1)) * 100)}% des devis concernés`,
    })),
    methodology: "Données extraites de la table analysis_corrections (Phase 2). Comptage des anomalies levées par l'IA et confirmées par notre expert humain (action = corrected ou validated).",
  };
}

// ──────────────────────────────────────────────────────────────────────
// Étude 2 — Postes les plus surfacturés (ratio devis/marché)
// ──────────────────────────────────────────────────────────────────────

async function generatePostesSurfactures(): Promise<EtudeData> {
  // Récupère les analyses récentes avec raw_text.n8n_price_data
  const { data: analyses, error } = await supabase
    .from("analyses")
    .select("id, raw_text")
    .not("raw_text", "is", null)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  // Pour chaque groupe avec un matching catalogue HIGH (≥ 0.77 depuis Phase 1.7),
  // calculer le ratio devis / marché_avg
  interface PosteAgg { jobLabel: string; ratios: number[]; }
  const map = new Map<string, PosteAgg>();
  let totalGroups = 0;
  for (const a of analyses ?? []) {
    const raw = safeParse(a.raw_text);
    const groups = Array.isArray(raw?.n8n_price_data) ? raw.n8n_price_data : [];
    for (const g of groups) {
      totalGroups++;
      const sim = g?.vectorial?.top_similarity;
      if (typeof sim !== "number" || sim < 0.77) continue;
      const cats = Array.isArray(g.catalog_job_types) ? g.catalog_job_types : [];
      const jobType = String(cats[0] ?? g.prices?.[0]?.job_type ?? "").trim();
      if (!jobType) continue;
      const label = String(g.job_type_label ?? g.prices?.[0]?.label ?? jobType);
      const devis = typeof g.devis_total_ht === "number" ? g.devis_total_ht : 0;
      const prices = Array.isArray(g.prices) ? g.prices : [];
      const qty = typeof g.main_quantity === "number" && g.main_quantity > 0 ? g.main_quantity : 1;
      let theoAvg = 0;
      for (const p of prices) {
        theoAvg += (typeof p.price_avg_unit_ht === "number" ? p.price_avg_unit_ht : 0) * qty;
        theoAvg += typeof p.fixed_avg_ht === "number" ? p.fixed_avg_ht : 0;
      }
      if (theoAvg <= 0 || devis <= 0) continue;
      const ratio = devis / theoAvg;
      if (ratio < 1.1 || ratio > 10) continue; // exclut quasi-conformes + aberrations
      let entry = map.get(jobType);
      if (!entry) { entry = { jobLabel: label, ratios: [] }; map.set(jobType, entry); }
      entry.ratios.push(ratio);
    }
  }

  // Médiane des ratios par poste, gardé si ≥ 3 obs
  const items = [...map.entries()]
    .filter(([_, v]) => v.ratios.length >= 3)
    .map(([jobType, v]) => {
      const sorted = [...v.ratios].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      return { jobType, label: v.jobLabel, median, obsCount: v.ratios.length };
    })
    .sort((a, b) => b.median - a.median)
    .slice(0, 10);

  return {
    slug: "postes-surfactures",
    title: "Les postes les plus surfacturés sur les devis travaux",
    description: `Top 10 des postes où le prix devis dépasse le plus le prix marché. Données réelles sur ${analyses?.length ?? 0} devis.`,
    lastGenerated: new Date().toISOString(),
    totalAnalyses: analyses?.length ?? 0,
    intro: `Tous les postes ne sont pas surfacturés de la même façon. Sur ${analyses?.length ?? 0} devis analysés et ${totalGroups} groupes matchés au catalogue marché, voici les 10 postes où l'écart médian entre prix devis et prix marché moyen est le plus élevé.`,
    stats: items.map((it, idx) => ({
      rank: idx + 1,
      label: it.label,
      value: `+${Math.round((it.median - 1) * 100)}%`,
      subtitle: `Médiane sur ${it.obsCount} devis observés`,
      context: `Le prix devis dépasse en moyenne de ${Math.round((it.median - 1) * 100)}% le prix marché moyen sur ce poste.`,
    })),
    methodology: "Pour chaque poste matché au catalogue avec confidence HIGH (similarity ≥ 0.77, Phase 1.7), calcul du ratio (prix devis / prix marché moyen). Médiane des ratios par poste, filtrée sur ≥ 3 observations.",
  };
}

// ──────────────────────────────────────────────────────────────────────
// Étude 3 — Prix les plus variables
// ──────────────────────────────────────────────────────────────────────

async function generatePrixVariables(): Promise<EtudeData> {
  const { data: analyses, error } = await supabase
    .from("analyses")
    .select("raw_text")
    .not("raw_text", "is", null)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  interface PosteAgg { jobLabel: string; prixUnitaires: number[]; }
  const map = new Map<string, PosteAgg>();
  for (const a of analyses ?? []) {
    const raw = safeParse(a.raw_text);
    const groups = Array.isArray(raw?.n8n_price_data) ? raw.n8n_price_data : [];
    for (const g of groups) {
      const sim = g?.vectorial?.top_similarity;
      if (typeof sim !== "number" || sim < 0.77) continue;
      const cats = Array.isArray(g.catalog_job_types) ? g.catalog_job_types : [];
      const jobType = String(cats[0] ?? "").trim();
      if (!jobType) continue;
      const label = String(g.job_type_label ?? jobType);
      const devis = typeof g.devis_total_ht === "number" ? g.devis_total_ht : 0;
      const qty = typeof g.main_quantity === "number" && g.main_quantity > 0 ? g.main_quantity : 1;
      const prixUnit = devis / qty;
      if (prixUnit <= 0 || prixUnit > 100000) continue;
      let entry = map.get(jobType);
      if (!entry) { entry = { jobLabel: label, prixUnitaires: [] }; map.set(jobType, entry); }
      entry.prixUnitaires.push(prixUnit);
    }
  }

  const items = [...map.entries()]
    .filter(([_, v]) => v.prixUnitaires.length >= 5)
    .map(([jobType, v]) => {
      const sorted = [...v.prixUnitaires].sort((a, b) => a - b);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const median = sorted[Math.floor(sorted.length / 2)];
      const cv = max > 0 && min > 0 ? max / min : 0;
      return { jobType, label: v.jobLabel, min, max, median, cv, obsCount: v.prixUnitaires.length };
    })
    .sort((a, b) => b.cv - a.cv)
    .slice(0, 10);

  return {
    slug: "prix-variables",
    title: "Les prix les plus variables d'un devis à l'autre",
    description: `Top 10 des postes où le prix unitaire varie le plus selon l'artisan. Comparez avant de signer.`,
    lastGenerated: new Date().toISOString(),
    totalAnalyses: analyses?.length ?? 0,
    intro: `Pour le même poste, les artisans peuvent facturer du simple au triple. Voici les 10 postes où la variabilité de prix est la plus forte sur ${analyses?.length ?? 0} devis analysés. Demandez toujours 3 devis sur ces postes — l'écart peut atteindre plusieurs milliers d'euros.`,
    stats: items.map((it, idx) => ({
      rank: idx + 1,
      label: it.label,
      value: `×${it.cv.toFixed(1)}`,
      subtitle: `de ${Math.round(it.min)} € à ${Math.round(it.max)} € (médiane ${Math.round(it.median)} €)`,
      context: `Sur ${it.obsCount} devis observés, l'amplitude max/min est de ×${it.cv.toFixed(1)}.`,
    })),
    methodology: "Pour chaque poste avec ≥ 5 observations, calcul du ratio max/min des prix unitaires. Tri décroissant. Seuls les matchings catalogue HIGH (similarity ≥ 0.77) sont pris en compte pour éviter le bruit.",
  };
}

// ──────────────────────────────────────────────────────────────────────
// Étude 4 — Oublis fréquents (postes manquants)
// ──────────────────────────────────────────────────────────────────────

async function generateOublisFrequents(): Promise<EtudeData> {
  // Pour cette étude, on identifie les postes qui sont fréquemment manquants
  // en croisant analyses_corrections (expert_notes mentionnent "manque" / "oublié")
  const { data, error } = await supabase
    .from("analysis_corrections")
    .select("expert_notes")
    .not("expert_notes", "is", null)
    .limit(500);
  if (error) throw new Error(error.message);

  // Mots-clés sentinelles
  const PATTERNS: Array<{ key: string; label: string }> = [
    { key: "depose", label: "Dépose de l'existant" },
    { key: "evacuat", label: "Évacuation des gravats" },
    { key: "nettoyage", label: "Nettoyage fin de chantier" },
    { key: "protection", label: "Protection du chantier" },
    { key: "echaf", label: "Échafaudage" },
    { key: "raccordement", label: "Raccordements (eau / électricité)" },
    { key: "isolation", label: "Isolation phonique / thermique" },
    { key: "etancheite", label: "Étanchéité" },
    { key: "finition", label: "Finitions / peinture finale" },
    { key: "transport", label: "Transport / livraison matériaux" },
  ];

  const counts: Record<string, number> = {};
  for (const p of PATTERNS) counts[p.label] = 0;
  for (const c of data ?? []) {
    const notes = String(c.expert_notes ?? "").toLowerCase();
    if (!notes.includes("manqu") && !notes.includes("oubli") && !notes.includes("absent")) continue;
    for (const p of PATTERNS) {
      if (notes.includes(p.key)) counts[p.label]++;
    }
  }

  const sorted = Object.entries(counts).filter(([_, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);

  return {
    slug: "oublis-frequents",
    title: "Les postes les plus fréquemment oubliés des devis travaux",
    description: "Postes que les artisans omettent le plus souvent — et que vous retrouverez en supplément sur la facture.",
    lastGenerated: new Date().toISOString(),
    totalAnalyses: data?.length ?? 0,
    intro: `Certains postes sont systématiquement omis des devis pour faire baisser le total HT affiché. Ils apparaissent ensuite sur la facture en "supplément". Voici les 10 oublis les plus fréquents sur ${data?.length ?? 0} devis revus par notre expert.`,
    stats: sorted.map(([label, count], idx) => ({
      rank: idx + 1,
      label,
      value: `${count} cas signalés`,
      subtitle: `Souvent absent du devis initial`,
    })),
    methodology: "Analyse textuelle des notes expertes dans analysis_corrections. Détection de patterns 'manqu*' / 'oubli*' / 'absent' combinés avec mots-clés métiers.",
  };
}

// ──────────────────────────────────────────────────────────────────────
// Étude 5 — Erreurs de TVA détectées
// ──────────────────────────────────────────────────────────────────────

async function generateErreursTva(): Promise<EtudeData> {
  const { data: analyses, error } = await supabase
    .from("analyses")
    .select("raw_text")
    .not("raw_text", "is", null)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  let total = 0;
  let tva20 = 0, tva10 = 0, tva5_5 = 0, tvaAutre = 0, tvaIncoherente = 0;
  for (const a of analyses ?? []) {
    const raw = safeParse(a.raw_text);
    const ext = raw?.extracted ?? raw;
    const taux = ext?.totaux?.taux_tva;
    if (typeof taux !== "number") continue;
    total++;
    if (taux === 20) tva20++;
    else if (taux === 10) tva10++;
    else if (taux === 5.5) tva5_5++;
    else tvaAutre++;
    // Détection d'incohérence : si le devis dit "rénovation" et applique 20%, c'est suspect
    const isRenovation = JSON.stringify(ext).toLowerCase().includes("renovat");
    if (isRenovation && taux === 20) tvaIncoherente++;
  }

  return {
    slug: "erreurs-tva",
    title: "Erreurs de TVA dans les devis travaux : quelle fréquence ?",
    description: `Analyse des taux de TVA appliqués sur ${total} devis : 20%, 10%, 5,5%. Combien d'erreurs détectables ?`,
    lastGenerated: new Date().toISOString(),
    totalAnalyses: total,
    intro: `Le taux de TVA applicable dépend du type de travaux et de l'ancienneté du logement. 20% pour le neuf et certains équipements, 10% en rénovation classique, 5,5% pour la rénovation énergétique. Voici la répartition réelle observée sur ${total} devis.`,
    stats: [
      { rank: 1, label: "TVA 20%", value: `${tva20} devis`, subtitle: `${Math.round((tva20 / total) * 100)}% des devis observés`, context: "Applicable au neuf et à certains équipements de + de 2 ans." },
      { rank: 2, label: "TVA 10%", value: `${tva10} devis`, subtitle: `${Math.round((tva10 / total) * 100)}% des devis observés`, context: "Applicable en rénovation classique sur des logements > 2 ans." },
      { rank: 3, label: "TVA 5,5%", value: `${tva5_5} devis`, subtitle: `${Math.round((tva5_5 / total) * 100)}% des devis observés`, context: "Applicable aux travaux d'amélioration énergétique." },
      { rank: 4, label: "TVA non standard", value: `${tvaAutre} devis`, subtitle: `${Math.round((tvaAutre / total) * 100)}% des devis observés`, context: "Taux différent de 20/10/5,5 — souvent une erreur d'extraction ou un devis étranger." },
      { rank: 5, label: "TVA potentiellement incohérente", value: `${tvaIncoherente} devis suspects`, subtitle: `Mention 'rénovation' + TVA 20%`, context: "À ces 20% applicable, le client pourrait économiser 10 points de TVA (passage à 10% ou 5,5%)." },
    ],
    methodology: `Lecture du champ extracted.totaux.taux_tva pour ${total} analyses récentes. Détection d'incohérence basique : présence du mot 'rénovation' dans l'extraction + TVA 20%.`,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("🟢 Bloc C — Génération des études VMD depuis les données réelles\n");

  const generators = [
    { name: "erreurs-frequentes", fn: generateErreursFrequentes },
    { name: "postes-surfactures", fn: generatePostesSurfactures },
    { name: "prix-variables", fn: generatePrixVariables },
    { name: "oublis-frequents", fn: generateOublisFrequents },
    { name: "erreurs-tva", fn: generateErreursTva },
  ];

  for (const g of generators) {
    console.log(`⏳ Étude : ${g.name}`);
    try {
      const data = await g.fn();
      const outPath = join(OUTPUT_DIR, `${g.name}.json`);
      writeFileSync(outPath, JSON.stringify(data, null, 2), "utf-8");
      console.log(`   ✓ ${outPath} (${data.stats.length} stats, ${data.totalAnalyses} analyses)`);
    } catch (e) {
      console.error(`   ❌ ${g.name} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log("\n✓ Études générées. Commit les fichiers JSON pour déploiement.");
  console.log("  Les routes /etudes-vmd/[slug] les lisent au build (statique, indexable Google).");
}

main().catch((e) => {
  console.error("❌ Erreur :", e);
  process.exit(1);
});
