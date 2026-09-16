/**
 * scripts/banc-perte-phrase-intro.mjs
 *
 * 2026-09-16 — « QU'EST-CE QUE JE PERDS ? », la question qu'un correctif doit
 * se poser AVANT d'être livré.
 *
 * `phraseIntroSansReference` remplace la phrase d'introduction écrite par
 * Gemini sur toutes les analyses dont le moteur ne sait pas chiffrer le devis.
 * Ça ferme les 5 violations mesurées de l'invariant — mais un correctif ne doit
 * PAS défaire ce qu'il ne visait pas (règle du 2026-09-10 : la première version
 * de la promotion lexicale gagnait 9 rapprochements et en perdait 26).
 *
 * Le risque est précis et nommé : le prompt demande à Gemini de mentionner les
 * ALERTES CRITIQUES dans `phrase_intro` (« entreprise radiée des registres
 * officiels »). Si l'une de ces 43 analyses porte une alerte de ce type UNIQUEMENT
 * dans sa phrase d'intro, la remplacer la ferait disparaître de la page.
 *
 * Ce banc lit donc les phrases RÉELLES du stock et compte ce qu'elles portent.
 *
 * Usage : node scripts/banc-perte-phrase-intro.mjs
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { phraseAffirmative } from "./detecteur-affirmation-prix.mjs";
// ⚠️ Import d'un module TypeScript : ce banc se lance avec `npx tsx`, pas `node`.
// On simule la phrase RÉELLE que la production composera, jamais une copie.
import { phraseIntroSansReference } from "../src/lib/analyse/phraseIntroSansReference.ts";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const COUVERTURE_MIN = 5;

/**
 * Ce qu'une phrase d'intro peut porter d'IRREMPLAÇABLE — c'est-à-dire un fait
 * que notre composeur déterministe ne sait pas reconstituer.
 * ⚠️ Le montant et la ville n'en font PAS partie : le composeur les reprend.
 */
const FAITS_CRITIQUES = [
  ["entreprise à risque", /\bradi[ée]|liquidation|cessation|redressement|proc[ée]dure collective|cess[ée] son activit[ée]\b/i],
  ["assurance",          /\bassurance|d[ée]cennale|RC ?Pro\b/i],
  ["acompte",            /\bacompte\b/i],
  ["clause",             /\bclause|r[ée]tractation|p[ée]nalit[ée]\b/i],
  ["paiement suspect",   /\besp[èe]ces|IBAN\b/i],
  ["devis ancien",       /\bdevis (ancien|dat[ée] de)|prix ont pu [ée]voluer|202[0-4]\b/i],
  ["SIRET",              /\bSIRET|SIREN\b/i],
];

/**
 * 🔴 LA COUVERTURE SE RECALCULE, ELLE NE SE LIT PAS.
 *
 * Mon premier jet filtrait sur `conclusion_ia.comparable_coverage_pct` : le
 * champ n'existe pas sur le stock, tout tombait à `undefined`, et le banc a
 * annoncé « 0 analyse concernée · rien à perdre » en ne mesurant RIEN. C'est la
 * quatrième fois en deux jours qu'un indicateur mal écrit fabrique un signal
 * (conjonction APE, contrainte SQL testée contre une clé étrangère, motif
 * d'affirmation sans négation). On reprend donc la dérivation EXACTE du banc de
 * l'invariant : part du montant rapprochée en confiance haute, depuis
 * `raw_text.n8n_price_data`.
 */
function couvertureDuStock(rawText) {
  let r = {};
  try { r = JSON.parse(rawText || "{}"); } catch { return null; }
  const groupes = Array.isArray(r.n8n_price_data) ? r.n8n_price_data : [];
  if (!groupes.some((g) => g?.vectorial)) return null;   // V3.6 legacy : non mesurable
  let total = 0, haute = 0;
  for (const g of groupes) {
    const v = Number(g.devis_total_ht ?? 0) || 0;
    total += v;
    if (g?.vectorial?.confidence === "high") haute += v;
  }
  if (total <= 0) return null;
  return (haute / total) * 100;
}

const { data: analyses, error } = await supa
  .from("analyses")
  .select("id,user_id,file_name,created_at,raw_text,conclusion_ia")
  .eq("status", "completed")
  .not("conclusion_ia", "is", null)
  .order("created_at", { ascending: false });
if (error) throw new Error(error.message);

// Déduplication document (user_id|file_name) — règle de l'observatoire : un
// même PDF redéposé ne compte qu'une fois, sinon on gonfle de ~17 %.
const vus = new Set();
let mesurables = 0;
let incapables = 0;
const porteurs = [];
const compte = Object.fromEntries(FAITS_CRITIQUES.map(([n]) => [n, 0]));
let affirmentEncore = 0;
let sansMontantNiVille = 0;
let bypass = 0;
let orphelinsTotal = 0;
let affirmerontEncore = 0;

for (const a of analyses ?? []) {
  const cle = `${a.user_id}|${a.file_name}`;
  if (vus.has(cle)) continue;
  vus.add(cle);

  let c;
  try { c = JSON.parse(a.conclusion_ia); } catch { continue; }
  if (!c || typeof c !== "object") continue;

  const cov = couvertureDuStock(a.raw_text);
  if (cov === null) continue;                 // analyses V3.6 legacy : non mesurables
  mesurables++;

  const rienDeComparable = cov < COUVERTURE_MIN;
  if (!rienDeComparable) continue;
  incapables++;

  // 🔴 LES CHEMINS D'EXCEPTION NE SONT PAS CONCERNÉS, ET LES COMPTER FAUSSE LA
  // MESURE DANS LE MAUVAIS SENS (elle s'alarme pour rien).
  // `conclusion.ts` sort en avance sur quatre cas (devis étranger, estimation
  // de courtier, devis incomplet, hors-scope) en composant DÉJÀ `phrase_intro`
  // en dur. Ces analyses n'atteignent jamais la ligne que ce correctif modifie.
  if (c.foreign_quote || c.estimation_courtier || c.is_incomplete_quote || c.hors_scope_categorie) {
    bypass++;
    continue;
  }

  const intro = typeof c.phrase_intro === "string" ? c.phrase_intro : "";
  if (phraseAffirmative(intro)) affirmentEncore++;

  // Tout ce que la page affiche PAR AILLEURS. Si le fait s'y trouve aussi,
  // remplacer la phrase d'intro ne le fait pas disparaître.
  const ailleurs = [
    c.verdict_ligne?.resume, c.verdict_ligne?.motif,
    ...(Array.isArray(c.justifications) ? c.justifications : [c.justifications]),
    ...(Array.isArray(c.leviers) ? c.leviers.flatMap((l) => [l?.titre, l?.detail, l?.type]) : []),
    ...(Array.isArray(c.actions_avant_signature) ? c.actions_avant_signature : []),
    ...(Array.isArray(c.anomalies) ? c.anomalies.flatMap((x) => [x?.poste, x?.explication]) : []),
    c.verdict_reasons?.summary,
    ...(Array.isArray(c.verdict_reasons?.reasons) ? c.verdict_reasons.reasons : []),
  ].filter((t) => typeof t === "string").join(" • ");

  const portes = FAITS_CRITIQUES.filter(([, re]) => re.test(intro)).map(([n]) => n);
  for (const n of portes) compte[n]++;
  if (portes.length > 0) {
    // ⚠️ Un fait que LE COMPOSEUR reproduit lui-même n'est pas perdu.
    // L'âge du devis l'était au premier tour de ce banc — c'est précisément ce
    // constat qui a fait ajouter `anneeDevisAncien` au composeur. Le banc doit
    // donc en tenir compte, sinon il continue d'alerter sur un trou rebouché.
    const REPRIS_PAR_LE_COMPOSEUR = new Set(["devis ancien"]);
    const orphelins = FAITS_CRITIQUES
      .filter(([n, re]) =>
        portes.includes(n) && !re.test(ailleurs) && !REPRIS_PAR_LE_COMPOSEUR.has(n))
      .map(([n]) => n);
    if (orphelins.length > 0) orphelinsTotal++;
    porteurs.push({ fichier: a.file_name, cov, portes, orphelins, intro: intro.slice(0, 200) });
  }

  // Le composeur reprend montant + ville. S'ils ne sont nulle part, la phrase
  // sera plus pauvre que celle de Gemini — c'est mesurable aussi.
  if (!/\d/.test(intro)) sansMontantNiVille++;

  // ── APRÈS : la phrase que la production composera réellement ───────────────
  // C'est le seul contrôle qui vaut. Un test unitaire prouve que le composeur
  // se tait sur des faits INVENTÉS ; ici on lui donne les faits RÉELS des 42
  // analyses concernées.
  const nouvelle = phraseIntroSansReference({
    totalHT: Number(c.total_ht ?? c.montant_ht ?? 0) || null,
    ville: "",                       // non rejouable hors production : le composeur s'en passe
    coveragePct: cov,
    aucuneLigneTravaux: false,
    anneeDevisAncien: null,
  });
  if (phraseAffirmative(nouvelle)) affirmerontEncore++;
}

console.log(`\n══ ${mesurables} analyses mesurables · ${incapables} incapables de chiffrer ══`);
console.log(`   dont ${bypass} sur un chemin d'exception (phrase déjà composée en dur) — NON concernées.`);
console.log(`   → ce sont celles dont la phrase d'intro sera désormais composée par nous.\n`);

console.log(`🔴 AVANT — affirment un prix correct aujourd'hui  : ${affirmentEncore}`);
console.log(`✅ APRÈS — affirmeront un prix correct            : ${affirmerontEncore}`);
console.log(`   (phrase rejouée avec les faits RÉELS de chaque analyse, pas une copie)\n`);

console.log("── Ce que ces phrases portent, et que nous devons savoir reconstituer ──");
for (const [nom] of FAITS_CRITIQUES) {
  const n = compte[nom];
  console.log(`   ${String(n).padStart(3)} × ${nom}`);
}
console.log(`\n   ${sansMontantNiVille} phrases ne contiennent aucun chiffre (le composeur, lui, remet le montant).`);

if (porteurs.length > 0) {
  console.log(`\n── ${porteurs.length} analyses portent un fait critique dans leur phrase d'intro ──`);
  for (const p of porteurs.slice(0, 15)) {
    const verdict = p.orphelins.length === 0
      ? "🟢 tout est repris ailleurs"
      : `🔴 PERDU : ${p.orphelins.join(", ")}`;
    console.log(`   · ${p.fichier} — ${p.cov.toFixed(1)} % — [${p.portes.join(", ")}] → ${verdict}`);
    console.log(`     « ${p.intro}… »\n`);
  }
  console.log(orphelinsTotal === 0
    ? "🟢 AUCUN fait critique n'existe UNIQUEMENT dans la phrase d'intro : rien n'est perdu."
    : `🔴 ${orphelinsTotal} analyses perdraient un fait — il faut le porter dans le composeur.`);
} else {
  console.log("\n🟢 AUCUNE de ces phrases ne porte un fait critique : rien à perdre.\n");
}
