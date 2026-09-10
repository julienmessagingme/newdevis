/**
 * scripts/rejeu-rapprochement.mjs
 *
 * 2026-09-10 — REJOUER LE RAPPROCHEMENT CATALOGUE SUR TOUT LE STOCK, HORS PROD.
 *
 * Toute idée pour récupérer les postes « Prix non vérifiable » (élargir un
 * seuil, réécrire des libellés, ajouter des entrées) se juge sur deux chiffres
 * et deux seulement : combien de lignes passent en confiance HAUTE, et combien
 * la PERDENT. Ce script les produit sans rien toucher à la base ni à la prod.
 *
 * Il a déjà servi à refuser une hypothèse qui paraissait évidente (réécrire les
 * libellés en mettant l'objet en tête) — voir CLAUDE.md, § « la réécriture des
 * libellés est mesurée et ne rend pas ce qu'elle promet ».
 *
 * ── Comment ça marche ──
 *   1. Reconstitue, pour chaque groupe du stock, le TEXTE DE REQUÊTE exact que
 *      la production embarque (`buildQueryEmbeddingText` : description, puis
 *      « Catégorie : … », puis « Unité : … »). La catégorie et l'unité sont
 *      retrouvées dans `raw_text.extracted.travaux` par le libellé de la ligne.
 *   2. Embarque ces textes une fois (cache disque), en RETRIEVAL_QUERY.
 *   3. Charge les 919 vecteurs du catalogue depuis la base.
 *   4. Classe en local par cosinus, et VÉRIFIE qu'il retrouve le top-1 de
 *      production. Sans cette vérification, le reste ne vaut rien.
 *   5. Avec `--reecriture`, réembarque les libellés proposés en
 *      RETRIEVAL_DOCUMENT, refait le classement, et compare les confiances
 *      FINALES — promotion lexicale comprise, sinon on ne mesure que la moitié
 *      du mécanisme.
 *
 * ⚠️ Deux précautions sans lesquelles les chiffres sont faux : déduplication des
 * redépôts (`user_id|nom de fichier`, ~15 % du stock) et mise à l'écart des
 * devis hors zone euro.
 *
 * ⚠️ La reproduction du top-1 plafonne autour de 70 %, et c'est NORMAL : le
 * catalogue a changé depuis les analyses les plus anciennes. Ce qui compte est
 * que l'écart de similarité soit NUL quand le top-1 concorde — c'est la preuve
 * que la mécanique est fidèle. La comparaison avant/après, elle, se fait à
 * catalogue constant : elle n'est pas affectée par cette dérive.
 *
 * Usage :
 *   node scripts/rejeu-rapprochement.mjs                     # état des lieux + vérification
 *   node scripts/rejeu-rapprochement.mjs --reecriture r.json # mesure avant/après
 *
 * Format de `r.json` : [{ "job_type": "prise", "nouveau": "Prise (ajout)" }, …]
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const CLE_GEMINI = lire("GOOGLE_API_KEY");
const MODELE = "models/gemini-embedding-001";

const CACHE = ".cache-rejeu";
fs.mkdirSync(CACHE, { recursive: true });

const REECRITURE = process.argv.includes("--reecriture")
  ? JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf("--reecriture") + 1], "utf8"))
  : null;

// Seuils : ceux du matcher, pas ceux d'ailleurs. ⚠️ HIGH vaut 0,77 depuis le
// recalibrage du 2026-06-30 — une constante à 0,85 traîne côté client et a déjà
// induit une lecture fausse des mesures.
const HAUTE = 0.77, MOYENNE = 0.70, AUCUN = 0.50;
const tier = (s) => (s < AUCUN ? "no_match" : s < MOYENNE ? "low" : s < HAUTE ? "medium" : "high");

const HORS_ZONE = /dangote|sanaga|fcfa|cfa\b|yaound|douala|cameroun|abidjan|dakar|s[ée]n[ée]gal/i;
const eur = (n) => Math.round(n).toLocaleString("fr-FR") + " €";

// ── 1. Le stock ─────────────────────────────────────────────────────────────

async function chargerStock() {
  let debut = 0;
  const analyses = [];
  for (;;) {
    const { data, error } = await supa
      .from("analyses").select("id,user_id,file_name,created_at,raw_text")
      .eq("status", "completed").order("created_at", { ascending: false })
      .range(debut, debut + 499);
    if (error) throw error;
    analyses.push(...data);
    if (data.length < 500) break;
    debut += 500;
  }
  const documents = new Set();
  const lignes = [];
  let redepots = 0, horsZone = 0;
  for (const a of analyses) {
    let brut;
    try { brut = typeof a.raw_text === "string" ? JSON.parse(a.raw_text) : a.raw_text; } catch { continue; }
    const groupes = Array.isArray(brut?.n8n_price_data) ? brut.n8n_price_data : [];
    if (!groupes.length || !groupes.some((g) => g?.vectorial)) continue;
    const texte = groupes.map((g) => (g.devis_lines ?? []).map((l) => l.description ?? "").join(" ")).join(" ");
    if (HORS_ZONE.test(texte) || brut?.extracted?.is_foreign_quote) { horsZone++; continue; }
    const cle = `${a.user_id}|${(a.file_name ?? "").replace(/\s*\(\d+\)(?=\.[a-z]+$)/i, "")}`;
    if (documents.has(cle)) { redepots++; continue; }
    documents.add(cle);
    // Index des travaux extraits : c'est là que vivent `categorie` et `unite`,
    // que la production concatène au texte embarqué.
    const travaux = new Map();
    for (const t of brut?.extracted?.travaux ?? []) if (t?.libelle) travaux.set(String(t.libelle).trim(), t);
    for (const g of groupes) {
      const v = g?.vectorial;
      if (!v) continue;
      const desc = String(g.devis_lines?.[0]?.description ?? "").trim();
      if (!desc) continue;
      const t = travaux.get(desc);
      const parties = [desc];
      const cat = t?.categorie ? String(t.categorie).trim() : "";
      if (cat && cat.toLowerCase() !== "autre") parties.push(`Catégorie : ${cat}`);
      const unite = String(t?.unite ?? g.devis_lines?.[0]?.unit ?? g.main_unit ?? "").trim();
      if (unite) parties.push(`Unité : ${unite}`);
      lignes.push({
        analyse: a.id, date: a.created_at, desc, ht: Number(g.devis_total_ht ?? 0) || 0,
        requete: parties.join(". "), confProd: v.confidence,
        simProd: Number(v.top_similarity ?? 0),
        jobProd: v.all_candidates?.[0]?.job_type ?? null,
      });
    }
  }
  console.log(`documents retenus : ${documents.size} · redépôts écartés : ${redepots} · hors zone euro : ${horsZone}`);
  return lignes;
}

// ── 2. Embeddings ───────────────────────────────────────────────────────────

async function embarquer(textes, tache, fichierCache) {
  const chemin = path.join(CACHE, fichierCache);
  const cache = fs.existsSync(chemin) ? JSON.parse(fs.readFileSync(chemin, "utf8")) : {};
  const manquants = [...new Set(textes)].filter((t) => !cache[t]);
  for (let i = 0; i < manquants.length; i += 80) {
    const lot = manquants.slice(i, i + 80);
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${MODELE}:batchEmbedContents?key=${CLE_GEMINI}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: lot.map((t) => ({
          model: MODELE, content: { parts: [{ text: t }] },
          taskType: tache, outputDimensionality: 768,
        })),
      }),
    });
    if (!r.ok) throw new Error(`Gemini ${r.status} : ${(await r.text()).slice(0, 200)}`);
    const vecteurs = ((await r.json()).embeddings ?? []).map((e) => e.values);
    if (vecteurs.length !== lot.length) throw new Error(`retour incomplet ${vecteurs.length}/${lot.length}`);
    lot.forEach((t, k) => { cache[t] = vecteurs[k]; });
    fs.writeFileSync(chemin, JSON.stringify(cache), "utf8");
    process.stdout.write(`\r  embeddings ${Math.min(i + 80, manquants.length)}/${manquants.length}`);
  }
  if (manquants.length) process.stdout.write("\n");
  return cache;
}

// ── 3. Catalogue ────────────────────────────────────────────────────────────

const norme = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

/** Même construction que scripts/seed_market_prices_embeddings.mjs. */
const texteCatalogue = (r, label) => [
  label || "", r.notes ? `Précisions : ${r.notes}` : "",
  `Type métier : ${r.job_type}`, r.domain ? `Domaine : ${r.domain}` : "",
  `Unité de facturation : ${r.unit}`,
].filter(Boolean).join(". ");

async function chargerCatalogue() {
  let debut = 0; const rows = [];
  for (;;) {
    const { data, error } = await supa.from("market_prices")
      .select("job_type,label,notes,domain,unit,embedding").range(debut, debut + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) break;
    debut += 500;
  }
  return rows.filter((r) => r.embedding).map((r) => {
    const vec = typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding;
    return { ...r, vec, norme: norme(vec) };
  });
}

function meilleur(v, nq, catalogue) {
  let best = null, score = -2;
  for (const r of catalogue) {
    let d = 0;
    for (let i = 0; i < 768; i++) d += v[i] * r.vec[i];
    const s = d / (nq * r.norme);
    if (s > score) { score = s; best = r; }
  }
  return { job_type: best.job_type, label: best.label, sim: score };
}

// ── Exécution ───────────────────────────────────────────────────────────────

const lignes = await chargerStock();
const requetes = await embarquer(lignes.map((l) => l.requete), "RETRIEVAL_QUERY", "requetes.json");
const catalogue = await chargerCatalogue();
console.log(`lignes : ${lignes.length} · requêtes distinctes : ${new Set(lignes.map((l) => l.requete)).size} · catalogue : ${catalogue.length}`);

// Vérification de fidélité — sans elle, aucune des mesures suivantes ne vaut.
let concordent = 0, divergent = 0; const ecarts = [];
for (const l of lignes) {
  const v = requetes[l.requete]; if (!v) continue;
  const t = meilleur(v, norme(v), catalogue);
  if (t.job_type === l.jobProd) { concordent++; ecarts.push(Math.abs(t.sim - l.simProd)); } else divergent++;
}
ecarts.sort((a, b) => a - b);
console.log(`\nfidélité — top-1 identique à la prod : ${concordent}/${concordent + divergent} (${Math.round(concordent / (concordent + divergent) * 100)} %)`);
console.log(`  écart de similarité quand il concorde : médiane ${ecarts[Math.floor(ecarts.length / 2)]?.toFixed(4)} · 90e centile ${ecarts[Math.floor(ecarts.length * 0.9)]?.toFixed(4)}`);
console.log("  (une divergence de top-1 vient du catalogue qui a changé depuis l'analyse ; l'écart médian nul prouve la mécanique)");

const repartition = {};
for (const l of lignes) {
  const v = requetes[l.requete]; if (!v) continue;
  const c = tier(meilleur(v, norme(v), catalogue).sim);
  repartition[c] = (repartition[c] ?? 0) + 1;
}
console.log("\nrépartition sur le catalogue ACTUEL :", repartition);

if (!REECRITURE) {
  console.log("\n(pas de --reecriture : état des lieux seulement)");
  process.exit(0);
}

// ── Avant / après ───────────────────────────────────────────────────────────

const { hasStrongLexicalMatch } = await import("../supabase/functions/analyze-quote/market-matcher-vectorial.ts");
const parJob = new Map(catalogue.map((r) => [r.job_type, r]));
const nouveaux = REECRITURE.filter((p) => parJob.has(p.job_type));
const labels = await embarquer(
  nouveaux.map((p) => texteCatalogue(parJob.get(p.job_type), p.nouveau)),
  "RETRIEVAL_DOCUMENT", "labels.json",
);
const remplace = new Map(nouveaux.map((p) => [p.job_type, p.nouveau]));
const APRES = catalogue.map((r) => {
  const nouveau = remplace.get(r.job_type);
  if (!nouveau) return r;
  const vec = labels[texteCatalogue(r, nouveau)];
  return { ...r, label: nouveau, vec, norme: norme(vec) };
});

// La confiance FINALE inclut la promotion lexicale : mesurer le seul cosinus
// ne dit rien du mécanisme qu'une réécriture de libellé vise en premier.
const finale = (desc, t) => {
  const c = tier(t.sim);
  return c === "medium" && hasStrongLexicalMatch(desc, t.label) ? "high" : c;
};

let gagne = 0, gagneHT = 0, perdu = 0, perduHT = 0;
const listeG = [], listeP = [];
for (const l of lignes) {
  const v = requetes[l.requete]; if (!v) continue;
  const nq = norme(v);
  const a = meilleur(v, nq, catalogue), b = meilleur(v, nq, APRES);
  const ca = finale(l.desc, a), cb = finale(l.desc, b);
  if (ca !== "high" && cb === "high") { gagne++; gagneHT += l.ht; listeG.push({ l, a, b }); }
  if (ca === "high" && cb !== "high") { perdu++; perduHT += l.ht; listeP.push({ l, a, b }); }
}
console.log(`\n${nouveaux.length} libellés réécrits · ${lignes.length} lignes rejouées`);
console.log(`  passent en confiance HAUTE : ${gagne} (${eur(gagneHT)})`);
console.log(`  PERDENT la confiance haute : ${perdu} (${eur(perduHT)})`);
console.log("\n⚠️ Le solde ne suffit pas : relire CHAQUE gain. Un faux rapprochement");
console.log("   promu en confiance haute devient opposable à l'artisan.\n");
for (const nom of ["GAGNÉES", "PERDUES"]) {
  const liste = nom === "GAGNÉES" ? listeG : listeP;
  if (!liste.length) continue;
  console.log(`── ${nom} ──`);
  for (const { l, a, b } of liste.sort((x, y) => y.l.ht - x.l.ht).slice(0, 30)) {
    console.log(`${String(eur(l.ht)).padStart(9)} ${a.sim.toFixed(3)}→${b.sim.toFixed(3)}  ${l.desc.replace(/\s+/g, " ").slice(0, 44).padEnd(45)} ${a.label.slice(0, 30)} → ${b.label.slice(0, 34)}`);
  }
  console.log("");
}
