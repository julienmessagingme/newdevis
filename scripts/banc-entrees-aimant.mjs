/**
 * scripts/banc-entrees-aimant.mjs
 *
 * 2026-09-16 — QUELLES ENTRÉES DU CATALOGUE ATTIRENT CE QUI NE LEUR APPARTIENT PAS ?
 *
 * Constaté sur la dépose le 15/09 : « Dépose et évacuation clôture existante »
 * sort en tête sur une cheminée, un cabanon et de l'éclairage public. Une entrée
 * générique devient un AIMANT — elle capte tout ce qui partage son verbe.
 *
 * C'est le motif de l'enduit chaux (11/09), qui valait une entrée ciblée : les
 * lignes partaient toutes sur *Enduit chaux INTÉRIEUR* faute d'entrée extérieure.
 * Là, le défaut ne se voit pas dans un taux de couverture — il se voit dans la
 * DISPERSION de ce qu'une entrée attrape.
 *
 * ── L'indicateur, et pourquoi celui-là ──
 * Pour chaque ligne, on mesure la COUVERTURE LEXICALE : la part des mots
 * significatifs du libellé catalogue réellement présents dans la ligne de devis.
 * Un rapprochement sain la garde haute ; un aimant capte des lignes qui ne
 * reprennent presque aucun de ses mots.
 *
 * ⚠️ On utilise `significantTokens` IMPORTÉ du matcher, jamais une copie : le
 * banc doit découper les mots comme la production (leçon du 11/09).
 *
 * 🔴 TÉMOIN OBLIGATOIRE (règle du 11/09) : les entrées promues par
 * `hasStrongLexicalMatch` — celles dont la production a VÉRIFIÉ que les mots
 * concordent — doivent ressortir avec une couverture HAUTE. Si l'indicateur les
 * classe aussi en aimants, c'est lui qui est faux, pas le catalogue.
 *
 * ⚠️ PIÈGE 1 du 11/09 : on regarde TOUTES les lignes, y compris celles en
 * confiance haute. Un trou de catalogue produit souvent un faux match CONFIANT.
 *
 * Usage : node scripts/banc-entrees-aimant.mjs [--entree <job_type>]
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const { significantTokens, hasStrongLexicalMatch } = await import(
  "../supabase/functions/analyze-quote/market-matcher-vectorial.ts"
);

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const cible = process.argv.includes("--entree")
  ? process.argv[process.argv.indexOf("--entree") + 1]
  : null;

// Les qualificatifs entre parenthèses ne comptent pas — même convention que la
// promotion lexicale, sinon « (fourni+posé) » plombe toutes les couvertures.
const motsDuLibelle = (label) =>
  significantTokens(String(label ?? "").replace(/\([^)]*\)/g, " "));

const couverture = (label, desc) => {
  const mots = motsDuLibelle(label);
  if (!mots.size) return null;
  const dansLaLigne = significantTokens(desc);
  let n = 0;
  for (const m of mots) if (dansLaLigne.has(m)) n++;
  return n / mots.size;
};

const { data: cat, error: eCat } = await supa
  .from("market_prices")
  .select("job_type,label,metier,unit,price_min_unit_ht,price_max_unit_ht,fixed_min_ht,fixed_max_ht");
if (eCat) throw new Error(eCat.message);
const parJob = new Map(cat.map((e) => [e.job_type, e]));

const { data: analyses, error } = await supa
  .from("analyses")
  .select("id,user_id,file_name,raw_text")
  .not("raw_text", "is", null);
if (error) throw new Error(error.message);

// Déduplication des redépôts (règle du 07/09).
const vus = new Set();
const docs = [];
for (const a of analyses) {
  const cle = `${a.user_id}|${a.file_name}`;
  if (vus.has(cle)) continue;
  vus.add(cle);
  docs.push(a);
}

const attractions = new Map(); // job_type -> lignes[]
let total = 0;
const temoin = []; // lignes promues par la production : la couverture doit y être haute

for (const a of docs) {
  let p;
  try {
    p = JSON.parse(a.raw_text || "{}");
  } catch {
    continue;
  }
  for (const g of Array.isArray(p.n8n_price_data) ? p.n8n_price_data : []) {
    const v = g?.vectorial;
    const top = v?.all_candidates?.[0];
    if (!top?.job_type) continue;
    const entree = parJob.get(top.job_type);
    if (!entree) continue; // entrée supprimée depuis l'analyse
    for (const l of g?.devis_lines ?? []) {
      const desc = String(l?.description ?? "").trim();
      if (!desc) continue;
      const c = couverture(entree.label, desc);
      if (c === null) continue;
      total++;
      const ligne = {
        desc: desc.replace(/\s+/g, " ").slice(0, 88),
        descComplete: desc.replace(/\s+/g, " ").slice(0, 300),
        montant: Number(l?.amount_ht ?? 0),
        sim: Number(top.similarity ?? 0),
        conf: v.confidence,
        couv: c,
        devis: a.file_name,
        // Les VRAIS candidats stockés : l'arbitre doit voir ce que la
        // production lui aurait montré, pas une liste reconstruite.
        candidats: (v.all_candidates ?? []).slice(0, 5),
      };
      if (!attractions.has(top.job_type)) attractions.set(top.job_type, []);
      attractions.get(top.job_type).push(ligne);
      if (hasStrongLexicalMatch(desc, entree.label)) temoin.push(ligne);
    }
  }
}

// ── TÉMOIN ─────────────────────────────────────────────────────────────────
const med = (xs) => {
  if (!xs.length) return null;
  const t = [...xs].sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)];
};
const couvTemoin = med(temoin.map((l) => l.couv));
console.log(`\n══ TÉMOIN — ${temoin.length} lignes que la PRODUCTION juge lexicalement concordantes ══`);
console.log(`   couverture médiane : ${couvTemoin === null ? "—" : (couvTemoin * 100).toFixed(0) + " %"}`);
if (couvTemoin === null || couvTemoin < 0.8) {
  console.log("   🔴 TÉMOIN FAUX — l'indicateur classe mal des rapprochements vérifiés. Rien de ce qui suit ne vaut.");
  process.exit(1);
}
console.log("   ✓ l'indicateur reconnaît les bons rapprochements — il peut servir à trouver les aimants.\n");

// ── Un seul aimant en détail ───────────────────────────────────────────────
if (cible) {
  const e = parJob.get(cible);
  const lignes = (attractions.get(cible) ?? []).sort((x, y) => x.couv - y.couv);
  console.log(`══ « ${e?.label ?? cible} » — ${lignes.length} lignes attirées ══\n`);
  for (const l of lignes) {
    const drapeau = l.couv < 0.34 ? "🔴" : l.couv < 0.67 ? "🟡" : "  ";
    console.log(
      `${drapeau} couv ${(l.couv * 100).toFixed(0).padStart(3)} % · ${l.sim.toFixed(3)} · ${String(Math.round(l.montant)).padStart(6)} € [${l.conf}]`,
    );
    console.log(`     ${l.desc}`);
  }
  process.exit(0);
}

// ── Classement des aimants ─────────────────────────────────────────────────
const MIN_LIGNES = 3; // une occurrence ne fait pas un aimant (règle du 11/09)
const FAIBLE = 0.34; // la ligne ne reprend même pas un tiers des mots de l'entrée

const classement = [];
for (const [job, lignes] of attractions) {
  if (lignes.length < MIN_LIGNES) continue;
  const faibles = lignes.filter((l) => l.couv < FAIBLE);
  if (!faibles.length) continue;
  classement.push({
    job,
    entree: parJob.get(job),
    n: lignes.length,
    faibles: faibles.length,
    part: faibles.length / lignes.length,
    montant: faibles.reduce((s, l) => s + l.montant, 0),
    chiffrees: faibles.filter((l) => l.conf === "high").length,
    exemples: faibles.sort((a, b) => b.montant - a.montant).slice(0, 4),
  });
}

// ── CE QUE L'INDICATEUR NE DIT PAS, ET OÙ LA SUITE SE MESURE ──────────────
//
// Une couverture basse dit seulement « la ligne ne reprend pas nos mots ». Deux
// causes opposées se cachent derrière :
//   · VRAI AIMANT       — l'entrée décrit autre chose (enduit de FAÇADE
//     attrapant un ratissage INTÉRIEUR) ;
//   · TROU DE VOCABULAIRE — l'entrée est la BONNE, nos mots diffèrent des leurs
//     (« Pose prise électrique » contre « Prise de courant 2P+T »), motif de
//     l'alias `prise_alias`/`dcl_alias` du 11/09.
//
// ⚠️ NE PAS trancher ça ligne par ligne avec l'arbitre de production : il rejuge
// la MÊME paire d'entrées des dizaines de fois, pour une question qui porte sur
// le CATALOGUE et non sur une ligne. La bonne granularité est la paire, et elle
// vit dans `banc-prix-sur-un-fil.mjs --juger-doublons` — quelques dizaines
// d'appels au lieu de plusieurs centaines.

console.log(`══ ${total} lignes rapprochées · ${attractions.size} entrées sollicitées ══`);
console.log(`Aimants = entrées sollicitées ≥ ${MIN_LIGNES} fois avec des lignes qui reprennent moins de ${Math.round(FAIBLE * 100)} % de leurs mots.\n`);

for (const a of classement.sort((x, y) => y.faibles - x.faibles).slice(0, 14)) {
  const f =
    a.entree.price_max_unit_ht > 0
      ? `${a.entree.price_min_unit_ht}-${a.entree.price_max_unit_ht} €/${a.entree.unit}`
      : `${a.entree.fixed_min_ht}-${a.entree.fixed_max_ht} € forfait`;
  console.log(
    `── « ${a.entree.label} » (${f}, ${a.entree.metier})\n   attire ${a.n} lignes · ${a.faibles} hors sujet (${Math.round(a.part * 100)} %) · ${Math.round(a.montant).toLocaleString("fr-FR")} € · dont ${a.chiffrees} CHIFFRÉES`,
  );
  for (const l of a.exemples) {
    console.log(`     ${String(Math.round(l.montant)).padStart(6)} € [${l.conf}] ${l.desc.slice(0, 74)}`);
  }
  console.log("");
}
