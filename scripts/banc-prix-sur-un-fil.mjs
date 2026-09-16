/**
 * scripts/banc-prix-sur-un-fil.mjs
 *
 * 2026-09-16 — COMBIEN DE NOS PRIX AFFICHÉS TIENNENT À UN DÉPARTAGE IMPOSSIBLE ?
 *
 * Le banc des aimants (16/09) montre que le catalogue n'est presque jamais
 * troué : la bonne entrée existe, une voisine la coiffe. Le banc des
 * concurrents montre que 431 paires d'entrées se disputent des lignes réelles
 * avec des plafonds dans un rapport ≥ 1,5.
 *
 * ⚠️ NE PAS EN CONCLURE « 431 DOUBLONS » — ce serait refaire l'erreur du 10/09
 * (« un premier détecteur en annonçait 49 »). « Démolition cloison » (15-60) et
 * « Démolition mur parpaing » (40-110) sont deux ouvrages RÉELLEMENT différents
 * et leurs prix diffèrent à bon droit. La concurrence n'est pas la redondance.
 *
 * La vraie question est ailleurs, et elle est chiffrable : **sur les prix que
 * nous AFFICHONS comme vérifiés, quelle part repose sur un écart de similarité
 * plus petit que le bruit de l'espace vectoriel ?**
 *
 * Le plancher de bruit n'est pas un réglage : il est MESURÉ — marge médiane
 * entre la bonne entrée et sa poursuivante = **0,006** (banc d'embedding du
 * 10/09, 317 paires d'étalon). En dessous, « la 1re » et « la 2e » ne sont pas
 * distinguées par le vecteur : elles sont départagées par du hasard.
 *
 * Si en plus les deux plafonds divergent, le montant affiché au client est tiré
 * au sort entre deux valeurs. C'est ça qu'on mesure.
 *
 * 🔴 TÉMOIN : les lignes dont la 2e candidate est la MÊME entrée que la 1re
 * (rapport 1,00) doivent toutes sortir « sans enjeu ». Et une marge élevée
 * (> 0,05) ne doit jamais être comptée sur un fil.
 *
 * Usage : node scripts/banc-prix-sur-un-fil.mjs
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const BRUIT = 0.006; // marge médiane mesurée le 10/09 sur 317 paires d'étalon
const ECART_MATERIEL = 1.5;

const { data: cat, error: eCat } = await supa
  .from("market_prices")
  .select("job_type,label,metier,unit,price_min_unit_ht,price_max_unit_ht,fixed_min_ht,fixed_max_ht");
if (eCat) throw new Error(eCat.message);
const parJob = new Map(cat.map((e) => [e.job_type, e]));
const plafond = (e) => (e.price_max_unit_ht > 0 ? Number(e.price_max_unit_ht) : Number(e.fixed_max_ht ?? 0));
const fmt = (e) =>
  e.price_max_unit_ht > 0
    ? `${e.price_min_unit_ht}-${e.price_max_unit_ht} €/${e.unit}`
    : `${e.fixed_min_ht}-${e.fixed_max_ht} € forfait`;
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

const affiches = []; // toutes les lignes en confiance HAUTE
for (const a of docs) {
  let p;
  try {
    p = JSON.parse(a.raw_text || "{}");
  } catch {
    continue;
  }
  for (const g of Array.isArray(p.n8n_price_data) ? p.n8n_price_data : []) {
    const v = g?.vectorial;
    if (v?.confidence !== "high") continue; // seuls les prix AFFICHÉS nous intéressent
    const c = v.all_candidates;
    if (!Array.isArray(c) || c.length < 2) continue;
    const A = parJob.get(c[0]?.job_type);
    const B = parJob.get(c[1]?.job_type);
    if (!A || !B) continue;
    affiches.push({
      desc: String(g.devis_lines?.[0]?.description ?? "").replace(/\s+/g, " ").slice(0, 76),
      ht: Number(g.devis_total_ht ?? 0) || 0,
      marge: Number(c[0].similarity ?? 0) - Number(c[1].similarity ?? 0),
      A,
      B,
      devis: a.file_name,
    });
  }
}

// ── TÉMOIN ─────────────────────────────────────────────────────────────────
const memeEntree = affiches.filter((l) => l.A.job_type === l.B.job_type);
const margesHautes = affiches.filter((l) => l.marge > 0.05);
const surUnFil = (l) => {
  if (l.A.job_type === l.B.job_type) return false;
  if (!memeNature(l.A, l.B)) return false;
  const pa = plafond(l.A);
  const pb = plafond(l.B);
  if (!pa || !pb) return false;
  return l.marge < BRUIT && Math.max(pa, pb) / Math.min(pa, pb) >= ECART_MATERIEL;
};
console.log(`\n══ TÉMOIN ══`);
console.log(`   lignes dont la 2e candidate EST la 1re : ${memeEntree.length} · comptées sur un fil : ${memeEntree.filter(surUnFil).length}`);
console.log(`   lignes à marge > 0,05 (départage franc) : ${margesHautes.length} · comptées sur un fil : ${margesHautes.filter(surUnFil).length}`);
if (memeEntree.filter(surUnFil).length || margesHautes.filter(surUnFil).length) {
  console.log("   🔴 TÉMOIN FAUX — le banc compte des lignes qui ne sont pas sur un fil.");
  process.exit(1);
}
console.log("   ✓ le banc ne compte ni une entrée contre elle-même, ni un départage franc.\n");

// ── Le chiffre ─────────────────────────────────────────────────────────────
const fils = affiches.filter(surUnFil);
const eur = (n) => Math.round(n).toLocaleString("fr-FR");
const somme = (t) => t.reduce((s, x) => s + x.ht, 0);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

console.log(`══ ${docs.length} documents · ${affiches.length} postes AFFICHÉS avec un prix ══\n`);
console.log(`Sur un fil (marge < ${BRUIT} ET plafonds ×${ECART_MATERIEL} ou plus) :`);
console.log(`   ${fils.length} postes (${pct(fils.length, affiches.length)} %) · ${eur(somme(fils))} € de devis\n`);

// Distribution des marges, pour situer
const marges = affiches.map((l) => l.marge).sort((a, b) => a - b);
const q = (p) => marges[Math.floor(marges.length * p)]?.toFixed(4);
console.log(`Marge 1re↔2e sur les prix affichés : médiane ${q(0.5)} · 1er quartile ${q(0.25)} · 1er décile ${q(0.1)}`);
console.log(`(plancher de bruit mesuré le 10/09 : 0,006)\n`);

// ── Parmi ces paires, lesquelles sont de VRAIS doublons ? ──────────────────
//
// ⚠️ Un juge NE TRANCHE PAS. Le protocole du 10/09 est explicite : les doublons
// se tranchent « sur sources et non au jugé », et la passe de ce jour-là a
// rappelé que « l'usage ne fait pas la justesse » (l'entrée la PLUS utilisée du
// stock était la mauvaise). Ce mode produit une LISTE COURTE à instruire, pas
// une décision de suppression.
if (process.argv.includes("--juger-doublons")) {
  const CLE = lire("GOOGLE_API_KEY");
  const uniques = new Map();
  for (const l of fils) {
    const cle = [l.A.job_type, l.B.job_type].sort().join("|");
    if (!uniques.has(cle)) uniques.set(cle, { A: l.A, B: l.B, n: 0, ht: 0 });
    const e = uniques.get(cle);
    e.n++;
    e.ht += l.ht;
  }
  const paires = [...uniques.values()];
  console.log(`── ${paires.length} paires distinctes soumises au juge ──\n`);

  const CONSIGNE = `Tu compares DEUX entrées d'un catalogue de prix du bâtiment français.

Question : décrivent-elles le MÊME ouvrage, au point qu'avoir les deux dans un catalogue soit une redondance ?

Réponds "identique" si c'est le même ouvrage sous deux noms (redondance à supprimer).
Réponds "different" si ce sont deux ouvrages distincts qui méritent chacun leur prix.
Réponds "chevauche" si l'un est un sous-ensemble ou une variante de l'autre.

Ne tiens PAS compte des prix pour juger : seulement de la prestation décrite.

Réponds uniquement en JSON : {"verdict": "identique|different|chevauche", "raison": "<20 mots max>"}`;

  const res = [];
  for (let i = 0; i < paires.length; i += 5) {
    const lot = paires.slice(i, i + 5);
    const out = await Promise.all(lot.map(async (p) => {
      const prompt = `${CONSIGNE}\n\nENTRÉE A : ${p.A.label} (unité : ${p.A.unit}, métier : ${p.A.metier})\nENTRÉE B : ${p.B.label} (unité : ${p.B.unit}, métier : ${p.B.metier})`;
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CLE}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0, maxOutputTokens: 8192, responseMimeType: "application/json" },
            }),
            signal: AbortSignal.timeout(20_000),
          },
        );
        if (!r.ok) return { p, avis: null };
        const t = (await r.json())?.candidates?.[0]?.content?.parts?.[0]?.text;
        const bloc = String(t ?? "").match(/\{[\s\S]*\}/);
        return { p, avis: bloc ? JSON.parse(bloc[0]) : null };
      } catch {
        return { p, avis: null };
      }
    }));
    res.push(...out);
    process.stdout.write(`\r  ${Math.min(i + 5, paires.length)}/${paires.length}`);
  }
  console.log("\n");

  for (const verdict of ["identique", "chevauche", "different"]) {
    const g = res.filter((x) => x.avis?.verdict === verdict).sort((a, b) => b.p.ht - a.p.ht);
    if (!g.length) continue;
    const titre = { identique: "🔴 REDONDANTES — à instruire sur sources", chevauche: "🟡 QUI SE CHEVAUCHENT", different: "✓ RÉELLEMENT DIFFÉRENTES — le catalogue a raison, c'est le départage qui manque" }[verdict];
    console.log(`\n══ ${titre} — ${g.length} paires · ${eur(g.reduce((s, x) => s + x.p.ht, 0))} € ══`);
    for (const { p, avis } of g) {
      console.log(`  ${eur(p.ht).padStart(8)} € (${p.n} poste${p.n > 1 ? "s" : ""})`);
      console.log(`     « ${p.A.label} » ${fmt(p.A)}`);
      console.log(`     « ${p.B.label} » ${fmt(p.B)}`);
      console.log(`     → ${avis.raison}`);
    }
  }
  const muets = res.filter((x) => !x.avis);
  if (muets.length) console.log(`\n(${muets.length} paires sans réponse du juge)`);
  console.log(`\n⚠️ Une paire « redondante » n'est PAS une suppression : elle se tranche sur SOURCES.`);
  console.log(`   Le 10/09 l'entrée la PLUS utilisée du stock était la fausse — l'usage ne fait pas la justesse.\n`);
  process.exit(0);
}

console.log(`── Les postes concernés, par montant ──`);
for (const l of fils.sort((a, b) => b.ht - a.ht).slice(0, 20)) {
  const pa = plafond(l.A);
  const pb = plafond(l.B);
  console.log(`  ${eur(l.ht).padStart(8)} € · marge ${l.marge.toFixed(4)} · plafonds ×${(Math.max(pa, pb) / Math.min(pa, pb)).toFixed(2)}`);
  console.log(`     ${l.desc}`);
  console.log(`     retenu  « ${l.A.label} » ${fmt(l.A)}`);
  console.log(`     écarté  « ${l.B.label} » ${fmt(l.B)}`);
}
