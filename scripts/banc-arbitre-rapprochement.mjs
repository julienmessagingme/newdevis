/**
 * scripts/banc-arbitre-rapprochement.mjs
 *
 * 2026-09-15 — COMBIEN D'ANALYSES UN ARBITRE IA ENVERRAIT-IL EN RELECTURE ?
 *
 * Décision à instruire (Johan, 15/09) : brancher une IA qui ne juge PAS le
 * verdict — la mesure du 30/08 a fermé cette piste, elle dit « corriger » sur
 * 15 des 16 analyses témoins — mais qui juge **une seule question vérifiable** :
 * *cette entrée catalogue décrit-elle bien cette ligne de devis ?*
 *
 * Et surtout : son désaccord ne SUPPRIME pas le prix, il **route l'analyse vers
 * la file de relecture humaine**. La question n'est donc plus « combien de bons
 * prix perd-on ? » mais **« combien d'analyses par mois cela met-il sur le dos
 * de Johan ? »**. C'est ce que ce banc mesure.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * ⚠️ LE PROTOCOLE EST CELUI DU 10/09, DÉLIBÉRÉMENT.
 *
 * Même consigne, mêmes cinq candidats, même mélange déterministe de l'ordre.
 * Sans ça, les chiffres produits ici ne seraient pas comparables au seul
 * arbitrage déjà mesuré (l'IA bloque 9 des 19 références fausses et 7 des 29
 * justes) — et il faudrait re-valider le prompt de zéro.
 *
 * ⚠️ LE MÉLANGE DE L'ORDRE N'EST PAS UN ORNEMENT : sans lui, un modèle qui
 * répondrait « 1 » par réflexe afficherait un accord parfait avec le top-1
 * vectoriel sans avoir rien jugé, et le banc conclurait « aucune contestation ».
 * ──────────────────────────────────────────────────────────────────────────
 *
 * ⚠️ LE TÉMOIN D'ABORD. Le banc rejoue l'arbitre sur les lignes de l'étalon
 * dont le prix est RÉELLEMENT AFFICHÉ (`temoin = true`), où la bonne réponse
 * est connue de deux juges. Il doit y retrouver l'ordre de grandeur du 10/09.
 * S'il ne le retrouve pas, le chiffre de volume qui suit ne vaut rien.
 *
 * ⚠️ La règle de chiffrage est IMPORTÉE (`computeServerSurcout`), jamais
 * recopiée : le banc doit juger exactement les postes que la production
 * affiche aujourd'hui, gardes du 15/09 comprises.
 *
 * Usage : npx tsx scripts/banc-arbitre-rapprochement.mjs [--temoin-seul]
 *         (reprend où il s'est arrêté — les jugements sont mis en cache)
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { computeServerSurcout } from "../src/lib/analyse/surcoutServeur.ts";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const KEY = lire("GOOGLE_API_KEY");
// ⚠️ Le modèle fait partie du protocole : changer de modèle PÉRIME le témoin.
// `--modele=gemini-2.5-flash` sert à comparer, jamais à « optimiser » sans
// repasser le témoin (flash est 2,5× plus rapide et 8× moins cher — raison de
// plus pour vérifier qu'il juge aussi bien avant de s'en servir).
const MODELE = process.argv.find((a) => a.startsWith("--modele="))?.split("=")[1] ?? "gemini-2.5-pro";
const TEMOIN_SEUL = process.argv.includes("--temoin-seul");

const CACHE = path.join(
  "C:/Users/bride/AppData/Local/Temp/claude/C--Users-bride-projets-newdevis--claude-worktrees-upbeat-volhard-f2b29e/756eeffe-8c17-45ee-be38-176f96b1e05c/scratchpad",
  "arbitre-jugements.json",
);
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
const sauver = () => fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));

const eur = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const pct = (n, d) => (d > 0 ? `${((n / d) * 100).toFixed(0)} %` : "—");

// ── La consigne du 10/09, mot pour mot ───────────────────────────────────────
const CONSIGNE = `Tu relis le rapprochement entre une LIGNE DE DEVIS d'artisan et notre catalogue de prix de référence.

Question : lequel des postes proposés décrit LA MÊME PRESTATION que la ligne de devis ?
Réponds par son numéro. Réponds 0 si AUCUN ne convient — c'est une réponse aussi utile que les autres, elle signale qu'il manque une entrée au catalogue. Réponds -1 si la ligne du devis est trop mal rédigée pour être jugée.

Ce n'est PAS une question de prix : les fourchettes ne te sont pas montrées. On veut savoir si la comparaison a un sens.

Repères :
- un tarif "pose" ou "MO" ne convient pas à une ligne qui fournit le matériel, et inversement ;
- l'unité compte : un tarif au m² ne convient pas à une ligne facturée au forfait sans surface ;
- un tarif qui décrit UN COMPOSANT ne convient pas à une ligne qui couvre TOUT UN LOT ;
- une DÉPOSE n'est pas une POSE.

Réponds uniquement en JSON : {"choix": <entier>, "raison": "<15 mots max>"}`;

/** Mélange déterministe — l'ordre vu par l'IA n'est jamais l'ordre du vectoriel. */
const melange = (arr, graine) => {
  const a = [...arr];
  let x = graine;
  const r = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

const grainePour = (cle) => {
  let h = 0;
  for (const c of cle) h = (h * 31 + c.charCodeAt(0)) % 2147483648;
  return h * 7919 % 2147483648;
};

/**
 * Soumet une ligne et ses candidats à l'arbitre.
 * Retourne le RANG VECTORIEL choisi (1-5), 0 (aucun) ou -1 (injugeable).
 */
async function arbitrer(cleBrute, ligne, contexte, candidats) {
  // 🔴 Le cache est CLOISONNÉ PAR MODÈLE : sans ça, mesurer flash relirait les
  // jugements de pro et rendrait un verdict identique par construction.
  const cle = `${MODELE}|${cleBrute}`;
  if (cache[cle]) return cache[cle];
  const ordre = melange(candidats.map((c, i) => ({ ...c, rangVectoriel: i + 1 })), grainePour(cleBrute));
  const prompt = `${CONSIGNE}\n\nLIGNE DE DEVIS : ${ligne}\nContexte : ${contexte || "non précisé"}\n\nPOSTES PROPOSÉS :\n` +
    ordre.map((o, i) => `${i + 1}. ${o.label}`).join("\n");

  for (let essai = 0; essai < 3; essai++) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELE}:generateContent?key=${KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 8192, responseMimeType: "application/json" },
        }),
      },
    );
    if (!r.ok) {
      if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 3000 * (essai + 1))); continue; }
      throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    }
    const j = await r.json();
    const t = j.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!t) { await new Promise((s) => setTimeout(s, 2000)); continue; }
    let p; try { p = JSON.parse(t); } catch { continue; }
    const presente = Number(p.choix);
    const choix = presente >= 1 && presente <= ordre.length ? ordre[presente - 1].rangVectoriel : presente;
    const res = { choix, raison: String(p.raison ?? "").slice(0, 120) };
    cache[cle] = res; sauver();
    return res;
  }
  return { choix: null, raison: "échec" };
}

// ═══ 1. TÉMOIN — l'arbitre retrouve-t-il l'arbitrage connu du 10/09 ? ════════
console.log("═══ 1. TÉMOIN — sur les lignes dont le prix est RÉELLEMENT affiché ═══\n");

const { data: etalon, error: eEtalon } = await supa
  .from("match_gold_standard").select("*").eq("temoin", true).order("id");
if (eEtalon) { console.error(eEtalon); process.exit(1); }

let tJuges = 0, tConteste = 0, tJusteEtConteste = 0, tFauxEtLaisse = 0, tFauxEtConteste = 0, tJusteEtLaisse = 0;
for (const l of etalon) {
  const cands = Array.isArray(l.candidats) ? l.candidats : [];
  if (cands.length === 0) continue;
  // La production affiche le rang 1. « Juste » = l'humain a désigné le rang 1.
  const humain = Number(l.reponse_humaine);
  if (!Number.isFinite(humain) || humain === -1) continue; // injugeable même par un humain
  const ctx = l.contexte ?? {};
  const contexte = [ctx.qte && `${ctx.qte} ${ctx.unite ?? ""}`.trim(), ctx.montant_ht && `${ctx.montant_ht} € HT`]
    .filter(Boolean).join(" · ");

  const { choix } = await arbitrer(`etalon:${l.id}`, l.ligne_devis, contexte, cands);
  if (choix === null) continue;

  tJuges++;
  const topUnEstJuste = humain === 1;
  const arbitreConteste = choix !== 1;
  if (arbitreConteste) tConteste++;
  if (topUnEstJuste && arbitreConteste) tJusteEtConteste++;
  if (topUnEstJuste && !arbitreConteste) tJusteEtLaisse++;
  if (!topUnEstJuste && arbitreConteste) tFauxEtConteste++;
  if (!topUnEstJuste && !arbitreConteste) tFauxEtLaisse++;
  process.stdout.write(`\r  ${tJuges}/${etalon.length} jugées…`);
}
console.log(`\r  ${tJuges} lignes jugeables (prix affichés)            \n`);
console.log(`  Références FAUSSES (selon l'humain)   : ${tFauxEtConteste + tFauxEtLaisse}`);
console.log(`     · contestées par l'arbitre         : ${tFauxEtConteste} (${pct(tFauxEtConteste, tFauxEtConteste + tFauxEtLaisse)}) ← ce qu'il rattrape`);
console.log(`     · laissées passer                  : ${tFauxEtLaisse}`);
console.log(`  Références JUSTES (selon l'humain)    : ${tJusteEtConteste + tJusteEtLaisse}`);
console.log(`     · contestées quand même            : ${tJusteEtConteste} (${pct(tJusteEtConteste, tJusteEtConteste + tJusteEtLaisse)}) ← ce qu'il coûte en relecture`);
console.log(`     · laissées passer                  : ${tJusteEtLaisse}`);
console.log(`\n  Taux de contestation global : ${pct(tConteste, tJuges)}`);
console.log(`  ⚠️ Repère du 10/09 sur les 48 lignes chiffrées : 47 % des fausses rattrapées, 24 % des justes contestées.\n`);

if (TEMOIN_SEUL) process.exit(0);

// ═══ 2. VOLUME — combien d'analyses partiraient en relecture ? ═══════════════
console.log("═══ 2. VOLUME SUR LE STOCK — ce que ça met dans la file de Johan ═══\n");

let lignes = [], from = 0;
for (;;) {
  const { data, error } = await supa
    .from("analyses")
    .select("id, user_id, file_name, created_at, review_status, raw_text")
    .not("conclusion_ia", "is", null)
    .order("created_at", { ascending: false })
    .range(from, from + 499);
  if (error) { console.error(error); process.exit(1); }
  lignes = lignes.concat(data);
  if (data.length < 500) break;
  from += 500;
}

const vus = new Set();
const docs = [];
for (const a of lignes) {
  const cle = `${a.user_id}|${a.file_name}`;
  if (vus.has(cle)) continue;
  vus.add(cle);
  docs.push(a);
}

// Chaque groupe est passé SEUL à la règle réelle : s'il en ressort un poste,
// c'est qu'il est chiffré aujourd'hui, gardes du 15/09 comprises.
const aJuger = [];
let sansCandidats = 0;
for (const a of docs) {
  let p; try { p = JSON.parse(a.raw_text || "{}"); } catch { continue; }
  const bruts = Array.isArray(p.n8n_price_data) ? p.n8n_price_data : [];
  const totalHT = Number(p.extracted_data?.totaux?.ht) || Number(p.extracted?.totaux?.ht) || null;
  for (const g of bruts) {
    const v = g?.vectorial;
    if (v && typeof v === "object" && v.confidence !== "high") continue; // filtre V3.5.13
    const r = computeServerSurcout([g], totalHT);
    if (r.postes.length === 0) continue; // pas chiffré aujourd'hui → rien à arbitrer

    const cands = Array.isArray(v?.all_candidates) ? v.all_candidates : [];
    const utilise = g?.prices?.[0]?.job_type ?? g?.catalog_job_types?.[0] ?? null;
    const rangUtilise = cands.findIndex((c) => c.job_type === utilise) + 1;
    if (cands.length === 0 || rangUtilise === 0) { sansCandidats++; continue; }

    const l0 = (g.devis_lines ?? [])[0] ?? {};
    aJuger.push({
      analyseId: a.id,
      fichier: a.file_name,
      review: a.review_status,
      ligne: String(l0.description ?? g.job_type_label ?? "").replace(/\s+/g, " ").slice(0, 200),
      contexte: [g.main_quantity && `${g.main_quantity} ${g.main_unit ?? ""}`.trim(),
                 g.devis_total_ht && `${g.devis_total_ht} € HT`].filter(Boolean).join(" · "),
      candidats: cands,
      rangUtilise,
      label: g.job_type_label,
      ecart: r.postes[0].ecart,
      // Conservés pour recalculer l'écart avec l'entrée que l'arbitre propose.
      devisTotal: Number(g.devis_total_ht) || 0,
      qte: typeof g.main_quantity === "number" && g.main_quantity > 0 ? g.main_quantity : 1,
    });
  }
}

console.log(`Documents dédupliqués          : ${docs.length}`);
console.log(`Postes CHIFFRÉS aujourd'hui    : ${aJuger.length + sansCandidats}`);
console.log(`  · jugeables (top-5 présent)   : ${aJuger.length}`);
console.log(`  · sans candidats (V3.6 legacy): ${sansCandidats} — hors périmètre, l'arbitre n'aurait rien à lire\n`);

let n = 0;
for (const c of aJuger) {
  const { choix, raison } = await arbitrer(`stock:${c.analyseId}:${c.rangUtilise}:${c.label}`, c.ligne, c.contexte, c.candidats);
  c.choix = choix; c.raison = raison;
  process.stdout.write(`\r  ${++n}/${aJuger.length} jugés…`);
}
console.log(`\r  ${n} postes jugés.                    \n`);

const contestes = aJuger.filter((c) => c.choix !== null && c.choix !== c.rangUtilise);
const analysesChiffrees = new Set(aJuger.map((c) => c.analyseId));

console.log(`Postes contestés par l'arbitre  : ${contestes.length} / ${aJuger.length} (${pct(contestes.length, aJuger.length)})`);
console.log(`   dont « aucun ne convient »   : ${contestes.filter((c) => c.choix === 0).length}`);
console.log(`   dont « un autre du top-5 »   : ${contestes.filter((c) => c.choix > 0).length}`);

// ═══ 3. LA CONTESTATION CHANGE-T-ELLE CE QU'ON DIT AU CLIENT ? ══════════════
// 🔴 Mon premier indicateur comptait « l'IA choisit une autre entrée ». C'est le
// piège de l'indicateur mal écrit (leçon du banc de re-classement, 11/09) : la
// moitié des contestations désignent un QUASI-DOUBLON du catalogue — « Écran de
// sous-toiture HPV (fourni+posé) » contre « Écran HPV sous-toiture
// (fourni+posé) », « Mur parpaing 20 cm » contre « Construction mur parpaing
// 20 cm ». Router une analyse en relecture pour ça, c'est du bruit pur.
// Ce qui compte est le MONTANT : l'écart annoncé change-t-il vraiment ?
console.log("\n═══ 3. EFFET RÉEL — la contestation change-t-elle le montant ? ═══\n");

const jobsVoulus = [...new Set(contestes.filter((c) => c.choix > 0)
  .map((c) => c.candidats[c.choix - 1]?.job_type).filter(Boolean))];
const { data: tarifs } = await supa
  .from("market_prices")
  .select("job_type, price_max_unit_ht, fixed_max_ht")
  .in("job_type", jobsVoulus);
const tarifPar = new Map((tarifs ?? []).map((t) => [t.job_type, t]));

// Seuils alignés sur le produit : sous 300 € aucun montant n'est affiché
// (plancher `surcout.max >= 300`), et une variation sous 20 % ne change ni le
// verdict ni la phrase — elle ne justifie pas de mobiliser un humain.
const SEUIL_EUR = 300;
const SEUIL_PART = 0.20;

for (const c of contestes) {
  if (c.choix === 0) { c.materiel = true; c.motif = "aucune entrée ne convient → le prix ne devrait pas être affiché"; continue; }
  const t = tarifPar.get(c.candidats[c.choix - 1]?.job_type);
  if (!t) { c.materiel = true; c.motif = "entrée proposée introuvable au catalogue"; continue; }
  const maxAlt = (Number(t.price_max_unit_ht) || 0) * c.qte + (Number(t.fixed_max_ht) || 0);
  const ecartAlt = maxAlt > 0 ? Math.max(0, c.devisTotal - maxAlt) : c.ecart;
  c.ecartAlt = Math.round(ecartAlt);
  const delta = Math.abs(ecartAlt - c.ecart);
  c.materiel = delta >= SEUIL_EUR && delta >= c.ecart * SEUIL_PART;
  c.motif = c.materiel
    ? `écart ${eur(c.ecart)} → ${eur(ecartAlt)}`
    : `même montant à ${eur(delta)} près (quasi-doublon du catalogue)`;
}

const materiels = contestes.filter((c) => c.materiel);
const bruit = contestes.filter((c) => !c.materiel);
const analysesTouchees = new Set(materiels.map((c) => c.analyseId));

console.log(`Contestations SANS effet sur le montant : ${bruit.length} (${pct(bruit.length, contestes.length)}) ← quasi-doublons du catalogue`);
console.log(`Contestations qui CHANGENT le montant   : ${materiels.length} (${pct(materiels.length, contestes.length)})`);
console.log(`   dont « aucune entrée ne convient »   : ${materiels.filter((c) => c.choix === 0).length}`);
console.log(`\nAnalyses portant un poste chiffré     : ${analysesChiffrees.size}`);
console.log(`Analyses qui partiraient en RELECTURE  : ${analysesTouchees.size} (${pct(analysesTouchees.size, docs.length)} du stock)`);
console.log(`Montant annoncé sur ces postes         : ${eur(materiels.reduce((s, c) => s + c.ecart, 0))}`);

// Projection au rythme réel
const parMois = new Map();
for (const a of docs) {
  const m = String(a.created_at).slice(0, 7);
  parMois.set(m, (parMois.get(m) ?? 0) + 1);
}
const derniers = [...parMois.entries()].sort().slice(-3);
const rythme = derniers.reduce((s, [, v]) => s + v, 0) / (derniers.length || 1);
console.log(`\nRythme récent : ${derniers.map(([m, v]) => `${m} ${v}`).join(" · ")} → ${rythme.toFixed(0)} analyses/mois`);
console.log(`PROJECTION : ${(rythme * analysesTouchees.size / docs.length).toFixed(1)} analyses/mois à relire en plus.`);

console.log("\n─── Les contestations qui changent le montant, par ordre de poids ───");
for (const c of [...materiels].sort((a, b) => b.ecart - a.ecart).slice(0, 15)) {
  const remplacant = c.choix > 0 ? c.candidats[c.choix - 1]?.label : "AUCUN ne convient";
  console.log(`\n  ${eur(c.ecart).padStart(10)} · ${c.fichier?.slice(0, 40)}`);
  console.log(`     ligne    : ${c.ligne.slice(0, 95)}`);
  console.log(`     opposé à : « ${c.label} »  (rang ${c.rangUtilise})`);
  console.log(`     arbitre  : ${remplacant}  — ${c.raison}`);
  console.log(`     effet    : ${c.motif}`);
}

console.log("\n─── Échantillon du BRUIT (quasi-doublons) — à ne PAS router en relecture ───");
for (const c of bruit.slice(0, 6)) {
  console.log(`  « ${c.label} » → « ${c.candidats[c.choix - 1]?.label} »  (${c.motif})`);
}

// ═══ 4. CE QU'UNE GARDE DÉTERMINISTE ATTRAPERAIT SANS IA ════════════════════
// 🔴 Deux des contestations les plus lourdes sont des tarifs de MAIN-D'ŒUVRE
// opposés à des lignes « Fourniture ET pose » — « Pose porte entrée » contre une
// porte Bel'm fournie, « Pose baguettes » contre une baguette fournie. Ma garde
// `tarifMainDoeuvreFaceAFourniture` (15/09) aurait dû les prendre : elle ne l'a
// pas fait parce qu'elle exige que le libellé catalogue ANNONCE la pose seule
// — « (MO) », « (hors fourniture) », « taux horaire ». **« Pose X » tout court
// ne compte pas** : c'est exactement le piège de `nature_prix` documenté le
// 10/09 (« Le mot Pose nu ne compte pas »).
// Avant d'élargir quoi que ce soit, on mesure ce que ça prendrait ET ce que ça
// coûterait — le 10/09 a montré qu'un relâchement autour du mot « Pose » fait
// basculer 25 textes sur 29, en majorité dans le mauvais sens.
console.log("\n═══ 4. ET SANS IA ? ce qu'une garde « Pose X » élargie attraperait ═══\n");

const POSE_NUE = /^pose\b/i;                       // libellé catalogue : « Pose … »
const LIGNE_FOURNIT = /\bfournitures?\b|\bfourni(?:e|es|s)?\b|\bf\s*&\s*p\b/i;

const candidatsGarde = aJuger.filter((c) => POSE_NUE.test(c.label ?? "") && LIGNE_FOURNIT.test(c.ligne));
const dAccord = candidatsGarde.filter((c) => c.choix !== null && c.choix !== c.rangUtilise);
const enDesaccord = candidatsGarde.filter((c) => c.choix === c.rangUtilise);

console.log(`Postes « Pose … » face à une ligne qui dit fournir : ${candidatsGarde.length} / ${aJuger.length}`);
console.log(`   · l'arbitre les conteste AUSSI : ${dAccord.length} (${eur(dAccord.reduce((s, c) => s + c.ecart, 0))} d'écart annoncé)`);
console.log(`   · l'arbitre les VALIDE         : ${enDesaccord.length} ← ce qu'une garde aveugle détruirait`);
for (const c of enDesaccord.slice(0, 8)) {
  console.log(`        ⚠️ « ${c.label} » ← ${c.ligne.slice(0, 70)} (${eur(c.ecart)})`);
}
