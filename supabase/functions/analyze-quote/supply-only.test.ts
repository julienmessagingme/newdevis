// Tests détection fourniture seule (cas NECHAB)
// Lancer : npx tsx supabase/functions/analyze-quote/supply-only.test.ts

import { detectSupplyOnlyQuote, type SupplyOnlyLine } from "./supply-only.ts";

let passed = 0, failed = 0;
function check(name: string, actual: boolean, expected: boolean) {
  if (actual === expected) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} — attendu ${expected}, obtenu ${actual}`); }
}

// ── Cas NECHAB : bon de commande éclairage → fourniture seule ──────────────
const nechab: SupplyOnlyLine[] = [
  { libelle: "TR40205 - TRACK UNO 230V 16A L:300cm Noir" },
  { libelle: "TR40105 - TRACK UNO 230V 16A L:200cm Noir" },
  { libelle: "TR40605 - CONNEXION ELECTRIQUE Noir" },
  { libelle: "TR43205 - YERA 1T GU10 MAX10W PAR16 Noir mat" },
  { libelle: "S920519 - Odace variateur lumière 200W LED blanc" },
  { libelle: "20030 - LPE GU10 3.9W/2700K STEP DIM" },
];
check("NECHAB (références produit, zéro pose) → fourniture seule", detectSupplyOnlyQuote(nechab), true);

// ── Cas FCE clim : références produit MAIS main-d'œuvre présente ───────────
const fce: SupplyOnlyLine[] = [
  { libelle: "PEAD-M60JA/ SUZ-M60VA-PEAD-M60JA / SUZ-M60VA" },
  { libelle: "FOURGAIZO71-fourniture accessoire gainable airzone Pead 60" },
  { libelle: "AIRZ3 1BF+2TR-3 zones: 1 BlueFace + 2 thermostats" },
  { libelle: "MOGAINABLE -MAIN D'OEUVRE POSE GAINABLE" },
  { libelle: "ART00002296-APPOINT FLUIDE R32" },
];
check("FCE clim (main d'œuvre présente) → devis de travaux conservé", detectSupplyOnlyQuote(fce), false);

// ── ATEX : « Fourniture et pose » → travaux ────────────────────────────────
const atex: SupplyOnlyLine[] = [
  { libelle: "Echafaudage", texte_brut: "Mise en place d'un échafaudage auto-stable" },
  { libelle: "Fourniture et pose", texte_brut: "ENSEMBLE BARDAGE : Chevrons rabotés 40x60" },
  { libelle: "Purge", texte_brut: "Sondage et purge des éléments instables" },
  { libelle: "Repliement et nettoyage de chantier" },
];
check("ATEX (pose/chantier) → travaux conservé", detectSupplyOnlyQuote(atex), false);

// ── Créteil : libellés de lot génériques sans références → pas requalifié ──
const creteil: SupplyOnlyLine[] = [
  { libelle: "Plomberie" },
  { libelle: "Électricité" },
  { libelle: "Maçonnerie" },
  { libelle: "Peinture" },
];
check("Créteil (lots génériques, 0 référence produit) → pas fourniture seule", detectSupplyOnlyQuote(creteil), false);

// ── Moins de 3 lignes : jamais requalifié ──────────────────────────────────
check("2 lignes produit → pas requalifié (seuil)", detectSupplyOnlyQuote(nechab.slice(0, 2)), false);

// ── Mix 50/50 : sous le seuil 70% ──────────────────────────────────────────
const mix: SupplyOnlyLine[] = [
  { libelle: "TR40205 - TRACK UNO 230V" },
  { libelle: "Alimentation du local" },
  { libelle: "Câble souple 3G2.5" },
  { libelle: "Petites fournitures diverses" },
];
check("Mix produit/descriptif 50% → pas requalifié", detectSupplyOnlyQuote(mix), false);

console.log(`\n${passed} passés, ${failed} échoués`);
if (failed > 0) process.exit(1);
