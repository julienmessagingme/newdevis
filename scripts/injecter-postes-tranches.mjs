/**
 * scripts/injecter-postes-tranches.mjs
 *
 * 🟢 2026-09-17 — VERSE DANS L'ÉTALON LES POSTES QUE JOHAN A TRANCHÉS après le
 * sourçage IA du même jour. À blanc par défaut ; `--appliquer` pour écrire.
 *
 * 🔴 ON ENRICHIT LES LIGNES EXISTANTES, ON N'EN CRÉE AUCUNE. `analysis_corrections`
 * compte exactement **55 décisions de revue**, et ce nombre est lu comme
 * « 55 revues humaines » — c'est lui qui a fait franchir le seuil des 50 qui
 * conditionne la Phase C. Y ajouter des lignes qui ne sont PAS des revues
 * fausserait ce compteur. Les 6 analyses concernées ont déjà leur ligne : on
 * remplit leur `corrected_anomalies` (NULL partout aujourd'hui) et on APPEND
 * dans `expert_notes`.
 *
 * 🔴 LA PROVENANCE EST TRACÉE, SINON LE BANC MESURERAIT LE MOTEUR CONTRE UNE IA.
 * Chaque poste porte son `origine` et ses URL de sources. `reviewed_by_email`
 * reste l'humain : c'est Johan qui a validé, l'IA n'a fait que sourcer.
 *
 * ⚠️ LA TABLE DE DÉCISIONS EST ÉCRITE EN DUR, PAS DÉRIVÉE. Les réponses de
 * Johan sont numérotées ; le rapport ne l'était pas, et le mapping s'est avéré
 * DÉCALÉ à partir de son n°10 — il avait sauté « Raccordement lave-linge ».
 * Six ancres sémantiques de ses réponses (« pilier portail », « lessivage ≠
 * lissage », « bordure béton »…) ont permis de le reconstituer, et il l'a
 * confirmé. Une dérivation automatique par numéro aurait injecté des décisions
 * sur les mauvais postes — dans un étalon, c'est irrattrapable.
 *
 * ⚠️ UN POSTE NON TRANCHÉ RESTE HORS ÉTALON. « Je ne sais pas » et « sourçage
 * récusé » ne sont pas des verdicts : les compter en inventerait un.
 *
 * 🔴 ON ENREGISTRE LE VERDICT, PAS LE MONTANT — sauf quand le montant est
 * réellement tranché. Johan a validé « il y a un écart », il n'a pas validé le
 * chiffre que l'IA en tire : sur « Étude thermique RE2020 » le sourçage donne
 * 1 350 € là où le moteur dit 558 €, sur « Benne à déchets » 231 € contre 81 €.
 * Inscrire ces montants dans l'étalon lui prêterait une validation qu'il n'a
 * pas donnée. `ecart_valide` n'est donc renseigné que dans deux cas certains :
 *   · verdict OK  → 0, par construction (le prix est normal) ;
 *   · l'expert donne lui-même le barème (bordurette : « 15 à 40 €/ml »).
 * Sinon il vaut `null`, et les deux estimations sont conservées À TITRE
 * DOCUMENTAIRE (`ecart_moteur`, `ecart_source`) — utilisables pour instruire,
 * jamais comme vérité.
 *
 * Usage :
 *   npx tsx scripts/injecter-postes-tranches.mjs <sourcage.json>
 *   npx tsx scripts/injecter-postes-tranches.mjs <sourcage.json> --appliquer
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const SRC = process.argv[2];
const APPLIQUER = process.argv.includes("--appliquer");
if (!SRC) { console.error("usage: npx tsx scripts/injecter-postes-tranches.mjs <sourcage.json> [--appliquer]"); process.exit(1); }

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const eur = (n) => `${Math.round(Number(n) || 0).toLocaleString("fr-FR")} €`;
const MARQUEUR = "[SOURÇAGE IA VALIDÉ PAR JOHAN — 2026-09-17]";

/**
 * Les décisions de Johan, par libellé de poste (jamais par numéro).
 *   verdict "OK"     → le prix est normal, écart validé = 0
 *   verdict "ECART"  → l'écart est réel ; `ecart` fixe le montant retenu,
 *                      ou `"source"` reprend celui qu'étayent les URL
 *   verdict null     → NON TRANCHÉ : reste hors étalon, avec son motif
 */
const DECISIONS = {
  "Piliers portail béton (fourni+posé)":            { verdict: null,   motif: "sourçage récusé : « un pilier de portail en béton est différent de la pose de béton »" },
  "Protection chantier":                            { verdict: "OK",   ecart: 0, motif: "ligne fourre-tout, mais l'usage est de 5 à 10 % du montant total — 570 € sur 35 570 € = 1,6 %, largement en dessous" },
  "Isolation combles perdus soufflage laine minérale": { verdict: "ECART", ecart: "source", motif: "écart confirmé sur le sourçage" },
  "Chéneau zinc (fourni+posé)":                     { verdict: "ECART", ecart: "source", motif: "écart confirmé sur le sourçage" },
  "Benne à déchets chantier":                       { verdict: "ECART", ecart: "source", motif: "écart confirmé sur le sourçage" },
  "Ajout prise TV":                                 { verdict: "ECART", ecart: "source", motif: "écart confirmé sur le sourçage" },
  "Lessivage / nettoyage murs":                     { verdict: null,   motif: "sourçage récusé : « un lessivage ou nettoyage de mur est différent d'un lissage ou d'un ponçage »" },
  "Création arrivée d'eau":                         { verdict: null,   motif: "sourçage récusé : « un raccordement n'est pas une création d'arrivée d'eau »" },
  "Raccordement lave-linge":                        { verdict: null,   motif: "non soumis (poste sauté à la relecture)" },
  "Étude thermique RE2020":                         { verdict: "ECART", ecart: "source", motif: "écart confirmé sur le sourçage" },
  "Isolation phonique cloison (laine + placo renforcé)": { verdict: null, motif: "sourçage récusé : « une cloison avec isolation phonique est spécifique »" },
  "Carrelage standard (fourni+posé)":               { verdict: null,   motif: "indéterminable : « tout dépend de la valeur du carrelage, il faudrait ce prix sur le devis pour appliquer un prix de pose standard »" },
  "Isolation plancher haut entre logements":        { verdict: "OK",   ecart: 0, motif: "prix validé" },
  "Parquet stratifié standard (fourni+posé)":       { verdict: "OK",   ecart: 0, motif: "prix validé" },
  "Pose faïence murale":                            { verdict: "OK",   ecart: 0, motif: "prix validé" },
  "Fenêtre PVC double vitrage (fourni+posé)":       { verdict: "OK",   ecart: 0, motif: "prix validé" },
  "Isolation plancher polystyrène dalle (fourni+posé)": { verdict: "OK", ecart: 0, motif: "prix validé" },
  "Pose panneaux OSB":                              { verdict: "OK",   ecart: 0, motif: "prix validé" },
  // 🟢 Ici l'expert TRANCHE là où le sourceur renonçait, et il donne le barème :
  // « le prix d'une pose de bordure béton est de 15 à 40 €/ml (la bordure elle-même
  // coûte entre 1,50 et 6 €/ml) ». 10 ml × 40 = 400 € de plafond, facturé 710 €.
  "Pose bordurette / bordure béton":                { verdict: "ECART", ecart: 310, motif: "barème de l'expert : pose de bordure béton 15 à 40 €/ml (bordure 1,50-6 €/ml) ⇒ plafond 400 € pour 10 ml, facturé 710 €" },
  "Étanchéité toiture plate bicouche bitume":       { verdict: "OK",   ecart: 0, motif: "prix validé" },
  "Accessoires climatisation (liaisons, supports, finitions)": { verdict: null, motif: "« je ne sais pas »" },
};

const postes = JSON.parse(fs.readFileSync(SRC, "utf8"));

// ── TÉMOIN — chaque poste du sourçage a une décision, et réciproquement ──────
const sansDecision = postes.filter((p) => !(p.label in DECISIONS)).map((p) => p.label);
const orphelines = Object.keys(DECISIONS).filter((l) => !postes.some((p) => p.label === l));
console.log(`\n══ TÉMOIN ══`);
console.log(`   ${sansDecision.length === 0 ? "✓" : "✗"} ${postes.length} postes sourcés · ${postes.length - sansDecision.length} avec décision`);
if (sansDecision.length) console.log(`     sans décision : ${sansDecision.join(" | ")}`);
console.log(`   ${orphelines.length === 0 ? "✓" : "✗"} ${Object.keys(DECISIONS).length} décisions · ${orphelines.length} sans poste correspondant`);
if (orphelines.length) console.log(`     orphelines : ${orphelines.join(" | ")}`);
if (sansDecision.length || orphelines.length) {
  console.log(`\n   ✗ Le mapping ne se recompose pas — on n'écrit RIEN dans l'étalon.`);
  process.exit(1);
}

// ── Regroupement par analyse ────────────────────────────────────────────────
const parAnalyse = new Map();
for (const p of postes) {
  const d = DECISIONS[p.label];
  if (!parAnalyse.has(p.analysisId)) parAnalyse.set(p.analysisId, { fichier: p.fichier, tranches: [], horsEtalon: [] });
  const e = parAnalyse.get(p.analysisId);
  if (d.verdict === null) { e.horsEtalon.push({ poste: p.label, motif: d.motif, ecartMoteur: p.ecartMoteur }); continue; }
  // `ecart` vaut "source" quand seul le VERDICT est validé : le montant reste
  // alors non tranché (null), les deux estimations étant gardées à titre indicatif.
  const montantTranche = d.ecart === "source" ? null : Number(d.ecart);
  e.tranches.push({
    poste: p.label,
    verdict: d.verdict,
    ecart_valide: montantTranche,
    ecart_moteur: Math.round(p.ecartMoteur),
    ecart_source: Math.round(Number(p.ecartSource) || 0),
    motif: d.motif,
    origine: MARQUEUR,
    sources: (p.source?.sources ?? []).map((s) => s.url).filter(Boolean).slice(0, 4),
  });
}

const { data: corrections } = await supa
  .from("analysis_corrections")
  .select("id, analysis_id, expert_notes, corrected_anomalies, reviewed_at")
  .in("analysis_id", [...parAnalyse.keys()])
  .order("reviewed_at", { ascending: false });

console.log(`\n══ ${APPLIQUER ? "ÉCRITURE" : "À BLANC"} — postes tranchés à verser dans l'étalon ══`);

let ecrits = 0;
for (const [analysisId, e] of parAnalyse) {
  // Une analyse peut porter plusieurs corrections : on enrichit la PLUS RÉCENTE.
  const ligne = corrections.find((c) => c.analysis_id === analysisId);
  if (!ligne) { console.log(`\n   ✗ ${e.fichier} — aucune ligne analysis_corrections, ignoré`); continue; }
  if (e.tranches.length === 0) { console.log(`\n   · ${e.fichier} — aucun poste tranché, rien à écrire`); continue; }

  const aAccuser = e.tranches.filter((t) => t.verdict === "ECART");
  const aAbsoudre = e.tranches.filter((t) => t.verdict === "OK");
  const montantCertain = e.tranches.reduce((n, t) => n + (t.ecart_valide ?? 0), 0);
  const montantsOuverts = aAccuser.filter((t) => t.ecart_valide === null).length;

  console.log(`\n   📄 ${e.fichier}`);
  for (const t of e.tranches) {
    const m = t.ecart_valide === null
      ? `montant non tranché (moteur ${eur(t.ecart_moteur)} · sourçage ${eur(t.ecart_source)})`
      : `${eur(t.ecart_valide)} — tranché   (moteur ${eur(t.ecart_moteur)})`;
    console.log(`      ${t.verdict === "OK" ? "🟢 NE PAS ACCUSER" : "🔴 ACCUSER        "}  ${t.poste.slice(0, 44).padEnd(44)} ${m}`);
  }
  for (const h of e.horsEtalon) console.log(`      ⚪ hors étalon — ${h.poste} : ${h.motif.slice(0, 74)}`);
  console.log(`      ⇒ ${aAbsoudre.length} à ne pas accuser · ${aAccuser.length} à accuser` +
    `${montantsOuverts ? ` (dont ${montantsOuverts} sans montant tranché)` : ""} · écart certain ${eur(montantCertain)}`);

  if (!APPLIQUER) continue;

  // ⚠️ On APPEND dans expert_notes : la note d'origine est une décision
  // humaine, elle ne s'écrase pas.
  const note = [
    ligne.expert_notes ?? "",
    "",
    `${MARQUEUR} ${e.tranches.length} poste(s) tranché(s) après sourçage web (l'IA a sourcé les prix, Johan a validé le périmètre ; le verdict est calculé, jamais rendu par l'IA). ` +
    `${aAbsoudre.length} à NE PAS accuser, ${aAccuser.length} à accuser. ` +
    `⚠️ Seul le VERDICT est validé par l'expert : les montants restent non tranchés sauf mention (écart certain ${eur(montantCertain)}). ` +
    (e.horsEtalon.length
      ? `NON TRANCHÉS, donc hors étalon : ${e.horsEtalon.map((h) => `« ${h.poste} » (${h.motif})`).join(" ; ")}.`
      : `Tous les postes de cette analyse sont tranchés.`),
  ].join("\n").trim();

  const { error } = await supa.from("analysis_corrections")
    .update({ corrected_anomalies: e.tranches, expert_notes: note })
    .eq("id", ligne.id);
  if (error) { console.log(`      ✗ échec : ${error.message}`); continue; }
  ecrits++;
}

console.log(`\n══ RÉSUMÉ ══`);
const nTranches = [...parAnalyse.values()].reduce((n, e) => n + e.tranches.length, 0);
const nHors = [...parAnalyse.values()].reduce((n, e) => n + e.horsEtalon.length, 0);
console.log(`   ${nTranches} postes tranchés · ${nHors} laissés hors étalon · ${parAnalyse.size} analyses`);
if (APPLIQUER) console.log(`   ${ecrits} ligne(s) analysis_corrections enrichie(s) — AUCUNE ligne créée (le compteur de revues reste à 55).`);
else console.log(`   (à blanc — relancer avec --appliquer pour écrire)`);
