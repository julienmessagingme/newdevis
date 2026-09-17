/**
 * scripts/banc-rejeu-catalogue-actuel.mjs
 *
 * 🔴 2026-09-17 — LE BANC DE REJEU NE PEUT PAS VOIR UNE CORRECTION DE CATALOGUE.
 *
 * `banc-rejeu-decisions-expert.mjs` rejoue `computeServerSurcout` sur les
 * groupes STOCKÉS. Or les prix du catalogue sont **figés dans chaque analyse**
 * au moment où elle est faite (`raw_text.n8n_price_data[].prices`). Deux jours
 * de sourcing — clôture alu, parquet, faïence, isolation, OSB, polyuréthane —
 * n'y changent donc **strictement rien**, et son compteur affichera 1 945 €
 * quoi qu'on corrige.
 *
 * Ce n'est pas un défaut du banc : c'est sa nature. Mais un compteur
 * d'apprentissage aveugle à ce qu'on apprend est pire qu'absent — c'est la
 * leçon du 17/09 au matin, où il comptait 11 « défauts vivants » dont 7
 * n'existaient pas.
 *
 * Ce banc-ci répond à l'autre moitié de la question : **avec le catalogue
 * d'AUJOURD'HUI, ces postes seraient-ils encore accusés ?**
 *
 * ⚠️ IL SUBSTITUE LES PRIX, IL NE REFAIT PAS LE RAPPROCHEMENT. Chaque groupe
 * garde l'entrée catalogue à laquelle il a été rapproché à l'époque ; seules
 * ses VALEURS sont rafraîchies. Il mesure donc l'effet de nos corrections de
 * FOURCHETTE, pas celui d'un nouveau matching. C'est une limite, et elle est
 * dans le bon sens : elle ne s'attribue aucun gain qu'elle ne mesure pas.
 *
 * ⚠️ UNE ENTRÉE SUPPRIMÉE DEPUIS NE PEUT PAS ÊTRE RE-TARIFÉE, et c'est un
 * RÉSULTAT à part entière : le poste reposait sur une référence qui n'existe
 * plus, donc l'accusation ne peut pas se reproduire telle quelle. On ne la
 * compte ni comme corrigée ni comme vivante — on la NOMME.
 *
 * ⚠️ RÈGLE IMPORTÉE, JAMAIS RECOPIÉE : `computeServerSurcout` et le filtre de
 * confiance de la production.
 *
 * Usage : npx tsx scripts/banc-rejeu-catalogue-actuel.mjs
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { computeServerSurcout } from "../src/lib/analyse/surcoutServeur.ts";
import { groupesChiffrables } from "./groupes-chiffrables.mjs";
import { confronterPostes } from "./memes-postes.mjs";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const eur = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;

// ── Le catalogue d'aujourd'hui ───────────────────────────────────────────────
const { data: catalogue, error: errCat } = await supa
  .from("market_prices")
  .select("job_type, label, unit, price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht, fixed_min_ht, fixed_avg_ht, fixed_max_ht");
if (errCat) throw new Error(errCat.message);
const parJobType = new Map(catalogue.map((c) => [c.job_type, c]));
console.log(`\n══ CATALOGUE D'AUJOURD'HUI : ${catalogue.length} entrées ══`);

/** Rafraîchit les valeurs d'un groupe sans toucher à son rapprochement. */
function rafraichir(groupe) {
  const prices = Array.isArray(groupe?.prices) ? groupe.prices : [];
  const disparues = [];
  const neuves = prices.map((p) => {
    const actuel = parJobType.get(p?.job_type);
    if (!actuel) { disparues.push(p?.job_type ?? "(sans job_type)"); return p; }
    return {
      ...p,
      price_min_unit_ht: actuel.price_min_unit_ht,
      price_avg_unit_ht: actuel.price_avg_unit_ht,
      price_max_unit_ht: actuel.price_max_unit_ht,
      fixed_min_ht: actuel.fixed_min_ht,
      fixed_avg_ht: actuel.fixed_avg_ht,
      fixed_max_ht: actuel.fixed_max_ht,
    };
  });
  return { groupe: { ...groupe, prices: neuves }, disparues };
}

// ── La population : exactement celle du banc de rejeu ────────────────────────
const { data: corrections, error } = await supa
  .from("analysis_corrections")
  .select("analysis_id, action, corrected_surcout_max, original_conclusion, corrected_anomalies")
  .order("reviewed_at", { ascending: false });
if (error) throw new Error(error.message);

const ids = [...new Set(corrections.map((c) => c.analysis_id))];
const { data: analyses } = await supa.from("analyses").select("id, user_id, file_name, raw_text").in("id", ids);
const parId = new Map((analyses ?? []).map((a) => [a.id, a]));

let nSubstitues = 0;
let attendus = 0;
const postes = [];

// ⚠️ ON REGROUPE PAR DOCUMENT, ON NE JETTE PAS LES DOUBLONS. Deux corrections
// peuvent porter sur le MÊME devis redéposé (17 % du stock, mesuré le 07/09),
// et elles ne jugent pas forcément les mêmes postes : l'une porte les anomalies
// nommées à l'époque, l'autre les verdicts tranchés après coup.
//   · Ma 1re version comptait le devis DEUX FOIS → la clôture alu comptée deux
//     fois, +1 764 € de gain fictif.
//   · Ma 2e version gardait la correction la plus RÉCENTE → elle perdait « Pose
//     porte entrée », jugé dans l'autre. 9 postes au lieu de 10.
// Les deux erreurs sont symétriques et toutes deux invisibles sans recompter
// contre le banc de référence. D'où le témoin de recomposition plus bas.
const parDocument = new Map();
for (const c of corrections) {
  const a = parId.get(c.analysis_id);
  if (!a) continue;
  const cleDoc = `${a.user_id}|${(a.file_name ?? "").replace(/\s*\(\d+\)(?=\.[a-z]+$)/i, "")}`;
  if (!parDocument.has(cleDoc)) parDocument.set(cleDoc, { analyse: a, corrections: [] });
  parDocument.get(cleDoc).corrections.push(c);
}

for (const { analyse: a, corrections: cs } of parDocument.values()) {
  let r = {};
  try { r = JSON.parse(a.raw_text ?? "{}"); } catch { continue; }
  const groupes = groupesChiffrables(r.n8n_price_data);
  if (groupes.length === 0) continue;

  const totalHT = Number(r.extracted_data?.totaux?.ht ?? r.extracted?.totaux?.ht ?? 0) || null;
  const rejeu = computeServerSurcout(groupes, totalHT);

  // 🔴 LA MÊME CONFRONTATION QUE LE BANC DE RÉFÉRENCE, importée. Ma 1re version
  // la recombinait à sa façon et publiait 16 postes là où le banc de référence
  // en publie 8 + 4. Ici on prend l'UNION sur toutes les corrections du document.
  const normaux = new Map();
  for (const c of cs) {
    const expert = c.action === "corrected"
      ? (Number(c.corrected_surcout_max ?? 0) || 0)
      : (Number(c.original_conclusion?.surcout_global?.max ?? 0) || 0);
    const { reaccuses, aTort } = confronterPostes(
      { originalConclusion: c.original_conclusion, correctedAnomalies: c.corrected_anomalies },
      rejeu?.postes ?? [],
    );
    if (expert === 0) for (const p of reaccuses) normaux.set(p.label, p.ecart);
    for (const t of aTort) normaux.set(t.poste, t.ecart);
  }
  if (normaux.size === 0) continue;
  attendus += normaux.size;

  for (const g of groupes) {
    const avant = computeServerSurcout([g], totalHT);
    if (avant.postes.length === 0) continue;
    const p = avant.postes[0];
    if (!normaux.has(p.label)) continue;

    const { groupe: gNeuf, disparues } = rafraichir(g);
    if (disparues.length === 0) nSubstitues++;
    const apres = computeServerSurcout([gNeuf], totalHT);

    postes.push({
      fichier: a.file_name,
      label: p.label,
      avant: p.ecart,
      apres: apres.postes[0]?.ecart ?? 0,
      motifApres: apres.ecartes[0]?.motif ?? null,
      disparues,
    });
  }
}
const nDisparues = postes.filter((p) => p.disparues.length > 0).length;

// ── TÉMOIN — le banc doit avoir RÉELLEMENT substitué quelque chose ───────────
console.log(`\n══ TÉMOIN ══`);
console.log(`   ${nSubstitues > 0 ? "✓" : "✗"} ${nSubstitues} poste(s) re-tarifé(s) depuis le catalogue actuel`);
console.log(`   ${nDisparues} poste(s) dont l'entrée catalogue a DISPARU depuis (non re-tarifables)`);
// 🔴 RECOMPOSITION — chaque poste que l'expert a déclaré normal ET que le moteur
// accuse doit se retrouver dans la ventilation. DEUX versions de ce banc ont
// doublé puis perdu des postes sans que rien ne le signale : la première
// comptait un devis redéposé deux fois (+1 764 € de gain fictif), la seconde ne
// gardait qu'une correction sur deux (9 postes au lieu de 10). Sans ce contrôle,
// les deux passaient pour des mesures.
console.log(`   ${postes.length === attendus ? "✓" : "✗ INCOHÉRENT"} ${attendus} poste(s) attendu(s) · ${postes.length} ventilé(s)`);
if (postes.length !== attendus) {
  console.log(`   ✗ la ventilation ne recompose pas la population — ne pas interpréter.`);
  process.exit(1);
}
if (nSubstitues === 0) {
  console.log(`   ✗ AUCUNE substitution : ce banc ne mesure rien. Ne pas l'interpréter.`);
  process.exit(1);
}

// ── Résultat ─────────────────────────────────────────────────────────────────
// 🔴 TROIS CATÉGORIES, PAS DEUX. Ma première version rangeait un poste dont
// l'entrée a été SUPPRIMÉE parmi les « encore accusés » — on en aurait conclu
// qu'il restait une fourchette à corriger, alors que sa référence n'existe
// plus et que l'accusation ne peut pas se reproduire telle quelle.
const orphelins = postes.filter((p) => p.disparues.length > 0);
const retarifes = postes.filter((p) => p.disparues.length === 0);
const totalAvant = retarifes.reduce((n, p) => n + p.avant, 0);
const totalApres = retarifes.reduce((n, p) => n + p.apres, 0);
const eteints = retarifes.filter((p) => p.avant > 0 && p.apres === 0);
const vivants = retarifes.filter((p) => p.apres > 0);

console.log(`\n══ CES POSTES SERAIENT-ILS ENCORE ACCUSÉS AVEC LE CATALOGUE D'AUJOURD'HUI ? ══\n`);
console.log(`   ${postes.length} poste(s) que l'expert juge au prix normal et que le moteur accuse`);
console.log(`   dont ${retarifes.length} re-tarifable(s) · ${orphelins.length} dont l'entrée a DISPARU\n`);
console.log(`   sur les re-tarifables : ${eur(totalAvant)}  →  ${eur(totalApres)}   (${eur(totalApres - totalAvant)})`);
console.log(`   🟢 ÉTEINTS par le catalogue actuel : ${eteints.length}`);
console.log(`   🔴 ENCORE accusés                  : ${vivants.length}`);

if (eteints.length > 0) {
  console.log(`\n   ── 🟢 éteints ──`);
  for (const p of eteints.sort((a, b) => b.avant - a.avant)) {
    const cause = p.motifApres ? `garde « ${p.motifApres} »` : "fourchette corrigée";
    console.log(`   ${eur(p.avant).padStart(10)} → 0 €   ${p.label.slice(0, 44).padEnd(44)} ${cause}`);
  }
}
if (vivants.length > 0) {
  console.log(`\n   ── 🔴 encore accusés, et c'est là qu'il reste du travail ──`);
  for (const p of vivants.sort((a, b) => b.apres - a.apres)) {
    console.log(`   ${eur(p.avant).padStart(10)} → ${eur(p.apres).padStart(10)}   ${p.label.slice(0, 44)}`);
    console.log(`              ${String(p.fichier).slice(0, 62)}`);
  }
}
if (orphelins.length > 0) {
  console.log(`\n   ── ⚪ NON RE-TARIFABLES : l'entrée catalogue a été supprimée depuis ──`);
  console.log(`   Le poste ne peut pas être re-chiffré : sa référence n'existe plus. Ce n'est`);
  console.log(`   ni un succès ni un échec — c'est une accusation qui ne peut pas se reproduire`);
  console.log(`   telle quelle, et dont le sort dépend du RAPPROCHEMENT, pas de la fourchette.`);
  for (const p of orphelins.sort((a, b) => b.avant - a.avant)) {
    console.log(`   ${eur(p.avant).padStart(10)}       ${p.label.slice(0, 40).padEnd(40)} entrée disparue : ${p.disparues.join(", ")}`);
  }
}

console.log(`\n⚠️ Ce banc RAFRAÎCHIT LES PRIX, il ne refait pas le rapprochement : il mesure`);
console.log(`   l'effet de nos corrections de fourchette, pas celui d'un nouveau matching.`);
console.log(`⚠️ Et il ne corrige PAS le stock — les analyses existantes gardent leurs prix figés.`);
