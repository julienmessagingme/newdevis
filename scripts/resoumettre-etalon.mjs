/**
 * scripts/resoumettre-etalon.mjs
 *
 * 2026-09-11 — RE-SOUMET UNE LIGNE DE L'ÉTALON APRÈS UN AJOUT AU CATALOGUE.
 *
 * Une ligne jugée « aucune entrée valable » l'a été contre les CINQ CANDIDATS
 * DE L'ÉPOQUE. Dès qu'une entrée nouvelle comble le trou, ce jugement devient
 * faux — et le score continue de compter la ligne comme un manque, donc
 * sous-estime durablement le catalogue (constaté le 10/09).
 *
 * 🔴 POURQUOI CE SCRIPT ET PAS `ajouter-ligne-etalon.mjs --reponse`.
 * Ce dernier n'écrit QUE la réponse humaine. Or la réponse est un RANG, et
 * `score-rapprochement.mjs` résout ce rang dans la colonne `candidats`
 * STOCKÉE — celle d'avant. Enregistrer « 1 » d'après une liste recalculée
 * aujourd'hui, sans réécrire `candidats`, ferait pointer la réponse vers une
 * TOUTE AUTRE entrée. La mesure paraîtrait bonne et serait fausse.
 *
 * Le script réécrit donc les trois ensemble, dans le même geste :
 *   1. `candidats`   — le top-5 recalculé sur le catalogue du jour ;
 *   2. `reponse_ia`  — l'IA rejuge sur CES candidats (ordre tiré au hasard) ;
 *   3. `reponse_humaine` + `consensus`.
 * ⚠️ Sans (2), on comparerait un jugement humain rendu sur la nouvelle liste à
 * un jugement d'IA rendu sur l'ancienne : le consensus ne voudrait plus rien.
 *
 * Usage :
 *   node scripts/resoumettre-etalon.mjs L028=1 L097=1 L152=1
 *   node scripts/resoumettre-etalon.mjs L114          (recalcule sans toucher
 *                                                      à la réponse humaine)
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const CLE = lire("GOOGLE_API_KEY");
const MODELE_EMB = "models/gemini-embedding-001";
const MODELE_IA = "gemini-2.5-pro";

const args = process.argv.slice(2);
if (!args.length) throw new Error("usage : node scripts/resoumettre-etalon.mjs L028=1 [L114] …");
const demandes = args.map((a) => {
  const [id, rep] = a.split("=");
  return { id, reponse: rep ?? null };
});

// ── Catalogue ───────────────────────────────────────────────────────────────
const norme = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
let d = 0; const brut = [];
for (;;) {
  const { data, error } = await supa.from("market_prices").select("job_type,label,unit,embedding").range(d, d + 499);
  if (error) throw error;
  brut.push(...data);
  if (data.length < 500) break;
  d += 500;
}
const catalogue = brut.filter((r) => r.embedding).map((r) => {
  const vec = typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding;
  return { job_type: r.job_type, label: r.label, unit: r.unit, vec, norme: norme(vec) };
});
console.log(`catalogue : ${catalogue.length} entrées\n`);

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

/** Même mélange déterministe que `ajouter-ligne-etalon.mjs` : sans lui, un
 *  modèle qui répondrait « 1 » par réflexe afficherait un score flatteur. */
const melanger = (arr, graine) => {
  const c = [...arr]; let x = graine;
  const r = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
  return c;
};

for (const { id, reponse } of demandes) {
  const { data: ligne, error } = await supa.from("match_gold_standard").select("*").eq("id", id).single();
  if (error) throw error;

  // 1. Classement sur le catalogue du jour
  const v = await embarquer(ligne.texte_requete);
  const nq = norme(v);
  const top = catalogue.map((r) => {
    let s = 0; for (let i = 0; i < 768; i++) s += v[i] * r.vec[i];
    return { ...r, sim: s / (nq * r.norme) };
  }).sort((a, b) => b.sim - a.sim).slice(0, 5);
  const candidats = top.map((t, i) => ({
    rang: i + 1, job_type: t.job_type, label: t.label, similarity: Number(t.sim.toFixed(4)),
  }));

  // 2. L'IA rejuge sur CES candidats
  const ctx = ligne.contexte ?? {};
  const contexte = [ctx.qte && `${ctx.qte} ${ctx.unite ?? ""}`.trim(), ctx.montant_ht && `${ctx.montant_ht} € HT`]
    .filter(Boolean).join(" · ");
  const ordre = melanger(candidats, Number(String(id).slice(1)) * 104729);
  const prompt = `Tu relis le rapprochement entre une LIGNE DE DEVIS d'artisan et notre catalogue de prix de référence.
Question : lequel des postes proposés décrit LA MÊME PRESTATION que la ligne de devis ?
Réponds par son numéro. 0 si AUCUN ne convient. -1 si la ligne est trop mal rédigée pour être jugée.
Ce n'est PAS une question de prix. Repères : un tarif "pose"/"MO" ne convient pas à une ligne qui fournit le matériel et inversement ; l'unité compte ; un composant ne vaut pas pour un lot entier ; une DÉPOSE n'est pas une POSE.
Réponds uniquement en JSON : {"choix": <entier>, "raison": "<15 mots max>"}

LIGNE DE DEVIS : ${ligne.ligne_devis}
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
  const iaTxt = ia === null ? null : ia === -1 ? "?" : String(ia);

  // 3. Écriture — les trois champs ensemble, jamais l'un sans les autres
  const humaine = reponse ?? ligne.reponse_humaine;
  const attendu = humaine === "0" ? ["0"] : String(humaine).split("|");
  const consensus = iaTxt != null && iaTxt !== "?" && attendu.includes(iaTxt);
  const { error: e2 } = await supa.from("match_gold_standard").update({
    candidats, reponse_ia: iaTxt, raison_ia: raison, modele_ia: MODELE_IA,
    reponse_humaine: humaine, consensus,
  }).eq("id", id);
  if (e2) throw e2;

  const bon = humaine === "0" ? "aucune" : candidats.find((c) => String(c.rang) === attendu[0])?.label;
  console.log(`${id}  « ${String(ligne.ligne_devis).replace(/\s+/g, " ").slice(0, 50)} »`);
  console.log(`   humain ${humaine} → ${String(bon).slice(0, 46)}`);
  console.log(`   IA     ${iaTxt} → ${ia >= 1 ? candidats.find((c) => c.rang === ia)?.label.slice(0, 46) : "aucune"}  (${raison})`);
  console.log(`   ${consensus ? "✅ consensus" : "❌ désaccord — la ligne sort de l'étalon de consensus"}\n`);
  await new Promise((s) => setTimeout(s, 400));
}
