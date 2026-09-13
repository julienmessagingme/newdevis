// ============================================================
// Tests — estNumeroSirenValide
// Lancer : npx tsx supabase/functions/analyze-quote/siren-luhn.test.ts
// (harness standalone, même pattern que incomplete-quote.test.ts)
//
// 🔴 LE TÉMOIN D'ABORD. Une clé de contrôle qui recale des numéros VALIDES
// ferait passer des entreprises réelles pour introuvables — exactement
// l'inverse du but. Les huit premiers cas sont des SIRET dont on a vérifié dans
// le registre, le 2026-09-13, qu'ils désignent une entreprise existante.
// ============================================================

import { estNumeroSirenValide, sirenParTroncature } from "./siren-luhn.ts";

let passed = 0;
let failed = 0;
function check(nom: string, actual: boolean, expected: boolean) {
  if (actual === expected) { passed++; console.log(`  ✓ ${nom}`); }
  else { failed++; console.error(`  ✗ ${nom} — attendu ${expected}, obtenu ${actual}`); }
}

console.log("── estNumeroSirenValide ──");

// ── TÉMOINS : numéros confirmés dans le registre ───────────────────────────
for (const [n, qui] of [
  ["33240264300024", "TECHNIFEU (devis KRAUSZ)"],
  ["332402643", "TECHNIFEU — son SIREN"],
  ["48179727200012", "IOD g.t.s"],
  ["84256906300014", "NACCACHE BÂTIMENT"],
  ["89314684500027", "GUS MULTISERVICES"],
  ["82996906200043", "AS COUVERTURE RÉNOVATION"],
  ["91898067300019", "TIAGO DA SILVA MOREIRA EI"],
  ["55208131766522", "SNCF (SIRET public)"],
] as const) {
  check(`témoin — ${qui}`, estNumeroSirenValide(n), true);
}

// La Poste : la seule exception connue à Luhn dans le répertoire.
check("La Poste (356000000) — exception documentée", estNumeroSirenValide("356000000"), true);

// ── Numéros qu'on n'a pas su lire ──────────────────────────────────────────
check("« Entreprise Fk » 80671375900019 — clé fausse", estNumeroSirenValide("80671375900019"), false);
check("son SIREN 806713759 — clé fausse aussi", estNumeroSirenValide("806713759"), false);
check("que des zéros (placeholder d'OCR)", estNumeroSirenValide("00000000000000"), false);
check("10 chiffres (Kbane, cas réel)", estNumeroSirenValide("0650163267"), false);
check("11 chiffres (AMENATECH, cas réel)", estNumeroSirenValide("76990820748"), false);
check("12 chiffres (Primabat360, cas réel)", estNumeroSirenValide("980220800013"), false);
check("vide", estNumeroSirenValide(""), false);
check("null", estNumeroSirenValide(null), false);
check("lettres", estNumeroSirenValide("SIRET inconnu"), false);

// ── Mise en forme : les séparateurs ne changent rien ───────────────────────
check("espaces conservés → même verdict", estNumeroSirenValide("332 402 643 00024"), true);
check("SIREN espacé", estNumeroSirenValide("332 402 643"), true);

// ══════════════════════════════════════════════════════════════════════════
// sirenParTroncature — récupérer un SIREN dans un numéro de longueur inattendue
// ══════════════════════════════════════════════════════════════════════════
console.log("\n── sirenParTroncature ──");

function eq(nom: string, actual: string | null, expected: string | null) {
  if (actual === expected) { passed++; console.log(`  ✓ ${nom}`); }
  else { failed++; console.error(`  ✗ ${nom} — attendu ${expected}, obtenu ${actual}`); }
}

// ── Le cas réel que la règle récupère ──────────────────────────────────────
eq("HDH batiment — 12 chiffres, clé OK", sirenParTroncature("851828566014"), "851828566");

// ── Ceux qu'elle doit écarter, et qui existent dans le stock ───────────────
eq("AMENATECH — 11 chiffres, clé KO", sirenParTroncature("76990820748"), null);
eq("Kbane — 10 chiffres, clé KO", sirenParTroncature("0650163267"), null);

// ── Le rattrapage historique des 13 chiffres passe par la même porte ───────
// Les 5 numéros de 13 chiffres du stock passent tous la clé : le contrôle
// ajouté ne retire rien, il ferme un trou.
eq("13 chiffres (zéro manquant dans le NIC) — OUALID MERZOUGUI", sirenParTroncature("8312285800021"), "831228580");
eq("13 chiffres — RENOV'FENETRES", sirenParTroncature("4540712000066"), "454071200");
eq("13 chiffres — CHRISTOPHE ROUSSEAU", sirenParTroncature("7917336600033"), "791733660");

// ── Ce que la fonction ne doit JAMAIS faire ────────────────────────────────
// ⚠️ Un numéro de 9 chiffres n'est pas tronqué : l'utiliser tel quel n'est pas
// une inférence, et le soumettre à la clé changerait le sort des 18 devis du
// stock qui en portent un — sans l'avoir mesuré.
eq("9 chiffres → hors périmètre, rendu à l'appelant", sirenParTroncature("332402643"), null);
eq("moins de 9 chiffres → rien", sirenParTroncature("80671"), null);
eq("que des zéros → rien", sirenParTroncature("000000000000"), null);
eq("vide → rien", sirenParTroncature(""), null);
eq("null → rien", sirenParTroncature(null), null);
// Un SIRET de 14 chiffres passe par `extractSiren` en amont ; si on l'envoie
// quand même ici, la troncature reste correcte.
eq("14 chiffres (TECHNIFEU) → son SIREN", sirenParTroncature("33240264300024"), "332402643");
eq("séparateurs ignorés", sirenParTroncature("851 828 566 014"), "851828566");

console.log(`\n${passed} passés, ${failed} échoués`);
if (failed > 0) process.exit(1);
