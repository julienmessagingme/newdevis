/**
 * scripts/banc-doublons-concurrents.mjs
 *
 * 2026-09-16 — DÉTECTER LES DOUBLONS PAR CE QU'ILS ATTIRENT, PAS PAR LEUR NOM.
 *
 * 🔴 POURQUOI UN TROISIÈME DÉTECTEUR, ET EN QUOI IL DIFFÈRE.
 * Le 10/09 une recherche systématique sur les 919 entrées « à périmètre et
 * unité égaux » n'a trouvé que 2 vrais doublons, et concluait : « ce n'est pas
 * un mal systémique ». Elle comparait des LIBELLÉS. Le 15/09 l'arbitre en a
 * trouvé deux autres, vivants, que cette passe avait ratés « car les libellés
 * diffèrent par un mot de tête » (`mur_parpaing_20` / `mur_parpaing_20_construction`).
 *
 * Comparer des noms ne peut pas marcher : deux entrées doublons sont
 * précisément celles qu'on a nommées différemment sans s'en rendre compte.
 *
 * Ce banc change de signal : deux entrées sont CONCURRENTES quand elles
 * apparaissent ensemble dans le top-5 des MÊMES lignes de devis réelles. C'est
 * un signal de COMPORTEMENT, pas de vocabulaire — il ne dépend pas de la façon
 * dont nous les avons baptisées.
 *
 * ⚠️ ET LA CONCURRENCE NE SUFFIT PAS. Deux entrées qui se disputent des lignes
 * en donnant le MÊME prix sont inoffensives — c'est le « quasi-synonyme » du
 * 15/09, dont l'arbitre a montré que contester revient à faire du bruit. Ce qui
 * blesse, c'est une concurrence dont l'issue CHANGE LE MONTANT ANNONCÉ. D'où le
 * second critère, repris du produit : rapport des plafonds ≥ 1,5.
 *
 * 🔴 TÉMOIN : une entrée mise en concurrence AVEC ELLE-MÊME doit sortir un
 * rapport de 1,00 et être écartée. Si le banc la signale, son calcul est faux.
 *
 * Usage : node scripts/banc-doublons-concurrents.mjs
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const MIN_CONCURRENCES = 3; // une rencontre ne fait pas une concurrence
const ECART_MATERIEL = 1.5; // en deçà, le choix entre les deux ne change rien

const { data: cat, error: eCat } = await supa
  .from("market_prices")
  .select("job_type,label,metier,unit,price_min_unit_ht,price_max_unit_ht,fixed_min_ht,fixed_max_ht,notes");
if (eCat) throw new Error(eCat.message);
const parJob = new Map(cat.map((e) => [e.job_type, e]));

/** Le plafond, c'est ce à quoi on compare le devis — donc ce qui fait le verdict. */
const plafond = (e) =>
  e.price_max_unit_ht > 0 ? Number(e.price_max_unit_ht) : Number(e.fixed_max_ht ?? 0);
const fmt = (e) =>
  e.price_max_unit_ht > 0
    ? `${e.price_min_unit_ht}-${e.price_max_unit_ht} €/${e.unit}`
    : `${e.fixed_min_ht}-${e.fixed_max_ht} € forfait`;
/** Un forfait et un tarif au m² ne sont pas des doublons : ils ne se comparent pas. */
const memeNature = (a, b) =>
  (a.price_max_unit_ht > 0) === (b.price_max_unit_ht > 0) &&
  String(a.unit ?? "").toLowerCase() === String(b.unit ?? "").toLowerCase();

const { data: analyses, error } = await supa
  .from("analyses")
  .select("id,user_id,file_name,raw_text")
  .not("raw_text", "is", null);
if (error) throw new Error(error.message);

const vus = new Set();
const docs = [];
for (const a of analyses) {
  const cle = `${a.user_id}|${a.file_name}`;
  if (vus.has(cle)) continue;
  vus.add(cle);
  docs.push(a);
}

// paire "A|B" (triée) -> { n, exemples }
const paires = new Map();
let groupes = 0;
for (const a of docs) {
  let p;
  try {
    p = JSON.parse(a.raw_text || "{}");
  } catch {
    continue;
  }
  for (const g of Array.isArray(p.n8n_price_data) ? p.n8n_price_data : []) {
    const cands = g?.vectorial?.all_candidates;
    if (!Array.isArray(cands) || cands.length < 2) continue;
    groupes++;
    const desc = String(g.devis_lines?.[0]?.description ?? "").replace(/\s+/g, " ").slice(0, 72);
    const jobs = [...new Set(cands.map((c) => c.job_type).filter(Boolean))];
    for (let i = 0; i < jobs.length; i++) {
      for (let j = i + 1; j < jobs.length; j++) {
        const cle = [jobs[i], jobs[j]].sort().join("|");
        if (!paires.has(cle)) paires.set(cle, { n: 0, exemples: [], gagnant: new Map() });
        const e = paires.get(cle);
        e.n++;
        if (e.exemples.length < 3 && desc) e.exemples.push({ desc, conf: g.vectorial.confidence });
        const top = cands[0]?.job_type;
        if (top) e.gagnant.set(top, (e.gagnant.get(top) ?? 0) + 1);
      }
    }
  }
}

// ── TÉMOIN ─────────────────────────────────────────────────────────────────
const unJob = cat.find((e) => plafond(e) > 0);
const rapportSoiMeme = plafond(unJob) / plafond(unJob);
console.log(`\n══ TÉMOIN — une entrée face à elle-même ══`);
console.log(`   « ${unJob.label} » contre elle-même : rapport ${rapportSoiMeme.toFixed(2)} · matériel = ${rapportSoiMeme >= ECART_MATERIEL}`);
if (rapportSoiMeme !== 1 || rapportSoiMeme >= ECART_MATERIEL) {
  console.log("   🔴 TÉMOIN FAUX — le calcul d'écart signale une entrée identique à elle-même.");
  process.exit(1);
}
console.log("   ✓ le calcul ne fabrique pas d'écart là où il n'y en a pas.\n");

const suspects = [];
for (const [cle, e] of paires) {
  if (e.n < MIN_CONCURRENCES) continue;
  const [ja, jb] = cle.split("|");
  const A = parJob.get(ja);
  const B = parJob.get(jb);
  if (!A || !B) continue; // entrée supprimée depuis
  if (!memeNature(A, B)) continue;
  const pa = plafond(A);
  const pb = plafond(B);
  if (!pa || !pb) continue;
  const rapport = Math.max(pa, pb) / Math.min(pa, pb);
  if (rapport < ECART_MATERIEL) continue;
  suspects.push({ A, B, n: e.n, rapport, exemples: e.exemples, gagnant: e.gagnant });
}

console.log(`══ ${groupes} groupes du stock · ${paires.size} paires d'entrées se sont disputé une ligne ══`);
console.log(`Retenues : ≥ ${MIN_CONCURRENCES} disputes, même unité et même nature, plafonds dans un rapport ≥ ${ECART_MATERIEL}.`);
console.log(`→ ${suspects.length} paires où le choix CHANGE le montant annoncé.\n`);

for (const s of suspects.sort((x, y) => y.n - x.n).slice(0, 20)) {
  const [pa, pb] = [plafond(s.A), plafond(s.B)];
  const cher = pa > pb ? s.A : s.B;
  console.log(`── ${s.n} disputes · plafonds ×${s.rapport.toFixed(2)} (le plus cher : « ${cher.label} »)`);
  console.log(`   A. « ${s.A.label} »  ${fmt(s.A)}  [${s.A.metier}]`);
  console.log(`   B. « ${s.B.label} »  ${fmt(s.B)}  [${s.B.metier}]`);
  const g = [...s.gagnant.entries()].sort((x, y) => y[1] - x[1])
    .map(([j, n]) => `${parJob.get(j)?.label?.slice(0, 34) ?? j} ×${n}`).join(" · ");
  console.log(`   l'emporte : ${g}`);
  for (const x of s.exemples) console.log(`     · [${x.conf}] ${x.desc}`);
  console.log("");
}
