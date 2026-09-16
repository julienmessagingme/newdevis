/**
 * scripts/banc-invariant-affirmation.mjs
 *
 * 2026-09-16 — UN SEUL INVARIANT, TESTÉ SUR TOUT LE STOCK.
 *
 * Depuis le 04/09, huit incidents distincts ont été corrigés un par un. En les
 * relisant, ils disent tous la MÊME phrase : **la page a affirmé quelque chose
 * que le moteur ne savait pas.**
 *
 *   04/09  « dans la norme » sur 0 % de couverture
 *   05/09  un montant sans aucun poste nommé (4 chemins)
 *   10/09  trois affichages en désaccord sur « connaissons-nous ce prix ? »
 *   11/09  un pourcentage de marge sans levier de prix (5ᵉ fuite, dixit le fichier)
 *   15/09  une carte qui accuse sur un poste que le serveur refuse de chiffrer
 *   16/09  « présente un prix cohérent » sur 4,38 % de couverture
 *
 * Chaque correctif a fermé SON chemin. Aucun n'a rendu l'invariant vérifiable.
 * D'où l'impression de tourner en rond : on ne mesure jamais le TAUX DE FUITE,
 * seulement l'incident du jour.
 *
 * Ce banc formule l'invariant une fois et le passe sur tout le stock :
 *
 *   ┌ si le moteur ne sait pas chiffrer ce devis,
 *   └ AUCUN texte de la page ne peut affirmer que le prix est correct.
 *
 * 🔴 TÉMOIN OBLIGATOIRE : des analyses à FORTE couverture doivent pouvoir
 * affirmer sans être comptées en violation — sinon le banc mesure la présence
 * du mot, pas la contradiction.
 *
 * ⚠️ Ce banc N'EST PAS un filtre de plus. Son but est de produire le chiffre
 * qui dit si l'approche « une garde par incident » tient ou non.
 *
 * Usage : node scripts/banc-invariant-affirmation.mjs
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

/** Le seuil du produit (`COUVERTURE_MIN_POUR_AFFIRMER_PCT`, 04/09). */
const COUVERTURE_MIN = 5;

/**
 * Ce qui compte comme AFFIRMER que le prix est correct.
 *
 * ⚠️ Cette liste est volontairement LARGE — elle sert à MESURER, pas à filtrer.
 * C'est précisément parce qu'une liste ne peut pas être exhaustive que le banc
 * existe : si elle trouve déjà des violations, une liste plus fine n'est pas la
 * solution.
 */
const AFFIRME_UN_PRIX =
  /\b(prix|tarifs?|montants?|devis)\b[^.!?]{0,40}\b(coh[ée]rents?|corrects?|justes?|normaux?|conformes?|dans (la|les) (norme|moyenne|fourchettes?)|raisonnables?|align[ée]s?|competitifs?|comp[ée]titifs?|attractifs?|bien plac[ée]s?)\b|\b(coh[ée]rents?|corrects?|conformes?|raisonnables?)\b[^.!?]{0,30}\b(march[ée]|prix|tarifs?)\b|\bau (bon|juste) prix\b|\bpas de surco[ûu]t\b|\brien [àa] redire sur (le|les) prix\b/i;

/**
 * 🔴 UNE NÉGATION N'EST PAS UNE AFFIRMATION — et mon premier jet l'ignorait.
 *
 * « nous ne sommes **pas en mesure** de dire si le prix est juste » contient
 * « prix … juste » : le motif brut y voyait une violation. Il en a compté 19,
 * dont la plupart étaient des phrases qui disent EXACTEMENT ce qu'on veut
 * qu'elles disent. Troisième fois aujourd'hui qu'un indicateur mal écrit
 * fabrique un signal qui n'existe pas.
 *
 * On travaille donc PHRASE PAR PHRASE, et on écarte celle qui porte une
 * marque de négation ou de réserve.
 */
const NEGATION =
  /\b(ne |n'|pas |aucun|sans |impossible|ni |jamais|ne pouvons|pas en mesure|hors d'[ée]tat|faute de|insuffisan|invérifiable|non v[ée]rifiable|ne permet pas|ne dit rien)/i;

function phraseAffirmative(texte) {
  for (const phrase of String(texte).split(/(?<=[.!?])\s+/)) {
    if (!AFFIRME_UN_PRIX.test(phrase)) continue;
    if (NEGATION.test(phrase)) continue;
    return phrase.trim();
  }
  return null;
}

const { data: analyses, error } = await supa
  .from("analyses")
  .select("id,user_id,file_name,created_at,review_status,raw_text,conclusion_ia")
  .eq("status", "completed")
  .not("conclusion_ia", "is", null)
  .order("created_at", { ascending: false });
if (error) throw new Error(error.message);

const vus = new Set();
const docs = [];
for (const a of analyses) {
  const cle = `${a.user_id}|${a.file_name}`;
  if (vus.has(cle)) continue;
  vus.add(cle);

  // ⚠️ `conclusion_ia` est une colonne TEXTE contenant du JSON, jamais un jsonb.
  // La lire comme un objet rend `undefined` partout et le banc mesure 0 en
  // ayant l'air de fonctionner (piège du 15/09).
  let c;
  try {
    c = JSON.parse(a.conclusion_ia);
  } catch {
    continue;
  }
  if (!c || typeof c !== "object") continue;
  let r = {};
  try {
    r = JSON.parse(a.raw_text || "{}");
  } catch { /* le rapprochement peut manquer */ }

  const groupes = Array.isArray(r.n8n_price_data) ? r.n8n_price_data : [];
  let total = 0;
  let haute = 0;
  for (const g of groupes) {
    const v = Number(g.devis_total_ht ?? 0) || 0;
    total += v;
    if (g?.vectorial?.confidence === "high") haute += v;
  }
  // Sans méta vectorielle (analyses V3.6 legacy) la couverture n'est pas
  // calculable : on ne peut rien conclure, on les écarte plutôt que de les
  // compter à tort.
  const mesurable = groupes.some((g) => g?.vectorial);
  if (!mesurable || total <= 0) continue;

  const couverture = (haute / total) * 100;
  const postes = Array.isArray(c.anomalies_postes) ? c.anomalies_postes : [];
  const surcoutMax = Number(c.surcout_global?.max ?? 0) || 0;

  // Tous les textes que la page peut afficher, rassemblés.
  const textes = [
    ["phrase_intro", c.phrase_intro],
    ["verdict_ligne.resume", c.verdict_ligne?.resume],
    ["verdict_ligne.motif", c.verdict_ligne?.motif],
    ...(Array.isArray(c.justifications) ? c.justifications.map((j, i) => [`justification[${i}]`, j]) : []),
    ...(Array.isArray(c.leviers) ? c.leviers.map((l, i) => [`levier[${i}].titre`, l?.titre]) : []),
    ["verdict_reasons.summary", c.verdict_reasons?.summary],
  ].filter(([, t]) => typeof t === "string" && t.trim());

  const affirmations = textes
    .map(([champ, t]) => [champ, t, phraseAffirmative(t)])
    .filter(([, , p]) => p !== null)
    .map(([champ, t, p]) => [champ, t, p]);

  docs.push({
    id: a.id,
    fichier: a.file_name,
    date: a.created_at,
    review: a.review_status,
    couverture,
    surcoutMax,
    postes: postes.length,
    verdict: c.verdict_global ?? null,
    affirmations,
    textes,
  });
}

// ── TÉMOIN 2 — une réserve ne doit pas être lue comme une affirmation ────
const RESERVES = [
  "Nous ne sommes pas en mesure de dire si le prix est juste, et un second devis est le seul comparatif possible.",
  "Aucune prestation de ce devis ne correspond à un tarif de référence que nous puissions opposer.",
  "Prix non vérifiable : nous ne pouvons pas dire si ce montant est cohérent.",
];
const AFFIRMATIONS_VRAIES = [
  "Les prix sont cohérents avec le marché.",
  "Ce devis est cohérent avec les prix du marché.",
  "Les prestations standards sont au bon prix.",
];
console.log("\n══ TÉMOIN — le motif distingue-t-il une réserve d'une affirmation ? ══");
let temoinKo = 0;
for (const t of RESERVES) {
  const vu = phraseAffirmative(t) !== null;
  if (vu) temoinKo++;
  console.log(`   ${vu ? "🔴" : "✓"} réserve    : « ${t.slice(0, 62)}… »`);
}
for (const t of AFFIRMATIONS_VRAIES) {
  const vu = phraseAffirmative(t) !== null;
  if (!vu) temoinKo++;
  console.log(`   ${vu ? "✓" : "🔴"} affirmation: « ${t.slice(0, 62)} »`);
}
if (temoinKo) {
  console.log(`   🔴 TÉMOIN FAUX — ${temoinKo} cas mal classé(s). Le chiffre qui suit ne vaudrait rien.`);
  process.exit(1);
}
console.log("   ✓ réserves et affirmations correctement séparées.");

// ── TÉMOIN ────────────────────────────────────────────────────────────────
const bienCouvertes = docs.filter((d) => d.couverture >= 50);
const affirmentBien = bienCouvertes.filter((d) => d.affirmations.length);
console.log(`\n══ TÉMOIN — ${bienCouvertes.length} analyses à couverture ≥ 50 % ══`);
console.log(`   dont ${affirmentBien.length} affirment que le prix est correct — c'est LÉGITIME et le banc ne doit pas les compter.`);
if (!bienCouvertes.length) {
  console.log("   🔴 aucune analyse bien couverte : impossible de vérifier que le motif reconnaît une affirmation légitime.");
  process.exit(1);
}
if (!affirmentBien.length) {
  console.log("   🔴 TÉMOIN FAUX — le motif ne reconnaît AUCUNE affirmation là où elles sont attendues ; il ne détecte rien.");
  process.exit(1);
}
console.log("   ✓ le motif reconnaît bien une affirmation de prix quand elle est fondée.\n");

// ── L'INVARIANT ───────────────────────────────────────────────────────────
const nePeutPasChiffrer = (d) => d.couverture < COUVERTURE_MIN;
const violations = docs.filter((d) => nePeutPasChiffrer(d) && d.affirmations.length > 0);
const muettes = docs.filter((d) => nePeutPasChiffrer(d) && d.affirmations.length === 0);

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
console.log(`══ ${docs.length} analyses mesurables (méta vectorielle présente) ══`);
console.log(`   dont incapables de chiffrer (couverture < ${COUVERTURE_MIN} %) : ${docs.filter(nePeutPasChiffrer).length}`);
console.log("");
console.log(`🔴 VIOLENT L'INVARIANT : ${violations.length} analyses — elles affirment un prix correct sans pouvoir le vérifier`);
console.log(`   (soit ${pct(violations.length, docs.filter(nePeutPasChiffrer).length)} % de celles qui ne savent pas chiffrer)`);
console.log(`✓  se taisent correctement : ${muettes.length}\n`);

console.log(`── Le détail des violations ──`);
for (const d of violations.sort((a, b) => a.couverture - b.couverture)) {
  console.log(`\n  ${d.date?.slice(0, 10)} · couverture ${d.couverture.toFixed(2)} % · verdict=${d.verdict} · review=${d.review}`);
  console.log(`     ${d.fichier.slice(0, 62)}`);
  for (const [champ, , phrase] of d.affirmations) {
    console.log(`     ${champ} → « ${String(phrase).slice(0, 118)} »`);
  }
}

// Où naissent-elles ? La réponse oriente le correctif.
const parChamp = new Map();
for (const d of violations) {
  for (const [champ] of d.affirmations) {
    const cle = champ.replace(/\[\d+\]/, "[]");
    parChamp.set(cle, (parChamp.get(cle) ?? 0) + 1);
  }
}
console.log(`\n── Par champ d'origine — c'est là qu'il faut agir ──`);
for (const [champ, n] of [...parChamp.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(n).padStart(3)} × ${champ}`);
}
