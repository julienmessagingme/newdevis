#!/usr/bin/env node
/**
 * scripts/banc-erreur-calcul-relecteur.mjs
 *
 * 2026-09-25 — COMBIEN D'« ERREURS DE CALCUL » DU RELECTEUR SONT LE PIÈGE HT/TTC ?
 *
 * Déclencheur : sur `noreco peinture2`, l'agent a annoncé une « erreur de calcul
 * critique — la somme des lignes (12 480 €) ne correspond pas au sous-total HT
 * (11 345,45 €) » et proposé d'écrire au client que son total « devrait être de
 * 13 728 € TTC », soit **1 248 € de plus** que ce que l'artisan facture. Or
 * 12 480 ÷ 11 345,45 = **1,100000** : les lignes sont en TTC et le devis
 * recalcule le HT à rebours. Aucune erreur.
 *
 * 🔴 CE BANC NE JUGE PAS LE TEXTE, IL REFAIT L'ARITHMÉTIQUE. La détection par
 * mots-clés sert seulement à trouver les avis à examiner — c'est un INDICATEUR,
 * pas une vérité (règle du 16/09). Ce qui tranche est le rapport Σlignes / HT
 * confronté aux taux de TVA usuels, et lui seul est publiable.
 *
 * ⚠️ TÉMOIN OBLIGATOIRE : le cas connu DOIT ressortir en faux positif. Un banc
 * qui rend « 0 faux positif » sans retrouver le cas qui l'a motivé ne mesure
 * rien — c'est la règle du 16/09, appliquée trois fois depuis.
 *
 * USAGE : node scripts/banc-erreur-calcul-relecteur.mjs
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const TEMOIN = "2fa6ab98-5f12-4e28-862f-b6ceac28e8fe"; // noreco peinture2

/**
 * Les taux qu'un devis de bâtiment français peut porter. `0` couvre le cas de
 * l'auto-entrepreneur en franchise (art. 293 B du CGI), où HT = TTC.
 *
 * ⚠️ 5,5 % (rénovation énergétique) et 10 % (rénovation courante) sont les deux
 * qui produisent ce piège en pratique : l'artisan affiche un prix au m² TTC
 * parce que son client est un particulier.
 */
const TAUX_USUELS = [0, 0.055, 0.10, 0.20, 0.085, 0.021];
const TOLERANCE = 0.002; // le devis arrondit au centime ; 0,2 % absorbe le bruit

/**
 * 🔴 DEUX MOTIFS, ET IL FAUT LES DEUX — sinon le banc compte autre chose.
 *
 * Ma première version ne cherchait qu'une accusation d'erreur de calcul : elle
 * en a trouvé 3, dont **2 qui n'en étaient pas**. Sur `DEVIS MADIER`,
 * « incohérence majeure » désigne un acompte de 50 % contredisant les CGV —
 * un constat parfaitement légitime. Sur l'autre, le motif accrochait un
 * fragment sans phrase.
 *
 * La règle du 22/09 s'applique telle quelle : **un compteur d'incidents se
 * re-dérive avec la règle du correctif, jamais avec celle du diagnostic.** Le
 * diagnostic cherche large pour ne rien rater ; le correctif cible. On exige
 * donc que l'avis parle DU RAPPROCHEMENT entre la somme des lignes et le
 * sous-total — c'est ça, et seulement ça, que la garde va corriger.
 */
const MOTS_ERREUR_CALCUL =
  /erreur de calcul|incohérence (majeure |)dans le calcul|total (final )?incohérent/i;
const MOTS_SOMME_VS_TOTAL =
  /somme des (montants|lignes|prestations)|somme de (toutes les |)(prestations|lignes)|total des lignes|addition des lignes/i;

function env() {
  return Object.fromEntries(
    fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
}
const parse = (v) => { if (!v) return null; if (typeof v === "object") return v; try { return JSON.parse(v); } catch { return null; } };

/**
 * Le rapport Σlignes / HT tombe-t-il sur un taux de TVA usuel ?
 * Si oui, les lignes sont en TTC et il n'y a AUCUNE erreur de calcul.
 */
function expliqueParLaTva(sommeLignes, ht) {
  if (!(sommeLignes > 0) || !(ht > 0)) return null;
  const r = sommeLignes / ht;
  for (const t of TAUX_USUELS) {
    if (Math.abs(r - (1 + t)) <= TOLERANCE) return { taux: t, rapport: r };
  }
  return null;
}

const e = env();
const sb = createClient(e.PUBLIC_SUPABASE_URL || e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);

const avis = [];
for (let de = 0; ; de += 200) {
  const { data, error } = await sb.from("analyses")
    .select("id, file_name, created_at, review_status, raw_text, ai_review_opinion")
    .not("ai_review_opinion", "is", null)
    .order("ai_reviewed_at", { ascending: false })
    .range(de, de + 199);
  if (error) { console.error("❌", error.message); process.exit(1); }
  avis.push(...(data ?? []));
  if (!data || data.length < 200) break;
}

const seaux = { faux_positif: [], ecart_reel: [], non_testable: [] };
let accusateurs = 0;
let muetsMaisEcart = 0; // témoin inverse : écart arithmétique SANS accusation

for (const a of avis) {
  const av = parse(a.ai_review_opinion);
  if (!av || av.skipped || av.status === "running" || av.error) continue;

  const ex = parse(a.raw_text)?.extracted ?? {};
  const lignes = Array.isArray(ex.travaux) ? ex.travaux : [];
  const somme = lignes.reduce((s, l) => s + (Number(l.montant ?? l.prix_total ?? l.montant_ht ?? 0) || 0), 0);
  const ht = Number(ex.totaux?.ht ?? 0);
  const ecarte = ht > 0 && somme > 0 && Math.abs(somme - ht) / ht > TOLERANCE;

  const texte = JSON.stringify(av);
  const accuse = MOTS_ERREUR_CALCUL.test(texte) && MOTS_SOMME_VS_TOTAL.test(texte);
  if (!accuse) { if (ecarte) muetsMaisEcart++; continue; }
  accusateurs++;

  const tva = expliqueParLaTva(somme, ht);
  const fiche = {
    id: a.id, fichier: a.file_name, date: a.created_at?.slice(0, 10),
    statut: a.review_status, lignes: lignes.length,
    somme: Math.round(somme * 100) / 100, ht, ttc: Number(ex.totaux?.ttc ?? 0),
    taux_declare: ex.totaux?.taux_tva ?? null,
    rapport: ht > 0 ? Math.round((somme / ht) * 1e6) / 1e6 : null,
    tva,
  };
  if (!(somme > 0) || !(ht > 0)) seaux.non_testable.push(fiche);
  else if (tva) seaux.faux_positif.push(fiche);
  else seaux.ecart_reel.push(fiche);
}

const total = seaux.faux_positif.length + seaux.ecart_reel.length + seaux.non_testable.length;
console.log("┌─ Avis du relecteur annonçant une erreur de calcul\n│");
console.log("│ avis exploitables lus            :", avis.length);
console.log("│ dont ACCUSANT une erreur         :", accusateurs);
console.log("│");
console.log("│ 🔴 FAUX POSITIF (piège HT/TTC)   :", seaux.faux_positif.length);
console.log("│ 🟡 écart réel, à instruire       :", seaux.ecart_reel.length);
console.log("│ ⚪ non testable (données absentes):", seaux.non_testable.length);
console.log("└─ témoin de recomposition :", total, "=", accusateurs, total === accusateurs ? "✓" : "🔴 INCOHÉRENT");

// Témoin inverse : l'arithmétique seule ne suffit pas à accuser, sinon le banc
// ne mesurerait que sa propre règle de détection.
console.log("\nTémoin inverse — avis SANS accusation mais Σlignes ≠ HT :", muetsMaisEcart);

for (const [nom, liste] of Object.entries(seaux)) {
  if (!liste.length) continue;
  console.log("\n── " + nom.toUpperCase().replace("_", " ") + " ──");
  for (const f of liste) {
    console.log(
      `  ${f.date}  ${String(f.fichier).slice(0, 34).padEnd(34)}  ` +
      `Σ ${String(f.somme).padStart(10)}  HT ${String(f.ht).padStart(10)}  ` +
      `rapport ${f.rapport ?? "—"}` +
      (f.tva ? `  ⇒ lignes en TTC à ${(f.tva.taux * 100).toFixed(1)} % — AUCUNE erreur` : "") +
      (f.taux_declare != null ? `  [taux déclaré ${f.taux_declare} %]` : ""),
    );
  }
}

// ⚠️ SANS CE CONTRÔLE, UN BANC QUI REND 0 PASSERAIT POUR UNE BONNE NOUVELLE.
const temoinVu = seaux.faux_positif.some((f) => f.id === TEMOIN);
console.log("\nTémoin (« noreco peinture2 » doit sortir en faux positif) :", temoinVu ? "✓" : "🔴 ABSENT");
if (!temoinVu) {
  console.error("\n🔴 Le banc ne retrouve pas le cas qui l'a motivé — il ne mesure rien.");
  process.exitCode = 1;
}
