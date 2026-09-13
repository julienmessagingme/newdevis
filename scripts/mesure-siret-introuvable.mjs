/**
 * scripts/mesure-siret-introuvable.mjs
 *
 * 2026-09-13 — COMBIEN DE DEVIS PORTENT UN SIRET QUI N'EXISTE DANS AUCUN REGISTRE ?
 *
 * Déclencheur : le devis « Entreprise Fk » (photo, 13/09). Le SIRET imprimé en
 * en-tête — 806 713 759 00019 — ne renvoie RIEN : ni par SIRET, ni par SIREN,
 * ni par nom + code postal. Ce n'est pas une ambiguïté, c'est une absence. Or
 * l'analyse l'a classé ORANGE « identification incertaine », avec trois
 * « candidats » qui sont un taxi parisien cessé, une SCI en Isère et une
 * activité de courrier à Asnières — aucun dans le bâtiment, aucun dans le Cher.
 *
 * 🔴 CE QUE LE STOCK NE PEUT PAS DIRE SEUL. `verified.lookup_status` ne garde
 * que le statut FINAL : le repli par nom ÉCRASE le `not_found` posé par la
 * recherche SIRET (verify.ts ligne 426 contre ligne 203). Impossible de compter
 * les SIRET introuvables en relisant la colonne — il faut REJOUER la recherche.
 * C'est ce que fait ce script, sur le registre d'aujourd'hui.
 *
 * ⚠️ Un « 0 résultat » d'un fournisseur externe est un défaut de NOTRE requête
 * jusqu'à preuve du contraire (règle du 2026-09-04). On interroge donc DEUX
 * fois — par SIRET complet puis par SIREN — avant de conclure à l'absence, et
 * on distingue l'échec réseau (`erreur`) de l'absence réelle (`introuvable`).
 *
 * Usage : node scripts/mesure-siret-introuvable.mjs
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const API = "https://recherche-entreprises.api.gouv.fr/search";

// ── Stock, dédupliqué par document ──────────────────────────────────────────
let debut = 0; const analyses = [];
for (;;) {
  const { data, error } = await supa
    .from("analyses").select("id,file_name,user_id,created_at,score,raw_text")
    .eq("status", "completed").order("created_at", { ascending: false })
    .range(debut, debut + 499);
  if (error) throw error;
  analyses.push(...data);
  if (data.length < 500) break;
  debut += 500;
}

const vus = new Set();
const cas = [];
for (const a of analyses) {
  let b;
  try { b = typeof a.raw_text === "string" ? JSON.parse(a.raw_text) : a.raw_text; } catch { continue; }
  const cle = `${a.user_id}|${(a.file_name ?? "").replace(/\s*\(\d+\)(?=\.[a-z]+$)/i, "")}`;
  if (vus.has(cle)) continue;
  vus.add(cle);
  const ex = b?.extracted ?? {};
  // Devis étranger : le registre français n'a rien à en dire, ce n'est pas un défaut.
  if (ex.is_foreign_quote) continue;
  const siretBrut = String(ex.entreprise?.siret ?? "").replace(/\D/g, "");
  if (siretBrut.length < 9) continue;
  cas.push({
    id: a.id, fichier: a.file_name, date: String(a.created_at).slice(0, 10), score: a.score,
    nom: ex.entreprise?.nom ?? "", siret: siretBrut, siren: siretBrut.slice(0, 9),
    statutStocke: b?.verified?.lookup_status ?? null,
    nomOfficiel: b?.verified?.nom_officiel ?? null,
  });
}
console.log(`${vus.size} documents · ${cas.length} portent un SIRET/SIREN exploitable\n`);

// ── Rejeu de la recherche ───────────────────────────────────────────────────
const cache = new Map();
async function chercher(q) {
  if (cache.has(q)) return cache.get(q);
  for (let essai = 0; essai < 3; essai++) {
    try {
      const r = await fetch(`${API}?q=${encodeURIComponent(q)}&page=1&per_page=1`, { signal: AbortSignal.timeout(8000) });
      if (r.status === 429) { await new Promise((s) => setTimeout(s, 2000 * (essai + 1))); continue; }
      if (!r.ok) { cache.set(q, { erreur: `HTTP ${r.status}` }); return cache.get(q); }
      const j = await r.json();
      const v = { total: j.total_results ?? 0, premier: j.results?.[0] ?? null };
      cache.set(q, v);
      return v;
    } catch (e) {
      if (essai === 2) { cache.set(q, { erreur: String(e).slice(0, 60) }); return cache.get(q); }
      await new Promise((s) => setTimeout(s, 1500));
    }
  }
}

/**
 * 🔴 UN NUMÉRO MAL FORMÉ EST UN DÉFAUT D'EXTRACTION, PAS UN DÉFAUT D'ENTREPRISE.
 * SIREN et SIRET portent une clé de Luhn : `00000000000000`, `0650163267`
 * (10 chiffres) ou `76990820748` (11) ne sont pas des SIRET introuvables, ce
 * sont des chiffres mal lus sur une photo. Les compter comme « entreprise
 * inexistante » accuserait des artisans honnêtes — exactement le conseil
 * intempestif que ce projet s'interdit.
 * ⚠️ Le SIREN de La Poste (356000000) est la seule exception connue à Luhn.
 */
function luhnOk(n) {
  if (n === "356000000") return true;
  let somme = 0;
  for (let i = 0; i < n.length; i++) {
    const pos = n.length - 1 - i; // on double un rang sur deux EN PARTANT DE LA DROITE
    let d = Number(n[pos]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    somme += d;
  }
  return somme % 10 === 0;
}
const bienForme = (c) =>
  (c.siret.length === 14 && luhnOk(c.siret) && luhnOk(c.siren)) ||
  (c.siret.length === 9 && luhnOk(c.siren));

const bilan = { trouve: 0, malForme: 0, retrouveParNom: 0, inexistante: 0, erreur: 0 };
const aRelire = [];
for (const [i, c] of cas.entries()) {
  process.stdout.write(`\r  ${i + 1}/${cas.length}`);
  let r = await chercher(c.siret.length === 14 ? c.siret : c.siren);
  if (r?.erreur) { bilan.erreur++; continue; }
  if (!r.total) r = await chercher(c.siren);   // deux requêtes avant de conclure — jamais une seule
  if (r?.erreur) { bilan.erreur++; continue; }
  if (r.total > 0) { bilan.trouve++; await new Promise((s) => setTimeout(s, 160)); continue; }

  // Le numéro n'existe pas. Trois causes très différentes à séparer.
  if (!bienForme(c)) { bilan.malForme++; c.motif = "numéro mal formé (clé de Luhn KO)"; }
  else {
    // Dernier recours : le NOM retrouve-t-il l'entreprise ? Si oui, ce sont les
    // chiffres qui ont été mal lus, pas l'entreprise qui est absente.
    const parNom = c.nom.length >= 3 ? await chercher(c.nom) : { total: 0 };
    if (parNom?.erreur) { bilan.erreur++; continue; }
    if (parNom.total > 0) { bilan.retrouveParNom++; c.motif = `retrouvée par son nom (${parNom.premier?.nom_complet ?? "?"})`; }
    else { bilan.inexistante++; c.motif = "AUCUNE TRACE — ni par SIRET, ni par SIREN, ni par nom"; }
  }
  aRelire.push(c);
  await new Promise((s) => setTimeout(s, 160)); // le registre est un service public : on ne le martèle pas
}

const pc = (n, d) => (d ? Math.round((n / d) * 100) + " %" : "—");
console.log(`\n\nrejeu de ${cas.length} recherches :`);
console.log(`  entreprise retrouvée par son numéro : ${bilan.trouve} (${pc(bilan.trouve, cas.length)})`);
console.log(`  numéro MAL FORMÉ (Luhn KO)          : ${bilan.malForme}  → défaut d'extraction, jamais rouge`);
console.log(`  numéro valide mais retrouvée par nom : ${bilan.retrouveParNom}  → chiffres mal lus, jamais rouge`);
console.log(`  AUCUNE TRACE                         : ${bilan.inexistante} (${pc(bilan.inexistante, cas.length)})   ← les seuls qui deviennent ROUGE`);
console.log(`  recherche en échec                   : ${bilan.erreur}  (ne conclut rien, par principe)`);

if (aRelire.length) {
  console.log(`\ndétail — à relire un par un AVANT de livrer :\n`);
  for (const c of aRelire) {
    console.log(`  ${c.fichier}`);
    console.log(`     ${c.date} · pastille ${c.score} · statut stocké "${c.statutStocke}"${c.nomOfficiel ? ` · rattachée à « ${c.nomOfficiel} »` : ""}`);
    console.log(`     devis : « ${c.nom} » · numéro ${c.siret} (${c.siret.length} chiffres)`);
    console.log(`     → ${c.motif}\n`);
  }
}
