// Tests résolution statut entreprise (cas ARA AUSTRAL RENOV AVENIR)
// Lancer : npx tsx supabase/functions/analyze-quote/company-status.test.ts

import { resolveCompanyStatus } from "./company-status.ts";

let passed = 0, failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} — attendu ${e}, obtenu ${a}`); }
}

// ── Cas ARA (bug d'origine) : UL active, siège API périmé (fermé), mais le
//    SIRET du devis (00027) est dans matching_etablissements, ACTIF ───────────
const ara = resolveCompanyStatus({
  uniteLegaleEtat: "A",
  lookupSiret: "83488168200027",
  matchingEtablissements: [
    { siret: "83488168200027", etat_administratif: "A", date_fermeture: null, adresse: "ZA FOUCHEROLLES SAINTE CLOTILDE 14 RUE DE LA GUADELOUPE 97400 SAINT-DENIS" },
  ],
});
check("ARA — UL active + établissement du devis actif → ACTIVE", ara.is_active, true);
check("ARA — pas de flag établissement fermé", ara.etablissement_ferme, false);
check("ARA — adresse de l'établissement du devis préférée", ara.etab_adresse?.includes("GUADELOUPE"), true);
check("ARA — source = matching_etablissement", ara.status_source, "matching_etablissement");

// ── Devis portant l'ANCIEN SIRET (00019 fermé, transféré) : entreprise
//    active mais SIRET obsolète → orange, jamais rouge ────────────────────────
const oldSiret = resolveCompanyStatus({
  uniteLegaleEtat: "A",
  lookupSiret: "83488168200019",
  matchingEtablissements: [
    { siret: "83488168200019", etat_administratif: "F", date_fermeture: "2023-11-01" },
  ],
});
check("Ancien SIRET — entreprise reste ACTIVE", oldSiret.is_active, true);
check("Ancien SIRET — flag etablissement_ferme", oldSiret.etablissement_ferme, true);
check("Ancien SIRET — date de fermeture remontée", oldSiret.etablissement_ferme_date, "2023-11-01");

// ── Vraie radiation : unité légale cessée ────────────────────────────────────
const radiee = resolveCompanyStatus({
  uniteLegaleEtat: "C",
  lookupSiret: "12345678900011",
  matchingEtablissements: [{ siret: "12345678900011", etat_administratif: "F", date_fermeture: "2022-01-01" }],
});
check("UL cessée → RADIÉE", radiee.is_active, false);
check("UL cessée — source unite_legale", radiee.status_source, "unite_legale");

// ── Lookup par nom (pas de SIRET) : UL active suffit ─────────────────────────
const parNom = resolveCompanyStatus({ uniteLegaleEtat: "A", lookupSiret: null, matchingEtablissements: [] });
check("Lookup nom — UL active → ACTIVE (siege API ignoré)", parNom.is_active, true);
check("Lookup nom — source unite_legale_seule", parNom.status_source, "unite_legale_seule");

// ── SIRET vérifié absent des matching_etablissements → UL active gagne ───────
const absent = resolveCompanyStatus({
  uniteLegaleEtat: "A",
  lookupSiret: "83488168200027",
  matchingEtablissements: [{ siret: "99999999900011", etat_administratif: "F" }],
});
check("SIRET non trouvé dans matching — UL active → ACTIVE", absent.is_active, true);
check("SIRET non trouvé — pas de flag fermé", absent.etablissement_ferme, false);

console.log(`\n${passed} passés, ${failed} échoués`);
if (failed > 0) process.exit(1);
