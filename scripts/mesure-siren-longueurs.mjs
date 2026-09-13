/**
 * scripts/mesure-siren-longueurs.mjs
 *
 * 2026-09-13 — QUE PERD-ON À NE PARSER QUE 9, 13 ET 14 CHIFFRES ?
 *
 * `verify.ts` ne construit une clé de recherche que pour un numéro de 14
 * chiffres (SIRET), de 9 (SIREN) ou de 13 (rattrapage d'un zéro manquant dans
 * le NIC). **Toute autre longueur ne déclenche AUCUNE recherche** : ni par
 * numéro, ni par SIREN — le repli par nom seul reste, et `lookup_status` vaut
 * `no_siret`, dont le message dit « SIRET non détecté sur le devis » alors
 * qu'un numéro est bel et bien imprimé.
 *
 * Règle candidate : quand aucun SIRET de 14 chiffres n'est exploitable, prendre
 * les **9 premiers chiffres comme SIREN s'ils passent la clé de Luhn**.
 *
 * ⚠️ LA CLÉ DE LUHN EST LA CONDITION, PAS UN ORNEMENT. Tronquer un numéro au
 * hasard jusqu'à tomber sur une entreprise est le meilleur moyen d'en désigner
 * une au hasard. La clé rend la troncature vérifiable : sur 9 chiffres elle ne
 * laisse passer qu'un numéro sur dix.
 *
 * Le banc mesure les DEUX directions :
 *   · ce que la règle récupère (numéros aujourd'hui ignorés) ;
 *   · ce qu'elle risque de changer sur les numéros de 13 chiffres, aujourd'hui
 *     tronqués SANS contrôle de clé — les soumettre à Luhn pourrait en retirer.
 *
 * Usage : node scripts/mesure-siren-longueurs.mjs
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const API = "https://recherche-entreprises.api.gouv.fr/search";

function luhnOk(n) {
  if (/^0+$/.test(n)) return false;
  if (n === "356000000") return true;
  let somme = 0;
  for (let i = 0; i < n.length; i++) {
    let d = Number(n[n.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    somme += d;
  }
  return somme % 10 === 0;
}

let debut = 0; const analyses = [];
for (;;) {
  const { data, error } = await supa
    .from("analyses").select("id,file_name,user_id,created_at,raw_text")
    .eq("status", "completed").order("created_at", { ascending: false })
    .range(debut, debut + 499);
  if (error) throw error;
  analyses.push(...data);
  if (data.length < 500) break;
  debut += 500;
}

const vus = new Set();
const parLongueur = new Map();
const aTester = [];   // longueurs aujourd'hui IGNORÉES
const treize = [];    // longueur 13, aujourd'hui tronquée sans contrôle
for (const a of analyses) {
  let b;
  try { b = typeof a.raw_text === "string" ? JSON.parse(a.raw_text) : a.raw_text; } catch { continue; }
  const cle = `${a.user_id}|${(a.file_name ?? "").replace(/\s*\(\d+\)(?=\.[a-z]+$)/i, "")}`;
  if (vus.has(cle)) continue;
  vus.add(cle);
  const ex = b?.extracted ?? {};
  if (ex.is_foreign_quote) continue;
  const n = String(ex.entreprise?.siret ?? "").replace(/\D/g, "");
  if (!n) continue;
  parLongueur.set(n.length, (parLongueur.get(n.length) ?? 0) + 1);

  const fiche = {
    fichier: a.file_name, date: String(a.created_at).slice(0, 10),
    nom: ex.entreprise?.nom ?? "", numero: n, longueur: n.length,
    siren9: n.slice(0, 9), luhn: luhnOk(n.slice(0, 9)),
    statut: b?.verified?.lookup_status ?? null,
    nomOfficiel: b?.verified?.nom_officiel ?? null,
  };
  if (n.length === 13) treize.push(fiche);
  else if (n.length !== 9 && n.length !== 14) aTester.push(fiche);
}

console.log(`${vus.size} documents · répartition des longueurs de numéro :`);
[...parLongueur.entries()].sort((a, b) => a[0] - b[0])
  .forEach(([l, n]) => {
    const traite = l === 9 || l === 13 || l === 14 ? "cherché aujourd'hui" : "IGNORÉ aujourd'hui";
    console.log(`   ${String(l).padStart(2)} chiffres : ${String(n).padStart(3)}   ${traite}`);
  });

async function chercher(q) {
  for (let essai = 0; essai < 3; essai++) {
    try {
      const r = await fetch(`${API}?q=${encodeURIComponent(q)}&per_page=1`, { signal: AbortSignal.timeout(8000) });
      if (r.status === 429) { await new Promise((s) => setTimeout(s, 2000 * (essai + 1))); continue; }
      if (!r.ok) return null;
      const j = await r.json();
      return j.total_results ? j.results[0] : false;
    } catch { if (essai === 2) return null; await new Promise((s) => setTimeout(s, 1500)); }
  }
}

console.log(`\n══ CE QUE LA RÈGLE RÉCUPÉRERAIT (${aTester.length} numéros de longueur inattendue) ══\n`);
let gagne = 0, luhnKo = 0, sansTrace = 0;
for (const f of aTester) {
  if (!f.luhn) {
    luhnKo++;
    console.log(`  ❌ ${f.numero} (${f.longueur}) — clé KO sur ${f.siren9} · « ${f.nom} » · statut "${f.statut}"`);
    continue;
  }
  const e = await chercher(f.siren9);
  await new Promise((s) => setTimeout(s, 250));
  if (e) {
    gagne++;
    console.log(`  🟢 ${f.numero} (${f.longueur}) → SIREN ${f.siren9} = ${e.nom_complet} · ${e.siege?.code_postal ?? "?"} · APE ${e.activite_principale} · ${e.etat_administratif === "A" ? "active" : "CESSÉE"}`);
    console.log(`        devis « ${f.nom} » · statut actuel "${f.statut}"${f.nomOfficiel ? ` → ${f.nomOfficiel}` : ""}`);
  } else {
    sansTrace++;
    console.log(`  ⚪ ${f.numero} (${f.longueur}) → SIREN ${f.siren9} valide mais aucune trace · « ${f.nom} »`);
  }
}

console.log(`\n══ CE QU'ELLE RISQUE DE CHANGER SUR LES 13 CHIFFRES (${treize.length}) ══`);
console.log("(aujourd'hui tronqués à 9 SANS contrôle de clé)\n");
let treizeKo = 0;
for (const f of treize) {
  const e = f.luhn ? await chercher(f.siren9) : null;
  if (f.luhn) await new Promise((s) => setTimeout(s, 250));
  if (!f.luhn) {
    treizeKo++;
    console.log(`  ⚠️ ${f.numero} — clé KO sur ${f.siren9} · « ${f.nom} » · statut "${f.statut}"${f.nomOfficiel ? ` → ${f.nomOfficiel}` : ""}`);
  } else {
    console.log(`  ✅ ${f.numero} — clé OK, ${e ? e.nom_complet : "aucune trace"}`);
  }
}

console.log(`\n══ BILAN ══`);
console.log(`  récupérés (entreprise retrouvée)      : ${gagne}   ← le gain`);
console.log(`  clé de Luhn KO, écartés                : ${luhnKo}`);
console.log(`  clé OK mais aucune trace au registre   : ${sansTrace}`);
console.log(`  numéros de 13 chiffres à clé FAUSSE    : ${treizeKo}   ← ce qu'un contrôle de clé retirerait au rattrapage existant`);
