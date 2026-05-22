#!/usr/bin/env node
/**
 * scripts/analyze_vectorial_shadow_logs.mjs
 *
 * V3.5.0 PHASE E — Analyse des logs shadow vectoriel collectés en prod via
 * `MARKET_MATCHER_VECTORIAL=shadow` (set par Julien le 2026-05-21).
 *
 * Lit les logs Supabase Edge Functions de `analyze-quote` sur les dernières
 * N heures, extrait les entrées `[V35_VECTORIAL_SHADOW]` et `[V35_VECTORIAL_SHADOW_ERROR]`,
 * et sort un rapport markdown de divergence V3.6 vs vectoriel utile pour
 * décider si Phase F (flip MARKET_MATCHER_VECTORIAL=on en prod) est safe.
 *
 * ── Format attendu des logs ────────────────────────────────────────────────
 *
 *   [V35_VECTORIAL_SHADOW] elapsed=8.2s | lines=12 v36_groups=4 vec_results=12 | high=8 medium=2 low=1 no_match=1
 *   [V35_VECTORIAL_SHADOW] v36_top_jobs=["carrelage_sol","peinture_murale","plomberie_evacuation","_"]
 *   [V35_VECTORIAL_SHADOW] vec_top_jobs=["carrelage_sol_fp","peinture_murale","peinture_plafond_mat","robinetterie_lavabo",...]
 *   [V35_VECTORIAL_SHADOW_ERROR] rpc_failed: timeout
 *
 * Les 3 lignes vont par triplet (résumé + v36_top + vec_top) — l'ordre est
 * préservé chronologiquement dans les logs Supabase.
 *
 * ── Métriques produites ────────────────────────────────────────────────────
 *
 *   1. Volumétrie : nombre d'analyses shadowées, taux d'erreur
 *   2. Distribution confidence : moyenne high/medium/low/no_match par analyse
 *   3. Dispersion V3.6 vs vectoriel : ratio lines/groups (combien de lignes le
 *      vectoriel produit en plus que V3.6 — signal de la dispersion gagnée)
 *   4. Taux de divergence top-1 : sur les analyses où vec_top_jobs et v36_top_jobs
 *      sont alignables, combien de matchs catalogue diffèrent
 *   5. Top 10 des matchs vectoriels les plus fréquents (audit qualité)
 *   6. Échantillon de 5 cas divergents pour audit manuel
 *
 * ── Usage ──────────────────────────────────────────────────────────────────
 *
 *   # Option 1 — Lit un fichier de logs exportés depuis Supabase Dashboard
 *   #   Dashboard → Functions → analyze-quote → Logs → "Download" (json ou txt)
 *   node scripts/analyze_vectorial_shadow_logs.mjs --file ~/Downloads/logs.txt
 *
 *   # Option 2 — Lit depuis stdin (pipe)
 *   cat ~/Downloads/logs.txt | node scripts/analyze_vectorial_shadow_logs.mjs
 *
 *   # Option 3 — Démo / dry-run avec données factices (pour tester le script)
 *   node scripts/analyze_vectorial_shadow_logs.mjs --demo
 *
 * Le rapport markdown est écrit dans `./shadow_report_<timestamp>.md`.
 */

import { readFileSync, writeFileSync } from "node:fs";

// ── CLI parsing ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const fileIdx = args.indexOf("--file");
const filePath = fileIdx >= 0 ? args[fileIdx + 1] : null;
const isDemo = args.includes("--demo");

// ── Demo data (pour tester le script sans logs réels) ─────────────────────

const DEMO_LOGS = `
2026-05-22T08:00:00Z [V35_VECTORIAL_SHADOW] elapsed=7.3s | lines=12 v36_groups=4 vec_results=12 | high=8 medium=2 low=1 no_match=1 errors=0
2026-05-22T08:00:00Z [V35_VECTORIAL_SHADOW] v36_top_jobs=["carrelage_sol","peinture_murale","plomberie_evacuation","peinture_sdb_piece"]
2026-05-22T08:00:00Z [V35_VECTORIAL_SHADOW] vec_top_jobs=["carrelage_sol_fp","peinture_murale","peinture_plafond_mat","robinetterie_lavabo","pose_lavabo","raccordement_eau","peinture_murale","carrelage_sol_fp","carrelage_sol_fp","peinture_plafond_mat","pose_porte","—"]
2026-05-22T08:02:00Z [V35_VECTORIAL_SHADOW] elapsed=6.8s | lines=8 v36_groups=3 vec_results=8 | high=6 medium=1 low=0 no_match=1 errors=0
2026-05-22T08:02:00Z [V35_VECTORIAL_SHADOW] v36_top_jobs=["enrobe_cle_en_main","terrassement_pelleteuse","murs_soutenement"]
2026-05-22T08:02:00Z [V35_VECTORIAL_SHADOW] vec_top_jobs=["enrobe_cle_en_main","terrassement_pelleteuse","terrassement_fond_forme","pose_pave","murs_soutenement","murs_soutenement","decapage_sol","—"]
2026-05-22T08:05:00Z [V35_VECTORIAL_SHADOW] elapsed=4.1s | lines=5 v36_groups=2 vec_results=5 | high=0 medium=0 low=0 no_match=5 errors=0
2026-05-22T08:05:00Z [V35_VECTORIAL_SHADOW] v36_top_jobs=["chaudiere_fioul_remplacement","chaudiere_fioul_remplacement"]
2026-05-22T08:05:00Z [V35_VECTORIAL_SHADOW] vec_top_jobs=["—","—","—","—","—"]
2026-05-22T08:07:00Z [V35_VECTORIAL_SHADOW_ERROR] outer_guard: rpc_failed timeout
2026-05-22T08:10:00Z [V35_VECTORIAL_SHADOW] elapsed=9.5s | lines=18 v36_groups=6 vec_results=18 | high=14 medium=3 low=1 no_match=0 errors=0
2026-05-22T08:10:00Z [V35_VECTORIAL_SHADOW] v36_top_jobs=["isolation_combles","menuiserie_fenetre_pvc","menuiserie_fenetre_pvc","ouverture_baie","vmc_double_flux","plomberie_evacuation"]
2026-05-22T08:10:00Z [V35_VECTORIAL_SHADOW] vec_top_jobs=["isolation_combles","menuiserie_fenetre_pvc","menuiserie_fenetre_pvc","menuiserie_fenetre_pvc","ouverture_baie","ouverture_baie","vmc_double_flux","vmc_double_flux","plomberie_evacuation","plomberie_evacuation","raccordement_eau","raccordement_eau","raccordement_eau","raccordement_eau","raccordement_eau","raccordement_eau","raccordement_eau","raccordement_eau"]
`.trim();

// ── Lecture des logs ───────────────────────────────────────────────────────

function readLogs() {
  if (isDemo) {
    console.log("📊 Mode --demo : utilisation de données factices.\n");
    return DEMO_LOGS;
  }
  if (filePath) {
    try {
      return readFileSync(filePath, "utf-8");
    } catch (e) {
      console.error(`❌ Impossible de lire ${filePath} : ${e.message}`);
      process.exit(1);
    }
  }
  // Lecture stdin
  try {
    return readFileSync(0, "utf-8");
  } catch {
    console.error("❌ Aucune entrée. Usage : --file <path> | --demo | cat logs | node ...");
    process.exit(1);
  }
}

// ── Parsing ────────────────────────────────────────────────────────────────

/**
 * Parse les lignes de log et regroupe par "shadow run" (triplet résumé + v36_top + vec_top).
 * Retourne un array d'objets ShadowRun.
 */
function parseShadowRuns(logsText) {
  const lines = logsText.split(/\r?\n/);
  const runs = [];
  const errors = [];
  let pending = null; // run en cours d'agrégation

  for (const line of lines) {
    const errMatch = line.match(/\[V35_VECTORIAL_SHADOW_ERROR\]\s+(.+)$/);
    if (errMatch) {
      errors.push(errMatch[1].trim());
      continue;
    }

    // Résumé (ouvre un nouveau run, finalise le précédent si incomplet)
    const summaryMatch = line.match(
      /\[V35_VECTORIAL_SHADOW\]\s+elapsed=([\d.]+)s\s+\|\s+lines=(\d+)\s+v36_groups=(\d+)\s+vec_results=(\d+)\s+\|\s+high=(\d+)\s+medium=(\d+)\s+low=(\d+)\s+no_match=(\d+)\s+errors=(\d+)/
    );
    if (summaryMatch) {
      if (pending) runs.push(pending);
      pending = {
        elapsed_s: parseFloat(summaryMatch[1]),
        lines: parseInt(summaryMatch[2], 10),
        v36_groups: parseInt(summaryMatch[3], 10),
        vec_results: parseInt(summaryMatch[4], 10),
        tier_high: parseInt(summaryMatch[5], 10),
        tier_medium: parseInt(summaryMatch[6], 10),
        tier_low: parseInt(summaryMatch[7], 10),
        tier_no_match: parseInt(summaryMatch[8], 10),
        errors: parseInt(summaryMatch[9], 10),
        v36_top_jobs: null,
        vec_top_jobs: null,
      };
      continue;
    }

    const v36Match = line.match(/\[V35_VECTORIAL_SHADOW\]\s+v36_top_jobs=(\[.*\])/);
    if (v36Match && pending) {
      try { pending.v36_top_jobs = JSON.parse(v36Match[1]); } catch { /* skip */ }
      continue;
    }

    const vecMatch = line.match(/\[V35_VECTORIAL_SHADOW\]\s+vec_top_jobs=(\[.*\])/);
    if (vecMatch && pending) {
      try { pending.vec_top_jobs = JSON.parse(vecMatch[1]); } catch { /* skip */ }
      continue;
    }
  }
  if (pending) runs.push(pending);

  return { runs, errors };
}

// ── Métriques ──────────────────────────────────────────────────────────────

function computeMetrics(runs, errors) {
  const total = runs.length;
  if (total === 0) {
    return { total: 0, errors: errors.length };
  }

  const sum = (key) => runs.reduce((s, r) => s + (r[key] ?? 0), 0);
  const avg = (key) => sum(key) / total;

  const sumLines = sum("lines");
  const sumHigh = sum("tier_high");
  const sumMedium = sum("tier_medium");
  const sumLow = sum("tier_low");
  const sumNoMatch = sum("tier_no_match");
  const sumLineLevel = sumHigh + sumMedium + sumLow + sumNoMatch;

  // Top jobs catalogue vectoriels les plus fréquents
  const jobCounts = new Map();
  for (const r of runs) {
    if (!Array.isArray(r.vec_top_jobs)) continue;
    for (const job of r.vec_top_jobs) {
      if (!job || job === "—") continue;
      jobCounts.set(job, (jobCounts.get(job) ?? 0) + 1);
    }
  }
  const topJobs = Array.from(jobCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Dispersion : vec_results / v36_groups en moyenne (combien de lignes le
  // vectoriel produit par groupe V3.6 ?)
  const dispersionRatios = runs
    .filter(r => r.v36_groups > 0 && r.vec_results > 0)
    .map(r => r.vec_results / r.v36_groups);
  const avgDispersion = dispersionRatios.length > 0
    ? dispersionRatios.reduce((s, x) => s + x, 0) / dispersionRatios.length
    : 0;

  // Échantillon de cas divergents : runs où la dispersion >= 3 (le vectoriel a
  // éclaté ≥ 3 lignes par groupe V3.6 — c'est là qu'il y a probablement un
  // bug de groupement V3.6).
  const divergentSamples = runs
    .filter(r => r.v36_groups > 0 && (r.vec_results / r.v36_groups) >= 3)
    .slice(0, 5);

  // Runs problématiques : > 50% de no_match (catalogue largement sous-couvre)
  const lowCoverageSamples = runs
    .filter(r => {
      const lineLevel = r.tier_high + r.tier_medium + r.tier_low + r.tier_no_match;
      return lineLevel > 0 && (r.tier_no_match / lineLevel) > 0.5;
    })
    .slice(0, 5);

  return {
    total,
    errors: errors.length,
    error_rate_pct: ((errors.length / (errors.length + total)) * 100).toFixed(1),
    avg_elapsed_s: avg("elapsed_s").toFixed(2),
    avg_lines_per_analysis: (sumLines / total).toFixed(1),
    avg_v36_groups: avg("v36_groups").toFixed(1),
    avg_vec_results: avg("vec_results").toFixed(1),
    avg_dispersion_ratio: avgDispersion.toFixed(2),
    tier_distribution_pct: {
      high: sumLineLevel > 0 ? ((sumHigh / sumLineLevel) * 100).toFixed(1) : "0.0",
      medium: sumLineLevel > 0 ? ((sumMedium / sumLineLevel) * 100).toFixed(1) : "0.0",
      low: sumLineLevel > 0 ? ((sumLow / sumLineLevel) * 100).toFixed(1) : "0.0",
      no_match: sumLineLevel > 0 ? ((sumNoMatch / sumLineLevel) * 100).toFixed(1) : "0.0",
    },
    top_jobs: topJobs,
    divergent_samples: divergentSamples,
    low_coverage_samples: lowCoverageSamples,
    errors_list: errors.slice(0, 10),
  };
}

// ── Rapport markdown ───────────────────────────────────────────────────────

function buildReport(metrics) {
  const now = new Date().toISOString();
  if (metrics.total === 0) {
    return `# Rapport shadow vectoriel V3.5.0 — ${now}

❌ Aucune analyse shadow trouvée dans les logs fournis.

Vérifie :
1. Que \`MARKET_MATCHER_VECTORIAL=shadow\` est bien set côté Supabase
   (\`npx supabase secrets list --project-ref vhrhgsqxwvouswjaiczn\`)
2. Que des analyses ont effectivement tourné depuis l'activation
3. Que les logs exportés couvrent la bonne période (Supabase Dashboard →
   Functions → analyze-quote → Logs → filtre période)
4. Que tu utilises le bon fichier de logs (txt ou json)

Erreurs détectées : ${metrics.errors}
`;
  }

  const t = metrics.tier_distribution_pct;
  return `# Rapport shadow vectoriel V3.5.0 — ${now}

## Volumétrie

| Métrique | Valeur |
|---|---|
| Analyses shadowées (succès) | **${metrics.total}** |
| Erreurs shadow | ${metrics.errors} (${metrics.error_rate_pct}%) |
| Latence moyenne pipeline vectoriel | ${metrics.avg_elapsed_s}s |
| Lignes devis moyennes par analyse | ${metrics.avg_lines_per_analysis} |

## Dispersion V3.6 vs vectoriel

| Métrique | V3.6 (groupement Gemini) | Vectoriel (1 ligne = 1 match) |
|---|---|---|
| Nombre moyen de résultats par analyse | ${metrics.avg_v36_groups} groupes | ${metrics.avg_vec_results} cartes |

**Ratio de dispersion moyen** : ${metrics.avg_dispersion_ratio}× (le vectoriel produit ${metrics.avg_dispersion_ratio}× plus de cartes que V3.6).

Si dispersion ≥ 3× : signal fort que V3.6 sur-groupait (regroupements aberrants type PH VISION résolus par le vectoriel).
Si dispersion ≈ 1× : V3.6 produit déjà des groupes au niveau de la ligne — peu de gain UX.

## Distribution confidence (qualité matching vectoriel)

| Tier | % des lignes | Interprétation |
|---|---|---|
| 🟢 High (≥ 0.85) | **${t.high}%** | Match catalogue très fiable |
| 🟡 Medium (0.70-0.85) | ${t.medium}% | Match plausible |
| 🟠 Low (0.50-0.70) | ${t.low}% | Match incertain |
| ⚫ No match (< 0.50) | ${t.no_match}% | Aucun équivalent catalogue |

**Critère de bascule Phase F** : high+medium ≥ 70% ET no_match < 20% sur ≥ 30 analyses → safe pour flip prod.

État actuel : ${t.high + t.medium > 0 ? `high+medium = ${(parseFloat(t.high) + parseFloat(t.medium)).toFixed(1)}%` : "N/A"}, no_match = ${t.no_match}%.

## Top 10 matchs catalogue vectoriels les plus fréquents

${metrics.top_jobs.length === 0 ? "_(aucun match vectoriel collecté)_" : metrics.top_jobs.map(([job, count], i) => `${i + 1}. \`${job}\` — ${count} occurrences`).join("\n")}

> Vérifie visuellement que ces top jobs correspondent à des prestations BTP courantes (carrelage, peinture, etc.). Si des jobs aberrants apparaissent ("chaudière fioul" sur des devis non-chauffage par exemple), c'est un signal de calibration à revoir.

## Échantillon de cas DIVERGENTS (dispersion ≥ 3×)

Cas où le vectoriel produit ≥ 3× plus de cartes que V3.6 — typiquement des bugs de groupement V3.6 résolus.

${metrics.divergent_samples.length === 0 ? "_(aucun cas divergent — V3.6 ne sur-groupait pas dans cet échantillon)_" : metrics.divergent_samples.map((r, i) => `### Cas ${i + 1}
- ${r.lines} lignes devis → V3.6 : ${r.v36_groups} groupes / vectoriel : ${r.vec_results} cartes (dispersion ${(r.vec_results / r.v36_groups).toFixed(1)}×)
- Confidence vectoriel : high=${r.tier_high} medium=${r.tier_medium} low=${r.tier_low} no_match=${r.tier_no_match}
- V3.6 top jobs : ${Array.isArray(r.v36_top_jobs) ? r.v36_top_jobs.map(j => `\`${j}\``).join(", ") : "?"}
- Vec top jobs : ${Array.isArray(r.vec_top_jobs) ? r.vec_top_jobs.slice(0, 10).map(j => `\`${j}\``).join(", ") + (r.vec_top_jobs.length > 10 ? "..." : "") : "?"}
`).join("\n")}

## Échantillon de cas FAIBLE COUVERTURE (no_match > 50%)

Cas où le catalogue ne couvre pas assez la prestation — soit devis hors-scope BTP (V3.4.28 doit kicker), soit catalogue à enrichir.

${metrics.low_coverage_samples.length === 0 ? "_(aucun cas — bonne couverture catalogue)_" : metrics.low_coverage_samples.map((r, i) => `### Cas ${i + 1}
- ${r.lines} lignes devis → no_match=${r.tier_no_match}/${r.tier_high + r.tier_medium + r.tier_low + r.tier_no_match} (${((r.tier_no_match / (r.tier_high + r.tier_medium + r.tier_low + r.tier_no_match)) * 100).toFixed(0)}%)
- V3.6 top jobs : ${Array.isArray(r.v36_top_jobs) ? r.v36_top_jobs.map(j => `\`${j}\``).join(", ") : "?"}
- Vec top jobs : ${Array.isArray(r.vec_top_jobs) ? r.vec_top_jobs.slice(0, 10).map(j => j === "—" ? "_no_match_" : `\`${j}\``).join(", ") : "?"}
`).join("\n")}

## Erreurs shadow (échantillon)

${metrics.errors_list.length === 0 ? "_(aucune erreur)_" : metrics.errors_list.map(e => `- ${e}`).join("\n")}

---

## Décision Phase F (flip MARKET_MATCHER_VECTORIAL=on)

Pour bascule sûre, vérifier :
- [${metrics.total >= 30 ? "x" : " "}] Volume suffisant (≥ 30 analyses shadowées) — actuel : ${metrics.total}
- [${parseFloat(metrics.error_rate_pct) < 5 ? "x" : " "}] Taux d'erreur < 5% — actuel : ${metrics.error_rate_pct}%
- [${parseFloat(t.high) + parseFloat(t.medium) >= 70 ? "x" : " "}] Qualité match : high+medium ≥ 70% — actuel : ${(parseFloat(t.high) + parseFloat(t.medium)).toFixed(1)}%
- [${parseFloat(t.no_match) < 20 ? "x" : " "}] Couverture : no_match < 20% — actuel : ${t.no_match}%
- [${parseFloat(metrics.avg_dispersion_ratio) >= 1.5 ? "x" : " "}] Gain UX : dispersion ≥ 1.5× — actuel : ${metrics.avg_dispersion_ratio}×

${
  metrics.total >= 30 &&
  parseFloat(metrics.error_rate_pct) < 5 &&
  (parseFloat(t.high) + parseFloat(t.medium)) >= 70 &&
  parseFloat(t.no_match) < 20 &&
  parseFloat(metrics.avg_dispersion_ratio) >= 1.5
    ? "✅ **GO** pour Phase F : `npx supabase secrets set MARKET_MATCHER_VECTORIAL=on --project-ref vhrhgsqxwvouswjaiczn` + bump ENGINE_VERSION."
    : "⏸️ **PAS ENCORE PRÊT** : laisse le shadow tourner plus longtemps OU corrige les causes des cases non cochées avant flip."
}
`;
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log("🔍 Lecture des logs shadow vectoriel...\n");
  const logsText = readLogs();
  const { runs, errors } = parseShadowRuns(logsText);
  const metrics = computeMetrics(runs, errors);

  console.log(`📊 ${metrics.total} analyses shadow + ${metrics.errors} erreurs détectées.`);

  const report = buildReport(metrics);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = `./shadow_report_${timestamp}.md`;
  writeFileSync(outPath, report, "utf-8");
  console.log(`\n✅ Rapport écrit dans : ${outPath}\n`);

  // Affiche aussi un résumé compact en console
  if (metrics.total > 0) {
    console.log(`Distribution confidence : high=${metrics.tier_distribution_pct.high}% medium=${metrics.tier_distribution_pct.medium}% low=${metrics.tier_distribution_pct.low}% no_match=${metrics.tier_distribution_pct.no_match}%`);
    console.log(`Dispersion moyenne V3.6 vs vectoriel : ${metrics.avg_dispersion_ratio}×`);
  }
}

main();
