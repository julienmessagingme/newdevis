/**
 * scripts/banc-categorie.mjs
 *
 * 2026-09-11 — LA CATÉGORIE PRODUITE À L'EXTRACTION AIDE-T-ELLE, OU NUIT-ELLE ?
 *
 * `buildQueryEmbeddingText` (market-matcher-vectorial.ts) ajoute à chaque ligne
 * de devis « Catégorie : X » et « Unité : Y » avant de l'embarquer. Le X vient
 * de Gemini à l'extraction. Sur « Enduit à la chaux gratté fin » (6 020 €), il
 * vaut « Préparation du support » — une couche de FINITION classée en
 * préparation — et c'est ce suffixe qui fait basculer le rapprochement sur
 * l'enduit d'intérieur : sans lui, la bonne entrée sort PREMIÈRE (cas relevé le
 * 11/09). Un cas ne fait pas une mesure ; ce banc en fait une.
 *
 * ── Méthode ────────────────────────────────────────────────────────────────
 * Ablation : on rejoue le classement de l'étalon de CONSENSUS avec quatre
 * textes de requête, tout le reste identique (même catalogue, même modèle,
 * même taskType) :
 *     P   description + Catégorie + Unité   ← ce que fait la production
 *     SC  description + Unité                (catégorie retirée)
 *     SU  description + Catégorie            (unité retirée, pour comparaison)
 *     D   description seule
 *
 * ⚠️ POURQUOI PAS LE BANC DU 10/09. `banc-embedding.mjs` a bien comparé une
 * requête « brute » à la requête enrichie — mais (a) sur l'étalon LEXICAL, qui
 * ne retient que les lignes dont une entrée reprend tous les mots, c'est-à-dire
 * justement celles où la catégorie pèse le moins, et (b) en retirant catégorie
 * ET unité d'un bloc. Ici : étalon relu par deux juges, et ablation séparée.
 *
 * 🔴 LE TÉMOIN D'ABORD, comme pour le banc de re-classement. La variante P est
 * recalculée de bout en bout et doit rendre EXACTEMENT le score de
 * `score-rapprochement.mjs` en mode catalogue du jour. Sans ce contrôle, un
 * banc faux ferait passer n'importe quelle ablation pour un progrès.
 *
 * Usage :
 *   node scripts/banc-categorie.mjs            (étalon de consensus)
 *   node scripts/banc-categorie.mjs --stock    (exposition sur le stock réel)
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const CLE = lire("GOOGLE_API_KEY");
const MODELE = "models/gemini-embedding-001";
const STOCK = process.argv.includes("--stock");

// ── Construction des textes : la MÊME règle que la production ───────────────
const utilisable = (v) => v && String(v).trim() && String(v).trim().toLowerCase() !== "autre";
const texteRequete = (desc, cat, unite, { avecCat = true, avecUnite = true } = {}) => {
  const p = [String(desc).trim()];
  if (avecCat && utilisable(cat)) p.push(`Catégorie : ${String(cat).trim()}`);
  if (avecUnite && unite && String(unite).trim()) p.push(`Unité : ${String(unite).trim()}`);
  return p.join(". ");
};

/** Une catégorie « propre » est une famille de métier (electricite, platrerie…).
 *  Tout le reste est un TITRE DE SECTION recopié du devis (« SALLE DE BAIN »,
 *  « Description des travaux à réaliser : »). La distinction n'est pas cosmétique :
 *  elle sépare deux défauts d'extraction très différents. */
const estFamille = (c) => utilisable(c) && /^[a-zà-ÿ]+(_[a-zà-ÿ]+)*$/.test(String(c).trim());

// ── Catalogue ───────────────────────────────────────────────────────────────
const norme = (v) => { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i]; return Math.sqrt(s); };
async function chargerCatalogue() {
  let d = 0; const brut = [];
  for (;;) {
    const { data, error } = await supa.from("market_prices").select("job_type,label,embedding").range(d, d + 499);
    if (error) throw error;
    brut.push(...data);
    if (data.length < 500) break;
    d += 500;
  }
  const cat = brut.filter((r) => r.embedding).map((r) => {
    const vec = Float64Array.from(typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding);
    return { job_type: r.job_type, label: r.label, vec, norme: norme(vec) };
  });
  console.log(`catalogue : ${cat.length} entrées`);
  return cat;
}

async function embarquer(textes, nomCache) {
  const f = `scratch/cat-${nomCache}.bin`;
  if (fs.existsSync(f)) {
    const b = fs.readFileSync(f);
    const a = new Float64Array(b.buffer, b.byteOffset, b.length / 8);
    if (a.length === textes.length * 768) {
      return Array.from({ length: textes.length }, (_, i) => a.subarray(i * 768, (i + 1) * 768));
    }
  }
  const out = [];
  for (let i = 0; i < textes.length; i += 50) {
    const lot = textes.slice(i, i + 50);
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${MODELE}:batchEmbedContents?key=${CLE}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: lot.map((t) => ({ model: MODELE, content: { parts: [{ text: t }] }, taskType: "RETRIEVAL_QUERY", outputDimensionality: 768 })),
      }),
    });
    if (!r.ok) throw new Error(`Gemini ${r.status} : ${(await r.text()).slice(0, 200)}`);
    const v = ((await r.json()).embeddings ?? []).map((e) => Float64Array.from(e.values));
    if (v.length !== lot.length) throw new Error("retour incomplet de l'API");
    out.push(...v);
    process.stdout.write(`\r  ${nomCache} : ${Math.min(i + 50, textes.length)}/${textes.length}`);
  }
  process.stdout.write("\n");
  fs.mkdirSync("scratch", { recursive: true });
  const flat = new Float64Array(out.length * 768);
  out.forEach((x, i) => flat.set(x, i * 768));
  fs.writeFileSync(f, Buffer.from(flat.buffer));
  return out;
}

const classer = (v, catalogue, k = 5) => {
  const nq = norme(v);
  return catalogue.map((r) => {
    let s = 0; for (let i = 0; i < 768; i++) s += v[i] * r.vec[i];
    return { job_type: r.job_type, label: r.label, similarity: s / (nq * r.norme) };
  }).sort((a, b) => b.similarity - a.similarity).slice(0, k);
};

const catalogue = await chargerCatalogue();
const pc = (n, d) => (d ? Math.round((n / d) * 100) + " %" : "—");

// ════════════════════════════════════════════════════════════════════════════
// MODE ÉTALON — la seule mesure qui dise si la catégorie AIDE ou NUIT
// ════════════════════════════════════════════════════════════════════════════
if (!STOCK) {
  const { data: etalon, error } = await supa.from("match_gold_standard").select("*").order("id");
  if (error) throw error;

  const lignes = etalon.map((l) => ({
    ...l,
    cat: l.contexte?.categorie ?? null,
    unite: l.contexte?.unite ?? null,
  }));

  // ⚠️ Contrôle de reconstitution : si le texte que je rebâtis diffère de celui
  // qui a servi en production, tout le banc mesure autre chose que la prod.
  const divergents = lignes.filter((l) => texteRequete(l.ligne_devis, l.cat, l.unite) !== l.texte_requete);
  if (divergents.length) {
    throw new Error(`${divergents.length} textes de requête non reconstituables (${divergents[0].id}) — banc invalide`);
  }

  const VARIANTES = {
    P: (l) => texteRequete(l.ligne_devis, l.cat, l.unite),
    SC: (l) => texteRequete(l.ligne_devis, l.cat, l.unite, { avecCat: false }),
    SU: (l) => texteRequete(l.ligne_devis, l.cat, l.unite, { avecUnite: false }),
    D: (l) => texteRequete(l.ligne_devis, l.cat, l.unite, { avecCat: false, avecUnite: false }),
    // H — la règle candidate : garder la catégorie quand c'est une FAMILLE de
    // métier, la retirer quand c'est un titre de section recopié du devis.
    H: (l) => texteRequete(l.ligne_devis, l.cat, l.unite, { avecCat: estFamille(l.cat) }),
  };

  const rangs = {}; // variante → id → rang de la bonne réponse (0 = hors top-5)
  const tops = {};  // variante → id → top-5
  for (const [nom, fn] of Object.entries(VARIANTES)) {
    const vecs = await embarquer(lignes.map(fn), nom);
    tops[nom] = new Map(lignes.map((l, i) => [l.id, classer(vecs[i], catalogue)]));
  }

  // Notation identique à score-rapprochement.mjs : on retrouve par job_type
  // l'entrée que le relecteur avait désignée dans SA liste.
  const attendus = (r) => (r === "0" ? [0] : String(r).split("|").map(Number));
  const jugeables = [];
  let aucune = 0, total = 0;
  for (const l of lignes) {
    if (!l.consensus) continue;
    total++;
    const rs = attendus(l.reponse_humaine);
    if (rs[0] === 0) { aucune++; continue; }
    const bons = new Set(rs.map((r) => l.candidats.find((c) => c.rang === r)?.job_type).filter(Boolean));
    if (!bons.size) continue;
    jugeables.push({ ...l, bons });
  }

  const rangDans = (liste, bons) => liste.findIndex((c) => bons.has(c.job_type)) + 1;

  console.log(`\nétalon de consensus : ${total} lignes · aucune entrée valable ${aucune} (${pc(aucune, total)})`);
  console.log(`lignes notées (une bonne réponse existe) : ${jugeables.length}`);
  const avecCat = jugeables.filter((l) => utilisable(l.cat)).length;
  const familles = jugeables.filter((l) => estFamille(l.cat)).length;
  console.log(`  dont catégorie exploitable : ${avecCat} — famille métier ${familles}, titre de section ${avecCat - familles}\n`);

  console.log("variante                             rang 1        rang ≤5");
  const resultats = {};
  for (const nom of Object.keys(VARIANTES)) {
    let r1 = 0, r5 = 0;
    const parLigne = new Map();
    for (const l of jugeables) {
      const r = rangDans(tops[nom].get(l.id), l.bons);
      parLigne.set(l.id, r);
      if (r === 1) r1++;
      if (r >= 1) r5++;
    }
    resultats[nom] = { r1, r5, parLigne };
    const libelle = {
      P: "P  production (cat + unité)", SC: "SC sans catégorie", SU: "SU sans unité",
      D: "D  description seule", H: "H  catégorie SI famille métier",
    }[nom];
    console.log(`${libelle.padEnd(34)} ${String(r1).padStart(3)} ${pc(r1, jugeables.length).padStart(6)}   ${String(r5).padStart(3)} ${pc(r5, jugeables.length).padStart(6)}`);
  }

  // ── Détail ligne à ligne : P → SC ─────────────────────────────────────────
  const gagnes = [], perdus = [];
  for (const l of jugeables) {
    const a = resultats.P.parLigne.get(l.id), b = resultats.SC.parLigne.get(l.id);
    if (a !== 1 && b === 1) gagnes.push(l);
    if (a === 1 && b !== 1) perdus.push(l);
  }
  const montant = (l) => Number(l.contexte?.montant_ht ?? 0);
  const somme = (arr) => arr.reduce((s, l) => s + montant(l), 0);
  console.log(`\nretirer la catégorie : +${gagnes.length} / −${perdus.length}`);
  console.log(`  montant gagné ${Math.round(somme(gagnes))} € · montant perdu ${Math.round(somme(perdus))} €`);
  for (const [titre, arr] of [["GAGNÉES", gagnes], ["PERDUES", perdus]]) {
    if (!arr.length) continue;
    console.log(`\n  ${titre} :`);
    for (const l of arr) {
      console.log(`   ${l.id}  « ${String(l.ligne_devis).replace(/\s+/g, " ").slice(0, 52)} »`);
      console.log(`        catégorie : ${l.cat}`);
      console.log(`        avec : ${tops.P.get(l.id)[0].label.slice(0, 46)} (${tops.P.get(l.id)[0].similarity.toFixed(3)})`);
      console.log(`        sans : ${tops.SC.get(l.id)[0].label.slice(0, 46)} (${tops.SC.get(l.id)[0].similarity.toFixed(3)})`);
    }
  }

  // ── La règle candidate, ligne à ligne : P → H ─────────────────────────────
  const gH = [], pH = [];
  for (const l of jugeables) {
    const a = resultats.P.parLigne.get(l.id), b = resultats.H.parLigne.get(l.id);
    if (a !== 1 && b === 1) gH.push(l);
    if (a === 1 && b !== 1) pH.push(l);
  }
  console.log(`\nrègle candidate H (catégorie seulement si famille métier) : +${gH.length} / −${pH.length}`);
  for (const [titre, arr] of [["GAGNÉES", gH], ["PERDUES", pH]]) {
    if (!arr.length) continue;
    console.log(`  ${titre} : ${arr.map((l) => `${l.id} (${String(l.cat).replace(/\s+/g, " ").slice(0, 30)})`).join(", ")}`);
  }

  // ── Le même bilan restreint aux catégories « titre de section » ───────────
  for (const [titre, filtre] of [["famille métier", (l) => estFamille(l.cat)], ["titre de section", (l) => utilisable(l.cat) && !estFamille(l.cat)]]) {
    const sous = jugeables.filter(filtre);
    if (!sous.length) continue;
    const r1P = sous.filter((l) => resultats.P.parLigne.get(l.id) === 1).length;
    const r1SC = sous.filter((l) => resultats.SC.parLigne.get(l.id) === 1).length;
    console.log(`\n  ${titre.padEnd(18)} ${sous.length} lignes · avec catégorie ${r1P} en 1er · sans ${r1SC}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MODE STOCK — combien de lignes réelles sont concernées, et pour quel montant
// ════════════════════════════════════════════════════════════════════════════
if (STOCK) {
  // Chargeur calqué sur `rejeu-rapprochement.mjs` — celui-là s'est vérifié
  // contre la production (top-1 identique 67 %, écart de similarité médian NUL
  // quand il concorde). Ne pas réinventer la lecture du stock.
  let debut = 0; const analyses = [];
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
  const vus = new Set();
  const lignes = [];
  for (const a of analyses) {
    let brut;
    try { brut = typeof a.raw_text === "string" ? JSON.parse(a.raw_text) : a.raw_text; } catch { continue; }
    const groupes = Array.isArray(brut?.n8n_price_data) ? brut.n8n_price_data : [];
    if (!groupes.length || !groupes.some((g) => g?.vectorial)) continue;
    const cle = `${a.user_id}|${(a.file_name ?? "").replace(/\s*\(\d+\)(?=\.[a-z]+$)/i, "")}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    const travaux = new Map();
    for (const t of brut?.extracted?.travaux ?? []) if (t?.libelle) travaux.set(String(t.libelle).trim(), t);
    for (const g of groupes) {
      const v = g?.vectorial;
      if (!v) continue;
      const desc = String(g.devis_lines?.[0]?.description ?? "").trim();
      if (!desc) continue;
      const t = travaux.get(desc);
      lignes.push({
        desc,
        cat: t?.categorie ? String(t.categorie).trim() : null,
        unite: String(t?.unite ?? g.devis_lines?.[0]?.unit ?? g.main_unit ?? "").trim() || null,
        montant: Number(g.devis_total_ht ?? 0) || 0,
        confiance: v.confidence,
        label: g.job_type_label ?? null,
      });
    }
  }
  console.log(`\nstock dédupliqué : ${vus.size} documents · ${lignes.length} lignes rapprochées`);
  const avecCat = lignes.filter((l) => utilisable(l.cat));
  const fam = avecCat.filter((l) => estFamille(l.cat));
  console.log(`  catégorie exploitable : ${avecCat.length} (${pc(avecCat.length, lignes.length)})`);
  console.log(`     famille métier   : ${fam.length} (${pc(fam.length, avecCat.length)})`);
  console.log(`     titre de section : ${avecCat.length - fam.length} (${pc(avecCat.length - fam.length, avecCat.length)})`);
  const hautes = avecCat.filter((l) => l.confiance === "high");
  console.log(`  dont en confiance HAUTE (prix affiché) : ${hautes.length}, ${Math.round(hautes.reduce((s, l) => s + l.montant, 0))} €`);

  // Échantillon des catégories qui ne sont pas des familles — c'est là qu'est
  // le défaut d'extraction, et il se voit à l'œil nu.
  const titres = avecCat.filter((x) => !estFamille(x.cat));
  const compte = new Map();
  for (const l of titres) compte.set(l.cat, (compte.get(l.cat) ?? 0) + 1);
  console.log("\n  titres de section les plus fréquents :");
  [...compte.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
    .forEach(([k, v]) => console.log(`    ${String(v).padStart(3)}  ${String(k).replace(/\s+/g, " ").slice(0, 70)}`));

  // ── Ce que la règle CHANGERAIT réellement ────────────────────────────────
  // On ne rejoue QUE les lignes à titre de section : ce sont les seules que la
  // règle touche. Combien changent de référence, et combien de ces changements
  // portent un prix AFFICHÉ (confiance haute) ?
  console.log(`\n  rejeu des ${titres.length} lignes à titre de section…`);
  const avecTxt = titres.map((l) => texteRequete(l.desc, l.cat, l.unite));
  const sansTxt = titres.map((l) => texteRequete(l.desc, l.cat, l.unite, { avecCat: false }));
  const vA = await embarquer(avecTxt, "stock-avec");
  const vS = await embarquer(sansTxt, "stock-sans");
  let change = 0, changeHaut = 0, montantHaut = 0;
  const exemples = [];
  for (let i = 0; i < titres.length; i++) {
    const a = classer(vA[i], catalogue, 1)[0], s = classer(vS[i], catalogue, 1)[0];
    if (!a || !s || a.job_type === s.job_type) continue;
    change++;
    if (titres[i].confiance === "high") {
      changeHaut++; montantHaut += titres[i].montant;
      exemples.push({ l: titres[i], a, s });
    }
  }
  console.log(`  changent de référence : ${change} (${pc(change, titres.length)})`);
  console.log(`  dont en confiance HAUTE — donc un prix AFFICHÉ change : ${changeHaut}, ${Math.round(montantHaut)} €`);
  for (const e of exemples) {
    console.log(`\n   « ${e.l.desc.replace(/\s+/g, " ").slice(0, 58)} »  ${Math.round(e.l.montant)} €`);
    console.log(`      catégorie : ${String(e.l.cat).replace(/\s+/g, " ").slice(0, 60)}`);
    console.log(`      avec : ${e.a.label.slice(0, 46)} (${e.a.similarity.toFixed(3)})`);
    console.log(`      sans : ${e.s.label.slice(0, 46)} (${e.s.similarity.toFixed(3)})`);
  }

  // ── Second juge ───────────────────────────────────────────────────────────
  // Ma lecture de ces 20 cas n'est qu'un avis. Le projet mesure toujours avec
  // DEUX juges — et l'ordre des deux candidats est tiré au hasard, sinon on ne
  // distingue pas un jugement d'un réflexe « je prends le premier ».
  if (process.argv.includes("--arbitrer")) {
    console.log(`\n\n══ ARBITRAGE gemini-2.5-pro des ${exemples.length} prix affichés qui changeraient ══`);
    let pourAvec = 0, pourSans = 0, aucun = 0;
    for (const [i, e] of exemples.entries()) {
      const inverse = i % 2 === 1;
      const A = inverse ? e.s : e.a, B = inverse ? e.a : e.s;
      const prompt = `Tu relis le rapprochement entre une LIGNE DE DEVIS d'artisan et notre catalogue de prix de référence.
Lequel des deux postes décrit LA MÊME PRESTATION que la ligne de devis ?
Ce n'est PAS une question de prix. Repères : un tarif "pose"/"MO" ne convient pas à une ligne qui fournit le matériel et inversement ; un composant ne vaut pas pour un lot entier ; une DÉPOSE n'est pas une POSE.
Réponds uniquement en JSON : {"choix": 1 | 2 | 0, "raison": "<15 mots max>"}  (0 = aucun des deux)

LIGNE DE DEVIS : ${e.l.desc}
Section du devis : ${e.l.cat}
Unité : ${e.l.unite ?? "non précisée"}

1. ${A.label}
2. ${B.label}`;
      let choix = null, raison = "";
      for (let essai = 0; essai < 3; essai++) {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${CLE}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 8192, responseMimeType: "application/json" } }),
        });
        if (!r.ok) { await new Promise((s) => setTimeout(s, 3000)); continue; }
        const t = (await r.json()).candidates?.[0]?.content?.parts?.[0]?.text;
        if (!t) continue;
        try { const j = JSON.parse(t); choix = Number(j.choix); raison = String(j.raison ?? "").slice(0, 90); } catch { continue; }
        break;
      }
      const gagnant = choix === 0 || choix == null ? "aucun" : (choix === 1 ? A : B) === e.a ? "AVEC catégorie" : "SANS catégorie";
      if (gagnant === "AVEC catégorie") pourAvec++; else if (gagnant === "SANS catégorie") pourSans++; else aucun++;
      console.log(`\n « ${e.l.desc.replace(/\s+/g, " ").slice(0, 54)} »  ${Math.round(e.l.montant)} €`);
      console.log(`    avec : ${e.a.label.slice(0, 44)}`);
      console.log(`    sans : ${e.s.label.slice(0, 44)}`);
      console.log(`    → ${gagnant}  (${raison})`);
      await new Promise((s) => setTimeout(s, 400));
    }
    console.log(`\nBILAN : la catégorie donne le meilleur poste ${pourAvec} fois, le pire ${pourSans} fois, indifférent ${aucun}.`);
  }

  // ── Combien de catégories sont FAUSSES ? ──────────────────────────────────
  // L'ablation dit si le suffixe aide. Elle ne dit pas s'il est JUSTE. Un seul
  // cas mesuré (« Enduit à la chaux gratté fin » classé en « Préparation du
  // support », 6 020 €) ne fait pas une fréquence — celle-ci en fait une, sur
  // les lignes dont le prix est AFFICHÉ, les seules qui engagent l'utilisateur.
  if (process.argv.includes("--qualite")) {
    const N = 100;
    const hautes2 = lignes.filter((l) => l.confiance === "high" && utilisable(l.cat));
    // Tirage déterministe : la mesure doit être rejouable à l'identique.
    let x = 987654321;
    const alea = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
    const tirage = [...hautes2].sort(() => alea() - 0.5).slice(0, N);
    console.log(`\n\n══ JUSTESSE DE LA CATÉGORIE — ${tirage.length} lignes en confiance haute ══`);
    const comptes = { juste: 0, large: 0, fausse: 0, titre: 0, nul: 0 };
    const fausses = [];
    for (const l of tirage) {
      const prompt = `Voici une ligne de devis d'artisan et la CATÉGORIE que notre lecteur automatique lui a attribuée.
La catégorie décrit-elle correctement la nature des travaux de cette ligne ?

Réponds uniquement en JSON : {"verdict": "juste" | "large" | "fausse" | "titre", "raison": "<12 mots max>"}
  juste  = la catégorie nomme bien le métier ou l'ouvrage de la ligne
  large  = correcte mais trop générale pour distinguer quoi que ce soit ("travaux")
  fausse = elle désigne un AUTRE métier ou une AUTRE étape que ce que fait la ligne
  titre  = ce n'est pas une catégorie mais un intitulé de section recopié du devis

LIGNE : ${l.desc}
CATÉGORIE : ${l.cat}`;
      let v = null, raison = "";
      for (let essai = 0; essai < 3; essai++) {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${CLE}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 8192, responseMimeType: "application/json" } }),
        });
        if (!r.ok) { await new Promise((s) => setTimeout(s, 3000)); continue; }
        const t = (await r.json()).candidates?.[0]?.content?.parts?.[0]?.text;
        if (!t) continue;
        try { const j = JSON.parse(t); v = String(j.verdict); raison = String(j.raison ?? "").slice(0, 70); } catch { continue; }
        break;
      }
      if (v && comptes[v] !== undefined) comptes[v]++; else comptes.nul++;
      if (v === "fausse") fausses.push({ l, raison });
      process.stdout.write(`\r  ${Object.values(comptes).reduce((a, b) => a + b, 0)}/${tirage.length}`);
      await new Promise((s) => setTimeout(s, 250));
    }
    const n = tirage.length;
    console.log(`\n  juste  ${String(comptes.juste).padStart(3)} (${pc(comptes.juste, n)})`);
    console.log(`  large  ${String(comptes.large).padStart(3)} (${pc(comptes.large, n)})`);
    console.log(`  titre  ${String(comptes.titre).padStart(3)} (${pc(comptes.titre, n)})`);
    console.log(`  FAUSSE ${String(comptes.fausse).padStart(3)} (${pc(comptes.fausse, n)})   ← le chiffre qui décide`);
    if (comptes.nul) console.log(`  sans réponse ${comptes.nul}`);
    for (const f of fausses) {
      console.log(`\n   « ${f.l.desc.replace(/\s+/g, " ").slice(0, 56)} »  ${Math.round(f.l.montant)} €`);
      console.log(`      catégorie : ${String(f.l.cat).replace(/\s+/g, " ").slice(0, 50)}  — ${f.raison}`);
      console.log(`      référence retenue : ${String(f.l.label).slice(0, 50)}`);
    }
  }
}
