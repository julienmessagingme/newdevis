/**
 * scripts/banc-couverture-chiffrable.mjs
 *
 * 🔴 2026-09-16 (devis DESMARIS ÉNERGIES, retour Johan) — UNE COUVERTURE NE PEUT
 * PAS COMPTER UN POSTE QUE LE MOTEUR REFUSE DE CHIFFRER.
 *
 * Le devis : une seule ligne, « Remplacement d'une sortie cheminée », 2 395 € HT,
 * facturée « 1 Ens ». Le rapprochement sort en confiance HAUTE (0,794) sur
 * `tubage_conduit_cheminee` — la couverture affichait donc **100 %**. Mais
 * l'entrée est tarifée au **ml** et la ligne est un **forfait** :
 * `motifNonChiffrable` rend `forfait`, `computeServerSurcout` l'écarte, le
 * surcoût tombe à zéro, le verdict passe en « signer ».
 *
 * À l'écran : **« Ce devis nous paraît cohérent — prix dans les fourchettes du
 * marché »** juste au-dessus d'une carte **« Anomalie marché · 2 395 € contre
 * 280-1 080 € »**. Le même poste, intégralement couvert ET impossible à chiffrer.
 *
 * ⚠️ Et la fourchette elle-même ne voulait rien dire : 80 €/ml × « 1 Ens » + 200 €
 * de forfait = 280 ; 280 €/ml × 1 + 800 = 1 080. On multiplie un prix au mètre
 * par « un ensemble », puis on y ajoute le forfait.
 *
 * C'est le MÊME invariant que le 04/09 et le 16/09 — la page affirme ce que le
 * moteur ne sait pas — mais par une TROISIÈME porte : ni le texte de Gemini, ni
 * le résumé déterministe, la COUVERTURE elle-même. `phraseIntroSansReference`
 * ne pouvait rien y faire : il ne se déclenche que quand la couverture est basse.
 *
 * Ce banc mesure ce que le correctif change, DANS LES CONDITIONS RÉELLES DE
 * LIVRAISON : `motifNonChiffrable(groupe, null)`, parce que `totalHT` n'existe
 * pas encore à cet endroit du flux (zone morte temporelle).
 *
 * Usage : npx tsx scripts/banc-couverture-chiffrable.mjs
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { motifNonChiffrable } from "../src/lib/analyse/surcoutServeur.ts";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const COUVERTURE_MIN = 5;   // COUVERTURE_MIN_POUR_AFFIRMER_PCT
/** Ce qui compte comme « la page affirme que le prix est bon ». */
const AFFIRME = /coh[ée]rent|dans la norme|fourchettes du march[ée]|dans les usages/i;

const { data, error } = await supa
  .from("analyses")
  .select("user_id,file_name,created_at,review_status,raw_text,conclusion_ia")
  .eq("status", "completed").not("conclusion_ia", "is", null)
  .order("created_at", { ascending: false });
if (error) throw new Error(error.message);

const vus = new Set();
let mesurables = 0, bascule = 0, affirmaient = 0, montantPerdu = 0;
let couvertureBaisse = 0;
const cas = [];
let temoinEcart = 0;

for (const a of data ?? []) {
  const cle = `${a.user_id}|${a.file_name}`;
  if (vus.has(cle)) continue;
  vus.add(cle);

  let r = {}, c = {};
  try { r = JSON.parse(a.raw_text || "{}"); } catch { /* rapprochement absent */ }
  try { c = JSON.parse(a.conclusion_ia); } catch { continue; }

  const groupes = Array.isArray(r.n8n_price_data) ? r.n8n_price_data : [];
  if (!groupes.some((g) => g?.vectorial)) continue;      // V3.6 legacy : non mesurable

  let total = 0, avant = 0, apres = 0, temoin = 0;
  for (const g of groupes) {
    const t = Number(g?.devis_total_ht ?? 0) || 0;
    total += t;
    const confianceOk = !g?.vectorial || g.vectorial.confidence === "high";
    if (!confianceOk) continue;
    avant += t;                                          // règle ACTUELLE
    temoin += t;                                         // témoin : règle NEUTRE
    if (!motifNonChiffrable(g, null)) apres += t;        // règle CORRIGÉE
  }
  if (total <= 0) continue;
  mesurables++;

  // 🔴 TÉMOIN — une règle NEUTRE (qui n'écarte jamais rien) doit rendre
  // exactement la couverture actuelle. Sans ce contrôle, un banc faux ferait
  // passer n'importe quoi pour un progrès (leçon des 15/09 et 16/09).
  if (Math.abs(temoin - avant) > 0.01) temoinEcart++;

  const covA = (avant / total) * 100;
  const covC = (apres / total) * 100;
  if (covC < covA - 0.01) couvertureBaisse++;

  // 🔴 MON PREMIER INDICATEUR S'APPELAIT « MONTANT PERDU » ET NE MESURAIT PAS ÇA.
  // Il comptait « couverture qui baisse ET surcoût > 0 » → 21, alors que le
  // texte du rapport annonçait « doit être 0 ». Deux chiffres qui se
  // contredisent dans le même rapport : faux avant d'être intéressant.
  // Aucun euro ne peut disparaître — `comparableHT` alimente la COUVERTURE,
  // jamais `computeServerSurcout`.
  //
  // Le vrai risque est ailleurs, et il faut le nommer : une analyse qui bascule
  // en « nous ne pouvons pas nous prononcer » TOUT EN affichant encore un
  // montant. Ce n'est pas nécessairement une contradiction — le produit sait
  // dire « à une ligne près » depuis le 2026-09-10 (`aucuneReferenceDuTout`) —
  // mais c'est la population à relire.
  const surcout = Number(c.surcout_global?.max ?? 0) || 0;

  if (covA >= COUVERTURE_MIN && covC < COUVERTURE_MIN) {
    bascule++;
    const texte = `${c.verdict_ligne?.resume ?? ""} ${c.phrase_intro ?? ""}`;
    const affirme = AFFIRME.test(texte);
    if (affirme) affirmaient++;
    if (surcout > 0) montantPerdu++;
    cas.push({
      f: a.file_name, d: a.created_at?.slice(0, 10), rev: a.review_status,
      covA, covC, v: c.verdict_global, surcout, affirme,
      resume: String(c.verdict_ligne?.resume ?? "").slice(0, 92),
    });
  }
}

console.log(`\n══ TÉMOIN — une règle neutre ne doit rien déplacer ══`);
console.log(`   ${temoinEcart === 0 ? "✓" : "✗"} ${temoinEcart} écart(s) sur ${mesurables} analyses`);
if (temoinEcart !== 0) process.exit(1);

console.log(`\n══ ${mesurables} analyses mesurables ══`);
console.log(`   ${couvertureBaisse} voient leur couverture BAISSER (le poste avait une référence, pas une référence opposable)`);
console.log(`\n🔴 ${bascule} passent sous le seuil de ${COUVERTURE_MIN} % → « nous ne pouvons pas nous prononcer »`);
console.log(`   dont ${affirmaient} affirment aujourd'hui que le prix est bon`);
console.log(`\n✓  0 euro perdu — la couverture n'alimente pas le chiffrage :`);
console.log(`   ces postes étaient DÉJÀ écartés de \`computeServerSurcout\`.`);
console.log(`   Le correctif ne retire aucun montant, il retire une AFFIRMATION.`);
console.log(`\n⚠️  ${montantPerdu} basculent EN AFFICHANT ENCORE UN MONTANT — à relire :`);
console.log(`   la page dira « à une ligne près » au-dessus d'un écart chiffré.`);
console.log(`   Ce n'est pas forcément faux (le produit sait dire ça depuis le 10/09),`);
console.log(`   mais c'est la population à vérifier à l'écran.\n`);

console.log("── Les analyses qui basculent ──");
for (const x of cas.slice(0, 25)) {
  console.log(`  ${x.affirme ? "🔴" : "  "} ${x.f} — ${x.d} — ${x.covA.toFixed(0)} % → ${x.covC.toFixed(0)} %` +
              ` — ${x.v}${x.rev !== "auto_approved" ? ` (${x.rev})` : ""}`);
  if (x.resume) console.log(`     « ${x.resume}… »`);
}
