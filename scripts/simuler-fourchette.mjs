/**
 * scripts/simuler-fourchette.mjs
 *
 * « Si cette entrée du catalogue avait cette fourchette, qu'est-ce que ça
 * changerait ? » — mesuré AVANT d'écrire la migration.
 *
 * ⚠️ POURQUOI UNE SIMULATION ET PAS UN SIMPLE UPDATE PUIS UN REJEU : les prix
 * du catalogue sont **figés dans chaque analyse** au moment où elle est faite
 * (`raw_text.n8n_price_data[].prices`). Corriger le catalogue ne touche donc
 * PAS le stock — l'effet ne vaut que pour les analyses à venir. Pour savoir ce
 * qu'on change, il faut rejouer le stock AVEC la nouvelle fourchette
 * substituée. (Même raison que le +9 503 € de la promotion lexicale, 10/09 :
 * « une projection de la règle sur les données passées, pas un gain rétroactif ».)
 *
 * ⚠️ RÈGLE IMPORTÉE : le recalcul passe par `computeServerSurcout`, jamais par
 * une formule recopiée.
 *
 * Usage :
 *   npx tsx scripts/simuler-fourchette.mjs <job_type> <min> <avg> <max>
 * Exemple :
 *   npx tsx scripts/simuler-fourchette.mjs cloture_alu_lames 150 230 330
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { computeServerSurcout } from "../src/lib/analyse/surcoutServeur.ts";

const [jobType, sMin, sAvg, sMax] = process.argv.slice(2);
if (!jobType || !sMax) {
  console.error("usage: npx tsx scripts/simuler-fourchette.mjs <job_type> <min> <avg> <max>");
  process.exit(1);
}
const nMin = Number(sMin), nAvg = Number(sAvg), nMax = Number(sMax);

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const eur = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const PLANCHER = 300;

const { data: analyses, error } = await supa
  .from("analyses").select("id, file_name, raw_text").not("raw_text", "is", null);
if (error) throw new Error(error.message);

/** Remplace la fourchette de l'entrée visée dans une copie des groupes. */
function substituer(groupes) {
  return groupes.map((g) => {
    const prices = Array.isArray(g?.prices) ? g.prices : [];
    if (!prices.some((p) => p?.job_type === jobType)) return g;
    return {
      ...g,
      prices: prices.map((p) =>
        p?.job_type === jobType
          ? { ...p, price_min_unit_ht: nMin, price_avg_unit_ht: nAvg, price_max_unit_ht: nMax }
          : p,
      ),
    };
  });
}

let touches = 0, cessent = 0, deviennent = 0, muettes = 0;
let avantTotal = 0, apresTotal = 0;
const details = [];

for (const a of analyses) {
  let r = {};
  try { r = JSON.parse(a.raw_text ?? "{}"); } catch { continue; }
  const groupes = Array.isArray(r.n8n_price_data) ? r.n8n_price_data : [];
  if (groupes.length === 0) continue;
  if (!groupes.some((g) => (g?.prices ?? []).some((p) => p?.job_type === jobType))) continue;
  touches++;

  const totalHT = Number(r.extracted_data?.totaux?.ht ?? r.extracted?.totaux?.ht ?? 0) || null;
  const avant = computeServerSurcout(groupes, totalHT);
  const apres = computeServerSurcout(substituer(groupes), totalHT);
  avantTotal += avant.max;
  apresTotal += apres.max;

  const pAvant = avant.postes.filter((p) => p.label.toLowerCase().includes("aluminium") || true);
  if (avant.max >= PLANCHER && apres.max < PLANCHER) muettes++;
  if (avant.postes.length > apres.postes.length) cessent++;
  if (apres.postes.length > avant.postes.length) deviennent++;

  if (avant.max !== apres.max) {
    details.push({ f: a.file_name, avant: avant.max, apres: apres.max, nAvant: pAvant.length, nApres: apres.postes.length });
  }
}

console.log(`\n══ SIMULATION — ${jobType} → ${nMin} / ${nAvg} / ${nMax} ══\n`);
console.log(`   analyses portant cette entrée : ${touches}`);
console.log(`   montant total accusé          : ${eur(avantTotal)} → ${eur(apresTotal)}  (${eur(apresTotal - avantTotal)})`);
console.log(`   postes qui CESSENT d'accuser  : ${cessent} analyse(s)`);
console.log(`   🔴 postes qui DEVIENNENT accusés : ${deviennent} analyse(s)`);
console.log(`   analyses qui deviennent muettes : ${muettes} (total sous ${PLANCHER} €)`);

if (details.length > 0) {
  console.log(`\n   ── le détail, analyse par analyse ──`);
  for (const d of details.sort((a, b) => (b.avant - b.apres) - (a.avant - a.apres))) {
    console.log(`   ${eur(d.avant).padStart(10)} → ${eur(d.apres).padStart(10)}   ${String(d.f).slice(0, 56)}`);
  }
}
