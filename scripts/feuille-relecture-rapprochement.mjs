/**
 * scripts/feuille-relecture-rapprochement.mjs
 *
 * 2026-09-10 — CONSTRUIT LA FEUILLE DE RELECTURE HUMAINE DU RAPPROCHEMENT.
 *
 * Pourquoi ce fichier existe : nous n'avons AUCUNE liste disant « cette ligne de
 * devis correspond à cette entrée du catalogue ». Sans elle, on ne peut pas
 * prouver qu'un changement du rapprochement améliore les choses — on ne peut que
 * l'espérer. Le banc du 10/09 s'en sortait avec un étalon fabriqué par une règle
 * automatique (« l'entrée dont tous les mots figurent dans la ligne »), ce qui
 * suffit pour juger la recherche vectorielle — qui ne connaît pas les mots — mais
 * PAS pour juger un classement qui, lui, s'appuierait dessus : ce serait corriger
 * sa propre copie.
 *
 * D'où une relecture humaine, une fois, qui devient le juge permanent de toutes
 * les évolutions ultérieures du rapprochement.
 *
 * ── Deux choix de conception qui protègent la mesure ──
 *
 * 1. LES FOURCHETTES DU CATALOGUE NE SONT PAS AFFICHÉES. Si le relecteur voit les
 *    prix, il choisira l'entrée dont la fourchette « tombe juste » — c'est
 *    exactement le jugement que le benchmark doit tester plus tard, et l'étalon
 *    serait circulaire. La question posée est « est-ce la même prestation ? »,
 *    pas « est-ce le même prix ? ». Le montant du DEVIS reste affiché, lui : sans
 *    l'ordre de grandeur, impossible de dire si « Plomberie suivant plan » est un
 *    lot complet ou une intervention.
 *
 * 2. UN GROUPE TÉMOIN NON SIGNALÉ. 30 des 150 lignes sont déjà rapprochées en
 *    confiance haute aujourd'hui. Elles servent à détecter les RÉGRESSIONS d'un
 *    futur changement, et elles sont mélangées aux autres pour que le relecteur
 *    ne les traite pas différemment.
 *
 * Sortie : deux fichiers dans le dossier courant —
 *   relecture-rapprochement.csv  (point-virgule + BOM : s'ouvre tel quel dans
 *                                 Excel français comme dans Google Sheets)
 *   relecture-rapprochement.md   (la consigne, en une page)
 *
 * Usage : node scripts/feuille-relecture-rapprochement.mjs [--n 150]
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const CLE = lire("GOOGLE_API_KEY");
const MODELE = "models/gemini-embedding-001";

const TOTAL = Number(process.argv[process.argv.indexOf("--n") + 1]) || 150;
const TEMOINS = Math.round(TOTAL * 0.2);
const CANDIDATS = 5;

const HORS_ZONE = /dangote|sanaga|fcfa|cfa\b|yaound|douala|cameroun|abidjan|dakar|s[ée]n[ée]gal/i;
const NON_TRAVAUX = /^(acompte|solde|remise|escompte|arrhes|total|sous[- ]total|net [àa] payer|tva|prime|aide|subvention|frais de dossier|report|d[ée]duction|avoir)\b/i;
const DESCRIPTION_EST_UN_MONTANT = /^[\d\s.,]+\s*(euros?|€)?$/i;

/** Tirage reproductible : deux exécutions donnent la même feuille. */
function melangeur(graine) {
  let x = graine;
  return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
}

// ── Le stock ────────────────────────────────────────────────────────────────

let debut = 0; const analyses = [];
for (;;) {
  const { data, error } = await supa.from("analyses")
    .select("id,user_id,file_name,raw_text").eq("status", "completed")
    .order("created_at", { ascending: false }).range(debut, debut + 499);
  if (error) throw error;
  analyses.push(...data);
  if (data.length < 500) break;
  debut += 500;
}

const documents = new Set();
const parDescription = new Map();
for (const a of analyses) {
  let brut;
  try { brut = typeof a.raw_text === "string" ? JSON.parse(a.raw_text) : a.raw_text; } catch { continue; }
  const groupes = Array.isArray(brut?.n8n_price_data) ? brut.n8n_price_data : [];
  if (!groupes.length || !groupes.some((g) => g?.vectorial)) continue;
  const texte = groupes.map((g) => (g.devis_lines ?? []).map((l) => l.description ?? "").join(" ")).join(" ");
  if (HORS_ZONE.test(texte) || brut?.extracted?.is_foreign_quote) continue;
  const cle = `${a.user_id}|${(a.file_name ?? "").replace(/\s*\(\d+\)(?=\.[a-z]+$)/i, "")}`;
  if (documents.has(cle)) continue;
  documents.add(cle);
  const travaux = new Map();
  for (const t of brut?.extracted?.travaux ?? []) if (t?.libelle) travaux.set(String(t.libelle).trim(), t);
  for (const g of groupes) {
    const v = g?.vectorial;
    if (!v) continue;
    const desc = String(g.devis_lines?.[0]?.description ?? "").trim();
    if (!desc || desc.length < 4 || NON_TRAVAUX.test(desc) || DESCRIPTION_EST_UN_MONTANT.test(desc)) continue;
    // Une seule occurrence par libellé : sans ça, « Interrupteur simple
    // allumage » consommerait cinq lignes de la feuille pour une seule question.
    const k = desc.toLowerCase().replace(/\s+/g, " ");
    if (parDescription.has(k)) continue;
    const t = travaux.get(desc);
    const cat = t?.categorie ? String(t.categorie).trim() : "";
    const unite = String(t?.unite ?? g.devis_lines?.[0]?.unit ?? g.main_unit ?? "").trim();
    parDescription.set(k, {
      desc, cat, unite,
      qte: g.devis_lines?.[0]?.quantity ?? g.main_quantity ?? null,
      // Le total du groupe est parfois à zéro (ligne d'un lot dont le prix est
      // porté ailleurs) ; le montant de la ligne extraite prend alors le relais.
      // Sans ordre de grandeur, impossible de dire si « Plomberie suivant plan »
      // est un lot complet ou une intervention.
      ht: Number(g.devis_total_ht ?? 0) || Number(g.devis_lines?.[0]?.amount_ht ?? 0)
        || Number(t?.montant ?? 0) || 0,
      confiance: v.confidence,
    });
  }
}
const lignes = [...parDescription.values()];
console.log(`libellés distincts disponibles : ${lignes.length} (sur ${documents.size} documents)`);

// ── Tirage : incertaines + témoins ──────────────────────────────────────────

const alea = melangeur(20260910);
const tirer = (source, n) => {
  const c = [...source];
  for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(alea() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
  return c.slice(0, n);
};
const incertaines = tirer(lignes.filter((l) => l.confiance !== "high"), TOTAL - TEMOINS);
const temoins = tirer(lignes.filter((l) => l.confiance === "high"), TEMOINS);
const echantillon = tirer([...incertaines, ...temoins], TOTAL); // mélangés : le relecteur ne doit pas savoir lesquels sont témoins
console.log(`échantillon : ${incertaines.length} incertaines + ${temoins.length} témoins`);

// ── Les 5 candidats, sur le catalogue d'aujourd'hui ─────────────────────────

async function embarquer(textes, tache) {
  const out = [];
  for (let i = 0; i < textes.length; i += 50) {
    const lot = textes.slice(i, i + 50);
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${MODELE}:batchEmbedContents?key=${CLE}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: lot.map((t) => ({ model: MODELE, content: { parts: [{ text: t }] }, taskType: tache, outputDimensionality: 768 })),
      }),
    });
    if (!r.ok) throw new Error(`Gemini ${r.status} : ${(await r.text()).slice(0, 200)}`);
    out.push(...((await r.json()).embeddings ?? []).map((e) => e.values));
  }
  return out;
}

/** Texte de requête identique à `buildQueryEmbeddingText` en production. */
const requete = (l) => {
  const p = [l.desc.trim()];
  if (l.cat && l.cat.toLowerCase() !== "autre") p.push(`Catégorie : ${l.cat}`);
  if (l.unite) p.push(`Unité : ${l.unite}`);
  return p.join(". ");
};

let d = 0; const catalogue = [];
for (;;) {
  const { data, error } = await supa.from("market_prices").select("job_type,label,unit,embedding").range(d, d + 499);
  if (error) throw error;
  catalogue.push(...data);
  if (data.length < 500) break;
  d += 500;
}
const entrees = catalogue.filter((r) => r.embedding).map((r) => {
  const vec = typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding;
  let n = 0; for (const x of vec) n += x * x;
  return { job_type: r.job_type, label: r.label, unit: r.unit, vec, norme: Math.sqrt(n) };
});
console.log(`catalogue : ${entrees.length} entrées`);

const vecteurs = await embarquer(echantillon.map(requete), "RETRIEVAL_QUERY");
const feuille = echantillon.map((l, i) => {
  const v = vecteurs[i];
  let nq = 0; for (const x of v) nq += x * x; nq = Math.sqrt(nq);
  const scores = entrees.map((r) => {
    let s = 0; for (let k = 0; k < 768; k++) s += v[k] * r.vec[k];
    return { ...r, sim: s / (nq * r.norme) };
  }).sort((a, b) => b.sim - a.sim).slice(0, CANDIDATS);
  return { ...l, candidats: scores };
});

// ── Écriture ────────────────────────────────────────────────────────────────

const propre = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
/**
 * Les descriptions les plus longues sont des fiches produit (jusqu'à 772
 * caractères de coloris, joints et cotes). Les 260 premiers caractères
 * identifient l'ouvrage — « Fenêtre 2 vantaux Haut. 1350 x Larg. 1400 mm » — et
 * le reste ne change rien au choix de l'entrée catalogue. On coupe : une cellule
 * illisible se relit mal, et on veut 150 jugements, pas 150 lectures.
 */
const abrege = (s, max = 260) => (propre(s).length > max ? propre(s).slice(0, max - 1) + "…" : propre(s));
const cellule = (s) => {
  const t = propre(s);
  return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const entetes = [
  "id", "ligne_du_devis", "quantite", "unite", "montant_ht",
  "REPONSE_1a5_ou_0", "commentaire",
  ...Array.from({ length: CANDIDATS }, (_, i) => `candidat_${i + 1}`),
];
const lignesCsv = [entetes.join(";")];
feuille.forEach((l, i) => {
  lignesCsv.push([
    `L${String(i + 1).padStart(3, "0")}`,
    cellule(abrege(l.desc)), cellule(l.qte ?? ""), cellule(l.unite), l.ht ? Math.round(l.ht) : "",
    "", "",
    ...l.candidats.map((c) => cellule(`${c.label} [${c.unit}]`)),
  ].join(";"));
});
// BOM : sans lui, Excel en français affiche « Ã© » à la place des accents.
fs.writeFileSync("relecture-rapprochement.csv", "﻿" + lignesCsv.join("\r\n"), "utf8");

// La correspondance id → entrée catalogue reste de mon côté : elle n'a pas à
// figurer dans la feuille, où elle biaiserait la relecture.
fs.writeFileSync("relecture-rapprochement.cle.json", JSON.stringify(
  feuille.map((l, i) => ({
    id: `L${String(i + 1).padStart(3, "0")}`,
    desc: l.desc, temoin: l.confiance === "high",
    candidats: l.candidats.map((c) => ({ job_type: c.job_type, label: c.label, sim: Number(c.sim.toFixed(4)) })),
  })), null, 1), "utf8");

fs.writeFileSync("relecture-rapprochement.md", `# Relecture du rapprochement — ${TOTAL} lignes

## Ce qu'on vous demande

Pour chaque ligne de devis, **lequel des 5 postes du catalogue est le bon** point
de comparaison ? Écrivez son numéro (**1 à 5**) dans la colonne \`REPONSE_1a5_ou_0\`.

**\`0\` si aucun des cinq ne convient.** C'est une réponse aussi utile que les
autres : elle nous dit qu'il manque une entrée au catalogue.

Si vous hésitez entre deux, prenez le plus proche et dites-le en commentaire.

## La question exacte

> Est-ce que ce poste décrit **la même prestation** que la ligne du devis ?

Pas « est-ce le même prix » — les fourchettes du catalogue ne sont volontairement
pas affichées. Nous voulons savoir si la comparaison a un sens ; c'est l'outil qui
jugera le prix ensuite. Si nous vous montrions les prix, vous choisiriez celui qui
tombe juste, et la mesure ne vaudrait plus rien.

Quelques repères utiles :

- Un tarif **« pose »** ou **« MO »** ne convient pas à une ligne qui fournit
  le matériel, et inversement.
- L'**unité** compte : un tarif au m² ne convient pas à une ligne facturée au
  forfait sans surface.
- Un tarif qui décrit **un composant** ne convient pas à une ligne qui couvre
  **tout un lot** (« réfection totale de l'électricité » n'est pas « tableau
  électrique »).

## Précautions

- **Ne triez pas** le tableau : les identifiants nous servent à recoller les
  réponses.
- Remplissez à votre rythme, l'ordre n'a pas d'importance.
- Une ligne laissée vide sera simplement ignorée — mieux vaut sauter que deviner.

## Ensuite

Ces réponses deviennent le **juge permanent** du rapprochement. Chaque évolution
future — nouvelle règle de classement, entrée ajoutée au catalogue — se mesurera
contre elles, aujourd'hui comme dans un an. C'est un travail qu'on ne fait
qu'une fois.

*Feuille générée le ${new Date().toISOString().slice(0, 10)} sur ${documents.size} devis, catalogue de ${entrees.length} entrées.*
`, "utf8");

console.log("\nrelecture-rapprochement.csv  (la feuille)");
console.log("relecture-rapprochement.md   (la consigne)");
console.log("relecture-rapprochement.cle.json  (correspondance interne — NE PAS transmettre)");
