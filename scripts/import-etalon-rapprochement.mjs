/**
 * scripts/import-etalon-rapprochement.mjs
 *
 * 2026-09-10 — MET L'ÉTALON À L'ABRI, DANS `match_gold_standard`.
 *
 * Les 150 jugements produits le 10/09 (Johan, puis gemini-2.5-pro) vivaient dans
 * quatre fichiers posés sur un poste de travail, ignorés par git parce qu'ils
 * contiennent des lignes de devis de clients et que le dépôt est public. Un
 * après-midi de relecture ne peut pas dépendre d'un disque dur.
 *
 * ⚠️ Le TEXTE DE REQUÊTE n'est pas reconstitué de mémoire : il est re-dérivé de
 * la base comme la production le fait (`buildQueryEmbeddingText` : description,
 * puis « Catégorie : … », puis « Unité : … », la catégorie venant de
 * `extracted.travaux`). Le stocker permet de rejouer la mesure dans un an sans
 * avoir à refaire — ni à re-deviner — ce calcul.
 *
 * Idempotent : relancer met à jour les lignes existantes.
 *
 * Usage : node scripts/import-etalon-rapprochement.mjs
 *   (attend relecture-rapprochement.cle.json, relecture-rapprochement.csv,
 *    relecture-reponses.json et relecture-ia.json à la racine)
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const RELECTEUR = "johan";
const MODELE_IA = "gemini-2.5-pro";

const cle = JSON.parse(fs.readFileSync("relecture-rapprochement.cle.json", "utf8"));
const humain = JSON.parse(fs.readFileSync("relecture-reponses.json", "utf8"));
const ia = JSON.parse(fs.readFileSync("relecture-ia.json", "utf8"));

// Contexte tel qu'affiché au relecteur (quantité, unité, montant).
const csv = fs.readFileSync("relecture-rapprochement.csv", "utf8").replace(/^﻿/, "");
const champs = (l) => {
  const o = []; let c = "", q = false;
  for (const x of l) { if (x === '"') q = !q; else if (x === ";" && !q) { o.push(c); c = ""; } else c += x; }
  o.push(c); return o;
};
const contexte = new Map(csv.split("\r\n").slice(1).map(champs).map((r) => [r[0], {
  qte: r[2] || null, unite: r[3] || null, montant_ht: r[4] ? Number(r[4]) : null,
}]));

// ── Re-dérivation du texte de requête depuis la base ────────────────────────
// La description a été tronquée à 260 caractères dans la feuille ; la clé, elle,
// porte le texte entier. C'est celui-là qui a été embarqué.
let debut = 0; const analyses = [];
for (;;) {
  const { data, error } = await supa.from("analyses").select("raw_text")
    .eq("status", "completed").order("created_at", { ascending: false }).range(debut, debut + 499);
  if (error) throw error;
  analyses.push(...data);
  if (data.length < 500) break;
  debut += 500;
}
const parLibelle = new Map();
for (const a of analyses) {
  let brut;
  try { brut = typeof a.raw_text === "string" ? JSON.parse(a.raw_text) : a.raw_text; } catch { continue; }
  for (const t of brut?.extracted?.travaux ?? []) {
    if (t?.libelle && !parLibelle.has(String(t.libelle).trim())) parLibelle.set(String(t.libelle).trim(), t);
  }
}
const texteRequete = (desc, ctx) => {
  const t = parLibelle.get(desc.trim());
  const p = [desc.trim()];
  const cat = t?.categorie ? String(t.categorie).trim() : "";
  if (cat && cat.toLowerCase() !== "autre") p.push(`Catégorie : ${cat}`);
  const u = String(t?.unite ?? ctx?.unite ?? "").trim();
  if (u) p.push(`Unité : ${u}`);
  return p.join(". ");
};

// ── Consensus ───────────────────────────────────────────────────────────────
// Un accord ne se déclare que si les DEUX ont tranché. Une réponse « ? » d'un
// côté ne fait pas consensus, même si l'autre a répondu « ? » aussi : deux
// abstentions ne sont pas un jugement partagé.
// ⚠️ Tester la NULLITÉ, pas la véracité : `0` est la réponse « aucun poste ne
// convient », et elle est falsy. Un `!ri` a d'abord écarté les 42 lignes où les
// deux juges s'accordaient précisément là-dessus — soit plus de la moitié du
// consensus, silencieusement.
const dAccord = (rh, ri) => {
  if (rh === null || rh === undefined || rh === "?") return false;
  if (ri === null || ri === undefined || ri === -1) return false;
  const attendu = rh === "0" ? [0] : rh.split("|").map(Number);
  return attendu.includes(ri);
};

const lignes = cle.map((c) => {
  const ctx = contexte.get(c.id) ?? {};
  const rh = humain[c.id];
  const ri = ia[c.id];
  const reponseIa = ri?.choix === null || ri?.choix === undefined ? null
    : ri.choix === -1 ? "?" : String(ri.choix);
  return {
    id: c.id,
    ligne_devis: c.desc,
    texte_requete: texteRequete(c.desc, ctx),
    contexte: { ...ctx, categorie: parLibelle.get(c.desc.trim())?.categorie ?? null },
    candidats: c.candidats.map((x, i) => ({ rang: i + 1, job_type: x.job_type, label: x.label, similarity: x.sim })),
    temoin: Boolean(c.temoin),
    reponse_humaine: rh?.reponse ?? null,
    commentaire_humain: rh?.commentaire ?? null,
    relecteur: rh ? RELECTEUR : null,
    reponse_ia: reponseIa,
    raison_ia: ri?.raison ?? null,
    modele_ia: ri ? MODELE_IA : null,
    consensus: dAccord(rh?.reponse, ri?.choix ?? null),
  };
});

const { error } = await supa.from("match_gold_standard").upsert(lignes, { onConflict: "id" });
if (error) throw error;

const n = (f) => lignes.filter(f).length;
console.log(`importé : ${lignes.length} lignes`);
console.log(`  jugées par l'humain : ${n((l) => l.reponse_humaine)} · par l'IA : ${n((l) => l.reponse_ia)}`);
console.log(`  consensus : ${n((l) => l.consensus)}`);
console.log(`  témoins   : ${n((l) => l.temoin)}`);
const sansRequete = lignes.filter((l) => l.texte_requete === l.ligne_devis.trim());
if (sansRequete.length) {
  console.warn(`  ⚠️ ${sansRequete.length} ligne(s) sans catégorie ni unité retrouvée — texte de requête réduit à la description`);
}
