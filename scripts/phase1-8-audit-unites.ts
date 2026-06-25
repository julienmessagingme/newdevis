#!/usr/bin/env tsx
/**
 * scripts/phase1-8-audit-unites.ts
 *
 * 🟢 Phase 1.8 — Audit unités incohérentes (L2)
 *
 * Le PDF de refonte cite explicitement comme 4e objectif d'audit du catalogue :
 * "(c) les unités incohérentes". On le couvre ici.
 *
 * Détecte :
 *   1. Variantes orthographiques d'unités identiques (u / u. / unite / unité)
 *   2. Unités atypiques par famille (ex: une entrée peinture en "kg")
 *   3. Entrées avec unité absente ou vide
 *   4. Forfaits vs unités physiques incohérents
 *   5. Variantes accentuées (m² / m2, pièce / piece)
 *
 * USAGE :
 *   npx tsx scripts/phase1-8-audit-unites.ts
 *
 * Sortie : docs/refonte/catalogue-classement/RAPPORT-UNITES.md
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUTPUT = join(ROOT, "docs", "refonte", "catalogue-classement", "RAPPORT-UNITES.md");

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
// Normalisation des unités
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Familles d'unités canoniques.
 * Chaque entrée du catalogue devrait avoir une unité qui tombe dans UNE de ces familles.
 */
const UNIT_FAMILIES: Record<string, { canonique: string; variantes: string[] }> = {
  surface: { canonique: "m2", variantes: ["m2", "m²", "M2", "M²", "m^2"] },
  longueur: { canonique: "ml", variantes: ["ml", "ML", "mL", "mètre", "metre"] },
  volume: { canonique: "m3", variantes: ["m3", "m³", "M3", "M³", "m^3"] },
  litre: { canonique: "l", variantes: ["l", "L", "litre", "litres"] },
  poids: { canonique: "kg", variantes: ["kg", "Kg", "KG", "kilo"] },
  tonne: { canonique: "t", variantes: ["t", "T", "tonne", "tonnes"] },
  temps: { canonique: "h", variantes: ["h", "H", "heure", "heures", "hr"] },
  unite: { canonique: "u", variantes: ["u", "U", "u.", "U.", "unite", "unité", "unités", "pce", "pcs", "p.", "p", "piece", "pièce", "pieces", "pièces"] },
  forfait: { canonique: "forfait", variantes: ["forfait", "Forfait", "FORFAIT", "fft", "fft.", "ff", "f.", "ens", "ensemble"] },
  module: { canonique: "module", variantes: ["mod", "module", "modules"] },
  point: { canonique: "point", variantes: ["point", "points", "pt", "pts"] },
  marche: { canonique: "marche", variantes: ["marche", "marches"] },
  kwc: { canonique: "kwc", variantes: ["kwc", "kWc", "KWC", "kw c"] },
};

/** Map inverse : variante → famille */
const VARIANT_TO_FAMILY = new Map<string, string>();
for (const [familyName, { variantes }] of Object.entries(UNIT_FAMILIES)) {
  for (const v of variantes) {
    VARIANT_TO_FAMILY.set(v.toLowerCase(), familyName);
  }
}

function normalizeUnit(unit: string | null): { famille: string; canonique: string | null; variante_brute: string | null } {
  if (!unit || typeof unit !== "string") {
    return { famille: "absent", canonique: null, variante_brute: unit };
  }
  const cleaned = unit.trim().toLowerCase();
  if (cleaned === "") {
    return { famille: "absent", canonique: null, variante_brute: unit };
  }
  const family = VARIANT_TO_FAMILY.get(cleaned);
  if (family) {
    return { famille: family, canonique: UNIT_FAMILIES[family].canonique, variante_brute: unit };
  }
  return { famille: "inconnu", canonique: null, variante_brute: unit };
}

// ──────────────────────────────────────────────────────────────────────────────
// Référentiel des unités attendues par métier
// (calibré sur la spec YAML peinture/carrelage + intuition BTP)
// ──────────────────────────────────────────────────────────────────────────────

const UNITES_ATTENDUES_PAR_METIER: Record<string, string[]> = {
  peinture_revetements: ["surface", "longueur", "forfait", "unite"],
  carrelage_faience: ["surface", "longueur", "forfait", "unite"],
  sols_souples: ["surface", "longueur", "forfait", "unite"],
  sols_durs: ["surface", "longueur", "forfait", "unite"],
  plomberie_sanitaires: ["unite", "forfait", "point", "longueur"],
  electricite: ["unite", "forfait", "point", "longueur", "module", "temps"],
  chauffage: ["unite", "forfait", "longueur", "surface"],
  cvc_ventilation: ["unite", "forfait", "longueur", "surface"],
  cuisine_agencement: ["unite", "forfait", "longueur", "surface"],
  maconnerie_structure: ["surface", "longueur", "volume", "unite", "forfait", "temps"],
  menuiserie_vitrages: ["unite", "forfait", "longueur", "marche"],
  metallerie_serrurerie: ["unite", "forfait", "longueur", "temps"],
  toiture_couverture: ["surface", "longueur", "forfait", "unite"],
  placo_isolation: ["surface", "longueur", "forfait", "unite"],
  demolition_depose: ["surface", "longueur", "volume", "forfait", "unite", "point"],
  stores_occultation: ["unite", "forfait"],
  charpente_bois: ["surface", "longueur", "forfait"],
  logistique_chantier: ["forfait", "surface", "unite", "longueur"],
  bardage_exterieur: ["surface", "longueur", "forfait"],
  facade_ravalement: ["surface", "forfait"],
  energie_environnement: ["unite", "forfait"],
  prestations_intellectuelles: ["forfait", "temps", "unite"],
  petits_ouvrages_divers: ["unite", "forfait", "longueur"],
  diagnostic_reglementaire: ["unite", "forfait"],
  // Ouvrages spécialisés
  ouvrages_piscine: ["unite", "forfait", "surface", "longueur", "volume"],
  ouvrages_photovoltaique: ["unite", "forfait", "kwc"],
  ouvrages_anc: ["forfait", "unite"],
  ouvrages_geothermie: ["longueur", "forfait"],
  ouvrages_paysagisme: ["surface", "longueur", "unite", "forfait"],
  ouvrages_ascenseur: ["unite", "forfait"],
  ouvrages_vrd: ["surface", "longueur", "volume", "forfait"],
  domotique_securite: ["unite", "forfait", "module"],
};

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

interface MarketRow {
  id: number;
  job_type: string;
  label: string;
  unit: string | null;
  metier: string | null;
  nature_prix: string | null;
  price_min_unit_ht: number | null;
  price_max_unit_ht: number | null;
  fixed_min_ht: number | null;
  fixed_max_ht: number | null;
}

async function main(): Promise<void> {
  console.log("🟢 Phase 1.8 — Audit unités incohérentes\n");

  const { data, error } = await supabase
    .from("market_prices")
    .select("id, job_type, label, unit, metier, nature_prix, price_min_unit_ht, price_max_unit_ht, fixed_min_ht, fixed_max_ht")
    .order("metier", { ascending: true })
    .order("unit", { ascending: true })
    .limit(2000);

  if (error) {
    console.error("❌ Erreur fetch market_prices :", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as MarketRow[];
  console.log(`✓ ${rows.length} entrées fetchées\n`);

  // ── Analyse 1 : variantes orthographiques par famille canonique ──
  const familleStats = new Map<string, Map<string, number>>(); // famille → variante → count
  for (const r of rows) {
    const { famille, variante_brute } = normalizeUnit(r.unit);
    if (!familleStats.has(famille)) familleStats.set(famille, new Map());
    const key = (variante_brute ?? "(null)").trim();
    const m = familleStats.get(famille)!;
    m.set(key, (m.get(key) ?? 0) + 1);
  }

  // ── Analyse 2 : unités atypiques par métier ──
  interface AnomalieAtypique {
    id: number;
    metier: string;
    job_type: string;
    label: string;
    unit: string | null;
    famille_unit: string;
    familles_attendues: string[];
  }
  const anomaliesAtypiques: AnomalieAtypique[] = [];
  for (const r of rows) {
    if (!r.metier) continue;
    const { famille } = normalizeUnit(r.unit);
    const attendues = UNITES_ATTENDUES_PAR_METIER[r.metier];
    if (!attendues) continue;
    if (famille === "absent" || famille === "inconnu") continue; // déjà traité ailleurs
    if (!attendues.includes(famille)) {
      anomaliesAtypiques.push({
        id: r.id,
        metier: r.metier,
        job_type: r.job_type,
        label: r.label,
        unit: r.unit,
        famille_unit: famille,
        familles_attendues: attendues,
      });
    }
  }

  // ── Analyse 3 : unités absentes ou vides ──
  const sansUnite = rows.filter((r) => !r.unit || r.unit.trim() === "");

  // ── Analyse 4 : unités inconnues (non reconnues par notre référentiel) ──
  const uniteInconnue = rows.filter((r) => {
    const { famille } = normalizeUnit(r.unit);
    return famille === "inconnu";
  });

  // ── Analyse 5 : cohérence forfait/unitaire (le forfait a fixed_*, l'unitaire a price_*) ──
  interface IncohForfait {
    id: number;
    job_type: string;
    label: string;
    unit: string | null;
    diagnostic: string;
  }
  const incohForfait: IncohForfait[] = [];
  for (const r of rows) {
    const { famille } = normalizeUnit(r.unit);
    const hasUnitaire = (r.price_min_unit_ht ?? 0) > 0 || (r.price_max_unit_ht ?? 0) > 0;
    const hasForfait = (r.fixed_min_ht ?? 0) > 0 || (r.fixed_max_ht ?? 0) > 0;

    if (famille === "forfait" && hasUnitaire && !hasForfait) {
      incohForfait.push({
        id: r.id,
        job_type: r.job_type,
        label: r.label,
        unit: r.unit,
        diagnostic: "unit=forfait mais prix renseignés en price_unit_* (devrait être fixed_*_ht)",
      });
    }
    if (famille !== "forfait" && famille !== "absent" && famille !== "inconnu" && hasForfait && !hasUnitaire) {
      incohForfait.push({
        id: r.id,
        job_type: r.job_type,
        label: r.label,
        unit: r.unit,
        diagnostic: `unit=${r.unit} (non forfait) mais prix renseignés en fixed_*_ht (devrait être price_unit_*)`,
      });
    }
    if (hasUnitaire && hasForfait) {
      incohForfait.push({
        id: r.id,
        job_type: r.job_type,
        label: r.label,
        unit: r.unit,
        diagnostic: "Entrée avec PRIX UNITAIRE et FORFAIT remplis simultanément",
      });
    }
  }

  // ── Rapport ──
  const lines: string[] = [];
  lines.push(`# Rapport audit unités catalogue — Phase 1.8\n`);
  lines.push(`**Date** : ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`**Source** : \`scripts/phase1-8-audit-unites.ts\``);
  lines.push(`**Catalogue** : ${rows.length} entrées\n`);
  lines.push(`---\n`);

  // Section 1 — Variantes orthographiques
  lines.push(`## 1. Variantes orthographiques par famille canonique\n`);
  lines.push(`Plusieurs orthographes coexistent pour la même unité métier. À normaliser pour cohérence matcher.\n`);
  lines.push(`| Famille | Canonique | Variantes observées (count) |`);
  lines.push(`|---|---|---|`);
  const famillesOrdered = [...familleStats.entries()].sort((a, b) =>
    [...b[1].values()].reduce((s, n) => s + n, 0) - [...a[1].values()].reduce((s, n) => s + n, 0),
  );
  for (const [famille, variantes] of famillesOrdered) {
    const canon = UNIT_FAMILIES[famille]?.canonique ?? "—";
    const variants = [...variantes.entries()].sort((a, b) => b[1] - a[1]);
    const formatted = variants.map(([v, n]) => `\`${v}\` (${n})`).join(" · ");
    lines.push(`| ${famille} | \`${canon}\` | ${formatted} |`);
  }
  lines.push("");

  // Détails à corriger (familles avec > 1 variante non-canonique)
  lines.push(`### 1bis. Normalisations recommandées\n`);
  let nbNorm = 0;
  for (const [famille, variantes] of familleStats) {
    if (famille === "absent" || famille === "inconnu") continue;
    const canon = UNIT_FAMILIES[famille].canonique;
    const nonCanon = [...variantes.entries()].filter(([v]) => v.toLowerCase() !== canon.toLowerCase());
    if (nonCanon.length === 0) continue;
    for (const [v, count] of nonCanon) {
      lines.push(`- \`${v}\` (${count} entrée${count > 1 ? "s" : ""}) → normaliser en \`${canon}\``);
      nbNorm++;
    }
  }
  if (nbNorm === 0) lines.push(`Aucune normalisation requise — toutes les unités sont déjà au format canonique.`);
  lines.push("");

  // Section 2 — Unités atypiques par métier
  lines.push(`## 2. Unités atypiques par métier (${anomaliesAtypiques.length})\n`);
  if (anomaliesAtypiques.length === 0) {
    lines.push(`Aucune anomalie : toutes les unités sont cohérentes avec leur famille métier.\n`);
  } else {
    lines.push(`Entrées dont l'unité ne correspond pas aux familles métier habituelles. À vérifier manuellement.\n`);
    lines.push(`| id | métier | unit (famille) | familles attendues | label |`);
    lines.push(`|---|---|---|---|---|`);
    for (const a of anomaliesAtypiques) {
      lines.push(`| ${a.id} | \`${a.metier}\` | \`${a.unit}\` (${a.famille_unit}) | ${a.familles_attendues.join(", ")} | ${a.label} |`);
    }
    lines.push("");
  }

  // Section 3 — Unités absentes
  lines.push(`## 3. Entrées avec unité absente ou vide (${sansUnite.length})\n`);
  if (sansUnite.length === 0) {
    lines.push(`Aucune entrée sans unité.\n`);
  } else {
    lines.push(`| id | métier | label |`);
    lines.push(`|---|---|---|`);
    for (const r of sansUnite.slice(0, 30)) {
      lines.push(`| ${r.id} | \`${r.metier ?? "—"}\` | ${r.label} |`);
    }
    if (sansUnite.length > 30) lines.push(`| ... | | ... (+${sansUnite.length - 30} autres) |`);
    lines.push("");
  }

  // Section 4 — Unités inconnues
  lines.push(`## 4. Unités non reconnues (${uniteInconnue.length})\n`);
  if (uniteInconnue.length === 0) {
    lines.push(`Aucune unité inconnue.\n`);
  } else {
    lines.push(`Entrées dont l'unité n'est dans aucune famille du référentiel. À examiner.\n`);
    lines.push(`| id | métier | unit | label |`);
    lines.push(`|---|---|---|---|`);
    for (const r of uniteInconnue.slice(0, 50)) {
      lines.push(`| ${r.id} | \`${r.metier ?? "—"}\` | \`${r.unit}\` | ${r.label} |`);
    }
    if (uniteInconnue.length > 50) lines.push(`| ... | | | ... (+${uniteInconnue.length - 50} autres) |`);
    lines.push("");
  }

  // Section 5 — Incohérences forfait/unitaire
  lines.push(`## 5. Incohérences forfait vs unitaire (${incohForfait.length})\n`);
  if (incohForfait.length === 0) {
    lines.push(`Aucune incohérence : chaque entrée utilise le bon champ de prix selon son unité.\n`);
  } else {
    lines.push(`Entrées où l'unité indique forfait mais les prix sont en \`price_unit_*\` (ou l'inverse). À corriger.\n`);
    lines.push(`| id | unit | job_type | diagnostic |`);
    lines.push(`|---|---|---|---|`);
    for (const i of incohForfait.slice(0, 30)) {
      lines.push(`| ${i.id} | \`${i.unit}\` | \`${i.job_type}\` | ${i.diagnostic} |`);
    }
    if (incohForfait.length > 30) lines.push(`| ... | | | ... (+${incohForfait.length - 30} autres) |`);
    lines.push("");
  }

  // Synthèse
  lines.push(`---\n`);
  lines.push(`## Synthèse\n`);
  lines.push(`| Type | Count | Action |`);
  lines.push(`|---|---:|---|`);
  lines.push(`| Variantes orthographiques à normaliser | ${nbNorm} | UPDATE label/unit pour uniformiser |`);
  lines.push(`| Unités atypiques par métier | ${anomaliesAtypiques.length} | Vérifier manuellement ou reclasser le métier |`);
  lines.push(`| Entrées sans unité | ${sansUnite.length} | Renseigner ou supprimer si forfait par défaut |`);
  lines.push(`| Unités inconnues | ${uniteInconnue.length} | Étendre référentiel OU corriger |`);
  lines.push(`| Incohérences forfait/unitaire | ${incohForfait.length} | Reclasser price_unit_* vs fixed_*_ht |`);
  lines.push("");
  lines.push(`---\n`);
  lines.push(`## Suite\n`);
  lines.push(`Si peu d'anomalies (< 30 total) → fix manuel via SQL UPDATE par lot dans Supabase Studio.`);
  lines.push(`Si beaucoup d'anomalies → script de normalisation Phase 1.8.1 à écrire.`);

  writeFileSync(OUTPUT, lines.join("\n"), "utf-8");

  // Console summary
  console.log(`✓ Rapport généré : ${OUTPUT}\n`);
  console.log(`📊 Synthèse :`);
  console.log(`   Variantes orthographiques à normaliser : ${nbNorm}`);
  console.log(`   Unités atypiques par métier : ${anomaliesAtypiques.length}`);
  console.log(`   Entrées sans unité : ${sansUnite.length}`);
  console.log(`   Unités inconnues : ${uniteInconnue.length}`);
  console.log(`   Incohérences forfait/unitaire : ${incohForfait.length}`);
  console.log(`\n👉 Ouvre RAPPORT-UNITES.md pour voir le détail`);
}

main().catch((err) => {
  console.error("❌ Erreur :", err);
  process.exit(1);
});
