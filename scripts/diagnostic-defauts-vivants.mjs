/**
 * scripts/diagnostic-defauts-vivants.mjs
 *
 * 🔍 2026-09-17 — POURQUOI LE MOTEUR ACCUSE-T-IL ENCORE ?
 *
 * `banc-rejeu-decisions-expert.mjs` dit COMBIEN de décisions d'expert le moteur
 * contredit encore (11 sur 55). Il ne dit pas POURQUOI, et sans le pourquoi on
 * en est réduit à supposer — ce que ce projet paie cher à chaque fois.
 *
 * Ce script décompose chaque défaut POSTE PAR POSTE et affiche, pour chacun :
 *   · ce que dit la LIGNE du devis (unité, quantité, montant)
 *   · ce que dit l'entrée CATALOGUE (unité, tarif unitaire, forfait)
 *   · le motif rendu par `motifNonChiffrable` — ou son silence
 *
 * ⚠️ RÈGLE IMPORTÉE, JAMAIS RECOPIÉE. Un diagnostic qui réimplémenterait la
 * garde mesurerait sa copie, pas la production.
 *
 * ⚠️ IL NE MODIFIE RIEN. Lecture seule, hors production.
 *
 * Usage : npx tsx scripts/diagnostic-defauts-vivants.mjs
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  computeServerSurcout,
  motifNonChiffrable,
  bornesMarche,
} from "../src/lib/analyse/surcoutServeur.ts";
import { groupesChiffrables } from "./groupes-chiffrables.mjs";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const PLANCHER = 300;
const eur = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;

const { data: corrections, error } = await supa
  .from("analysis_corrections")
  .select("analysis_id, action, corrected_surcout_max, original_conclusion, expert_notes")
  .order("reviewed_at", { ascending: false });
if (error) throw new Error(error.message);

const ids = [...new Set(corrections.map((c) => c.analysis_id))];
const { data: analyses } = await supa.from("analyses").select("id, file_name, raw_text").in("id", ids);
const parId = new Map((analyses ?? []).map((a) => [a.id, a]));

/** Les mêmes seuils que le banc — sinon on diagnostiquerait une autre population. */
const defauts = [];
const vus = new Set();
for (const c of corrections) {
  const a = parId.get(c.analysis_id);
  let r = {};
  try { r = JSON.parse(a?.raw_text ?? "{}"); } catch { /* illisible */ }
  const groupes = groupesChiffrables(r.n8n_price_data);
  if (groupes.length === 0) continue;

  const totalHT = Number(r.extracted_data?.totaux?.ht ?? r.extracted?.totaux?.ht ?? 0) || null;
  const auj = Number(computeServerSurcout(groupes, totalHT)?.max ?? 0) || 0;
  const original = Number(c.original_conclusion?.surcout_global?.max ?? 0) || 0;
  const expert = c.action === "corrected" ? (Number(c.corrected_surcout_max ?? 0) || 0) : original;

  if (!(expert === 0 && auj > PLANCHER)) continue;
  // Le banc compte les DÉCISIONS ; ici on diagnostique les DEVIS, une fois chacun.
  if (vus.has(c.analysis_id)) continue;
  vus.add(c.analysis_id);

  defauts.push({
    etiquette: a?.file_name ?? c.analysis_id.slice(0, 8),
    action: c.action,
    note: c.expert_notes,
    groupes,
    totalHT,
    auj,
  });
}

console.log(`\n══ ${defauts.length} DEVIS OÙ LE MOTEUR ACCUSE ENCORE — DÉCOMPOSÉS ══`);

/** Compte les causes pour désigner le chantier le plus payant, pas le plus visible. */
const parCause = new Map();

for (const d of defauts) {
  const s = computeServerSurcout(d.groupes, d.totalHT);
  console.log(`\n${"─".repeat(78)}`);
  console.log(`📄 ${d.etiquette}   [${d.action}]   total devis : ${d.totalHT ? eur(d.totalHT) : "inconnu"}`);
  console.log(`   expert : 0 €   ·   moteur : ${eur(s.max)}   (${s.postes.length} poste(s) accusé(s))`);

  // 🔴 ON NE RAPPROCHE PAS LES POSTES PAR LIBELLÉ — plusieurs groupes d'un même
  // devis portent le même (« Charpente fermette industrielle » y figure deux
  // fois). Ma première version le faisait et affichait « devis 948 € · plafond
  // 1 050 € » pour un écart POSITIF : arithmétiquement impossible, donc faux.
  // On passe chaque groupe SEUL à la vraie fonction : la règle reste importée,
  // et l'attribution devient exacte par construction.
  const portes = d.groupes
    .map((g) => ({ g, r: computeServerSurcout([g], d.totalHT) }))
    .filter((x) => x.r.postes.length > 0)
    .sort((a, b) => b.r.postes[0].ecart - a.r.postes[0].ecart);

  for (const { g, r } of portes) {
    const p = r.postes[0];
    const qty = Number(g?.main_quantity) || null;
    const uDevis = String(g?.main_unit ?? "").trim() || "(vide)";
    const prices = Array.isArray(g?.prices) ? g.prices : [];
    const uCata = prices.map((x) => String(x?.unit ?? "").trim() || "(vide)").join(" · ") || "?";
    const unitaire = prices.some((x) => Number(x?.price_max_unit_ht) > 0);
    const forfait = prices.some((x) => Number(x?.fixed_max_ht) > 0);
    const conf = g?.vectorial?.confidence ?? "(pas de méta)";
    const plafond = bornesMarche(prices, qty ?? 1, g?.main_unit).max;
    const motif = motifNonChiffrable(g, d.totalHT);

    console.log(`\n   ▸ ${p.label}  —  ${eur(p.ecart)} d'écart  (×${(p.ratio ?? 0).toFixed(1)})`);
    console.log(`     devis    : ${eur(Number(g?.devis_total_ht) || 0)} · qté ${qty ?? "—"} ${uDevis}`);
    console.log(`     catalogue: plafond ${eur(plafond)} · unité « ${uCata} »` +
      ` · tarif ${unitaire ? "unitaire" : ""}${unitaire && forfait ? "+" : ""}${forfait ? "forfait" : ""}` +
      ` · confiance ${conf}`);
    console.log(`     garde    : ${motif ?? "AUCUNE — le poste est jugé chiffrable"}`);

    // La cause retenue : ce que la garde aurait dû voir.
    const cause = motif
      ? `garde active mais poste compté (${motif})`
      : !unitaire && forfait
        ? "ligne comparée à un FORFAIT catalogue"
        : /^(u|unite|unité|ens|forfait|f|fft|ff)$/i.test(uDevis) || uDevis === "(vide)"
          ? "ligne FORFAITAIRE face à un tarif unitaire NON métrique"
          : "autre";
    parCause.set(cause, (parCause.get(cause) ?? 0) + p.ecart);
  }

  // ⚠️ TÉMOIN — la décomposition doit RECOMPOSER le total, à l'arrondi près
  // (chaque groupe est arrondi séparément ici, le moteur arrondit une fois).
  const sommeDecomposee = portes.reduce((n, x) => n + x.r.postes[0].ecart, 0);
  const derive = Math.abs(sommeDecomposee - s.max);
  if (derive > portes.length + 1) {
    console.log(`\n     ✗ TÉMOIN CASSÉ : décomposition ${eur(sommeDecomposee)} ≠ total ${eur(s.max)} — ce diagnostic est faux, ne pas l'interpréter.`);
    process.exitCode = 1;
  }

  if (s.ecartes.length > 0) {
    console.log(`\n     (déjà écartés par une garde : ${s.ecartes.map((e) => `${e.label} — ${e.motif} — ${eur(e.ecart)}`).join(" | ")})`);
  }
}

console.log(`\n${"═".repeat(78)}`);
console.log(`\n══ CE QUI PORTE LES MONTANTS, PAR CAUSE ══\n`);
for (const [cause, montant] of [...parCause.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`   ${eur(montant).padStart(12)}  ${cause}`);
}
