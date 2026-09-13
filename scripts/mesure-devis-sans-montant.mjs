/**
 * scripts/mesure-devis-sans-montant.mjs
 *
 * 2026-09-13 — COMBIEN DE DEVIS SONT JUGÉS ALORS QU'ILS NE PORTENT AUCUN PRIX ?
 *
 * Déclencheur : le devis « Entreprise Fk » (photo, 13/09). Cinq lignes de
 * travaux, pas un montant, et le document affiche lui-même « TOTAL : 0,00 € »
 * — le vrai prix (2 830 € TTC) n'existe qu'en texte libre plus bas. Verdict
 * rendu : « Ce devis nous paraît cohérent · Prix dans les fourchettes du
 * marché ». Deux gardes auraient dû l'arrêter, aucune n'a fonctionné.
 *
 * Ce script mesure ce que les deux correctifs changent, AVANT de les livrer :
 *   (a) `incomplete-quote.ts` — la garde « libellés de lot » ne s'applique plus
 *       quand aucune ligne n'est chiffrée ;
 *   (b) `conclusion.ts` — une couverture INCONNUE (dénominateur nul) vaut
 *       désormais « rien de comparable », au lieu de sortir de la garde.
 *
 * ⚠️ Le détecteur est IMPORTÉ, jamais recopié : une copie mesurerait une autre
 * règle que celle qui part en production (leçon du banc de re-classement).
 *
 * Usage : npx tsx scripts/mesure-devis-sans-montant.mjs
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { detectIncompleteQuoteShared } from "../supabase/functions/analyze-quote/incomplete-quote.ts";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

// Set d'unités physiques de extract.ts (V1) — celui qui tourne en production.
const UNITS = new Set([
  "m2", "m²", "m^2", "metre2", "mètre carré",
  "ml", "ml.", "m_lin", "mètre linéaire",
  "kg", "g", "h", "heure", "hr", "m3", "m³", "m^3",
  "l", "litre", "t", "tonne",
  "u", "u.", "pce", "pcs", "p.", "piece", "pièce",
]);

let debut = 0; const analyses = [];
for (;;) {
  const { data, error } = await supa
    .from("analyses").select("id,file_name,user_id,created_at,score,raw_text,conclusion_ia")
    .eq("status", "completed").order("created_at", { ascending: false })
    .range(debut, debut + 499);
  if (error) throw error;
  analyses.push(...data);
  if (data.length < 500) break;
  debut += 500;
}

const vus = new Set();
const bilan = { documents: 0, sansAucunPrix: 0, bypassAvant: 0, bypassApres: 0, couvertureNulle: 0, verdictPositif: 0 };
const bascules = [];
const nouveauxBypass = [];

for (const a of analyses) {
  let b;
  try { b = typeof a.raw_text === "string" ? JSON.parse(a.raw_text) : a.raw_text; } catch { continue; }
  const cle = `${a.user_id}|${(a.file_name ?? "").replace(/\s*\(\d+\)(?=\.[a-z]+$)/i, "")}`;
  if (vus.has(cle)) continue;
  vus.add(cle);
  bilan.documents++;

  const ex = b?.extracted ?? {};
  const travaux = Array.isArray(ex.travaux) ? ex.travaux : [];
  if (!travaux.length) continue;

  const lignes = travaux.map((t) => ({
    unite: t?.unite ?? null, quantite: t?.quantite ?? null,
    montant: t?.montant ?? null, libelle: t?.libelle ?? null,
  }));
  const montantLignes = lignes.reduce((s, l) => s + (typeof l.montant === "number" && l.montant > 0 ? l.montant : 0), 0);

  // (a) Le bypass « devis incomplet » : avant / après le correctif.
  // La différence ne peut se produire QUE quand aucune ligne n'est chiffrée —
  // c'est la seule condition que le correctif ajoute.
  const apres = detectIncompleteQuoteShared(lignes, UNITS).is_incomplete;
  const avant = montantLignes > 0 ? apres : detecteurAvant(lignes);
  if (avant) bilan.bypassAvant++;
  if (apres) bilan.bypassApres++;
  if (!avant && apres) {
    const c = typeof a.conclusion_ia === "string" ? JSON.parse(a.conclusion_ia) : a.conclusion_ia;
    nouveauxBypass.push({
      fichier: a.file_name, date: String(a.created_at).slice(0, 10), score: a.score,
      verdict: c?.verdict_global ?? null, ht: Number(ex.totaux?.ht ?? 0) || 0,
      lignes: lignes.length,
      exemples: lignes.slice(0, 3).map((l) => String(l.libelle ?? "").replace(/\s+/g, " ").slice(0, 44)),
    });
  }

  // (b) Couverture nulle : le devis ne porte aucun montant exploitable.
  const ht = Number(ex.totaux?.ht ?? 0) || 0;
  const denom = ht > 0 ? ht : montantLignes;
  if (denom <= 0) {
    bilan.sansAucunPrix++;
    const c = typeof a.conclusion_ia === "string" ? JSON.parse(a.conclusion_ia) : a.conclusion_ia;
    const verdict = c?.verdict_global ?? null;
    if (verdict === "dans_la_norme") bilan.verdictPositif++;
    bilan.couvertureNulle++;
    bascules.push({
      fichier: a.file_name, date: String(a.created_at).slice(0, 10), score: a.score,
      verdict, lignes: lignes.length, ttc: Number(ex.totaux?.ttc ?? 0) || 0,
      incompletAvant: avant, incompletApres: apres,
    });
  }
}

/** Reproduction de la règle d'AVANT le correctif — uniquement pour mesurer l'écart. */
function detecteurAvant(lignes) {
  if (lignes.length < 5) return false;
  let noPhys = 0, qtyOne = 0;
  for (const l of lignes) {
    const u = String(l?.unite ?? "").trim().toLowerCase();
    if (!UNITS.has(u)) noPhys++;
    const q = l?.quantite;
    if (q === null || q === undefined || q === 1 || q === 0) qtyOne++;
  }
  if (noPhys / lignes.length < 0.7 || qtyOne / lignes.length < 0.7) return false;
  const avecLibelle = lignes.filter((l) => typeof l?.libelle === "string" && l.libelle.trim().length > 0);
  if (avecLibelle.length > 0) {
    const triviales = avecLibelle.filter((l) => !UNITS.has(String(l?.unite ?? "").trim().toLowerCase()));
    if (triviales.length > 0) {
      const LOT = /plomberie|électricit|electricit|maçonn|maconn|peinture|menuiser|carrelage|faïence|faience|placo|cloison|isolation|démolition|demolition|dépose|depose|chauffage|climatisation|couverture|toiture|charpente|zinguerie|étanchéit|etancheit|terrassement|vrd|façade|facade|ravalement|salle de bain|salle d'eau|cuisine|gros œuvre|gros oeuvre|second œuvre|second oeuvre|installation de chantier|nettoyage|préparation|preparation|forfait global|échafaudage|echafaudage/i;
      const lotLike = triviales.filter((l) => LOT.test(String(l.libelle).split("\n")[0])).length;
      if (lotLike / triviales.length < 0.5) return false;
    }
  }
  return true;
}

console.log(`\nstock dédupliqué : ${bilan.documents} documents\n`);
console.log(`devis SANS AUCUN PRIX (ni total, ni la moindre ligne chiffrée) : ${bilan.sansAucunPrix}`);
console.log(`   dont un verdict « dans la norme » a été rendu : ${bilan.verdictPositif}   ← ce que le correctif (b) ferme`);
console.log(`\nbypass « devis incomplet » : ${bilan.bypassAvant} avant → ${bilan.bypassApres} après  (+${bilan.bypassApres - bilan.bypassAvant})`);

if (nouveauxBypass.length) {
  console.log(`
devis qui basculent en « devis incomplet » — à relire un par un :
`);
  for (const c of nouveauxBypass) {
    console.log(`  ${c.fichier}`);
    console.log(`     ${c.date} · pastille ${c.score} · verdict « ${c.verdict ?? "aucun"} » · ${c.lignes} lignes · total HT extrait ${c.ht} €`);
    console.log(`     lignes : ${c.exemples.join(" | ")}`);
  }
}

if (bascules.length) {
  console.log(`\ndétail des devis sans aucun prix :\n`);
  for (const c of bascules) {
    const flag = !c.incompletAvant && c.incompletApres ? "  ⟵ BASCULE en « devis incomplet »" : "";
    console.log(`  ${c.fichier}`);
    console.log(`     ${c.date} · pastille ${c.score} · verdict « ${c.verdict ?? "aucun"} » · ${c.lignes} lignes · TTC extrait ${c.ttc}${flag}`);
  }
}
