/**
 * scripts/reparer-double-montant.mjs
 *
 * Répare les conclusions du stock qui affichent DEUX montants pour un seul
 * écart — le défaut du 2026-09-22 (devis SMPAC). Le correctif vit dans
 * `leviersBuilder`, donc il ne vaut que pour les analyses à venir :
 * `verdict_ligne` est figé dans `conclusion_ia`.
 *
 * 🔴 SUR LES TROIS CAS ANNONCÉS, UN SEUL EN EST UN — et c'est un résultat, pas
 * un détail. Mon détecteur comparait « un montant dans le résumé » à « un
 * montant dans la marge ». Sur deux des trois, le montant du résumé est une
 * RETENUE DE GARANTIE (5 % du devis : 640 €, 519 €) et celui de la marge un
 * écart de prix (420 €, 552 €). Deux nombres de NATURE différente ne sont pas
 * une contradiction — c'est le même genre de faux positif que les détecteurs
 * qui comptaient le total du devis ou les chiffres du message d'expert.
 *
 * Reste `Devis - DE2090` : « quelques postes dépassent les fourchettes du
 * marché (environ 2 024 € d'écart sur ces lignes) » face à « environ 2 223 € ».
 * Même fait, deux nombres.
 *
 * ── Ce que le script écrit, et rien d'autre ──────────────────────────────
 *   `verdict_ligne.motif`  → la parenthèse chiffrée est retirée
 *   `verdict_ligne.resume` → idem
 *   `verdict_ligne.marge`  → alignée sur le montant ATTRIBUABLE (2 024),
 *                            pas sur l'agrégat serveur (2 223)
 *
 * ⚠️ La marge CHANGE de valeur, et c'est délibéré : 2 024 € est la somme des
 * postes que nous nommons, 2 223 € l'agrégat du calcul serveur. La règle du
 * 30/08 (« on ne chiffre que ce qu'on peut nommer ») commande le premier —
 * c'est ce que le moteur produit désormais.
 *
 * ⚠️ Ni le verdict, ni les leviers, ni les anomalies, ni `review_status` ne
 * sont touchés. Et une conclusion `corrected` n'est JAMAIS réécrite (filet du
 * 04/09) : les deux faux positifs le sont de toute façon.
 *
 * Usage :  node scripts/reparer-double-montant.mjs [--appliquer]
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const env = {};
for (const ligne of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = ligne.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const supabase = createClient(
  env.PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const APPLIQUER = process.argv.includes("--appliquer");

/**
 * La parenthèse chiffrée que le motif ne doit plus porter.
 * ⚠️ Ancrée sur « d'écart » : sans cette ancre elle emporterait aussi
 * « retenue de garantie de 5 % (environ 640 €) », où le montant est légitime.
 */
const PAREN_ECART = /\s*\(environ\s+[\d\s  ]+\s*€\s*d[e']\s*écart[^)]*\)/i;
const nb = (s) => Number(String(s).replace(/[^\d]/g, "")) || 0;

const { data, error } = await supabase
  .from("analyses")
  .select("id, file_name, conclusion_ia, review_status")
  .eq("status", "completed")
  .gte("created_at", new Date(Date.now() - 180 * 86_400_000).toISOString());
if (error) throw new Error(error.message);

let candidats = 0, repares = 0, sautes = 0;

for (const a of data ?? []) {
  let ci;
  try { ci = typeof a.conclusion_ia === "string" ? JSON.parse(a.conclusion_ia) : a.conclusion_ia; }
  catch { continue; }
  const vl = ci?.verdict_ligne;
  if (!vl || typeof vl !== "object") continue;

  const motif = String(vl.motif ?? "");
  const marge = String(vl.marge ?? "");
  const cite = motif.match(PAREN_ECART);
  if (!cite) continue;

  const mEcart = nb(cite[0]);
  const mMarge = nb(marge.match(/([\d\s  ]+)\s*€/)?.[1] ?? "");
  if (mEcart === 0 || mMarge === 0 || Math.abs(mEcart - mMarge) <= 1) continue;

  candidats++;
  console.log(`\n${a.id.slice(0, 8)} · ${a.file_name} · ${a.review_status}`);
  console.log(`  motif : ${motif}`);
  console.log(`  marge : ${marge}  →  environ ${mEcart.toLocaleString("fr-FR")} €`);

  if (a.review_status === "corrected") {
    sautes++;
    console.log("  ⏭  conclusion réécrite par un expert — jamais écrasée (filet du 04/09)");
    continue;
  }

  const nouveau = {
    ...ci,
    verdict_ligne: {
      ...vl,
      motif: motif.replace(PAREN_ECART, ""),
      resume: String(vl.resume ?? "").replace(PAREN_ECART, ""),
      marge: `environ ${mEcart.toLocaleString("fr-FR")} €`,
    },
  };

  if (!APPLIQUER) { console.log("  (à blanc — relancer avec --appliquer)"); continue; }

  const { error: e } = await supabase
    .from("analyses")
    .update({ conclusion_ia: JSON.stringify(nouveau) })
    .eq("id", a.id);
  if (e) { console.log(`  ✗ ${e.message}`); continue; }

  // ⚠️ On RELIT : une réponse sans erreur ne prouve pas que la ligne a été
  // écrite (règle du 15/09 sur la régénération de masse).
  const { data: relu } = await supabase
    .from("analyses").select("conclusion_ia").eq("id", a.id).single();
  const vlRelu = (typeof relu?.conclusion_ia === "string"
    ? JSON.parse(relu.conclusion_ia) : relu?.conclusion_ia)?.verdict_ligne;
  const ok = !PAREN_ECART.test(String(vlRelu?.motif ?? "")) && nb(String(vlRelu?.marge ?? "")) === mEcart;
  if (!ok) { console.log("  ✗ relecture : la ligne n'a pas la forme attendue"); continue; }
  repares++;
  console.log(`  ✓ réparé — motif sans montant, marge « ${vlRelu.marge} »`);
}

console.log(`\n${"─".repeat(60)}`);
console.log(`candidats : ${candidats} · réparés : ${repares} · sautés (corrected) : ${sautes}`);
if (!APPLIQUER && candidats > 0) console.log("Relancer avec --appliquer pour écrire.");
