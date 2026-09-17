/**
 * scripts/rejouer-une-analyse.mjs
 *
 * 🔴 REJOUER **UNE** ANALYSE, Y COMPRIS QUAND UN EXPERT L'A DÉJÀ CORRIGÉE.
 *
 * `regenerer-stock.mjs` n'utilise JAMAIS `force` — c'est voulu, et il faut que
 * ça le reste : sans ce drapeau, la route sert la conclusion telle quelle quand
 * `review_status === "corrected"`, et le filet du 04/09 protège le travail de
 * l'expert. Le 15/09, une régénération forcée a écrasé la conclusion du devis
 * ALES ; elle n'a été récupérée que parce que `analysis_corrections` gardait la
 * décision intacte.
 *
 * Il existe pourtant un cas légitime : **un correctif du moteur change ce que
 * l'expert aurait vu**. Il a tranché sur une analyse fausse ; la rejouer n'est
 * pas lui désobéir, c'est lui rendre la bonne question. Ce script existe pour
 * ce cas-là, UNE analyse à la fois, sur décision explicite.
 *
 * ⚠️ TROIS GARDES, ET AUCUNE N'EST OPTIONNELLE :
 *   1. **Sauvegarde AVANT.** La conclusion stockée est écrite sur disque avant
 *      tout appel. Sans elle, une régénération ratée est irréversible.
 *      ⚠️ Le fichier contient la conclusion COMPLÈTE d'un devis de client réel
 *      et le dépôt est PUBLIC : `sauvegarde-conclusion-*.json` est dans
 *      `.gitignore`, comme l'étalon du 10/09 et les feuilles de relecture. Ne
 *      jamais le committer, ne jamais le renommer hors de ce motif.
 *   2. **`silencieux: true`.** L'utilisateur ne doit pas recevoir d'e-mail pour
 *      une correction de notre moteur.
 *   3. **Vérification EN BASE après coup.** Une réponse 200 ne prouve pas que
 *      la ligne a été écrite (leçon de `regenerer-stock`).
 *
 * ⚠️ CE QU'IL NE FAIT PAS, DÉLIBÉRÉMENT : il ne touche pas à
 * `analysis_corrections`. La décision de l'expert reste telle qu'il l'a prise.
 * Si le rejeu change le montant, **sa décision devient périmée** et c'est à lui
 * de re-trancher — pas au script de réécrire son jugement.
 *
 * Usage :
 *   npx tsx scripts/rejouer-une-analyse.mjs <analysis_id>              # à blanc
 *   npx tsx scripts/rejouer-une-analyse.mjs <analysis_id> --appliquer
 *   … --base=https://www.verifiermondevis.fr   (défaut : la production)
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const URL_SUPA = lire("PUBLIC_SUPABASE_URL");
const supa = createClient(URL_SUPA, lire("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const ID = process.argv[2];
const APPLIQUER = process.argv.includes("--appliquer");
const BASE = process.argv.find((a) => a.startsWith("--base="))?.split("=")[1]
  ?? "https://www.verifiermondevis.fr";
const ADMIN = "bridey.johan@gmail.com";
const eur = (n) => `${Math.round(n || 0).toLocaleString("fr-FR")} €`;

if (!ID || ID.startsWith("--")) {
  console.error("usage : npx tsx scripts/rejouer-une-analyse.mjs <analysis_id> [--appliquer]");
  process.exit(1);
}

const { data: a, error } = await supa
  .from("analyses")
  .select("id, file_name, created_at, review_status, conclusion_ia")
  .eq("id", ID)
  .single();
if (error) { console.error("analyse introuvable :", error.message); process.exit(1); }

const avant = (() => { try { return JSON.parse(a.conclusion_ia ?? "{}"); } catch { return {}; } })();
console.log(`\n══ ${a.file_name} ══`);
console.log(`   déposée le ${String(a.created_at).slice(0, 10)} · review_status = ${a.review_status}`);
console.log(`   AVANT : verdict ${avant.verdict_global ?? "-"} · surcoût ${eur(avant.surcout_global?.max)} · moteur ${avant.engine_version ?? "-"}`);

// La décision d'expert éventuelle — on la montre, on ne la touche pas.
const { data: corrections } = await supa
  .from("analysis_corrections")
  .select("action, reviewed_at, reviewed_by_email, corrected_surcout_max, corrected_verdict_global")
  .eq("analysis_id", ID)
  .order("reviewed_at", { ascending: false });
for (const c of corrections ?? []) {
  console.log(`   décision expert : ${c.action} le ${String(c.reviewed_at).slice(0, 16)} par ${c.reviewed_by_email}` +
    ` → verdict ${c.corrected_verdict_global ?? "-"} · surcoût ${eur(c.corrected_surcout_max)}`);
}

if (a.review_status === "corrected") {
  console.log(`\n   🔴 CETTE CONCLUSION A ÉTÉ RÉÉCRITE PAR UN HUMAIN.`);
  console.log(`      Le rejeu l'ÉCRASERA (il passe par \`force\`). Ne le faire que si un correctif`);
  console.log(`      du moteur change ce que l'expert avait sous les yeux.`);
}

if (!APPLIQUER) {
  console.log(`\n   (à blanc — relancer avec --appliquer)`);
  process.exit(0);
}

// ── 1. SAUVEGARDE, avant tout appel ──────────────────────────────────────────
const horodatage = new Date().toISOString().replace(/[:.]/g, "-");
const fichier = `sauvegarde-conclusion-${ID.slice(0, 8)}-${horodatage}.json`;
fs.writeFileSync(fichier, JSON.stringify({
  analysis_id: ID, file_name: a.file_name, review_status: a.review_status,
  conclusion_ia: a.conclusion_ia, corrections: corrections ?? [],
}, null, 2), "utf8");
console.log(`\n   ✓ sauvegarde écrite : ${fichier}`);

// ── 2. Jeton admin (même mécanique que regenerer-stock) ──────────────────────
const { data: link, error: eLink } = await supa.auth.admin.generateLink({ type: "magiclink", email: ADMIN });
if (eLink) { console.error("génération du lien admin :", eLink.message); process.exit(1); }
const anon = createClient(URL_SUPA, lire("PUBLIC_SUPABASE_PUBLISHABLE_KEY"), { auth: { persistSession: false } });
const { data: sess, error: eSess } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
if (eSess) { console.error("session admin :", eSess.message); process.exit(1); }

// ── 3. Rejeu ─────────────────────────────────────────────────────────────────
console.log(`   → POST ${BASE}/api/analyse/${ID}/conclusion  { force, silencieux }`);
const t0 = Date.now();
const res = await fetch(`${BASE}/api/analyse/${ID}/conclusion`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess.session.access_token}` },
  body: JSON.stringify({ force: true, silencieux: true }),
});
const txt = await res.text();
console.log(`   ← HTTP ${res.status} en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (!res.ok) { console.error(txt.slice(0, 400)); process.exit(1); }

// ── 4. VÉRIFICATION EN BASE — une réponse 200 ne prouve rien ─────────────────
const { data: apresRow } = await supa
  .from("analyses").select("review_status, conclusion_ia").eq("id", ID).single();
const apres = (() => { try { return JSON.parse(apresRow?.conclusion_ia ?? "{}"); } catch { return {}; } })();

console.log(`\n══ APRÈS (relu en base) ══`);
console.log(`   review_status : ${a.review_status} → ${apresRow?.review_status}`);
console.log(`   verdict       : ${avant.verdict_global ?? "-"} → ${apres.verdict_global ?? "-"}`);
console.log(`   surcoût       : ${eur(avant.surcout_global?.max)} → ${eur(apres.surcout_global?.max)}`);
console.log(`   moteur        : ${avant.engine_version ?? "-"} → ${apres.engine_version ?? "-"}`);
if (apres.incomplete_quote) {
  console.log(`   ⚠️ le bypass « devis incomplet » s'applique TOUJOURS : ${JSON.stringify(apres.incomplete_quote)}`);
} else if (avant.incomplete_quote) {
  console.log(`   🟢 le bypass « devis incomplet » a été LEVÉ`);
}
const postes = Array.isArray(apres.anomalies_postes) ? apres.anomalies_postes : [];
if (postes.length) {
  console.log(`   postes nommés :`);
  for (const p of postes) console.log(`      ${eur(p.ecart ?? p.surcout_estime)}  ${p.label ?? p.poste ?? "?"}`);
}
console.log(`   verdict_ligne : ${JSON.stringify(apres.verdict_ligne ?? null)}`);

const expertMax = Number(corrections?.[0]?.corrected_surcout_max ?? NaN);
const nouveauMax = Number(apres.surcout_global?.max ?? 0) || 0;
if (Number.isFinite(expertMax) && Math.abs(expertMax - nouveauMax) > 1) {
  console.log(`\n   🔴 LA DÉCISION D'EXPERT EST DÉSORMAIS PÉRIMÉE :`);
  console.log(`      elle dit ${eur(expertMax)}, le moteur dit maintenant ${eur(nouveauMax)}.`);
  console.log(`      \`analysis_corrections\` n'a PAS été touché — c'est à l'expert de re-trancher.`);
  console.log(`      Tant qu'il ne l'a pas fait, le banc de rejeu comptera ce poste comme une`);
  console.log(`      « réaccusation », ce qui serait faux.`);
}
console.log(`\n   restauration si besoin : le contenu d'origine est dans ${fichier}`);
