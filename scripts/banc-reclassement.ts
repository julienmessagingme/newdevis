/**
 * scripts/banc-reclassement.ts
 *
 * 2026-09-11 — BANC DE MESURE DU RE-CLASSEMENT DU TOP-5.
 *
 * Le banc d'embedding du 10/09 a fermé les pistes « meilleur vecteur » et
 * « meilleurs libellés », et ouvert celle-ci : **la recherche TROUVE, elle ne
 * CLASSE pas**. Sur l'étalon humain, la bonne entrée est dans les cinq
 * premières dans 100 % des cas, mais en tête dans 80 % seulement.
 * `matchSingleLineVectorial` prend aujourd'hui le top-1 et descend la liste
 * tant qu'une garde rejette : c'est un filtre binaire, pas un classement.
 *
 * ⚠️ POURQUOI CE BANC NE PEUT PAS UTILISER L'ÉTALON DU BANC D'EMBEDDING.
 * Celui-là (317 paires) est construit LEXICALEMENT — une entrée dont tous les
 * mots figurent dans la ligne. Y mesurer un re-classement lexical serait
 * circulaire : on validerait la règle avec la règle. Le seul juge admissible est
 * `match_gold_standard`, relu par un humain ET par gemini-2.5-pro sur des
 * candidats présentés dans un ordre tiré au hasard.
 *
 * ⚠️ ET IL EST PETIT : 44 lignes du consensus portent une bonne réponse connue,
 * dont 9 mal classées. Un gain de 3 ou 4 est dans le bruit d'un échantillon de
 * cette taille. **Une règle ne se garde que si elle repose sur un signal
 * nommable, pas sur une constante qui fait monter le compteur** — sinon on
 * apprend l'étalon par cœur. Le second garde-fou est le rejeu du stock entier
 * (`--stock`), qui dit combien de lignes RÉELLES changent de référence.
 *
 * Modes :
 *   --diagnostic   compare, signal par signal, la bonne réponse et le candidat
 *                  classé 1er à tort. À lancer AVANT d'écrire une règle.
 *   (défaut)       note le re-classement contre l'étalon : gains, pertes, net.
 *   --stock        rejoue les lignes du stock et liste celles qui changent de
 *                  référence, pour relecture à l'œil.
 *
 * Usage : npx tsx scripts/banc-reclassement.ts [--diagnostic|--stock]
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
// ⚠️ On importe le tokeniseur et la règle de promotion DE LA PRODUCTION, jamais
// une copie : une mesure faite avec un autre découpage de mots ne dirait rien
// du moteur réel.
import {
  significantTokens,
  hasStrongLexicalMatch,
} from "../supabase/functions/analyze-quote/market-matcher-vectorial.ts";

/**
 * Le scoreur candidat. Il vit ICI et non dans le matcher : mesuré, il ne gagne
 * pas, donc rien n'est livré en production. Le garder sous la main permet de
 * rejouer l'hypothèse si un signal nouveau apparaît.
 *
 * `poidsCouverture = 0` ⇒ score = cosinus, donc classement inchangé. C'est le
 * témoin du banc : avec lui, gains et pertes doivent valoir exactement zéro.
 */
function scoreCandidat(
  devisDesc: string,
  similarity: number,
  catalogLabel: string,
  _catalogUnit: string | null,
  _devisUnit: string | null,
  poidsCouverture = 0,
): number {
  if (poidsCouverture === 0) return similarity;
  const labelTokens = significantTokens(catalogLabel);
  if (labelTokens.size === 0) return similarity;
  const descTokens = significantTokens(devisDesc);
  let n = 0;
  for (const t of labelTokens) if (descTokens.has(t)) n++;
  return similarity + poidsCouverture * (n / labelTokens.size);
}

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL")!, lire("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const CLE = lire("GOOGLE_API_KEY")!;
const MODELE = "models/gemini-embedding-001";
/** Poids du signal lexical dans le score, réglable pour balayer sans recompiler. */
const POIDS = Number(process.env.POIDS ?? "0");
const MODE = process.argv.includes("--diagnostic")
  ? "diagnostic"
  : process.argv.includes("--marge")
  ? "marge"
  : process.argv.includes("--stock")
  ? "stock"
  : "note";

// ── Catalogue ───────────────────────────────────────────────────────────────

type Entree = {
  job_type: string; label: string; unit: string; metier: string | null;
  price_min_unit_ht: number | null; price_max_unit_ht: number | null;
  fixed_min_ht: number | null; fixed_max_ht: number | null;
  vec: number[]; norme: number;
};

const norme = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

async function chargerCatalogue(): Promise<Entree[]> {
  let d = 0; const brut: any[] = [];
  for (;;) {
    const { data, error } = await supa.from("market_prices")
      .select("job_type,label,unit,metier,price_min_unit_ht,price_max_unit_ht,fixed_min_ht,fixed_max_ht,embedding")
      .range(d, d + 499);
    if (error) throw error;
    brut.push(...data!);
    if (data!.length < 500) break;
    d += 500;
  }
  return brut.filter((r) => r.embedding).map((r) => {
    const vec = typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding;
    return { ...r, vec, norme: norme(vec) } as Entree;
  });
}

async function embarquer(textes: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < textes.length; i += 50) {
    const lot = textes.slice(i, i + 50);
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${MODELE}:batchEmbedContents?key=${CLE}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: lot.map((t) => ({
          model: MODELE, content: { parts: [{ text: t }] },
          taskType: "RETRIEVAL_QUERY", outputDimensionality: 768,
        })),
      }),
    });
    if (!r.ok) throw new Error(`Gemini ${r.status} : ${(await r.text()).slice(0, 200)}`);
    out.push(...((await r.json()).embeddings ?? []).map((e: any) => e.values));
  }
  return out;
}

function top5(v: number[], cat: Entree[]) {
  const nq = norme(v);
  return cat.map((r) => {
    let s = 0; for (let k = 0; k < 768; k++) s += v[k] * r.vec[k];
    return { ...r, similarity: s / (nq * r.norme) };
  }).sort((a, b) => b.similarity - a.similarity).slice(0, 5);
}

/** Part des mots significatifs du libellé catalogue présents dans la ligne. */
function couverture(ligne: string, label: string): number {
  const l = significantTokens(label);
  if (l.size === 0) return 0;
  const d = significantTokens(ligne);
  let n = 0;
  for (const t of l) if (d.has(t)) n++;
  return n / l.size;
}

// ── Chargement commun ───────────────────────────────────────────────────────

const { data: etalon, error } = await supa.from("match_gold_standard").select("*").order("id");
if (error) throw error;

const catalogue = await chargerCatalogue();
console.log(`catalogue : ${catalogue.length} entrées · poids couverture = ${POIDS}`);
const vecteurs = await embarquer(etalon!.map((l: any) => l.texte_requete));
const classement = new Map<string, ReturnType<typeof top5>>(
  etalon!.map((l: any, i: number) => [l.id, top5(vecteurs[i], catalogue)]),
);

/** Lignes du consensus portant une bonne réponse connue, avec son job_type. */
const jugees = etalon!.flatMap((l: any) => {
  if (!l.consensus || l.reponse_humaine === "0") return [];
  const rangs = String(l.reponse_humaine).split("|").map(Number);
  const bons = new Set(rangs.map((r) => l.candidats.find((c: any) => c.rang === r)?.job_type).filter(Boolean));
  if (!bons.size) return [];
  return [{ ligne: l, bons, liste: classement.get(l.id)! }];
});

// ── Mode diagnostic ─────────────────────────────────────────────────────────

if (MODE === "diagnostic") {
  console.log(`\n${jugees.length} lignes jugées avec une bonne réponse connue.\n`);
  const sig = (c: any, ligne: string, ctx: any) => {
    // Prix unitaire de la ligne, quand il est calculable, comparé à la
    // fourchette du candidat : « la ligne tient-elle dans ce tarif ? »
    const qte = Number(ctx?.qte) || 0;
    const ht = Number(ctx?.montant_ht) || 0;
    const mn = c.price_min_unit_ht || c.fixed_min_ht || 0;
    const mx = c.price_max_unit_ht || c.fixed_max_ht || 0;
    let prix = " n/a ";
    if (ht > 0 && mx > 0) {
      const u = qte > 0 ? ht / qte : ht;
      prix = u >= mn && u <= mx ? "DEDANS" : u < mn ? "dessous" : "dessus ";
    }
    return {
      sim: c.similarity.toFixed(3),
      couv: couverture(ligne, c.label).toFixed(2),
      fort: hasStrongLexicalMatch(ligne, c.label) ? "OUI" : " - ",
      unite: `${String(ctx?.unite ?? "—").slice(0, 6)}/${String(c.unit).slice(0, 6)}`,
      prix,
    };
  };
  let separe = 0, separePrix = 0, separeUnite = 0, total = 0;
  for (const j of jugees) {
    const rang = j.liste.findIndex((c) => j.bons.has(c.job_type)) + 1;
    if (rang === 1) continue;
    total++;
    const bon = j.liste.find((c) => j.bons.has(c.job_type))!;
    const faux = j.liste[0];
    const ctx = j.ligne.contexte ?? {};
    const sb = sig(bon, j.ligne.ligne_devis, ctx), sf = sig(faux, j.ligne.ligne_devis, ctx);
    const parLexical = Number(sb.couv) > Number(sf.couv) || (sb.fort === "OUI" && sf.fort !== "OUI");
    const parPrix = sb.prix === "DEDANS" && sf.prix !== "DEDANS";
    const parUnite = sb.unite === sf.unite ? false : true;
    if (parLexical) separe++;
    if (parPrix) separePrix++;
    if (parUnite) separeUnite++;
    console.log(`rang ${rang}  « ${j.ligne.ligne_devis.slice(0, 44)} »   ${parLexical ? "lexical✓" : "lexical✗"} ${parPrix ? "prix✓" : "prix✗"} ${parUnite ? "unité✓" : "unité✗"}`);
    console.log(`      bon  : sim ${sb.sim} · couv ${sb.couv} · fort ${sb.fort} · unité ${sb.unite.padEnd(13)} · prix ${sb.prix}  ${bon.label.slice(0, 38)}`);
    console.log(`      faux : sim ${sf.sim} · couv ${sf.couv} · fort ${sf.fort} · unité ${sf.unite.padEnd(13)} · prix ${sf.prix}  ${faux.label.slice(0, 38)}`);
    console.log("");
  }
  console.log(`sur ${total} erreurs de classement — séparées par le lexical : ${separe} · par le prix : ${separePrix} · par l'unité : ${separeUnite}`);
  process.exit(0);
}

// ── Mode marge ──────────────────────────────────────────────────────────────
//
// Si aucun signal ne sait DÉPARTAGER, la question suivante est : sait-on au
// moins reconnaître les cas où le classement est un tirage au sort ? L'écart
// entre le 1er et le 2e candidat est la mesure naturelle. Si les erreurs se
// concentrent dans les marges minces, un seuil ne corrige pas le classement
// mais retire des verdicts que rien ne soutient — ce qui est la règle du projet.

if (MODE === "marge") {
  const lignes = jugees.map((j) => {
    const rang = j.liste.findIndex((c) => j.bons.has(c.job_type)) + 1;
    return { rang, marge: j.liste[0].similarity - j.liste[1].similarity, sim: j.liste[0].similarity, l: j.ligne };
  });
  const justes = lignes.filter((x) => x.rang === 1).map((x) => x.marge).sort((a, b) => a - b);
  const faux = lignes.filter((x) => x.rang !== 1).map((x) => x.marge).sort((a, b) => a - b);
  const med = (a: number[]) => (a.length ? a[Math.floor(a.length / 2)] : NaN);
  console.log(`\nmarge entre le 1er et le 2e candidat :`);
  console.log(`  classement JUSTE (${justes.length}) : médiane ${med(justes).toFixed(4)} · min ${justes[0]?.toFixed(4)} · max ${justes.at(-1)?.toFixed(4)}`);
  console.log(`  classement FAUX  (${faux.length}) : médiane ${med(faux).toFixed(4)} · min ${faux[0]?.toFixed(4)} · max ${faux.at(-1)?.toFixed(4)}`);
  console.log(`\neffet d'un seuil de marge (on renoncerait à chiffrer en dessous) :`);
  for (const s of [0.005, 0.01, 0.015, 0.02, 0.03]) {
    const fauxCoupes = lignes.filter((x) => x.rang !== 1 && x.marge < s).length;
    const justesCoupes = lignes.filter((x) => x.rang === 1 && x.marge < s).length;
    console.log(`  marge < ${s.toFixed(3)} : retire ${fauxCoupes}/${faux.length} références FAUSSES · sacrifie ${justesCoupes}/${justes.length} justes`);
  }

  // La seule population qui compte vraiment : les lignes dont la similarité
  // dépasse le seuil HIGH, donc celles qui produisent un verdict affiché. Une
  // référence fausse y est opposée à un artisan ; une référence juste qu'on
  // retire devient « Prix non vérifiable », ce qui est désagréable mais honnête.
  const SEUIL_HIGH = 0.77;
  const chiffrees = lignes.filter((x) => x.sim >= SEUIL_HIGH);
  const cJustes = chiffrees.filter((x) => x.rang === 1).length;
  const cFaux = chiffrees.filter((x) => x.rang !== 1).length;
  console.log(`\nrestreint aux lignes RÉELLEMENT CHIFFRÉES (similarité ≥ ${SEUIL_HIGH}) : ${chiffrees.length} lignes`);
  console.log(`  référence juste : ${cJustes} · référence FAUSSE : ${cFaux} (${Math.round(cFaux / chiffrees.length * 100)} % des prix affichés)`);
  for (const s of [0.005, 0.01, 0.015, 0.02, 0.03]) {
    const f = chiffrees.filter((x) => x.rang !== 1 && x.marge < s).length;
    const j = chiffrees.filter((x) => x.rang === 1 && x.marge < s).length;
    const restant = cFaux - f, total = chiffrees.length - f - j;
    console.log(`  marge < ${s.toFixed(3)} : retire ${f}/${cFaux} fausses · sacrifie ${j}/${cJustes} justes → il resterait ${restant} fausses sur ${total} prix affichés (${total ? Math.round(restant / total * 100) : 0} %)`);
  }
  process.exit(0);
}

// ── Mode notation ───────────────────────────────────────────────────────────

if (MODE === "note") {
  let avant1 = 0, apres1 = 0;
  const gains: string[] = [], pertes: string[] = [];
  for (const j of jugees) {
    const ctx = j.ligne.contexte ?? {};
    const reclasse = [...j.liste].map((c) => ({
      c, s: scoreCandidat(j.ligne.ligne_devis, c.similarity, c.label, c.unit, ctx.unite ?? null, POIDS),
    })).sort((a, b) => b.s - a.s).map((x) => x.c);

    const rAvant = j.liste.findIndex((c) => j.bons.has(c.job_type)) + 1;
    const rApres = reclasse.findIndex((c) => j.bons.has(c.job_type)) + 1;
    if (rAvant === 1) avant1++;
    if (rApres === 1) apres1++;
    if (rAvant !== 1 && rApres === 1) {
      gains.push(`  + « ${j.ligne.ligne_devis.slice(0, 44)} » → ${reclasse[0].label.slice(0, 40)}`);
    }
    if (rAvant === 1 && rApres !== 1) {
      pertes.push(`  − « ${j.ligne.ligne_devis.slice(0, 44)} » perdue au profit de ${reclasse[0].label.slice(0, 34)}`);
    }
  }
  console.log(`\nétalon de consensus, lignes avec une bonne réponse : ${jugees.length}`);
  console.log(`  bonne réponse en tête AVANT (cosinus seul) : ${avant1} (${Math.round(avant1 / jugees.length * 100)} %)`);
  console.log(`  bonne réponse en tête APRÈS re-classement  : ${apres1} (${Math.round(apres1 / jugees.length * 100)} %)`);
  console.log(`\ngains : ${gains.length}`); gains.forEach((g) => console.log(g));
  console.log(`pertes : ${pertes.length}`); pertes.forEach((p) => console.log(p));
  process.exit(0);
}

// ── Mode stock ──────────────────────────────────────────────────────────────
// Le vrai garde-fou : combien de lignes RÉELLES changent de référence, et
// lesquelles. Un étalon de 44 lignes ne dit rien du volume.

const HORS = /dangote|sanaga|fcfa|cfa\b|yaound|douala|cameroun|abidjan|dakar|s[ée]n[ée]gal/i;
let f = 0; const analyses: any[] = [];
for (;;) {
  const { data } = await supa.from("analyses").select("user_id,file_name,raw_text")
    .eq("status", "completed").order("created_at", { ascending: false }).range(f, f + 499);
  analyses.push(...data!);
  if (data!.length < 500) break;
  f += 500;
}
const vus = new Set<string>(); const lignes: any[] = [];
for (const a of analyses) {
  let rt: any; try { rt = typeof a.raw_text === "string" ? JSON.parse(a.raw_text) : a.raw_text; } catch { continue; }
  const gs = Array.isArray(rt?.n8n_price_data) ? rt.n8n_price_data : [];
  if (!gs.length || !gs.some((x: any) => x.vectorial)) continue;
  const txt = gs.map((x: any) => (x.devis_lines ?? []).map((l: any) => l.description ?? "").join(" ")).join(" ");
  if (HORS.test(txt) || rt?.extracted?.is_foreign_quote) continue;
  const k = `${a.user_id}|${(a.file_name ?? "").replace(/\s*\(\d+\)(?=\.[a-z]+$)/i, "")}`;
  if (vus.has(k)) continue; vus.add(k);
  const travaux = rt?.extracted?.travaux ?? [];
  for (const x of gs) {
    const desc = String(x.devis_lines?.[0]?.description ?? "").trim();
    if (!desc || !x.vectorial?.all_candidates?.length) continue;
    const t = travaux.find((t: any) => String(t.libelle).trim() === desc);
    const p = [desc];
    const ca = t?.categorie ? String(t.categorie).trim() : "";
    if (ca && ca.toLowerCase() !== "autre") p.push(`Catégorie : ${ca}`);
    const un = t?.unite ? String(t.unite).trim() : "";
    if (un) p.push(`Unité : ${un}`);
    lignes.push({ desc, req: p.join(". "), unite: un || null, conf: x.vectorial.confidence, ht: x.devis_total_ht });
  }
}
const uniq = new Map<string, any>();
for (const l of lignes) if (!uniq.has(l.req)) uniq.set(l.req, l);
const echant = [...uniq.values()];
console.log(`\n${lignes.length} lignes du stock · ${echant.length} textes distincts — rejeu en cours…`);

const vecs = await embarquer(echant.map((l) => l.req));
const SEUIL_HIGH = 0.77;
let change = 0, chiffrees = 0; const exemples: string[] = [];
const margesChiffrees: number[] = [];
for (let i = 0; i < echant.length; i++) {
  const l = echant[i];
  const liste = top5(vecs[i], catalogue);
  const reclasse = [...liste].map((c) => ({
    c, s: scoreCandidat(l.desc, c.similarity, c.label, c.unit, l.unite, POIDS),
  })).sort((a, b) => b.s - a.s).map((x) => x.c);
  if (reclasse[0].job_type !== liste[0].job_type) {
    change++;
    if (exemples.length < 25) {
      exemples.push(`  « ${l.desc.replace(/\s+/g, " ").slice(0, 46).padEnd(46)} »  ${liste[0].label.slice(0, 34).padEnd(34)} → ${reclasse[0].label.slice(0, 34)}`);
    }
  }
  // Volume réel d'un seuil de marge : combien de PRIX AFFICHÉS disparaîtraient.
  if (liste[0].similarity >= SEUIL_HIGH) {
    chiffrees++;
    margesChiffrees.push(liste[0].similarity - liste[1].similarity);
  }
}
console.log(`\n${change} textes sur ${echant.length} changent de référence avec le poids lexical ${POIDS} (${(change / echant.length * 100).toFixed(1)} %)`);
console.log(`\n${chiffrees} textes seraient chiffrés (similarité ≥ ${SEUIL_HIGH}). Coût d'un seuil de marge :`);
for (const s of [0.003, 0.005, 0.008, 0.01]) {
  const n = margesChiffrees.filter((m) => m < s).length;
  console.log(`  marge < ${s.toFixed(3)} : ${n} prix retirés (${(n / chiffrees * 100).toFixed(1)} % des prix affichés)`);
}
if (exemples.length) { console.log(""); exemples.forEach((e) => console.log(e)); }
