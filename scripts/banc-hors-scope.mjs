/**
 * scripts/banc-hors-scope.mjs
 *
 * 2026-09-16 — COMBIEN DE DOCUMENTS NON-BÂTIMENT PASSENT LA GARDE ?
 *
 * Deux devis de sonorisation automobile (« VL CAR AUDIO ») sont sortis en
 * `type_document = devis_travaux`, ont reçu un verdict ROUGE et ont atterri
 * dans la file de revue humaine. La garde hors-scope existe pourtant.
 *
 * 🔴 ELLE N'A PAS ÉCHOUÉ — ELLE N'A JAMAIS EU SA CHANCE. Le verdict hors-scope
 * est rendu par Gemini À L'EXTRACTION, et sa consigne (extract_v2.ts ~l.398) est
 * une LISTE D'EXCLUSIONS : « réparation véhicule, réparation électroménager,
 * achat de biens, services personnels, médical, vétérinaire ». Une INSTALLATION
 * audio n'est pas une RÉPARATION, et « caisson sur mesure », « kit câblage
 * 50 mm² », « entretoise », « main d'œuvre » sont du vocabulaire de chantier.
 *
 * Une liste d'exclusions ne peut pas être complète : sonorisation auto, bateau,
 * moto, caravane, matériel agricole, informatique… Même défaut de NATURE que la
 * règle dommages-ouvrage du 08/09, qui a dû passer d'une liste de NOMS à une
 * RELATION (« une action portée sur un élément porteur »).
 *
 * Ce banc mesure l'ampleur avant de toucher à quoi que ce soit.
 *
 * 🔴 TÉMOIN : les documents que l'extraction a DÉJÀ classés hors-scope doivent
 * tous être retrouvés par le juge comme non-bâtiment. S'il en contredit, c'est
 * lui qu'il faut corriger avant de l'écouter sur le reste.
 *
 * Usage : node scripts/banc-hors-scope.mjs [--juger]
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const { data: analyses, error } = await supa
  .from("analyses")
  .select("id,user_id,file_name,created_at,review_status,raw_text,conclusion_ia")
  .not("raw_text", "is", null)
  .order("created_at", { ascending: false });
if (error) throw new Error(error.message);

const vus = new Set();
const docs = [];
for (const a of analyses) {
  const cle = `${a.user_id}|${a.file_name}`;
  if (vus.has(cle)) continue;
  vus.add(cle);
  let r;
  try {
    r = JSON.parse(a.raw_text || "{}");
  } catch {
    continue;
  }
  const e = r?.extracted;
  if (!e) continue;
  const lignes = (e.travaux ?? []).map((t) => String(t?.libelle ?? "")).filter(Boolean);
  if (!lignes.length) continue;
  vus.add(cle);
  let c = {};
  try {
    c = JSON.parse(a.conclusion_ia || "{}");
  } catch {}
  docs.push({
    id: a.id,
    fichier: a.file_name,
    date: a.created_at,
    review: a.review_status,
    type: e.type_document ?? null,
    categorie: e.hors_scope_categorie ?? null,
    entreprise: e.entreprise?.nom ?? null,
    ht: Number(e.totaux?.ht ?? 0) || 0,
    verdict: c.verdict_global ?? null,
    lignes,
  });
}

console.log(`\n${docs.length} documents dédupliqués avec des lignes exploitables.`);
const dejaHorsScope = docs.filter((d) => d.categorie || d.type === "hors_scope");
console.log(`Déjà classés hors-scope par l'extraction : ${dejaHorsScope.length}`);

if (!process.argv.includes("--juger")) {
  console.log("\n(ajouter --juger pour soumettre le corpus au juge)\n");
  process.exit(0);
}

const CLE = lire("GOOGLE_API_KEY");

/**
 * 🔴 LA QUESTION EST POSÉE À L'ENVERS DE LA CONSIGNE ACTUELLE.
 *
 * On ne demande PAS « est-ce l'une de ces six catégories interdites ? » — c'est
 * la formulation qui a laissé passer la sonorisation auto. On demande le
 * critère POSITIF, celui qui définit notre métier : les travaux portent-ils sur
 * un BÂTIMENT ou son terrain ?
 */
const CONSIGNE = `Tu tries des documents pour un outil qui analyse UNIQUEMENT des devis de travaux du bâtiment.

Question : ces prestations portent-elles sur un BÂTIMENT (maison, appartement, local, immeuble) ou sur son TERRAIN (jardin, clôture, piscine, allée, assainissement) ?

Réponds "batiment" si oui — même partiellement, même s'il s'agit d'un petit lot.
Réponds "hors" si les prestations portent sur autre chose : un véhicule, un bateau, un appareil électroménager, du mobilier livré sans pose, une prestation de service à la personne, un acte médical ou vétérinaire, du matériel informatique, etc.
Réponds "incertain" si les libellés ne permettent pas de trancher.

⚠️ Attention aux faux amis : « câblage », « caisson », « main d'œuvre », « installation », « sur mesure » existent dans les DEUX mondes. Ce qui tranche est l'OBJET sur lequel on intervient, pas le verbe.

Réponds uniquement en JSON : {"verdict": "batiment|hors|incertain", "objet": "<sur quoi on intervient, 6 mots max>"}`;

const juger = async (d) => {
  const prompt = `${CONSIGNE}\n\nÉMETTEUR : ${d.entreprise ?? "non précisé"}\nLIGNES :\n${d.lignes.slice(0, 14).map((l) => `- ${l.slice(0, 110)}`).join("\n")}`;
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
    if (!r.ok) return null;
    const t = (await r.json())?.candidates?.[0]?.content?.parts?.[0]?.text;
    const bloc = String(t ?? "").match(/\{[\s\S]*\}/);
    return bloc ? JSON.parse(bloc[0]) : null;
  } catch {
    return null;
  }
};

// ── TÉMOIN ────────────────────────────────────────────────────────────────
//
// 🔴 PREMIÈRE VERSION DE CE TÉMOIN : FAUSSE, ET LA FAUTE EST INSTRUCTIVE.
// Il prenait pour vérité de référence les documents que l'EXTRACTION classe
// hors-scope — or c'est précisément l'extraction qu'on audite. Circulaire, même
// défaut que l'étalon lexical du 10/09 qui ne pouvait pas juger une règle
// lexicale. Le juge a d'ailleurs contredit une de ces trois étiquettes, et
// VÉRIFICATION FAITE, **c'est lui qui avait raison** : un rail d'éclairage
// TRACK UNO 230V avec spots GU10 et variateur, classé `achat_biens`, est du
// matériel de BÂTIMENT. La garde se trompe donc dans les DEUX sens.
//
// Le témoin porte donc sur des cas lus à la main, dont la réponse ne dépend
// d'aucune sortie de notre propre pipeline.
const TEMOIN = [
  { motif: /VL CAR AUDIO|Deaf Bonce|Phoenix Gold/i, attendu: "hors", quoi: "sonorisation automobile" },
  { motif: /LECHE-VITRE|AUTOPEINT/i, attendu: "hors", quoi: "carrosserie automobile" },
  { motif: /VOLTELEC/i, attendu: "batiment", quoi: "climatisation d'un logement" },
  { motif: /RADIOKEYD|Digicode anti vandale/i, attendu: "batiment", quoi: "portail et digicode" },
  { motif: /TRACK UNO|YERA 1T GU10/i, attendu: "batiment", quoi: "rail d'éclairage intérieur" },
];
const casTemoin = [];
for (const t of TEMOIN) {
  const d = docs.find((x) => t.motif.test(`${x.entreprise ?? ""} ${x.lignes.join(" ")}`));
  if (d) casTemoin.push({ d, ...t });
}
console.log(`\n══ TÉMOIN — ${casTemoin.length} documents dont j'ai lu les lignes moi-même ══`);
if (casTemoin.length < 4) {
  console.log("   🔴 moins de 4 cas retrouvés : témoin trop maigre pour valider le juge.");
  process.exit(1);
}
const rT = await Promise.all(casTemoin.map((c) => juger(c.d)));
let rates = 0;
for (const [i, c] of casTemoin.entries()) {
  const ok = rT[i]?.verdict === c.attendu;
  if (!ok) rates++;
  console.log(`   ${ok ? "✓" : "🔴"} attendu ${c.attendu.padEnd(8)} · obtenu ${String(rT[i]?.verdict ?? "muet").padEnd(9)} · ${c.quoi}`);
}
if (rates) {
  console.log(`   🔴 TÉMOIN FAUX — ${rates} cas manqués. Le juge n'est pas fiable, ne pas lire la suite.`);
  process.exit(1);
}
console.log("   ✓ le juge tranche correctement les cas connus, dans les deux sens.\n");

// ── Le corpus ─────────────────────────────────────────────────────────────
// ⚠️ On rejuge TOUT le corpus, y compris ce que l'extraction a déjà étiqueté :
// le témoin vient de montrer que ces étiquettes se trompent dans les deux sens.
const aJuger = docs;
const avis = [];
for (let i = 0; i < aJuger.length; i += 8) {
  const lot = aJuger.slice(i, i + 8);
  const out = await Promise.all(lot.map(juger));
  lot.forEach((d, k) => avis.push({ d, a: out[k] }));
  process.stdout.write(`\r  ${Math.min(i + 8, aJuger.length)}/${aJuger.length}`);
}
console.log("\n");

const hors = avis.filter((x) => x.a?.verdict === "hors");
const incertain = avis.filter((x) => x.a?.verdict === "incertain");
const muets = avis.filter((x) => !x.a);

console.log(`══ ${aJuger.length} documents que l'extraction a laissés passer ══`);
console.log(`   NON-BÂTIMENT : ${hors.length} (${Math.round((hors.length / aJuger.length) * 100)} %)`);
console.log(`   incertains   : ${incertain.length}`);
console.log(`   sans réponse : ${muets.length}\n`);

const eur = (n) => Math.round(n).toLocaleString("fr-FR");
console.log(`── Les non-bâtiment passés à travers ──`);
for (const { d, a } of hors.sort((x, y) => y.d.ht - x.d.ht)) {
  console.log(`  ${d.date?.slice(0, 10)} · ${eur(d.ht).padStart(8)} € · type=${d.type} · verdict=${d.verdict ?? "—"} · review=${d.review}`);
  console.log(`     ${d.fichier.slice(0, 64)} — ${d.entreprise ?? "?"}`);
  console.log(`     objet : ${a.objet}`);
  console.log(`     ex.   : ${d.lignes.slice(0, 2).map((l) => l.slice(0, 54)).join(" | ")}`);
}

const enRevue = hors.filter((x) => x.d.review === "pending_review");
console.log(`\n⚠️ ${enRevue.length} de ces documents occupent la file de revue humaine.`);
