// ============================================================
// Tests anti-régression detectIncompleteQuoteShared
// Lancer : npx tsx supabase/functions/analyze-quote/incomplete-quote.test.ts
// (harness standalone, exclu de vitest — même pattern que verdictEngine.test.ts)
// ============================================================

import { detectIncompleteQuoteShared, type IncompleteQuoteLine } from "./incomplete-quote.ts";

// Réplique du set V1 (extract.ts) — suffisant pour les cas testés
const UNITS = new Set([
  "m2", "m²", "m^2", "metre2", "mètre carré",
  "ml", "ml.", "m_lin", "mètre linéaire",
  "kg", "g", "h", "heure", "hr", "m3", "m³", "m^3",
  "l", "litre", "t", "tonne",
  "u", "u.", "pce", "pcs", "p.", "piece", "pièce",
]);

let passed = 0;
let failed = 0;

function check(name: string, actual: boolean, expected: boolean) {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name} — attendu is_incomplete=${expected}, obtenu ${actual}`);
  }
}

function run(lines: IncompleteQuoteLine[]): boolean {
  return detectIncompleteQuoteShared(lines, UNITS).is_incomplete;
}

console.log("── detectIncompleteQuoteShared ──");

// ── Cas ATEX (2026-08-03, faux positif d'origine) ──────────────────────────
// 8 lignes : 6 forfaits "unité" qty=1 (25.7% du montant) + 2 lignes m²
// quantifiées portant 74% du montant HT → PAS de bypass.
const atex: IncompleteQuoteLine[] = [
  { unite: "unité", quantite: 1, montant: 2630 },   // échafaudage
  { unite: "unité", quantite: 1, montant: 180 },    // déplacement
  { unite: "unité", quantite: 1, montant: 675 },    // purge
  { unite: "unité", quantite: 1, montant: 185 },    // dépose descentes
  { unite: "m²", quantite: 80, montant: 11400 },    // bardage Cedral
  { unite: "unité", quantite: 1, montant: 826 },    // descentes PVC
  { unite: "unité", quantite: 1, montant: 120 },    // nettoyage
  { unite: "m²", quantite: 80, montant: 1920 },     // option laine de roche
];
check("ATEX ravalement (74% montant quantifié en m²) → PAS incomplet", run(atex), false);

// ── Cas Créteil (devis bidon résumé par lot, bypass légitime) ──────────────
// 6 sous-totaux corps de métier, aucune unité, montants élevés → bypass.
const creteil: IncompleteQuoteLine[] = [
  { unite: "", quantite: 1, montant: 12000 },
  { unite: null, quantite: null, montant: 8500 },
  { unite: "", quantite: 1, montant: 7600 },
  { unite: "forfait", quantite: 1, montant: 9800 },
  { unite: "", quantite: 1, montant: 6300 },
  { unite: "ens", quantite: 1, montant: 5500 },
];
check("Créteil résumé par lot (0% quantifié) → incomplet", run(creteil), true);

// ── Fallback montants indisponibles (comportement historique préservé) ─────
const sansMontants: IncompleteQuoteLine[] = [
  { unite: "", quantite: 1, montant: null },
  { unite: "", quantite: null, montant: null },
  { unite: "forfait", quantite: 1, montant: 0 },
  { unite: "", quantite: 1, montant: null },
  { unite: "ens", quantite: 1, montant: null },
];
check("Résumé par lot sans montants (fallback comptage lignes) → incomplet", run(sansMontants), true);

// ── V3.5.4 : équipements en "u" = unité physique légitime ──────────────────
const coteMaison: IncompleteQuoteLine[] = [
  { unite: "u", quantite: 1, montant: 382 },
  { unite: "u", quantite: 1, montant: 495 },
  { unite: "u", quantite: 1, montant: 498 },
  { unite: "u", quantite: 2, montant: 240 },
  { unite: "m²", quantite: 12, montant: 900 },
  { unite: "forfait", quantite: 1, montant: 350 },
];
check("Côte Maison (équipements en 'u') → PAS incomplet", run(coteMaison), false);

// ── Moins de 5 lignes : jamais de bypass ───────────────────────────────────
const petit: IncompleteQuoteLine[] = [
  { unite: "", quantite: 1, montant: 5000 },
  { unite: "", quantite: 1, montant: 3000 },
  { unite: "", quantite: 1, montant: 2000 },
];
check("Devis 3 lignes forfait → PAS incomplet (< 5 lignes)", run(petit), false);

// ── Ratio lignes < 70% : pas de bypass même si montants forfait dominent ───
const majoriteQuantifiee: IncompleteQuoteLine[] = [
  { unite: "m²", quantite: 25, montant: 800 },
  { unite: "m²", quantite: 12, montant: 400 },
  { unite: "ml", quantite: 8, montant: 200 },
  { unite: "u", quantite: 3, montant: 300 },
  { unite: "forfait", quantite: 1, montant: 15000 }, // gros forfait isolé
];
check("Majorité de lignes quantifiées (ratio lignes 20%) → PAS incomplet", run(majoriteQuantifiee), false);

// ── Cas limite : montant forfait juste au-dessus du seuil 70% ──────────────
const forfaitDominant: IncompleteQuoteLine[] = [
  { unite: "", quantite: 1, montant: 8000 },
  { unite: "", quantite: 1, montant: 7000 },
  { unite: "", quantite: 1, montant: 6000 },
  { unite: "", quantite: 1, montant: 5000 },
  { unite: "m²", quantite: 40, montant: 2000 }, // 7.1% du montant seulement
];
check("80% lignes forfait + 93% montant forfait → incomplet", run(forfaitDominant), true);

console.log(`\n${passed} passés, ${failed} échoués`);
if (failed > 0) process.exit(1);
