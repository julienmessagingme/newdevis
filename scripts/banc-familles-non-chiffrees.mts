/**
 * scripts/banc-familles-non-chiffrees.mts
 *
 * « Où porte l'effort ? » — sur les devis qui repartent SANS aucun montant,
 * quelles familles de prestations pèsent, et pour quelle RAISON ne sont-elles
 * pas chiffrées ?
 *
 * La question n'est pas « combien de devis sont muets » (déjà mesuré : 55 sur
 * 66 en 30 jours) mais **où va l'argent qu'on ne sait pas comparer**. Trois
 * causes appellent trois chantiers OPPOSÉS, et les confondre fait travailler
 * au mauvais endroit :
 *
 *   (A) aucune entrée trouvée              → le catalogue manque
 *   (B) une entrée trouvée, pas opposable  → le rapprochement est faible
 *   (C) opposable mais non chiffrable      → une garde s'applique (forfait, unité…)
 *   (D) chiffré, mais le prix est normal   → RIEN À CORRIGER, c'est un succès
 *
 * ⚠️ Le seau (D) est la raison d'être de ce banc : un devis « sans montant »
 * n'est pas forcément un devis qu'on n'a pas su lire. Le compter comme un
 * manque ferait surestimer le gisement.
 *
 * Lancement :  npx tsx scripts/banc-familles-non-chiffrees.mts [--jours=30]
 */

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

import { motifNonChiffrable } from "@/lib/analyse/surcoutServeur";
import { referenceOpposable } from "@/lib/analyse/referenceOpposable";
import { porteeAnalyse, porteeSuffisantePourAffirmer } from "@/lib/analyse/porteeAnalyse";

const require = createRequire(pathToFileURL(resolve(process.cwd(), "package.json")));
const { createClient } = require("@supabase/supabase-js");

// ── .env.local ───────────────────────────────────────────────────────────────
const env: Record<string, string> = {};
for (const ligne of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = ligne.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const supabase = createClient(
  env.PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const JOURS = Number(process.argv.find((a) => a.startsWith("--jours="))?.split("=")[1] ?? 30);
const PLANCHER_AFFICHAGE = 300; // sous ce montant, la page n'annonce rien

type Seau =
  | "A_catalogue_absent"
  | "B_rapprochement_faible"
  | "C_garde"
  | "D_prix_normal"
  | "E_ecart_sous_plancher";

/**
 * Les deux libellés de repli. « Autre » vient du groupeur, « Non comparable »
 * du matcher vectoriel quand la similarité tombe sous 0,50 — aucun des deux ne
 * porte de prix. ⚠️ Leur `job_type_label` ne décrit RIEN : pour savoir ce qu'on
 * ne sait pas chiffrer, il faut descendre aux lignes du devis.
 */
const LIBELLES_FOURRE_TOUT = new Set(["Autre", "Non comparable"]);

const parseJson = (v: unknown): any => {
  if (v && typeof v === "object") return v;
  if (typeof v !== "string") return null;
  try { return JSON.parse(v); } catch { return null; }
};

async function main() {
  const depuis = new Date(Date.now() - JOURS * 86_400_000).toISOString();

  // Le catalogue, pour rattacher chaque rapprochement à sa famille de métier.
  const metierParJobType = new Map<string, string>();
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("market_prices")
      .select("job_type, metier")
      .range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(`market_prices: ${error.message}`);
    for (const r of data ?? []) if (r.job_type) metierParJobType.set(r.job_type, r.metier ?? "(sans métier)");
    if (!data || data.length < 1000) break;
  }

  const { data: analyses, error } = await supabase
    .from("analyses")
    .select("id, created_at, user_id, file_name, conclusion_ia, raw_text")
    .eq("status", "completed")
    .gte("created_at", depuis)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`analyses: ${error.message}`);

  // ⚠️ Déduplication par DOCUMENT (règle du 07/09) : un même PDF redéposé crée
  // autant d'analyses que de dépôts — 17 % de gonflement mesuré sur le stock.
  const vus = new Set<string>();
  const documents: any[] = [];
  for (const a of analyses ?? []) {
    const cle = `${a.user_id}|${a.file_name}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    documents.push(a);
  }

  const vide = (): Record<Seau, number> => ({
    A_catalogue_absent: 0, B_rapprochement_faible: 0, C_garde: 0, D_prix_normal: 0, E_ecart_sous_plancher: 0,
  });
  const montantParSeau = vide();
  const postesParSeau = vide();
  // famille → { montant, postes } pour les seaux qui désignent un chantier
  const familles = new Map<
    string,
    { montant: number; postes: number; seaux: Record<Seau, number>; devis: Set<string> }
  >();
  /**
   * Seau B, le vrai gisement : quelle LIGNE de devis a trouvé QUELLE entrée
   * sans pouvoir l'opposer ? C'est ce couple qui dit s'il manque une entrée au
   * catalogue ou si le rapprochement est simplement faible.
   */
  const couplesB: Array<{ ligne: string; entree: string; sim: number; montant: number; fam: string }> = [];
  const motifs = new Map<string, { montant: number; postes: number }>();
  // Les lignes sans aucun rapprochement : on ne peut pas les rattacher à une
  // famille de catalogue (par définition), on les garde telles quelles.
  const sansReference: Array<{ label: string; montant: number; doc: string }> = [];

  let muets = 0;
  let chiffres = 0;
  const portee = { affirme: 0, tempere: 0, sansPortee: 0 };

  for (const doc of documents) {
    const ci = parseJson(doc.conclusion_ia);
    const raw = parseJson(doc.raw_text);
    const groupes = Array.isArray(raw?.n8n_price_data) ? raw.n8n_price_data : [];
    if (groupes.length === 0) continue;

    // ⚠️ Le champ est `anomalies`, PAS `anomalies_postes` — ma première version
    // testait un champ inexistant et trouvait 0 devis chiffré sur 70, ce que le
    // témoin de plausibilité ci-dessous refuse désormais.
    const surcoutMax = Number(ci?.surcout_global?.max ?? 0);
    const postesNommes = Array.isArray(ci?.anomalies) ? ci.anomalies.length : 0;
    const affiche = surcoutMax >= PLANCHER_AFFICHAGE && postesNommes > 0;
    if (affiche) { chiffres++; continue; }
    muets++;

    // Ce que la page dit AUJOURD'HUI de ce devis muet : avons-nous assez
    // vérifié pour affirmer « rien ne s'oppose », ou devons-nous tempérer ?
    const materiel = Array.isArray(ci?.materiel_verifie) ? ci.materiel_verifie : [];
    const p = porteeAnalyse(
      groupes,
      materiel.length,
      materiel.reduce((s: number, m: any) => s + (Number(m?.prix_unitaire_devis) || 0) * (Number(m?.quantite) || 1), 0),
    );
    if (p === null) portee.sansPortee++;
    else if (porteeSuffisantePourAffirmer(p)) portee.affirme++;
    else portee.tempere++;

    const totalHT = Number(raw?.extracted?.totaux?.ht ?? raw?.extracted_data?.totaux?.ht ?? 0) || null;

    for (const g of groupes) {
      const montant = Number(g?.devis_total_ht ?? 0);
      if (!(montant > 0)) continue;
      const label = String(g?.job_type_label ?? "(sans libellé)");

      const vect = g?.vectorial;
      // ⚠️ `job_type` n'est PAS à la racine du groupe : il vit dans `prices[0]`
      // (ou `catalog_job_types`). Le chercher à la racine faisait tomber 100 %
      // des postes en « aucune entrée trouvée », y compris ceux dont le libellé
      // EST une entrée du catalogue — contradiction visible en une lecture.
      const prix = Array.isArray(g?.prices) ? g.prices[0] : null;
      const jobType = String(prix?.job_type ?? g?.catalog_job_types?.[0] ?? "");
      const bornesNonNulles =
        Number(prix?.price_max_unit_ht ?? 0) > 0 || Number(prix?.fixed_max_ht ?? 0) > 0;
      const aUnCandidat = Boolean(jobType) && bornesNonNulles && !LIBELLES_FOURRE_TOUT.has(label);
      const confiance = vect && typeof vect === "object" ? String(vect.confidence ?? "") : "";

      let seau: Seau;
      let motif: string | null = null;
      if (!aUnCandidat || confiance === "no_match") {
        seau = "A_catalogue_absent";
        // Sous un libellé de repli, c'est la LIGNE DU DEVIS qui dit ce qu'on
        // n'a pas su chiffrer — notre étiquette, elle, ne décrit rien (même
        // leçon que « nommer la ligne du devis, pas notre étiquette », 10/09).
        const lignes = Array.isArray(g?.devis_lines) ? g.devis_lines : [];
        if (LIBELLES_FOURRE_TOUT.has(label) && lignes.length > 0) {
          for (const l of lignes) {
            const m = Number(l?.amount_ht ?? 0);
            if (m > 0) {
              sansReference.push({
                label: String(l?.description ?? "(sans description)"),
                montant: m,
                doc: doc.file_name ?? doc.id,
              });
            }
          }
        } else {
          sansReference.push({ label, montant, doc: doc.file_name ?? doc.id });
        }
      } else if (!referenceOpposable(vect)) {
        seau = "B_rapprochement_faible";
      } else {
        motif = motifNonChiffrable(g, totalHT);
        if (motif) seau = "C_garde";
        else {
          // Opposable ET chiffrable : le prix est-il dans la fourchette ?
          const qty = typeof g?.main_quantity === "number" && g.main_quantity > 0 ? g.main_quantity : 1;
          const plafond = Number(prix?.price_max_unit_ht ?? 0) > 0
            ? Number(prix.price_max_unit_ht) * qty
            : Number(prix?.fixed_max_ht ?? 0);
          seau = montant > plafond ? "E_ecart_sous_plancher" : "D_prix_normal";
        }
      }

      montantParSeau[seau] += montant;
      postesParSeau[seau]++;
      if (motif) {
        const m = motifs.get(motif) ?? { montant: 0, postes: 0 };
        m.montant += montant; m.postes++;
        motifs.set(motif, m);
      }

      // Famille : seulement quand un rapprochement existe (sinon inconnue).
      if (seau !== "A_catalogue_absent") {
        const fam = metierParJobType.get(jobType) ?? "(hors catalogue)";
        const f = familles.get(fam) ?? { montant: 0, postes: 0, seaux: vide(), devis: new Set<string>() };
        f.montant += montant; f.postes++; f.seaux[seau]++;
        // ⚠️ Le seuil compte les DEVIS, pas les lignes (règle du 07/09) : une
        // famille portée par deux devis n'est pas une famille.
        if (seau === "B_rapprochement_faible" || seau === "C_garde") f.devis.add(doc.id);
        familles.set(fam, f);

        if (seau === "B_rapprochement_faible") {
          const ligne = String(g?.devis_lines?.[0]?.description ?? label);
          couplesB.push({
            ligne,
            entree: label,
            sim: Number(vect?.top_similarity ?? 0),
            montant,
            fam,
          });
        }
      }
    }
  }

  const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
  const totalMuet = Object.values(montantParSeau).reduce((s, v) => s + v, 0);
  const pct = (n: number) => (totalMuet > 0 ? `${Math.round((n / totalMuet) * 1000) / 10} %` : "—");

  console.log(`\n═══ Devis qui repartent SANS montant — ${JOURS} derniers jours ═══\n`);
  console.log(`Documents dédupliqués : ${documents.length}`);
  console.log(`  avec un montant affiché : ${chiffres}`);
  console.log(`  MUETS                   : ${muets}`);
  console.log(`Montant total de leurs postes : ${eur(totalMuet)}\n`);

  console.log("── Ce que la page DIT de ces devis muets ──────────────────────");
  console.log(`  « Ce devis nous paraît cohérent »  (portée ≥ 50 %) : ${portee.affirme}`);
  console.log(`  « Rien ne s'oppose à la signature » (portée < 50 %) : ${portee.tempere}`);
  console.log(`  aucun poste affiché                                : ${portee.sansPortee}\n`);

  console.log("── POURQUOI on ne chiffre pas ─────────────────────────────────");
  const libelle: Record<Seau, string> = {
    A_catalogue_absent: "(A) aucune entrée trouvée         → CATALOGUE",
    B_rapprochement_faible: "(B) entrée trouvée, non opposable → MATCHER",
    C_garde: "(C) opposable, garde active       → RÈGLES",
    D_prix_normal: "(D) comparé, prix DANS la norme   → rien à corriger",
    E_ecart_sous_plancher: "(E) écart réel mais < 300 €       → rien à afficher",
  };
  for (const s of Object.keys(libelle) as Seau[]) {
    console.log(
      `  ${libelle[s].padEnd(36)} ${String(postesParSeau[s]).padStart(4)} postes  ${eur(montantParSeau[s]).padStart(14)}  ${pct(montantParSeau[s]).padStart(7)}`,
    );
  }

  if (motifs.size > 0) {
    console.log("\n── (C) détail des gardes ──────────────────────────────────────");
    for (const [m, v] of [...motifs.entries()].sort((a, b) => b[1].montant - a[1].montant)) {
      console.log(`  ${m.padEnd(32)} ${String(v.postes).padStart(4)} postes  ${eur(v.montant).padStart(14)}`);
    }
  }

  console.log("\n── Familles où le rapprochement EXISTE mais ne produit rien ───");
  console.log("   (seaux B + C : c'est là qu'un effort est mesurable)\n");
  const classement = [...familles.entries()]
    .map(([fam, v]) => ({ fam, ...v, aTravailler: v.seaux.B_rapprochement_faible + v.seaux.C_garde }))
    .filter((f) => f.aTravailler > 0)
    .sort((a, b) => b.aTravailler - a.aTravailler)
    .slice(0, 12);
  for (const f of classement) {
    console.log(
      `  ${f.fam.padEnd(24)} ${String(f.aTravailler).padStart(3)} postes sur ${String(f.devis.size).padStart(2)} devis  (B:${f.seaux.B_rapprochement_faible} C:${f.seaux.C_garde} · D:${f.seaux.D_prix_normal} OK)  ${eur(f.montant).padStart(13)}`,
    );
  }

  console.log("\n── (B) ce que la ligne DIT vs l'entrée TROUVÉE ────────────────");
  console.log("   les 18 plus lourds — c'est ici qu'on voit s'il manque une entrée\n");
  for (const c of couplesB.sort((a, b) => b.montant - a.montant).slice(0, 18)) {
    console.log(`  ${eur(c.montant).padStart(11)} · ${c.sim.toFixed(3)}  ${c.ligne.slice(0, 52).padEnd(52)} → ${c.entree.slice(0, 40)}`);
  }

  const focus = process.argv.find((a) => a.startsWith("--famille="))?.split("=")[1];
  if (focus) {
    const dedans = couplesB.filter((c) => c.fam === focus).sort((a, b) => b.montant - a.montant);
    console.log(`\n── (B) FOCUS « ${focus} » — ${dedans.length} postes ────────────────`);
    for (const c of dedans) {
      console.log(`  ${eur(c.montant).padStart(10)} · ${c.sim.toFixed(3)}  ${c.ligne.slice(0, 54).padEnd(54)} → ${c.entree.slice(0, 38)}`);
    }
  }

  console.log("\n── (A) les plus grosses lignes SANS aucune référence ──────────");
  for (const l of sansReference.sort((a, b) => b.montant - a.montant).slice(0, 15)) {
    console.log(`  ${eur(l.montant).padStart(12)}  ${l.label.slice(0, 62)}`);
  }

  // ── TÉMOIN : la ventilation doit recomposer le total ────────────────────────
  const sommePostes = Object.values(postesParSeau).reduce((s, v) => s + v, 0);
  const sommeFamilles = [...familles.values()].reduce((s, f) => s + f.postes, 0);
  const attenduFamilles = sommePostes - postesParSeau.A_catalogue_absent;
  console.log("\n── Témoins ────────────────────────────────────────────────────");
  console.log(`  postes ventilés en familles : ${sommeFamilles} / ${attenduFamilles} attendus`);
  if (sommeFamilles !== attenduFamilles) {
    console.error("  ✗ la ventilation ne recompose pas — mesure NON FIABLE");
    process.exit(1);
  }
  console.log("  ✓ ventilation cohérente");

  // ⚠️ TÉMOIN DE PLAUSIBILITÉ — celui qui a rattrapé ma première version.
  // Environ un devis sur six repart avec un montant : si le banc n'en trouve
  // AUCUN, c'est qu'il lit le mauvais champ, pas que la production est muette.
  // « Un banc qui rend 0 doit toujours être suspecté de ne rien mesurer. »
  if (chiffres === 0 && documents.length > 20) {
    console.error(`  ✗ 0 devis chiffré sur ${documents.length} — le lecteur de conclusion est faux`);
    process.exit(1);
  }
  console.log(`  ✓ ${chiffres} devis chiffrés trouvés (lecteur de conclusion fonctionnel)`);

  // Un seau à 100 % signale presque toujours un test de classement cassé.
  const domine = (Object.keys(postesParSeau) as Seau[]).find(
    (s) => postesParSeau[s] === sommePostes && sommePostes > 0,
  );
  if (domine) {
    console.error(`  ✗ 100 % des postes dans un seul seau (${domine}) — classement suspect`);
    process.exit(1);
  }
  console.log("  ✓ les postes se répartissent sur plusieurs seaux");
}

main().catch((e) => { console.error(e); process.exit(1); });
