/**
 * Diagnostic « grands postes vs lignes » du catalogue market_prices.
 *
 * Question posée (Johan, 2026-08-30) : le catalogue mélange-t-il des entrées
 * qui chiffrent un CHANTIER ENTIER (« Rénovation cuisine complète », 14 000 à
 * 48 000 €) avec des entrées qui chiffrent UNE LIGNE de devis (« Pose
 * mitigeur ») ? Si oui, la recherche vectorielle les met en concurrence à
 * chaque ligne, et un petit poste peut se retrouver comparé à un budget de
 * chantier — un faux surcoût par construction.
 *
 * Le script ne modifie RIEN. Il produit :
 *   1. une classification heuristique des 919 entrées (poste_global / ligne) ;
 *   2. la mesure du coût réel du mélange sur le stock d'analyses : combien de
 *      lignes de devis ont été rapprochées d'un grand poste, et pour quel
 *      montant.
 *
 * Usage : node scripts/diagnostic-grands-postes.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");
const SB_URL = get("PUBLIC_SUPABASE_URL") || get("SUPABASE_URL");
const KEY = get("SUPABASE_SERVICE_ROLE_KEY");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const FOREIGN = /dangote|sanaga|fcfa|cfa\b|yaound|douala|cameroun|abidjan|dakar/i;

// ── Classification ──────────────────────────────────────────────────────────
// Un « grand poste » chiffre un chantier ou un lot entier. Trois signaux, du
// plus fiable au plus indicatif. On garde la raison pour que la liste soit
// relisible à la main — c'est un diagnostic, pas une vérité.
const LIB_CHANTIER = /r[ée]novation (compl[èe]te|totale|globale)|r[ée]habilitation compl[èe]te|installation [ée]lectrique compl[èe]te|r[ée]fection [ée]lectrique compl[èe]te|mise aux normes [ée]lectrique logement|cl[ée] en main|maison compl[èe]te|appartement (entier|complet)|extension |sur[ée]l[ée]vation |cr[ée]ation (d'une )?pi[èe]ce|logement complet|installation compl[èe]te d'un logement/i;
// « lot complet » de robinets, « pack diagnostics » : ce sont des LIGNES.
const FAUX_AMIS = /lot complet\)|pack |kit |coffret |\(modules\)|thermostatiques/i;

function classer(row) {
  const label = row.label ?? "";
  const fixedMin = Number(row.fixed_min_ht ?? 0);
  const fixedMax = Number(row.fixed_max_ht ?? 0);
  if (FAUX_AMIS.test(label)) return { niveau: "ligne", raison: "faux ami (lot/pack/kit = une ligne)" };
  if (LIB_CHANTIER.test(label)) return { niveau: "poste_global", raison: "libellé de chantier entier" };
  // ⚠️ Le MONTANT n'est PAS un critère de classement. Une pompe à chaleur
  // air/air à 3 500 €, une climatisation gainable ou une micro-station sont
  // des LIGNES chères, pas des chantiers. La première version de ce script
  // classait tout forfait ≥ 3 000 € en « grand poste » : 9 % du montant
  // ressortait en suspect, presque uniquement des faux positifs de ce type —
  // mesure inexploitable. Seul le LIBELLÉ dit si l'entrée chiffre un chantier
  // entier ou une prestation.
  if (/(r[ée]novation|cr[ée]ation|am[ée]nagement)\s+(compl[èe]te\s+)?(d'une?\s+|de\s+la\s+)?(cuisine|salle\s+de\s+bain|maison|appartement|studio|logement)/i.test(label)) {
    return { niveau: "poste_global", raison: "chantier d'une pièce ou d'un logement entier" };
  }
  void fixedMin; void fixedMax;
  return { niveau: "ligne", raison: "" };
}

const fmt = (n) => Math.round(n).toLocaleString("fr-FR");

(async () => {
  const cat = await (
    await fetch(
      `${SB_URL}/rest/v1/market_prices?select=job_type,label,unit,fixed_min_ht,fixed_max_ht,price_min_unit_ht,price_max_unit_ht,metier&limit=2000`,
      { headers: H },
    )
  ).json();

  const parJobType = new Map();
  const globaux = [];
  for (const r of cat) {
    const c = classer(r);
    parJobType.set(r.job_type, { ...r, ...c });
    if (c.niveau === "poste_global") globaux.push({ ...r, ...c });
  }
  console.log(`catalogue : ${cat.length} entrées · ${globaux.length} classées « grand poste » (${Math.round((100 * globaux.length) / cat.length)} %)\n`);

  // ── Coût réel du mélange sur le stock ────────────────────────────────────
  const analyses = await (
    await fetch(
      `${SB_URL}/rest/v1/analyses?select=file_name,raw_text&status=eq.completed&order=created_at.desc&limit=250`,
      { headers: H },
    )
  ).json();

  let nLignes = 0, htTotal = 0;
  let nSurGlobal = 0, htSurGlobal = 0;
  const suspects = [];

  for (const a of analyses) {
    let raw;
    try { raw = JSON.parse(a.raw_text || "{}"); } catch { continue; }
    const pd = raw.n8n_price_data;
    if (!Array.isArray(pd) || pd.length === 0) continue;
    const txt = pd.map((g) => (g.devis_lines ?? []).map((l) => l.description ?? "").join(" ")).join(" ");
    if (FOREIGN.test(txt)) continue;

    const totalDevis = pd.reduce((s, g) => s + (Number(g.devis_total_ht) || 0), 0);
    if (totalDevis <= 0) continue;

    for (const g of pd) {
      const v = g.vectorial;
      if (!v || v.confidence === "no_match") continue;
      const ht = Number(g.devis_total_ht) || 0;
      nLignes++; htTotal += ht;

      // Le job_type retenu n'est pas stocké tel quel : on retrouve l'entrée par
      // son libellé, qui l'est.
      const entree = [...parJobType.values()].find((e) => e.label === g.job_type_label);
      if (!entree || entree.niveau !== "poste_global") continue;

      nSurGlobal++; htSurGlobal += ht;
      // Suspect = une LIGNE parmi d'autres rapprochée d'un chantier entier.
      const part = ht / totalDevis;
      if (pd.length >= 5 && part < 0.5) {
        suspects.push({
          ht, part,
          desc: String(g.devis_lines?.[0]?.description ?? "").replace(/\n/g, " ").slice(0, 60),
          label: entree.label,
          raison: entree.raison,
          conf: v.confidence,
          fichier: a.file_name,
        });
      }
    }
  }

  const pc = (x) => (htTotal ? `${Math.round((100 * x) / htTotal)} %` : "—");
  console.log(`stock : ${nLignes} lignes rapprochées · ${fmt(htTotal)} €`);
  console.log(`  rapprochées sur un GRAND POSTE : ${nSurGlobal} lignes · ${fmt(htSurGlobal)} € (${pc(htSurGlobal)})`);
  console.log(`  dont SUSPECTES (une ligne parmi ≥5, < 50 % du devis) : ${suspects.length} · ${fmt(suspects.reduce((s, x) => s + x.ht, 0))} €\n`);

  suspects.sort((a, b) => b.ht - a.ht);
  console.log("top 15 des rapprochements suspects :");
  for (const s of suspects.slice(0, 15)) {
    console.log(`  ${String(fmt(s.ht)).padStart(7)} € (${Math.round(s.part * 100)} % du devis) [${s.conf}]`);
    console.log(`      "${s.desc}"`);
    console.log(`      → ${s.label}  (${s.raison})`);
  }

  // ── Rapport ──────────────────────────────────────────────────────────────
  const rapport = [
    `# Diagnostic « grands postes vs lignes » — ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `Le catalogue mélange-t-il des entrées qui chiffrent un chantier entier avec`,
    `des entrées qui chiffrent une ligne de devis ? Si oui, la recherche`,
    `vectorielle les met en concurrence à chaque ligne.`,
    ``,
    `## Mesure`,
    ``,
    `- Catalogue : **${cat.length} entrées**, dont **${globaux.length} classées « grand poste »** (${Math.round((100 * globaux.length) / cat.length)} %).`,
    `- Stock : ${nLignes} lignes rapprochées (${fmt(htTotal)} €), dont **${nSurGlobal} sur un grand poste** (${fmt(htSurGlobal)} €, ${pc(htSurGlobal)} du montant).`,
    `- Dont **${suspects.length} suspectes** — une ligne parmi au moins 5, pesant moins de la moitié du devis, rapprochée d'un chantier entier : ${fmt(suspects.reduce((s, x) => s + x.ht, 0))} €.`,
    ``,
    `## Rapprochements suspects (top 30)`,
    ``,
    `| Montant | Part du devis | Confiance | Ligne du devis | Rapprochée à |`,
    `|---|---|---|---|---|`,
    ...suspects.slice(0, 30).map((s) =>
      `| ${fmt(s.ht)} € | ${Math.round(s.part * 100)} % | ${s.conf} | ${s.desc} | ${s.label} |`),
    ``,
    `## Entrées classées « grand poste » (à relire)`,
    ``,
    `| Libellé | Tarif | Motif de classement |`,
    `|---|---|---|`,
    ...globaux
      .sort((a, b) => (Number(b.fixed_max_ht) || 0) - (Number(a.fixed_max_ht) || 0))
      .map((g) => {
        const tarif = Number(g.price_max_unit_ht) > 0
          ? `${g.price_min_unit_ht}-${g.price_max_unit_ht} €/${g.unit}`
          : `forfait ${fmt(g.fixed_min_ht)}-${fmt(g.fixed_max_ht)} €`;
        return `| ${g.label} | ${tarif} | ${g.raison} |`;
      }),
    ``,
  ].join("\n");

  const out = "docs/refonte/DIAGNOSTIC-GRANDS-POSTES.md";
  writeFileSync(out, rapport);
  console.log(`\nrapport écrit dans ${out}`);
})();
