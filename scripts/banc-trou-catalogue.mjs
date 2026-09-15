/**
 * scripts/banc-trou-catalogue.mjs
 *
 * 2026-09-15 — « IL MANQUE UNE ENTRÉE » OU « ON NE LA TROUVE PAS » ?
 *
 * Devant une famille de devis mal couverte, le réflexe est de sourcer des
 * entrées. Deux fois de suite (chauffage sur demande de Johan, dépose sur ma
 * propre recommandation) la mesure a dit l'inverse : **l'entrée existe**, elle
 * sort même EN TÊTE, mais sous le seuil de 0,77.
 *
 * Le banc tranche entre trois diagnostics, qui appellent trois chantiers
 * différents et qu'on ne peut pas distinguer à l'œil :
 *
 *   (a) aucun des 5 candidats n'appartient à la famille → il manque vraiment
 *       une entrée : SOURCER (3 gestes, cf. CLAUDE.md 2026-08-30) ;
 *   (b) une entrée de la famille est au rang 2-5 → problème de CLASSEMENT
 *       (piste mesurée et fermée le 11/09) ;
 *   (c) elle est EN TÊTE mais sous le seuil → ni catalogue ni classement.
 *
 * ⚠️ Les candidats lus ici sont ceux STOCKÉS à l'analyse, donc calculés contre
 * le catalogue de l'époque. Un « aucune entrée » peut être faux depuis (règle
 * du 10/09) — d'où le croisement avec le catalogue d'AUJOURD'HUI.
 *
 * ⚠️ Et le cas (c) n'autorise PAS à baisser le seuil : sur la dépose, le
 * premier candidat est souvent FAUX (tuiles → « Dépose carrelage », cheminée →
 * « Dépose clôture »). Élargir fabriquerait des références fausses opposables.
 *
 * Usage : node scripts/banc-trou-catalogue.mjs <famille>
 *   familles : depose · chauffage
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const FAMILLES = {
  depose: {
    // ⚠️ Ancre à 40 caractères (comme la garde des frais, 10/09) : le mot doit
    // être l'OBJET de la ligne, pas un mot croisé au passage.
    tete: 40,
    ligne: /(d[ée]pose|d[ée]molition|d[ée]molir|arrachage|enl[èe]vement|d[ée]montage|curage|[ée]vacuation|mise en d[ée]charge|d[ée]chetterie|benne)/i,
    // Une ligne qui POSE ensuite n'est pas une ligne de dépose : son prix est
    // celui de l'ouvrage neuf, la dépose n'en est qu'un préalable.
    exclure: /\b(pose d|pose des|pose de|fourniture|application|remplacement par|repose|mise en (œuvre|oeuvre)|installation d)/i,
    entree: /(d[ée]pose|d[ée]molition|d[ée]montage|curage|arrachage|enl[èe]vement|[ée]vacuation|evacuation|benne|abattage|d[ée]chet)/i,
  },
  chauffage: {
    tete: 80,
    ligne: /(chauffage|chaudi[eè]re|po[eê]le|insert |chemin[ée]e|\bpac\b|pompe à chaleur|radiateur|s[eè]che[- ]?serviettes?|plancher chauffant|tubage|conduit de fum[ée]e|thermostat|granul[ée]s|convecteur|chauffe[- ]eau)/i,
    exclure: /(?!)/,
    entree: /(chauffage|chaudi[eè]re|po[eê]le|insert|chemin[ée]e|pompe à chaleur|radiateur|s[eè]che-serviettes?|plancher chauffant|tubage|conduit de fum[ée]e|convecteur|chauffe-eau|climatisation|\bPAC\b|ballon)/i,
  },
};

const nom = process.argv[2];
const F = FAMILLES[nom];
if (!F) {
  console.error(`famille inconnue. Choix : ${Object.keys(FAMILLES).join(" · ")}`);
  process.exit(1);
}

const { data: cat, error: eCat } = await supa.from("market_prices").select("job_type,label");
if (eCat) throw new Error(eCat.message);
const deLaFamille = new Set(cat.filter((e) => F.entree.test(e.label ?? "")).map((e) => e.job_type));
console.log(`\nCatalogue : ${cat.length} entrées, dont ${deLaFamille.size} de la famille « ${nom} ».`);

const { data: analyses, error } = await supa
  .from("analyses")
  .select("id,user_id,file_name,raw_text")
  .not("raw_text", "is", null);
if (error) throw new Error(error.message);

// Déduplication des redépôts (règle du 07/09 : ~17 % du stock).
const vus = new Set();
const docs = [];
for (const a of analyses) {
  const cle = `${a.user_id}|${a.file_name}`;
  if (vus.has(cle)) continue;
  vus.add(cle);
  docs.push(a);
}

let n = 0;
const bilan = { aucun: [], rang2a5: [], enTete: [] };
for (const a of docs) {
  let p;
  try {
    p = JSON.parse(a.raw_text || "{}");
  } catch {
    continue;
  }
  for (const g of Array.isArray(p.n8n_price_data) ? p.n8n_price_data : []) {
    const v = g?.vectorial;
    if (!v || v.confidence === "high") continue; // on cherche ce qui N'EST PAS chiffré
    const cands = Array.isArray(v.all_candidates) ? v.all_candidates : [];
    if (!cands.length) continue;
    for (const l of g?.devis_lines ?? []) {
      const desc = String(l?.description ?? "");
      if (!F.ligne.test(desc.slice(0, F.tete))) continue;
      if (F.exclure.test(desc)) continue;
      n++;
      const rang = cands.findIndex((c) => deLaFamille.has(c.job_type));
      const e = {
        desc: desc.slice(0, 78).replace(/\s+/g, " "),
        montant: Number(l?.amount_ht ?? 0),
        cand: rang >= 0 ? cands[rang] : null,
        top: cands[0],
      };
      if (rang < 0) bilan.aucun.push(e);
      else if (rang === 0) bilan.enTete.push(e);
      else bilan.rang2a5.push(e);
    }
  }
}

const S = (t) => Math.round(t.reduce((s, x) => s + x.montant, 0)).toLocaleString("fr-FR");
const pc = (t) => (n ? Math.round((t.length / n) * 100) : 0);
console.log(`\n══ ${n} lignes « ${nom} » NON chiffrées, avec des candidats stockés ══\n`);
console.log(`(a) aucun candidat de la famille   : ${bilan.aucun.length} (${pc(bilan.aucun)} %) · ${S(bilan.aucun)} €   → sourcer`);
console.log(`(b) une entrée au rang 2-5         : ${bilan.rang2a5.length} (${pc(bilan.rang2a5)} %) · ${S(bilan.rang2a5)} €   → classement`);
console.log(`(c) une entrée EN TÊTE, sous seuil : ${bilan.enTete.length} (${pc(bilan.enTete)} %) · ${S(bilan.enTete)} €   → ni l'un ni l'autre`);

console.log(`\n── (c) trouvée mais pas retenue — ⚠️ vérifier si le candidat est JUSTE avant d'en conclure quoi que ce soit ──`);
for (const e of bilan.enTete.sort((x, y) => y.montant - x.montant).slice(0, 15)) {
  console.log(`  ${String(Math.round(e.montant)).padStart(6)} € — ${e.desc}`);
  console.log(`           → ${e.cand.label} (${e.cand.similarity.toFixed(3)})`);
}

console.log(`\n── (a) aucun candidat de la famille — c'est ICI que peut manquer une entrée ──`);
for (const e of bilan.aucun.sort((x, y) => y.montant - x.montant).slice(0, 15)) {
  console.log(`  ${String(Math.round(e.montant)).padStart(6)} € — ${e.desc}`);
  console.log(`           → top-1 : ${e.top.label} (${e.top.similarity.toFixed(3)})`);
}
