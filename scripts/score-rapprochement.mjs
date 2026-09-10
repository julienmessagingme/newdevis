/**
 * scripts/score-rapprochement.mjs
 *
 * 2026-09-10 — NOTE LE RAPPROCHEMENT CONTRE L'ÉTALON. C'est l'outil qui répond à
 * « est-ce que mon changement améliore les choses ? », en une commande.
 *
 * Deux modes :
 *   --stocke   note les candidats tels qu'ils étaient au moment de la relecture
 *              (photo du 10/09, sert de point de comparaison figé) ;
 *   (défaut)   ré-embarque les textes de requête et refait le classement sur le
 *              catalogue D'AUJOURD'HUI — c'est le mode utile après une
 *              modification du catalogue ou du matcher.
 *
 * ⚠️ LA RÉFÉRENCE EST LE CONSENSUS, pas les réponses humaines seules. Mesuré le
 * 2026-09-10 : deux juges compétents (un expert et gemini-2.5-pro) ne s'accordent
 * que sur 55 % des cas. Noter contre un seul juge, c'est mesurer autant son
 * opinion que notre moteur.
 *
 * ⚠️ Deux chiffres, jamais un seul. « Le bon poste est en tête » ne veut rien
 * dire sans « le catalogue n'a rien à proposer » : le second est le plus gros
 * bloc (55 % au 10/09) et aucune amélioration du classement ne le réduira.
 *
 * Repères du 2026-09-10, à battre :
 *   consensus 77 lignes · aucune entrée valable 42 (55 %) · sur les 35 restantes,
 *   le top-1 est le bon dans 27 cas (77 %).
 *
 * Usage : node scripts/score-rapprochement.mjs [--stocke]
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const CLE_GEMINI = lire("GOOGLE_API_KEY");
const MODELE = "models/gemini-embedding-001";
const STOCKE = process.argv.includes("--stocke");
// En mode photo, le « top-5 » est vrai par construction : on le signale.
const STOKE_NOTE = STOCKE ? "  (100 % par construction)" : "";

const { data: etalon, error } = await supa.from("match_gold_standard").select("*").order("id");
if (error) throw error;
if (!etalon?.length) throw new Error("étalon vide — lancer d'abord import-etalon-rapprochement.mjs");

/** Rangs acceptés par le jugement de référence. '0' = aucune entrée ne convient. */
const attendus = (r) => (r === "0" ? [0] : r.split("|").map(Number));

// ── Le classement à noter ───────────────────────────────────────────────────

let classement; // id → [{ job_type, label, similarity }]
if (STOCKE) {
  classement = new Map(etalon.map((l) => [l.id, l.candidats.map((c) => ({ ...c, similarity: c.similarity }))]));
} else {
  let d = 0; const brut = [];
  for (;;) {
    const { data, error: e } = await supa.from("market_prices").select("job_type,label,embedding").range(d, d + 499);
    if (e) throw e;
    brut.push(...data);
    if (data.length < 500) break;
    d += 500;
  }
  const norme = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  const catalogue = brut.filter((r) => r.embedding).map((r) => {
    const vec = typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding;
    return { job_type: r.job_type, label: r.label, vec, norme: norme(vec) };
  });
  console.log(`catalogue : ${catalogue.length} entrées`);

  const textes = etalon.map((l) => l.texte_requete);
  const vecteurs = [];
  for (let i = 0; i < textes.length; i += 50) {
    const lot = textes.slice(i, i + 50);
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${MODELE}:batchEmbedContents?key=${CLE_GEMINI}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: lot.map((t) => ({ model: MODELE, content: { parts: [{ text: t }] }, taskType: "RETRIEVAL_QUERY", outputDimensionality: 768 })),
      }),
    });
    if (!r.ok) throw new Error(`Gemini ${r.status} : ${(await r.text()).slice(0, 200)}`);
    vecteurs.push(...((await r.json()).embeddings ?? []).map((e) => e.values));
  }
  classement = new Map(etalon.map((l, i) => {
    const v = vecteurs[i]; const nq = norme(v);
    const scores = catalogue.map((r) => {
      let s = 0; for (let k = 0; k < 768; k++) s += v[k] * r.vec[k];
      return { job_type: r.job_type, label: r.label, similarity: s / (nq * r.norme) };
    }).sort((a, b) => b.similarity - a.similarity).slice(0, 5);
    return [l.id, scores];
  }));
}

// ── Notation ────────────────────────────────────────────────────────────────
//
// Le jugement de référence désigne un RANG dans la liste de la relecture. Après
// un changement, la liste peut avoir changé : on compare donc par `job_type`, en
// retrouvant l'entrée que le relecteur avait désignée.

const pc = (n, d) => (d ? Math.round((n / d) * 100) + " %" : "—");
const bilan = { total: 0, sansReponse: 0, aucune: 0, avecReponse: 0, top1: 0, top5: 0 };
const temoins = { avecReponse: 0, top1: 0 };
const perdus = [];

for (const l of etalon) {
  if (!l.consensus) continue;
  bilan.total++;
  const rangs = attendus(l.reponse_humaine);
  if (rangs[0] === 0) { bilan.aucune++; continue; }
  // job_type des entrées jugées bonnes, d'après la liste montrée au relecteur
  const bons = new Set(rangs.map((r) => l.candidats.find((c) => c.rang === r)?.job_type).filter(Boolean));
  if (!bons.size) { bilan.sansReponse++; continue; }
  bilan.avecReponse++;
  const liste = classement.get(l.id) ?? [];
  const rangActuel = liste.findIndex((c) => bons.has(c.job_type)) + 1;
  if (rangActuel === 1) bilan.top1++;
  if (rangActuel >= 1) bilan.top5++;
  if (l.temoin) { temoins.avecReponse++; if (rangActuel === 1) temoins.top1++; }
  if (rangActuel !== 1) perdus.push({ id: l.id, rang: rangActuel || "hors top-5", ligne: l.ligne_devis.slice(0, 46), attendu: [...bons][0], obtenu: liste[0]?.label });
}

console.log(`\nmode : ${STOCKE ? "candidats stockés (photo du 10/09)" : "catalogue d'aujourd'hui"}`);
console.log(`\nétalon de CONSENSUS : ${bilan.total} lignes`);
console.log(`  aucune entrée valable au catalogue : ${bilan.aucune} (${pc(bilan.aucune, bilan.total)})`);
console.log(`  une bonne réponse existe           : ${bilan.avecReponse}`);
console.log(`     trouvée en 1er  : ${bilan.top1} (${pc(bilan.top1, bilan.avecReponse)})   ← le chiffre à faire monter`);
// ⚠️ En mode --stocke, ce « top-5 » vaut 100 % par construction : le relecteur a
// choisi PARMI ces cinq candidats. Il n'a de sens qu'en mode catalogue actuel,
// où il dit si la bonne entrée est SORTIE du top-5 — le seul vrai signal de
// régression après un ajout au catalogue.
console.log(`     dans le top-5   : ${bilan.top5} (${pc(bilan.top5, bilan.avecReponse)})${STOKE_NOTE}`);
console.log(`  dont témoins (déjà chiffrés) : ${temoins.top1}/${temoins.avecReponse} en 1er`);
if (perdus.length) {
  console.log(`\nbonnes réponses non classées 1re (${perdus.length}) :`);
  for (const p of perdus.slice(0, 15)) {
    console.log(`  rang ${String(p.rang).padStart(2)}  ${p.ligne.padEnd(47)} attendu ${String(p.attendu).slice(0, 26).padEnd(27)} obtenu ${String(p.obtenu).slice(0, 30)}`);
  }
}
