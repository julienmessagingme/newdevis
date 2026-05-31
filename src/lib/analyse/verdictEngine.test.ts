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
  mentions_legales_manquantes: false, acompte_excessif: false,
  acompte_cumule_excessif: false,
  incoherence_contractuelle: false,
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

// ─────────────────────────────────────────────────────────────────────────────
// V3.4.19 / V3.4.20 — Anti-régression cas réels (2026-05-19)
// Bug d'origine : faux ROUGE "entreprise radiée" sur noms commerciaux fréquents
// (AEB Rénovation = 6 homonymes dont 2 radiés) et sur estimations courtier
// (Renovation Man = 6 homonymes dont 3 radiés). verdictEngine.computeVerdict ne
// doit JAMAIS produire un hard block REFUSER si entreprise_radiee=false (cas
// ambiguous V3.4.19) ou si company_status absent/null (cas courtier V3.4.20).
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[V3.4.19/V3.4.20 — anti-régression cas réels]");

// CAS 1 — AEB Rénovation Brest (Serge Duport EI 33 ans, ACTIF)
// Si Gemini capte le SIRET → lookup direct INSEE OK → entreprise_radiee=false,
// company_status="active". Verdict doit être basé sur prix uniquement.
const aebSiretOk = computeVerdict({
  total_amount: 11_293, // HT du devis
  market_estimate_min: 9_500, market_estimate_max: 13_500,
  anomalies_major_count: 0, anomalies_total_count: 2, // clause "240€ si non signé" + acompte 30% limite
  company_risk: "low", flags: SAFE_FLAGS,
  company_status: "active",
});
check("AEB SIRET OK (33 ans actif, prix ds fourchette) → signer", aebSiretOk.verdict, "signer");
check("AEB SIRET OK → pas de hard block",                          aebSiretOk.is_hard_block, false);

// CAS 2 — AEB Rénovation, scénario où Gemini RATE le SIRET → V3.4.19 fallback
// nom retourne lookup_status="ambiguous" → entreprise_radiee=null → flags.entreprise_radiee=false
// → company_status=null → PAS de hard block. Verdict basé sur prix uniquement.
const aebAmbiguous = computeVerdict({
  total_amount: 11_293,
  market_estimate_min: 9_500, market_estimate_max: 13_500,
  anomalies_major_count: 0, anomalies_total_count: 2,
  company_risk: "low", flags: SAFE_FLAGS,
  // company_status omis volontairement (cas ambiguous V3.4.19)
});
check("AEB ambiguous (SIRET raté, 6 homonymes) → JAMAIS refuser", aebAmbiguous.verdict !== "refuser", true);
check("AEB ambiguous → pas de hard block",                         aebAmbiguous.is_hard_block, false);

// CAS 3 — Renovation Man (courtier) — V3.4.20 bypass dans conclusion.ts EN AMONT
// du verdictEngine. Mais en garde-fou : si jamais le verdictEngine recevait un
// VerdictInput pour ce cas, le résultat doit rester SIGNER puisque company_status
// reste null (le bloc Entreprise est ambigu = aucune entreprise validée).
const renovationManFallback = computeVerdict({
  total_amount: 10_903, // TTC SDB seul du devis
  market_estimate_min: 9_500, market_estimate_max: 14_000,
  anomalies_major_count: 0, anomalies_total_count: 1, // 80% paiement avant réception
  company_risk: "low", flags: SAFE_FLAGS,
  // company_status omis (courtier, pas d'artisan identifié)
});
check("Renovation Man fallback verdictEngine → JAMAIS refuser",  renovationManFallback.verdict !== "refuser", true);
check("Renovation Man fallback → pas de hard block",             renovationManFallback.is_hard_block, false);

// CAS 4 — Vitaliy Botyuk (auto-entrepreneur 7 ans, ACTIF) — beaucoup de lignes
// sans unité (>50%) → V3.4.17 garde unités déclenche comparison_indicative MAIS
// company_status="active" → pas de hard block, verdict basé sur prix.
const vitaliyAutoEntr = computeVerdict({
  total_amount: 18_895,
  market_estimate_min: 16_000, market_estimate_max: 24_000, // SDB + peintures Paris 17e
  anomalies_major_count: 0, anomalies_total_count: 0,
  company_risk: "low", flags: SAFE_FLAGS,
  company_status: "active",
});
check("Vitaliy Botyuk (actif 7 ans, prix bas marché) → signer",  vitaliyAutoEntr.verdict, "signer");
check("Vitaliy Botyuk → pas de hard block",                       vitaliyAutoEntr.is_hard_block, false);

// CAS 5 — REGRESSION CHECK : entreprise vraiment radiée (SIRET direct match
// retourne etat_administratif="C") DOIT TOUJOURS être refuser. Bug V3.4.19 NE
// DOIT PAS bypass un VRAI cas radié quand le SIRET est extrait correctement.
const vraieRadiee = computeVerdict({
  total_amount: 8_000, market_estimate_min: 10_000, market_estimate_max: 12_000,
  anomalies_major_count: 0, anomalies_total_count: 0,
  company_risk: "low", flags: SAFE_FLAGS,
  company_status: "radiée du RCS",
});
check("Vraie entreprise radiée (SIRET match direct) → refuser",   vraieRadiee.verdict, "refuser");
check("Vraie radiée → hard_block_reason=company_status",          vraieRadiee.hard_block_reason, "company_status");

// CAS 6 — REGRESSION CHECK : flags.entreprise_radiee=true (issu d'un SIRET match
// direct INSEE qui retourne etat_administratif="C") DOIT déclencher hard block
// même si company_status est absent.
const flagsRadieeOnly = computeVerdict({
  total_amount: 8_000, market_estimate_min: 10_000, market_estimate_max: 12_000,
  anomalies_major_count: 0, anomalies_total_count: 0,
  company_risk: "low",
  flags: { ...SAFE_FLAGS, entreprise_radiee: true },
});
check("flags.entreprise_radiee=true → refuser",                   flagsRadieeOnly.verdict, "refuser");
check("flags.entreprise_radiee=true → is_hard_block",             flagsRadieeOnly.is_hard_block, true);

// ── Résumé ────────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(40)}`);
console.log(`${passed + failed} tests — ${passed} ✓ passed, ${failed} ✗ failed`);
if (failed > 0) process.exit(1);
