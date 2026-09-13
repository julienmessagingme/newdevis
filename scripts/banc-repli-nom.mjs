/**
 * scripts/banc-repli-nom.mjs
 *
 * 2026-09-13 — METTRE LE CODE POSTAL DANS LA QUESTION, PAS DANS LE TRI.
 *
 * Quand le numéro SIRET ne donne rien, `verify.ts` se rabat sur le nom :
 *   1. il interroge le registre avec `q=<nom>` SEUL, en demandant 5 résultats ;
 *   2. `pickBestNameMatch` essaie ENSUITE de départager par le code postal du
 *      devis (CP exact, puis département), sinon il rend « ambiguous ».
 *
 * Le code postal est donc utilisé — mais comme filtre a posteriori, sur une
 * liste constituée sans lui. Sur « Entreprise FK » à Saint-Germain-du-Puy
 * (18390), les 5 meilleurs résultats NATIONAUX sont un taxi parisien cessé, une
 * SCI en Isère et une activité de courrier à Asnières. Aucun n'est dans le Cher,
 * donc aucun n'est retenu — mais les trois sont affichés à l'utilisateur comme
 * « candidats trouvés ».
 *
 * 🔴 LE VRAI RISQUE N'EST PAS LE TRI, C'EST L'ÉVICTION. L'entreprise cherchée
 * peut exister et se trouver au 12ᵉ rang national : elle n'entre jamais dans les
 * cinq, et aucun filtre postérieur ne la fera apparaître. C'est ce que la
 * requête filtrée corrige.
 *
 * ── Ce que le banc compare, sur les cas RÉELS du stock ────────────────────
 *   A (production) : q=<nom>&per_page=5                 → pickBestNameMatch
 *   B (candidate)  : q=<nom>&code_postal=<CP>&per_page=5 → pickBestNameMatch
 *                    et, si B ne rend RIEN, repli sur A — pour ne jamais perdre
 *                    un cas que la production résout aujourd'hui.
 *
 * ⚠️ `pickBestNameMatch` est IMPORTÉE de verify.ts, jamais recopiée.
 * ⚠️ Le CP utilisé est celui de l'ENTREPRISE (en-tête du devis), jamais celui du
 *    chantier : les deux figurent sur le document et se confondent facilement.
 *
 * Usage : npx tsx scripts/banc-repli-nom.mjs
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { pickBestNameMatch } from "../supabase/functions/analyze-quote/verify.ts";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const API = "https://recherche-entreprises.api.gouv.fr/search";

async function chercher(params) {
  const url = `${API}?${new URLSearchParams({ ...params, page: "1", per_page: "5" })}`;
  for (let essai = 0; essai < 3; essai++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (r.status === 429) { await new Promise((s) => setTimeout(s, 2000 * (essai + 1))); continue; }
      if (!r.ok) return { erreur: `HTTP ${r.status}`, results: [] };
      const j = await r.json();
      return { results: j.results ?? [], total: j.total_results ?? 0 };
    } catch (e) {
      if (essai === 2) return { erreur: String(e).slice(0, 50), results: [] };
      await new Promise((s) => setTimeout(s, 1500));
    }
  }
}

// ── Les cas où le repli par nom a RÉELLEMENT servi ─────────────────────────
// Deux populations, et il faut les deux : celle qu'on veut réparer (ambiguous)
// et celle qu'on risque de casser (le repli par nom a trouvé quelqu'un).
let debut = 0; const analyses = [];
for (;;) {
  const { data, error } = await supa
    .from("analyses").select("id,file_name,user_id,created_at,raw_text")
    .eq("status", "completed").order("created_at", { ascending: false })
    .range(debut, debut + 499);
  if (error) throw error;
  analyses.push(...data);
  if (data.length < 500) break;
  debut += 500;
}

const vus = new Set(); const cas = [];
for (const a of analyses) {
  let b;
  try { b = typeof a.raw_text === "string" ? JSON.parse(a.raw_text) : a.raw_text; } catch { continue; }
  const cle = `${a.user_id}|${(a.file_name ?? "").replace(/\s*\(\d+\)(?=\.[a-z]+$)/i, "")}`;
  if (vus.has(cle)) continue;
  vus.add(cle);
  const ex = b?.extracted ?? {};
  const v = b?.verified ?? {};
  if (ex.is_foreign_quote) continue;
  const nom = String(ex.entreprise?.nom ?? "").trim();
  if (nom.length < 3) continue;
  const adresse = ex.entreprise?.adresse ?? null;

  // Population 1 : la production n'a pas su trancher.
  const ambigu = v.lookup_status === "ambiguous";
  // Population 2 : elle a tranché PAR LE NOM — c'est ce qu'on peut casser.
  // Signature : une entreprise a été trouvée alors que le numéro du devis
  // n'est pas exploitable (absent, ou trop court/long pour être cherché).
  const numero = String(ex.entreprise?.siret ?? "").replace(/\D/g, "");
  const numeroCherchable = numero.length === 9 || numero.length === 14;
  const parNom = v.lookup_status === "ok" && v.nom_officiel && !numeroCherchable;

  if (ambigu || parNom) {
    cas.push({
      fichier: a.file_name, date: String(a.created_at).slice(0, 10),
      nom, adresse, population: ambigu ? "ambiguë" : "trouvée par nom",
      attendu: v.nom_officiel ?? null,
      candidatsStockes: v.ambiguous_candidates ?? [],
      // Dernier recours quand l'adresse de l'entreprise n'a pas été extraite :
      // le code postal du CHANTIER. ⚠️ Ce n'est PAS la même chose — un artisan
      // peut être immatriculé à 200 km de son chantier. On le mesure avant d'en
      // faire quoi que ce soit, précisément parce que c'est une approximation.
      cpChantier: ex.client?.code_postal ?? null,
    });
  }
}

const cpDe = (adresse) => String(adresse ?? "").match(/\b(\d{5})\b/)?.[1] ?? null;
console.log(`${vus.size} documents · ${cas.length} cas où le repli par nom a joué`);
console.log(`   ambiguës : ${cas.filter((c) => c.population === "ambiguë").length}`);
console.log(`   trouvées par nom : ${cas.filter((c) => c.population === "trouvée par nom").length}\n`);

const bilan = { repare: 0, inchange: 0, casse: 0, sansCp: 0, viaChantier: 0, filtreRendDesResultats: 0 };
for (const c of cas) {
  // CP de l'ENTREPRISE d'abord ; à défaut, celui du CHANTIER — mesuré, pas supposé.
  const cpEntreprise = cpDe(c.adresse);
  const cp = cpEntreprise ?? (c.cpChantier ? String(c.cpChantier).match(/\b\d{5}\b/)?.[0] ?? null : null);
  if (!cpEntreprise && cp) bilan.viaChantier++;
  const a = await chercher({ q: c.nom });
  await new Promise((s) => setTimeout(s, 200));
  const choixA = pickBestNameMatch(a.results, c.adresse);

  let choixB = choixA, viaFiltre = false;
  if (cp) {
    const b = await chercher({ q: c.nom, code_postal: cp });
    await new Promise((s) => setTimeout(s, 200));
    // ⚠️ On départage avec le CP réellement utilisé — sinon `pickBestNameMatch`
    // recevrait l'adresse vide et rendrait « ambigu » sur une liste pourtant
    // déjà filtrée géographiquement.
    if (b.results.length > 0) { choixB = pickBestNameMatch(b.results, cp); viaFiltre = true; bilan.filtreRendDesResultats++; }
    // 0 résultat filtré → on RETOMBE sur A. La règle ne peut donc rien perdre
    // qu'elle ne perdait déjà ; au pire elle ne gagne rien.
  } else bilan.sansCp++;

  const nomA = choixA.match?.nom_complet ?? (choixA.ambiguous ? "(ambigu)" : "(rien)");
  const nomB = choixB.match?.nom_complet ?? (choixB.ambiguous ? "(ambigu)" : "(rien)");
  let verdict;
  if (nomA === nomB) { verdict = "inchangé"; bilan.inchange++; }
  else if (!choixA.match && choixB.match) { verdict = "RÉPARÉ"; bilan.repare++; }
  else if (choixA.match && !choixB.match) { verdict = "⚠️ PERDU"; bilan.casse++; }
  else { verdict = "⚠️ CHANGÉ"; bilan.casse++; }

  if (verdict !== "inchangé") {
    console.log(`${verdict}  ${c.fichier}  [${c.population}]`);
    console.log(`   devis : « ${c.nom} »  CP entreprise ${cp ?? "absent"}`);
    console.log(`   A (nom seul, ${a.total ?? 0} résultats)  → ${nomA}`);
    console.log(`   B (nom + CP${viaFiltre ? "" : ", repli sur A"})      → ${nomB}`);
    if (c.attendu) console.log(`   retenu en production : ${c.attendu}`);
    console.log();
  }
}

console.log(`\nBILAN : ${bilan.repare} réparé(s) · ${bilan.inchange} inchangé(s) · ${bilan.casse} cassé(s)`);
console.log(`requêtes filtrées par code postal qui rendent au moins un résultat : ${bilan.filtreRendDesResultats}`);
console.log(`( cas sans AUCUN code postal exploitable · ${bilan.viaChantier} départagés avec le CP du CHANTIER faute d'adresse d'entreprise)`);
