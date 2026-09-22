/**
 * scripts/banc-clim-references-manquantes.mts
 *
 * Suite directe du banc des familles : `cvc_ventilation` est la famille la plus
 * lourde des devis muets (66 postes sur 16 devis, 111 851 €) — et ses
 * rapprochements sont JUSTES. Ils tombent sous le seuil parce que la ligne est
 * une FICHE PRODUIT (marque, référence, kW, R32) et non une description
 * d'ouvrage : le mécanisme mesuré le 15/09.
 *
 * Or ces lignes ont déjà leur réponse — la table `prix_materiel`, qui compare
 * à la référence fabricant exacte. La question actionnable n'est donc pas
 * « faut-il sourcer un vertical clim ? » (il existe) mais :
 *
 *     quelles RÉFÉRENCES manquent, et combien de devis chacune débloque ?
 *
 * ⚠️ On réutilise `rapprocherMateriel` — la règle de production — au lieu de
 * réécrire une correspondance : recopier la règle est ce qui produit les
 * divergences que ce projet passe son temps à corriger.
 *
 * Lancement :  npx tsx scripts/banc-clim-references-manquantes.mts
 */

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

import { rapprocherMateriel, racineDeReference } from "@/lib/analyse/materielReference";

const require = createRequire(pathToFileURL(resolve(process.cwd(), "package.json")));
const { createClient } = require("@supabase/supabase-js");

const env: Record<string, string> = {};
for (const l of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const supabase = createClient(
  env.PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const JOURS = Number(process.argv.find((a) => a.startsWith("--jours="))?.split("=")[1] ?? 90);
const parse = (v: any) => { if (v && typeof v === "object") return v; try { return JSON.parse(v); } catch { return null; } };

/** Une ligne qui parle de climatisation / PAC air-air. */
const EST_CLIM = /climatis|clim\b|split|pac\s*air|unit[ée]\s*(int[ée]rieure?|ext[ée]rieure?)|gainable|inverter|mono-?split|multi-?split/i;
/** Un fragment qui ressemble à une référence fabricant. */
const REF_CANDIDATE = /\b([A-Z]{2,6}[-\s]?[0-9]{1,4}[A-Z0-9\-]{0,8})\b/g;

async function main() {
  const { data: refs, error: e1 } = await supabase.from("prix_materiel").select("*");
  if (e1) throw new Error(`prix_materiel: ${e1.message}`);
  const catalogue = refs ?? [];
  const racinesConnues = new Set(catalogue.map((r: any) => racineDeReference(String(r.reference ?? ""))));

  const depuis = new Date(Date.now() - JOURS * 86_400_000).toISOString();
  const { data: analyses, error: e2 } = await supabase
    .from("analyses")
    .select("id, created_at, user_id, file_name, raw_text")
    .eq("status", "completed")
    .gte("created_at", depuis)
    .order("created_at", { ascending: false });
  if (e2) throw new Error(`analyses: ${e2.message}`);

  const vus = new Set<string>();
  let devisClim = 0;
  let lignesClim = 0;
  let montantClim = 0;
  let dejaCouvert = 0;
  let montantCouvert = 0;
  /** racine de référence inconnue → { devis, montant, exemples } */
  const manquantes = new Map<string, { devis: Set<string>; montant: number; exemple: string }>();
  let sansReference = 0;
  let montantSansRef = 0;

  for (const a of analyses ?? []) {
    const cle = `${a.user_id}|${a.file_name}`;
    if (vus.has(cle)) continue;
    vus.add(cle);

    const raw = parse(a.raw_text);
    const groupes = Array.isArray(raw?.n8n_price_data) ? raw.n8n_price_data : [];
    // ⚠️ `LigneDevis` attend { libelle, montant, quantite } — pas les noms de
    // colonnes du stock. Ma première version passait `description/amount_ht` :
    // la fonction sortait 0 résultat en silence, et c'est le témoin « 0 ligne
    // couverte alors que le référentiel est peuplé » qui l'a attrapé.
    const lignes: Array<{ libelle: string; montant: number; quantite: number | null }> = [];
    for (const g of groupes) {
      for (const l of Array.isArray(g?.devis_lines) ? g.devis_lines : []) {
        const d = String(l?.description ?? "");
        const m = Number(l?.amount_ht ?? 0);
        if (m > 0 && EST_CLIM.test(d)) {
          lignes.push({ libelle: d, montant: m, quantite: Number(l?.quantity) || null });
        }
      }
    }
    if (lignes.length === 0) continue;
    devisClim++;

    // La règle de PRODUCTION, importée telle quelle.
    const verifies = rapprocherMateriel(lignes, catalogue as any);
    // ⚠️ `MaterielVerifie.ligne` est une CHAÎNE tronquée à 88 caractères + « … ».
    // On rapproche donc sur ce même préfixe normalisé, jamais par égalité.
    const cleLigne = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 88);
    const couvertes = new Set(verifies.map((v) => cleLigne(v.ligne)));

    for (const l of lignes) {
      lignesClim++;
      montantClim += l.montant;
      if (couvertes.has(cleLigne(l.libelle))) { dejaCouvert++; montantCouvert += l.montant; continue; }

      // Cette ligne porte-t-elle une référence qu'on pourrait sourcer ?
      const candidates = [...l.libelle.matchAll(REF_CANDIDATE)].map((m) => m[1]);
      const inconnues = candidates
        .map((c) => racineDeReference(c))
        .filter((r) => r.length >= 5 && !racinesConnues.has(r));
      if (inconnues.length === 0) { sansReference++; montantSansRef += l.montant; continue; }

      const r = inconnues[0];
      const e = manquantes.get(r) ?? { devis: new Set<string>(), montant: 0, exemple: l.libelle };
      e.devis.add(a.id); e.montant += l.montant;
      manquantes.set(r, e);
    }
  }

  const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
  console.log(`\n═══ Climatisation — ${JOURS} derniers jours ═══\n`);
  console.log(`Références au référentiel : ${catalogue.length}`);
  console.log(`Devis portant de la clim  : ${devisClim}`);
  console.log(`Lignes clim               : ${lignesClim}  (${eur(montantClim)})\n`);
  const pct = (n: number) => (montantClim > 0 ? `${Math.round((n / montantClim) * 1000) / 10} %` : "—");
  console.log(`  déjà chiffrées par référence : ${String(dejaCouvert).padStart(3)} lignes  ${eur(montantCouvert).padStart(12)}  ${pct(montantCouvert)}`);
  const montantManquant = [...manquantes.values()].reduce((s, v) => s + v.montant, 0);
  console.log(`  référence LISIBLE, non relevée : ${String(lignesClim - dejaCouvert - sansReference).padStart(3)} lignes  ${eur(montantManquant).padStart(12)}  ${pct(montantManquant)}`);
  console.log(`  aucune référence lisible       : ${String(sansReference).padStart(3)} lignes  ${eur(montantSansRef).padStart(12)}  ${pct(montantSansRef)}`);

  console.log("\n── Références à sourcer, par nombre de DEVIS débloqués ────────");
  console.log("   (une référence vue sur un seul devis ne vaut pas le sourcing)\n");
  const classement = [...manquantes.entries()]
    .map(([ref, v]) => ({ ref, devis: v.devis.size, montant: v.montant, exemple: v.exemple }))
    .sort((a, b) => b.devis - a.devis || b.montant - a.montant);
  for (const c of classement.slice(0, 20)) {
    console.log(`  ${c.ref.padEnd(16)} ${String(c.devis).padStart(2)} devis  ${eur(c.montant).padStart(11)}   ${c.exemple.replace(/\s+/g, " ").slice(0, 48)}`);
  }
  const concentrees = classement.filter((c) => c.devis >= 2);
  console.log(`\n  → ${concentrees.length} référence(s) vue(s) sur 2 devis ou plus (${eur(concentrees.reduce((s, c) => s + c.montant, 0))})`);

  // ── Témoins ────────────────────────────────────────────────────────────────
  console.log("\n── Témoins ────────────────────────────────────────────────────");
  const somme = dejaCouvert + sansReference + (lignesClim - dejaCouvert - sansReference);
  if (somme !== lignesClim) { console.error(`  ✗ ventilation incohérente (${somme} ≠ ${lignesClim})`); process.exit(1); }
  console.log(`  ✓ ventilation cohérente (${lignesClim} lignes)`);
  if (catalogue.length === 0) { console.error("  ✗ référentiel vide — mesure sans objet"); process.exit(1); }
  if (dejaCouvert === 0 && catalogue.length > 5) {
    console.error("  ✗ 0 ligne couverte alors que le référentiel est peuplé — rapprochement suspect");
    process.exit(1);
  }
  console.log(`  ✓ le rapprochement de production fonctionne (${dejaCouvert} lignes couvertes)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
