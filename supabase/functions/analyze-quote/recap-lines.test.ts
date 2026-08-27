// Tests détection ligne récapitulative (cas NAZON)
// Lancer : npx tsx supabase/functions/analyze-quote/recap-lines.test.ts

import { detectRecapTotalLine } from "./recap-lines.ts";

let passed = 0, failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  if (actual === expected) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} — attendu ${expected}, obtenu ${actual}`); }
}

// ── Cas NAZON : 6 sous-totaux + « forfait intervention » = leur somme ───────
const nazon = [
  { montant_total: 1920 },
  { montant_total: 17250 },
  { montant_total: 35000 },
  { montant_total: 9600 },
  { montant_total: 13500 },
  { montant_total: 12000 },
  { montant_total: 89270 }, // ← récap (somme des 6 précédentes)
];
check("NAZON — récap en fin de devis détecté", detectRecapTotalLine(nazon), 6);

// ── Récap en TÊTE (la garde V3.5.10 couvrait déjà ce sens, on ne régresse pas)
const recapEnTete = [
  { montant_total: 50000 },
  { montant_total: 20000 },
  { montant_total: 18000 },
  { montant_total: 12000 },
];
check("Récap en tête détecté aussi", detectRecapTotalLine(recapEnTete), 0);

// ── Tolérance : arrondi de 3 € sur 89 270 € → toujours détecté ─────────────
const arrondi = [
  { montant_total: 1920 },
  { montant_total: 17250 },
  { montant_total: 35000 },
  { montant_total: 9600 },
  { montant_total: 13500 },
  { montant_total: 12000 },
  { montant_total: 89273 },
];
check("Écart d'arrondi 3 € toléré", detectRecapTotalLine(arrondi), 6);

// ── Devis NORMAL : aucune ligne ne vaut la somme des autres ────────────────
const normal = [
  { montant_total: 3401 },
  { montant_total: 1100 },
  { montant_total: 675 },
  { montant_total: 520 },
  { montant_total: 450 },
];
check("Devis normal → aucun récap", detectRecapTotalLine(normal), null);

// ── Un gros poste dominant mais ≠ somme des autres → PAS un récap ──────────
const grosPoste = [
  { montant_total: 60000 }, // 60k vs 30k d'autres → pas égal
  { montant_total: 15000 },
  { montant_total: 10000 },
  { montant_total: 5000 },
];
check("Gros poste dominant ≠ récap", detectRecapTotalLine(grosPoste), null);

// ── 2 lignes égales : jamais requalifié (coïncidence trop fréquente) ───────
check("2 lignes égales → pas de récap (seuil 3 lignes)", detectRecapTotalLine([{ montant_total: 5000 }, { montant_total: 5000 }]), null);

// ── Montants absents / nuls ignorés proprement ────────────────────────────
check("Lignes sans montant → null", detectRecapTotalLine([{ montant_total: null }, {}, { montant_total: 0 }]), null);

console.log(`\n${passed} passés, ${failed} échoués`);
if (failed > 0) process.exit(1);
