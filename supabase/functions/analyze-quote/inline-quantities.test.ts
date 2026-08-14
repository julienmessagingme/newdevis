// ============================================================
// Tests anti-régression inline-quantities (remontée surfaces inline)
// Lancer : npx tsx supabase/functions/analyze-quote/inline-quantities.test.ts
// (harness standalone, exclu de vitest — même pattern que incomplete-quote.test.ts)
// ============================================================

import {
  extractInlineSurface,
  liftInlineQuantities,
  type LiftableLigne,
} from "./inline-quantities.ts";

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name} — attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`);
  }
}

console.log("── extractInlineSurface ──");

// ── Cas HEXA BAT réels (BUGS-A-CORRIGER INCOMPLETE-QUOTE-FAUX-POSITIF) ─────
check("Création salle d'eau - 13,23m2", extractInlineSurface("Création salle d'eau - 13,23m2 Pose et fourniture ossature métallique"), 13.23);
check("Coffrage plafond rempant - 21.74m2", extractInlineSurface("Coffrage plafond rempant avec isolation - 21.74m2"), 21.74);
check("Coffrage murs extérieurs - 60,61m2", extractInlineSurface("Coffrage murs extérieurs avec isolation - 60,61m2"), 60.61);
check("Ponçage parquet existant 21,74m²", extractInlineSurface("Ponçage parquet existant 21,74m²"), 21.74);
check("Peinture 84,18 m² (avec espace)", extractInlineSurface("Peinture des murs et plafonds 84,18 m²"), 84.18);

// ── Total explicite « = X m² » (plusieurs mentions, un total) ──────────────
check("murs + sol = 16,03m2 (total après =)", extractInlineSurface("Salle d'eau : murs 12m2 + sol 4m2 = 16,03m2"), 16.03);

// ── Gardes anti-pièges ─────────────────────────────────────────────────────
check("R = 1.4 m².K/W (résistance thermique) → null", extractInlineSurface("Panneau laine de verre TP 238 - ép. 45 mm - R = 1.4 m².K/W"), null);
check("R = 7,5 m².K/W → null", extractInlineSurface("Laine de verre IBR ép. 300 mm - 2,6x1,2 m - R = 7,5 m².K/W"), null);
check("80 €/m² (prix unitaire) → null", extractInlineSurface("Pose faïence salle de bain 80 €/m²"), null);
check("39€/m2 collé → null", extractInlineSurface("Peinture au tarif de 39€/m2"), null);
check("5à7 m2 (rendement colle) → null", extractInlineSurface("Colle à faïence en sceau de 17kg spéciale douche 5à7 m2 WEBERFIX"), null);
check("600x600 mm (dimensions) → null", extractInlineSurface("Trappe de visite métallique laquée blanche DELTAPRO 600x600 mm"), null);
check("1X1m (dimensions) → null", extractInlineSurface("Décroutage mur salon en pierre 1X1m"), null);
check("deux valeurs distinctes sans total → null", extractInlineSurface("Faïence murale 16,20 m² et sol 5,12 m²"), null);
check("valeur aberrante 5000 m² → null", extractInlineSurface("Terrain de 5000 m2"), null);
check("texte sans surface → null", extractInlineSurface("Dépose des sanitaires et évacuations"), null);
check("mentions répétées de la même valeur → OK", extractInlineSurface("Doublage 25 m² : fourniture placo 25m2, pose comprise"), 25);

console.log("\n── liftInlineQuantities ──");

// ── Cas nominal HEXA BAT : 1 ens + surface inline → remontée ───────────────
const hexabat: LiftableLigne[] = [
  { type: "ligne_travaux", quantite: 1, unite: "ens", montant_total: 1183, prix_unitaire: 1183, libelle: "Création salle d'eau - 13,23m2", texte_brut: "" },
  { type: "ligne_travaux", quantite: 1, unite: "ens", montant_total: 3188, prix_unitaire: 3188, libelle: "Coffrage murs extérieurs avec isolation - 60,61m2", texte_brut: "" },
  { type: "ligne_travaux", quantite: 1, unite: "ens", montant_total: 650, prix_unitaire: 650, libelle: "Démolition et évacuation des éléments salle d'eau", texte_brut: "" },
];
const n1 = liftInlineQuantities(hexabat);
check("HEXA BAT : 2 lignes remontées sur 3", n1, 2);
check("ligne 1 → quantite=13.23", hexabat[0].quantite, 13.23);
check("ligne 1 → unite=m²", hexabat[0].unite, "m²");
check("ligne 1 → prix_unitaire annulé (sera recalculé)", hexabat[0].prix_unitaire, null);
check("ligne 1 → traçabilité description_inline", hexabat[0].quantite_source, "description_inline");
check("ligne 3 (pas de surface) intacte", hexabat[2].quantite, 1);

// ── Lignes déjà quantifiées : JAMAIS touchées ──────────────────────────────
const quantified: LiftableLigne[] = [
  { type: "ligne_travaux", quantite: 80, unite: "m²", montant_total: 11400, libelle: "Bardage 80 m² à 142,50", texte_brut: "" },
  { type: "ligne_travaux", quantite: 21, unite: "m²", montant_total: 1680, libelle: "Pose faïence 21 m²", texte_brut: "" },
];
check("lignes déjà en m² → 0 remontée", liftInlineQuantities(quantified), 0);
check("quantité 80 préservée", quantified[0].quantite, 80);

// ── Titres de section / sous-totaux : jamais touchés ───────────────────────
const titres: LiftableLigne[] = [
  { type: "titre_section", quantite: null, unite: null, montant_total: 9692, libelle: "Fournitures et pose des sanitaires 30m2", texte_brut: "" },
];
check("titre_section ignoré même avec surface", liftInlineQuantities(titres), 0);

// ── Garde résistance thermique dans un vrai contexte de ligne ──────────────
const isolation: LiftableLigne[] = [
  { type: "ligne_travaux", quantite: 1, unite: "ens", montant_total: 2375, libelle: "Doublage murs périphériques", texte_brut: "Panneau laine de verre revêtu kraft TP 238 - ép. 45 mm - 1,35x0,6 m - R = 1.4 m².K/W" },
];
check("R=1.4 m².K/W non remonté comme surface", liftInlineQuantities(isolation), 0);

console.log(`\n${passed} passés, ${failed} échoués`);
if (failed > 0) process.exit(1);
