/**
 * scripts/sourcer-fourchette-catalogue.mjs
 *
 * 🟢 2026-09-17 (demande Johan : « source les 4 fourchettes »).
 *
 * Sourcer une ENTRÉE DU CATALOGUE — pas juger une ligne de devis. La différence
 * porte tout : `sourceur-prix-ia.mjs` demande « ce poste est-il surfacturé ? »
 * sur un devis précis ; ici on demande « que vaut cet OUVRAGE sur le marché ? »
 * et la réponse devient une fourchette opposable à TOUTES les analyses à venir.
 *
 * 🔴 ON NE MONTRE JAMAIS NOTRE FOURCHETTE À L'IA. C'est la règle de circularité
 * du 10/09 (« sinon le relecteur choisit celle qui tombe juste ») et c'est
 * encore plus grave ici : on corrigerait le catalogue pour qu'il confirme le
 * catalogue. Le prompt ne reçoit que le LIBELLÉ, l'unité, les notes et le
 * périmètre déclaré. La comparaison se fait après, mécaniquement.
 *
 * 🔴 ET ON NE LUI MONTRE PAS NON PLUS LE DEVIS QUI A DÉCLENCHÉ LA QUESTION.
 * On vient ici parce qu'un poste a été accusé à tort ; lui dire « un artisan
 * facture 75 €/m² » l'inviterait à fabriquer la fourchette qui absout. Une
 * fourchette relevée pour faire disparaître une accusation n'est pas une
 * mesure, c'est un arrangement.
 *
 * 🔴 DEUX SOURCES NOMMABLES MINIMUM (règle du 15/09, vertical clim) — sinon
 * « non concluant », et l'entrée reste telle quelle.
 *
 * 🔴 ET « NOMMABLE » NE VEUT PAS DIRE « QUI RESSEMBLE À UNE URL ». Première
 * version de ce script : elle comptait les chaînes commençant par `http`.
 * Vérification faite, **21 URL citées sur 21 ne répondaient pas** — dont
 * `www.vertex-ai.fr`, un domaine qui n'existe même pas (le modèle a recraché le
 * nom du produit Google qui sert de relais à la recherche). Une URL inventée
 * passait le contrôle et fabriquait une fourchette « sourcée ». C'est la même
 * famille d'erreur que les six indicateurs faux de septembre : le contrôle
 * mesurait la FORME de la preuve, pas son EXISTENCE.
 *   · chaque URL citée est donc RÉELLEMENT interrogée ;
 *   · 404 / domaine introuvable ⇒ la source ne compte pas ;
 *   · 403 compte : travaux.com et ootravaux.fr existent et bloquent les robots
 *     — les recaler ferait perdre les sources les plus sérieuses du domaine ;
 *   · et on journalise ce que Google a VRAIMENT servi (`groundingMetadata`),
 *     qui est la preuve indépendante de ce que le modèle affirme avoir lu.
 *
 * ⚠️ LE TÉMOIN EST DOUBLE, ET IL EST LE SEUL CONTRÔLE QUI VAILLE. Un sourceur
 * qui proposerait TOUJOURS de relever ne mesurerait rien, il raconterait ce
 * qu'on veut entendre. Deux cas dont la réponse est connue :
 *   · `mur_parpaing_20` (55-115) — le sourcing du 17/09 l'a confirmé mot pour
 *     mot contre travauxavenue. Il doit revenir COMPATIBLE.
 *   · `cloture_alu_lames` jugée sur son ANCIENNE fourchette (55-145) — on sait
 *     qu'elle était fausse, le marché commence à 175. Il doit dire AU-DESSUS.
 * Sans le premier, « il relève tout » passerait pour un résultat ; sans le
 * second, « il confirme tout » passerait pour de la rigueur.
 *
 * ⚠️ IL N'ÉCRIT RIEN EN BASE. La migration s'écrit à la main, après relecture
 * des sources une par une.
 *
 * Usage :
 *   npx tsx scripts/sourcer-fourchette-catalogue.mjs --temoin
 *   npx tsx scripts/sourcer-fourchette-catalogue.mjs <job_type> [<job_type>…]
 *   npx tsx scripts/sourcer-fourchette-catalogue.mjs --sortie x.json parquet_stratifie_standard
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { compterSourcesVivantes } from "./source-vivante.mjs";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const CLE = lire("GOOGLE_API_KEY");
if (!CLE) throw new Error("GOOGLE_API_KEY absente de .env.local");

const MODELE = "gemini-2.5-pro";
const MODE_TEMOIN = process.argv.includes("--temoin");
const iSortie = process.argv.indexOf("--sortie");
const SORTIE = iSortie >= 0 ? process.argv[iSortie + 1] : (MODE_TEMOIN ? "sourcage-catalogue-temoin.json" : "sourcage-catalogue.json");
const cibles = process.argv.slice(2).filter((a) => !a.startsWith("--") && a !== SORTIE);

/** Les deux cas dont on connaît la réponse — cf. l'en-tête. */
const TEMOINS = [
  { job_type: "mur_parpaing_20", testee: [55, 115], attendu: "CHEVAUCHE",
    pourquoi: "sourcé le 17/09 : travauxavenue donne 55-115 €/m², mot pour mot" },
  { job_type: "cloture_alu_lames", testee: [55, 145], attendu: "AU-DESSUS",
    pourquoi: "ancienne fourchette, corrigée le 17/09 à 150-330 : son plafond était sous le plancher du marché" },
];

const eur = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);

// ── La consigne ──────────────────────────────────────────────────────────────
// Chaque exigence vient d'un piège déjà payé : HT/TTC (15/09), périmètre
// fourniture/pose (10/09), source nommable (15/09), droit de s'abstenir.
const CONSIGNE = (e) => `Tu établis un RELEVÉ DE PRIX DE MARCHÉ pour un ouvrage du bâtiment, en France, en 2026.

OUVRAGE
-------
${e.label}
Unité de facturation attendue : ${e.unit}
Périmètre déclaré : ${e.nature_prix === "pose_seule" ? "POSE SEULE (fourniture du matériau NON comprise)" : e.nature_prix === "fourniture_seule" ? "FOURNITURE SEULE" : "FOURNITURE ET POSE"}${e.notes ? `\nPrécision : ${e.notes}` : ""}

TA TÂCHE
--------
Trouver, en cherchant sur le web, la FOURCHETTE DE PRIX couramment pratiquée
par les artisans français pour cet ouvrage, et citer tes sources. Tu ne juges
aucun devis : tu relèves un prix de marché.

RÈGLES ABSOLUES
---------------
1. HORS TAXES. La plupart des sites grand public affichent du TTC. Si une source
   est en TTC, convertis en HT (÷ 1,20 pour 20 %, ÷ 1,10 pour 10 % en rénovation)
   et DIS-LE dans la source. Confondre HT et TTC fausse tout de 10 à 20 %.
2. PÉRIMÈTRE. Ton prix doit couvrir EXACTEMENT le périmètre déclaré ci-dessus.
   Si les sources que tu trouves portent sur un autre périmètre (par exemple
   fourniture+pose alors qu'on demande la pose seule), DIS-LE dans le champ
   "perimetre_reel" — ne convertis pas au jugé.
3. UNITÉ. Donne le prix dans l'unité demandée. Si le marché se chiffre dans une
   autre unité, donne-la dans "unite" et explique la conversion dans "reserve".
   N'invente jamais une conversion impossible.
4. DEUX SOURCES MINIMUM, chacune avec son URL et la valeur que tu y as lue,
   recopiée telle quelle. Une source que tu ne peux pas nommer ne compte pas.
5. LA FOURCHETTE DOIT DÉCRIRE LE COURANT, pas les extrêmes. Le minimum = l'entrée
   de gamme réellement pratiquée, le maximum = le haut de gamme courant — pas le
   cas exceptionnel que citerait un seul site.
6. SI TU NE TROUVES PAS, dis-le : "certitude": "aucune". C'est une réponse
   parfaitement acceptable et bien plus utile qu'un chiffre inventé.

RÉPONDS UNIQUEMENT PAR CE JSON, sans texte autour :
{
  "ouvrage_compris": "en quelques mots, l'ouvrage que tu as cherché",
  "prix_min_ht": nombre ou null,
  "prix_max_ht": nombre ou null,
  "unite": "m2" | "ml" | "u" | "forfait" | "m3",
  "perimetre_reel": "ce que ton prix couvre RÉELLEMENT",
  "sources": [{"url": "...", "valeur_citee": "...", "ht_ou_ttc": "HT"|"TTC"}],
  "certitude": "haute" | "moyenne" | "basse" | "aucune",
  "reserve": "ce qui fait légitimement varier ce prix, et ce dont tu n'es pas sûr"
}`;

async function sourcer(e) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELE}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": CLE },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: CONSIGNE(e) }] }],
        tools: [{ google_search: {} }],
        // ⚠️ Marge large : gemini-2.5 consomme une partie du budget de sortie en
        // raisonnement interne — un plafond serré tronque le JSON en silence.
        generationConfig: { temperature: 0.1, maxOutputTokens: 16384 },
      }),
    },
  );
  if (!res.ok) return { erreur: `${res.status} ${(await res.text()).slice(0, 180)}` };
  const j = await res.json();
  const cand = j?.candidates?.[0];
  const texte = (cand?.content?.parts ?? []).map((p) => p?.text ?? "").join("\n");
  const m = texte.match(/\{[\s\S]*\}/);
  if (!m) return { erreur: "pas de JSON dans la réponse", texte: texte.slice(0, 200) };
  let parsed;
  try { parsed = JSON.parse(m[0]); } catch (err) { return { erreur: `JSON illisible : ${err.message}` }; }

  // ⚠️ La preuve INDÉPENDANTE de ce qui a réellement été consulté. Ce que le
  // modèle écrit dans "sources" est une DÉCLARATION ; ceci est un relevé.
  const g = cand?.groundingMetadata ?? {};
  parsed._recherches = g.webSearchQueries ?? [];
  parsed._consultes = (g.groundingChunks ?? [])
    .map((c) => c?.web?.title)
    .filter(Boolean);
  return parsed;
}

/**
 * Le verdict n'est PAS demandé à l'IA — il se calcule, en comparant deux
 * intervalles. Trois positions possibles, et aucune ne dit « il faut changer » :
 * c'est un constat, la décision reste humaine.
 */
function comparer(notre, src, nbVivantes) {
  if (src?.erreur) return { position: "ERREUR", motif: src.erreur };
  if (src?.certitude === "aucune" || src?.prix_max_ht == null || src?.prix_min_ht == null) {
    return { position: "NON CONCLUANT", motif: "l'IA n'a pas trouvé de prix de marché" };
  }
  const nbCitees = (src?.sources ?? []).length;
  if (nbVivantes < 2) {
    return { position: "NON CONCLUANT", motif: `${nbVivantes} source(s) RÉELLEMENT vivante(s) sur ${nbCitees} citée(s), il en faut 2` };
  }

  const fam = (u) => {
    const s = String(u ?? "").toLowerCase().trim();
    if (/^(m2|m²)/.test(s)) return "surface";
    if (/^(m3|m³)/.test(s)) return "volume";
    if (/^(ml|mètre|metre)/.test(s)) return "lineaire";
    if (/^(u|unit|ens|pce|piece|pièce)/.test(s)) return "unite";
    if (/^(forfait|f|fft)/.test(s)) return "forfait";
    return null;
  };
  // ⚠️ La faille du 17/09 : « métrique des deux côtés » ne veut pas dire
  // comparable. Un prix au m² ne se compare pas à un prix au ml.
  const fSrc = fam(src.unite), fNous = fam(notre.unit);
  if (fSrc && fNous && fSrc !== fNous) {
    return { position: "NON CONCLUANT", motif: `unité sourcée (${src.unite}) ≠ notre unité (${notre.unit})` };
  }

  const [sMin, sMax] = [Number(src.prix_min_ht), Number(src.prix_max_ht)];
  const [oMin, oMax] = notre.testee;
  const position = sMin > oMax ? "AU-DESSUS" : sMax < oMin ? "EN-DESSOUS" : "CHEVAUCHE";
  return {
    position,
    sMin, sMax,
    ratioPlafond: oMax > 0 ? sMax / oMax : null,
    motif: position === "AU-DESSUS"
      ? `notre plafond (${eur(oMax)}) est SOUS le plancher du marché (${eur(sMin)})`
      : position === "EN-DESSOUS"
        ? `notre plancher (${eur(oMin)}) est AU-DESSUS du plafond du marché (${eur(sMax)})`
        : `les deux fourchettes se recouvrent · plafond sourcé ${eur(sMax)} contre ${eur(oMax)} chez nous`,
  };
}

// ── Population ───────────────────────────────────────────────────────────────
const jobTypes = MODE_TEMOIN ? TEMOINS.map((t) => t.job_type) : cibles;
if (jobTypes.length === 0) {
  console.error("usage: npx tsx scripts/sourcer-fourchette-catalogue.mjs [--temoin] <job_type>…");
  process.exit(1);
}

const { data: entrees, error } = await supa
  .from("market_prices")
  .select("job_type, label, unit, metier, nature_prix, notes, source, price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht")
  .in("job_type", jobTypes);
if (error) throw new Error(error.message);

const manquantes = jobTypes.filter((j) => !entrees.some((e) => e.job_type === j));
if (manquantes.length > 0) {
  console.log(`\n⚠️ absente(s) du catalogue, donc non sourçable(s) : ${manquantes.join(", ")}`);
}

console.log(`\n══ ${MODE_TEMOIN ? "TÉMOIN — deux fourchettes dont la réponse est connue" : "SOURÇAGE DE FOURCHETTES CATALOGUE"} ══`);
console.log(`   ${entrees.length} entrée(s) · modèle ${MODELE} avec recherche Google\n`);

const resultats = [];
for (const [i, e] of entrees.entries()) {
  const t = TEMOINS.find((x) => x.job_type === e.job_type);
  // En témoin on juge la fourchette de l'ÉPOQUE, pas celle d'aujourd'hui —
  // sinon le cas « clôture alu » testerait la correction au lieu du défaut.
  const testee = MODE_TEMOIN && t ? t.testee : [e.price_min_unit_ht, e.price_max_unit_ht];

  process.stdout.write(`   [${i + 1}/${entrees.length}] ${String(e.label).slice(0, 46).padEnd(46)} `);
  const src = await sourcer(e);

  // 🔴 On INTERROGE chaque URL citée avant de la compter. Cf. l'en-tête.
  const nbVivantes = await compterSourcesVivantes(src?.sources);

  const c = comparer({ unit: e.unit, testee }, src, nbVivantes);
  const accord = MODE_TEMOIN && t ? (c.position === t.attendu ? " ✓" : c.position.startsWith("NON") || c.position === "ERREUR" ? " ·" : " ✗") : "";
  const puce = c.position === "CHEVAUCHE" ? "🟢" : c.position === "AU-DESSUS" ? "🔴" : c.position === "EN-DESSOUS" ? "🟠" : "⚪";
  console.log(`${puce} ${c.position}${accord}`);

  resultats.push({ ...e, testee, attendu: t?.attendu ?? null, pourquoiTemoin: t?.pourquoi ?? null, source: src, nbVivantes, ...c });
  await new Promise((r) => setTimeout(r, 1200));
}

fs.writeFileSync(SORTIE, JSON.stringify(resultats, null, 2), "utf8");

// ── Rapport ──────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(78)}`);
for (const r of resultats) {
  console.log(`\n▸ ${r.label}   [${r.job_type}]`);
  console.log(`  notre fourchette : ${r.testee[0]} – ${r.testee[1]} €/${r.unit}${MODE_TEMOIN ? "  (celle de l'époque)" : ""}`);
  if (r.sMin != null) console.log(`  sourcée          : ${r.sMin} – ${r.sMax} €/${r.source?.unite}  (certitude ${r.source?.certitude})`);
  console.log(`  ${r.position} — ${r.motif}`);
  if (r.source?.perimetre_reel) console.log(`  périmètre sourcé : ${r.source.perimetre_reel}`);
  if (r.source?.reserve) console.log(`  réserve          : ${r.source.reserve}`);
  console.log(`  sources citées   : ${r.nbVivantes ?? 0} vivante(s) sur ${(r.source?.sources ?? []).length}`);
  for (const s of r.source?.sources ?? []) {
    console.log(`    ${s.vivante ? "✓" : "✗"} [${String(s.etat ?? "?").padEnd(22)}] ${s.ht_ou_ttc ?? "?"}  « ${String(s.valeur_citee ?? "").slice(0, 92)} »`);
    console.log(`      ${s.url}`);
  }
  if (r.source?._consultes?.length) {
    console.log(`  réellement servi par Google : ${[...new Set(r.source._consultes)].join(", ")}`);
  }
}

if (MODE_TEMOIN) {
  const jugeables = resultats.filter((r) => r.attendu && (r.position === "CHEVAUCHE" || r.position === "AU-DESSUS" || r.position === "EN-DESSOUS"));
  const justes = jugeables.filter((r) => r.position === r.attendu);
  console.log(`\n${"═".repeat(78)}`);
  console.log(`\n══ LE TÉMOIN ══`);
  console.log(`   ${justes.length}/${jugeables.length} conformes à la réponse connue`);
  // 🔴 LE CONTRÔLE QUI COMPTE : un sourceur qui rendrait toujours la même
  // position ne mesurerait rien, même en tombant juste.
  const positions = new Set(jugeables.map((r) => r.position));
  if (jugeables.length < 2 || positions.size < 2) {
    console.log(`   ✗ IL NE DISCRIMINE PAS — il rend la même position partout (${[...positions].join(", ") || "aucune"}). NE PAS S'EN SERVIR.`);
    process.exitCode = 1;
  } else {
    console.log(`   ✓ il sait CONFIRMER et il sait CONTREDIRE (${[...positions].join(" · ")})`);
  }
  for (const r of jugeables.filter((x) => x.position !== x.attendu)) {
    console.log(`\n   ✗ ${r.job_type} : attendu ${r.attendu}, obtenu ${r.position}`);
    console.log(`     ce qu'on savait : ${r.pourquoiTemoin}`);
  }
}

console.log(`\n   → ${SORTIE}`);
