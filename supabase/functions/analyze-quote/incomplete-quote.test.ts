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
// 6 sous-totaux corps de métier (libellés GÉNÉRIQUES), aucune unité → bypass.
const creteil: IncompleteQuoteLine[] = [
  { unite: "", quantite: 1, montant: 12000, libelle: "Plomberie" },
  { unite: null, quantite: null, montant: 8500, libelle: "Électricité" },
  { unite: "", quantite: 1, montant: 7600, libelle: "Maçonnerie" },
  { unite: "forfait", quantite: 1, montant: 9800, libelle: "Peinture et revêtements" },
  { unite: "", quantite: 1, montant: 6300, libelle: "Cloisons / isolation" },
  { unite: "ens", quantite: 1, montant: 5500, libelle: "Salle de bain" },
];
check("Créteil résumé par lot (libellés corps de métier) → incomplet", run(creteil), true);

// ── Fallback montants indisponibles (comportement historique préservé) ─────
const sansMontants: IncompleteQuoteLine[] = [
  { unite: "", quantite: 1, montant: null, libelle: "Travaux préparatoires" },
  { unite: "", quantite: null, montant: null, libelle: "Dépose de l'existant" },
  { unite: "forfait", quantite: 1, montant: 0, libelle: "Couverture" },
  { unite: "", quantite: 1, montant: null, libelle: "Nettoyage du chantier" },
  { unite: "ens", quantite: 1, montant: null, libelle: "Forfait global — Travaux de toiture" },
];
check("Résumé par lot sans montants (fallback comptage lignes) → incomplet", run(sansMontants), true);

// ── 2026-08-17 Cas FCE climatisation : devis d'ÉQUIPEMENT détaillé ─────────
// 7 lignes qty=1 sans unité MAIS références produit + prix par ligne
// → PAS un résumé par lot, PAS de bypass (garde « libellés de lot »).
const fce: IncompleteQuoteLine[] = [
  { unite: null, quantite: 1, montant: 0, libelle: "ART00002392-supression chaudiere gaz existante pour changement" },
  { unite: null, quantite: 1, montant: 2481, libelle: "PEAD-M60JA/ SUZ-M60VA-PEAD-M60JA / SUZ-M60VA" },
  { unite: null, quantite: 1, montant: 1250, libelle: "FOURGAIZO71-fourniture accessoire gainable airzone Pead 60" },
  { unite: null, quantite: 1, montant: 936, libelle: "Fourniture (liaison frigorifique cuivre, pvc de condensation)" },
  { unite: null, quantite: 1, montant: 1290, libelle: "AIRZ3 1BF+2TR-3 zones: 1 BlueFace + 2 thermostats d'ambiance" },
  { unite: null, quantite: 1, montant: 1500, libelle: "MOGAINABLE -MAIN D'OEUVRE POSE GAINABLE" },
  { unite: null, quantite: 1, montant: 160, libelle: "ART00002296-APPOINT FLUIDE R32" },
];
check("FCE clim (références produit, prix par ligne) → PAS incomplet", run(fce), false);

// ── Vrai résumé toiture (Le Compagnon) : intitulés de lot → bypass conservé ─
const toitureLots: IncompleteQuoteLine[] = [
  { unite: "ens", quantite: 1, montant: null, libelle: "Installation de chantier" },
  { unite: "ens", quantite: 1, montant: null, libelle: "Dépose de l'existant" },
  { unite: "ens", quantite: 1, montant: null, libelle: "Fourniture & pose — couverture" },
  { unite: "ens", quantite: 1, montant: null, libelle: "Nettoyage du chantier" },
  { unite: "forfait", quantite: 1, montant: 45000, libelle: "Forfait global — Travaux de couverture" },
];
check("Résumé toiture (intitulés de lot) → incomplet conservé", run(toitureLots), true);

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
