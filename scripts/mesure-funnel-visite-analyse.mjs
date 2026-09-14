/**
 * scripts/mesure-funnel-visite-analyse.mjs
 *
 * 2026-09-13 (demande Johan) — OÙ PART RÉELLEMENT LE MONDE ENTRE LA VISITE ET
 * L'ANALYSE ?
 *
 * Le funnel du 13/09 (780 visiteurs-jour sur l'accueil → 53 vers l'analyse →
 * 22 comptes → 22 analyses) dit qu'une fuite écrase toutes les autres. Mais il
 * ne dit PAS :
 *   · par quelle PAGE les gens entrent (l'accueil n'est pas la seule porte —
 *     l'observatoire, les guides et les pages de prix sont indexés) ;
 *   · quelles pages amènent au but et lesquelles sont des culs-de-sac ;
 *   · combien de visiteurs voient PLUS D'UNE page (donc lisent vraiment).
 *
 * ⚠️ `visitor_hash` TOURNE CHAQUE JOUR : on ne peut suivre un parcours qu'À
 * L'INTÉRIEUR d'une journée. Tout ce qui est calculé ici est donc un
 * « visiteur-jour », jamais une personne. C'est une borne BASSE de la
 * conversion (quelqu'un qui revient le lendemain compte deux fois au
 * dénominateur), et il faut le dire quand on cite les chiffres.
 *
 * Aucune donnée personnelle n'est lue : la table ne contient qu'un hash
 * rotatif, un chemin et un jour.
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const pct = (n, d) => (d > 0 ? `${((n / d) * 100).toFixed(1)} %` : "—");

/** Pagination : la table peut dépasser la limite par défaut de PostgREST. */
async function toutesLesVisites() {
  const out = [];
  const TAILLE = 1000;
  for (let debut = 0; ; debut += TAILLE) {
    const { data, error } = await supa
      .from("site_visits")
      .select("jour, visitor_hash, path, site, created_at")
      .eq("site", "vmd")
      .order("created_at", { ascending: true })
      .range(debut, debut + TAILLE - 1);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < TAILLE) break;
  }
  return out;
}

/** Regroupe les chemins en FAMILLES : sinon chaque slug d'article fait sa ligne. */
function famille(path) {
  if (path === "/") return "/ (accueil)";
  if (path.startsWith("/observatoire")) return "/observatoire/*";
  if (path.startsWith("/guides")) return "/guides/*";
  if (path.startsWith("/blog")) return "/blog/*";
  if (path.startsWith("/analyse/")) return "/analyse/[id] (résultat)";
  if (path.startsWith("/etudes-vmd")) return "/etudes-vmd/*";
  if (path.startsWith("/comparateur")) return "/comparateur/*";
  if (path.startsWith("/mon-chantier")) return "/mon-chantier/*";
  return path;
}

/** Les pages qui sont un BUT, pas une étape. */
const EST_ANALYSE = (p) => p.startsWith("/nouvelle-analyse");
const EST_INSCRIPTION = (p) => p.startsWith("/inscription");
const EST_CONNEXION = (p) => p.startsWith("/connexion");
const EST_RESULTAT = (p) => p.startsWith("/analyse/");

const visites = await toutesLesVisites();
if (visites.length === 0) {
  console.log("Aucune visite enregistrée.");
  process.exit(0);
}

const jours = [...new Set(visites.map((v) => v.jour))].sort();
console.log(`\n=== FENÊTRE MESURÉE : ${jours[0]} → ${jours[jours.length - 1]} (${jours.length} jours) ===`);
console.log(`${visites.length} pages vues.\n`);

// ── Sessions : un visiteur-jour = une clé (jour, hash) ────────────────────────
const sessions = new Map();
for (const v of visites) {
  const cle = `${v.jour}|${v.visitor_hash}`;
  if (!sessions.has(cle)) sessions.set(cle, []);
  sessions.get(cle).push(v);
}

const total = sessions.size;
console.log(`Visiteurs-jour : ${total}`);

// ── 1. Par quelle page entre-t-on ? ───────────────────────────────────────────
const parEntree = new Map();
for (const [, pages] of sessions) {
  const f = famille(pages[0].path);
  if (!parEntree.has(f)) {
    parEntree.set(f, { entrees: 0, atteintAnalyse: 0, atteintInscription: 0, multiPage: 0, pagesVues: 0 });
  }
  const e = parEntree.get(f);
  e.entrees += 1;
  e.pagesVues += pages.length;
  if (pages.length > 1) e.multiPage += 1;
  if (pages.some((p) => EST_ANALYSE(p.path))) e.atteintAnalyse += 1;
  if (pages.some((p) => EST_INSCRIPTION(p.path))) e.atteintInscription += 1;
}

console.log(`\n=== 1. PAGE D'ENTRÉE → A-T-ON ATTEINT LE BUT ? ===`);
console.log(`(dans la MÊME journée — le hash tourne, on ne voit pas les retours)\n`);
const lignes = [...parEntree.entries()].sort((a, b) => b[1].entrees - a[1].entrees);
console.log(
  "page d'entrée".padEnd(30) +
    "entrées".padStart(9) +
    "  >1 page".padStart(10) +
    "  →analyse".padStart(11) +
    "  →inscr.".padStart(10) +
    "  tx analyse".padStart(12),
);
for (const [f, e] of lignes) {
  if (e.entrees < 3) continue;
  console.log(
    f.padEnd(30) +
      String(e.entrees).padStart(9) +
      pct(e.multiPage, e.entrees).padStart(10) +
      String(e.atteintAnalyse).padStart(11) +
      String(e.atteintInscription).padStart(10) +
      pct(e.atteintAnalyse, e.entrees).padStart(12),
  );
}
const rare = lignes.filter(([, e]) => e.entrees < 3);
console.log(`\n(${rare.length} pages d'entrée à moins de 3 visiteurs, non listées — total ${rare.reduce((s, [, e]) => s + e.entrees, 0)})`);

// ── 2. Profondeur : combien de gens lisent vraiment ? ─────────────────────────
const profondeurs = [...sessions.values()].map((p) => p.length);
const unePage = profondeurs.filter((n) => n === 1).length;
console.log(`\n=== 2. PROFONDEUR DE VISITE ===`);
console.log(`Une seule page       : ${unePage} (${pct(unePage, total)})`);
console.log(`Deux pages ou plus   : ${total - unePage} (${pct(total - unePage, total)})`);
console.log(`Pages vues / visiteur: ${(visites.length / total).toFixed(2)}`);

// ── 3. Le funnel global, étape par étape ─────────────────────────────────────
let vuAccueil = 0, vuAnalyse = 0, vuInscription = 0, vuConnexion = 0, vuResultat = 0;
for (const [, pages] of sessions) {
  if (pages.some((p) => p.path === "/")) vuAccueil += 1;
  if (pages.some((p) => EST_ANALYSE(p.path))) vuAnalyse += 1;
  if (pages.some((p) => EST_INSCRIPTION(p.path))) vuInscription += 1;
  if (pages.some((p) => EST_CONNEXION(p.path))) vuConnexion += 1;
  if (pages.some((p) => EST_RESULTAT(p.path))) vuResultat += 1;
}
console.log(`\n=== 3. FUNNEL (visiteurs-jour ayant vu au moins une fois la page) ===`);
console.log(`Accueil              : ${vuAccueil}`);
console.log(`/nouvelle-analyse    : ${vuAnalyse}  (${pct(vuAnalyse, total)} de tous les visiteurs)`);
console.log(`/inscription         : ${vuInscription}`);
console.log(`/connexion           : ${vuConnexion}`);
console.log(`/analyse/[id]        : ${vuResultat}  ← a VU un résultat (compte existant inclus)`);

// ── 4. Les culs-de-sac : pages très vues qui ne mènent jamais au but ──────────
const parPage = new Map();
for (const [, pages] of sessions) {
  const atteint = pages.some((p) => EST_ANALYSE(p.path));
  const vues = new Set(pages.map((p) => famille(p.path)));
  for (const f of vues) {
    if (!parPage.has(f)) parPage.set(f, { vue: 0, puisAnalyse: 0 });
    parPage.get(f).vue += 1;
    if (atteint) parPage.get(f).puisAnalyse += 1;
  }
}
console.log(`\n=== 4. TOUTE PAGE VUE (pas seulement en entrée) → taux d'accès à l'analyse ===`);
console.log("page".padEnd(30) + "vue par".padStart(9) + "  →analyse".padStart(11) + "  taux".padStart(9));
for (const [f, e] of [...parPage.entries()].sort((a, b) => b[1].vue - a[1].vue).slice(0, 18)) {
  console.log(
    f.padEnd(30) + String(e.vue).padStart(9) + String(e.puisAnalyse).padStart(11) + pct(e.puisAnalyse, e.vue).padStart(9),
  );
}

// ── 5. Le bout du funnel : analyses réellement créées sur la période ──────────
const { count: nbAnalyses } = await supa
  .from("analyses")
  .select("id", { count: "exact", head: true })
  .gte("created_at", `${jours[0]}T00:00:00Z`);
console.log(`\n=== 5. BOUT DU FUNNEL ===`);
console.log(`Analyses créées sur la fenêtre : ${nbAnalyses}`);
console.log(`Soit ${pct(nbAnalyses, total)} des visiteurs-jour, et ${pct(nbAnalyses, vuAnalyse)} de ceux qui atteignent /nouvelle-analyse.`);

// ── 6. Événements d'usage déjà instrumentés ──────────────────────────────────
const { data: evts } = await supa.from("site_events").select("event, jour");
if (evts?.length) {
  const parEvt = new Map();
  for (const e of evts) parEvt.set(e.event, (parEvt.get(e.event) ?? 0) + 1);
  console.log(`\n=== 6. ÉVÉNEMENTS site_events ===`);
  for (const [e, n] of [...parEvt.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`${e.padEnd(38)} ${String(n).padStart(5)}`);
  }
} else {
  console.log(`\n=== 6. ÉVÉNEMENTS site_events === (aucun)`);
}
