/**
 * scripts/banc-vocabulaire-categorie.mjs
 *
 * 2026-09-11 — DONNER À LA CATÉGORIE UN VOCABULAIRE FERMÉ CHANGE-T-IL QUELQUE CHOSE ?
 *
 * Mesuré la veille : sur 100 lignes dont le prix est AFFICHÉ, la catégorie
 * produite à l'extraction est **fausse dans 10 % des cas** et n'est qu'un titre
 * de section recopié du devis dans 14 %. Cause : le gabarit JSON d'`extract.ts`
 * dit littéralement `"categorie": "categorie"` — aucune consigne, aucun
 * dictionnaire. Ce banc teste le correctif évident : imposer la liste fermée
 * des 33 métiers du catalogue.
 *
 * ── Trois phases, et la troisième est la seule qui décide ──────────────────
 *
 *   --classer   re-classe les MÊMES lignes avec deux consignes : LIBRE (la
 *               règle actuelle, texte libre) et FERMÉ (la liste des 33
 *               métiers). Les deux en mode autonome : c'est ce qui isole le
 *               vocabulaire, seule variable qui change entre les deux.
 *   --juger     note les trois catégories de chaque ligne (production, LIBRE,
 *               FERMÉ) avec la rubrique EXACTE de la veille — juste / large /
 *               titre de section / fausse — donc directement comparable au
 *               repère 69 / 7 / 14 / 10.
 *   --rapprocher  rejoue le rapprochement avec la catégorie FERMÉE et fait
 *               arbitrer les références qui changent.
 *
 * 🔴 LA PHASE 3 N'EST PAS UNE FORMALITÉ, C'EST LE POINT DE LA MESURE. Le banc
 * de la veille a montré qu'une catégorie mieux rangée n'est PAS automatiquement
 * un meilleur rapprochement : retirer les titres de section améliorait l'étalon
 * (+2/−0) et dégradait le stock (10 contre 4 sur les prix affichés). Une
 * catégorie plus propre ne vaut que si elle est plus JUSTE, et surtout que si
 * elle déplace le rapprochement dans le bon sens. Tant que --rapprocher n'a pas
 * parlé, rien ne part en production.
 *
 * ⚠️ CE BANC NE MESURE PAS LA PRODUCTION EXACTE. En production la catégorie est
 * l'un des quarante champs d'une extraction qui lit tout le PDF ; ici elle est
 * demandée seule. Les deux variantes subissent le même biais, donc la
 * COMPARAISON est valide — mais un gain mesuré ici doit être reconfirmé par une
 * vraie re-extraction avant d'être livré (`--in-situ`).
 *
 * Usage :
 *   node scripts/banc-vocabulaire-categorie.mjs --classer
 *   node scripts/banc-vocabulaire-categorie.mjs --juger
 *   node scripts/banc-vocabulaire-categorie.mjs --rapprocher
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const CLE = lire("GOOGLE_API_KEY");
const MODELE_IA = "gemini-2.5-pro";
const MODELE_EXTRACTION = "gemini-2.5-flash"; // celui de la production (extract.ts)
const MODELE_EMB = "models/gemini-embedding-001";
const ETAT = "scratch/vocabulaire-categorie.json";
const N = 100;

fs.mkdirSync("scratch", { recursive: true });
const etat = fs.existsSync(ETAT) ? JSON.parse(fs.readFileSync(ETAT, "utf8")) : {};
const sauver = () => fs.writeFileSync(ETAT, JSON.stringify(etat, null, 1));

const utilisable = (v) => v && String(v).trim() && String(v).trim().toLowerCase() !== "autre";
const pc = (n, d) => (d ? Math.round((n / d) * 100) + " %" : "—");

// ════════════════════════════════════════════════════════════════════════════
// LE VOCABULAIRE — celui du catalogue, pas une invention
// ════════════════════════════════════════════════════════════════════════════
// Les 33 valeurs de `market_prices.metier`. Le choix n'est pas cosmétique : si
// la catégorie parle la MÊME langue que le catalogue, elle cesse d'être un mot
// au hasard dans l'embedding et devient une information de même nature que ce
// qu'on lui oppose. Chaque entrée porte une glose courte — sans elle le modèle
// devine ce que `petits_ouvrages_divers` recouvre.
const VOCABULAIRE = [
  ["maconnerie_structure", "murs, dalles, fondations, ouvertures, gros œuvre"],
  ["demolition_depose", "démolition, dépose, évacuation de l'existant"],
  ["charpente_bois", "charpente, fermettes, ossature bois"],
  ["toiture_couverture", "tuiles, ardoises, zinguerie, gouttières, étanchéité toiture"],
  ["facade_ravalement", "enduits de façade, ravalement, nettoyage de façade"],
  ["bardage_exterieur", "bardage bois, composite, métallique"],
  ["placo_isolation", "cloisons, doublages, plafonds, isolation thermique ou phonique"],
  ["menuiserie_vitrages", "fenêtres, portes, baies, volets, escaliers, placards"],
  ["stores_occultation", "stores, pergolas, volets roulants motorisés, moustiquaires"],
  ["metallerie_serrurerie", "garde-corps, portails métalliques, serrurerie, structures acier"],
  ["electricite", "tableaux, prises, points lumineux, câblage, mise aux normes"],
  ["plomberie_sanitaires", "réseaux d'eau, évacuations, WC, douches, robinetterie"],
  ["chauffage", "chaudières, radiateurs, pompes à chaleur, poêles, plancher chauffant"],
  ["cvc_ventilation", "climatisation, VMC, ventilation, traitement d'air"],
  ["carrelage_faience", "carrelage, faïence, mosaïque, chape et ragréage associés"],
  ["sols_durs", "parquet, pierre naturelle, béton ciré, terrasse"],
  ["sols_souples", "moquette, vinyle, lino, sols PVC"],
  ["peinture_revetements", "peinture, papier peint, enduits de lissage, ponçage"],
  ["cuisine_agencement", "cuisine équipée, dressings, agencement sur mesure, salle de bains meublée"],
  ["ouvrages_vrd", "terrassement, réseaux enterrés, enrobé, pavage, assainissement de surface"],
  ["ouvrages_paysagisme", "clôtures, portails de jardin, plantations, engazonnement"],
  ["ouvrages_piscine", "bassin, filtration, liner, plage de piscine"],
  ["ouvrages_anc", "assainissement non collectif, fosse, micro-station, filtre"],
  ["ouvrages_photovoltaique", "panneaux solaires, onduleurs, batteries"],
  ["ouvrages_geothermie", "forage, capteurs enterrés, géothermie"],
  ["ouvrages_ascenseur", "ascenseur, monte-escalier, plateforme élévatrice"],
  ["domotique_securite", "alarme, vidéosurveillance, domotique, contrôle d'accès"],
  ["energie_environnement", "récupération d'eau, traitement de l'air ou de l'eau, désamiantage"],
  ["diagnostic_reglementaire", "DPE, amiante, plomb, Carrez, études thermiques, Consuel"],
  ["prestations_intellectuelles", "maîtrise d'œuvre, architecte, bureau d'études, permis, suivi de chantier"],
  ["logistique_chantier", "échafaudage, location de matériel, benne, livraison, nettoyage de fin de chantier"],
  ["forfait_renovation_globale", "rénovation complète d'un logement, tous corps d'état confondus"],
  ["petits_ouvrages_divers", "petits travaux ne relevant d'aucune des familles ci-dessus"],
];

const CONSIGNE_FERMEE = `Classe chaque ligne de devis dans EXACTEMENT UNE des familles de métier ci-dessous.
Réponds par l'identifiant exact de la famille, jamais par un autre mot.
Si aucune ne convient, réponds "autre" — mais c'est un dernier recours.

FAMILLES AUTORISÉES :
${VOCABULAIRE.map(([id, gloss]) => `- ${id} : ${gloss}`).join("\n")}

RÈGLES :
- La famille décrit ce que FAIT la ligne, pas la pièce où elle se fait ("SALLE DE BAIN" n'est pas une famille) ni le titre du paragraphe du devis.
- Une DÉPOSE ou une DÉMOLITION relève de demolition_depose, même si l'ouvrage déposé relève d'un autre métier.
- Ne déduis jamais la famille du nom commercial ou des services affichés en en-tête du devis.`;

// La consigne LIBRE reproduit la règle réellement en vigueur — `domain-config.ts`
// ligne 48. La citer telle quelle est ce qui rend la comparaison honnête : on
// oppose le vocabulaire fermé à ce qui tourne, pas à un homme de paille.
const CONSIGNE_LIBRE = `Donne pour chaque ligne de devis sa "categorie".
Ce champ doit refléter UNIQUEMENT le type de travaux décrit dans la ligne du devis (ex: "pavage", "carrelage", "chape", "terrassement", "maçonnerie").
NE JAMAIS déduire la catégorie depuis le nom commercial, le slogan ou la liste de services de l'entreprise visibles dans l'en-tête.`;

// ════════════════════════════════════════════════════════════════════════════
// Chargement du stock — MÊME code et MÊME tirage que `banc-categorie.mjs`,
// pour que les chiffres soient comparables au repère de la veille.
// ════════════════════════════════════════════════════════════════════════════
async function echantillon() {
  if (etat.lignes) return etat.lignes;
  let debut = 0; const analyses = [];
  for (;;) {
    const { data, error } = await supa
      .from("analyses").select("id,user_id,file_name,created_at,raw_text")
      .eq("status", "completed").order("created_at", { ascending: false })
      .range(debut, debut + 499);
    if (error) throw error;
    analyses.push(...data);
    if (data.length < 500) break;
    debut += 500;
  }
  const vus = new Set(); const lignes = [];
  for (const a of analyses) {
    let brut;
    try { brut = typeof a.raw_text === "string" ? JSON.parse(a.raw_text) : a.raw_text; } catch { continue; }
    const groupes = Array.isArray(brut?.n8n_price_data) ? brut.n8n_price_data : [];
    if (!groupes.length || !groupes.some((g) => g?.vectorial)) continue;
    const cle = `${a.user_id}|${(a.file_name ?? "").replace(/\s*\(\d+\)(?=\.[a-z]+$)/i, "")}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    const travaux = new Map();
    for (const t of brut?.extracted?.travaux ?? []) if (t?.libelle) travaux.set(String(t.libelle).trim(), t);
    for (const g of groupes) {
      const v = g?.vectorial;
      if (!v) continue;
      const desc = String(g.devis_lines?.[0]?.description ?? "").trim();
      if (!desc) continue;
      const t = travaux.get(desc);
      lignes.push({
        desc, cat: t?.categorie ? String(t.categorie).trim() : null,
        unite: String(t?.unite ?? g.devis_lines?.[0]?.unit ?? g.main_unit ?? "").trim() || null,
        montant: Number(g.devis_total_ht ?? 0) || 0,
        confiance: v.confidence, label: g.job_type_label ?? null,
      });
    }
  }
  const hautes = lignes.filter((l) => l.confiance === "high" && utilisable(l.cat));
  let x = 987654321;
  const alea = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  etat.lignes = [...hautes].sort(() => alea() - 0.5).slice(0, N);
  console.log(`stock : ${vus.size} documents · ${lignes.length} lignes · échantillon ${etat.lignes.length} en confiance haute`);
  sauver();
  return etat.lignes;
}

async function gemini(prompt, modele = MODELE_IA) {
  for (let essai = 0; essai < 4; essai++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${CLE}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 32768, responseMimeType: "application/json" },
      }),
    });
    if (!r.ok) { await new Promise((s) => setTimeout(s, 2500 * (essai + 1))); continue; }
    const t = (await r.json()).candidates?.[0]?.content?.parts?.[0]?.text;
    if (!t) continue;
    try { return JSON.parse(t); } catch { continue; }
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 1 — re-classer les mêmes lignes avec les deux consignes
// ════════════════════════════════════════════════════════════════════════════
if (process.argv.includes("--classer")) {
  const lignes = await echantillon();
  // Par lots de 20 : c'est ainsi que la production travaille (toutes les lignes
  // d'un devis d'un coup), et une ligne isolée serait un exercice plus facile
  // que celui qu'on veut mesurer.
  for (const [nom, consigne] of [["libre", CONSIGNE_LIBRE], ["ferme", CONSIGNE_FERMEE]]) {
    const cle = `cat_${nom}`;
    if (etat[cle]?.length === lignes.length) { console.log(`${nom} : déjà fait`); continue; }
    const out = [];
    for (let i = 0; i < lignes.length; i += 20) {
      const lot = lignes.slice(i, i + 20);
      const prompt = `${consigne}

Réponds uniquement en JSON : {"categories": ["...", "..."]} — un élément par ligne, dans le même ordre, ${lot.length} éléments.

LIGNES DE DEVIS :
${lot.map((l, k) => `${k + 1}. ${l.desc.replace(/\s+/g, " ").slice(0, 200)}`).join("\n")}`;
      const j = await gemini(prompt, MODELE_EXTRACTION);
      const arr = Array.isArray(j?.categories) ? j.categories : [];
      for (let k = 0; k < lot.length; k++) out.push(arr[k] ? String(arr[k]).trim() : null);
      process.stdout.write(`\r  ${nom} : ${out.length}/${lignes.length}`);
    }
    etat[cle] = out; sauver();
    console.log();
  }

  const lib = etat.cat_libre, fer = etat.cat_ferme;
  const hors = fer.filter((c) => c && c !== "autre" && !VOCABULAIRE.some(([id]) => id === c));
  console.log(`\nvocabulaire respecté : ${fer.length - hors.length}/${fer.length}${hors.length ? ` — hors liste : ${[...new Set(hors)].join(", ")}` : ""}`);
  const memeQueProd = lignes.filter((l, i) => String(l.cat).toLowerCase() === String(fer[i]).toLowerCase()).length;
  console.log(`identique à la catégorie de production : ${memeQueProd}/${lignes.length} (${pc(memeQueProd, lignes.length)})`);
  console.log("\nrépartition FERMÉ :");
  const rep = new Map();
  for (const c of fer) rep.set(c, (rep.get(c) ?? 0) + 1);
  [...rep.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => console.log(`  ${String(v).padStart(3)}  ${k}`));
  console.log("\n10 exemples :");
  for (let i = 0; i < 10; i++) {
    console.log(`  « ${lignes[i].desc.replace(/\s+/g, " ").slice(0, 54)} »`);
    console.log(`     prod ${String(lignes[i].cat).replace(/\s+/g, " ").slice(0, 34).padEnd(35)} libre ${String(lib[i]).slice(0, 24).padEnd(25)} fermé ${fer[i]}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 2 — noter les trois catégories avec la rubrique de la veille
// ════════════════════════════════════════════════════════════════════════════
if (process.argv.includes("--juger")) {
  const lignes = await echantillon();
  if (!etat.cat_ferme) throw new Error("lancer d'abord --classer");
  const VARIANTES = { prod: lignes.map((l) => l.cat), libre: etat.cat_libre, ferme: etat.cat_ferme };

  for (const [nom, cats] of Object.entries(VARIANTES)) {
    const cle = `juge_${nom}`;
    if (etat[cle]?.length === lignes.length) { console.log(`${nom} : déjà jugé`); continue; }
    const out = [];
    // 6 en parallèle : la mesure n'en est pas changée, seul le temps l'est.
    for (let i = 0; i < lignes.length; i += 6) {
      const lot = lignes.slice(i, i + 6);
      const res = await Promise.all(lot.map((l, k) => {
        const c = cats[i + k];
        if (!utilisable(c)) return Promise.resolve({ verdict: "nul", raison: "catégorie absente" });
        return gemini(`Voici une ligne de devis d'artisan et la CATÉGORIE que notre lecteur automatique lui a attribuée.
La catégorie décrit-elle correctement la nature des travaux de cette ligne ?

Réponds uniquement en JSON : {"verdict": "juste" | "large" | "fausse" | "titre", "raison": "<12 mots max>"}
  juste  = la catégorie nomme bien le métier ou l'ouvrage de la ligne
  large  = correcte mais trop générale pour distinguer quoi que ce soit ("travaux")
  fausse = elle désigne un AUTRE métier ou une AUTRE étape que ce que fait la ligne
  titre  = ce n'est pas une catégorie mais un intitulé de section recopié du devis

LIGNE : ${l.desc}
CATÉGORIE : ${c}`);
      }));
      out.push(...res.map((r) => ({ verdict: String(r?.verdict ?? "nul"), raison: String(r?.raison ?? "").slice(0, 70) })));
      process.stdout.write(`\r  ${nom} : ${out.length}/${lignes.length}`);
    }
    etat[cle] = out; sauver();
    console.log();
  }

  console.log("\nvariante      juste    large    titre   FAUSSE");
  for (const nom of Object.keys(VARIANTES)) {
    const v = etat[`juge_${nom}`];
    const c = (k) => v.filter((x) => x.verdict === k).length;
    const lib = { prod: "production  ", libre: "libre       ", ferme: "vocab. fermé" }[nom];
    console.log(`${lib}  ${String(c("juste")).padStart(3)} ${pc(c("juste"), v.length).padStart(6)}  ${String(c("large")).padStart(3)}  ${String(c("titre")).padStart(3)}  ${String(c("fausse")).padStart(3)} ${pc(c("fausse"), v.length).padStart(6)}`);
  }
  // Les lignes que le vocabulaire fermé RATE alors que la production avait juste :
  // c'est le coût de la règle, et il doit être lu, pas résumé.
  console.log("\nrégressions (production juste → fermé faux) :");
  let n = 0;
  for (let i = 0; i < lignes.length; i++) {
    if (etat.juge_prod[i].verdict === "juste" && etat.juge_ferme[i].verdict === "fausse") {
      n++;
      console.log(`  « ${lignes[i].desc.replace(/\s+/g, " ").slice(0, 52)} »`);
      console.log(`     prod ${lignes[i].cat}  →  fermé ${etat.cat_ferme[i]}  (${etat.juge_ferme[i].raison})`);
    }
  }
  if (!n) console.log("  aucune.");
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 4 — contre l'ÉTALON, c'est-à-dire contre deux juges et non un arbitre
// ════════════════════════════════════════════════════════════════════════════
// L'arbitrage de la phase 3 compare deux candidats à un juge unique. L'étalon
// de consensus, lui, dit quelle entrée est la bonne — et il a été relu par un
// humain ET par un modèle. Si une catégorie plus juste servait le rapprochement,
// le score de l'étalon devrait monter. Repère à battre : 39/48 en tête.
if (process.argv.includes("--etalon")) {
  const { data: etalon, error } = await supa.from("match_gold_standard").select("*").order("id");
  if (error) throw error;
  const lignes = etalon.map((l) => ({ ...l, cat: l.contexte?.categorie ?? null, unite: l.contexte?.unite ?? null }));

  for (const [nom, consigne] of [["libre", CONSIGNE_LIBRE], ["ferme", CONSIGNE_FERMEE]]) {
    const cle = `etalon_cat_${nom}`;
    if (etat[cle]?.length === lignes.length) continue;
    const out = [];
    for (let i = 0; i < lignes.length; i += 20) {
      const lot = lignes.slice(i, i + 20);
      const j = await gemini(`${consigne}

Réponds uniquement en JSON : {"categories": ["...", "..."]} — un élément par ligne, dans le même ordre, ${lot.length} éléments.

LIGNES DE DEVIS :
${lot.map((l, k) => `${k + 1}. ${String(l.ligne_devis).replace(/\s+/g, " ").slice(0, 200)}`).join("\n")}`, MODELE_EXTRACTION);
      const arr = Array.isArray(j?.categories) ? j.categories : [];
      for (let k = 0; k < lot.length; k++) out.push(arr[k] ? String(arr[k]).trim() : null);
      process.stdout.write(`\r  ${nom} : ${out.length}/${lignes.length}`);
    }
    etat[cle] = out; sauver();
    console.log();
  }

  const norme = (v) => { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i]; return Math.sqrt(s); };
  let d = 0; const brut = [];
  for (;;) {
    const { data, error: e } = await supa.from("market_prices").select("job_type,label,embedding").range(d, d + 499);
    if (e) throw e;
    brut.push(...data);
    if (data.length < 500) break;
    d += 500;
  }
  const catalogue = brut.filter((r) => r.embedding).map((r) => {
    const vec = Float64Array.from(typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding);
    return { job_type: r.job_type, label: r.label, vec, norme: norme(vec) };
  });
  console.log(`catalogue : ${catalogue.length} entrées`);

  const requete = (desc, cat, unite) => {
    const p = [String(desc).trim()];
    if (utilisable(cat)) p.push(`Catégorie : ${String(cat).trim()}`);
    if (unite && String(unite).trim()) p.push(`Unité : ${String(unite).trim()}`);
    return p.join(". ");
  };
  async function embarquer(textes, nom) {
    const f = `scratch/voc-etalon-${nom}.bin`;
    if (fs.existsSync(f)) {
      const b = fs.readFileSync(f); const a = new Float64Array(b.buffer, b.byteOffset, b.length / 8);
      if (a.length === textes.length * 768) return Array.from({ length: textes.length }, (_, i) => a.subarray(i * 768, (i + 1) * 768));
    }
    const out = [];
    for (let i = 0; i < textes.length; i += 50) {
      const lot = textes.slice(i, i + 50);
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${MODELE_EMB}:batchEmbedContents?key=${CLE}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests: lot.map((t) => ({ model: MODELE_EMB, content: { parts: [{ text: t }] }, taskType: "RETRIEVAL_QUERY", outputDimensionality: 768 })) }),
      });
      if (!r.ok) throw new Error(`Gemini ${r.status} : ${(await r.text()).slice(0, 200)}`);
      out.push(...((await r.json()).embeddings ?? []).map((e) => Float64Array.from(e.values)));
    }
    const flat = new Float64Array(out.length * 768); out.forEach((x, i) => flat.set(x, i * 768));
    fs.writeFileSync(f, Buffer.from(flat.buffer));
    return out;
  }
  const top5 = (v) => {
    const nq = norme(v);
    return catalogue.map((r) => {
      let s = 0; for (let i = 0; i < 768; i++) s += v[i] * r.vec[i];
      return { job_type: r.job_type, label: r.label, similarity: s / (nq * r.norme) };
    }).sort((a, b) => b.similarity - a.similarity).slice(0, 5);
  };

  const VAR = {
    P: lignes.map((l) => requete(l.ligne_devis, l.cat, l.unite)),
    libre: lignes.map((l, i) => requete(l.ligne_devis, etat.etalon_cat_libre[i], l.unite)),
    ferme: lignes.map((l, i) => requete(l.ligne_devis, etat.etalon_cat_ferme[i], l.unite)),
  };
  const classe = {};
  for (const [nom, textes] of Object.entries(VAR)) {
    const v = await embarquer(textes, nom);
    classe[nom] = new Map(lignes.map((l, i) => [l.id, top5(v[i])]));
  }

  const attendus = (r) => (r === "0" ? [0] : String(r).split("|").map(Number));
  const jugeables = [];
  for (const l of lignes) {
    if (!l.consensus) continue;
    const rs = attendus(l.reponse_humaine);
    if (rs[0] === 0) continue;
    const bons = new Set(rs.map((r) => l.candidats.find((c) => c.rang === r)?.job_type).filter(Boolean));
    if (bons.size) jugeables.push({ ...l, bons });
  }
  console.log(`\nétalon de consensus, lignes notées : ${jugeables.length}`);
  console.log("variante        rang 1       rang ≤5");
  const parLigne = {};
  for (const nom of Object.keys(VAR)) {
    let r1 = 0, r5 = 0; parLigne[nom] = new Map();
    for (const l of jugeables) {
      const r = (classe[nom].get(l.id) ?? []).findIndex((c) => l.bons.has(c.job_type)) + 1;
      parLigne[nom].set(l.id, r);
      if (r === 1) r1++;
      if (r >= 1) r5++;
    }
    const lib = { P: "production   ", libre: "libre        ", ferme: "vocab. fermé " }[nom];
    console.log(`${lib}  ${String(r1).padStart(3)} ${pc(r1, jugeables.length).padStart(6)}   ${String(r5).padStart(3)} ${pc(r5, jugeables.length).padStart(6)}`);
  }
  for (const nom of ["libre", "ferme"]) {
    const g = jugeables.filter((l) => parLigne.P.get(l.id) !== 1 && parLigne[nom].get(l.id) === 1);
    const p = jugeables.filter((l) => parLigne.P.get(l.id) === 1 && parLigne[nom].get(l.id) !== 1);
    console.log(`\n${nom} : +${g.length} / −${p.length}`);
    for (const [t, arr] of [["gagnées", g], ["perdues", p]]) {
      for (const l of arr) {
        console.log(`  ${t.padEnd(8)} ${l.id}  « ${String(l.ligne_devis).replace(/\s+/g, " ").slice(0, 44)} »  ${String(l.cat).replace(/\s+/g, " ").slice(0, 24)} → ${etat[`etalon_cat_${nom}`][lignes.findIndex((x) => x.id === l.id)]}`);
      }
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 3 — le rapprochement bouge-t-il dans le bon sens ?
// ════════════════════════════════════════════════════════════════════════════
if (process.argv.includes("--rapprocher")) {
  const lignes = await echantillon();
  if (!etat.cat_ferme) throw new Error("lancer d'abord --classer");

  const norme = (v) => { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i]; return Math.sqrt(s); };
  let d = 0; const brut = [];
  for (;;) {
    const { data, error } = await supa.from("market_prices").select("job_type,label,embedding").range(d, d + 499);
    if (error) throw error;
    brut.push(...data);
    if (data.length < 500) break;
    d += 500;
  }
  const catalogue = brut.filter((r) => r.embedding).map((r) => {
    const vec = Float64Array.from(typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding);
    return { job_type: r.job_type, label: r.label, vec, norme: norme(vec) };
  });
  console.log(`catalogue : ${catalogue.length} entrées`);

  const requete = (desc, cat, unite) => {
    const p = [String(desc).trim()];
    if (utilisable(cat)) p.push(`Catégorie : ${String(cat).trim()}`);
    if (unite && String(unite).trim()) p.push(`Unité : ${String(unite).trim()}`);
    return p.join(". ");
  };
  async function embarquer(textes, nom) {
    const f = `scratch/voc-${nom}.bin`;
    if (fs.existsSync(f)) {
      const b = fs.readFileSync(f); const a = new Float64Array(b.buffer, b.byteOffset, b.length / 8);
      if (a.length === textes.length * 768) return Array.from({ length: textes.length }, (_, i) => a.subarray(i * 768, (i + 1) * 768));
    }
    const out = [];
    for (let i = 0; i < textes.length; i += 50) {
      const lot = textes.slice(i, i + 50);
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${MODELE_EMB}:batchEmbedContents?key=${CLE}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests: lot.map((t) => ({ model: MODELE_EMB, content: { parts: [{ text: t }] }, taskType: "RETRIEVAL_QUERY", outputDimensionality: 768 })) }),
      });
      if (!r.ok) throw new Error(`Gemini ${r.status} : ${(await r.text()).slice(0, 200)}`);
      out.push(...((await r.json()).embeddings ?? []).map((e) => Float64Array.from(e.values)));
      process.stdout.write(`\r  ${nom} : ${out.length}/${textes.length}`);
    }
    process.stdout.write("\n");
    const flat = new Float64Array(out.length * 768); out.forEach((x, i) => flat.set(x, i * 768));
    fs.writeFileSync(f, Buffer.from(flat.buffer));
    return out;
  }
  const premier = (v) => {
    const nq = norme(v); let best = null;
    for (const r of catalogue) {
      let s = 0; for (let i = 0; i < 768; i++) s += v[i] * r.vec[i];
      s /= nq * r.norme;
      if (!best || s > best.similarity) best = { job_type: r.job_type, label: r.label, similarity: s };
    }
    return best;
  };

  const vProd = await embarquer(lignes.map((l) => requete(l.desc, l.cat, l.unite)), "prod");

  // ⚠️ Le témoin de la prod EST son propre rapprochement stocké : si mon
  // classement local ne le retrouve pas, je ne mesure pas la production.
  const memeQueStock = lignes.filter((l, i) => premier(vProd[i])?.label === l.label).length;
  console.log(`témoin — top-1 local identique au rapprochement stocké : ${memeQueStock}/${lignes.length} (${pc(memeQueStock, lignes.length)})`);

  // Les DEUX variantes passent l'épreuve : le vocabulaire fermé parce que
  // c'était l'hypothèse de départ, le texte libre parce que la phase 2 le donne
  // nettement plus juste — et qu'une hypothèse réfutée ne dispense pas de
  // mesurer celle qui l'a remplacée.
  for (const variante of ["libre", "ferme"]) {
    const cats = etat[`cat_${variante}`];
    const vAutre = await embarquer(lignes.map((l, i) => requete(l.desc, cats[i], l.unite)), variante);
    const changes = [];
    for (let i = 0; i < lignes.length; i++) {
      const a = premier(vProd[i]), b = premier(vAutre[i]);
      if (a && b && a.job_type !== b.job_type) changes.push({ i, l: lignes[i], a, b });
    }
    console.log(`\n\n══ ${variante.toUpperCase()} ══`);
    console.log(`référence changée : ${changes.length}/${lignes.length} (${pc(changes.length, lignes.length)}) — toutes en confiance haute, donc autant de prix affichés`);
    console.log(`montant concerné : ${Math.round(changes.reduce((s, c) => s + c.l.montant, 0))} €`);

    let pourProd = 0, pourNouveau = 0, aucun = 0;
    for (const [k, c] of changes.entries()) {
      const inverse = k % 2 === 1;
      const A = inverse ? c.b : c.a, B = inverse ? c.a : c.b;
      const j = await gemini(`Tu relis le rapprochement entre une LIGNE DE DEVIS d'artisan et notre catalogue de prix de référence.
Lequel des deux postes décrit LA MÊME PRESTATION que la ligne de devis ?
Ce n'est PAS une question de prix. Repères : un tarif "pose"/"MO" ne convient pas à une ligne qui fournit le matériel et inversement ; un composant ne vaut pas pour un lot entier ; une DÉPOSE n'est pas une POSE.
Réponds uniquement en JSON : {"choix": 1 | 2 | 0, "raison": "<15 mots max>"}  (0 = aucun des deux)

LIGNE DE DEVIS : ${c.l.desc}
Unité : ${c.l.unite ?? "non précisée"}

1. ${A.label}
2. ${B.label}`);
      const ch = Number(j?.choix);
      const gagnant = !ch ? "aucun" : (ch === 1 ? A : B) === c.a ? "PRODUCTION" : "NOUVELLE";
      if (gagnant === "PRODUCTION") pourProd++; else if (gagnant === "NOUVELLE") pourNouveau++; else aucun++;
      console.log(`\n « ${c.l.desc.replace(/\s+/g, " ").slice(0, 54)} »  ${Math.round(c.l.montant)} €`);
      console.log(`    catégorie  ${String(c.l.cat).replace(/\s+/g, " ").slice(0, 30)}  →  ${cats[c.i]}`);
      console.log(`    prod     : ${c.a.label.slice(0, 44)} (${c.a.similarity.toFixed(3)})`);
      console.log(`    ${variante.padEnd(8)} : ${c.b.label.slice(0, 44)} (${c.b.similarity.toFixed(3)})`);
      console.log(`    → ${gagnant}  (${String(j?.raison ?? "").slice(0, 70)})`);
    }
    console.log(`\nBILAN ${variante.toUpperCase()} : production meilleure ${pourProd} fois · nouvelle catégorie meilleure ${pourNouveau} fois · indifférent ${aucun}`);
  }
}
