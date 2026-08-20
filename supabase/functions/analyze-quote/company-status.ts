/**
 * supabase/functions/analyze-quote/company-status.ts
 *
 * 2026-08-20 (cas ARA AUSTRAL RENOV AVENIR, devis SIDR CAMELIAS) — résolution
 * du statut d'une entreprise depuis la réponse recherche-entreprises.api.gouv.fr.
 *
 * Bug d'origine : `isActive = uniteLegaleActive && !siegeFerme` confondait
 * FERMETURE D'ÉTABLISSEMENT et RADIATION D'ENTREPRISE. Cas réel : transfert de
 * siège (00019 fermé le 01/11/2023 → 00027 actif). L'index recherche-entreprises
 * renvoyait encore l'ANCIEN siège fermé dans `siege` alors que (a) l'unité
 * légale est active ET (b) `matching_etablissements` contenait le SIRET exact
 * du devis, ACTIF. Résultat : « Entreprise radiée » → hard block ROUGE faux.
 *
 * Règles de résolution (par ordre d'autorité) :
 *   1. Unité légale ≠ "A" → RADIÉE. C'est le SEUL cas « radiée » : une
 *      entreprise dissoute a toujours son unité légale à "C" côté INSEE.
 *   2. Unité légale "A" + l'établissement exact du SIRET vérifié est dans
 *      `matching_etablissements` :
 *        - état "A" → ACTIVE (et on préfère SON adresse, c'est celle du devis).
 *        - état "F" → ACTIVE au niveau entreprise, MAIS flag
 *          `etablissement_ferme` (le SIRET du devis est obsolète — transfert
 *          ou fermeture d'antenne) → avertissement ORANGE, jamais rouge.
 *   3. Unité légale "A" sans info sur l'établissement exact (lookup par nom,
 *      SIREN seul) → ACTIVE. L'état du `siege` renvoyé par l'API n'est PAS
 *      fiable (index en retard sur les transferts de siège) : il ne doit
 *      JAMAIS suffire à déclarer une radiation.
 */

export interface MatchingEtab {
  siret?: string | null;
  etat_administratif?: string | null;
  date_fermeture?: string | null;
  adresse?: string | null;
  libelle_commune?: string | null;
  commune?: string | null;
}

export interface CompanyStatusInput {
  /** `etat_administratif` de l'unité légale ("A" actif, "C" cessée). */
  uniteLegaleEtat: string | null | undefined;
  /** SIRET 14 chiffres recherché (null si lookup par SIREN ou par nom). */
  lookupSiret: string | null;
  /** `matching_etablissements` de la réponse API. */
  matchingEtablissements: MatchingEtab[] | null | undefined;
}

export interface CompanyStatusResult {
  /** Statut ENTREPRISE (unité légale) — false = radiée. */
  is_active: boolean;
  /** true si le SIRET exact vérifié correspond à un établissement fermé
   *  alors que l'entreprise reste active (transfert / antenne fermée). */
  etablissement_ferme: boolean;
  etablissement_ferme_date: string | null;
  /** Adresse de l'établissement exact vérifié quand il est actif (souvent
   *  celle du devis — plus juste que le siege parfois périmé de l'API). */
  etab_adresse: string | null;
  etab_ville: string | null;
  status_source: "unite_legale" | "matching_etablissement" | "unite_legale_seule";
}

export function resolveCompanyStatus(input: CompanyStatusInput): CompanyStatusResult {
  const ulActive = input.uniteLegaleEtat === "A";

  // 1. Unité légale cessée = radiée, point final.
  if (!ulActive) {
    return {
      is_active: false,
      etablissement_ferme: false,
      etablissement_ferme_date: null,
      etab_adresse: null,
      etab_ville: null,
      status_source: "unite_legale",
    };
  }

  // 2. Établissement exact du SIRET vérifié, si disponible.
  if (input.lookupSiret && /^\d{14}$/.test(input.lookupSiret)) {
    const etab = (input.matchingEtablissements ?? []).find(
      (m) => (m.siret ?? "").replace(/\s/g, "") === input.lookupSiret,
    );
    if (etab) {
      const etabFerme = etab.etat_administratif === "F" || !!etab.date_fermeture;
      return {
        is_active: true,
        etablissement_ferme: etabFerme,
        etablissement_ferme_date: etab.date_fermeture ?? null,
        etab_adresse: etabFerme ? null : (etab.adresse ?? null),
        etab_ville: etabFerme ? null : (etab.libelle_commune ?? etab.commune ?? null),
        status_source: "matching_etablissement",
      };
    }
  }

  // 3. Unité légale active, pas d'info établissement exploitable → active.
  //    L'état du `siege` de l'API n'est volontairement PAS consulté ici.
  return {
    is_active: true,
    etablissement_ferme: false,
    etablissement_ferme_date: null,
    etab_adresse: null,
    etab_ville: null,
    status_source: "unite_legale_seule",
  };
}
