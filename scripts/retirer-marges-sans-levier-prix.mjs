/**
 * scripts/retirer-marges-sans-levier-prix.mjs
 *
 * 2026-09-11 — RÉPARE À LA MAIN LES CONCLUSIONS DÉJÀ ÉCRITES qui annoncent
 * « 3 à 5 % de marge » sans qu'aucun levier de PRIX ne la porte.
 *
 * Le correctif de `leviersBuilder.ts` (même jour) ne vaut que pour les analyses
 * à VENIR : la conclusion est calculée une fois et stockée, et on ne bumpe pas
 * `ENGINE_VERSION` pour un cas signalé. Les pages déjà livrées continueraient
 * donc d'afficher « Marge de négociation estimée : 3 à 5 % en négociation
 * courtoise » sous un motif qui parle d'acompte — c'est-à-dire une économie qui
 * n'existe pas. Même geste que le 2026-09-05 (conclusion réparée à la main
 * après le correctif du hero).
 *
 * ⚠️ CHIRURGIE MINIMALE : on met `verdict_ligne.marge` à `null`, RIEN D'AUTRE.
 * Ni le verdict, ni le motif, ni les leviers, ni `review_status`. Le résumé
 * affiché reste vrai — l'UI se contente de ne plus lui ajouter la phrase de
 * marge (`AvisSurLeDevis`, « vl.marge ? … : vl.resume »).
 *
 * ⚠️ On ne touche QUE les conclusions postérieures à la tranche 2 (celles où
 * `Levier.type` existe). Les plus anciennes ont été produites par une autre
 * logique de marge : les corriger d'après la règle d'aujourd'hui reviendrait à
 * réécrire un jugement qu'on ne peut plus reconstituer.
 *
 * Usage :
 *   node scripts/retirer-marges-sans-levier-prix.mjs              (à blanc)
 *   node scripts/retirer-marges-sans-levier-prix.mjs --appliquer
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const APPLIQUER = process.argv.includes("--appliquer");
// 🔴 RÈGLE DU 2026-09-04 — une conclusion `corrected` a été RÉÉCRITE PAR UN
// HUMAIN, et rien de machinal ne l'écrase. Elle est donc écartée par défaut,
// même quand la marge qu'elle porte est manifestement un reste de la machine
// et non une phrase de l'expert : c'est à l'expert de le dire, pas à ce script
// de le présumer. `--inclure-corrigees` lève la garde, sur décision explicite.
const INCLURE_CORRIGEES = process.argv.includes("--inclure-corrigees");

let debut = 0; const rows = [];
for (;;) {
  const { data, error } = await supa
    .from("analyses").select("id,file_name,review_status,conclusion_ia")
    .not("conclusion_ia", "is", null).range(debut, debut + 499);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 500) break;
  debut += 500;
}

const cibles = [];
const protegees = [];
for (const r of rows) {
  const c = typeof r.conclusion_ia === "string" ? JSON.parse(r.conclusion_ia) : r.conclusion_ia;
  const vl = c?.verdict_ligne;
  if (!vl?.marge) continue;
  const leviers = c.leviers ?? [];
  // Conclusions pré-tranche 2 : `type` n'existe pas, logique de marge différente.
  if (!leviers.every((l) => typeof l.type === "string")) continue;
  // Une marge en EUROS repose sur un poste nommé : elle est légitime, on n'y touche pas.
  if (/€/.test(vl.marge)) continue;
  // Le seul pourcentage encore produit par le code : la révision tarifaire.
  if (leviers.some((l) => l.type === "revision_tarifaire")) continue;
  if (r.review_status === "corrected" && !INCLURE_CORRIGEES) { protegees.push({ r, vl }); continue; }
  cibles.push({ r, c, vl, leviers });
}

console.log(`${rows.length} conclusions lues · ${cibles.length} à réparer\n`);
for (const { r, vl, leviers } of cibles) {
  console.log(` ${r.file_name}  [${r.review_status ?? "—"}]`);
  console.log(`   résumé conservé : « ${String(vl.resume).slice(0, 96)} »`);
  console.log(`   marge retirée   : ${vl.marge}`);
  console.log(`   leviers négo    : ${leviers.filter((l) => l.objectif === "negocier").map((l) => l.type).join(", ") || "(aucun)"}\n`);
}

if (protegees.length) {
  console.log(`⚠️ ${protegees.length} écartée(s) — conclusion réécrite par un humain (review_status = "corrected") :`);
  for (const { r, vl } of protegees) console.log(`   ${r.file_name} — marge « ${vl.marge} » CONSERVÉE`);
  console.log("   (--inclure-corrigees pour les traiter quand même, sur décision explicite)\n");
}

if (!APPLIQUER) {
  console.log("à blanc — relancer avec --appliquer pour écrire.");
} else {
  for (const { r, c } of cibles) {
    c.verdict_ligne.marge = null;
    // ⚠️ Seule `conclusion_ia` est réécrite : `review_status` reste la décision
    // de l'expert, et une analyse en attente de revue le reste.
    const { error } = await supa.from("analyses").update({ conclusion_ia: c }).eq("id", r.id);
    if (error) throw error;
    console.log(`✔ ${r.file_name}`);
  }
  console.log(`\n${cibles.length} conclusions réparées.`);
}
