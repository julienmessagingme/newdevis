/**
 * scripts/banc-seuil-poste.mjs
 *
 * 🔴 2026-09-17 (demande Johan) — « UN DÉPASSEMENT DE 20 % N'EST PAS UNE
 * SURFACTURATION » : TROIS SEUILS CANDIDATS, MESURÉS AVANT D'EN CHOISIR UN.
 *
 * Les 8 postes que le moteur réaccuse malgré l'annulation de l'expert
 * (cf. `banc-rejeu-decisions-expert.mjs`) partagent un air de famille :
 *   · Grosbois  — « les 4 anomalies prix (314 € / 21 362 € = 1,5 %) sont des
 *                  artefacts : ×1,25, ×1,18, ×1,23 »
 *   · 25030     — porte Bel'm à ×2,0, « dans la moitié haute mais normal »
 *   · MaisonBois— « fourchettes catalogue trop basses » (cause DIFFÉRENTE :
 *                  du sourcing, qu'aucun seuil ne réparera)
 *
 * Trois lectures possibles, qui ne retirent PAS les mêmes postes :
 *   (a) PLANCHER ABSOLU   — un écart de 39 € n'est opposable à personne
 *   (b) RATIO             — dépasser le plafond de 20 % est dans le bruit
 *   (c) POIDS DANS LE DEVIS — 314 € sur 21 362 € ne change pas une décision
 *
 * ⚠️ HUIT POSTES NE SONT PAS UNE POPULATION. Ce projet a déjà refusé deux
 * règles validées sur des sous-groupes de cette taille (seuil de marge et
 * catégorie d'extraction, les 11/09) : « le rejeu du stock est le seul juge
 * d'une règle destinée à la production ». D'où les trois mesures ci-dessous.
 *
 * LE TROC, et c'est lui qui décide :
 *   · GAIN — postes que l'expert a ANNULÉS et que le seuil retire
 *   · COÛT — postes que l'expert a CONFIRMÉS (montant > 0 endossé) et que le
 *            seuil retire quand même. Un seuil qui touche ceux-là fait taire
 *            de vraies surfacturations.
 *   · STOCK — ce que ça change sur toutes les analyses, y compris combien
 *            d'analyses perdent TOUT montant (passage sous le plancher 300 €).
 *
 * Usage : npx tsx scripts/banc-seuil-poste.mjs
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { computeServerSurcout } from "../src/lib/analyse/surcoutServeur.ts";
import { memePoste, postesJugesParExpert } from "./memes-postes.mjs";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

/** Plancher d'affichage du produit : sous ce total, aucun montant ne part. */
const PLANCHER_AFFICHAGE = 300;
const eur = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;

// ── Les trois familles de seuils ─────────────────────────────────────────────
// Chacune rend `true` quand le poste DOIT ÊTRE RETIRÉ du chiffrage.
const FAMILLES = {
  "(a) plancher absolu — écart sous X €": {
    valeurs: [0, 50, 100, 150, 200, 300],
    libelle: (v) => `${v} €`,
    retire: (p, _totalHT, v) => p.ecart < v,
  },
  "(b) ratio — devis sous X × le plafond marché": {
    valeurs: [1.0, 1.1, 1.2, 1.3, 1.5],
    libelle: (v) => `×${v.toFixed(2)}`,
    // ⚠️ Un poste sans ratio (dépassement MATÉRIEL, cf. materielReference) n'est
    // jamais retiré par cette famille : lui inventer un ratio le rendrait
    // indistinguable d'un rapprochement catalogue.
    retire: (p, _totalHT, v) => typeof p.ratio === "number" && p.ratio < v,
  },
  "(c) poids — écart sous X % du devis": {
    valeurs: [0, 0.5, 1, 2, 3],
    libelle: (v) => `${v} %`,
    retire: (p, totalHT, v) => totalHT > 0 && (p.ecart / totalHT) * 100 < v,
  },
};

// ── Chargement ───────────────────────────────────────────────────────────────
const { data: corrections, error: e1 } = await supa
  .from("analysis_corrections")
  .select("analysis_id, action, corrected_surcout_max, original_conclusion");
if (e1) throw new Error(e1.message);

const { data: analyses, error: e2 } = await supa
  .from("analyses")
  .select("id, file_name, raw_text")
  .not("raw_text", "is", null);
if (e2) throw new Error(e2.message);

const groupesDe = (a) => {
  let r = {};
  try { r = JSON.parse(a?.raw_text ?? "{}"); } catch { /* illisible */ }
  return {
    groupes: Array.isArray(r.n8n_price_data) ? r.n8n_price_data : [],
    totalHT: Number(r.extracted_data?.totaux?.ht ?? r.extracted?.totaux?.ht ?? 0) || 0,
  };
};

// ── Les DEUX populations de référence, tirées du gold standard ───────────────
// ⚠️ On les construit avec la MÊME règle que le banc de rejeu (module partagé),
// sinon les chiffres ne seraient pas comparables aux siens.
const parId = new Map(analyses.map((a) => [a.id, a]));
const aRetirer = [];  // l'expert a ANNULÉ ce poste : le seuil DOIT l'attraper
const aGarder = [];   // l'expert a ENDOSSÉ un montant : le seuil ne doit PAS y toucher
const vus = new Set();

for (const c of corrections) {
  const a = parId.get(c.analysis_id);
  if (!a || vus.has(c.analysis_id)) continue;
  const { groupes, totalHT } = groupesDe(a);
  if (groupes.length === 0) continue;
  vus.add(c.analysis_id);

  const s = computeServerSurcout(groupes, totalHT || null);
  if (s.postes.length === 0) continue;

  const original = Number(c.original_conclusion?.surcout_global?.max ?? 0) || 0;
  const expert = c.action === "corrected" ? (Number(c.corrected_surcout_max ?? 0) || 0) : original;
  const jugesAlors = postesJugesParExpert(c.original_conclusion);

  for (const p of s.postes) {
    const juge = jugesAlors.some((n) => memePoste(n, p.label));
    if (!juge) continue; // jamais soumis à l'expert : ne tranche rien
    const cible = expert === 0 ? aRetirer : aGarder;
    cible.push({ ...p, totalHT, fichier: a.file_name });
  }
}

// ── Le stock entier ──────────────────────────────────────────────────────────
const stock = [];
for (const a of analyses) {
  const { groupes, totalHT } = groupesDe(a);
  if (groupes.length === 0) continue;
  const s = computeServerSurcout(groupes, totalHT || null);
  if (s.postes.length === 0) continue;
  stock.push({ fichier: a.file_name, totalHT, postes: s.postes, total: s.max });
}

const postesStock = stock.reduce((n, x) => n + x.postes.length, 0);
const montantStock = stock.reduce((n, x) => n + x.total, 0);
const affichants = stock.filter((x) => x.total >= PLANCHER_AFFICHAGE).length;

console.log(`\n══ POPULATIONS ══`);
console.log(`   Stock                         : ${stock.length} analyses · ${postesStock} postes · ${eur(montantStock)}`);
console.log(`   dont affichant un montant     : ${affichants} (total ≥ ${PLANCHER_AFFICHAGE} €)`);
console.log(`   🔴 postes ANNULÉS par l'expert : ${aRetirer.length} (${eur(aRetirer.reduce((n, p) => n + p.ecart, 0))})  ← à retirer`);
console.log(`   🟢 postes ENDOSSÉS par l'expert: ${aGarder.length} (${eur(aGarder.reduce((n, p) => n + p.ecart, 0))})  ← à préserver`);

if (aRetirer.length === 0 || aGarder.length === 0) {
  console.log(`\n✗ Sans les DEUX populations, aucun troc ne se mesure. Arrêt.`);
  process.exit(1);
}

// ── Mesure ───────────────────────────────────────────────────────────────────
for (const [nom, fam] of Object.entries(FAMILLES)) {
  console.log(`\n${"═".repeat(96)}`);
  console.log(`  ${nom}`);
  console.log(`${"═".repeat(96)}`);
  console.log(
    `  ${"seuil".padEnd(9)}${"GAIN".padStart(14)}${"COÛT".padStart(14)}` +
    `${"postes stock".padStart(15)}${"€ retirés".padStart(14)}${"analyses muettes".padStart(19)}`,
  );

  for (const v of fam.valeurs) {
    const gain = aRetirer.filter((p) => fam.retire(p, p.totalHT, v));
    const cout = aGarder.filter((p) => fam.retire(p, p.totalHT, v));

    let retiresStock = 0, montantRetire = 0, devenuesMuettes = 0;
    for (const d of stock) {
      const restants = d.postes.filter((p) => !fam.retire(p, d.totalHT, v));
      retiresStock += d.postes.length - restants.length;
      const nouveauTotal = restants.reduce((n, p) => n + p.ecart, 0);
      montantRetire += d.total - nouveauTotal;
      if (d.total >= PLANCHER_AFFICHAGE && nouveauTotal < PLANCHER_AFFICHAGE) devenuesMuettes++;
    }

    // ⚠️ TÉMOIN — le seuil neutre de chaque famille ne doit RIEN retirer.
    const neutre = v === fam.valeurs[0] && (v === 0 || v === 1.0);
    const marque = neutre && (gain.length || cout.length || retiresStock) ? "  ✗ TÉMOIN CASSÉ" : "";
    if (marque) process.exitCode = 1;

    console.log(
      `  ${fam.libelle(v).padEnd(9)}` +
      `${`${gain.length}/${aRetirer.length}`.padStart(14)}` +
      `${`${cout.length}/${aGarder.length}`.padStart(14)}` +
      `${String(retiresStock).padStart(15)}` +
      `${eur(montantRetire).padStart(14)}` +
      `${String(devenuesMuettes).padStart(19)}${marque}`,
    );
  }
}

// ── Ce que chaque poste de référence demanderait ─────────────────────────────
console.log(`\n${"═".repeat(96)}`);
console.log(`  LES 2 POPULATIONS, POSTE PAR POSTE — c'est là que le seuil se choisit`);
console.log(`${"═".repeat(96)}`);
const ligne = (p, tag) =>
  `  ${tag}  ${eur(p.ecart).padStart(9)}  ×${(p.ratio ?? 0).toFixed(2).padStart(5)}  ` +
  `${((p.ecart / (p.totalHT || 1)) * 100).toFixed(2).padStart(5)} %  ${p.label.slice(0, 44).padEnd(44)} ${String(p.fichier).slice(0, 26)}`;
console.log(`\n  🔴 ANNULÉS par l'expert — un bon seuil les retire :`);
for (const p of [...aRetirer].sort((a, b) => b.ecart - a.ecart)) console.log(ligne(p, "🔴"));
console.log(`\n  🟢 ENDOSSÉS par l'expert — un bon seuil les épargne :`);
for (const p of [...aGarder].sort((a, b) => b.ecart - a.ecart)) console.log(ligne(p, "🟢"));
