/**
 * scripts/regenerer-stock.mjs
 *
 * 2026-09-15 — RÉGÉNÈRE LE STOCK APRÈS LE CORRECTIF DU SURCOÛT.
 *
 * Le bump `ENGINE_VERSION` ne corrige une analyse qu'à sa VISITE : 58 devis du
 * stock portaient encore un montant majoré de 30 % par le coefficient ×1,3, et
 * une analyse jamais rouverte l'aurait gardé indéfiniment.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 🔴 CE SCRIPT PASSE PAR LE CHEMIN NORMAL, JAMAIS PAR `force`.
 *
 * `force: true` contourne le filet du 2026-09-04 et ÉCRASE une conclusion
 * réécrite par un humain. Sans `force`, la route sert la conclusion telle
 * quelle quand `review_status === "corrected"` — c'est exactement ce qu'on
 * veut. Double ceinture : le script saute aussi ces analyses de lui-même.
 * (Appris à mes dépens le même jour sur le devis ALES, restauré depuis
 * `analysis_corrections`.)
 *
 * 🔴 MODE SILENCIEUX. Chaque bascule en `pending_review` envoie un e-mail ET
 * une notification Telegram. Sur un rejeu de masse, cela ferait des dizaines
 * d'alertes d'un coup — qui ressemblent à un incident et qu'on finit par
 * ignorer en bloc. Le statut est posé, la file se remplit, personne n'est
 * réveillé ; l'écran `/admin/reviews` montre le résultat.
 * ⚠️ Le drapeau est refusé par la route si l'appelant n'est pas admin.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Usage :
 *   npx tsx scripts/regenerer-stock.mjs                 (à blanc — n'écrit rien)
 *   npx tsx scripts/regenerer-stock.mjs --appliquer
 *   npx tsx scripts/regenerer-stock.mjs --appliquer --limite=20
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const URL_SUPA = lire("PUBLIC_SUPABASE_URL");
const supa = createClient(URL_SUPA, lire("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const APPLIQUER = process.argv.includes("--appliquer");
const LIMITE = Number(process.argv.find((a) => a.startsWith("--limite="))?.split("=")[1] ?? 0) || Infinity;
const BASE = process.argv.find((a) => a.startsWith("--base="))?.split("=")[1] ?? "http://localhost:4321";
const ADMIN = "bridey.johan@gmail.com";
const VERSION_CIBLE = "1.3.0-refonte";
/** 3 en parallèle : assez pour tenir le rythme, assez peu pour ne pas se faire limiter par Gemini. */
const CONCURRENCE = 3;

const eur = (n) => `${Math.round(n || 0).toLocaleString("fr-FR")} €`;

// ── Inventaire ───────────────────────────────────────────────────────────────
let toutes = [], from = 0;
for (;;) {
  const { data, error } = await supa
    .from("analyses")
    .select("id, file_name, review_status, conclusion_ia, created_at")
    .not("conclusion_ia", "is", null)
    .order("created_at", { ascending: false })
    .range(from, from + 499);
  if (error) { console.error(error); process.exit(1); }
  toutes = toutes.concat(data);
  if (data.length < 500) break;
  from += 500;
}

const lireConclusion = (a) => {
  try { return typeof a.conclusion_ia === "string" ? JSON.parse(a.conclusion_ia) : (a.conclusion_ia ?? {}); }
  catch { return {}; }
};

const aJour = [], corrigees = [], aFaire = [];
for (const a of toutes) {
  const c = lireConclusion(a);
  if (a.review_status === "corrected") { corrigees.push(a); continue; }
  if (c.engine_version === VERSION_CIBLE) { aJour.push(a); continue; }
  aFaire.push({ ...a, avant: Number(c.surcout_global?.max ?? 0) || 0, version: c.engine_version ?? "(absente)" });
}

const montantAvant = aFaire.reduce((s, a) => s + a.avant, 0);
console.log(`Analyses avec conclusion            : ${toutes.length}`);
console.log(`  · déjà en ${VERSION_CIBLE}        : ${aJour.length}`);
console.log(`  · corrigées par un expert (intactes) : ${corrigees.length}`);
console.log(`  · À RÉGÉNÉRER                     : ${aFaire.length}`);
console.log(`Montant annoncé aujourd'hui sur ce lot : ${eur(montantAvant)}`);

if (!APPLIQUER) {
  console.log("\n(à blanc — relancer avec --appliquer)");
  process.exit(0);
}

// ── Jeton admin ──────────────────────────────────────────────────────────────
const { data: link, error: eLink } = await supa.auth.admin.generateLink({ type: "magiclink", email: ADMIN });
if (eLink) { console.error("génération du lien admin :", eLink.message); process.exit(1); }
const anon = createClient(URL_SUPA, lire("PUBLIC_SUPABASE_PUBLISHABLE_KEY"), { auth: { persistSession: false } });
const { data: sess, error: eSess } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
if (eSess) { console.error("session admin :", eSess.message); process.exit(1); }
const JETON = sess.session.access_token;

// ── Rejeu ────────────────────────────────────────────────────────────────────
const cible = aFaire.slice(0, LIMITE === Infinity ? aFaire.length : LIMITE);
console.log(`\nRégénération de ${cible.length} analyse(s) via ${BASE}, ${CONCURRENCE} en parallèle…\n`);

const resultats = [];
let faits = 0;
for (let i = 0; i < cible.length; i += CONCURRENCE) {
  const lot = cible.slice(i, i + CONCURRENCE);
  await Promise.all(lot.map(async (a) => {
    const t0 = Date.now();
    try {
      const r = await fetch(`${BASE}/api/analyse/${a.id}/conclusion`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${JETON}` },
        // ⚠️ PAS de `force` — le filet des conclusions corrigées doit pouvoir jouer.
        body: JSON.stringify({ silencieux: true }),
      });
      const txt = await r.text();
      if (!r.ok) { resultats.push({ ...a, erreur: `HTTP ${r.status}`, detail: txt.slice(0, 120) }); return; }
      const j = JSON.parse(txt);
      const c = typeof j.conclusion === "string" ? JSON.parse(j.conclusion) : (j.conclusion ?? {});
      resultats.push({
        ...a,
        apres: Number(c.surcout_global?.max ?? 0) || 0,
        version: c.engine_version,
        arbitre: c.arbitrage_rapprochement?.conteste?.length ?? 0,
        ms: Date.now() - t0,
      });
    } catch (e) {
      resultats.push({ ...a, erreur: e instanceof Error ? e.message : String(e) });
    } finally {
      process.stdout.write(`\r  ${++faits}/${cible.length}…`);
    }
  }));
}
console.log(`\r  ${faits} analyses traitées.            \n`);

// ── Contrôle après coup, lu en BASE et non dans les réponses ─────────────────
const ids = cible.map((a) => a.id);
const { data: apres } = await supa.from("analyses").select("id, review_status, conclusion_ia").in("id", ids);
const parId = new Map((apres ?? []).map((a) => [a.id, a]));

const ok = resultats.filter((r) => !r.erreur);
const erreurs = resultats.filter((r) => r.erreur);
const montantApres = ok.reduce((s, r) => s + (r.apres ?? 0), 0);
const montantAvantLot = ok.reduce((s, r) => s + r.avant, 0);
const enRevue = (apres ?? []).filter((a) => a.review_status === "pending_review");
const pasAJour = (apres ?? []).filter((a) => {
  try { return JSON.parse(a.conclusion_ia ?? "{}").engine_version !== VERSION_CIBLE; } catch { return true; }
});

console.log(`Régénérées sans erreur : ${ok.length}`);
console.log(`Erreurs                : ${erreurs.length}`);
console.log(`Montant annoncé  avant : ${eur(montantAvantLot)}`);
console.log(`Montant annoncé  après : ${eur(montantApres)}  (${montantAvantLot > 0 ? Math.round((montantApres - montantAvantLot) / montantAvantLot * 100) : 0} %)`);
console.log(`Analyses contestées par l'arbitre : ${ok.filter((r) => (r.arbitre ?? 0) > 0).length}`);
console.log(`En pending_review après le rejeu  : ${enRevue.length}`);
console.log(`⚠️ Non passées en ${VERSION_CIBLE}  : ${pasAJour.length}`);
if (erreurs.length) {
  console.log("\nÉchecs :");
  for (const e of erreurs.slice(0, 15)) console.log(`   • ${e.file_name} — ${e.erreur} ${e.detail ?? ""}`);
}
const duree = ok.map((r) => r.ms).filter(Boolean).sort((a, b) => a - b);
if (duree.length) console.log(`\nDurée médiane par analyse : ${(duree[Math.floor(duree.length / 2)] / 1000).toFixed(1)} s`);
