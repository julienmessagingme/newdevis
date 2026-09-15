/**
 * scripts/banc-surcout-plausibilite.mjs
 *
 * 2026-09-15 — BANC DU SURCOÛT : LE COEFFICIENT ×1,3 ET LES ÉCARTS ABERRANTS.
 *
 * Déclencheur : 19 analyses du stock affichent un écart supérieur à 40 % du
 * montant du devis, et 8 un écart supérieur à 100 % — mathématiquement
 * impossible. Toutes en `auto_approved`, donc visibles par leurs utilisateurs.
 *
 * Ce banc mesure, AVANT livraison :
 *   (a) l'effet du retrait du coefficient ×1,3 (aucune justification n'a jamais
 *       été écrite pour lui — cf. l'en-tête de `surcoutServeur.ts`) ;
 *   (b) l'effet des deux gardes par poste (tarif de main-d'œuvre face à une
 *       ligne fournie · poste plus lourd que le devis entier) ;
 *   (c) le seuil de plausibilité globale : combien de devis basculeraient en
 *       « comparaison indicative » selon le seuil retenu.
 *
 * ⚠️ LA RÈGLE EST IMPORTÉE, JAMAIS RECOPIÉE — une copie mesurerait autre chose
 * que ce qui part en production (leçon du banc de re-classement, 2026-09-11).
 *
 * ⚠️ LE TÉMOIN D'ABORD : le banc rejoue l'ANCIENNE règle (somme brute × 1,3,
 * sans les nouvelles gardes) et la compare au montant RÉELLEMENT stocké dans
 * `conclusion_ia.surcout_global.max`. Tant que les deux ne concordent pas sur
 * la masse du stock, aucun chiffre de ce banc ne veut rien dire.
 *
 * Usage : npx tsx scripts/banc-surcout-plausibilite.mjs
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { computeServerSurcout } from "../src/lib/analyse/surcoutServeur.ts";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const eur = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const pct = (n, d) => (d > 0 ? `${((n / d) * 100).toFixed(0)} %` : "—");

// ── Chargement ───────────────────────────────────────────────────────────────
let lignes = [];
let from = 0;
for (;;) {
  const { data, error } = await supa
    .from("analyses")
    .select("id, user_id, file_name, created_at, review_status, raw_text, conclusion_ia")
    .not("conclusion_ia", "is", null)
    .order("created_at", { ascending: false })
    .range(from, from + 499);
  if (error) { console.error(error); process.exit(1); }
  lignes = lignes.concat(data);
  if (data.length < 500) break;
  from += 500;
}

// Déduplication par DOCUMENT (user_id|file_name) — un même PDF redéposé crée
// autant d'analyses que de dépôts (règle de l'observatoire, 2026-09-07).
const vus = new Set();
const dossiers = [];
for (const a of lignes) {
  const cle = `${a.user_id}|${a.file_name}`;
  if (vus.has(cle)) continue;
  vus.add(cle);
  dossiers.push(a);
}

console.log(`Analyses avec conclusion : ${lignes.length} — documents dédupliqués : ${dossiers.length}\n`);

// ── Rejeu ────────────────────────────────────────────────────────────────────
const cas = [];
for (const a of dossiers) {
  let p;
  try { p = JSON.parse(a.raw_text || "{}"); } catch { continue; }
  const brutGroupes = Array.isArray(p.n8n_price_data) ? p.n8n_price_data : [];
  if (!brutGroupes.length) continue;

  // Filtre de confiance V3.5.13 : seuls les rapprochements `high` entrent dans
  // le chiffrage (les analyses V3.6 legacy n'ont pas de méta vectorielle).
  const groupes = brutGroupes.filter((g) => {
    const v = g?.vectorial;
    return !v || typeof v !== "object" || v.confidence === "high";
  });

  const totalHT =
    Number(p.extracted_data?.totaux?.ht) || Number(p.extracted?.totaux?.ht) || null;

  const r = computeServerSurcout(groupes, totalHT);
  const retire = r.ecartes.reduce((s, e) => s + e.ecart, 0);

  // ANCIENNE règle = somme brute AVANT les nouvelles gardes, × 1,3.
  const ancienBrut = r.brut + retire;
  const ancienMax = Math.round(ancienBrut * 1.3);

  // ⚠️ `analyses.conclusion_ia` est une colonne TEXTE qui contient du JSON, pas
  // un jsonb. La lire comme un objet rend `undefined` partout — et un témoin
  // qui compare à `undefined` déclare 0 € partout en ayant l'air de mesurer.
  let conclusion = {};
  try {
    conclusion = typeof a.conclusion_ia === "string" ? JSON.parse(a.conclusion_ia) : (a.conclusion_ia ?? {});
  } catch { conclusion = {}; }
  const stocke = Number(conclusion?.surcout_global?.max ?? 0) || 0;

  // Les analyses antérieures au moteur vectoriel n'ont pas de méta `vectorial` :
  // le filtre de confiance ne s'y applique pas, et les gardes du matcher (ratio
  // invraisemblable, prestations intellectuelles) n'existaient pas quand elles
  // ont été produites. Les compter avec les autres surestimerait ce que les
  // correctifs changent pour les analyses À VENIR.
  const legacy = !brutGroupes.some((g) => g?.vectorial && typeof g.vectorial === "object");

  cas.push({
    id: a.id,
    fichier: a.file_name,
    review: a.review_status,
    legacy,
    totalHT,
    stocke,
    ancienMax,
    nouveauMax: r.max,
    retire,
    ecartes: r.ecartes,
    postes: r.postes,
  });
}

// ── 1. TÉMOIN ────────────────────────────────────────────────────────────────
console.log("═══ 1. TÉMOIN — le banc reproduit-il la production ? ═══\n");
// Une conclusion réécrite par un humain n'est plus une sortie du moteur : la
// comparer au rejeu mesurerait l'expert, pas le code.
const jugeables = cas.filter((c) => c.review !== "corrected");
const lesDeux = jugeables.filter((c) => c.stocke > 0 && c.ancienMax > 0);
const seulStocke = jugeables.filter((c) => c.stocke > 0 && c.ancienMax === 0);
const seulRejeu = jugeables.filter((c) => c.stocke === 0 && c.ancienMax > 0);

let concordants = 0;
const divergents = [];
for (const c of lesDeux) {
  const tol = Math.max(50, c.stocke * 0.02);
  if (Math.abs(c.ancienMax - c.stocke) <= tol) concordants++;
  else divergents.push(c);
}
console.log(`Documents jugeables (hors conclusions corrigées à la main) : ${jugeables.length}`);
console.log(`  · montant des DEUX côtés  : ${lesDeux.length} → identique (±2 %) : ${concordants} (${pct(concordants, lesDeux.length)})`);
console.log(`  · stocké seul (rejeu nul) : ${seulStocke.length}  ← repli « somme des anomalies » de la production, hors périmètre du rejeu`);
console.log(`  · rejeu seul (stocké nul) : ${seulRejeu.length}  ← montant neutralisé en production (bypass, rien de comparable, filtre V3.4.24)`);
// 🔴 LE CONTRÔLE DÉCISIF. Les conclusions du stock ont été écrites par des
// versions ANTÉRIEURES du moteur, avant les gardes d'unité (30/08), de
// confiance (10/09) et d'hétérogénéité. Le rejeu doit donc rendre des montants
// INFÉRIEURS ou égaux aux montants stockés — jamais supérieurs. Un seul rejeu
// au-dessus du stocké signalerait que le banc invente du surcoût, et tout ce
// qui suit serait à jeter.
const rejeuPlusHaut = lesDeux.filter((c) => c.ancienMax > c.stocke * 1.02);
console.log(`  · rejeu SUPÉRIEUR au stocké : ${rejeuPlusHaut.length} ${rejeuPlusHaut.length === 0 ? "✓ (le banc n'invente pas d'écart)" : "⚠️ LE BANC EST FAUX"}`);
for (const c of rejeuPlusHaut.slice(0, 5)) {
  console.log(`      ⚠️ ${c.fichier} — stocké ${eur(c.stocke)} · rejoué ${eur(c.ancienMax)}`);
}
if (divergents.length) {
  console.log(`\n  Divergences des deux côtés (${divergents.length}) — toutes à la BAISSE = gardes ajoutées depuis :`);
  for (const d of divergents.slice(0, 10)) {
    console.log(`   • ${d.fichier?.slice(0, 46)} — stocké ${eur(d.stocke)} · rejoué ${eur(d.ancienMax)} (×${(d.ancienMax / d.stocke).toFixed(2)})`);
  }
}
console.log();

// ── 2. EFFET DU RETRAIT DU ×1,3 + DES GARDES ─────────────────────────────────
console.log("═══ 2. CE QUE CHANGENT LE RETRAIT DU ×1,3 ET LES DEUX GARDES ═══\n");
const porteurs = cas.filter((c) => c.ancienMax > 0);
const sommeAvant = porteurs.reduce((s, c) => s + c.ancienMax, 0);
const sommeApres = porteurs.reduce((s, c) => s + c.nouveauMax, 0);
console.log(`Devis affichant un écart, avant : ${porteurs.length}`);
console.log(`Devis affichant un écart, après : ${cas.filter((c) => c.nouveauMax > 0).length}`);
console.log(`Montant total annoncé, avant    : ${eur(sommeAvant)}`);
console.log(`Montant total annoncé, après    : ${eur(sommeApres)}  (${pct(sommeApres - sommeAvant, sommeAvant)})`);

const parMotif = new Map();
for (const c of cas) {
  for (const e of c.ecartes) {
    const m = parMotif.get(e.motif) ?? { n: 0, montant: 0, devis: new Set() };
    m.n++; m.montant += e.ecart; m.devis.add(c.id);
    parMotif.set(e.motif, m);
  }
}
console.log("\nGardes par poste :");
for (const [motif, m] of parMotif) {
  console.log(`   • ${motif} — ${m.n} poste(s) sur ${m.devis.size} devis, ${eur(m.montant)} retirés`);
}
console.log();

// ── 3. PLAUSIBILITÉ GLOBALE ──────────────────────────────────────────────────
console.log("═══ 3. SEUIL DE PLAUSIBILITÉ GLOBALE (après gardes) ═══\n");
const chiffrables = cas.filter((c) => c.nouveauMax > 0 && c.totalHT > 0);
const parts = chiffrables
  .map((c) => ({ ...c, part: c.nouveauMax / c.totalHT }))
  .sort((a, b) => b.part - a.part);

const quantile = (arr, q) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(q * arr.length))].part : 0;
const croissant = [...parts].sort((a, b) => a.part - b.part);
console.log(`Devis chiffrés avec un total HT connu : ${parts.length}`);
console.log(`Part médiane de l'écart dans le devis : ${(quantile(croissant, 0.5) * 100).toFixed(0)} %`);
console.log(`3ᵉ quartile : ${(quantile(croissant, 0.75) * 100).toFixed(0)} %  ·  9ᵉ décile : ${(quantile(croissant, 0.9) * 100).toFixed(0)} %`);
console.log();
for (const seuil of [0.3, 0.4, 0.5, 0.75, 1.0]) {
  const n = parts.filter((c) => c.part > seuil).length;
  const montant = parts.filter((c) => c.part > seuil).reduce((s, c) => s + c.nouveauMax, 0);
  console.log(`   seuil ${(seuil * 100).toFixed(0).padStart(3)} % → ${String(n).padStart(3)} devis basculeraient en « comparaison indicative » (${eur(montant)} retirés de l'affichage)`);
}

console.log("\nLes 12 parts les plus fortes :");
for (const c of parts.slice(0, 12)) {
  console.log(
    `   ${(c.part * 100).toFixed(0).padStart(4)} %  ${eur(c.nouveauMax).padStart(12)} sur ${eur(c.totalHT).padStart(12)}  ${c.legacy ? "[legacy]" : "[vect.]"} ${c.fichier?.slice(0, 36)}` +
    `\n            postes : ${c.postes.slice(0, 3).map((p) => `${p.label} (${eur(p.ecart)}, ×${p.ratio.toFixed(1)})`).join(" · ")}`,
  );
}

// ── 3bis. RATIO PAR POSTE ────────────────────────────────────────────────────
console.log("\n═══ 3bis. L'AUTRE LEVIER : LE RATIO PAR POSTE (devis ÷ plafond marché) ═══\n");
const tousPostes = cas.flatMap((c) => c.postes.map((p) => ({ ...p, doc: c.fichier, legacy: c.legacy })));
const ratiosTries = [...tousPostes].sort((a, b) => a.ratio - b.ratio);
const q = (arr, x) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(x * arr.length))].ratio : 0);
console.log(`Postes chiffrés : ${tousPostes.length} (dont ${tousPostes.filter((p) => p.legacy).length} sur analyses legacy)`);
console.log(`Ratio médian ×${q(ratiosTries, 0.5).toFixed(2)} · 3ᵉ quartile ×${q(ratiosTries, 0.75).toFixed(2)} · 9ᵉ décile ×${q(ratiosTries, 0.9).toFixed(2)}\n`);
for (const cap of [2, 3, 5, 8]) {
  const touches = tousPostes.filter((p) => p.ratio > cap);
  const nonLegacy = touches.filter((p) => !p.legacy);
  console.log(
    `   plafond ×${cap} → ${String(touches.length).padStart(3)} poste(s) retiré(s), ${eur(touches.reduce((s, p) => s + p.ecart, 0)).padStart(12)}` +
    `  (dont ${nonLegacy.length} sur analyses récentes)`,
  );
}
console.log("\n   Les 10 ratios les plus forts :");
for (const p of [...tousPostes].sort((a, b) => b.ratio - a.ratio).slice(0, 10)) {
  console.log(`      ×${p.ratio.toFixed(1).padStart(6)}  ${eur(p.ecart).padStart(11)}  ${p.legacy ? "[legacy]" : "[vect.]"}  ${p.label.slice(0, 46)}`);
}

// ── 4. SEUIL DE MISE EN REVUE ────────────────────────────────────────────────
console.log("\n═══ 4. EFFET SUR LE DÉCLENCHEUR DE REVUE (2 000 €) ═══\n");
const avant2k = cas.filter((c) => c.ancienMax > 2000).length;
const apres2k = cas.filter((c) => c.nouveauMax > 2000).length;
console.log(`Devis au-dessus de 2 000 € — avant : ${avant2k} · après : ${apres2k}`);
