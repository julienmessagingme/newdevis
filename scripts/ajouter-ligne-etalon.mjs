/**
 * scripts/ajouter-ligne-etalon.mjs
 *
 * 2026-09-10 — AJOUTE UNE LIGNE DE DEVIS À L'ÉTALON DU RAPPROCHEMENT.
 *
 * L'étalon n'est pas une photo prise une fois : chaque fois qu'un cas
 * intéressant apparaît en revue — un rapprochement manifestement faux, une
 * famille absente du catalogue — il vaut mieux l'y verser que le commenter et
 * l'oublier. C'est ainsi qu'il grandit sans jamais refaire un après-midi entier.
 *
 * Le script reproduit fidèlement le contexte de production : même texte de
 * requête que `buildQueryEmbeddingText` (description + « Catégorie : … » +
 * « Unité : … », lues dans `extracted.travaux`), classement sur le catalogue du
 * jour, et jugement de l'IA sur les candidats **présentés dans un ordre tiré au
 * hasard** — sans ce mélange, un modèle qui répondrait « 1 » systématiquement
 * afficherait un score flatteur sans rien juger.
 *
 * ⚠️ La réponse HUMAINE reste vide : elle ne s'invente pas. La ligne est
 * insérée avec `consensus = false`, donc elle ne pèse sur aucune mesure tant
 * qu'un relecteur n'a pas tranché. Le script affiche la question à lui poser,
 * puis `--reponse` l'enregistre.
 *
 * Usage :
 *   node scripts/ajouter-ligne-etalon.mjs <analysis_id> "<libellé exact>"
 *   node scripts/ajouter-ligne-etalon.mjs --reponse L151 2 [--par johan]
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const CLE = lire("GOOGLE_API_KEY");
const MODELE_EMB = "models/gemini-embedding-001";
const MODELE_IA = "gemini-2.5-pro";

const args = process.argv.slice(2);

// ── Mode « enregistrer la réponse humaine » ─────────────────────────────────
if (args[0] === "--reponse") {
  const [, id, reponse] = args;
  const par = args.includes("--par") ? args[args.indexOf("--par") + 1] : "johan";
  if (!id || !reponse) throw new Error("usage : --reponse <id> <1..5|0|?> [--par <nom>]");
  const { data: ligne, error: e1 } = await supa
    .from("match_gold_standard").select("reponse_ia").eq("id", id).single();
  if (e1) throw e1;
  // Consensus : les DEUX doivent avoir tranché, et sur la même entrée. Deux
  // abstentions ne font pas un jugement partagé.
  const attendu = reponse === "0" ? ["0"] : reponse.split("|");
  const consensus =
    ligne.reponse_ia != null && ligne.reponse_ia !== "?" && attendu.includes(ligne.reponse_ia);
  const { error: e2 } = await supa.from("match_gold_standard")
    .update({ reponse_humaine: reponse, relecteur: par, consensus }).eq("id", id);
  if (e2) throw e2;
  console.log(`${id} — humain ${reponse} · IA ${ligne.reponse_ia} → ${consensus ? "consensus" : "désaccord"}`);
  process.exit(0);
}

// ── Mode « ajouter une ligne » ──────────────────────────────────────────────
const [analysisId, libelle] = args;
if (!analysisId || !libelle) {
  throw new Error('usage : node scripts/ajouter-ligne-etalon.mjs <analysis_id> "<libellé exact>"');
}

const { data: a, error } = await supa.from("analyses").select("raw_text").eq("id", analysisId).single();
if (error) throw error;
const brut = typeof a.raw_text === "string" ? JSON.parse(a.raw_text) : a.raw_text;
const travail = (brut.extracted?.travaux ?? []).find((t) => String(t.libelle).trim() === libelle.trim());
const groupe = (Array.isArray(brut.n8n_price_data) ? brut.n8n_price_data : [])
  .find((x) => String(x.devis_lines?.[0]?.description ?? "").trim() === libelle.trim());
if (!travail || !groupe) throw new Error(`ligne « ${libelle} » introuvable dans cette analyse`);

const parties = [libelle.trim()];
const categorie = travail.categorie ? String(travail.categorie).trim() : "";
if (categorie && categorie.toLowerCase() !== "autre") parties.push(`Catégorie : ${categorie}`);
const unite = travail.unite ? String(travail.unite).trim() : "";
if (unite) parties.push(`Unité : ${unite}`);
const texteRequete = parties.join(". ");

const norme = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
async function embarquer(texte) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${MODELE_EMB}:embedContent?key=${CLE}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODELE_EMB, content: { parts: [{ text: texte }] },
      taskType: "RETRIEVAL_QUERY", outputDimensionality: 768,
    }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status} : ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).embedding.values;
}

let d = 0; const rows = [];
for (;;) {
  const { data, error: e } = await supa.from("market_prices").select("job_type,label,unit,embedding").range(d, d + 499);
  if (e) throw e;
  rows.push(...data);
  if (data.length < 500) break;
  d += 500;
}
const catalogue = rows.filter((r) => r.embedding).map((r) => {
  const vec = typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding;
  return { ...r, vec, norme: norme(vec) };
});

const v = await embarquer(texteRequete);
const nq = norme(v);
const top = catalogue.map((r) => {
  let s = 0; for (let i = 0; i < 768; i++) s += v[i] * r.vec[i];
  return { ...r, sim: s / (nq * r.norme) };
}).sort((x, y) => y.sim - x.sim).slice(0, 5);
const candidats = top.map((t, i) => ({ rang: i + 1, job_type: t.job_type, label: t.label, similarity: Number(t.sim.toFixed(4)) }));

// Identifiant suivant : L001, L002… on continue la série.
const { data: existants } = await supa.from("match_gold_standard").select("id").order("id", { ascending: false }).limit(1);
const suivant = `L${String(Number((existants?.[0]?.id ?? "L000").slice(1)) + 1).padStart(3, "0")}`;

// Jugement IA, candidats mélangés puis remis dans la numérotation affichée.
const melanger = (arr, graine) => {
  const c = [...arr]; let x = graine;
  const r = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
  return c;
};
const ordre = melanger(candidats, Number(suivant.slice(1)) * 104729);
const contexte = [travail.quantite && `${travail.quantite} ${unite}`, travail.montant && `${travail.montant} € HT`].filter(Boolean).join(" · ");
const prompt = `Tu relis le rapprochement entre une LIGNE DE DEVIS d'artisan et notre catalogue de prix de référence.
Question : lequel des postes proposés décrit LA MÊME PRESTATION que la ligne de devis ?
Réponds par son numéro. 0 si AUCUN ne convient. -1 si la ligne est trop mal rédigée pour être jugée.
Ce n'est PAS une question de prix. Repères : un tarif "pose"/"MO" ne convient pas à une ligne qui fournit le matériel et inversement ; l'unité compte ; un composant ne vaut pas pour un lot entier ; une DÉPOSE n'est pas une POSE.
Réponds uniquement en JSON : {"choix": <entier>, "raison": "<15 mots max>"}

LIGNE DE DEVIS : ${libelle}
Contexte : ${contexte || "non précisé"}

POSTES PROPOSÉS :
${ordre.map((o, i) => `${i + 1}. ${o.label}`).join("\n")}`;

let ia = null, raison = null;
for (let essai = 0; essai < 3; essai++) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELE_IA}:generateContent?key=${CLE}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 8192, responseMimeType: "application/json" } }),
  });
  if (!r.ok) { await new Promise((s) => setTimeout(s, 3000)); continue; }
  const t = (await r.json()).candidates?.[0]?.content?.parts?.[0]?.text;
  if (!t) continue;
  let j; try { j = JSON.parse(t); } catch { continue; }
  const cp = Number(j.choix);
  ia = cp >= 1 && cp <= 5 ? ordre[cp - 1].rang : cp;
  raison = String(j.raison ?? "").slice(0, 120);
  break;
}

const { error: e3 } = await supa.from("match_gold_standard").upsert({
  id: suivant, ligne_devis: libelle.trim(), texte_requete: texteRequete,
  contexte: { qte: String(travail.quantite ?? ""), unite: unite || null, montant_ht: travail.montant ?? null, categorie: categorie || null },
  candidats, temoin: groupe.vectorial?.confidence === "high",
  reponse_humaine: null, relecteur: null,
  reponse_ia: ia === null ? null : ia === -1 ? "?" : String(ia), raison_ia: raison, modele_ia: MODELE_IA,
  consensus: false,
}, { onConflict: "id" });
if (e3) throw e3;

console.log(`${suivant} inséré — confiance actuelle : ${groupe.vectorial?.confidence} · témoin : ${groupe.vectorial?.confidence === "high"}`);
console.log(`texte embarqué : ${texteRequete}\n`);
console.log(`**${suivant}** — ${libelle} · ${contexte}`);
for (const c of candidats) {
  console.log(`${c.rang}. ${c.label} [${catalogue.find((x) => x.job_type === c.job_type)?.unit}]   ${c.similarity}`);
}
console.log(`\n(IA : ${ia} — ${raison})`);
console.log(`\nPour enregistrer la réponse du relecteur :\n  node scripts/ajouter-ligne-etalon.mjs --reponse ${suivant} <numéro>`);
