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
  .select("analysis_id, action, corrected_surcout_max, original_conclusion, expert_notes, reviewed_at")
  .order("reviewed_at", { ascending: false });
if (error) throw new Error(error.message);

const ids = [...new Set(corrections.map((c) => c.analysis_id))];
const { data: analyses } = await supa
  .from("analyses")
  .select("id, file_name, raw_text")
  .in("id", ids);
const parId = new Map((analyses ?? []).map((a) => [a.id, a]));

const seaux = {
  "🔴 le moteur ACCUSE ENCORE ce que l'expert a annulé": [],
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
  const groupes = Array.isArray(r.n8n_price_data) ? r.n8n_price_data : [];
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

  const ligne = { etiquette, action: c.action, original, expert, auj, note: c.expert_notes };

  // Les deux seuils du produit : le plancher d'affichage, et 10 % de tolérance.
  const tolerance = Math.max(PLANCHER, expert * 0.1);

  if (expert === 0 && auj > PLANCHER)        seaux["🔴 le moteur ACCUSE ENCORE ce que l'expert a annulé"].push(ligne);
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

const encore = seaux["🔴 le moteur ACCUSE ENCORE ce que l'expert a annulé"];
if (encore.length > 0) {
  // 🔴 DEUX SITUATIONS TRÈS DIFFÉRENTES, ET LES CONFONDRE FAUSSERAIT LA PRIORITÉ.
  //   `corrected` → l'expert a annulé un montant, le moteur le refait : défaut
  //                 jamais corrigé.
  //   `validated` / `rejected` → l'expert avait ENDOSSÉ la machine (0 € était
  //                 juste), et le moteur invente un montant depuis : RÉGRESSION
  //                 introduite après la revue. C'est le cas le plus grave, et
  //                 c'est précisément ce que la question de Johan cherchait.
  const jamaisCorrige = encore.filter((x) => x.action === "corrected");
  const regression = encore.filter((x) => x.action !== "corrected");
  console.log(`\n   dont ${jamaisCorrige.length} défaut(s) jamais corrigé(s) · ${regression.length} RÉGRESSION(S) après validation`);

  if (regression.length > 0) {
    console.log(`\n── 🔴 RÉGRESSIONS : l'expert avait endossé « 0 € », le moteur accuse depuis ──`);
    for (const x of regression) {
      console.log(`\n · ${x.etiquette}  [${x.action}]`);
      console.log(`   expert : 0 €   ·   moteur aujourd'hui : ${eur(x.auj)}`);
      if (x.note) console.log(`   « ${String(x.note).replace(/\s+/g, " ").slice(0, 190)}… »`);
    }
  }

  console.log(`\n── 🔴 DÉFAUTS JAMAIS CORRIGÉS — la liste de travail ──`);
  for (const x of jamaisCorrige) {
    console.log(`\n · ${x.etiquette}`);
    console.log(`   expert : 0 €   ·   moteur aujourd'hui : ${eur(x.auj)}   (à l'époque : ${eur(x.original)})`);
    if (x.note) console.log(`   « ${String(x.note).replace(/\s+/g, " ").slice(0, 190)}… »`);
  }
}

const gagnes = seaux["🟢 le moteur a CESSÉ d'accuser (correctif effectif)"];
if (gagnes.length > 0) {
  console.log(`\n── CE QUI A ÉTÉ RÉELLEMENT CORRIGÉ DEPUIS ──`);
  for (const x of gagnes) console.log(`   · ${x.etiquette} — ${eur(x.original)} → ${eur(x.auj)}`);
}
