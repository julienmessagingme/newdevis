/**
 * scripts/banc-unites-discordantes.mjs
 *
 * 🔴 2026-09-17 — LA GARDE D'UNITÉ NE COMPARE PAS LES UNITÉS ENTRE ELLES.
 *
 * Trouvé en préparant le sourcing d'une entrée « muret de clôture » au ml :
 * `hasIncomparableUnit` demande seulement si le tarif catalogue est MÉTRIQUE et
 * si la ligne porte UNE quantité métrique. Elle ne demande jamais si c'est la
 * MÊME. Son code :
 *
 *     const metrique = prices.some(p => p.price_max_unit_ht > 0 && METRIC_UNIT_RE.test(p.unit));
 *     return !(METRIC_UNIT_RE.test(unitDevis) && qty > 0);
 *
 * Donc un tarif au **ml** face à une ligne en **m²** passe : on multiplie un
 * prix au mètre linéaire par une surface. C'est la même famille d'erreur que
 * le cas DESMARIS du 16/09 (« 80 €/ml × 1 Ens »), mais entre deux unités toutes
 * deux métriques — le cas que la garde ne voit pas.
 *
 * ⚠️ AVANT D'Y TOUCHER, IL FAUT SAVOIR CE QUE ÇA PÈSE. Une garde plus large
 * retire des accusations : si elle en retire de justes, elle coûte plus qu'elle
 * ne rapporte (leçon des trois seuils, le 17/09 au matin).
 *
 * Ce banc ne change RIEN. Il compte, sur tout le stock :
 *   · les groupes dont l'unité catalogue et l'unité du devis sont toutes deux
 *     métriques mais DIFFÉRENTES
 *   · le montant d'écart qui en dépend aujourd'hui
 *   · et, parmi eux, ceux qui portent un prix réellement AFFICHÉ
 *
 * Usage : npx tsx scripts/banc-unites-discordantes.mjs
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { computeServerSurcout } from "../src/lib/analyse/surcoutServeur.ts";
import { groupesChiffrables } from "./groupes-chiffrables.mjs";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const eur = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;

/** La MÊME expression que la production, recopiée ici à dessein : ce banc
 *  mesure ce que la garde VOIT, il ne doit pas dépendre d'un export futur. */
const METRIC_UNIT_RE = /^(m2|m²|m3|m³|ml|mètre|metre)/i;

/** Ramène une unité métrique à sa famille : surface, linéaire ou volume. */
function famille(u) {
  const s = String(u ?? "").trim().toLowerCase();
  if (/^(m2|m²)/.test(s)) return "surface";
  if (/^(m3|m³)/.test(s)) return "volume";
  if (/^(ml|mètre|metre|m\b|ml\b)/.test(s)) return "lineaire";
  return null;
}

const { data: analyses, error } = await supa
  .from("analyses")
  .select("id, file_name, raw_text")
  .not("raw_text", "is", null);
if (error) throw new Error(error.message);

let groupesTotal = 0;
const discordants = [];
let temoinConcordants = 0;

for (const a of analyses) {
  let r = {};
  try { r = JSON.parse(a.raw_text ?? "{}"); } catch { continue; }
  const groupes = groupesChiffrables(r.n8n_price_data);
  if (groupes.length === 0) continue;
  const totalHT = Number(r.extracted_data?.totaux?.ht ?? r.extracted?.totaux?.ht ?? 0) || null;

  for (const g of groupes) {
    const prices = Array.isArray(g?.prices) ? g.prices : [];
    const uDevis = String(g?.main_unit ?? "").trim();
    const qty = Number(g?.main_quantity ?? 0);
    if (!METRIC_UNIT_RE.test(uDevis) || !(qty > 0)) continue;

    // L'entrée catalogue qui porte un tarif unitaire métrique.
    const tarif = prices.find((p) => Number(p?.price_max_unit_ht) > 0 && METRIC_UNIT_RE.test(String(p?.unit ?? "").trim()));
    if (!tarif) continue;
    groupesTotal++;

    const fCata = famille(tarif.unit);
    const fDevis = famille(uDevis);
    if (!fCata || !fDevis) continue;
    if (fCata === fDevis) { temoinConcordants++; continue; }

    // L'écart que ce groupe porte AUJOURD'HUI, calculé par la vraie règle.
    const seul = computeServerSurcout([g], totalHT);
    discordants.push({
      fichier: a.file_name,
      label: g.job_type_label ?? g.job_type ?? "(sans nom)",
      uCata: String(tarif.unit).trim(),
      uDevis,
      fCata,
      fDevis,
      qty,
      devis: Number(g?.devis_total_ht) || 0,
      ecart: seul.postes.reduce((n, p) => n + p.ecart, 0),
      confiance: g?.vectorial?.confidence ?? null,
      ecarte: seul.ecartes.length > 0 ? seul.ecartes[0].motif : null,
    });
  }
}

// ── TÉMOIN — le banc doit voir la population CONCORDANTE, sinon il ne mesure rien
console.log(`\n══ TÉMOIN ══`);
console.log(`   ${temoinConcordants > 0 ? "✓" : "✗"} ${temoinConcordants} groupes aux unités CONCORDANTES vus (la mesure porte bien sur une population réelle)`);
if (temoinConcordants === 0) process.exit(1);

const chiffres = discordants.filter((d) => d.ecart > 0);
const montant = chiffres.reduce((n, d) => n + d.ecart, 0);

console.log(`\n══ UNITÉS MÉTRIQUES DISCORDANTES — ce que la garde ne voit pas ══\n`);
console.log(`   ${groupesTotal} groupes comparés à un tarif métrique`);
console.log(`   ${discordants.length} avec des unités de FAMILLES DIFFÉRENTES (${((discordants.length / groupesTotal) * 100).toFixed(1)} %)`);
console.log(`   ${chiffres.length} portent un écart chiffré aujourd'hui · ${eur(montant)}`);

const parPaire = new Map();
for (const d of discordants) {
  const k = `${d.fCata} (catalogue ${d.uCata}) ← ligne ${d.fDevis} (${d.uDevis})`;
  const e = parPaire.get(k) ?? { n: 0, ecart: 0 };
  e.n++; e.ecart += d.ecart;
  parPaire.set(k, e);
}
console.log(`\n   ── par paire d'unités ──`);
for (const [k, v] of [...parPaire.entries()].sort((a, b) => b[1].ecart - a[1].ecart)) {
  console.log(`   ${String(v.n).padStart(4)} groupes · ${eur(v.ecart).padStart(11)}  ${k}`);
}

console.log(`\n   ── les écarts les plus lourds ──`);
for (const d of chiffres.sort((a, b) => b.ecart - a.ecart).slice(0, 12)) {
  console.log(`   ${eur(d.ecart).padStart(10)}  ${d.qty} ${d.uDevis} × tarif/${d.uCata}  ·  ${d.label.slice(0, 42)}`);
  console.log(`              ${String(d.fichier).slice(0, 60)}  (confiance ${d.confiance ?? "—"})`);
}
