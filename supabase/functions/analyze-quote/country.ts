/**
 * V3.4.14 (2026-05-16) — Détection devis étranger.
 *
 * Le catalogue marché, les vérifications SIRET/RGE/RNE et l'analyse financière
 * sont tous calibrés sur la réglementation FRANÇAISE. Un devis belge (TVA 6% réno,
 * IBAN BE, SIRET inexistant) comparé à ce catalogue produit des +1500€ fantômes
 * et des verdicts incohérents.
 *
 * Cette fonction agrège 4 signaux pour décider du `country_code` :
 *   1. Préfixe TVA / SIRET ("BE...", "LU...", "FR..." ou 14 chiffres)
 *   2. Préfixe IBAN (BE86, FR76, LU28, CH56, DE89...)
 *   3. Mots-clés pays dans l'adresse entreprise
 *   4. Taux TVA non-français (BE: 6/21, LU: 17, CH: 7.7, DE: 19)
 *
 * Pondération : IBAN + TVA préfixe > adresse > taux TVA seul. Un seul signal
 * "fort" (IBAN BE OU TVA BE) suffit à classer en BE. Un seul signal faible
 * (taux 6%) ne suffit pas seul (peut être une niche fiscale FR mal extraite).
 */

type CountryCode = "FR" | "BE" | "LU" | "CH" | "DE" | "ES" | "IT" | "GB" | "NL" | "OTHER";

const COUNTRY_LABELS: Record<CountryCode, string> = {
  FR: "France",
  BE: "Belgique",
  LU: "Luxembourg",
  CH: "Suisse",
  DE: "Allemagne",
  ES: "Espagne",
  IT: "Italie",
  GB: "Royaume-Uni",
  NL: "Pays-Bas",
  OTHER: "étranger",
};

const COUNTRY_PREFIXES: CountryCode[] = ["FR", "BE", "LU", "CH", "DE", "ES", "IT", "GB", "NL"];

/** Mots-clés d'adresse — case insensitive */
const ADDRESS_KEYWORDS: Record<Exclude<CountryCode, "FR" | "OTHER">, RegExp> = {
  BE: /\b(belgique|belgi[eë]|belgium)\b/i,
  LU: /\b(luxembourg|lëtzebuerg)\b/i,
  CH: /\b(suisse|schweiz|svizzera|switzerland)\b/i,
  DE: /\b(allemagne|deutschland|germany)\b/i,
  ES: /\b(espagne|españa|spain)\b/i,
  IT: /\b(italie|italia|italy)\b/i,
  GB: /\b(royaume[- ]uni|angleterre|united kingdom|england)\b/i,
  NL: /\b(pays[- ]bas|nederland|holland|netherlands)\b/i,
};

/**
 * Taux TVA "signatures" non françaises.
 * Les taux FR autorisés sont 20, 10, 5.5, 2.1, 0 (DOM-TOM séparés).
 * Tout autre taux entier ou demi-entier indique souvent un autre pays.
 *
 * Note : la TVA est un signal FAIBLE — utilisée uniquement pour ré-confirmer
 * un autre signal plus fort (IBAN/TVA préfixe/adresse), jamais seule.
 */
const NON_FR_VAT_RATES: Record<Exclude<CountryCode, "FR" | "OTHER">, number[]> = {
  BE: [6, 12, 21],     // 6 réno, 12 logement social, 21 standard
  LU: [3, 8, 14, 17],  // 17 standard LU
  CH: [2.6, 3.8, 8.1], // 8.1 standard CH (depuis 2024)
  DE: [7, 19],         // 19 standard DE
  ES: [4, 10, 21],     // 21 standard ES
  IT: [4, 10, 22],     // 22 standard IT
  GB: [5, 20],         // 20 standard GB (mais conflit avec FR 20)
  NL: [9, 21],         // 21 standard NL
};

const FR_VAT_RATES = new Set([0, 2.1, 5.5, 10, 20]);

/**
 * Extrait le préfixe pays (2 lettres) d'une chaîne (TVA, SIRET, IBAN).
 * Retourne null si pas de préfixe alphabétique reconnu.
 */
function extractCountryPrefix(raw: string | null | undefined): CountryCode | null {
  if (!raw) return null;
  const clean = raw.replace(/\s/g, "").toUpperCase();
  if (clean.length < 4) return null;
  const prefix = clean.substring(0, 2);
  // SIRET français = 14 chiffres, pas de préfixe alpha
  if (/^\d+$/.test(clean)) return /^\d{9,14}$/.test(clean) ? "FR" : null;
  if (COUNTRY_PREFIXES.includes(prefix as CountryCode)) {
    return prefix as CountryCode;
  }
  return null;
}

export interface CountryDetectionResult {
  country_code: CountryCode;
  country_label: string;
  is_foreign: boolean;
  signals: {
    iban_prefix: string | null;
    tva_prefix: string | null;
    address_match: string | null;
    vat_rate: number | null;
    vat_rate_country: string | null;
  };
}

/**
 * Détecte le pays d'origine du devis depuis les données extraites par Gemini.
 *
 * Logique de décision :
 *   1. Si IBAN préfixe ≠ FR ET cohérent (BE/LU/CH/DE...) → ce pays gagne.
 *   2. Sinon si TVA/SIRET préfixe ≠ FR → ce pays gagne.
 *   3. Sinon si adresse contient mot-clé pays étranger → ce pays gagne.
 *   4. Sinon si taux TVA non-FR + AU MOINS un autre signal cohérent → ce pays gagne.
 *   5. Par défaut → FR (le tool est calibré FR).
 *
 * Un signal IBAN "BE" + adresse "Belgique" + TVA "BE..." = très haute confiance.
 * Un signal IBAN "BE" seul = haute confiance (les IBAN ne sont pas inventés).
 * Un taux TVA 6% seul (sans autre signal) → reste FR (peut être DOM-TOM mal extrait).
 */
export function detectQuoteCountry(extracted: any): CountryDetectionResult {
  const entreprise = extracted?.entreprise || {};
  const totaux = extracted?.totaux || {};

  const iban: string | null = typeof entreprise.iban === "string" ? entreprise.iban : null;
  const siret: string | null = typeof entreprise.siret === "string" ? entreprise.siret : null;
  // La TVA peut être stockée séparément ou collée dans le SIRET selon Gemini
  const tvaIntracom: string | null = typeof entreprise.tva_intracom === "string"
    ? entreprise.tva_intracom
    : (siret && /^[A-Z]{2}/.test(siret.toUpperCase()) ? siret : null);
  const adresse: string = typeof entreprise.adresse === "string" ? entreprise.adresse : "";
  const tauxTva: number | null = typeof totaux.taux_tva === "number" ? totaux.taux_tva : null;

  const ibanCountry = extractCountryPrefix(iban);
  const tvaCountry = extractCountryPrefix(tvaIntracom);

  let addressCountry: CountryCode | null = null;
  for (const [code, regex] of Object.entries(ADDRESS_KEYWORDS) as [Exclude<CountryCode, "FR" | "OTHER">, RegExp][]) {
    if (regex.test(adresse)) {
      addressCountry = code;
      break;
    }
  }

  let vatRateCountry: CountryCode | null = null;
  if (tauxTva !== null && !FR_VAT_RATES.has(tauxTva)) {
    for (const [code, rates] of Object.entries(NON_FR_VAT_RATES) as [Exclude<CountryCode, "FR" | "OTHER">, number[]][]) {
      if (rates.includes(tauxTva)) {
        vatRateCountry = code;
        break;
      }
    }
  }

  const signals = {
    iban_prefix: ibanCountry,
    tva_prefix: tvaCountry,
    address_match: addressCountry,
    vat_rate: tauxTva,
    vat_rate_country: vatRateCountry,
  };

  // Décision : IBAN ou TVA préfixe sont des signaux FORTS → ils gagnent seuls.
  if (ibanCountry && ibanCountry !== "FR") {
    return {
      country_code: ibanCountry,
      country_label: COUNTRY_LABELS[ibanCountry],
      is_foreign: true,
      signals,
    };
  }
  if (tvaCountry && tvaCountry !== "FR") {
    return {
      country_code: tvaCountry,
      country_label: COUNTRY_LABELS[tvaCountry],
      is_foreign: true,
      signals,
    };
  }

  // Adresse étrangère sans IBAN/TVA contradictoire → confiance modérée mais suffisante
  if (addressCountry) {
    return {
      country_code: addressCountry,
      country_label: COUNTRY_LABELS[addressCountry],
      is_foreign: true,
      signals,
    };
  }

  // Taux TVA seul : pas assez fort. On confirme seulement si au moins un autre signal
  // (même faible) pointe vers le même pays.
  if (vatRateCountry) {
    const agrees = (ibanCountry === vatRateCountry) || (tvaCountry === vatRateCountry) || (addressCountry === vatRateCountry);
    if (agrees) {
      return {
        country_code: vatRateCountry,
        country_label: COUNTRY_LABELS[vatRateCountry],
        is_foreign: true,
        signals,
      };
    }
  }

  return {
    country_code: "FR",
    country_label: COUNTRY_LABELS.FR,
    is_foreign: false,
    signals,
  };
}
