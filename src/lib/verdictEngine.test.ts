/**
 * Sanity check — verdictEngine
 * Exécuter : npx tsx src/lib/verdictEngine.test.ts
 */
import {
  normalizeCompanyStatus,
  computeVerdict,
  extractCompanyStatusFromCriteria,
  type VerdictFlags,
} from "./verdictEngine";

const SAFE_FLAGS: VerdictFlags = {
  entreprise_radiee: false, siret_invalide: false, absence_assurance: false,
  paiement_cash_suspect: false, iban_suspect: false,
  mentions_legales_manquantes: false, acompte_excessif: false, incoherence_contractuelle: false,
};

let passed = 0; let failed = 0;
function check(label: string, got: unknown, expected: unknown) {
  if (got === expected) { passed++; console.log("  ✓", label); }
  else { failed++; console.error("  ✗", label, "— got:", got, "expected:", expected); }
}

// ── normalizeCompanyStatus ────────────────────────────────────────────────────
console.log("\n[normalizeCompanyStatus]");
check("cessation → risk",            normalizeCompanyStatus("cessation"),            "risk");
check("cessation d'activité → risk", normalizeCompanyStatus("cessation d'activité"), "risk");
check("en cessation → risk",         normalizeCompanyStatus("en cessation"),         "risk");
check("liquidation judiciaire → risk", normalizeCompanyStatus("liquidation judiciaire"), "risk");
check("redressement → risk",         normalizeCompanyStatus("redressement"),         "risk");
check("radiée → risk",               normalizeCompanyStatus("radiée"),               "risk");
check("radiation → risk",            normalizeCompanyStatus("radiation"),            "risk");
check("inactive → risk",             normalizeCompanyStatus("inactive"),             "risk");
check("inactif → risk",              normalizeCompanyStatus("inactif"),              "risk");
check("dissoute → risk",             normalizeCompanyStatus("dissoute"),             "risk");
check("CESSATION (majuscules) → risk", normalizeCompanyStatus("CESSATION"),          "risk");
check("active → ok",                 normalizeCompanyStatus("active"),               "ok");
check("en activité → ok",            normalizeCompanyStatus("en activité"),          "ok");
check("actif → ok",                  normalizeCompanyStatus("actif"),                "ok");
check("'' (vide) → ok",              normalizeCompanyStatus(""),                     "ok");

// ── computeVerdict — company_status priorité absolue ─────────────────────────
console.log("\n[computeVerdict — hard block company_status]");

// Test critique : cessation force refuser même si prix très attractif
const v1 = computeVerdict({
  total_amount: 8_000, market_estimate_min: 12_000, market_estimate_max: 15_000,
  anomalies_major_count: 0, anomalies_total_count: 0,
  company_risk: "low", flags: SAFE_FLAGS,
  company_status: "cessation",
});
check("cessation → verdict refuser",       v1.verdict,            "refuser");
check("cessation → hard_block_reason",     v1.hard_block_reason,  "company_status");
check("cessation → is_hard_block",         v1.is_hard_block,      true);

const v2 = computeVerdict({
  total_amount: 8_000, market_estimate_min: 12_000, market_estimate_max: 15_000,
  anomalies_major_count: 0, anomalies_total_count: 0,
  company_risk: "low", flags: SAFE_FLAGS,
  company_status: "liquidation judiciaire",
});
check("liquidation judiciaire → refuser",  v2.verdict,            "refuser");
check("liquidation → hard_block_reason",   v2.hard_block_reason,  "company_status");

const v3 = computeVerdict({
  total_amount: 8_000, market_estimate_min: 12_000, market_estimate_max: 15_000,
  anomalies_major_count: 0, anomalies_total_count: 0,
  company_risk: "low", flags: SAFE_FLAGS,
  company_status: "redressement judiciaire",
});
check("redressement judiciaire → refuser", v3.verdict,            "refuser");

// Test : prix cher + entreprise saine → ne doit PAS être refuser (anti-régression)
const v4 = computeVerdict({
  total_amount: 18_000, market_estimate_min: 12_000, market_estimate_max: 15_000,
  anomalies_major_count: 0, anomalies_total_count: 0,
  company_risk: "low", flags: SAFE_FLAGS,
});
check("prix cher saine → refuser (pas de company_status)", v4.verdict, "refuser"); // 20%+ above max

// Test anti-régression : entreprise saine, prix OK → signer
const v5 = computeVerdict({
  total_amount: 13_000, market_estimate_min: 12_000, market_estimate_max: 15_000,
  anomalies_major_count: 0, anomalies_total_count: 0,
  company_risk: "low", flags: SAFE_FLAGS,
});
check("entreprise saine, prix OK → signer", v5.verdict, "signer");

// Test : company_status = "active" → ne bloque pas
const v6 = computeVerdict({
  total_amount: 13_000, market_estimate_min: 12_000, market_estimate_max: 15_000,
  anomalies_major_count: 0, anomalies_total_count: 0,
  company_risk: "low", flags: SAFE_FLAGS,
  company_status: "active",
});
check("company_status=active ne bloque pas → signer", v6.verdict, "signer");

// ── extractCompanyStatusFromCriteria ─────────────────────────────────────────
console.log("\n[extractCompanyStatusFromCriteria]");
const s1 = extractCompanyStatusFromCriteria(["🔴 Entreprise en cessation d'activité depuis 2023", "🔴 Résultat net négatif"]);
check("extraire cessation d'activité", s1, "cessation d'activité");

const s2 = extractCompanyStatusFromCriteria(["🔴 Procédure collective en cours (liquidation judiciaire)"]);
check("extraire liquidation judiciaire", s2, "liquidation judiciaire");

const s3 = extractCompanyStatusFromCriteria(["🟠 Ancienneté < 3 ans", "🟠 Aucun avis Google"]);
check("aucun statut → null", s3, null);

// ── Résumé ────────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(40)}`);
console.log(`${passed + failed} tests — ${passed} ✓ passed, ${failed} ✗ failed`);
if (failed > 0) process.exit(1);
