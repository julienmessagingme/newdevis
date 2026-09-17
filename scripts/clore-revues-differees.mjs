/**
 * scripts/clore-revues-differees.mjs
 *
 * Passer en `auto_approved` les analyses DIFFÉRÉES le 17/09 (décision Johan).
 *
 * 🔴 CE N'EST PAS UN RANGEMENT INTERNE — C'EST LE SEUL POINT À COMPRENDRE.
 * `review_status` gouverne CE QUE VOIT L'UTILISATEUR :
 *   · `pending_review` → bandeau bleu « verdict provisoire, confirmé ou ajusté
 *     sous 24 h ouvrées » ET **montant de l'écart MASQUÉ** (règle du 30/08) ;
 *   · `auto_approved`  → la page dit ce que le moteur a calculé, **montant
 *     compris**, sans promesse de relecture.
 * Basculer, c'est donc **RÉVÉLER un chiffre** sur les pages qui en portent un,
 * et **RETIRER une promesse** sur toutes. Les deux vont dans le même sens et
 * c'est ce qui rend la décision défendable : ces devis datent d'avril à
 * juillet, la promesse « sous 24 h ouvrées » est fausse depuis quatre mois.
 * Laisser le bandeau serait mentir ; le retirer est la seule option honnête
 * tant qu'on ne les instruit pas.
 *
 * ⚠️ AUCUN E-MAIL N'EST ENVOYÉ. Les notifications partent de `persistConclusion`
 * (à la génération) et de la route `decide` (à la décision) — jamais d'un UPDATE
 * de statut en base. Vérifié sur les deux chemins avant d'écrire ce script.
 *
 * ⚠️ ON NE TOUCHE NI À `conclusion_ia`, NI À `analysis_corrections`. Le contenu
 * des analyses ne bouge pas d'un caractère : seul le statut change. Une
 * conclusion écrite ou corrigée par un humain reste intouchable (filet du 04/09).
 *
 * ⚠️ `review_differe_le` EST CONSERVÉ. C'est un fait historique daté — « nous
 * avons écarté cette analyse de la file le 17/09 » — et il reste vrai après la
 * bascule. L'effacer supprimerait la trace de la décision qu'on est en train de
 * prendre.
 *
 * Usage :
 *   npx tsx scripts/clore-revues-differees.mjs              # mesure, n'écrit rien
 *   npx tsx scripts/clore-revues-differees.mjs --appliquer
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const APPLIQUER = process.argv.includes("--appliquer");
const eur = (n) => `${Math.round(n || 0).toLocaleString("fr-FR")} €`;

/**
 * Plancher d'affichage du produit : sous 300 €, aucun montant ne sort
 * (`surcout.max >= 300`, règle reprise partout depuis le 15/09). Une analyse
 * sous ce seuil ne RÉVÈLE donc rien en basculant — elle perd seulement sa
 * promesse de relecture. La distinction change le nombre de pages réellement
 * touchées, elle n'est pas cosmétique.
 */
const PLANCHER_AFFICHAGE = 300;

const { data: lignes, error } = await supa
  .from("analyses")
  .select("id, file_name, created_at, review_status, review_differe_le, conclusion_ia")
  .eq("review_status", "pending_review")
  .not("review_differe_le", "is", null)
  .order("created_at", { ascending: true });

if (error) {
  console.error("lecture impossible :", error.message);
  process.exit(1);
}

if (!lignes.length) {
  console.log("\nAucune analyse différée en attente — rien à faire.\n");
  process.exit(0);
}

const analysees = lignes.map((a) => {
  let c = {};
  try {
    c = JSON.parse(a.conclusion_ia ?? "{}");
  } catch {
    c = {};
  }
  const montant = Number(c.surcout_global?.max ?? 0) || 0;
  return {
    ...a,
    verdict: c.verdict_global ?? "(inconnu)",
    montant,
    revele: montant >= PLANCHER_AFFICHAGE,
  };
});

const reveles = analysees.filter((a) => a.revele);
const rouges = analysees.filter((a) => a.verdict === "a_risque");
const totalRevele = reveles.reduce((n, a) => n + a.montant, 0);

const parMois = new Map();
for (const a of analysees) {
  const k = String(a.created_at).slice(0, 7);
  parMois.set(k, (parMois.get(k) ?? 0) + 1);
}

console.log(`\n═══ ANALYSES DIFFÉRÉES → auto_approved ═══\n`);
console.log(`   ${analysees.length} analyses concernées`);
console.log(
  `   dépôts : ${[...parMois.entries()].sort().map(([m, n]) => `${m} ${n}`).join(" · ")}`,
);
console.log(`\n   ┌ CE QUE ÇA CHANGE SUR LA PAGE DU CLIENT`);
console.log(
  `   │ ${reveles.length} analyses affichent un montant qui était masqué — ${eur(totalRevele)} au total`,
);
console.log(
  `   │ ${analysees.length - reveles.length} n'affichent aucun montant (écart sous le plancher de ${PLANCHER_AFFICHAGE} €)`,
);
console.log(`   │ ${analysees.length} perdent le bandeau « verdict confirmé sous 24 h ouvrées »`);
if (rouges.length) {
  console.log(
    `   │ ⚠️ ${rouges.length} portent un verdict « à risque » — il s'affichera SANS mention de relecture`,
  );
}
console.log(`   └\n`);

if (reveles.length) {
  console.log(`   Les 10 montants les plus lourds révélés :`);
  for (const a of [...reveles].sort((x, y) => y.montant - x.montant).slice(0, 10)) {
    console.log(
      `     ${eur(a.montant).padStart(12)} · ${String(a.created_at).slice(0, 10)} · ${a.verdict.padEnd(15)} · ${a.file_name}`,
    );
  }
  console.log();
}

if (!APPLIQUER) {
  console.log(`   (à blanc — relancer avec --appliquer pour écrire)\n`);
  process.exit(0);
}

const ids = analysees.map((a) => a.id);
const { error: majErr } = await supa
  .from("analyses")
  .update({ review_status: "auto_approved" })
  .in("id", ids);

if (majErr) {
  console.error("écriture refusée :", majErr.message);
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════
// TÉMOIN — on relit la base, on ne croit pas la réponse de l'UPDATE.
// Un `update` accepté ne prouve pas que les lignes visées ont changé : une
// policy, un filtre trop large ou un id erroné passent sans erreur.
// ═══════════════════════════════════════════════════════════════════════════
const { data: apres } = await supa
  .from("analyses")
  .select("id, review_status, conclusion_ia")
  .in("id", ids);

const restant = (apres ?? []).filter((a) => a.review_status !== "auto_approved");
const conclusionsIntactes = (apres ?? []).filter((a, i) => {
  const avant = analysees.find((x) => x.id === a.id);
  return avant && a.conclusion_ia === lignes.find((l) => l.id === a.id)?.conclusion_ia;
});

console.log(`   ✅ ${(apres ?? []).length - restant.length}/${ids.length} passées en auto_approved`);
console.log(
  `   ✅ ${conclusionsIntactes.length}/${ids.length} conclusions INCHANGÉES (on ne touche qu'au statut)`,
);

if (restant.length) {
  console.error(`\n   🔴 TÉMOIN CASSÉ : ${restant.length} analyses n'ont pas basculé`);
  process.exit(1);
}
if (conclusionsIntactes.length !== ids.length) {
  console.error(`\n   🔴 TÉMOIN CASSÉ : une conclusion a changé — ce script ne doit RIEN réécrire`);
  process.exit(1);
}

// La file ne doit pas bouger : ces analyses en étaient déjà écartées.
const { count: fileApres } = await supa
  .from("analyses")
  .select("id", { count: "exact", head: true })
  .eq("review_status", "pending_review")
  .is("review_differe_le", null);

console.log(`   ✅ file de revue : ${fileApres} analyses (inchangée — elles en étaient déjà sorties)\n`);
