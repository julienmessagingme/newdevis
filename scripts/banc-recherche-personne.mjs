/**
 * scripts/banc-recherche-personne.mjs
 *
 * 2026-09-13 — CHERCHER LA PERSONNE QUAND LE NOM COMMERCIAL NE DONNE RIEN.
 *
 * Trouvé en réfutant le filtre par code postal : « Entreprise FK » ne désigne
 * aucune entreprise, mais `q=Forgeas Kurtis` — le nom porté par l'adresse
 * e-mail de l'en-tête — rend UN seul résultat, KURTIS FORGEAS (SIREN
 * 809 748 759, APE 43.91B couverture, active). Le métier colle au devis, et le
 * numéro imprimé est ce SIREN avec trois chiffres mal lus.
 * **Chez un artisan en entreprise individuelle, la raison sociale EST le nom de
 * la personne** — et c'est ce nom que le nom commercial cache.
 *
 * 🔴 POURQUOI CE BANC RELIT LES DOCUMENTS D'ORIGINE. Ni l'e-mail ni le nom du
 * contact ne sont extraits aujourd'hui (`extracted.entreprise` ne porte que
 * nom / siret / adresse / iban / assurances / certifications), et aucun e-mail
 * ne survit nulle part dans le JSON stocké — vérifié. Mesurer sur le stock est
 * donc impossible : il faut redemander ces deux champs aux documents eux-mêmes,
 * avec le modèle de production. C'est aussi ce qui valide le préalable : si le
 * modèle ne sait pas lire l'e-mail, la piste s'arrête là.
 *
 * ── Population ────────────────────────────────────────────────────────────
 * Les mêmes 17 cas que `banc-repli-nom.mjs` : 7 où la production n'a pas su
 * trancher (ce qu'on veut réparer) et 10 qu'elle a résolues par le nom (ce
 * qu'on risque de contredire). Sans la seconde moitié, on ne mesurerait que
 * les gains.
 *
 * ⚠️ Ces documents sont des devis de clients réels. Le banc les lit en mémoire
 * et n'en écrit aucun sur le disque.
 *
 * Usage : npx tsx scripts/banc-recherche-personne.mjs
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { pickBestNameMatch } from "../supabase/functions/analyze-quote/verify.ts";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const CLE = lire("GOOGLE_API_KEY");
const MODELE = "gemini-2.5-flash"; // celui de extract.ts
const API = "https://recherche-entreprises.api.gouv.fr/search";
const CACHE = "scratch/personnes.json";

fs.mkdirSync("scratch", { recursive: true });
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
const sauver = () => fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));

// ── Les 17 cas (même sélection que banc-repli-nom.mjs) ─────────────────────
let debut = 0; const analyses = [];
for (;;) {
  const { data, error } = await supa
    .from("analyses").select("id,file_name,file_path,user_id,created_at,raw_text")
    .eq("status", "completed").order("created_at", { ascending: false })
    .range(debut, debut + 499);
  if (error) throw error;
  analyses.push(...data);
  if (data.length < 500) break;
  debut += 500;
}

const vus = new Set(); const cas = [];
for (const a of analyses) {
  let b;
  try { b = typeof a.raw_text === "string" ? JSON.parse(a.raw_text) : a.raw_text; } catch { continue; }
  const cle = `${a.user_id}|${(a.file_name ?? "").replace(/\s*\(\d+\)(?=\.[a-z]+$)/i, "")}`;
  if (vus.has(cle)) continue;
  vus.add(cle);
  const ex = b?.extracted ?? {}; const v = b?.verified ?? {};
  if (ex.is_foreign_quote) continue;
  const nom = String(ex.entreprise?.nom ?? "").trim();
  if (nom.length < 3) continue;
  const numero = String(ex.entreprise?.siret ?? "").replace(/\D/g, "");
  const numeroCherchable = numero.length === 9 || numero.length === 14;
  const ambigu = v.lookup_status === "ambiguous";
  const parNom = v.lookup_status === "ok" && v.nom_officiel && !numeroCherchable;
  if (ambigu || parNom) {
    cas.push({
      id: a.id, fichier: a.file_name, chemin: a.file_path,
      nom, adresse: ex.entreprise?.adresse ?? null,
      cpChantier: ex.client?.code_postal ?? null,
      population: ambigu ? "ambiguë" : "trouvée par nom",
      attenduProduction: v.nom_officiel ?? null,
    });
  }
}
console.log(`${cas.length} cas · ${cas.filter((c) => c.population === "ambiguë").length} ambiguës · ${cas.filter((c) => c.population === "trouvée par nom").length} résolues par le nom\n`);

// ── 1. Relire e-mail + contact dans le document d'origine ──────────────────
const MIME = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

async function lireContact(c) {
  if (cache[c.id]) return cache[c.id];
  const { data: dl, error } = await supa.storage.from("devis").download(c.chemin);
  if (error || !dl) { cache[c.id] = { erreur: `téléchargement : ${error?.message ?? "vide"}` }; sauver(); return cache[c.id]; }
  const buf = Buffer.from(await dl.arrayBuffer());
  const ext = String(c.chemin).split(".").pop()?.toLowerCase() ?? "pdf";
  const mime = MIME[ext] ?? "application/pdf";

  const prompt = `Tu lis l'EN-TÊTE d'un devis d'artisan. Relève UNIQUEMENT, et mot pour mot :
- l'adresse e-mail de l'ENTREPRISE (pas celle du client) ;
- le nom de la PERSONNE de contact côté entreprise (gérant, artisan, signataire) si un nom de personne apparaît.
N'invente rien : si ce n'est pas écrit, réponds null.
Réponds uniquement en JSON : {"email": "...", "contact": "..."}`;

  for (let essai = 0; essai < 3; essai++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELE}:generateContent?key=${CLE}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: buf.toString("base64") } }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 2048, responseMimeType: "application/json" },
      }),
    });
    if (!r.ok) { await new Promise((s) => setTimeout(s, 2500 * (essai + 1))); continue; }
    const t = (await r.json()).candidates?.[0]?.content?.parts?.[0]?.text;
    if (!t) continue;
    try { cache[c.id] = JSON.parse(t); sauver(); return cache[c.id]; } catch { continue; }
  }
  cache[c.id] = { erreur: "lecture impossible" }; sauver();
  return cache[c.id];
}

// ── 2. Candidats « personne » ──────────────────────────────────────────────
/**
 * ⚠️ La partie locale d'une adresse e-mail n'est un nom que si elle EN A LA
 * FORME. `contact@`, `devis@`, `info@` sont des boîtes de service : les
 * chercher dans le registre reviendrait à chercher « contact » comme raison
 * sociale. On exige donc deux fragments alphabétiques d'au moins 3 lettres.
 */
const BOITES_DE_SERVICE = /^(contact|info|devis|commercial|secretariat|secretariat|accueil|admin|direction|service|sav|compta|comptabilite|bonjour|hello|mail|courrier|entreprise|sarl|sas|eurl)$/i;

function candidatsPersonne({ email, contact }) {
  const out = [];
  const propre = (s) => String(s ?? "").trim().replace(/\s+/g, " ");
  if (propre(contact).split(" ").filter((m) => m.length >= 3).length >= 2) out.push(propre(contact));
  const local = String(email ?? "").split("@")[0] ?? "";
  if (local && !BOITES_DE_SERVICE.test(local)) {
    const morceaux = local.split(/[._\-+]/).filter((m) => /^[a-zà-ÿ]{3,}$/i.test(m));
    if (morceaux.length >= 2) out.push(morceaux.join(" "));
  }
  // Un prénom seul ne sert que collé au nom commercial — jamais seul.
  if (!out.length && propre(contact).length >= 3 && local && !BOITES_DE_SERVICE.test(local)) {
    const morceaux = local.split(/[._\-+]/).filter((m) => /^[a-zà-ÿ]{3,}$/i.test(m));
    if (morceaux.length === 1) out.push(`${propre(contact)} ${morceaux[0]}`.trim());
  }
  return [...new Set(out)];
}

async function chercher(q) {
  for (let essai = 0; essai < 3; essai++) {
    try {
      const r = await fetch(`${API}?${new URLSearchParams({ q, page: "1", per_page: "5" })}`, { signal: AbortSignal.timeout(8000) });
      if (r.status === 429) { await new Promise((s) => setTimeout(s, 2000 * (essai + 1))); continue; }
      if (!r.ok) return { results: [] };
      const j = await r.json();
      return { results: j.results ?? [], total: j.total_results ?? 0 };
    } catch { if (essai === 2) return { results: [] }; await new Promise((s) => setTimeout(s, 1500)); }
  }
}

// ── 3. Mesure ──────────────────────────────────────────────────────────────
const bilan = { sansContact: 0, sansCandidat: 0, trouve: 0, rienTrouve: 0, contredit: 0, confirme: 0 };
for (const c of cas) {
  const lu = await lireContact(c);
  if (lu.erreur) { console.log(`⚠️  ${c.fichier} — ${lu.erreur}\n`); bilan.sansContact++; continue; }
  const candidats = candidatsPersonne(lu);
  const adresseRef = c.adresse ?? (c.cpChantier ? String(c.cpChantier) : null);

  let choix = null, via = null;
  for (const q of candidats) {
    const r = await chercher(q);
    await new Promise((s) => setTimeout(s, 250));
    const p = pickBestNameMatch(r.results, adresseRef);
    if (p.match) { choix = p.match; via = q; break; }
  }

  const trouve = choix ? (choix.nom_complet || choix.nom_raison_sociale) : null;
  let verdict;
  if (!candidats.length) { verdict = "pas de nom de personne exploitable"; bilan.sansCandidat++; }
  else if (!trouve) { verdict = "rien trouvé"; bilan.rienTrouve++; }
  else if (c.population === "ambiguë") { verdict = "🟢 RÉSOUT un cas ambigu"; bilan.trouve++; }
  else if (c.attenduProduction && trouve.toUpperCase().includes(String(c.attenduProduction).toUpperCase().slice(0, 12))) {
    verdict = "confirme la production"; bilan.confirme++;
  } else { verdict = "⚠️ CONTREDIT la production"; bilan.contredit++; }

  console.log(`${verdict}  —  ${c.fichier}  [${c.population}]`);
  console.log(`   devis : « ${c.nom} »  ·  e-mail lu : ${lu.email ?? "aucun"}  ·  contact lu : ${lu.contact ?? "aucun"}`);
  if (candidats.length) console.log(`   candidats personne : ${candidats.join(" | ")}`);
  if (trouve) {
    const s = choix.siege ?? {};
    console.log(`   → ${trouve} · SIREN ${choix.siren} · ${s.code_postal ?? "?"} ${s.libelle_commune ?? ""} · APE ${choix.activite_principale} · ${choix.etat_administratif === "A" ? "active" : "CESSÉE"}  (via « ${via} »)`);
  }
  if (c.attenduProduction) console.log(`   production avait retenu : ${c.attenduProduction}`);
  console.log();
}

console.log("\n══ BILAN ══");
console.log(`  résout un cas ambigu          : ${bilan.trouve}   ← le gain`);
console.log(`  rien trouvé                   : ${bilan.rienTrouve}`);
console.log(`  aucun nom de personne lisible : ${bilan.sansCandidat}`);
console.log(`  document illisible            : ${bilan.sansContact}`);
console.log(`\n  contredit la production       : ${bilan.contredit}`);
console.log(`  confirme la production        : ${bilan.confirme}`);
console.log(
  "\n🔴 CE BANC LANCE LE REPLI SUR LES 17 CAS, Y COMPRIS CEUX QUE LA PRODUCTION\n" +
  "   A DÉJÀ RÉSOLUS — c'est délibéré : c'est la seule façon de voir ce qu'il\n" +
  "   ferait si on le plaçait AVANT le repli par nom. En production il est\n" +
  "   placé APRÈS, donc les lignes « contredit / confirme » ne se produisent\n" +
  "   jamais. Le chiffre qui décrit la règle livrée est le premier : " + bilan.trouve + " sur les\n" +
  "   " + cas.filter((c) => c.population === "ambiguë").length + " ambiguës, sans aucune contradiction.",
);
