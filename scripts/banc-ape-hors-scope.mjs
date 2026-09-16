/**
 * scripts/banc-ape-hors-scope.mjs
 *
 * 2026-09-16 (idée Johan) — LE CODE APE DE L'ÉMETTEUR PEUT-IL SERVIR DE
 * SECOND SIGNAL HORS-SCOPE, POUR CESSER DE MULTIPLIER LES MOTS-CLÉS ?
 *
 * Le 16/09 au matin : la garde hors-scope est une LISTE D'EXCLUSIONS, elle a
 * laissé passer deux devis de sonorisation automobile. Allonger la liste ne
 * ferme rien — bateau, moto, caravane, agricole viendront ensuite.
 *
 * Proposition de Johan : croiser avec QUI ÉMET le devis. Si l'entreprise n'est
 * pas du bâtiment ET que les libellés ne parlent pas bâtiment, on est sûr.
 * C'est le motif de `detectQuoteCountry` (un signal fort, un signal modéré) et
 * il évite d'énumérer les métiers du monde.
 *
 * ⚠️ LE PRÉALABLE EST QUE LE SIGNAL SOIT MORT AUJOURD'HUI. `verify.ts` ne
 * récupère jamais `activite_principale`, alors que `detectPrestationIntellectuelle`
 * le LIT déjà (backlog). Ce banc interroge donc le registre lui-même.
 *
 * 🔴 CE QUE LE BANC DOIT TRANCHER, ET CE N'EST PAS ÉVIDENT : un PAYSAGISTE
 * n'est PAS formellement du bâtiment (APE 81.30Z, section N — services), pas
 * plus qu'un pisciniste (93.11Z parfois). Or nous les analysons à bon droit :
 * le catalogue a `ouvrages_paysagisme`, `ouvrages_piscine`, `ouvrages_anc`.
 * Une règle « section F uniquement » les rejetterait tous. Le banc mesure donc
 * si l'APE SÉPARE réellement les 13 hors-scope des 17 faux positifs du juge.
 *
 * 🔴 TÉMOIN : des entreprises dont je connais le métier par leurs lignes —
 * VOLTELEC (clim), AUTOPEINT DIRIGO (carrosserie) — doivent ressortir du bon
 * côté. Si le registre ne les retrouve pas, le signal est inutilisable quel
 * que soit son pouvoir discriminant.
 *
 * Usage : node scripts/banc-ape-hors-scope.mjs
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const API = "https://recherche-entreprises.api.gouv.fr/search";

/**
 * Les APE que NOUS considérons dans le périmètre.
 *
 * ⚠️ CE N'EST PAS « LA SECTION F » et c'est tout l'enjeu. La section F
 * (41-43) couvre la construction, mais nos devis légitimes débordent :
 *   · 81.30Z aménagement paysager — section N (services)
 *   · 71.1x architecture / ingénierie — section M
 *   · 47.5x / 47.9x commerce d'équipement de la maison (fourniture seule)
 *   · 33.xx réparation d'équipements installés dans le bâtiment
 * Les ajouter est un CHOIX, pas une déduction — chacun doit se justifier par
 * un devis réel du corpus, sinon on ouvre la garde pour rien.
 */
const APE_DANS_LE_PERIMETRE = [
  /^4[123]\./, // section F — construction, génie civil, travaux spécialisés
  /^81\.30/, // aménagement paysager (devis de jardin, clôture végétale)
  /^71\.1/, // architecture, ingénierie, études techniques
  /^33\.(12|14|20)/, // réparation/installation de machines et équipements
  /^02\.40/, // services de soutien à l'exploitation forestière (élagage)
];
const dansLePerimetre = (ape) => !!ape && APE_DANS_LE_PERIMETRE.some((r) => r.test(ape));

const { data: analyses, error } = await supa
  .from("analyses")
  .select("id,user_id,file_name,created_at,review_status,raw_text")
  .not("raw_text", "is", null)
  .order("created_at", { ascending: false });
if (error) throw new Error(error.message);

const vus = new Set();
const docs = [];
for (const a of analyses) {
  const cle = `${a.user_id}|${a.file_name}`;
  if (vus.has(cle)) continue;
  vus.add(cle);
  let r;
  try {
    r = JSON.parse(a.raw_text || "{}");
  } catch {
    continue;
  }
  const e = r?.extracted;
  const lignes = (e?.travaux ?? []).map((t) => String(t?.libelle ?? "")).filter(Boolean);
  if (!lignes.length) continue;
  docs.push({
    fichier: a.file_name,
    review: a.review_status,
    type: e.type_document ?? null,
    nom: e.entreprise?.nom ?? null,
    siret: String(e.entreprise?.siret ?? "").replace(/\D/g, ""),
    // L'APE déjà vérifié par la production, s'il existe — c'est ce que le
    // backlog dit mort ; on le compte pour le prouver.
    apeStocke: r?.verified?.activite_principale ?? null,
    lignes,
  });
}

const avecApe = docs.filter((d) => d.apeStocke);
console.log(`\n${docs.length} documents · APE déjà présent dans le stock : ${avecApe.length}`);
if (!avecApe.length) {
  console.log("→ le signal est bien MORT aujourd'hui : rien à croiser sans appeler le registre.\n");
}

/** Un seul appel par entreprise, jamais par document. */
const cacheApe = new Map();
async function apeDe(d) {
  const cle = d.siret?.length >= 9 ? d.siret.slice(0, 9) : `nom:${(d.nom ?? "").toLowerCase()}`;
  if (cacheApe.has(cle)) return cacheApe.get(cle);
  let res = null;
  try {
    const q = d.siret?.length >= 9 ? d.siret.slice(0, 9) : d.nom;
    if (q) {
      const r = await fetch(`${API}?q=${encodeURIComponent(q)}&per_page=1`, {
        signal: AbortSignal.timeout(12_000),
      });
      if (r.ok) {
        const u = (await r.json())?.results?.[0];
        if (u) {
          res = {
            ape: u.activite_principale ?? null,
            libelle: u.libelle_activite_principale ?? null,
            nom: u.nom_complet ?? null,
          };
        }
      }
    }
  } catch {
    /* le registre est faillible : l'absence de réponse n'est pas un verdict */
  }
  cacheApe.set(cle, res);
  await new Promise((ok) => setTimeout(ok, 120)); // le registre plafonne à ~7 req/s
  return res;
}

// ── TÉMOIN ────────────────────────────────────────────────────────────────
const TEMOIN = [
  { motif: /VOLTELEC/i, attendu: true, quoi: "installateur de climatisation" },
  { motif: /AUTOPEINT/i, attendu: false, quoi: "carrosserie automobile" },
  { motif: /First Stop Ayme|ESTOURNET PNEUS|LEFRANCOIS PNEUS/i, attendu: false, quoi: "vendeur de pneus" },
];
console.log(`\n══ TÉMOIN — entreprises dont je connais le métier par leurs lignes ══`);
let ratesT = 0;
let trouvesT = 0;
for (const t of TEMOIN) {
  const d = docs.find((x) => t.motif.test(x.nom ?? ""));
  if (!d) {
    console.log(`   ⚠️ introuvable dans le corpus : ${t.quoi}`);
    continue;
  }
  const a = await apeDe(d);
  trouvesT++;
  const ok = a?.ape ? dansLePerimetre(a.ape) === t.attendu : null;
  if (ok === false) ratesT++;
  console.log(
    `   ${ok === null ? "…" : ok ? "✓" : "🔴"} ${d.nom?.slice(0, 26).padEnd(27)} APE ${a?.ape ?? "introuvable"} — ${a?.libelle?.slice(0, 44) ?? ""}`,
  );
}
if (ratesT) {
  console.log(`   🔴 TÉMOIN FAUX — ${ratesT} métier(s) mal classé(s) par l'APE. Le signal ne tient pas.`);
  process.exit(1);
}
if (trouvesT < 2) {
  console.log("   🔴 moins de 2 cas retrouvés : témoin trop maigre.");
  process.exit(1);
}
console.log("   ✓ l'APE range correctement les métiers connus.\n");

// ── Le corpus ─────────────────────────────────────────────────────────────
const resultats = [];
for (const [i, d] of docs.entries()) {
  const a = await apeDe(d);
  resultats.push({ d, a });
  if (i % 20 === 0) process.stdout.write(`\r  ${i}/${docs.length}`);
}
console.log(`\r  ${docs.length}/${docs.length}\n`);

const retrouves = resultats.filter((x) => x.a?.ape);
const hors = retrouves.filter((x) => !dansLePerimetre(x.a.ape));
console.log(`══ ${docs.length} documents · entreprise retrouvée au registre : ${retrouves.length} (${Math.round((retrouves.length / docs.length) * 100)} %) ══`);
console.log(`   APE HORS périmètre : ${hors.length}\n`);

const parApe = new Map();
for (const x of hors) {
  const k = `${x.a.ape} — ${x.a.libelle ?? ""}`;
  if (!parApe.has(k)) parApe.set(k, []);
  parApe.get(k).push(x);
}
console.log(`── Les APE hors périmètre, par fréquence ──`);
for (const [k, xs] of [...parApe.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n  ${k}  (${xs.length} document${xs.length > 1 ? "s" : ""})`);
  for (const x of xs.slice(0, 4)) {
    console.log(`     ${x.d.nom?.slice(0, 30).padEnd(31)} type=${x.d.type} · ${x.d.lignes[0]?.slice(0, 46)}`);
  }
}

console.log(`\n🔴 L'APE SEUL NE PEUT PAS SERVIR DE REFUS : les 84 ci-dessus sont, en très`);
console.log(`   grande majorité, de VRAIS devis de bâtiment. Un artisan déclare son code une`);
console.log(`   fois et ne le change jamais — un poseur de gouttières en « fabrication`);
console.log(`   d'articles métalliques », un installateur de poêles en « commerce de détail ».\n`);

// ── LA CONJONCTION — ce que Johan a réellement proposé ─────────────────────
//
// « si ça ressort comme une entreprise hors BTP **+ mots clés** alors on est
// sûr que c'est hors scope, donc pas la peine de multiplier les mots-clés ».
//
// Deux signaux INDÉPENDANTS qui doivent concorder : l'IDENTITÉ de l'émetteur
// (registre) et l'OBJET des lignes (texte). C'est le motif de
// `detectQuoteCountry` — un signal seul ne suffit pas, leur rencontre oui.
// Et l'intérêt est exactement celui qu'il énonce : la liste de mots-clés n'a
// plus besoin d'être exhaustive, puisqu'elle ne décide plus toute seule.
const CLE = lire("GOOGLE_API_KEY");
const CONSIGNE = `Ces prestations portent-elles sur un BÂTIMENT (maison, appartement, local) ou sur son TERRAIN (jardin, clôture, piscine, allée, assainissement) ?

Réponds "batiment" si oui, même partiellement.
Réponds "hors" si elles portent sur un véhicule, un bateau, un appareil, du mobilier livré sans pose, un service à la personne, un acte médical ou vétérinaire, de l'informatique.
Réponds "incertain" si on ne peut pas trancher.

⚠️ « câblage », « caisson », « installation », « main d'œuvre », « sur mesure » existent dans les deux mondes : ce qui tranche est l'OBJET, pas le verbe.

JSON seul : {"verdict":"batiment|hors|incertain"}`;

const jugerTexte = async (d) => {
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CLE}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${CONSIGNE}\n\nLIGNES :\n${d.lignes.slice(0, 12).map((l) => `- ${l.slice(0, 100)}`).join("\n")}` }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 8192, responseMimeType: "application/json" },
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!r.ok) return null;
    const t = (await r.json())?.candidates?.[0]?.content?.parts?.[0]?.text;
    const b = String(t ?? "").match(/\{[\s\S]*\}/);
    return b ? JSON.parse(b[0]).verdict : null;
  } catch {
    return null;
  }
};

console.log(`── LA CONJONCTION : APE hors périmètre ET lignes non-bâtiment ──\n`);
const avis = new Map();
for (let i = 0; i < resultats.length; i += 8) {
  const lot = resultats.slice(i, i + 8);
  const out = await Promise.all(lot.map((x) => jugerTexte(x.d)));
  lot.forEach((x, k) => avis.set(x.d.fichier, out[k]));
  process.stdout.write(`\r  ${Math.min(i + 8, resultats.length)}/${resultats.length}`);
}
console.log("\n");

const texteHors = resultats.filter((x) => avis.get(x.d.fichier) === "hors");
const apeHors = resultats.filter((x) => x.a?.ape && !dansLePerimetre(x.a.ape));
const lesDeux = resultats.filter(
  (x) => avis.get(x.d.fichier) === "hors" && x.a?.ape && !dansLePerimetre(x.a.ape),
);
const texteSeul = texteHors.filter((x) => !(x.a?.ape && !dansLePerimetre(x.a.ape)));

console.log(`   signal TEXTE seul  : ${texteHors.length} documents`);
console.log(`   signal APE seul    : ${apeHors.length} documents`);
console.log(`   LES DEUX ensemble  : ${lesDeux.length} documents\n`);

console.log(`── Ce que la CONJONCTION retiendrait ──`);
for (const x of lesDeux) {
  console.log(`  ${x.a.ape.padEnd(8)} ${String(x.d.nom).slice(0, 26).padEnd(27)} type=${x.d.type} · review=${x.d.review}`);
  console.log(`           ${x.d.lignes[0]?.slice(0, 66)}`);
}

console.log(`\n── Ce qu'elle RATERAIT (texte hors, mais APE du bâtiment ou introuvable) ──`);
for (const x of texteSeul) {
  console.log(`  ${String(x.a?.ape ?? "introuvable").padEnd(12)} ${String(x.d.nom).slice(0, 26).padEnd(27)} ${x.d.lignes[0]?.slice(0, 50)}`);
}
