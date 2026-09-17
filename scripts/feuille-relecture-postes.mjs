/**
 * scripts/feuille-relecture-postes.mjs
 *
 * 🟢 2026-09-17 (demande Johan : « envoie-moi les 7 devis pour que je les valide
 * et qu'on les mette dans le gold standard »).
 *
 * Les 24 postes que le moteur accuse aujourd'hui sur 7 devis n'ont JAMAIS été
 * soumis à un humain : l'expert avait annulé un montant ANONYME, d'avant le
 * correctif du 05/09. L'étalon ne peut donc rien en dire — et inventer sa
 * réponse serait précisément ce que ce projet s'interdit.
 *
 * Ce script produit une feuille de relecture. Les réponses de Johan seront
 * ensuite versées dans `analysis_corrections` : l'étalon GRANDIT au lieu qu'on
 * en devine le contenu.
 *
 * ⚠️ LA FEUILLE NE VA PAS DANS LE DÉPÔT. Elle contient des lignes de devis de
 * clients réels ET les tarifs d'artisans identifiables ; le dépôt est public
 * (même règle que l'étalon de rapprochement du 10/09). Sortie par défaut dans
 * le répertoire temporaire de la session.
 *
 * ⚠️ ON DONNE LE PRIX UNITAIRE, PAS SEULEMENT LE TOTAL. C'est ainsi que
 * l'expert juge — « alu CETAL 250 €/ml OK », « muret 180 €/m² OK » — et un
 * total sans quantité ne se compare à rien.
 *
 * ⚠️ ON NOMME LA LIGNE DU DEVIS, pas notre étiquette catalogue (règle du
 * 10/09) : le relecteur doit voir ce que l'artisan a ÉCRIT, sinon il juge notre
 * hypothèse au lieu du devis.
 *
 * Usage : npx tsx scripts/feuille-relecture-postes.mjs [chemin-de-sortie.md]
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { computeServerSurcout, bornesMarche } from "../src/lib/analyse/surcoutServeur.ts";
import { memePoste, postesJugesParExpert } from "./memes-postes.mjs";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const SORTIE = process.argv[2] ?? "relecture-postes-jamais-juges.md";
const PLANCHER = 300;
const eur = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const eur2 = (n) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €`;

const { data: corrections } = await supa
  .from("analysis_corrections")
  .select("analysis_id, action, corrected_surcout_max, original_conclusion, expert_notes");
const ids = [...new Set(corrections.map((c) => c.analysis_id))];
const { data: analyses } = await supa.from("analyses").select("id, file_name, raw_text").in("id", ids);
const parId = new Map((analyses ?? []).map((a) => [a.id, a]));

const devis = [];
const vus = new Set();

for (const c of corrections) {
  const a = parId.get(c.analysis_id);
  if (!a || vus.has(c.analysis_id)) continue;
  let r = {};
  try { r = JSON.parse(a.raw_text ?? "{}"); } catch { /* illisible */ }
  const groupes = Array.isArray(r.n8n_price_data) ? r.n8n_price_data : [];
  if (groupes.length === 0) continue;

  const totalHT = Number(r.extracted_data?.totaux?.ht ?? r.extracted?.totaux?.ht ?? 0) || null;
  const s = computeServerSurcout(groupes, totalHT);
  const original = Number(c.original_conclusion?.surcout_global?.max ?? 0) || 0;
  const expert = c.action === "corrected" ? (Number(c.corrected_surcout_max ?? 0) || 0) : original;
  if (!(expert === 0 && s.max > PLANCHER)) continue;

  const jugesAlors = postesJugesParExpert(c.original_conclusion);
  // On ne soumet QUE les postes jamais jugés : redemander un avis déjà rendu
  // ferait douter l'expert de sa propre décision.
  const aJuger = s.postes.filter((p) => !jugesAlors.some((n) => memePoste(n, p.label)));
  if (aJuger.length === 0) continue;
  vus.add(c.analysis_id);

  const lignes = aJuger.map((p) => {
    // Chaque groupe est passé SEUL à la vraie fonction : c'est la seule
    // attribution exacte (un rapprochement par libellé se trompe quand deux
    // groupes partagent le même — vu le 17/09).
    const g = groupes.find((x) => computeServerSurcout([x], totalHT).postes.some(
      (q) => q.label === p.label && Math.round(q.ecart) === Math.round(p.ecart),
    ));
    const qty = Number(g?.main_quantity) || null;
    const unite = String(g?.main_unit ?? "").trim();
    const montant = Number(g?.devis_total_ht) || 0;
    const prices = Array.isArray(g?.prices) ? g.prices : [];
    const b = bornesMarche(prices, qty ?? 1, g?.main_unit);
    const desc = (Array.isArray(g?.devis_lines) ? g.devis_lines : [])
      .map((l) => String(l?.description ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    return {
      poste: p.label, ecart: p.ecart, ratio: p.ratio, qty, unite, montant,
      marcheMin: b.min, marcheMax: b.max,
      uCata: prices.map((x) => String(x?.unit ?? "").trim()).filter(Boolean).join(" · "),
      confiance: g?.vectorial?.confidence ?? null,
      descriptions: desc,
    };
  });

  devis.push({
    id: c.analysis_id,
    fichier: a.file_name,
    totalHT,
    total: s.max,
    note: c.expert_notes,
    lignes: lignes.sort((x, y) => y.ecart - x.ecart),
  });
}

devis.sort((a, b) => b.total - a.total);

// ── Rédaction ────────────────────────────────────────────────────────────────
const out = [];
out.push(`# Relecture — ${devis.reduce((n, d) => n + d.lignes.length, 0)} postes que personne n'a encore jugés`);
out.push(``);
out.push(`> Ces postes sont accusés par le moteur **aujourd'hui**. Lors de la revue d'origine,`);
out.push(`> la conclusion n'affichait qu'un montant **sans aucun poste nommé** — vous aviez donc`);
out.push(`> annulé un chiffre, pas ces lignes-là. L'étalon ne peut rien en dire tant que vous`);
out.push(`> ne les avez pas tranchées.`);
out.push(``);
out.push(`**Pour chaque poste, une seule question :** le prix facturé est-il justifié, ou l'écart`);
out.push(`est-il réel ? Répondez dans la colonne \`VERDICT\` par **OK** (prix normal, retirer`);
out.push(`l'accusation) ou **ÉCART** (l'écart est réel, le moteur a raison), et ajoutez un mot`);
out.push(`sur le pourquoi — c'est le pourquoi qui nous servira à corriger.`);
out.push(``);
out.push(`⚠️ **Le prix unitaire est le chiffre à regarder**, pas le total : c'est lui qui se compare.`);
out.push(``);
out.push(`---`);

for (const d of devis) {
  out.push(``);
  out.push(`## ${d.fichier}`);
  out.push(``);
  out.push(`Devis **${d.totalHT ? eur(d.totalHT) : "montant inconnu"}** · le moteur annonce **${eur(d.total)}** d'écart sur ${d.lignes.length} poste(s).`);
  if (d.note) {
    out.push(``);
    out.push(`<details><summary>Votre note de l'époque</summary>`);
    out.push(``);
    out.push(`> ${String(d.note).replace(/\s+/g, " ")}`);
    out.push(``);
    out.push(`</details>`);
  }

  for (const l of d.lignes) {
    const puDevis = l.qty && l.qty > 0 ? l.montant / l.qty : null;
    const puMin = l.qty && l.qty > 0 ? l.marcheMin / l.qty : null;
    const puMax = l.qty && l.qty > 0 ? l.marcheMax / l.qty : null;
    out.push(``);
    out.push(`### ${l.poste} — écart annoncé ${eur(l.ecart)}`);
    out.push(``);
    out.push(`| | facturé | notre référence |`);
    out.push(`|---|---|---|`);
    out.push(`| **prix unitaire** | ${puDevis !== null ? `**${eur2(puDevis)}** / ${l.unite || "?"}` : "—"} | ${puMin !== null ? `${eur2(puMin)} à **${eur2(puMax)}**` : "—"} |`);
    out.push(`| total | ${eur(l.montant)} | ${eur(l.marcheMin)} à ${eur(l.marcheMax)} |`);
    out.push(`| quantité | ${l.qty ?? "—"} ${l.unite} | unité catalogue : ${l.uCata || "?"} |`);
    out.push(`| dépassement | ×${(l.ratio ?? 0).toFixed(2)} du plafond | confiance du rapprochement : ${l.confiance ?? "—"} |`);
    out.push(``);
    if (l.descriptions.length > 0) {
      out.push(`**Ce que le devis écrit :**`);
      for (const t of l.descriptions.slice(0, 4)) out.push(`- ${t.slice(0, 220)}`);
      if (l.descriptions.length > 4) out.push(`- _(+ ${l.descriptions.length - 4} autre(s) ligne(s))_`);
      out.push(``);
    }
    out.push(`> **VERDICT :** \`[ OK / ÉCART ]\`  ·  **pourquoi :** _______________________________`);
  }
  out.push(``);
  out.push(`---`);
}

fs.writeFileSync(SORTIE, out.join("\n"), "utf8");
console.log(`✓ ${devis.length} devis · ${devis.reduce((n, d) => n + d.lignes.length, 0)} postes → ${SORTIE}`);
