/**
 * scripts/banc-rejeu-decisions-expert.mjs
 *
 * 🟢 2026-09-16 (consigne Johan : « plus de fuite en avant, on capitalise
 * l'existant ») — LE FILET ANTI-RÉGRESSION PROMIS DEPUIS JUIN, ENFIN CÂBLÉ —
 * ET IL N'A DEMANDÉ AUCUNE DONNÉE NOUVELLE.
 *
 * `analysis_corrections` contient depuis des mois exactement ce qu'il faut :
 *   · `original_conclusion`   — ce que la machine disait à l'époque
 *   · `corrected_surcout_*`   — ce que l'expert a tranché
 *   · `action`                — corrected / validated / rejected
 *   · `expert_notes`          — le POURQUOI, dans les mots de l'expert
 *
 * 55 décisions. **Aucun script ne les rejouait.** On corrigeait les cas un par
 * un sans jamais demander : *le moteur d'aujourd'hui referait-il la même
 * erreur ?* C'est la seule question qui dise si on apprend ou si on tourne.
 *
 * ⚠️ ON NE RÉGÉNÈRE RIEN. Les 36 conclusions `corrected` ne sont volontairement
 * jamais régénérées (filet du 2026-09-04 : « une conclusion écrite par un
 * humain ne se fait pas écraser par la machine »), donc leur `conclusion_ia`
 * stockée EST celle de l'expert — la comparer à l'expert ne prouverait rien.
 * On REJOUE donc la règle déterministe en local, hors production, sur les
 * groupes stockés dans `raw_text`.
 *
 * ⚠️ LA RÈGLE EST IMPORTÉE, JAMAIS RECOPIÉE — une copie mesurerait autre chose
 * que ce qui part en production (leçon du banc de re-classement, 11/09, et du
 * script d'aperçu d'e-mail, 11/09).
 *
 * ⚠️ CE QUE CE BANC NE COUVRE PAS, ET IL FAUT LE SAVOIR : il rejoue le MONTANT
 * (`computeServerSurcout`), pas le verdict complet — celui-ci dépend d'un appel
 * Gemini qu'on ne va pas refaire 55 fois. Le montant est la partie déterministe,
 * celle que l'expert a le plus souvent corrigée (8 remises à zéro sur 36), et
 * celle où un faux positif de rapprochement se voit.
 *
 * Usage : npx tsx scripts/banc-rejeu-decisions-expert.mjs
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { computeServerSurcout } from "../src/lib/analyse/surcoutServeur.ts";
import { memePoste, postesJugesParExpert, postesTranchesApresCoup } from "./memes-postes.mjs";
import { groupesChiffrables } from "./groupes-chiffrables.mjs";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

/** Plancher d'affichage du produit : en dessous, aucun montant ne part à l'écran. */
const PLANCHER = 300;
const eur = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;

const { data: corrections, error } = await supa
  .from("analysis_corrections")
  .select("analysis_id, action, corrected_surcout_max, original_conclusion, corrected_anomalies, expert_notes, reviewed_at")
  .order("reviewed_at", { ascending: false });
if (error) throw new Error(error.message);

const ids = [...new Set(corrections.map((c) => c.analysis_id))];
const { data: analyses } = await supa
  .from("analyses")
  .select("id, file_name, raw_text")
  .in("id", ids);
const parId = new Map((analyses ?? []).map((a) => [a.id, a]));

/**
 * 🔴 2026-09-17 — DEUX SEAUX LÀ OÙ IL N'Y EN AVAIT QU'UN, ET C'EST UNE
 * CORRECTION DE CE BANC, PAS UN RAFFINEMENT.
 *
 * Écrit le 16/09, il comparait deux MONTANTS et concluait « le moteur accuse
 * encore ce que l'expert avait annulé ». Le contrôle du 17/09
 * (`controle-postes-juges.mjs`) montre que c'est faux dans la majorité des cas :
 * sur les 31 postes accusés, **24 (77 %, 19 226 €) n'ont JAMAIS été soumis à
 * l'expert** — il avait annulé un montant ANONYME, produit par le repli
 * supprimé depuis le 05/09 (« aucun montant sans poste nommé »).
 *
 * Confondre les deux rend le compteur inutilisable : il montait quand le moteur
 * se mettait à NOMMER ce qu'il chiffre, c'est-à-dire quand il progressait.
 *
 *   · RÉACCUSE UN POSTE ANNULÉ  → régression vraie, l'expert s'est prononcé
 *     dessus. C'est LE chiffre à faire baisser.
 *   · ACCUSE UN POSTE JAMAIS JUGÉ → dérive à instruire. L'étalon ne dit rien
 *     de ces postes : les compter comme des désaccords serait inventer un
 *     jugement que personne n'a rendu.
 */
const seaux = {
  "🔴 RÉACCUSE un poste que l'expert avait annulé": [],
  "🟡 accuse des postes que l'expert n'a JAMAIS jugés": [],
  "🟢 le moteur a CESSÉ d'accuser (correctif effectif)": [],
  "🟢 accord avec l'expert": [],
  "🟡 écart significatif (à relire)": [],
  "⚪ non rejouable (pas de rapprochement stocké)": [],
};

for (const c of corrections) {
  const a = parId.get(c.analysis_id);
  const etiquette = a?.file_name ?? c.analysis_id.slice(0, 8);

  let r = {};
  try { r = JSON.parse(a?.raw_text ?? "{}"); } catch { /* illisible */ }
  const groupes = groupesChiffrables(r.n8n_price_data);
  const totalHT = Number(r.extracted_data?.totaux?.ht ?? r.extracted?.totaux?.ht ?? 0) || null;

  if (groupes.length === 0) {
    seaux["⚪ non rejouable (pas de rapprochement stocké)"].push({ etiquette });
    continue;
  }

  // ── Ce que le moteur D'AUJOURD'HUI calcule, règle importée ────────────────
  const rejeu = computeServerSurcout(groupes, totalHT);
  const auj = Number(rejeu?.max ?? 0) || 0;

  // ── Ce que l'expert a tranché ─────────────────────────────────────────────
  // `corrected` → sa valeur. `validated` / `rejected` → il a endossé la machine
  // de l'époque, donc c'est `original_conclusion` qui fait foi.
  const original = Number(c.original_conclusion?.surcout_global?.max ?? 0) || 0;
  const expert = c.action === "corrected"
    ? (Number(c.corrected_surcout_max ?? 0) || 0)
    : original;

  // Les postes que l'expert avait réellement sous les yeux, et ceux que le
  // moteur accuse aujourd'hui — c'est leur INTERSECTION qui fait la régression.
  const jugesAlors = postesJugesParExpert(c.original_conclusion);
  const reaccuses = (rejeu?.postes ?? []).filter((p) => jugesAlors.some((n) => memePoste(n, p.label)));

  // 🟢 2026-09-17 — LES POSTES TRANCHÉS APRÈS COUP (sourçage validé par Johan).
  // Ils portent un verdict PAR POSTE, ce que la comparaison de totaux ne sait
  // pas exprimer : « ne pas accuser celui-ci » est vérifiable directement.
  const tranches = postesTranchesApresCoup(c.corrected_anomalies);
  const aTort = [];   // le moteur accuse un poste que l'expert dit NORMAL
  const aRaison = []; // le moteur accuse un poste que l'expert dit SURFACTURÉ
  const manques = []; // l'expert dit surfacturé, le moteur n'accuse pas
  for (const t of tranches) {
    const accuse = (rejeu?.postes ?? []).find((p) => memePoste(t.poste, p.label));
    if (t.verdict === "OK" && accuse) aTort.push({ ...t, ecart: accuse.ecart });
    else if (t.verdict === "ECART" && accuse) aRaison.push({ ...t, ecart: accuse.ecart });
    else if (t.verdict === "ECART" && !accuse) manques.push(t);
  }

  const ligne = {
    etiquette, action: c.action, original, expert, auj, note: c.expert_notes,
    reaccuses, nbPostes: rejeu?.postes?.length ?? 0, jugesAlors,
    aTort, aRaison, manques,
  };

  // Les deux seuils du produit : le plancher d'affichage, et 10 % de tolérance.
  const tolerance = Math.max(PLANCHER, expert * 0.1);

  if (expert === 0 && auj > PLANCHER && reaccuses.length > 0) seaux["🔴 RÉACCUSE un poste que l'expert avait annulé"].push(ligne);
  else if (expert === 0 && auj > PLANCHER)   seaux["🟡 accuse des postes que l'expert n'a JAMAIS jugés"].push(ligne);
  else if (expert === 0 && original > PLANCHER) seaux["🟢 le moteur a CESSÉ d'accuser (correctif effectif)"].push(ligne);
  else if (Math.abs(auj - expert) <= tolerance) seaux["🟢 accord avec l'expert"].push(ligne);
  else                                          seaux["🟡 écart significatif (à relire)"].push(ligne);
}

// ── TÉMOIN — les effectifs se recomposent ────────────────────────────────────
// Six indicateurs faux en trois jours : on ne publie plus un chiffre sans
// vérifier que la ventilation totalise la population.
const total = Object.values(seaux).reduce((n, s) => n + s.length, 0);
console.log(`\n══ TÉMOIN ══`);
console.log(`   ${total === corrections.length ? "✓" : "✗ INCOHÉRENT"} ${corrections.length} décisions d'expert · ${total} classées`);
if (total !== corrections.length) process.exit(1);

console.log(`\n══ LE MOTEUR D'AUJOURD'HUI FACE AUX ${corrections.length} DÉCISIONS D'EXPERT ══\n`);
for (const [nom, liste] of Object.entries(seaux)) {
  console.log(`  ${String(liste.length).padStart(3)}  ${nom}`);
}

const reaccuse = seaux["🔴 RÉACCUSE un poste que l'expert avait annulé"];
if (reaccuse.length > 0) {
  console.log(`\n── 🔴 LE CHIFFRE À FAIRE BAISSER : postes annulés par l'expert, réaccusés aujourd'hui ──`);
  const montantReaccuse = reaccuse.reduce((n, x) => n + x.reaccuses.reduce((m, p) => m + p.ecart, 0), 0);
  console.log(`   ${reaccuse.length} devis · ${reaccuse.reduce((n, x) => n + x.reaccuses.length, 0)} postes · ${eur(montantReaccuse)}`);
  for (const x of reaccuse) {
    console.log(`\n · ${x.etiquette}  [${x.action}]   moteur ${eur(x.auj)} sur ${x.nbPostes} poste(s)`);
    for (const p of x.reaccuses) console.log(`     ↳ ${eur(p.ecart).padStart(9)}  « ${p.label} »  — l'expert l'avait annulé`);
    if (x.note) console.log(`   « ${String(x.note).replace(/\s+/g, " ").slice(0, 190)}… »`);
  }
}

const jamaisJuges = seaux["🟡 accuse des postes que l'expert n'a JAMAIS jugés"];
if (jamaisJuges.length > 0) {
  // ⚠️ CE N'EST PAS UNE RÉGRESSION, ET LE DIRE SERAIT FAUX. L'expert a annulé
  // un montant ANONYME (aucun poste nommé dans la conclusion d'alors) ; le
  // moteur nomme désormais ce qu'il chiffre — c'est l'amélioration du 05/09.
  // Ces postes n'ont jamais été soumis à un humain : ils sont À INSTRUIRE.
  console.log(`\n── 🟡 À INSTRUIRE : postes que l'étalon ne peut PAS trancher ──`);
  console.log(`   L'expert avait annulé un montant sans poste nommé ; ces postes-là, personne ne les a jugés.`);
  for (const x of jamaisJuges) {
    console.log(`   · ${x.etiquette} — ${eur(x.auj)} sur ${x.nbPostes} poste(s)` +
      `${x.jugesAlors.length === 0 ? " (aucune anomalie nommée à l'époque)" : ""}`);
  }
}

// ── 🟢 LE VERDICT PAR POSTE — la mesure la plus directe qu'on ait ───────────
// Un poste tranché dit « accuser » ou « ne pas accuser ». Pas besoin de
// comparer des totaux : on regarde si le moteur fait ce que l'expert a dit.
// C'est cette granularité qui manquait au banc du 16/09 (cf. la correction du
// 17/09 : « il comparait des montants quand l'expert avait jugé des postes »).
const toutes = Object.values(seaux).flat();
const aTort = toutes.flatMap((x) => (x.aTort ?? []).map((t) => ({ ...t, devis: x.etiquette })));
const aRaison = toutes.flatMap((x) => (x.aRaison ?? []).map((t) => ({ ...t, devis: x.etiquette })));
const manques = toutes.flatMap((x) => (x.manques ?? []).map((t) => ({ ...t, devis: x.etiquette })));
const nTranches = aTort.length + aRaison.length + manques.length;

if (nTranches > 0) {
  const montantATort = aTort.reduce((n, t) => n + t.ecart, 0);
  console.log(`\n── 🎯 VERDICT PAR POSTE (postes tranchés par l'expert) ──`);
  console.log(`   ${nTranches} poste(s) tranché(s) · le moteur est d'accord sur ${aRaison.length}`);
  console.log(`   🔴 ACCUSE À TORT : ${aTort.length} poste(s) · ${eur(montantATort)}`);
  console.log(`   🟡 N'ACCUSE PAS alors qu'il le devrait : ${manques.length} poste(s)`);
  if (aTort.length > 0) {
    console.log(`\n   ── ce que le moteur accuse alors que l'expert dit « prix normal » ──`);
    for (const t of aTort.sort((a, b) => b.ecart - a.ecart)) {
      console.log(`   ${eur(t.ecart).padStart(10)}  ${t.poste.slice(0, 46).padEnd(46)} ${String(t.devis).slice(0, 26)}`);
    }
  }
  if (manques.length > 0) {
    console.log(`\n   ── ce que l'expert juge surfacturé et que le moteur laisse passer ──`);
    for (const t of manques) console.log(`   ${t.poste.slice(0, 46).padEnd(46)} ${String(t.devis).slice(0, 26)}`);
  }
}

const gagnes = seaux["🟢 le moteur a CESSÉ d'accuser (correctif effectif)"];
if (gagnes.length > 0) {
  console.log(`\n── CE QUI A ÉTÉ RÉELLEMENT CORRIGÉ DEPUIS ──`);
  for (const x of gagnes) console.log(`   · ${x.etiquette} — ${eur(x.original)} → ${eur(x.auj)}`);
}
