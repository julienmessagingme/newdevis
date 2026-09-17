/**
 * scripts/sourceur-prix-ia.mjs
 *
 * 🟢 2026-09-17 (demande Johan : « branche une relecture IA pour sourcer les
 * prix, les vérifier et trancher les 23 postes »).
 *
 * 🔴 CE SCRIPT NE DEMANDE PAS À L'IA DE JUGER UN PRIX. C'est la leçon la plus
 * chère du projet, mesurée le 30/08 : le relecteur IA « ne rate rien mais ne
 * discrimine pas » — il disait « corriger » sur 37/37 du gold standard ET sur
 * 15/16 des analyses TÉMOINS. Un jugement global n'est pas vérifiable, donc
 * il ne vaut rien.
 *
 * L'arbitre du rapprochement (15/09), lui, fonctionne — parce qu'il pose UNE
 * SEULE QUESTION VÉRIFIABLE. On applique la même doctrine ici :
 *
 *   · l'IA **SOURCE** : « quel est le prix de marché de cet ouvrage, en France,
 *     en 2026, HT ? » et elle doit **citer ses sources avec leurs URL** ;
 *   · le **VERDICT SE CALCULE** ensuite, mécaniquement, en comparant le prix
 *     unitaire facturé à la fourchette sourcée. L'IA ne le rend jamais.
 *
 * 🔴 ET ON NE LUI MONTRE PAS LE PRIX FACTURÉ. Sinon elle le justifie : c'est
 * exactement pourquoi la feuille de relecture du 10/09 masquait les fourchettes
 * du catalogue (« sinon le relecteur choisit celle qui tombe juste et l'étalon
 * devient circulaire »). Elle ne voit que la DESCRIPTION, la quantité et l'unité.
 *
 * 🔴 DEUX SOURCES NOMMABLES MINIMUM, sinon « non concluant ». Une source qu'on
 * ne peut pas citer ne compte pas (règle du 15/09, vertical clim) — et deux
 * prix issus de résumés sans site identifié avaient alors été retirés.
 *
 * ⚠️ LE TÉMOIN PASSE AVANT LA MESURE. Mode `--temoin` : on lui soumet les 27
 * postes que l'expert a DÉJÀ tranchés (8 qu'il a annulés → le sourcing doit
 * dire « dans le marché », 19 qu'il a endossés → il doit dire « au-dessus »).
 * Sans ce contrôle à double sens, on ne saurait pas si le sourceur mesure quoi
 * que ce soit. ⚠️ Et l'expert n'est pas un oracle : le 17/09 le sourcing web
 * lui a donné tort sur le muret parpaing. Un désaccord est une information, pas
 * automatiquement une erreur du sourceur.
 *
 * Usage :
 *   npx tsx scripts/sourceur-prix-ia.mjs --temoin      # valide le harnais
 *   npx tsx scripts/sourceur-prix-ia.mjs               # tranche les 23 postes
 *   npx tsx scripts/sourceur-prix-ia.mjs --sortie x.json
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { computeServerSurcout } from "../src/lib/analyse/surcoutServeur.ts";
import { groupesChiffrables } from "./groupes-chiffrables.mjs";
import { memePoste, postesJugesParExpert } from "./memes-postes.mjs";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const CLE = lire("GOOGLE_API_KEY");
if (!CLE) throw new Error("GOOGLE_API_KEY absente de .env.local");

const MODELE = "gemini-2.5-pro";
const MODE_TEMOIN = process.argv.includes("--temoin");
const SORTIE = process.argv.includes("--sortie")
  ? process.argv[process.argv.indexOf("--sortie") + 1]
  : (MODE_TEMOIN ? "sourcage-temoin.json" : "sourcage-postes.json");
const PLANCHER = 300;
const eur = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;

// ── La consigne ──────────────────────────────────────────────────────────────
// Elle décrit un travail de RELEVÉ, pas d'appréciation. Chaque exigence vient
// d'un piège déjà payé : HT/TTC (15/09), périmètre fourniture/pose (10/09),
// source nommable (15/09), et le droit de dire « je ne sais pas » (sans lui,
// un modèle invente plutôt que de s'abstenir).
const CONSIGNE = (l) => `Tu es chargé d'un RELEVÉ DE PRIX DE MARCHÉ pour des travaux en France, en 2026.

On te décrit une prestation telle qu'elle est écrite sur un devis d'artisan. Ta
seule tâche est de trouver son PRIX DE MARCHÉ en cherchant sur le web, et de
citer tes sources. Tu ne portes AUCUN jugement sur un devis : tu relèves un prix.

PRESTATION
----------
Description (texte exact du devis) :
${l.description}

Quantité facturée : ${l.qty ?? "non précisée"} ${l.unite || "(unité non précisée)"}

RÈGLES ABSOLUES
---------------
1. HORS TAXES. La plupart des sites grand public affichent du TTC. Si une source
   est en TTC, convertis en HT (÷ 1,20 pour 20 %, ÷ 1,10 pour 10 % en rénovation)
   et DIS-LE. Confondre HT et TTC fausse tout de 10 à 20 %.
2. PÉRIMÈTRE. Dis précisément ce que ton prix couvre : fourniture ET pose, pose
   seule, avec ou sans fondation/dépose/finition. Une prestation « fourni+posé »
   et la même « pose seule » n'ont pas le même prix, et c'est la première cause
   d'erreur de comparaison.
3. UNITÉ. Donne le prix dans l'unité de la prestation ci-dessus quand c'est
   possible. Si le marché se chiffre dans une autre unité, donne-la et explique
   la conversion. N'invente jamais une conversion impossible (un prix au m² ne
   se convertit pas en prix au mètre linéaire sans connaître la hauteur).
4. DEUX SOURCES MINIMUM, chacune avec son URL et la valeur que tu y as lue,
   recopiée telle quelle. Une source que tu ne peux pas nommer ne compte pas.
5. SI TU NE TROUVES PAS, dis-le : "certitude": "aucune". C'est une réponse
   parfaitement acceptable et bien plus utile qu'un chiffre inventé.

RÉPONDS UNIQUEMENT PAR CE JSON, sans texte autour :
{
  "ouvrage": "en quelques mots, l'ouvrage que tu as cherché",
  "prix_min_ht": nombre ou null,
  "prix_max_ht": nombre ou null,
  "unite": "m2" | "ml" | "u" | "forfait" | "m3",
  "perimetre": "ce que le prix couvre",
  "sources": [{"url": "...", "valeur_citee": "...", "ht_ou_ttc": "HT"|"TTC"}],
  "certitude": "haute" | "moyenne" | "basse" | "aucune",
  "reserve": "ce qui pourrait légitimement faire varier ce prix"
}`;

async function sourcer(l) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELE}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": CLE },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: CONSIGNE(l) }] }],
        tools: [{ google_search: {} }],
        // ⚠️ Marge large : gemini-2.5 consomme une partie du budget de sortie en
        // raisonnement interne — un plafond serré tronque le JSON en silence.
        generationConfig: { temperature: 0.1, maxOutputTokens: 16384 },
      }),
    },
  );
  if (!res.ok) return { erreur: `${res.status} ${(await res.text()).slice(0, 180)}` };
  const j = await res.json();
  const texte = (j?.candidates?.[0]?.content?.parts ?? []).map((p) => p?.text ?? "").join("\n");
  const m = texte.match(/\{[\s\S]*\}/);
  if (!m) return { erreur: "pas de JSON dans la réponse", texte: texte.slice(0, 200) };
  try { return JSON.parse(m[0]); } catch (e) { return { erreur: `JSON illisible : ${e.message}` }; }
}

/**
 * Le verdict n'est PAS demandé à l'IA — il se calcule.
 * ⚠️ On ne compare QUE si l'unité sourcée correspond à celle du devis : c'est
 * la faille corrigée le 17/09 (un prix au m² multiplié par un métré linéaire).
 */
function trancher(poste, src) {
  if (src?.erreur) return { verdict: "ERREUR", motif: src.erreur };
  const nb = (src?.sources ?? []).filter((s) => s?.url && String(s.url).startsWith("http")).length;
  if (src?.certitude === "aucune" || src?.prix_max_ht == null) return { verdict: "NON CONCLUANT", motif: "l'IA n'a pas trouvé de prix de marché" };
  if (nb < 2) return { verdict: "NON CONCLUANT", motif: `${nb} source(s) nommable(s), il en faut 2` };

  const fam = (u) => {
    const s = String(u ?? "").toLowerCase().trim();
    if (/^(m2|m²)/.test(s)) return "surface";
    if (/^(m3|m³)/.test(s)) return "volume";
    if (/^(ml|mètre|metre)/.test(s)) return "lineaire";
    if (/^(u|unit|ens|pce|piece|pièce)/.test(s)) return "unite";
    if (/^(forfait|f|fft)/.test(s)) return "forfait";
    return null;
  };
  const fSrc = fam(src.unite);
  const fDevis = fam(poste.unite);
  // Un forfait sourcé se compare au TOTAL de la ligne, pas à son unitaire.
  const forfaitaire = fSrc === "forfait" || fDevis === "forfait" || !poste.qty;
  if (!forfaitaire && fSrc && fDevis && fSrc !== fDevis) {
    return { verdict: "NON CONCLUANT", motif: `unité sourcée (${src.unite}) ≠ unité du devis (${poste.unite})` };
  }

  const reference = forfaitaire ? Number(src.prix_max_ht) : Number(src.prix_max_ht) * poste.qty;
  const compare = forfaitaire ? poste.montant : poste.montant;
  const ecart = compare - reference;
  return {
    verdict: ecart > 0 ? "ÉCART" : "OK",
    referenceMax: reference,
    ecartSource: Math.max(0, ecart),
    motif: ecart > 0
      ? `facturé ${eur(compare)} contre un plafond sourcé de ${eur(reference)}`
      : `facturé ${eur(compare)}, sous le plafond sourcé de ${eur(reference)}`,
  };
}

// ── Constitution de la population ────────────────────────────────────────────
const { data: corrections } = await supa
  .from("analysis_corrections")
  .select("analysis_id, action, corrected_surcout_max, original_conclusion");
const ids = [...new Set(corrections.map((c) => c.analysis_id))];
const { data: analyses } = await supa.from("analyses").select("id, file_name, raw_text").in("id", ids);
const parId = new Map((analyses ?? []).map((a) => [a.id, a]));

const population = [];
const vus = new Set();

for (const c of corrections) {
  const a = parId.get(c.analysis_id);
  if (!a || vus.has(c.analysis_id)) continue;
  let r = {};
  try { r = JSON.parse(a.raw_text ?? "{}"); } catch { continue; }
  const groupes = groupesChiffrables(r.n8n_price_data);
  if (groupes.length === 0) continue;

  const totalHT = Number(r.extracted_data?.totaux?.ht ?? r.extracted?.totaux?.ht ?? 0) || null;
  const s = computeServerSurcout(groupes, totalHT);
  if (s.postes.length === 0) continue;

  const original = Number(c.original_conclusion?.surcout_global?.max ?? 0) || 0;
  const expert = c.action === "corrected" ? (Number(c.corrected_surcout_max ?? 0) || 0) : original;
  const jugesAlors = postesJugesParExpert(c.original_conclusion);
  vus.add(c.analysis_id);

  for (const p of s.postes) {
    const dejaJuge = jugesAlors.some((n) => memePoste(n, p.label));
    // TÉMOIN : les postes déjà tranchés. MESURE : ceux que personne n'a vus.
    if (MODE_TEMOIN ? !dejaJuge : dejaJuge) continue;
    if (!MODE_TEMOIN && !(expert === 0 && s.max > PLANCHER)) continue;

    const g = groupes.find((x) => computeServerSurcout([x], totalHT).postes.some(
      (q) => q.label === p.label && Math.round(q.ecart) === Math.round(p.ecart),
    ));
    if (!g) continue;
    const desc = (Array.isArray(g.devis_lines) ? g.devis_lines : [])
      .map((x) => String(x?.description ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).join(" / ");

    population.push({
      analysisId: c.analysis_id,
      fichier: a.file_name,
      label: p.label,
      description: desc.slice(0, 600) || p.label,
      qty: Number(g.main_quantity) || null,
      unite: String(g.main_unit ?? "").trim(),
      montant: Number(g.devis_total_ht) || 0,
      ecartMoteur: p.ecart,
      // La réponse attendue, en mode témoin : l'expert a-t-il annulé (=OK) ?
      attendu: MODE_TEMOIN ? (expert === 0 ? "OK" : "ÉCART") : null,
    });
  }
}

console.log(`\n══ ${MODE_TEMOIN ? "TÉMOIN — postes DÉJÀ tranchés par l'expert" : "MESURE — postes que personne n'a jugés"} ══`);
console.log(`   ${population.length} poste(s) à sourcer · modèle ${MODELE} avec recherche Google\n`);
if (population.length === 0) { console.log("   rien à faire."); process.exit(0); }

// ── Exécution, en série pour ne pas saturer le quota ─────────────────────────
const resultats = [];
for (const [i, p] of population.entries()) {
  process.stdout.write(`   [${i + 1}/${population.length}] ${p.label.slice(0, 46).padEnd(46)} `);
  const src = await sourcer(p);
  const t = trancher(p, src);
  resultats.push({ ...p, source: src, ...t });
  const ok = t.verdict === "OK" ? "🟢" : t.verdict === "ÉCART" ? "🔴" : "⚪";
  const accord = p.attendu ? (t.verdict === p.attendu ? " ✓" : t.verdict.startsWith("NON") || t.verdict === "ERREUR" ? " ·" : " ✗") : "";
  console.log(`${ok} ${t.verdict}${accord}`);
  await new Promise((r) => setTimeout(r, 1200));
}

fs.writeFileSync(SORTIE, JSON.stringify(resultats, null, 2), "utf8");

// ── Rapport ──────────────────────────────────────────────────────────────────
const parV = (v) => resultats.filter((r) => r.verdict === v).length;
console.log(`\n══ RÉSULTAT ══`);
console.log(`   🟢 OK (prix dans le marché sourcé) : ${parV("OK")}`);
console.log(`   🔴 ÉCART (au-dessus du plafond)    : ${parV("ÉCART")}`);
console.log(`   ⚪ NON CONCLUANT                   : ${parV("NON CONCLUANT")}`);
console.log(`   ✗  ERREUR                          : ${parV("ERREUR")}`);

if (MODE_TEMOIN) {
  const tranchables = resultats.filter((r) => r.verdict === "OK" || r.verdict === "ÉCART");
  const justes = tranchables.filter((r) => r.verdict === r.attendu).length;
  console.log(`\n══ LE TÉMOIN — le sourceur discrimine-t-il ? ══`);
  console.log(`   ${justes}/${tranchables.length} d'accord avec l'expert (sur les postes tranchés)`);
  // 🔴 LE CONTRÔLE QUI COMPTE : un sourceur qui répond toujours pareil ne
  // mesure rien, même s'il « tombe juste » sur une population déséquilibrée.
  const nOK = tranchables.filter((r) => r.verdict === "OK").length;
  const nEcart = tranchables.length - nOK;
  console.log(`   répartition de ses réponses : ${nOK} OK · ${nEcart} ÉCART`);
  if (nOK === 0 || nEcart === 0) {
    console.log(`   ✗ IL NE DISCRIMINE PAS — il rend toujours la même réponse. NE PAS L'UTILISER.`);
    process.exitCode = 1;
  }
  console.log(`\n   ── les désaccords, à regarder un par un ──`);
  for (const r of tranchables.filter((x) => x.verdict !== x.attendu)) {
    console.log(`   ✗ attendu ${r.attendu}, obtenu ${r.verdict} — ${r.label}`);
    console.log(`     ${r.motif}`);
    console.log(`     périmètre sourcé : ${r.source?.perimetre ?? "—"} · certitude ${r.source?.certitude ?? "—"}`);
  }
}

console.log(`\n   → ${SORTIE}`);
