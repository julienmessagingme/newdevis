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
import { porteeAnalyse } from "../../src/lib/analyse/porteeAnalyse";
import { decisionAffichee } from "../../src/lib/analyse/decisionAffichee";
import type { ConclusionData } from "../../src/lib/analyse/conclusionTypes";

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

/**
 * Les quatre chiffres du bandeau d'activité de l'accueil.
 *
 * 🔴 LE PLUS IMPORTANT : LA PART DE DEVIS DÉCONSEILLÉS SE CALCULE SUR LA
 * DÉCISION AFFICHÉE, JAMAIS SUR `verdict_global`. Depuis le 22/09 la page suit
 * `decisionAffichee.ts`, qui ne dit pas la même chose que le moteur —
 * **divergence voulue** (l'écran de revue et les KPI lisent le moteur, le client
 * lit la décision). Mesuré le 25/09 : le moteur rend 17 % de `a_risque`, la page
 * affiche **24 %** de « ne pas signer ». Publier le chiffre du moteur
 * annoncerait au public une proportion que nos propres pages ne produisent pas.
 *
 * ⚠️ TROIS AUTRES PIÈGES, TOUS MESURÉS AVANT D'ÊTRE ÉCRITS ICI :
 *
 * 1. **Un même PDF redéposé crée plusieurs analyses** (règle du 07/09). Sans
 *    déduplication par `user_id|file_name` : 494 lignes pour 423 documents,
 *    soit 17 % de gonflement. Et en ne gardant que les analyses abouties, il
 *    reste **409 devis réellement analysés**. `analysesTotal` portait 494 —
 *    il comptait donc aussi 21 analyses en ERREUR comme des « devis analysés ».
 *
 * 2. **L'écart publié est celui que la page AFFICHE**, pas `surcout_global`.
 *    Sous 300 € ou sans poste nommé, aucun montant ne sort (règles du 30/08 et
 *    du 05/09) — c'est exactement ce que rend `montantANegocier`.
 *
 * 3. **Le cumul de montant est faussé par un devis en FCFA classé `FR`** (14 M€
 *    à lui seul, noté au TODO). D'où le plafond de plausibilité — et il tombe
 *    dans un PLATEAU : de 1 M€ à 5 M€ le cumul vaut **6,88 M€ sur 381 devis**,
 *    un seul écarté. Le déplacer ne change rien, c'est ce qui le rend
 *    défendable.
 */
const PLAFOND_DEVIS_PLAUSIBLE = 1_000_000;

async function mesurerActivite(supabase: ReturnType<typeof createClient>): Promise<{
  devisAnalyses: number;
  montantAnalyseEuros: number;
  ecartMedianEuros: number;
  partDeconseillesPct: number;
  decisionsRendues: number;
}> {
  const parse = (v: unknown): any => {
    if (!v) return null;
    if (typeof v === "object") return v;
    try { return JSON.parse(v as string); } catch { return null; }
  };

  // PostgREST plafonne les retours : sans pagination on mesurerait sur le
  // premier millier de lignes en croyant tout lire.
  const lignes: any[] = [];
  for (let de = 0; ; de += 500) {
    const { data, error } = await supabase
      .from("analyses")
      .select("user_id, file_name, status, conclusion_ia, raw_text, score, alertes")
      .order("created_at", { ascending: false })
      .range(de, de + 499);
    if (error) {
      console.error("❌ Lecture des analyses impossible :", error.message);
      process.exit(1);
    }
    lignes.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }

  const vus = new Set<string>();
  const docs = lignes.filter((a) => {
    if (a.status !== "completed") return false;
    const cle = `${a.user_id}|${a.file_name}`;
    if (vus.has(cle)) return false;
    vus.add(cle);
    return true;
  });

  let montantTotal = 0;
  let deconseilles = 0;
  let decisions = 0;
  const ecarts: number[] = [];

  for (const a of docs) {
    const raw = parse(a.raw_text);
    const ht = Number(raw?.extracted?.totaux?.ht ?? raw?.extracted_data?.totaux?.ht ?? 0);
    if (ht > 0 && ht < PLAFOND_DEVIS_PLAUSIBLE) montantTotal += ht;

    const conclusion = parse(a.conclusion_ia) as ConclusionData | null;
    if (!conclusion) continue; // La conclusion naît à la 1re visite : une analyse
    decisions++;               // jamais ouverte n'a rien dit, elle ne compte pas.

    // ⚠️ EXACTEMENT CE QUE `AnalysisResult` ASSEMBLE, matériel compris. Une
    // portée tronquée annoncerait une couverture plus faible que la production
    // et ferait basculer des décisions (leçon de `preview-avis-unifie`, 23/09).
    const groupes = Array.isArray(raw?.n8n_price_data) ? raw.n8n_price_data : [];
    const materiel = Array.isArray((conclusion as any)?.materiel_verifie)
      ? (conclusion as any).materiel_verifie
      : [];
    const valeur = (m: any) => (Number(m?.prix_unitaire_devis) || 0) * (Number(m?.quantite) || 0);
    const portee = porteeAnalyse(
      groupes,
      materiel.length,
      materiel.reduce((s: number, m: any) => s + valeur(m), 0),
      [...materiel].sort((x: any, y: any) => valeur(y) - valeur(x))
        .map((m: any) => String(m?.ligne ?? m?.designation ?? "")),
    );
    const sc = parse(a.score) ?? {};
    const rouges = Array.isArray(sc?.criteres_rouges) ? sc.criteres_rouges : [];
    const criticalReasons: string[] = rouges.length > 0 ? rouges : (raw?.scoring?.criteres_rouges ?? []);

    const d = decisionAffichee(
      conclusion,
      portee,
      criticalReasons,
      a.alertes ?? [],
      raw?.verified?.anciennete_annees ?? null,
    );
    if (d.decision === "ne_pas_signer") deconseilles++;
    if (d.montantANegocier !== null) ecarts.push(d.montantANegocier);
  }

  const mediane = (t: number[]) => {
    if (!t.length) return 0;
    const s = [...t].sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)];
  };

  // Un bandeau qui afficherait « 0 » ou « — » est pire que pas de bandeau :
  // on casse le build, comme pour un poste de prix manquant.
  if (!docs.length || !decisions) {
    console.error("❌ Aucune analyse exploitable — le bandeau d'activité serait vide.");
    process.exit(1);
  }

  console.log(
    `\n   activité : ${docs.length} devis analysés · ` +
      `${(montantTotal / 1e6).toFixed(2)} M€ · ` +
      `écart médian ${Math.round(mediane(ecarts))} € sur ${ecarts.length} devis chiffrés · ` +
      `${Math.round((deconseilles / decisions) * 100)} % déconseillés sur ${decisions} décisions`,
  );

  return {
    devisAnalyses: docs.length,
    montantAnalyseEuros: Math.round(montantTotal),
    ecartMedianEuros: Math.round(mediane(ecarts)),
    partDeconseillesPct: Math.round((deconseilles / decisions) * 100),
    decisionsRendues: decisions,
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
  const activite = await mesurerActivite(supabase);

  if (!existsSync(SORTIE)) mkdirSync(SORTIE, { recursive: true });
  const sortie = {
    genereLe: new Date().toISOString(),
    source: "market_prices",
    tva: "HT",
    catalogueTaille: count ?? 0,
    analysesTotal: activite.devisAnalyses,
    montantAnalyseEuros: activite.montantAnalyseEuros,
    ecartMedianEuros: activite.ecartMedianEuros,
    partDeconseillesPct: activite.partDeconseillesPct,
    decisionsRendues: activite.decisionsRendues,
    postes,
  };
  console.log(`\n   catalogue : ${count} entrées · devis analysés : ${activite.devisAnalyses}`);
  writeFileSync(join(SORTIE, "reference.json"), JSON.stringify(sortie, null, 2) + "\n", "utf-8");

  console.log(`\n✓ ${Object.keys(postes).length} postes écrits dans src/data/prix/reference.json`);
  console.log("  Les pages éditoriales le lisent au build — plus aucun prix en dur.");
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
