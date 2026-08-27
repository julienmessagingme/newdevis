// Tests détection pays — extension hors-Europe 2026-08-27
// Lancer : npx tsx supabase/functions/analyze-quote/country.test.ts

import { detectQuoteCountry } from "./country.ts";

let passed = 0, failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  if (actual === expected) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} — attendu ${expected}, obtenu ${actual}`); }
}

// ── Cameroun (cas mining 2026-08-27 : montants FCFA lus comme des euros) ────
const cameroun = detectQuoteCountry({
  entreprise: { nom: "ETS BTP PLUS", adresse: "Quartier Nsam, Yaoundé" },
  totaux: { ht: 4585816, taux_tva: 19.25 },
  travaux: [
    { description: "Ciment DANGOTE 32.5R-50KG" },
    { description: "Sable Sanaga (Camion 20 tonnes)" },
  ],
});
check("Cameroun (ville Yaoundé) → étranger", cameroun.is_foreign, true);
check("Cameroun → code CM", cameroun.country_code, "CM");

// ── FCFA dans les lignes SEULEMENT (pas d'adresse) → signal devise fort ─────
const fcfa = detectQuoteCountry({
  entreprise: { nom: "SARL Construction", adresse: "BP 1234" },
  totaux: { ht: 2500000 },
  travaux: [{ description: "Fourniture gravier — prix en FCFA" }],
});
check("FCFA dans les lignes → étranger", fcfa.is_foreign, true);

// ── Maroc (dirhams) ─────────────────────────────────────────────────────────
const maroc = detectQuoteCountry({
  entreprise: { nom: "Atlas Travaux", adresse: "Bd Zerktouni, Casablanca" },
  totaux: { ht: 45000 },
  travaux: [{ description: "Peinture façade — 12 000 dirhams" }],
});
check("Maroc → étranger", maroc.is_foreign, true);
check("Maroc → code MA", maroc.country_code, "MA");

// ── DOM-TOM = FRANCE (garde anti-régression cas ZANNOU/La Réunion) ─────────
const reunion = detectQuoteCountry({
  entreprise: { nom: "AUSTRAL RÉNOV' AVENIR", siret: "83488168200027", adresse: "14 rue de la Guadeloupe, 97490 SAINTE-CLOTILDE" },
  totaux: { ht: 14430.67, taux_tva: 2.1 },
  travaux: [{ description: "Pose faience murale" }],
});
check("La Réunion (TVA 2,1%) → reste FRANCE", reunion.is_foreign, false);
check("La Réunion → code FR", reunion.country_code, "FR");

// ── France métropole classique ──────────────────────────────────────────────
const fr = detectQuoteCountry({
  entreprise: { nom: "SAS Renov'Toitures", siret: "41155683000023", adresse: "50 route de Guebwiller, BERGHOLTZ 68500" },
  totaux: { ht: 6830.04, taux_tva: 10 },
  travaux: [{ description: "Fourniture et pose de gouttières en zinc" }],
});
check("France métropole → FR", fr.is_foreign, false);

// ── Belgique (anti-régression V3.4.14) ──────────────────────────────────────
const belgique = detectQuoteCountry({
  entreprise: { nom: "Casafit", iban: "BE86 0000 0000 0000", adresse: "Bruxelles" },
  totaux: { ht: 12000, taux_tva: 6 },
  travaux: [],
});
check("Belgique (IBAN BE) → étranger BE", belgique.country_code, "BE");

console.log(`\n${passed} passés, ${failed} échoués`);
if (failed > 0) process.exit(1);
