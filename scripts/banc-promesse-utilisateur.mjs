/**
 * scripts/banc-promesse-utilisateur.mjs
 *
 * 2026-09-16 (question Johan) — LA SEULE QUESTION QUI COMPTE, POSÉE AU STOCK.
 *
 *   « Si un utilisateur dépose un devis, repart-il avec une analyse qui lui
 *     permet de dire s'il peut signer ou non — et pourquoi précisément —,
 *     s'il peut négocier, et si oui quels postes et combien ? »
 *
 * Tous les bancs précédents mesurent une PROPRIÉTÉ du moteur (couverture,
 * rapprochement, invariant d'affirmation). Celui-ci mesure la PROMESSE : ce que
 * la personne a réellement entre les mains à la fin.
 *
 * Trois questions, évaluées séparément parce qu'elles échouent séparément :
 *
 *   Q1  Puis-je signer ?          → un verdict ET un motif NOMMÉ
 *   Q2  Puis-je négocier ?        → un levier actionnable, ou un « non » motivé
 *   Q3  Quels postes, combien ?   → un montant RATTACHÉ à des postes nommés,
 *                                    ou un silence EXPLIQUÉ (on ne sait pas)
 *
 * 🔴 UN SILENCE EXPLIQUÉ EST UNE RÉPONSE, PAS UN ÉCHEC. Le produit assume
 * depuis le 04/09 de ne pas chiffrer ce qu'il ne sait pas comparer. Ce qui est
 * un échec, c'est le silence NON expliqué, et surtout le montant que le détail
 * ne justifie pas (défaut fermé le 05/09 — ce banc vérifie qu'il l'est resté).
 *
 * ⚠️ TÉMOINS OBLIGATOIRES (quatre indicateurs faux en deux jours) : les
 * effectifs doivent se recomposer, et deux analyses au comportement connu
 * doivent tomber dans la case attendue.
 *
 * Usage : node scripts/banc-promesse-utilisateur.mjs
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const COUVERTURE_MIN = 5;

/** Couverture RECALCULÉE depuis le rapprochement stocké — jamais lue. */
function couverture(rawText) {
  let r = {};
  try { r = JSON.parse(rawText || "{}"); } catch { return null; }
  const g = Array.isArray(r.n8n_price_data) ? r.n8n_price_data : [];
  if (!g.some((x) => x?.vectorial)) return null;        // V3.6 legacy : non mesurable
  let total = 0, haute = 0;
  for (const x of g) {
    const v = Number(x.devis_total_ht ?? 0) || 0;
    total += v;
    if (x?.vectorial?.confidence === "high") haute += v;
  }
  return total > 0 ? (haute / total) * 100 : null;
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

for (const a of analyses ?? []) {
  const cle = `${a.user_id}|${a.file_name}`;
  if (vus.has(cle)) continue;          // un même PDF redéposé ne compte qu'une fois
  vus.add(cle);

  let c;
  try { c = JSON.parse(a.conclusion_ia); } catch { continue; }
  if (!c || typeof c !== "object") continue;

  const cov = couverture(a.raw_text);
  const bypass = !!(c.foreign_quote || c.estimation_courtier || c.incomplete_quote || c.hors_scope);

  // ── Q1 — puis-je signer, et POURQUOI ? ───────────────────────────────────
  const verdict = c.verdict_decisionnel || c.verdict_global || null;
  const motif = typeof c.verdict_ligne?.motif === "string" ? c.verdict_ligne.motif.trim() : "";
  // Un motif doit NOMMER quelque chose : < 25 caractères, c'est une étiquette.
  const q1 = !verdict ? "aucun verdict" : motif.length >= 25 ? "verdict + motif nommé" : "verdict sans motif";

  // ── Q2 — puis-je négocier ? ──────────────────────────────────────────────
  const leviers = Array.isArray(c.leviers) ? c.leviers : [];
  const negocier = leviers.filter((l) => l?.objectif === "negocier");
  const q2 = leviers.length === 0
    ? "aucun levier"
    : negocier.length > 0 ? "levier de négociation" : "sécurisation seule";

  // ── Q3 — quels postes, et combien ? ──────────────────────────────────────
  //
  // 🔴 MON PREMIER INDICATEUR A COMPTÉ 16 « MONTANTS ORPHELINS » QUI N'EN
  // ÉTAIENT PAS — cinquième signal fabriqué en deux jours. Il cherchait les
  // postes dans `anomalies[]` UNIQUEMENT. Or le correctif du 2026-09-05 prévoit
  // explicitement un repli : quand Gemini ne nomme aucune anomalie,
  // `computeServerSurcout` rend les postes qui composent l'écart et ils sont
  // nommés dans le TITRE DU LEVIER (« Négociez les postes au-dessus du marché
  // (UNITE INTERIEURE…, GROUPE EXTÉRIEUR…) »). Vérifié à la main sur trois cas.
  //
  // ⚠️ ET LA SECONDE ERREUR ÉTAIT SYMÉTRIQUE : un montant présent dans
  // `surcout_global` n'est pas forcément AFFICHÉ. Sous le plancher de 300 €,
  // `verdict_ligne.marge` vaut `null` et aucun levier ne sort — le chiffre
  // existe en base et ne parvient jamais au lecteur. Ce qui compte pour
  // l'utilisateur est ce qu'il VOIT, pas ce qui est stocké.
  const surcoutMax = Number(c.surcout_global?.max ?? 0) || 0;
  const anomalies = Array.isArray(c.anomalies) ? c.anomalies : [];
  const postesAnomalies = anomalies.filter(
    (x) => typeof x?.poste === "string" && x.poste.trim() && Number(x?.surcout_estime ?? 0) > 0,
  );
  const levierSurcout = leviers.find((l) => l?.type === "surcout_postes");
  // ⚠️ Le levier nomme ses postes entre parenthèses en fin de titre — MAIS un
  // libellé de devis peut lui-même contenir des parenthèses (« Accessoires
  // climatisation (liaisons, supports, finitions) »). Un motif `\(([^)]+)\)$`
  // échoue alors et déclare le poste absent : troisième variante du même
  // indicateur faux. On prend de la PREMIÈRE parenthèse à la DERNIÈRE.
  const postesDuLevier = (() => {
    const t = typeof levierSurcout?.titre === "string" ? levierSurcout.titre : "";
    const i = t.indexOf("(");
    const j = t.lastIndexOf(")");
    if (i < 0 || j <= i) return [];
    return t.slice(i + 1, j).split(",").map((s) => s.trim()).filter(Boolean);
  })();
  const nbPostes = postesAnomalies.length || postesDuLevier.length;
  const sommePostes = postesAnomalies.reduce((s, x) => s + (Number(x.surcout_estime) || 0), 0);

  // 🔴 UNE MARGE EN POURCENTAGE N'EST PAS UN ÉCART DE PRIX, et les confondre
  // fausse tout. Depuis le 2026-09-11, seul le levier `revision_tarifaire`
  // peut produire un pourcentage : il porte son propre ordre de grandeur
  // (5-8 %/an d'indexation), il ne prétend pas chiffrer une surfacturation.
  // Le compter comme « montant » ferait croire à une réponse à « combien ? »
  // qui n'en est pas une.
  const marge = typeof c.verdict_ligne?.marge === "string" ? c.verdict_ligne.marge.trim() : "";
  const margeEnPourcent = /%/.test(marge);
  const aRevisionTarifaire = leviers.some((l) => l?.type === "revision_tarifaire");
  const montantEnEuros = (!!marge && !margeEnPourcent) || !!levierSurcout;

  let q3;
  if (montantEnEuros && nbPostes > 0)                   q3 = "montant + postes nommés";
  else if (montantEnEuros)                              q3 = "MONTANT ORPHELIN";     // doit être 0
  else if (margeEnPourcent && aRevisionTarifaire)       q3 = "marge d'indexation (pas un écart de prix)";
  else if (margeEnPourcent)                             q3 = "POURCENTAGE SANS LEVIER DE PRIX"; // interdit 11/09
  else if (surcoutMax > 0)                              q3 = "écart sous le plancher d'affichage";
  else if (cov !== null && cov < COUVERTURE_MIN)        q3 = "silence expliqué (rien de comparable)";
  else if (cov !== null)                                q3 = "aucun écart trouvé";
  else                                                  q3 = "non mesurable (legacy)";

  docs.push({
    fichier: a.file_name, date: a.created_at?.slice(0, 10), review: a.review_status,
    engine: c.engine_version, cov, bypass, q1, q2, q3,
    surcoutMax, nbPostes, sommePostes, montantEnEuros,
    nbLeviers: leviers.length,
  });
}

// ── TÉMOINS ────────────────────────────────────────────────────────────────
const compter = (champ) => docs.reduce((m, d) => (m[d[champ]] = (m[d[champ]] ?? 0) + 1, m), {});
const q1c = compter("q1"), q2c = compter("q2"), q3c = compter("q3");
const somme = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const ok = somme(q1c) === docs.length && somme(q2c) === docs.length && somme(q3c) === docs.length;
console.log(`\n══ TÉMOIN — les effectifs se recomposent ══`);
console.log(`   ${ok ? "✓" : "✗ INCOHÉRENT"} ${docs.length} documents · Q1 ${somme(q1c)} · Q2 ${somme(q2c)} · Q3 ${somme(q3c)}`);
if (!ok) process.exit(1);

// ⚠️ DEUX DÉFAUTS DISTINCTS, DEUX COMPTEURS DISTINCTS. Une substitution trop
// large les avait fusionnés : le témoin annonçait « 1 montant orphelin » alors
// que la répartition n'en montrait aucun. Deux chiffres qui se contredisent
// dans le même rapport, c'est la contradiction que ce produit combat à l'écran.
const orphelins = docs.filter((d) => d.q3 === "MONTANT ORPHELIN");
const pctSansLevier = docs.filter((d) => d.q3 === "POURCENTAGE SANS LEVIER DE PRIX");
console.log(`   ${orphelins.length === 0 ? "✓" : "🔴"} montants orphelins (défaut fermé le 05/09) : ${orphelins.length}`);
console.log(`   ${pctSansLevier.length === 0 ? "✓" : "🔴"} pourcentages sans levier de prix (fermé le 11/09) : ${pctSansLevier.length}`);

console.log(`\n══ ${docs.length} devis analysés (documents dédupliqués) ══\n`);

const ligne = (compte, total) => (n) => `${String(n).padStart(4)}  (${String(Math.round((n / total) * 100)).padStart(3)} %)`;
const f = ligne(null, docs.length);

console.log("── Q1 · « Puis-je signer, et pourquoi précisément ? » ──");
for (const [k, v] of Object.entries(q1c).sort((a, b) => b[1] - a[1])) console.log(`  ${f(v)}  ${k}`);

console.log("\n── Q2 · « Puis-je négocier ? » ──");
for (const [k, v] of Object.entries(q2c).sort((a, b) => b[1] - a[1])) console.log(`  ${f(v)}  ${k}`);

console.log("\n── Q3 · « Quels postes, et combien ? » ──");
for (const [k, v] of Object.entries(q3c).sort((a, b) => b[1] - a[1])) console.log(`  ${f(v)}  ${k}`);

// ── La réponse à la question de Johan ──────────────────────────────────────
const complet = docs.filter((d) => d.q1 === "verdict + motif nommé" && d.q3 === "montant + postes nommés");
const honnete = docs.filter((d) => d.q1 === "verdict + motif nommé" &&
  (d.q3 === "silence expliqué (rien de comparable)" || d.q3 === "aucun écart trouvé"));
const bancal = docs.filter((d) =>
  d.q1 !== "verdict + motif nommé" ||
  d.q3 === "MONTANT ORPHELIN" ||
  d.q3 === "POURCENTAGE SANS LEVIER DE PRIX");

console.log(`\n══ CE QUE L'UTILISATEUR EMPORTE ══`);
console.log(`  🟢 ${f(complet.length)}  réponse COMPLÈTE — verdict motivé + postes nommés + montant`);
console.log(`  🟡 ${f(honnete.length)}  réponse HONNÊTE mais sans chiffre — verdict motivé, pas de montant à opposer`);
console.log(`  🔴 ${f(bancal.length)}  réponse INCOMPLÈTE — verdict sans motif nommé, ou montant orphelin`);
// ⚠️ LES TROIS CATÉGORIES CI-DESSUS NE COUVRENT PAS TOUT, ET LE TAIRE FERAIT
// CROIRE À UN TOTAL DE 100 %. Le reste est un « ni-ni » : le verdict est
// motivé, mais « combien ? » reste sans réponse chiffrée pour une raison qui
// n'est ni un silence assumé ni un défaut — analyse trop ancienne pour être
// mesurée, marge d'indexation, ou écart réel mais sous le plancher de 300 €.
const reste = docs.filter((d) => !complet.includes(d) && !honnete.includes(d) && !bancal.includes(d));
console.log(`  ⚪ ${f(reste.length)}  AUTRE — verdict motivé, « combien ? » sans réponse chiffrée`);
{
  const r = reste.reduce((m, d) => (m[d.q3] = (m[d.q3] ?? 0) + 1, m), {});
  for (const [k, v] of Object.entries(r).sort((a, b) => b[1] - a[1])) {
    console.log(`        ${String(v).padStart(3)} · ${k}`);
  }
}
{
  // ⚠️ « non mesurable » recouvre DEUX situations opposées, et les confondre
  // ferait passer pour un trou ce qui est un comportement voulu.
  const leg = reste.filter((d) => d.q3 === "non mesurable (legacy)");
  const exc = leg.filter((d) => d.bypass).length;
  console.log(`        dont ${exc} sur un chemin d'exception (étranger / courtier / incomplet / hors-scope) :`);
  console.log(`             aucun rapprochement de prix n'a lieu, par construction — ce n'est pas un défaut`);
  console.log(`        et   ${leg.length - exc} analyses antérieures au pipeline vectoriel (stock ancien)`);
}
console.log(`  ── total ${complet.length + honnete.length + bancal.length + reste.length} / ${docs.length}`);

const avecMontant = docs.filter((d) => d.surcoutMax > 0);
if (avecMontant.length) {
  const m = avecMontant.map((d) => d.surcoutMax).sort((a, b) => a - b);
  const med = m[Math.floor(m.length / 2)];
  console.log(`\n  Montant négociable annoncé : médiane ${med.toLocaleString("fr-FR")} €` +
              ` · min ${m[0].toLocaleString("fr-FR")} € · max ${m[m.length - 1].toLocaleString("fr-FR")} €`);
  const nbPostes = avecMontant.map((d) => d.nbPostes).sort((a, b) => a - b);
  console.log(`  Postes nommés par devis chiffré : médiane ${nbPostes[Math.floor(nbPostes.length / 2)]}`);
}

const mesurables = docs.filter((d) => d.cov !== null);
if (mesurables.length) {
  const cs = mesurables.map((d) => d.cov).sort((a, b) => a - b);
  console.log(`\n  Couverture (part du montant à référence opposable) :`);
  console.log(`     médiane ${cs[Math.floor(cs.length / 2)].toFixed(0)} %` +
              ` · 1er quartile ${cs[Math.floor(cs.length / 4)].toFixed(0)} %` +
              ` · 3e quartile ${cs[Math.floor((cs.length * 3) / 4)].toFixed(0)} %`);
  console.log(`     sous le seuil de ${COUVERTURE_MIN} % : ${mesurables.filter((d) => d.cov < COUVERTURE_MIN).length} / ${mesurables.length}`);
}

if (bancal.length) {
  console.log(`\n── Les ${bancal.length} réponses incomplètes, par cause ──`);
  const parCause = compter.call(null, "q1");
  for (const d of [...bancal].sort((a,b)=>(a.q3.startsWith("MONT")||a.q3.startsWith("POUR")?0:1)-(b.q3.startsWith("MONT")||b.q3.startsWith("POUR")?0:1)).slice(0, 15)) {
    console.log(`   · ${d.fichier} — ${d.date} — engine ${d.engine} — ${d.q1} / ${d.q3}`);
  }
  void parCause;
}
