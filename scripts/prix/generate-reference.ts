#!/usr/bin/env tsx
/**
 * scripts/prix/generate-reference.ts
 *
 * 2026-09-08 (décision Johan) — UNE SEULE VALORISATION DANS TOUT LE SITE.
 *
 * L'audit du 07/09 a montré que nos pages éditoriales se contredisaient entre
 * elles ET contredisaient le catalogue : peinture « 15 à 35 €/m² » sur une page,
 * « 30 à 60 » sur une autre, quand `market_prices` dit 18-65 ; carrelage
 * « 50-130 » contre « 90-170 » alors que le catalogue plafonne à 94 €. Ces
 * tableaux étaient écrits à la main, donc condamnés à diverger un peu plus à
 * chaque enrichissement du catalogue.
 *
 * Ce script fige les fourchettes du catalogue dans `src/data/prix/reference.json`,
 * que les pages Astro lisent au build via `src/lib/prix/reference.ts`. Même
 * principe que `statsPrix.ts` pour l'observatoire : la règle vit à un seul
 * endroit.
 *
 * ⚠️ LA CORRESPONDANCE poste éditorial → entrée catalogue EST UN CHOIX, pas une
 * déduction. Elle est écrite ici, en clair, avec le `job_type` exact — pour
 * qu'on puisse la relire et la contester. Ne jamais la deviner par mots-clés :
 * « carrelage » désigne 14 entrées du catalogue, de la dépose à la faïence.
 *
 * ⚠️ Les prix du catalogue sont HORS TAXES. Les pages doivent l'écrire.
 *
 * USAGE :
 *   npx tsx scripts/prix/generate-reference.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const SORTIE = join(ROOT, "src", "data", "prix");

function loadEnvFile(name: string): void {
  const p = join(ROOT, name);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
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

/**
 * Les postes cités dans les pages éditoriales, et l'entrée du catalogue qui
 * fait foi pour chacun.
 *
 * `libelle` est ce que le lecteur voit : il doit dire ce que le prix COUVRE
 * (fourniture comprise ou non), sans quoi la fourchette n'est comparable à
 * rien — c'est la leçon des pages métier de l'observatoire.
 */
const POSTES: Array<{ cle: string; jobType: string; libelle: string; note: string }> = [
  // ── Second œuvre, au m² ──
  { cle: "peinture_murs_plafonds", jobType: "peinture_murs_alias",
    libelle: "Peinture murs et plafonds", note: "Préparation + 2 couches" },
  { cle: "carrelage_fourni_pose", jobType: "carrelage_standard_fourni_pose",
    libelle: "Carrelage sol (fourni + posé)", note: "Grès cérame standard" },
  { cle: "carrelage_pose_seule", jobType: "carrelage_sol_pose",
    libelle: "Pose de carrelage sol (hors fourniture)", note: "Main-d'œuvre seule" },
  { cle: "parquet_stratifie", jobType: "parquet_stratifie_standard",
    libelle: "Parquet stratifié (fourni + posé)", note: "Entrée / milieu de gamme" },
  { cle: "parquet_massif", jobType: "pose_parquet_massif",
    libelle: "Parquet massif (fourni + posé)", note: "Chêne, essence courante" },
  { cle: "cloison_placo", jobType: "cloison_placo",
    libelle: "Cloison placo", note: "Ossature + BA13, hors isolation" },
  { cle: "demolition_cloison", jobType: "demolition_cloison",
    libelle: "Démolition de cloison", note: "Évacuation comprise" },

  // ── Isolation ──
  { cle: "isolation_interieure", jobType: "isolation_murs_interieurs",
    libelle: "Isolation des murs par l'intérieur", note: "Doublage + isolant" },
  { cle: "isolation_combles", jobType: "isolation_combles_perdus",
    libelle: "Isolation des combles perdus", note: "Soufflage ou rouleaux" },
  { cle: "isolation_exterieure", jobType: "isolation_murs_exterieurs",
    libelle: "Isolation thermique par l'extérieur (ITE)", note: "Bardage ou enduit" },

  // ── Enveloppe ──
  { cle: "toiture_refection", jobType: "toiture",
    libelle: "Toiture — réfection complète", note: "Charpente non comprise" },
  { cle: "couverture_tuile", jobType: "couverture_tuile_terre_cuite",
    libelle: "Couverture tuile terre cuite (fourni + posé)", note: "Hors charpente" },
  { cle: "fenetre_pvc", jobType: "fenetre_pvc_fourniture_pose",
    libelle: "Fenêtre PVC double vitrage (fourni + posé)", note: "Dimensions courantes" },
  { cle: "ravalement_facade", jobType: "ravalement_facade",
    libelle: "Ravalement de façade (enduit + peinture)", note: "Échafaudage compris" },

  // ── Lots complets, au forfait ──
  { cle: "cuisine_complete", jobType: "renovation_cuisine_standard",
    libelle: "Rénovation de cuisine complète", note: "Hors électroménager" },
  { cle: "sdb_complete", jobType: "renovation_salle_de_bain_standard",
    libelle: "Rénovation de salle de bain complète", note: "Petite SDB 4-6 m²" },
  { cle: "electricite_logement", jobType: "renovation_elec_complete_80m2",
    libelle: "Rénovation électrique complète", note: "Logement de 80 m²" },
  { cle: "plomberie_logement", jobType: "lot_plomberie_complet_logement",
    libelle: "Plomberie et sanitaires — logement complet", note: "Installation neuve" },
];

interface Ligne {
  job_type: string;
  label: string;
  unit: string | null;
  price_min_unit_ht: number | null;
  price_avg_unit_ht: number | null;
  price_max_unit_ht: number | null;
  fixed_min_ht: number | null;
  fixed_avg_ht: number | null;
  fixed_max_ht: number | null;
}

/**
 * Un tarif du catalogue vit soit dans les colonnes unitaires, soit dans les
 * colonnes `fixed_*` quand l'entrée est un forfait. Confondre les deux donne
 * « 0 € », qui passerait inaperçu dans un tableau.
 */
function bornes(r: Ligne): { min: number; moy: number; max: number; unite: string } {
  const unitaire = Number(r.price_max_unit_ht ?? 0) > 0;
  if (unitaire) {
    return {
      min: Number(r.price_min_unit_ht ?? 0),
      moy: Number(r.price_avg_unit_ht ?? 0),
      max: Number(r.price_max_unit_ht ?? 0),
      unite: (r.unit ?? "").replace("m2", "m²").replace("m3", "m³") || "unité",
    };
  }
  return {
    min: Number(r.fixed_min_ht ?? 0),
    moy: Number(r.fixed_avg_ht ?? 0),
    max: Number(r.fixed_max_ht ?? 0),
    unite: "forfait",
  };
}

async function main(): Promise<void> {
  console.log("💶 Génération de la référence de prix depuis market_prices\n");

  const jobTypes = POSTES.map((p) => p.jobType);
  const { data, error } = await supabase
    .from("market_prices")
    .select(
      "job_type, label, unit, price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht, fixed_min_ht, fixed_avg_ht, fixed_max_ht",
    )
    .in("job_type", jobTypes);
  if (error) {
    console.error("❌ Lecture du catalogue impossible :", error.message);
    process.exit(1);
  }

  const parJobType = new Map((data ?? []).map((r) => [r.job_type, r as Ligne]));

  const postes: Record<string, unknown> = {};
  const manquants: string[] = [];

  for (const p of POSTES) {
    const r = parJobType.get(p.jobType);
    if (!r) { manquants.push(`${p.cle} → ${p.jobType}`); continue; }
    const b = bornes(r);
    if (!(b.max > 0)) { manquants.push(`${p.cle} → ${p.jobType} (tarif à 0)`); continue; }
    postes[p.cle] = {
      libelle: p.libelle,
      note: p.note,
      unite: b.unite,
      min: Math.round(b.min),
      moy: Math.round(b.moy),
      max: Math.round(b.max),
      job_type: p.jobType,
      label_catalogue: r.label,
    };
    console.log(
      `   ✓ ${p.cle.padEnd(24)} ${String(Math.round(b.min)).padStart(6)} – ${String(Math.round(b.max)).padStart(6)} ${b.unite.padEnd(7)} (${r.label.slice(0, 44)})`,
    );
  }

  // Un poste absent du catalogue est une ERREUR bloquante : la page l'affiche,
  // et publier « — » à la place d'un prix est pire que ne rien publier.
  if (manquants.length) {
    console.error(`\n❌ ${manquants.length} poste(s) sans tarif exploitable :`);
    manquants.forEach((m) => console.error("   " + m));
    console.error("\nCorrige la correspondance dans POSTES ou complète le catalogue.");
    process.exit(1);
  }

  // Taille du catalogue : elle est annoncée en page d'accueil (« plus de 900
  // références ») et dans les meta descriptions. Elle est portée ici plutôt que
  // recopiée à la main dans chaque page — c'est une promesse chiffrée, et une
  // promesse chiffrée périmée est un mensonge.
  const { count, error: errCount } = await supabase
    .from("market_prices")
    .select("job_type", { count: "exact", head: true });
  if (errCount) {
    console.error("❌ Comptage du catalogue impossible :", errCount.message);
    process.exit(1);
  }

  // Nombre d'analyses réalisées. La page /prix-travaux-maison affichait
  // « +100 devis analysés chaque mois » : c'était vrai en mars-avril (124 puis
  // 104), plus en juillet-août (22 puis 29). Un CUMUL ne se périme pas dans le
  // mauvais sens, contrairement à un rythme mensuel.
  const { count: analyses, error: errAnalyses } = await supabase
    .from("analyses")
    .select("id", { count: "exact", head: true });
  if (errAnalyses) {
    console.error("❌ Comptage des analyses impossible :", errAnalyses.message);
    process.exit(1);
  }

  if (!existsSync(SORTIE)) mkdirSync(SORTIE, { recursive: true });
  const sortie = {
    genereLe: new Date().toISOString(),
    source: "market_prices",
    tva: "HT",
    catalogueTaille: count ?? 0,
    analysesTotal: analyses ?? 0,
    postes,
  };
  console.log(`\n   catalogue : ${count} entrées · analyses réalisées : ${analyses}`);
  writeFileSync(join(SORTIE, "reference.json"), JSON.stringify(sortie, null, 2) + "\n", "utf-8");

  console.log(`\n✓ ${Object.keys(postes).length} postes écrits dans src/data/prix/reference.json`);
  console.log("  Les pages éditoriales le lisent au build — plus aucun prix en dur.");
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
