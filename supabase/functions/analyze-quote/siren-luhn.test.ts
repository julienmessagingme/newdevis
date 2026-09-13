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

import { estNumeroSirenValide } from "./siren-luhn.ts";

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

console.log(`\n${passed} passés, ${failed} échoués`);
if (failed > 0) process.exit(1);
