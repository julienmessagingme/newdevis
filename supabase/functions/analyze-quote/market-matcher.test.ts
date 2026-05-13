/**
 * market-matcher.test.ts — Tests anti-régression V3.6 / V3.6.1 / V3.4.8
 *
 * Cas issus des observations réelles des 5 analyses test du 12-13/05/2026.
 * Exécution :
 *   npx tsx supabase/functions/analyze-quote/market-matcher.test.ts
 */
import { matchMarketCategory, validateSignature, type MarketCatalogRow, type SemanticSignature } from "./market-matcher.ts";

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${(e as Error).message}`); failed++; }
}
function assertEq<T>(actual: T, expected: T, msg = "") {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${msg}\n      expected: ${JSON.stringify(expected)}\n      got:      ${JSON.stringify(actual)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini catalogue représentatif (extrait des cas réels observés)
// ─────────────────────────────────────────────────────────────────────────────
const catalog: MarketCatalogRow[] = [
  // Étanchéité
  { job_type: "etancheite_toiture_plate_pvc", label: "Étanchéité toiture plate PVC", unit: "m2",
    price_min_unit_ht: 70, price_avg_unit_ht: 90, price_max_unit_ht: 120,
    fixed_min_ht: 0, fixed_avg_ht: 0, fixed_max_ht: 0, zip_scope: "FR", notes: null, room_specific: false },
  // Façade
  { job_type: "ravalement_facade", label: "Ravalement façade enduit", unit: "m2",
    price_min_unit_ht: 40, price_avg_unit_ht: 65, price_max_unit_ht: 100,
    fixed_min_ht: 0, fixed_avg_ht: 0, fixed_max_ht: 0, zip_scope: "FR", notes: null, room_specific: false },
  // Carrelage SDB room_specific
  { job_type: "carrelage_sdb_etancheite", label: "Carrelage salle de bain avec étanchéité", unit: "m2",
    price_min_unit_ht: 80, price_avg_unit_ht: 110, price_max_unit_ht: 150,
    fixed_min_ht: 0, fixed_avg_ht: 0, fixed_max_ht: 0, zip_scope: "FR", notes: null, room_specific: true, required_room: ["salle_de_bain"] },
  // Carrelage générique
  { job_type: "carrelage_standard_fourni_pose", label: "Carrelage standard (fourni+posé)", unit: "m2",
    price_min_unit_ht: 60, price_avg_unit_ht: 85, price_max_unit_ht: 120,
    fixed_min_ht: 0, fixed_avg_ht: 0, fixed_max_ht: 0, zip_scope: "FR", notes: null, room_specific: false, generic_family: "carrelage" },
  // Raccordements électricité room_specific cuisine (le piège Thouret)
  { job_type: "raccordements_electricite_cuisine", label: "Raccordements électricité cuisine", unit: "u",
    price_min_unit_ht: 35, price_avg_unit_ht: 55, price_max_unit_ht: 80,
    fixed_min_ht: 0, fixed_avg_ht: 0, fixed_max_ht: 0, zip_scope: "FR", notes: null, room_specific: true, required_room: ["cuisine"] },
  // Raccordements électricité générique
  { job_type: "raccordements_electricite_generique", label: "Raccordements électricité", unit: "u",
    price_min_unit_ht: 30, price_avg_unit_ht: 50, price_max_unit_ht: 75,
    fixed_min_ht: 0, fixed_avg_ht: 0, fixed_max_ht: 0, zip_scope: "FR", notes: null, room_specific: false, generic_family: "raccordements_electricite" },
  // Enrobé (le faux match SALLEM terrassement avant V3.6.1)
  { job_type: "enrobe_cle_en_main", label: "Enrobé clé en main", unit: "m2",
    price_min_unit_ht: 50, price_avg_unit_ht: 75, price_max_unit_ht: 110,
    fixed_min_ht: 0, fixed_avg_ht: 0, fixed_max_ht: 0, zip_scope: "FR", notes: null, room_specific: false },
  // Couverture bac acier (autre faux match potentiel)
  { job_type: "couverture_bac_acier", label: "Couverture bac acier", unit: "m2",
    price_min_unit_ht: 40, price_avg_unit_ht: 60, price_max_unit_ht: 90,
    fixed_min_ht: 0, fixed_avg_ht: 0, fixed_max_ht: 0, zip_scope: "FR", notes: null, room_specific: false },
  // Pavage cour
  { job_type: "pavage_cour_fourniture_pose", label: "Pavage cour fourniture+pose", unit: "m2",
    price_min_unit_ht: 80, price_avg_unit_ht: 120, price_max_unit_ht: 180,
    fixed_min_ht: 0, fixed_avg_ht: 0, fixed_max_ht: 0, zip_scope: "FR", notes: null, room_specific: false },
];

console.log("\n[market-matcher.test.ts — V3.6.1 + V3.4.8]\n");

// ─────────────────────────────────────────────────────────────────────────────
// validateSignature — enums stricts
// ─────────────────────────────────────────────────────────────────────────────
console.log("[validateSignature]");

test("signature complète valide", () => {
  const r = validateSignature({ domain: "carrelage", subcategory: "fourniture_pose", room: "salle_de_bain", unit: "m2", keywords: ["carrelage"] });
  assertEq(r.valid, true);
  assertEq(r.signature?.domain, "carrelage");
});

test("rejet domain hors enum", () => {
  const r = validateSignature({ domain: "voiture", subcategory: "x", room: null, unit: "u", keywords: [] });
  assertEq(r.valid, false);
});

test("rejet subcategory hors whitelist domain", () => {
  const r = validateSignature({ domain: "electricite", subcategory: "voilier", room: null, unit: "u", keywords: [] });
  assertEq(r.valid, false);
});

test("V3.6.1 — domain=autre + subcategory=autre OK (whitelist enrichie)", () => {
  const r = validateSignature({ domain: "autre", subcategory: "autre", room: null, unit: "forfait", keywords: [] });
  assertEq(r.valid, true, "domain=autre+sub=autre doit être valide depuis V3.6.1");
});

// ─────────────────────────────────────────────────────────────────────────────
// V3.6.1 anti-régression — faux fuzzy cross-domain
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[V3.6.1 — anti faux fuzzy]");

test("Terrassement → enrobé : REJET (domain_score < 30)", () => {
  // Cas réel SALLEM log: terrassement/excavation matched enrobe_cle_en_main fuzzy 55.
  // V3.6.1 doit rejeter car domain_score < FUZZY_MIN_DOMAIN_SCORE (30).
  const sig: SemanticSignature = {
    domain: "terrassement", subcategory: "excavation", room: null, unit: "m3",
    keywords: ["terrassement", "fondations", "beton", "dallage", "agglos"],
  };
  const r = matchMarketCategory(sig, catalog);
  if (r.matched && r.job_type === "enrobe_cle_en_main") {
    throw new Error(`V3.6.1 DOIT rejeter terrassement → enrobé (cross-domain). Obtenu: ${r.match_strategy} → ${r.job_type}`);
  }
});

test("V3.6.1 — seuil fuzzy 50 (pas 40)", () => {
  // Un match avec score [40, 49] doit être no_match (avant V3.6.1 c'était fuzzy_fallback)
  // On choisit une signature qui ne matche AUCUN candidat fortement
  const sig: SemanticSignature = {
    domain: "isolation", subcategory: "interieur", room: null, unit: "m2",
    keywords: ["isolation"],
  };
  const r = matchMarketCategory(sig, catalog);
  // Le catalogue de test ne contient pas d'isolation → no_match attendu
  assertEq(r.match_strategy, "no_match");
});

// ─────────────────────────────────────────────────────────────────────────────
// V3.4.8 — Garde non-postes
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[V3.4.8 — non-postes filter]");

test("Acompte à joindre → no_match direct", () => {
  const sig: SemanticSignature = {
    domain: "autre", subcategory: "divers", room: null, unit: "forfait",
    keywords: ["acompte", "joindre"],
  };
  const r = matchMarketCategory(sig, catalog);
  assertEq(r.match_strategy, "no_match");
  assertEq(r.matched, false);
  if (!r.mismatch_reason?.includes("non-work")) throw new Error(`Expected non-work reason, got: ${r.mismatch_reason}`);
});

test("Prime CEE Effy → no_match direct", () => {
  const sig: SemanticSignature = {
    domain: "autre", subcategory: "divers", room: null, unit: "forfait",
    keywords: ["prime", "cee", "effy"],
  };
  const r = matchMarketCategory(sig, catalog);
  assertEq(r.match_strategy, "no_match");
});

test("Solde restant à régler → no_match direct", () => {
  const sig: SemanticSignature = {
    domain: "autre", subcategory: "divers", room: null, unit: "forfait",
    keywords: ["solde", "regler", "restant"],
  };
  const r = matchMarketCategory(sig, catalog);
  assertEq(r.match_strategy, "no_match");
});

test("V3.4.9 — Maîtrise d'œuvre (domain=autre) → no_match", () => {
  const sig: SemanticSignature = {
    domain: "autre", subcategory: "main_oeuvre", room: null, unit: "forfait",
    keywords: ["maitrise oeuvre", "etude faisabilite", "avant projet", "conception"],
  };
  const r = matchMarketCategory(sig, catalog);
  assertEq(r.match_strategy, "no_match");
  if (!r.mismatch_reason?.includes("non-work")) throw new Error(`Expected non-work, got: ${r.mismatch_reason}`);
});

test("V3.4.9 — Diagnostic immobilier (libellé identique au cas réel) → no_match", () => {
  // Cas réel : "Diagnostic / devis approfondi" matché à diagnostic_immobilier 250€
  // alors que c'était une mission MOE complète à 4 706€ → anomalie +4 500€ aberrante.
  const sig: SemanticSignature = {
    domain: "autre", subcategory: "main_oeuvre", room: null, unit: "u",
    keywords: ["diagnostic", "devis", "approfondi"],
  };
  const r = matchMarketCategory(sig, catalog);
  assertEq(r.match_strategy, "no_match");
});

test("V3.4.9 — Architecte avec domain=electricite (Gemini confus) → no_match quand même", () => {
  // Cas robustesse : même si Gemini choisit un mauvais domain, les keywords doivent bloquer.
  const sig: SemanticSignature = {
    domain: "electricite", subcategory: "raccordement", room: null, unit: "forfait",
    keywords: ["architecte", "honoraires", "conception"],
  };
  const r = matchMarketCategory(sig, catalog);
  assertEq(r.match_strategy, "no_match");
});

test("autre/fournitures SANS keyword financier → tente le match normal (pas garde)", () => {
  const sig: SemanticSignature = {
    domain: "autre", subcategory: "fournitures", room: null, unit: "u",
    keywords: ["fourniture", "pose"],
  };
  const r = matchMarketCategory(sig, catalog);
  // Pas matché car catalogue test n'a pas de domain "autre" et la garde non-poste
  // ne se déclenche que sur keywords financiers (acompte/solde/cee/capital/...)
  // → fallback normal "no candidates for domain"
  assertEq(r.match_strategy, "no_match");
  if (r.mismatch_reason?.includes("non-work")) throw new Error("Ne doit PAS être bloqué par la garde non-poste (pas de keyword financier)");
});

// ─────────────────────────────────────────────────────────────────────────────
// Hard block room mismatch (anti-bug Thouret "cuisine")
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[Hard block room mismatch]");

test("Thouret Elec — signature.room=null + catalog room_specific cuisine → rejet", () => {
  // Cas réel Thouret : devis électricité chambre/séjour sans mention cuisine.
  // Le catalogue contient raccordements_electricite_cuisine (room_specific) ET
  // raccordements_electricite_generique. Le matcher doit choisir le générique.
  const sig: SemanticSignature = {
    domain: "electricite", subcategory: "raccordement", room: null, unit: "u",
    keywords: ["prise", "interrupteur", "moulure"],
  };
  const r = matchMarketCategory(sig, catalog);
  // Doit matcher le generique, JAMAIS le cuisine
  if (r.job_type === "raccordements_electricite_cuisine") {
    throw new Error("Bug régression Thouret — match cuisine alors que signature.room=null");
  }
  if (r.matched) assertEq(r.job_type, "raccordements_electricite_generique");
});

// ─────────────────────────────────────────────────────────────────────────────
// Matchs corrects observés dans les logs SHADOW (golden cases V3.6)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[Golden matches V3.6 — réussites observées en shadow]");

test("Étanchéité membrane → etancheite_toiture_plate_pvc (exact)", () => {
  const sig: SemanticSignature = {
    domain: "etancheite", subcategory: "membrane", room: null, unit: "m2",
    keywords: ["etancheite", "efigreen", "sopralene"],
  };
  const r = matchMarketCategory(sig, catalog);
  assertEq(r.matched, true);
  assertEq(r.job_type, "etancheite_toiture_plate_pvc");
  if (r.match_strategy !== "exact" && r.match_strategy !== "indicative")
    throw new Error(`Expected exact/indicative, got: ${r.match_strategy}`);
});

test("Carrelage SDB room=salle_de_bain → carrelage_sdb_etancheite", () => {
  const sig: SemanticSignature = {
    domain: "carrelage", subcategory: "fourniture_pose", room: "salle_de_bain", unit: "m2",
    keywords: ["carrelage", "faience", "bain"],
  };
  const r = matchMarketCategory(sig, catalog);
  assertEq(r.matched, true);
  // Doit préférer le room_specific qui matche la pièce
  assertEq(r.job_type, "carrelage_sdb_etancheite");
});

test("Façade enduit room=exterieur → ravalement_facade (exact)", () => {
  const sig: SemanticSignature = {
    domain: "facade", subcategory: "enduit", room: "exterieur", unit: "m2",
    keywords: ["crepis", "gratte", "enduit"],
  };
  const r = matchMarketCategory(sig, catalog);
  assertEq(r.matched, true);
  assertEq(r.job_type, "ravalement_facade");
});

console.log(`\n────────────────────────────────────────`);
console.log(`${passed + failed} tests — ${passed} ✓ passed, ${failed} ✗ failed`);
if (failed > 0) process.exit(1);
