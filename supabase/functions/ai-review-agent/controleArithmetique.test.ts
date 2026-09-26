/**
 * Anti-régression du contrôle arithmétique du relecteur IA.
 *
 * 🔴 LE CAS 1 EST LE DEVIS RÉEL QUI A MOTIVÉ LA GARDE (« noreco peinture2 »,
 * 25/09) : 312 m² × 40 €/m² = 12 480 €, HT 11 345,45, TVA 10 % 1 134,55. Le
 * relecteur y a vu une « erreur de calcul critique » et a proposé d'annoncer au
 * client un total de 13 728 € TTC — 1 248 € de plus que le devis.
 *
 * ⚠️ TÉMOIN INVERSE OBLIGATOIRE (cas 5) : un VRAI écart doit rester signalable.
 * Sans lui, « ne jamais accuser » passerait le test principal, et on aurait
 * troqué un faux positif contre un aveuglement.
 *
 * Lancé par `.github/workflows/tests.yml` avec les autres fichiers d'edge
 * function — `vitest.config.ts` n'inclut que `src/**`.
 */
import { controleArithmetique } from "./prompt.ts";

let ok = 0;
let ko = 0;
function check(nom: string, condition: boolean, detail = ""): void {
  if (condition) { ok++; console.log("  ✓ " + nom); }
  else { ko++; console.log("  ✗ " + nom + (detail ? "  → " + detail : "")); }
}

console.log("\n── Contrôle arithmétique du relecteur ──\n");

// 1. LE CAS RÉEL : lignes en TTC, TVA 10 % (rénovation).
{
  const travaux = [
    { montant: 2200, quantite: 55, unite: "m²" }, { montant: 1720, quantite: 43, unite: "m²" },
    { montant: 1440, quantite: 36, unite: "m²" }, { montant: 2800, quantite: 70, unite: "m²" },
    { montant: 1760, quantite: 44, unite: "m²" }, { montant: 880, quantite: 22, unite: "m²" },
    { montant: 1080, quantite: 27, unite: "m²" }, { montant: 280, quantite: 7, unite: "m²" },
    { montant: 320, quantite: 8, unite: "m²" },
  ];
  const r = controleArithmetique(travaux, { ht: 11345.45, tva: 1134.55, ttc: 12480, taux_tva: 10 });
  check("noreco peinture2 — lignes reconnues TTC", r.verdict === "lignes_en_ttc", r.verdict);
  check("  taux déduit = 10 %", r.tauxDeduitPct === 10, String(r.tauxDeduitPct));
  check("  la phrase INTERDIT d'annoncer une erreur", /n'annonce aucune erreur de calcul/i.test(r.phrase));
  check("  la phrase prévient du piège HT/TTC sur les prix unitaires", /divise-les par/i.test(r.phrase));
}

// 2. Cas normal : les lignes SONT le HT.
{
  const r = controleArithmetique([{ montant: 6000 }, { montant: 4000 }], { ht: 10000, tva: 2000, ttc: 12000 });
  check("lignes = HT → cohérent", r.verdict === "coherent", r.verdict);
  check("  interdit aussi d'annoncer une erreur", /n'annonce aucune erreur de calcul/i.test(r.phrase));
}

// 3. Franchise en base (art. 293 B) : HT = TTC, aucune TVA.
{
  const r = controleArithmetique([{ montant: 24105 }], { ht: 24105, tva: 0, ttc: 24105 });
  check("auto-entrepreneur en franchise → cohérent", r.verdict === "coherent", r.verdict);
}

// 4. Rénovation énergétique à 5,5 %.
{
  const r = controleArithmetique([{ montant: 10550 }], { ht: 10000, tva: 550, ttc: 10550 });
  check("TVA 5,5 % reconnue", r.verdict === "lignes_en_ttc" && r.tauxDeduitPct === 5.5, r.verdict + "/" + r.tauxDeduitPct);
}

// 5. 🔴 TÉMOIN INVERSE — un VRAI écart doit rester signalable.
//
// ⚠️ L'ASSERTION A CHANGÉ LE 2026-09-26, PAS L'INTENTION. La première version
// exigeait « tu PEUX signaler » — une permission inconditionnelle. Mesuré sur
// 410 documents : 85 des 345 testables tombent dans ce seau, avec un ratio Σ/HT
// à Q1 0,91 / médiane 1,03 / Q3 1,14 — donc dominé par NOTRE extraction (lignes
// ratées, sous-totaux comptés deux fois), pas par des devis faux. La permission
// invitait à présenter notre défaut de lecture comme une incohérence du devis.
//
// Le chemin de signalement EXISTE toujours — c'est ce que ce témoin protège —
// mais il passe par une vérification dans le PDF, que seul le relecteur peut
// faire. Sans ce témoin, « ne jamais rien dire » passerait le test principal.
{
  const r = controleArithmetique([{ montant: 8000 }, { montant: 1000 }], { ht: 10000, tva: 1000, ttc: 11000 });
  check("écart réel → signalable", r.verdict === "ecart_reel", r.verdict);
  check("  un chemin de signalement subsiste", /tu ne peux signaler ce point QUE si/i.test(r.phrase));
  check("  conditionné à un recomptage DANS le PDF", /recompté toi-même les lignes DANS LE PDF/i.test(r.phrase));
  check("  et la cause la plus fréquente est nommée", /notre extraction, pas le devis/i.test(r.phrase));
  check("  mais interdit d'affirmer un total de remplacement", /plutôt que d'affirmer un total/i.test(r.phrase));
  check("  et interdit d'accuser sur la seule somme", /n'annonce AUCUNE erreur de calcul sur cette seule base/i.test(r.phrase));
}

// 6. Données absentes : on ne se prononce pas — et on le DIT.
{
  const r = controleArithmetique([], { ht: 0 });
  check("sans données → non testable", r.verdict === "non_testable", r.verdict);
  check("  et le silence est explicite", /n'annonce aucune erreur de calcul/i.test(r.phrase));
}

// 7. Le bruit d'arrondi ne doit pas fabriquer un écart.
{
  const r = controleArithmetique([{ montant: 10000.01 }], { ht: 10000 });
  check("1 centime d'écart → cohérent", r.verdict === "coherent", r.verdict);
}

// 8. ⚠️ Un écart de 1 % N'EST PAS un arrondi : il doit ressortir.
{
  const r = controleArithmetique([{ montant: 10100 }], { ht: 10000 });
  check("1 % d'écart → écart réel", r.verdict === "ecart_reel", r.verdict);
}

console.log(`\n${ko === 0 ? "✓" : "✗"} ${ok} réussis, ${ko} échoués\n`);
if (ko > 0) throw new Error(`${ko} test(s) en échec`);
