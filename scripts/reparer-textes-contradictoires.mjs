/**
 * scripts/reparer-textes-contradictoires.mjs
 *
 * Réécrit les textes des conclusions déjà CORRIGÉES par l'expert qui
 * contredisent encore son verdict. À blanc par défaut, `--appliquer` pour
 * écrire.
 *
 * 🔴 POURQUOI CE SCRIPT TOUCHE À DES CONCLUSIONS `corrected`, ALORS QUE LE
 * FILET DU 04/09 L'INTERDIT. Ce filet protège **ce que l'humain a écrit** : son
 * verdict, son surcoût, ses anomalies, son message. Or les quatre textes visés
 * ici ne sont PAS de lui — ce sont ceux de la machine, restés en place parce
 * que le formulaire ne les couvrait pas, et qui disent l'inverse de ce qu'il a
 * tranché. Les laisser, c'est laisser 18 pages contredire leur propre expert.
 *
 * ⚠️ LA GARDE EST LE CONTRÔLE D'APRÈS ÉCRITURE : le script relit chaque ligne
 * et vérifie que `verdict_global`, `verdict_decisionnel`, `surcout_global`,
 * `anomalies`, `expert_message` et `review_status` sont **identiques octet pour
 * octet**. Si un seul bouge, il s'arrête.
 *
 * ⚠️ La règle appliquée est `resyncTextesExpert`, IMPORTÉE — la même que la
 * route de décision. Une copie ici divergerait au premier ajustement.
 *
 * Lancer : npx tsx scripts/reparer-textes-contradictoires.mjs [--appliquer]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resyncTextesExpert } from "../src/lib/analyse/resyncTextesExpert.ts";

const APPLIQUER = process.argv.includes("--appliquer");

for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(
  process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

/** Les champs que l'EXPERT a posés — ils doivent survivre à l'identique. */
const empreinteExpert = (ci) =>
  JSON.stringify({
    vg: ci?.verdict_global ?? null,
    vd: ci?.verdict_decisionnel ?? null,
    sc: ci?.surcout_global ?? null,
    an: ci?.anomalies ?? null,
    em: ci?.expert_message ?? null,
  });

const { data, error } = await sb
  .from("analyses")
  .select("id, file_name, review_status, conclusion_ia")
  .eq("review_status", "corrected");
if (error) { console.error("LECTURE:", error); process.exit(1); }

const candidats = [];
for (const a of data ?? []) {
  let ci = null;
  try { ci = typeof a.conclusion_ia === "string" ? JSON.parse(a.conclusion_ia) : a.conclusion_ia; } catch {}
  if (!ci) continue;

  const copie = JSON.parse(JSON.stringify(ci));
  const r = resyncTextesExpert(copie);
  if (!r.recompose) continue;

  // Ne réécrire que si quelque chose change RÉELLEMENT : une conclusion déjà
  // propre ne doit pas repasser en base pour rien.
  if (JSON.stringify(copie) === JSON.stringify(ci)) continue;

  candidats.push({ id: a.id, fichier: a.file_name, avant: ci, apres: copie, champs: r.champsReecrits });
}

console.log(`conclusions corrigées      : ${(data ?? []).length}`);
console.log(`à réécrire                 : ${candidats.length}\n`);
for (const c of candidats.slice(0, 8)) {
  console.log(`  ${String(c.fichier).slice(0, 44)}  [${c.champs.join(", ")}]`);
  console.log(`     avant : « ${String(c.avant.phrase_intro ?? "").slice(0, 96)} »`);
  console.log(`     après : « ${String(c.apres.phrase_intro ?? "").slice(0, 96)} »`);
}
if (candidats.length > 8) console.log(`  … et ${candidats.length - 8} autre(s)`);

if (!APPLIQUER) {
  console.log("\n🟡 à blanc — relancer avec --appliquer pour écrire.");
  process.exit(0);
}

let ecrites = 0, refusees = 0;
for (const c of candidats) {
  const { error: e } = await sb
    .from("analyses")
    .update({ conclusion_ia: JSON.stringify(c.apres) })
    .eq("id", c.id);
  if (e) { console.error(`  🔴 ${c.fichier} : ${e.message}`); refusees++; continue; }

  // ⚠️ Une réponse sans erreur ne prouve pas qu'une ligne a été écrite (15/09).
  const { data: relu } = await sb
    .from("analyses").select("review_status, conclusion_ia").eq("id", c.id).single();
  const ci2 = typeof relu?.conclusion_ia === "string" ? JSON.parse(relu.conclusion_ia) : relu?.conclusion_ia;

  const expertIntact = empreinteExpert(ci2) === empreinteExpert(c.avant);
  const statutIntact = relu?.review_status === "corrected";
  const texteChange = ci2?.phrase_intro === c.apres.phrase_intro;

  if (expertIntact && statutIntact && texteChange) ecrites++;
  else {
    refusees++;
    console.error(
      `  🔴 ${c.fichier} — expert intact:${expertIntact} statut:${statutIntact} texte:${texteChange}`,
    );
  }
}

console.log(`\n🟢 ${ecrites} réécrite(s)${refusees ? ` · 🔴 ${refusees} en échec` : ""}`);
process.exit(refusees === 0 ? 0 : 1);
