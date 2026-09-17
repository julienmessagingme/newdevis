/**
 * scripts/remettre-en-file-revue.mjs
 *
 * Remettre une analyse dans la file de `/admin/reviews` — parce qu'un correctif
 * du moteur a changé ce qu'elle dit, et que la décision d'expert prise sur
 * l'ancienne version ne vaut plus.
 *
 * 🔴 CE N'EST PAS UN CHANGEMENT INTERNE : `review_status = 'pending_review'`
 * GOUVERNE CE QUE VOIT L'UTILISATEUR.
 *   · sa page affiche le bandeau bleu « verdict provisoire, confirmé ou ajusté
 *     sous 24 h ouvrées » ;
 *   · et le montant de l'écart est **MASQUÉ** (règle du 30/08 : une analyse en
 *     attente d'expert n'affiche aucun chiffre d'écart, et le levier
 *     `surcout_postes` est retiré).
 * Remettre en file, c'est donc **retirer temporairement un chiffre de la page
 * du client** jusqu'à ce qu'un humain tranche. C'est honnête — le verdict EST
 * provisoire — mais ça engage la promesse des 24 h. À ne pas faire sur une
 * analyse qu'on ne compte pas trancher.
 *
 * ⚠️ AUCUN E-MAIL N'EST ENVOYÉ : les notifications partent de `persistConclusion`
 * (à la génération) et de la route `decide` (à la décision), jamais d'un
 * changement de statut en base. Vérifié avant d'écrire ce script.
 *
 * ⚠️ IL NE TOUCHE PAS À `analysis_corrections`. La décision passée reste
 * l'archive de ce que l'expert a jugé À L'ÉPOQUE ; la nouvelle s'ajoutera.
 *
 * Usage :
 *   npx tsx scripts/remettre-en-file-revue.mjs <analysis_id>              # à blanc
 *   npx tsx scripts/remettre-en-file-revue.mjs <analysis_id> --appliquer
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const ID = process.argv[2];
const APPLIQUER = process.argv.includes("--appliquer");
const eur = (n) => `${Math.round(n || 0).toLocaleString("fr-FR")} €`;

if (!ID || ID.startsWith("--")) {
  console.error("usage : npx tsx scripts/remettre-en-file-revue.mjs <analysis_id> [--appliquer]");
  process.exit(1);
}

const { data: a, error } = await supa
  .from("analyses")
  .select("id, file_name, created_at, review_status, review_differe_le, conclusion_ia")
  .eq("id", ID)
  .single();
if (error) { console.error("analyse introuvable :", error.message); process.exit(1); }

const c = (() => { try { return JSON.parse(a.conclusion_ia ?? "{}"); } catch { return {}; } })();
const montant = Number(c.surcout_global?.max ?? 0) || 0;

console.log(`\n══ ${a.file_name} ══`);
console.log(`   review_status : ${a.review_status}${a.review_differe_le ? " (différée)" : ""}`);
console.log(`   verdict       : ${c.verdict_global ?? "-"} · écart ${eur(montant)}`);

if (a.review_status === "pending_review" && !a.review_differe_le) {
  console.log(`\n   déjà dans la file — rien à faire.`);
  process.exit(0);
}

if (montant > 0) {
  console.log(`\n   ⚠️ CE QUE ÇA CHANGE POUR LE CLIENT : les ${eur(montant)} d'écart`);
  console.log(`      DISPARAISSENT de sa page tant qu'un humain n'a pas tranché (règle du`);
  console.log(`      30/08), et le bandeau « verdict provisoire, sous 24 h ouvrées » s'affiche.`);
}

if (!APPLIQUER) {
  console.log(`\n   (à blanc — relancer avec --appliquer)`);
  process.exit(0);
}

const { error: eMaj } = await supa
  .from("analyses")
  .update({ review_status: "pending_review", review_differe_le: null })
  .eq("id", ID);
if (eMaj) { console.error("mise à jour :", eMaj.message); process.exit(1); }

// ── TÉMOIN — relire en base, et vérifier que la file la voit VRAIMENT ────────
// Un UPDATE accepté ne prouve pas que la VUE de l'écran la renvoie : elle a son
// propre filtre (`review_differe_le is null`), ajouté le 17/09.
const { data: relu } = await supa
  .from("analyses").select("review_status, review_differe_le").eq("id", ID).single();
const { data: vue } = await supa
  .from("admin_pending_reviews").select("id, entreprise_nom, file_name").eq("id", ID);

console.log(`\n══ VÉRIFIÉ EN BASE ══`);
console.log(`   review_status : ${relu?.review_status} · différée : ${relu?.review_differe_le ?? "non"}`);
if (!vue?.length) {
  console.log(`   ✗ ELLE N'APPARAÎT PAS dans la vue de l'écran — ne pas s'y fier.`);
  process.exit(1);
}
console.log(`   ✓ visible dans /admin/reviews sous « ${vue[0].entreprise_nom ?? vue[0].file_name} »`);

const { count } = await supa
  .from("analyses").select("id", { count: "exact", head: true })
  .eq("review_status", "pending_review").is("review_differe_le", null);
console.log(`   la file compte désormais ${count} analyse(s)`);
