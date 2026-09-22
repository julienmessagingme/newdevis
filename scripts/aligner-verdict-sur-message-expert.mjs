/**
 * scripts/aligner-verdict-sur-message-expert.mjs
 *
 * 🔴 CAUSE 2 DU DÉFAUT ALES — RÉPARATION DU STOCK (2026-09-23).
 *
 * La garde livrée le même jour dans `decide.ts` empêche toute NOUVELLE
 * incohérence : un expert qui écrit « ne signez pas » sans passer le verdict à
 * « ne pas signer » se voit refuser la décision. Restent les conclusions déjà
 * écrites, qui affichent aujourd'hui un titre contredisant leur propre encadré.
 *
 * ── CE QUE L'UTILISATEUR VERRA CHANGER ──────────────────────────────────────
 *
 * Le titre passe de « Environ X € à discuter » / « Un point à sécuriser » à
 * **« Ne signez pas en l'état. »**, et la carte passe en rouge. C'est PLUS
 * SÉVÈRE — et c'est exactement ce que l'expert a écrit noir sur blanc. Laisser
 * la page proposer de négocier ce qu'un humain a refusé serait le mensonge.
 *
 * ⚠️ CES CONCLUSIONS SONT `corrected`, ET LE FILET DU 04/09 INTERDIT DE LES
 * ÉCRASER. On ne l'enfreint pas : on n'écrit AUCUN texte, aucun montant,
 * aucune anomalie. On aligne les trois champs de verdict sur la décision que
 * l'expert a exprimée dans son message — c'est restituer son intention, pas la
 * contredire. Toute autre clé est laissée intacte, et le contrôle le vérifie.
 *
 * ⚠️ LA DÉTECTION EST IMPORTÉE (`refusExplicite`), jamais recopiée : le script
 * et la garde doivent dire la même chose, sinon ils divergeront au premier
 * ajustement et on ne saura plus lequel croire.
 *
 * Usage :
 *   node scripts/aligner-verdict-sur-message-expert.mjs              (à blanc)
 *   node scripts/aligner-verdict-sur-message-expert.mjs --appliquer
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { messageRefuseExplicitement } from "../src/lib/analyse/refusExplicite.ts";

const APPLIQUER = process.argv.includes("--appliquer");

const env = {};
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await sb
  .from("analyses")
  .select("id, file_name, conclusion_ia, review_status")
  .not("conclusion_ia", "is", null)
  .order("created_at", { ascending: false })
  .limit(1500);
if (error) {
  console.error("Lecture impossible :", error.message);
  process.exit(1);
}

const candidats = [];
for (const a of data ?? []) {
  let c;
  try {
    c = JSON.parse(a.conclusion_ia);
  } catch {
    continue;
  }
  const message = typeof c?.expert_message === "string" ? c.expert_message : "";
  if (!message.trim()) continue;
  if (c.verdict_decisionnel === "ne_pas_signer") continue;
  if (!messageRefuseExplicitement(message)) continue;
  candidats.push({ a, c, message });
}

console.log(`${APPLIQUER ? "APPLICATION" : "À BLANC"} — ${candidats.length} conclusion(s) à aligner\n`);

for (const { a, c, message } of candidats) {
  const phrase = message.replace(/\s+/g, " ").match(/[^.]*\b(ne pas signer|ne signez pas|ne pas donner suite|pas signer)\b[^.]*\./i);
  console.log(`■ ${a.file_name.slice(0, 44)} · ${a.id.slice(0, 8)} · ${a.review_status}`);
  console.log(`   verdict_decisionnel : ${c.verdict_decisionnel} → ne_pas_signer`);
  console.log(`   verdict_global      : ${c.verdict_global} → a_risque`);
  console.log(`   l'expert écrit      : « ${(phrase?.[0] ?? "").trim().slice(0, 150)} »`);

  if (!APPLIQUER) {
    console.log("");
    continue;
  }

  // Chirurgie minimale : trois champs, rien d'autre.
  const avant = JSON.parse(a.conclusion_ia);
  const apres = JSON.parse(a.conclusion_ia);
  apres.verdict_decisionnel = "ne_pas_signer";
  apres.verdict_global = "a_risque";
  if (apres.verdict_ligne) apres.verdict_ligne.decision = "ne_pas_signer";

  const { error: err } = await sb
    .from("analyses")
    .update({ conclusion_ia: JSON.stringify(apres) })
    .eq("id", a.id);
  if (err) {
    console.error(`   ✗ écriture refusée : ${err.message}\n`);
    continue;
  }

  // ⚠️ ON RELIT : une réponse sans erreur ne prouve pas que la ligne a été
  // écrite (règle du 15/09). Et on vérifie qu'AUCUNE autre clé n'a bougé.
  const { data: relu } = await sb.from("analyses").select("conclusion_ia, review_status").eq("id", a.id).single();
  const verif = JSON.parse(relu.conclusion_ia);
  const inchangees = Object.keys(avant).filter(
    (k) => !["verdict_decisionnel", "verdict_global", "verdict_ligne"].includes(k),
  );
  const abimees = inchangees.filter((k) => JSON.stringify(avant[k]) !== JSON.stringify(verif[k]));
  const ok =
    verif.verdict_decisionnel === "ne_pas_signer" &&
    verif.verdict_global === "a_risque" &&
    abimees.length === 0 &&
    relu.review_status === a.review_status;
  console.log(
    ok
      ? `   ✓ aligné · ${inchangees.length} autres clés intactes · statut conservé\n`
      : `   ✗ CONTRÔLE ÉCHOUÉ — clés modifiées : ${abimees.join(", ") || "(aucune)"}\n`,
  );
}

if (!APPLIQUER && candidats.length > 0) {
  console.log("Relancer avec --appliquer pour écrire.");
}
