/**
 * scripts/banc-cartes-non-chiffrables.mjs
 *
 * 2026-09-15 — COMBIEN DE CARTES CHANGENT QUAND ELLES RESPECTENT LES GARDES
 * DU SERVEUR ?
 *
 * Déclencheur, vu à l'écran : sur l'analyse `c1ece16a`, le hero annonçait
 * **870 €** et le détail affichait encore une carte 🔴 « Anomalie marché » à
 * **4 809 € contre 1 072-2 228 €**. Le poste était sorti du MONTANT (garde
 * serveur) mais gardait sa CARTE — deux chiffres sur la même page, sans moyen
 * de les réconcilier.
 *
 * ⚠️ TOUCHER `classifyRowEnriched` AFFECTE TOUTES LES ANALYSES. On mesure donc
 * avant/après sur le stock, et surtout on RELIT les cartes qui perdent leur
 * accusation : si l'une d'elles était une vraie surfacturation, le correctif
 * ferait taire un signal juste.
 *
 * ⚠️ La règle est IMPORTÉE (`motifNonChiffrable`), jamais recopiée.
 *
 * Usage : npx tsx scripts/banc-cartes-non-chiffrables.mjs
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { motifNonChiffrable, MOTIFS_SANS_VERDICT_DE_PRIX } from "../src/lib/analyse/surcoutServeur.ts";
import { referenceOpposable } from "../src/lib/analyse/referenceOpposable.ts";
import { classifyItem } from "../src/lib/analyse/quoteGlobalAnalysis.ts";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const eur = (n) => `${Math.round(n || 0).toLocaleString("fr-FR")} €`;

let toutes = [], from = 0;
for (;;) {
  const { data, error } = await supa.from("analyses")
    .select("id, user_id, file_name, raw_text")
    .not("conclusion_ia", "is", null)
    .order("created_at", { ascending: false }).range(from, from + 499);
  if (error) { console.error(error); process.exit(1); }
  toutes = toutes.concat(data);
  if (data.length < 500) break;
  from += 500;
}
const vus = new Set(), docs = [];
for (const a of toutes) {
  const cle = `${a.user_id}|${a.file_name}`;
  if (vus.has(cle)) continue; vus.add(cle); docs.push(a);
}

let cartes = 0, perdentAccusation = 0, docsTouches = new Set();
const parMotif = new Map();
const exemples = [];

for (const a of docs) {
  let p; try { p = JSON.parse(a.raw_text || "{}"); } catch { continue; }
  for (const g of p.n8n_price_data ?? []) {
    if (!g || typeof g !== "object") continue;
    if (g.job_type_label === "Autre") continue;
    const devisTotal = Number(g.devis_total_ht) || 0;
    if (devisTotal <= 0) continue;
    const qty = typeof g.main_quantity === "number" && g.main_quantity > 0 ? g.main_quantity : 1;
    let plafond = 0;
    for (const pr of g.prices ?? []) {
      plafond += (Number(pr.price_max_unit_ht) || 0) * qty + (Number(pr.fixed_max_ht) || 0);
    }
    if (plafond <= 0) continue;
    // Garde 0 : sans référence opposable, la carte est DÉJÀ « non vérifiable ».
    if (!referenceOpposable(g.vectorial)) continue;
    cartes++;

    const avant = classifyItem(devisTotal, plafond);
    const motif = motifNonChiffrable(g, null);
    const coupe = motif && MOTIFS_SANS_VERDICT_DE_PRIX.has(motif);
    if (!coupe) continue;

    // Ne comptent que les cartes qui PERDAIENT une accusation.
    if (avant !== "anomalie" && avant !== "survalue") continue;
    perdentAccusation++;
    docsTouches.add(a.id);
    parMotif.set(motif, (parMotif.get(motif) ?? 0) + 1);
    exemples.push({
      fichier: a.file_name, label: g.job_type_label, motif, avant,
      devis: devisTotal, plafond, ratio: devisTotal / plafond,
      ligne: String((g.devis_lines ?? [])[0]?.description ?? "").replace(/\s+/g, " ").slice(0, 110),
      tarif: String((g.prices ?? [])[0]?.label ?? ""),
    });
  }
}

console.log(`Documents dédupliqués                 : ${docs.length}`);
console.log(`Cartes portant un verdict de prix     : ${cartes}`);
console.log(`Cartes qui PERDENT leur accusation    : ${perdentAccusation} (${((perdentAccusation / cartes) * 100).toFixed(1)} %)`);
console.log(`Analyses concernées                   : ${docsTouches.size}`);
console.log("\nPar motif :");
for (const [m, n] of [...parMotif.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${m.padEnd(34)} ${n}`);

console.log("\n─── À RELIRE UNE PAR UNE : chaque carte qui cesse d'accuser ───");
for (const e of exemples.sort((a, b) => a.devis - b.devis).slice(0, 14)) {
  console.log(`\n  ${e.avant.toUpperCase()} → non vérifiable  ·  ${e.motif}`);
  console.log(`     ${e.fichier?.slice(0, 44)}`);
  console.log(`     ligne  : ${e.ligne}`);
  console.log(`     opposé à « ${e.tarif} » — devis ${eur(e.devis)} contre plafond ${eur(e.plafond)} (×${e.ratio.toFixed(1)})`);
}
