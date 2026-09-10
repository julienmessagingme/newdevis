/**
 * scripts/postes-non-verifiables.mjs
 *
 * 2026-09-10 (demande Johan) — CLASSEMENT DES POSTES « PRIX NON VÉRIFIABLE »
 * PAR MONTANT CUMULÉ.
 *
 * Depuis l'alignement des trois affichages sur `referenceOpposable`, un poste
 * que le matcher n'a pas rapproché en confiance haute n'affiche plus ni
 * fourchette ni verdict : il porte « Prix non vérifiable ». Ce que le catalogue
 * ne couvre pas est donc devenu visible par l'utilisateur — et prioriser son
 * enrichissement devient une décision produit, qui a besoin d'un chiffre.
 *
 * Le script répond à : « sur quelles familles de prestations perdons-nous le
 * plus d'argent analysé, et donc lesquelles sourcer en premier ? »
 *
 * Deux axes, parce que ce ne sont pas les mêmes travaux :
 *   A. RAPPROCHEMENTS MANQUÉS (confiance moyenne/faible) — le matcher a visé
 *      une entrée du catalogue sans l'atteindre. On regroupe par l'entrée
 *      visée : c'est elle qu'il faut décliner, élargir, ou dont il faut
 *      corriger le libellé.
 *   B. TROUS FRANCS (aucun candidat) — rien dans le catalogue n'en approche.
 *      On regroupe par le mot de métier dominant de la ligne du devis.
 *
 * ⚠️ Deux précautions de mesure, toutes deux apprises à nos dépens :
 *   - un même PDF redéposé crée autant d'analyses que de dépôts (mesuré à
 *     +17 % sur l'observatoire) → déduplication par `user_id|file_name` ;
 *   - les devis hors zone euro faussent tous les montants → écartés.
 *
 * Usage : node scripts/postes-non-verifiables.mjs [--tout] [--md <fichier>]
 *   --tout : n'applique pas le seuil de récurrence (tout sort, même isolé)
 *   --md   : écrit le classement en Markdown dans le fichier indiqué
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(get("PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const TOUT = process.argv.includes("--tout");
const MD_PATH = process.argv.includes("--md")
  ? process.argv[process.argv.indexOf("--md") + 1]
  : null;

// Devis hors zone euro non détectés par `is_foreign_quote` — leurs montants
// (FCFA notamment) écraseraient tout le classement.
const HORS_ZONE_RE = /dangote|sanaga|fcfa|cfa\b|yaound|douala|cameroun|abidjan|dakar|s[ée]n[ée]gal/i;

// Lignes qui ne sont pas des travaux : leur absence du catalogue est normale et
// ne se corrige pas en sourçant une fourchette.
const NON_TRAVAUX_RE =
  /^(acompte|solde|remise|escompte|arrhes|total|sous[- ]total|net [àa] payer|tva|prime|aide|subvention|frais de dossier|reste [àa]|report|d[ée]duction|avoir)\b/i;

/**
 * Lignes dont la DESCRIPTION est le montant lui-même (« 35 000 euro »). Aucun
 * catalogue ne les couvrira jamais : c'est l'extraction qui a échoué. Les
 * laisser dans le classement gonflerait le trou à combler d'un tiers.
 */
const DESCRIPTION_EST_UN_MONTANT = /^[\d\s.,]+\s*(euros?|€)?$/i;

/**
 * Mots qui décrivent l'ACTE, le contenant ou la cote — jamais la prestation.
 * Ils ne peuvent pas nommer une famille de travaux.
 */
const MOTS_VIDES = new Set([
  // actes
  "fourniture", "fournitures", "fourni", "fournie", "fournies", "fournis", "fourn", "pose",
  "posee", "posees", "poses", "mise", "oeuvre", "place", "service", "installation", "installer",
  "realisation", "realiser", "remplacement", "remplacer", "depose", "deposer", "demontage",
  "montage", "prestation", "prestations", "travaux", "forfait", "ensemble", "divers", "unite",
  "comprenant", "comprend", "comprends", "compris", "inclus", "suivant", "selon", "plan",
  "plans", "type", "neuf", "neuve", "existant", "existante", "complet", "complete", "option",
  "options", "supplement", "main", "hors", "notre", "votre", "charge", "client", "necessaire",
  // cotes, références, unités — omniprésentes dans les devis de menuiserie
  "haut", "hauteur", "larg", "largeur", "long", "longueur", "prof", "profondeur", "epaisseur",
  "dim", "dimension", "dimensions", "tableau" /* « dim. tableaux » */, "dormant", "coul",
  "coloris", "couleur", "teinte", "marque", "modele", "gamme", "serie", "reference", "ref",
  "euro", "euros", "piece", "pieces", "niveau", "base", "couche", "couches", "environ",
  // grammaire
  "de", "du", "des", "la", "le", "les", "un", "une", "et", "ou", "au", "aux", "en", "sur",
  "sous", "pour", "par", "avec", "sans", "dans", "cette", "ces", "leur", "tout", "tous",
  "toute", "toutes", "meme", "autre", "autres", "ainsi", "que", "qui", "est", "sont",
]);

/**
 * ⚠️ L'apostrophe se COUPE, elle ne se garde pas : sans ça « d'un » et « d'une »
 * survivent au filtre et deviennent les familles les plus lourdes du classement
 * — c'est ce qu'a donné le premier jet.
 */
const normaliser = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\d.,]+\s*(m2|m²|ml|mm|cm|kg|t|€|w|kw|kwc|va|x)?/g, " ")
    .replace(/['’]/g, " ")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const eur = (n) => Math.round(n).toLocaleString("fr-FR") + " €";

// ── Collecte ────────────────────────────────────────────────────────────────

let from = 0;
const analyses = [];
for (;;) {
  const { data, error } = await supa
    .from("analyses")
    .select("id,user_id,file_name,created_at,raw_text")
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .range(from, from + 499);
  if (error) throw error;
  analyses.push(...data);
  if (data.length < 500) break;
  from += 500;
}

const documentsVus = new Set();
const lignes = []; // { desc, ht, conf, cible, analyseId }
const descriptionsCassees = []; // défauts d'extraction, écartés du classement
let vectorielles = 0, horsZone = 0, redepots = 0, htTotal = 0, htNonVerifiable = 0, nonTravaux = 0;

for (const a of analyses) {
  let raw;
  try { raw = typeof a.raw_text === "string" ? JSON.parse(a.raw_text) : a.raw_text; } catch { continue; }
  const pd = raw?.n8n_price_data;
  if (!Array.isArray(pd) || pd.length === 0) continue;
  // Sans méta vectorielle, la notion de confiance n'existe pas (pipeline V3.6).
  if (!pd.some((g) => g?.vectorial)) continue;

  const texte = pd.map((g) => (g.devis_lines ?? []).map((l) => l.description ?? "").join(" ")).join(" ");
  if (HORS_ZONE_RE.test(texte) || raw?.extracted?.is_foreign_quote) { horsZone++; continue; }

  const cleDocument = `${a.user_id}|${(a.file_name ?? "").replace(/\s*\(\d+\)(?=\.[a-z]+$)/i, "")}`;
  if (documentsVus.has(cleDocument)) { redepots++; continue; }
  documentsVus.add(cleDocument);
  vectorielles++;

  for (const g of pd) {
    const ht = typeof g.devis_total_ht === "number" ? g.devis_total_ht : 0;
    htTotal += ht;
    const conf = g?.vectorial?.confidence;
    if (!conf || conf === "high") continue;
    htNonVerifiable += ht;

    const desc = String(g.devis_lines?.[0]?.description ?? "").trim()
      || String(g.job_type_label ?? "").trim();
    if (!desc || desc.length < 4) continue;
    if (NON_TRAVAUX_RE.test(desc)) { nonTravaux++; continue; }
    if (DESCRIPTION_EST_UN_MONTANT.test(desc)) {
      descriptionsCassees.push({ desc, ht, fichier: a.file_name ?? "?" });
      continue;
    }

    lignes.push({
      desc,
      ht,
      conf,
      // L'entrée que le matcher a visée — absente sur un no_match.
      cible: conf === "no_match" ? null : (g.vectorial?.all_candidates?.[0]?.label ?? g.job_type_label ?? null),
      analyseId: a.id,
    });
  }
}

// ── Axe A — rapprochements manqués, regroupés par entrée catalogue visée ─────

const parCible = new Map();
for (const l of lignes) {
  if (!l.cible) continue;
  const f = parCible.get(l.cible) ?? { ht: 0, n: 0, devis: new Set(), ex: [], confs: {} };
  f.ht += l.ht; f.n++; f.devis.add(l.analyseId);
  f.confs[l.conf] = (f.confs[l.conf] ?? 0) + 1;
  if (f.ex.length < 3) f.ex.push(l.desc.slice(0, 62));
  parCible.set(l.cible, f);
}

// ── Axe B — trous francs : où est l'argent, ligne par ligne ─────────────────
//
// ⚠️ PAS DE REGROUPEMENT ICI, ET C'EST DÉLIBÉRÉ. Un premier jet regroupait ces
// lignes par leur mot de métier dominant : le résultat titrait des familles
// « bois », « angle », « nettoyage », « blanc » dont les lignes d'exemple
// n'avaient rien à voir entre elles. Ces descriptions sont du texte libre de
// catalogue fabricant (références, cotes, coloris) ; aucun mot isolé ne les
// range. Publier ce classement-là aurait été inventer une structure pour avoir
// quelque chose à montrer.
//
// Ce que les données SAVENT dire, en revanche : la répartition des montants et
// les plus grosses lignes, à examiner une par une.

const sansCandidat = lignes.filter((l) => !l.cible);
const tranches = { petites: { ht: 0, n: 0 }, moyennes: { ht: 0, n: 0 }, grosses: { ht: 0, n: 0 } };
for (const l of sansCandidat) {
  const t = l.ht < 500 ? "petites" : l.ht < 2000 ? "moyennes" : "grosses";
  tranches[t].ht += l.ht; tranches[t].n++;
}
const plusGrosses = [...sansCandidat].sort((a, b) => b.ht - a.ht).slice(0, 20);


// ── Restitution ─────────────────────────────────────────────────────────────

const trier = (map) =>
  [...map.entries()]
    .map(([k, f]) => ({ k, ht: Math.round(f.ht), n: f.n, devis: f.devis.size, ex: f.ex, confs: f.confs }))
    .filter((f) => TOUT || f.devis >= 2 || f.ht >= 2000)
    .sort((a, b) => b.ht - a.ht);

const axeA = trier(parCible);

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);
const lignesA = lignes.filter((l) => l.cible).reduce((s, l) => s + l.ht, 0);
const lignesB = sansCandidat.reduce((s, l) => s + l.ht, 0);

const out = [];
const dire = (s = "") => { out.push(s); console.log(s); };

dire(`Documents analysés (dédupliqués) : ${vectorielles}`);
dire(`  redépôts écartés : ${redepots} · devis hors zone euro écartés : ${horsZone}`);
dire(`  lignes financières écartées (acompte, remise, TVA…) : ${nonTravaux}`);
dire("");
dire(`Montant HT passé au rapprochement : ${eur(htTotal)}`);
dire(`  dont NON vérifiable : ${eur(htNonVerifiable)} (${pct(htNonVerifiable, htTotal)} %)`);
dire(`    · rapprochement manqué (confiance moyenne/faible) : ${eur(lignesA)}`);
dire(`    · aucun candidat au catalogue : ${eur(lignesB)}`);
dire("");

dire("═══ AXE A — entrées du catalogue visées sans être atteintes ═══");
dire("(le matcher a trouvé cette entrée, sans confiance suffisante : à décliner ou élargir)");
dire("");
for (const f of axeA.slice(0, 25)) {
  dire(`${String(eur(f.ht)).padStart(12)} · ${String(f.devis).padStart(2)} devis · ${String(f.n).padStart(3)} lignes · ${JSON.stringify(f.confs)}`);
  dire(`             → « ${f.k} »`);
  dire(`             ex. ${f.ex.join(" | ")}`);
}
dire("");
dire("═══ AXE B — aucune entrée approchante (trous francs) ═══");
dire(`${eur(lignesB)} sur ${sansCandidat.length} lignes. Aucun regroupement : ces descriptions`);
dire("sont du texte libre de catalogue fabricant, aucun mot isolé ne les range.");
dire("");
dire("Répartition — c'est elle qui dit s'il y a quelque chose à sourcer :");
for (const [nom, seuil, t] of [
  ["moins de 500 €", "accessoires, quincaillerie, logistique", tranches.petites],
  ["500 à 2 000 €", "petits ouvrages", tranches.moyennes],
  ["plus de 2 000 €", "vrais postes — à examiner un par un", tranches.grosses],
]) {
  dire(`  ${nom.padEnd(16)} ${String(eur(t.ht)).padStart(11)} · ${String(t.n).padStart(3)} lignes (${pct(t.ht, lignesB)} % du montant) — ${seuil}`);
}
dire("");
dire("Les 20 plus grosses lignes sans aucun candidat :");
for (const l of plusGrosses) {
  dire(`  ${String(eur(l.ht)).padStart(11)} · ${l.desc.replace(/\s+/g, " ").slice(0, 88)}`);
}

if (descriptionsCassees.length > 0) {
  dire("");
  dire("⚠️ ÉCARTÉ DU CLASSEMENT — défaut d'extraction, pas un trou de catalogue :");
  dire(`   ${descriptionsCassees.length} ligne(s) dont la description EST le montant, pour ${eur(descriptionsCassees.reduce((s, l) => s + l.ht, 0))}.`);
  for (const l of descriptionsCassees.slice(0, 8)) dire(`   « ${l.desc.trim()} » → ${eur(l.ht)}   [${l.fichier.slice(0, 40)}]`);
}

if (MD_PATH) {
  const tableau = (titre, rows) =>
    [`## ${titre}`, "", "| Montant cumulé HT | Devis | Lignes | Famille | Exemples de lignes |", "|---:|---:|---:|---|---|",
     ...rows.slice(0, 25).map((f) => `| ${eur(f.ht)} | ${f.devis} | ${f.n} | ${f.k} | ${f.ex.join(" · ")} |`), ""].join("\n");
  writeFileSync(MD_PATH,
    [`# Postes « Prix non vérifiable » — classement par montant cumulé`, "",
     `Généré le ${new Date().toISOString().slice(0, 10)} sur ${vectorielles} documents dédupliqués.`,
     `Montant non vérifiable : **${eur(htNonVerifiable)}** sur ${eur(htTotal)} rapprochés (${pct(htNonVerifiable, htTotal)} %).`, "",
     tableau("Axe A — entrées visées sans être atteintes", axeA),
     "## Axe B — aucune entrée approchante", "",
     `${eur(lignesB)} sur ${sansCandidat.length} lignes, non regroupables : ce sont des descriptions`,
     "libres de catalogue fabricant (références, cotes, coloris) qu'aucun mot isolé ne range.",
     "", "| Montant HT | Ligne du devis |", "|---:|---|",
     ...plusGrosses.map((l) => `| ${eur(l.ht)} | ${l.desc.replace(/\s+/g, " ").slice(0, 88)} |`), ""].join("\n"), "utf8");
  console.log(`\nMarkdown écrit : ${MD_PATH}`);
}
