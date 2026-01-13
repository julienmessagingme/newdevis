import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const PAPPERS_API_URL = "https://api.pappers.fr/v2";
const BODACC_API_URL = "https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records";
const GOOGLE_PLACES_API_URL = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json";
const ADEME_RGE_API_URL = "https://data.ademe.fr/data-fair/api/v1/datasets/liste-des-entreprises-rge-2/lines";
const OPENIBAN_API_URL = "https://openiban.com/validate";

// ============ PAYMENT CONDITIONS ANALYSIS ============

// Payment method types
type PaymentMethod = "virement" | "cheque" | "carte_bancaire" | "especes" | "non_detecte";

interface PaymentConditionsExtraction {
  modes_paiement: PaymentMethod[];
  paiement_integral_avant_travaux: boolean;
  acompte_pourcentage: number | null;
  acompte_montant: number | null;
  montant_total: number | null;
  iban_detecte: boolean;
  details_paiement: string;
}

interface IBANVerificationResult {
  hasIBAN: boolean;
  iban?: string;
  isValid?: boolean;
  country?: string;
  countryCode?: string;
  bankName?: string;
  score: ScoringColor;
}

interface PaymentConditionsResult {
  extraction: PaymentConditionsExtraction;
  iban: IBANVerificationResult;
  score: ScoringColor;
  vigilanceCount: number;
  indicator?: CompanyIndicator;
  point_ok?: string;
  alerte?: string;
  recommandation?: string;
}

// Extract IBAN from document text using regex patterns
function extractIBANFromText(text: string): string | null {
  if (!text) return null;
  
  // Standard IBAN patterns (France: FR + 2 check digits + 23 alphanumeric)
  // General pattern for any country IBAN
  const ibanPatterns = [
    // French IBAN format: FR76 1234 5678 9012 3456 7890 123
    /\b(FR\s*\d{2}\s*(?:\d{4}\s*){5}\d{3})\b/gi,
    // General IBAN with spaces
    /\b([A-Z]{2}\s*\d{2}\s*(?:[A-Z0-9]{4}\s*)+[A-Z0-9]{1,4})\b/gi,
    // IBAN without spaces
    /\b([A-Z]{2}\d{2}[A-Z0-9]{10,30})\b/g,
  ];
  
  for (const pattern of ibanPatterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      // Clean and return first match
      const cleanIBAN = matches[0].replace(/\s/g, "").toUpperCase();
      // Validate it looks like a real IBAN (2 letters + 2 digits + more)
      if (/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(cleanIBAN) && cleanIBAN.length >= 15 && cleanIBAN.length <= 34) {
        return cleanIBAN;
      }
    }
  }
  
  return null;
}

// Verify IBAN using OpenIBAN API
async function verifyIBANWithOpenIBAN(iban: string): Promise<{
  valid: boolean;
  country?: string;
  countryCode?: string;
  bankName?: string;
  bankBIC?: string;
}> {
  try {
    const response = await fetch(`${OPENIBAN_API_URL}/${iban}?getBIC=true&validateBankCode=true`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });
    
    if (!response.ok) {
      console.error("OpenIBAN API error:", response.status);
      return { valid: false };
    }
    
    const data = await response.json();
    
    return {
      valid: data.valid === true,
      country: data.bankData?.country || undefined,
      countryCode: data.bankData?.countryCode || iban.substring(0, 2),
      bankName: data.bankData?.name || undefined,
      bankBIC: data.bankData?.bic || undefined,
    };
  } catch (error) {
    console.error("OpenIBAN verification error:", error);
    return { valid: false };
  }
}

// Analyze IBAN and return verification result
async function analyzeIBAN(documentText: string): Promise<IBANVerificationResult> {
  const result: IBANVerificationResult = {
    hasIBAN: false,
    score: "ORANGE",
  };
  
  // Extract IBAN from document
  const iban = extractIBANFromText(documentText);
  
  if (!iban) {
    return result;
  }
  
  result.hasIBAN = true;
  result.iban = iban;
  
  // Verify IBAN with OpenIBAN API
  console.log("Verifying IBAN with OpenIBAN:", iban.substring(0, 4) + "...");
  const verification = await verifyIBANWithOpenIBAN(iban);
  
  result.isValid = verification.valid;
  result.country = verification.country;
  result.countryCode = verification.countryCode || iban.substring(0, 2);
  result.bankName = verification.bankName;
  
  if (!verification.valid) {
    result.score = "ROUGE";
  } else if (result.countryCode === "FR") {
    result.score = "VERT";
  } else {
    result.score = "ORANGE";
  }
  
  return result;
}

// Extract payment conditions using AI
async function extractPaymentConditions(
  base64Content: string,
  mimeType: string,
  lovableApiKey: string
): Promise<PaymentConditionsExtraction> {
  const defaultResult: PaymentConditionsExtraction = {
    modes_paiement: [],
    paiement_integral_avant_travaux: false,
    acompte_pourcentage: null,
    acompte_montant: null,
    montant_total: null,
    iban_detecte: false,
    details_paiement: "",
  };

  try {
    const systemPrompt = `Tu es un expert en analyse de devis travaux. Tu extrais uniquement les informations présentes dans le document, sans inventer de données. Réponds uniquement avec un JSON valide.`;

    const userPrompt = `Analyse ce devis et extrais les informations relatives aux CONDITIONS DE PAIEMENT.

IMPORTANT: N'invente AUCUNE information. Si une donnée n'est pas visible, indique null ou vide.

Recherche spécifiquement:
- Modes de paiement mentionnés (virement, chèque, carte bancaire, espèces/cash/comptant)
- Si un paiement intégral est demandé AVANT le début des travaux
- Acompte demandé (en pourcentage du total ou en montant)
- Montant total du devis
- Si un IBAN est présent
- Tout détail sur les conditions de paiement (échéancier, modalités)

Retourne un JSON avec EXACTEMENT ces champs:
{
  "modes_paiement": ["virement", "cheque", "carte_bancaire", "especes"],
  "paiement_integral_avant_travaux": true/false,
  "acompte_pourcentage": 30,
  "acompte_montant": 1500,
  "montant_total": 5000,
  "iban_detecte": true/false,
  "details_paiement": "description des conditions trouvées"
}

CONTRAINTES:
- modes_paiement: uniquement les valeurs parmi "virement", "cheque", "carte_bancaire", "especes" si explicitement mentionnées
- paiement_integral_avant_travaux = true SEULEMENT si le document demande explicitement le paiement total avant travaux
- acompte_pourcentage: pourcentage de l'acompte si mentionné, sinon null
- acompte_montant: montant de l'acompte en euros si mentionné, sinon null
- Si les deux sont disponibles (% et montant), renseigne les deux
- Ne jamais déduire ou calculer le pourcentage si seul le montant est donné (et vice-versa)`;

    const aiResponse = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Content}`,
                },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      console.error("Payment conditions extraction AI error:", aiResponse.status);
      return defaultResult;
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content;

    if (!content) {
      return defaultResult;
    }

    const parsed = JSON.parse(content);
    
    // Validate and normalize payment methods
    const validMethods: PaymentMethod[] = ["virement", "cheque", "carte_bancaire", "especes"];
    const normalizedMethods: PaymentMethod[] = [];
    
    if (Array.isArray(parsed.modes_paiement)) {
      for (const method of parsed.modes_paiement) {
        const normalized = method.toLowerCase().replace(/[^a-z_]/g, "");
        if (validMethods.includes(normalized as PaymentMethod)) {
          normalizedMethods.push(normalized as PaymentMethod);
        }
      }
    }
    
    return {
      modes_paiement: normalizedMethods,
      paiement_integral_avant_travaux: Boolean(parsed.paiement_integral_avant_travaux),
      acompte_pourcentage: typeof parsed.acompte_pourcentage === "number" ? parsed.acompte_pourcentage : null,
      acompte_montant: typeof parsed.acompte_montant === "number" ? parsed.acompte_montant : null,
      montant_total: typeof parsed.montant_total === "number" ? parsed.montant_total : null,
      iban_detecte: Boolean(parsed.iban_detecte),
      details_paiement: parsed.details_paiement || "",
    };
  } catch (error) {
    console.error("Payment conditions extraction error:", error);
    return defaultResult;
  }
}

// Analyze payment conditions and calculate combined score
async function analyzePaymentConditions(
  documentText: string,
  base64Content: string,
  mimeType: string,
  lovableApiKey: string
): Promise<PaymentConditionsResult> {
  // Extract payment conditions using AI
  console.log("Extracting payment conditions...");
  const extraction = await extractPaymentConditions(base64Content, mimeType, lovableApiKey);
  
  // Analyze IBAN
  console.log("Analyzing IBAN...");
  const ibanResult = await analyzeIBAN(documentText);
  
  // Calculate acompte percentage if only amount is available
  let acomptePourcentage = extraction.acompte_pourcentage;
  if (acomptePourcentage === null && extraction.acompte_montant !== null && extraction.montant_total !== null && extraction.montant_total > 0) {
    acomptePourcentage = Math.round((extraction.acompte_montant / extraction.montant_total) * 100);
  }
  
  // Initialize vigilance counters
  let vigilanceCount = 0;
  const vigilanceReasons: string[] = [];
  const positivePoints: string[] = [];
  
  // Check payment methods
  const hasTraceable = extraction.modes_paiement.some(m => 
    ["virement", "cheque", "carte_bancaire"].includes(m)
  );
  const hasCash = extraction.modes_paiement.includes("especes");
  
  if (hasTraceable) {
    positivePoints.push("Mode de paiement traçable accepté");
  }
  
  if (hasCash) {
    vigilanceCount++;
    vigilanceReasons.push("Paiement en espèces demandé");
  }
  
  // Check IBAN
  if (ibanResult.hasIBAN) {
    if (ibanResult.isValid === false) {
      vigilanceCount++;
      vigilanceReasons.push("IBAN non valide techniquement");
    } else if (ibanResult.countryCode !== "FR") {
      vigilanceCount++;
      vigilanceReasons.push(`IBAN domicilié à l'étranger (${getCountryName(ibanResult.countryCode || "")})`);
    } else {
      positivePoints.push("IBAN valide et domicilié en France");
    }
  }
  
  // Check acompte
  if (acomptePourcentage !== null) {
    if (acomptePourcentage <= 30) {
      positivePoints.push(`Acompte raisonnable (${acomptePourcentage}%)`);
    } else if (acomptePourcentage > 50) {
      vigilanceCount++;
      vigilanceReasons.push(`Acompte élevé (${acomptePourcentage}%)`);
    } else {
      vigilanceReasons.push(`Acompte modéré (${acomptePourcentage}%)`);
    }
  }
  
  // Check full payment before work
  if (extraction.paiement_integral_avant_travaux) {
    vigilanceCount++;
    vigilanceReasons.push("Paiement intégral demandé avant travaux");
  }
  
  // Calculate combined score based on rules
  let score: ScoringColor;
  
  // ROUGE conditions
  if (
    (ibanResult.hasIBAN && ibanResult.isValid === false) || // IBAN non valide
    hasCash || // Espèces
    extraction.paiement_integral_avant_travaux || // Paiement intégral avant travaux
    vigilanceCount >= 2 // Au moins 2 critères de vigilance
  ) {
    score = "ROUGE";
  }
  // ORANGE conditions  
  else if (
    (acomptePourcentage !== null && acomptePourcentage > 30 && acomptePourcentage <= 50) || // Acompte 30-50%
    (ibanResult.hasIBAN && ibanResult.countryCode !== "FR") || // IBAN étranger
    !ibanResult.hasIBAN // Pas d'IBAN détecté (si virement mentionné)
  ) {
    score = "ORANGE";
  }
  // VERT conditions
  else if (
    hasTraceable && // Mode traçable
    (acomptePourcentage === null || acomptePourcentage <= 30) && // Acompte <= 30% ou non mentionné
    (!ibanResult.hasIBAN || (ibanResult.isValid && ibanResult.countryCode === "FR")) // Pas d'IBAN ou IBAN FR valide
  ) {
    score = "VERT";
  }
  // Default to ORANGE
  else {
    score = "ORANGE";
  }
  
  // Build result
  const result: PaymentConditionsResult = {
    extraction,
    iban: ibanResult,
    score,
    vigilanceCount,
  };
  
  // Build indicator
  const modesPaiementText = extraction.modes_paiement.length > 0
    ? extraction.modes_paiement.map(m => {
        switch (m) {
          case "virement": return "Virement";
          case "cheque": return "Chèque";
          case "carte_bancaire": return "Carte bancaire";
          case "especes": return "Espèces";
          default: return m;
        }
      }).join(", ")
    : "Non précisé";
  
  const acompteText = acomptePourcentage !== null 
    ? `${acomptePourcentage}%`
    : extraction.acompte_montant !== null 
      ? `${extraction.acompte_montant}€`
      : "Non précisé";
  
  let ibanStatusText = "Non détecté";
  if (ibanResult.hasIBAN) {
    if (ibanResult.isValid === false) {
      ibanStatusText = "Non valide";
    } else if (ibanResult.countryCode === "FR") {
      ibanStatusText = "Valide - France";
    } else {
      ibanStatusText = `Valide - ${getCountryName(ibanResult.countryCode || "")}`;
    }
  }
  
  result.indicator = {
    label: "Conditions de paiement",
    value: `${modesPaiementText} • Acompte: ${acompteText} • IBAN: ${ibanStatusText}`,
    score,
    explanation: vigilanceReasons.length > 0
      ? `Points de vigilance: ${vigilanceReasons.join(", ")}.`
      : positivePoints.length > 0
        ? `Points positifs: ${positivePoints.join(", ")}.`
        : "Conditions de paiement non précisées sur le devis."
  };
  
  // Build messages
  if (score === "VERT") {
    result.point_ok = `✓ Conditions de paiement : mode traçable${acomptePourcentage !== null ? `, acompte ${acomptePourcentage}%` : ""}${ibanResult.hasIBAN && ibanResult.countryCode === "FR" ? ", IBAN France valide" : ""}.`;
  } else if (score === "ORANGE") {
    result.alerte = `⚠️ Conditions de paiement : ${vigilanceReasons.length > 0 ? vigilanceReasons.join(", ") : "informations incomplètes"}. À vérifier avec l'artisan.`;
    result.recommandation = "Nous vous recommandons de privilégier un mode de paiement traçable et de limiter l'acompte à 30% maximum.";
  } else {
    result.alerte = `🔴 Conditions de paiement : ${vigilanceReasons.join(", ")}. Vigilance importante requise.`;
    result.recommandation = "Nous vous recommandons de privilégier un mode de paiement traçable et de limiter l'acompte à 30% maximum.";
  }
  
  return result;
}

// Helper to get country name from ISO code
function getCountryName(countryCode: string): string {
  const countries: Record<string, string> = {
    "FR": "France",
    "DE": "Allemagne",
    "BE": "Belgique",
    "CH": "Suisse",
    "ES": "Espagne",
    "IT": "Italie",
    "PT": "Portugal",
    "LU": "Luxembourg",
    "NL": "Pays-Bas",
    "AT": "Autriche",
    "GB": "Royaume-Uni",
    "IE": "Irlande",
    "PL": "Pologne",
    "CZ": "République Tchèque",
    "RO": "Roumanie",
    "BG": "Bulgarie",
    "HU": "Hongrie",
    "SK": "Slovaquie",
    "HR": "Croatie",
    "SI": "Slovénie",
    "GR": "Grèce",
    "DK": "Danemark",
    "SE": "Suède",
    "FI": "Finlande",
    "NO": "Norvège",
    "MT": "Malte",
    "CY": "Chypre",
    "EE": "Estonie",
    "LV": "Lettonie",
    "LT": "Lituanie",
  };
  return countries[countryCode] || countryCode;
}

// ============ END PAYMENT CONDITIONS ANALYSIS ============

// ============ SITE CONTEXT ANALYSIS (Géorisques) ============

const GEORISQUES_API_URL = "https://georisques.gouv.fr/api/v1";

interface GeorisqueRisk {
  num_risque: string;
  libelle_risque_long: string;
}

interface SiteContextResult {
  code_insee: string | null;
  commune: string | null;
  risques_naturels: string[];
  risques_technologiques: string[];
  zone_sismique: string | null;
  has_data: boolean;
}

// Extract INSEE code from postal code (using API geo.api.gouv.fr)
async function getInseeCodeFromPostalCode(codePostal: string): Promise<{ code_insee: string; commune: string } | null> {
  if (!codePostal || codePostal.length < 5) return null;
  
  try {
    const response = await fetch(
      `https://geo.api.gouv.fr/communes?codePostal=${codePostal}&fields=code,nom&limit=1`,
      { method: "GET" }
    );
    
    if (!response.ok) {
      console.error("Geo API error:", response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (Array.isArray(data) && data.length > 0) {
      return {
        code_insee: data[0].code,
        commune: data[0].nom
      };
    }
    
    return null;
  } catch (error) {
    console.error("Geo API error:", error);
    return null;
  }
}

// Fetch risks from Géorisques API
async function fetchGeorisquesRisks(codeInsee: string): Promise<{
  risques_naturels: string[];
  risques_technologiques: string[];
}> {
  const result = {
    risques_naturels: [] as string[],
    risques_technologiques: [] as string[],
  };
  
  try {
    const response = await fetch(
      `${GEORISQUES_API_URL}/gaspar/risques?code_insee=${codeInsee}`,
      { method: "GET" }
    );
    
    if (!response.ok) {
      console.error("Géorisques API error:", response.status);
      return result;
    }
    
    const data = await response.json();
    
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      const risques = data.data[0].risques_detail || [];
      
      // Natural risks: codes starting with 1
      // Technological risks: codes starting with 2
      for (const risque of risques as GeorisqueRisk[]) {
        const numRisque = risque.num_risque;
        const libelle = risque.libelle_risque_long;
        
        // Avoid duplicates (some sub-risks are included with main risk)
        if (numRisque.startsWith("1") && numRisque.length <= 2) {
          // Main natural risk categories only
          if (!result.risques_naturels.includes(libelle)) {
            result.risques_naturels.push(libelle);
          }
        } else if (numRisque.startsWith("2") && numRisque.length <= 2) {
          // Main technological risk categories only
          if (!result.risques_technologiques.includes(libelle)) {
            result.risques_technologiques.push(libelle);
          }
        }
      }
    }
    
    return result;
  } catch (error) {
    console.error("Géorisques risques error:", error);
    return result;
  }
}

// Fetch seismic zone from Géorisques API
async function fetchSeismicZone(codeInsee: string): Promise<string | null> {
  try {
    const response = await fetch(
      `${GEORISQUES_API_URL}/zonage_sismique?code_insee=${codeInsee}`,
      { method: "GET" }
    );
    
    if (!response.ok) {
      console.error("Géorisques sismicité API error:", response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      return data.data[0].zone_sismicite || null;
    }
    
    return null;
  } catch (error) {
    console.error("Géorisques sismicité error:", error);
    return null;
  }
}

// Main function to analyze site context
async function analyzeSiteContext(codePostal: string | null): Promise<SiteContextResult> {
  const result: SiteContextResult = {
    code_insee: null,
    commune: null,
    risques_naturels: [],
    risques_technologiques: [],
    zone_sismique: null,
    has_data: false,
  };
  
  if (!codePostal) {
    console.log("No postal code available for site context analysis");
    return result;
  }
  
  // Get INSEE code from postal code
  const inseeInfo = await getInseeCodeFromPostalCode(codePostal);
  
  if (!inseeInfo) {
    console.log("Could not get INSEE code for postal code:", codePostal);
    return result;
  }
  
  result.code_insee = inseeInfo.code_insee;
  result.commune = inseeInfo.commune;
  
  console.log(`Fetching site context for ${inseeInfo.commune} (${inseeInfo.code_insee})...`);
  
  // Fetch risks and seismic zone in parallel
  const [risquesResult, seismicZone] = await Promise.all([
    fetchGeorisquesRisks(inseeInfo.code_insee),
    fetchSeismicZone(inseeInfo.code_insee),
  ]);
  
  result.risques_naturels = risquesResult.risques_naturels;
  result.risques_technologiques = risquesResult.risques_technologiques;
  result.zone_sismique = seismicZone;
  result.has_data = risquesResult.risques_naturels.length > 0 || 
                    risquesResult.risques_technologiques.length > 0 || 
                    seismicZone !== null;
  
  console.log("Site context result:", {
    commune: result.commune,
    risques_naturels: result.risques_naturels.length,
    risques_technologiques: result.risques_technologiques.length,
    zone_sismique: result.zone_sismique
  });
  
  return result;
}

// ============ END SITE CONTEXT ANALYSIS ============

interface PriceComparisonResult {
  score: "VERT" | "ORANGE" | "ROUGE";
  prixUnitaireDevis: number;
  fourchetteBasse: number;
  fourchetteHaute: number;
  coefficient: number;
  zoneType: string;
  explication: string;
  alerte?: string;
  point_ok?: string;
}

interface TravauxReferencePrix {
  categorie_travaux: string;
  unite: string;
  prix_min_national: number;
  prix_max_national: number;
  description: string | null;
}

interface ZoneGeographique {
  prefixe_postal: string;
  type_zone: string;
  coefficient: number;
}

// Get zone coefficient from postal code
function getZoneCoefficient(codePostal: string, zones: ZoneGeographique[]): { coefficient: number; zoneType: string } {
  const prefix = codePostal.substring(0, 2);
  const zone = zones.find(z => z.prefixe_postal === prefix);
  
  if (zone) {
    return { coefficient: zone.coefficient, zoneType: zone.type_zone };
  }
  
  // Default: province (coefficient 0.90) if not found
  return { coefficient: 0.90, zoneType: "province" };
}

// Compare quote price with reference
function comparePrix(
  categorieTravaux: string,
  quantite: number,
  montantHT: number,
  codePostal: string,
  referencePrix: TravauxReferencePrix[],
  zones: ZoneGeographique[]
): PriceComparisonResult | null {
  // Find reference price for the category
  const reference = referencePrix.find(r => 
    r.categorie_travaux.toLowerCase() === categorieTravaux.toLowerCase()
  );
  
  if (!reference) {
    return null; // Category not found in reference
  }
  
  // Calculate unit price from quote
  const prixUnitaireDevis = montantHT / quantite;
  
  // Get zone coefficient
  const { coefficient, zoneType } = getZoneCoefficient(codePostal, zones);
  
  // Adjust price range with coefficient
  const fourchetteBasse = reference.prix_min_national * coefficient;
  const fourchetteHaute = reference.prix_max_national * coefficient;
  
  // Compare and determine score
  let score: "VERT" | "ORANGE" | "ROUGE";
  let explication: string;
  let alerte: string | undefined;
  let point_ok: string | undefined;
  
  const zoneLabel = zoneType === "grande_ville" ? "grande ville" : 
                    zoneType === "ville_moyenne" ? "ville moyenne" : "province";
  
  if (prixUnitaireDevis < fourchetteBasse * 0.7) {
    // More than 30% below minimum = RED (suspiciously low)
    score = "ROUGE";
    explication = `Le prix unitaire de ${prixUnitaireDevis.toFixed(2)}€/${reference.unite} est anormalement bas. ` +
      `Pour cette zone (${zoneLabel}), les prix de marché sont entre ${fourchetteBasse.toFixed(2)}€ et ${fourchetteHaute.toFixed(2)}€/${reference.unite}. ` +
      `Un prix aussi bas peut indiquer des matériaux de qualité inférieure, du travail non déclaré, ou une mauvaise estimation qui pourrait entraîner des suppléments.`;
    alerte = `🚨 Prix anormalement bas: ${prixUnitaireDevis.toFixed(2)}€/${reference.unite} (fourchette marché: ${fourchetteBasse.toFixed(2)}€-${fourchetteHaute.toFixed(2)}€)`;
  } else if (prixUnitaireDevis < fourchetteBasse) {
    // Between 70% and 100% of minimum = ORANGE (low)
    score = "ORANGE";
    explication = `Le prix unitaire de ${prixUnitaireDevis.toFixed(2)}€/${reference.unite} est en dessous de la fourchette de marché. ` +
      `Pour cette zone (${zoneLabel}), les prix sont généralement entre ${fourchetteBasse.toFixed(2)}€ et ${fourchetteHaute.toFixed(2)}€/${reference.unite}. ` +
      `Vérifiez les prestations incluses et la qualité des matériaux proposés.`;
    alerte = `⚠️ Prix bas: ${prixUnitaireDevis.toFixed(2)}€/${reference.unite} (fourchette marché: ${fourchetteBasse.toFixed(2)}€-${fourchetteHaute.toFixed(2)}€)`;
  } else if (prixUnitaireDevis <= fourchetteHaute) {
    // Within range = GREEN
    score = "VERT";
    explication = `Le prix unitaire de ${prixUnitaireDevis.toFixed(2)}€/${reference.unite} est dans la fourchette de marché. ` +
      `Pour cette zone (${zoneLabel}), les prix sont entre ${fourchetteBasse.toFixed(2)}€ et ${fourchetteHaute.toFixed(2)}€/${reference.unite}. Le prix est cohérent.`;
    point_ok = `✓ Prix cohérent: ${prixUnitaireDevis.toFixed(2)}€/${reference.unite} (fourchette marché: ${fourchetteBasse.toFixed(2)}€-${fourchetteHaute.toFixed(2)}€)`;
  } else if (prixUnitaireDevis <= fourchetteHaute * 1.3) {
    // Up to 30% above maximum = ORANGE (high)
    score = "ORANGE";
    explication = `Le prix unitaire de ${prixUnitaireDevis.toFixed(2)}€/${reference.unite} est au-dessus de la fourchette de marché. ` +
      `Pour cette zone (${zoneLabel}), les prix sont généralement entre ${fourchetteBasse.toFixed(2)}€ et ${fourchetteHaute.toFixed(2)}€/${reference.unite}. ` +
      `Ce n'est pas anormal si des prestations premium ou des matériaux haut de gamme sont inclus. Demandez des précisions.`;
    alerte = `⚠️ Prix élevé: ${prixUnitaireDevis.toFixed(2)}€/${reference.unite} (fourchette marché: ${fourchetteBasse.toFixed(2)}€-${fourchetteHaute.toFixed(2)}€)`;
  } else {
    // More than 30% above maximum = RED (excessively high)
    score = "ROUGE";
    explication = `Le prix unitaire de ${prixUnitaireDevis.toFixed(2)}€/${reference.unite} est très au-dessus du marché. ` +
      `Pour cette zone (${zoneLabel}), les prix sont entre ${fourchetteBasse.toFixed(2)}€ et ${fourchetteHaute.toFixed(2)}€/${reference.unite}. ` +
      `Sans justification claire (matériaux exceptionnels, conditions d'accès difficiles), ce prix semble excessif. Demandez un second devis.`;
    alerte = `🚨 Prix excessif: ${prixUnitaireDevis.toFixed(2)}€/${reference.unite} (fourchette marché: ${fourchetteBasse.toFixed(2)}€-${fourchetteHaute.toFixed(2)}€)`;
  }
  
  return {
    score,
    prixUnitaireDevis,
    fourchetteBasse,
    fourchetteHaute,
    coefficient,
    zoneType,
    explication,
    alerte,
    point_ok
  };
}

// ============ END PRICE COMPARISON ============

// ============ ASSURANCES DETECTION (AI-based) ============

// Work types where décennale is critical
const DECENNALE_CRITICAL_WORK_TYPES = [
  // Roof / structure
  "toiture", "charpente", "couverture", "toiture_tuiles",
  // Heavy construction / structure
  "gros_oeuvre", "structure", "fondation", "maconnerie", "maconnerie_lourde",
  // Waterproofing
  "etancheite", "etancheite_facade", "etancheite_toiture",
  // Facade with waterproofing
  "facade", "facade_ravalement", "ravalement",
  // Exterior joinery
  "menuiserie_exterieure", "menuiserie_fenetre", "fenetre", "porte_exterieure",
  "baie_vitree", "veranda",
  // Pool / heavy masonry
  "piscine", "piscine_maconnee",
  // Heavy renovation
  "renovation_lourde", "renovation_globale", "extension", "surelevation",
];

// Keywords for critical décennale detection in text
const DECENNALE_CRITICAL_KEYWORDS = [
  // Roof / structure
  "toiture", "charpente", "couverture", "tuiles", "ardoises", "toit",
  // Heavy construction
  "gros œuvre", "gros oeuvre", "structure porteuse", "fondation", "maçonnerie",
  "mur porteur", "dalle", "plancher béton",
  // Waterproofing
  "étanchéité", "etancheite", "imperméabilisation",
  // Facade
  "façade", "facade", "ravalement", "enduit extérieur",
  // Exterior joinery
  "fenêtre", "fenetre", "porte extérieure", "baie vitrée", "véranda", "veranda",
  "menuiserie extérieure", "volet",
  // Pool
  "piscine",
  // Heavy renovation
  "extension", "surélévation", "surelevation", "agrandissement",
];

interface AssuranceExtraction {
  decennale_mentionnee: boolean;
  rcpro_mentionnee: boolean;
  assureur: string;
  numero_contrat: string;
  date_debut: string;
  date_fin: string;
  activites_couvertes: string;
  coherence_dates: "OK" | "INCOMPLET" | "INCOHERENT";
  coherence_activite: "OK" | "DOUTE" | "INCOHERENT" | "INDISPONIBLE";
}

interface AssuranceResult {
  decennale: {
    mentionnee: boolean;
    critique: boolean;
    score: ScoringColor;
    assureur?: string;
    numero_contrat?: string;
    date_fin?: string;
    coherence_dates: string;
    coherence_activite: string;
  };
  rcpro: {
    mentionnee: boolean;
    score: ScoringColor;
    assureur?: string;
  };
  globalScore: ScoringColor;
  point_ok?: string;
  alerte?: string;
  recommandation?: string;
}

// Determine if décennale is critical based on work type
function isDecennaleCritical(categorieTravaux: string | null, rawText: string | null): boolean {
  // Check by category first
  if (categorieTravaux) {
    const normalizedCategory = categorieTravaux.toLowerCase().replace(/[\s-]/g, "_");
    if (DECENNALE_CRITICAL_WORK_TYPES.some(type => 
      normalizedCategory.includes(type) || type.includes(normalizedCategory)
    )) {
      return true;
    }
  }
  
  // Check by keywords in document text
  if (rawText) {
    const normalizedText = rawText.toLowerCase();
    for (const keyword of DECENNALE_CRITICAL_KEYWORDS) {
      if (normalizedText.includes(keyword.toLowerCase())) {
        return true;
      }
    }
  }
  
  return false;
}

// Extract assurance information using AI
async function extractAssuranceInfo(
  base64Content: string,
  mimeType: string,
  lovableApiKey: string
): Promise<AssuranceExtraction> {
  const defaultResult: AssuranceExtraction = {
    decennale_mentionnee: false,
    rcpro_mentionnee: false,
    assureur: "",
    numero_contrat: "",
    date_debut: "",
    date_fin: "",
    activites_couvertes: "",
    coherence_dates: "INCOMPLET",
    coherence_activite: "INDISPONIBLE",
  };

  try {
    const systemPrompt = `Tu es un expert en analyse de devis travaux et en vérification d'assurances professionnelles (décennale, RC Pro). 
Tu extrais uniquement les informations présentes dans le document, sans inventer de données.
Réponds uniquement avec un JSON valide.`;

    const userPrompt = `Analyse ce devis et extrais les informations relatives aux ASSURANCES de l'entreprise.

IMPORTANT: N'invente AUCUNE information. Si une donnée n'est pas visible, laisse le champ vide.

Recherche spécifiquement:
- Mentions d'assurance décennale / garantie décennale
- Mentions d'assurance responsabilité civile professionnelle (RC Pro)
- Nom de l'assureur (compagnie d'assurance)
- Numéro de police/contrat
- Dates de validité (début et fin)
- Activités couvertes par l'assurance

Retourne un JSON avec EXACTEMENT ces champs:
{
  "decennale_mentionnee": true/false,
  "rcpro_mentionnee": true/false,
  "assureur": "nom de l'assureur ou vide",
  "numero_contrat": "numéro de police ou vide",
  "date_debut": "date de début ou vide",
  "date_fin": "date de fin ou vide",
  "activites_couvertes": "description des activités couvertes ou vide",
  "coherence_dates": "OK si dates présentes et cohérentes (fin > début, fin dans le futur), INCOMPLET si dates manquantes, INCOHERENT si dates expirées ou incohérentes",
  "coherence_activite": "OK si activités correspondent aux travaux du devis, DOUTE si information partielle, INCOHERENT si activités ne correspondent pas, INDISPONIBLE si non mentionné"
}

CONTRAINTES:
- decennale_mentionnee = true SEULEMENT si le document mentionne explicitement "décennale", "garantie décennale", ou "assurance décennale"
- rcpro_mentionnee = true SEULEMENT si le document mentionne explicitement "RC Pro", "responsabilité civile professionnelle", ou "RC professionnelle"
- Ne jamais déduire ou inventer des informations
- coherence_dates = INCOMPLET si aucune date n'est mentionnée`;

    const aiResponse = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Content}`,
                },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      console.error("Assurance extraction AI error:", aiResponse.status);
      return defaultResult;
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content;

    if (!content) {
      return defaultResult;
    }

    const parsed = JSON.parse(content);
    return {
      decennale_mentionnee: Boolean(parsed.decennale_mentionnee),
      rcpro_mentionnee: Boolean(parsed.rcpro_mentionnee),
      assureur: parsed.assureur || "",
      numero_contrat: parsed.numero_contrat || "",
      date_debut: parsed.date_debut || "",
      date_fin: parsed.date_fin || "",
      activites_couvertes: parsed.activites_couvertes || "",
      coherence_dates: parsed.coherence_dates || "INCOMPLET",
      coherence_activite: parsed.coherence_activite || "INDISPONIBLE",
    };
  } catch (error) {
    console.error("Assurance extraction error:", error);
    return defaultResult;
  }
}

// Analyze assurances and determine scores
function analyzeAssurances(
  extraction: AssuranceExtraction,
  categorieTravaux: string | null,
  rawText: string | null
): AssuranceResult {
  const decennaleCritique = isDecennaleCritical(categorieTravaux, rawText);
  
  // Décennale scoring
  let decennaleScore: ScoringColor;
  
  if (decennaleCritique) {
    // Décennale is critical for this type of work
    if (extraction.decennale_mentionnee) {
      if (extraction.coherence_dates === "OK" && extraction.coherence_activite === "OK") {
        decennaleScore = "VERT";
      } else if (extraction.coherence_dates === "INCOHERENT" || extraction.coherence_activite === "INCOHERENT") {
        decennaleScore = "ROUGE";
      } else {
        decennaleScore = "ORANGE";
      }
    } else {
      decennaleScore = "ROUGE";
    }
  } else {
    // Décennale is not critical
    if (extraction.decennale_mentionnee) {
      if (extraction.coherence_dates === "INCOHERENT") {
        decennaleScore = "ROUGE";
      } else {
        decennaleScore = "VERT";
      }
    } else {
      decennaleScore = "ORANGE";
    }
  }
  
  // RC Pro scoring
  let rcproScore: ScoringColor;
  
  if (extraction.rcpro_mentionnee) {
    if (extraction.coherence_dates === "INCOHERENT") {
      rcproScore = "ROUGE";
    } else {
      rcproScore = "VERT";
    }
  } else {
    rcproScore = "ORANGE";
  }
  
  // Global assurance score (worst of the two)
  let globalScore: ScoringColor;
  if (decennaleScore === "ROUGE" || rcproScore === "ROUGE") {
    globalScore = "ROUGE";
  } else if (decennaleScore === "ORANGE" || rcproScore === "ORANGE") {
    globalScore = "ORANGE";
  } else {
    globalScore = "VERT";
  }
  
  const result: AssuranceResult = {
    decennale: {
      mentionnee: extraction.decennale_mentionnee,
      critique: decennaleCritique,
      score: decennaleScore,
      assureur: extraction.assureur || undefined,
      numero_contrat: extraction.numero_contrat || undefined,
      date_fin: extraction.date_fin || undefined,
      coherence_dates: extraction.coherence_dates,
      coherence_activite: extraction.coherence_activite,
    },
    rcpro: {
      mentionnee: extraction.rcpro_mentionnee,
      score: rcproScore,
      assureur: extraction.assureur || undefined,
    },
    globalScore,
    recommandation: "📋 Demandez l'attestation d'assurance (PDF) à jour indiquant les dates de validité et l'activité couverte.",
  };
  
  // Generate point_ok or alerte messages
  if (globalScore === "VERT") {
    result.point_ok = `🟢 Assurances : ${extraction.decennale_mentionnee ? "Décennale mentionnée" : ""}${extraction.decennale_mentionnee && extraction.rcpro_mentionnee ? " + " : ""}${extraction.rcpro_mentionnee ? "RC Pro mentionnée" : ""} sur le devis.`;
  } else if (globalScore === "ORANGE") {
    const parts: string[] = [];
    if (!extraction.decennale_mentionnee) parts.push("décennale non mentionnée");
    if (!extraction.rcpro_mentionnee) parts.push("RC Pro non mentionnée");
    if (extraction.coherence_dates === "INCOMPLET") parts.push("dates incomplètes");
    result.alerte = `⚠️ Assurances : ${parts.join(", ")}. Demandez l'attestation d'assurance à l'artisan.`;
  } else {
    const parts: string[] = [];
    if (!extraction.decennale_mentionnee && decennaleCritique) {
      parts.push("décennale non mentionnée (obligatoire pour ce type de travaux)");
    }
    if (extraction.coherence_dates === "INCOHERENT") parts.push("dates incohérentes ou expirées");
    if (extraction.coherence_activite === "INCOHERENT") parts.push("activités non couvertes");
    result.alerte = `🔴 Assurances : ${parts.join(", ")}. Vérification impérative de l'attestation d'assurance.`;
  }
  
  return result;
}

// ============ END ASSURANCES DETECTION ============

// ============ QUALIBAT DETECTION (AI-based) ============
interface QualibatResult {
  hasQualibat: boolean;
  score: "VERT" | "ORANGE";
  indicator?: CompanyIndicator;
  point_ok?: string;
  alerte?: string;
}

function detectQualibatFromText(rawText: string): QualibatResult {
  const result: QualibatResult = {
    hasQualibat: false,
    score: "ORANGE",
  };

  if (!rawText || rawText.length === 0) {
    return result;
  }

  // Normalize text for search
  const normalizedText = rawText.toLowerCase();

  // Patterns to detect QUALIBAT mentions
  const qualibatPatterns = [
    /qualibat/i,
    /certif[\.\s]*qualibat/i,
    /qualification\s*qualibat/i,
    /n°\s*qualibat/i,
    /numero\s*qualibat/i,
    /numéro\s*qualibat/i,
    /qualibat\s*n°/i,
    /qualibat\s*\d+/i,
    /\bqb\s*\d+/i, // QB followed by numbers (QUALIBAT reference format)
  ];

  for (const pattern of qualibatPatterns) {
    if (pattern.test(rawText)) {
      result.hasQualibat = true;
      result.score = "VERT";
      break;
    }
  }

  if (result.hasQualibat) {
    result.indicator = {
      label: "Qualification QUALIBAT",
      value: "Mention détectée sur le devis",
      score: "VERT",
      explanation: "Une mention QUALIBAT a été détectée sur le devis. QUALIBAT est un organisme de qualification et certification du bâtiment. Cette certification volontaire atteste des compétences professionnelles de l'entreprise."
    };
    result.point_ok = "🟢 Qualification QUALIBAT : mention détectée sur le devis. Certification volontaire attestant des compétences professionnelles.";
  } else {
    result.indicator = {
      label: "Qualification QUALIBAT",
      value: "Aucune mention détectée",
      score: "ORANGE",
      explanation: "Aucune mention QUALIBAT n'a été détectée sur le devis fourni. QUALIBAT est une certification volontaire et non obligatoire. Son absence ne préjuge pas de la qualité de l'artisan."
    };
    result.alerte = "⚠️ Qualification QUALIBAT : aucune mention détectée sur le devis fourni. Cette certification est volontaire et non obligatoire.";
  }

  return result;
}
// ============ END QUALIBAT DETECTION ============

// ============ RGE VERIFICATION (ADEME) ============

// List of work types that require/benefit from RGE qualification
const RGE_RELEVANT_WORK_TYPES = [
  // Isolation
  "isolation_combles",
  "isolation_murs",
  "isolation_planchers",
  "isolation_toiture",
  "isolation",
  // Heat pumps
  "chauffage_pac",
  "pompe_chaleur",
  "pac_air_eau",
  "pac_air_air",
  // Condensation boilers
  "chaudiere_condensation",
  "chaudiere_gaz",
  // Thermodynamic water heater
  "chauffe_eau_thermodynamique",
  "ballon_thermodynamique",
  // Solar panels
  "panneaux_solaires",
  "photovoltaique",
  "solaire_thermique",
  // Ventilation
  "vmc_double_flux",
  "ventilation",
  "vmc",
  // Global energy renovation
  "renovation_energetique",
  "renovation_globale",
  "performance_energetique",
];

// Keywords to detect RGE-relevant work in document text
const RGE_RELEVANT_KEYWORDS = [
  // Isolation
  "isolation", "isolant", "laine de verre", "laine de roche", "polystyrène",
  "combles", "rampants", "ite", "iti", "isolation thermique",
  // Heat pumps
  "pompe à chaleur", "pompe a chaleur", "pac", "air-eau", "air-air",
  "géothermie", "aérothermie",
  // Condensation boilers
  "chaudière à condensation", "chaudiere a condensation", "chaudière condensation",
  "chaudière gaz", "chaudiere gaz",
  // Thermodynamic water heater
  "chauffe-eau thermodynamique", "chauffe eau thermodynamique",
  "ballon thermodynamique", "ecs thermodynamique",
  // Solar panels
  "panneau solaire", "panneaux solaires", "photovoltaïque", "photovoltaique",
  "solaire thermique", "capteur solaire",
  // Ventilation
  "vmc double flux", "ventilation double flux",
  // Global energy renovation
  "rénovation énergétique", "renovation energetique", "performance énergétique",
  "maprimerénov", "maprimerenov", "prime énergie", "cee", "éco-ptz", "eco ptz",
];

interface RGEResult {
  isRGE: boolean;
  qualifications: string[];
  score: ScoringColor | "NON_REQUIS";
  status: "OUI" | "NON" | "INDISPONIBLE" | "NON_REQUIS";
  isRelevant: boolean;
  indicator?: CompanyIndicator;
  point_ok?: string;
  alerte?: string;
}

// Determine if RGE is relevant based on work type
function isRGERelevantForWorkType(categorieTravaux: string | null, rawText: string | null): boolean {
  // Check by category first
  if (categorieTravaux) {
    const normalizedCategory = categorieTravaux.toLowerCase().replace(/[\s-]/g, "_");
    if (RGE_RELEVANT_WORK_TYPES.some(type => normalizedCategory.includes(type) || type.includes(normalizedCategory))) {
      return true;
    }
  }
  
  // Check by keywords in document text
  if (rawText) {
    const normalizedText = rawText.toLowerCase();
    for (const keyword of RGE_RELEVANT_KEYWORDS) {
      if (normalizedText.includes(keyword.toLowerCase())) {
        return true;
      }
    }
  }
  
  return false;
}

async function checkRGEQualification(siret: string, categorieTravaux: string | null, rawText: string | null): Promise<RGEResult> {
  // First, check if RGE is relevant for this type of work
  const isRelevant = isRGERelevantForWorkType(categorieTravaux, rawText);
  
  if (!isRelevant) {
    // RGE not required for this type of work - return neutral status
    return {
      isRGE: false,
      qualifications: [],
      score: "NON_REQUIS",
      status: "NON_REQUIS",
      isRelevant: false,
      indicator: {
        label: "Qualification RGE",
        value: "Non requise pour ce type de travaux",
        score: "VERT", // Display as green since it's not a problem
        explanation: "La qualification RGE n'est pas requise pour ce type de travaux. Elle est pertinente uniquement pour les travaux liés à la rénovation énergétique (isolation, pompe à chaleur, chaudière à condensation, panneaux solaires, VMC double flux, etc.)."
      },
      point_ok: "✓ Qualification RGE : non requise pour ce type de travaux (travaux hors périmètre rénovation énergétique)."
    };
  }

  // RGE is relevant - proceed with verification
  const result: RGEResult = {
    isRGE: false,
    qualifications: [],
    score: "ORANGE",
    status: "NON",
    isRelevant: true,
  };

  // Clean SIRET - remove spaces
  const cleanSiret = siret.replace(/\s/g, "");
  
  // Extract SIREN (first 9 digits) for search
  const siren = cleanSiret.substring(0, 9);
  
  if (siren.length < 9 || !/^\d{9}$/.test(siren)) {
    console.log("Invalid SIREN for RGE check:", siren);
    result.status = "INDISPONIBLE";
    result.indicator = {
      label: "Qualification RGE",
      value: "Vérification impossible",
      score: "ORANGE",
      explanation: "Impossible de vérifier la qualification RGE : le numéro SIRET/SIREN est invalide ou incomplet. Pour des travaux de rénovation énergétique, la qualification RGE est recommandée pour bénéficier des aides de l'État."
    };
    result.alerte = "⚠️ Qualification RGE : vérification impossible (SIRET invalide). Pour des travaux de rénovation énergétique, vérifiez manuellement sur france-renov.gouv.fr.";
    return result;
  }

  try {
    // Search by SIRET first, then by SIREN if not found
    console.log("Checking RGE qualification for SIRET:", cleanSiret, "- Work type:", categorieTravaux);
    
    // Try with full SIRET
    let response = await fetch(
      `${ADEME_RGE_API_URL}?siret=${cleanSiret}&size=100`,
      { method: "GET" }
    );

    if (!response.ok) {
      console.log("ADEME RGE API error:", response.status);
      result.status = "INDISPONIBLE";
      result.indicator = {
        label: "Qualification RGE",
        value: "Service indisponible",
        score: "ORANGE",
        explanation: "Le service de vérification RGE (ADEME) est temporairement indisponible. Vous pouvez vérifier manuellement la qualification RGE sur france-renov.gouv.fr. La qualification RGE est importante pour les travaux de rénovation énergétique."
      };
      result.alerte = "⚠️ Qualification RGE : service de vérification indisponible. Vérifiez manuellement sur france-renov.gouv.fr.";
      return result;
    }

    let data = await response.json();
    let results = data.results || [];
    
    // If no results with SIRET, try with SIREN
    if (results.length === 0) {
      console.log("No RGE found with SIRET, trying with SIREN:", siren);
      response = await fetch(
        `${ADEME_RGE_API_URL}?siren=${siren}&size=100`,
        { method: "GET" }
      );
      
      if (response.ok) {
        data = await response.json();
        results = data.results || [];
      }
    }

    if (results.length === 0) {
      // No RGE qualification found - important for energy renovation works
      result.status = "NON";
      result.score = "ORANGE";
      result.indicator = {
        label: "Qualification RGE",
        value: "Non référencé RGE",
        score: "ORANGE",
        explanation: "L'entreprise n'est pas référencée dans l'annuaire des professionnels RGE. Pour des travaux de rénovation énergétique, la qualification RGE est obligatoire pour bénéficier des aides de l'État (MaPrimeRénov', CEE, Éco-PTZ). Cela ne préjuge pas de la qualité de l'artisan."
      };
      result.alerte = "⚠️ Qualification RGE : Non (artisan non référencé RGE à ce jour). Pour des travaux de rénovation énergétique, la qualification RGE est requise pour bénéficier des aides de l'État.";
      
      return result;
    }

    // RGE qualification found!
    result.isRGE = true;
    result.score = "VERT";
    result.status = "OUI";
    
    // Collect all qualifications
    const qualificationsSet = new Set<string>();
    
    for (const rge of results) {
      const qualifName = rge.nom_qualification || rge.libelle_qualification || rge.qualification || "";
      if (qualifName) {
        qualificationsSet.add(qualifName);
      }
    }
    
    result.qualifications = Array.from(qualificationsSet);
    
    // Format display text
    const qualifDisplay = result.qualifications.length > 0 
      ? result.qualifications.slice(0, 3).join(", ") + (result.qualifications.length > 3 ? ` (+${result.qualifications.length - 3} autres)` : "")
      : "Qualification(s) RGE";
    
    result.indicator = {
      label: "Qualification RGE",
      value: `Oui (${result.qualifications.length} qualification${result.qualifications.length > 1 ? 's' : ''})`,
      score: "VERT",
      explanation: `L'entreprise est référencée dans l'annuaire officiel des professionnels RGE (France Rénov' / ADEME). ${qualifDisplay}. Cette qualification permet aux clients de bénéficier des aides de l'État pour leurs travaux de rénovation énergétique.`
    };
    
    result.point_ok = `🟢 Qualification RGE : Oui (artisan reconnu par France Rénov'). ${result.qualifications.length} qualification${result.qualifications.length > 1 ? 's' : ''} active${result.qualifications.length > 1 ? 's' : ''}.`;
    
    console.log("RGE qualification found:", result.qualifications);
    
    return result;
  } catch (error) {
    console.error("ADEME RGE API error:", error);
    result.status = "INDISPONIBLE";
    result.indicator = {
      label: "Qualification RGE",
      value: "Erreur de vérification",
      score: "ORANGE",
      explanation: "Une erreur s'est produite lors de la vérification RGE. Vous pouvez vérifier manuellement sur france-renov.gouv.fr."
    };
    result.alerte = "⚠️ Qualification RGE : erreur lors de la vérification. Vérifiez manuellement sur france-renov.gouv.fr.";
    return result;
  }
}
// ============ END RGE VERIFICATION ============

interface BodaccResult {
  hasProcedure: boolean;
  procedures: string[];
  alertes: string[];
  points_ok: string[];
}

async function checkBodaccProcedures(siren: string): Promise<BodaccResult> {
  const result: BodaccResult = {
    hasProcedure: false,
    procedures: [],
    alertes: [],
    points_ok: [],
  };

  try {
    // Search BODACC for the company using SIREN
    const searchQuery = encodeURIComponent(`registre:${siren}`);
    const response = await fetch(
      `${BODACC_API_URL}?limit=20&where=${searchQuery}`,
      { method: "GET" }
    );

    if (!response.ok) {
      console.log("BODACC API error:", response.status);
      return result;
    }

    const data = await response.json();
    const records = data.results || [];

    if (records.length === 0) {
      result.points_ok.push("✓ Aucune annonce BODACC trouvée (pas de procédure collective publiée)");
      return result;
    }

    // Check for collective procedures in the announcements
    const procedureKeywords = [
      "liquidation judiciaire",
      "redressement judiciaire",
      "sauvegarde",
      "plan de cession",
      "jugement d'ouverture",
      "jugement de clôture pour insuffisance d'actif",
    ];

    for (const record of records) {
      const annonce = record.contenu || record.annonce || "";
      const nature = record.nature || record.familleavis || "";
      const datePublication = record.dateparution || record.date_publication || "";

      const annonceText = `${annonce} ${nature}`.toLowerCase();

      for (const keyword of procedureKeywords) {
        if (annonceText.includes(keyword)) {
          result.hasProcedure = true;
          const procedureInfo = `${keyword.charAt(0).toUpperCase() + keyword.slice(1)} (publié le ${datePublication})`;
          if (!result.procedures.includes(procedureInfo)) {
            result.procedures.push(procedureInfo);
          }
        }
      }
    }

    if (result.hasProcedure) {
      result.alertes.push(`🚨 ALERTE BODACC: Procédure(s) collective(s) détectée(s): ${result.procedures.join(", ")}`);
    } else {
      // Check if there are announcements but no procedures
      result.points_ok.push(`✓ ${records.length} annonce(s) BODACC trouvée(s) mais aucune procédure collective en cours`);
    }

    return result;
  } catch (error) {
    console.error("BODACC API error:", error);
    return result;
  }
}

interface PappersCompanyInfo {
  siren: string;
  nom_entreprise: string;
  date_creation: string;
  date_cessation?: string;
  forme_juridique?: string;
  capital?: number;
  effectif?: string;
  code_naf?: string;
  procedure_collective?: boolean;
  siege?: {
    adresse_ligne_1?: string;
    adresse_ligne_2?: string;
    code_postal?: string;
    ville?: string;
  };
  derniers_comptes?: {
    date_cloture: string;
    capitaux_propres?: number;
    resultat?: number;
    chiffre_affaires?: number;
  };
  comptes?: Array<{
    date_cloture: string;
    date_depot: string;
    capitaux_propres?: number;
    resultat?: number;
    chiffre_affaires?: number;
  }>;
}

// Scoring colors for company indicators
type ScoringColor = "VERT" | "ORANGE" | "ROUGE";

interface CompanyIndicator {
  label: string;
  value: string;
  score: ScoringColor;
  explanation: string;
}

interface CompanyAnalysis {
  found: boolean;
  siren?: string;
  nom_entreprise?: string;
  adresse?: string;
  ville?: string;
  anciennete_years?: number;
  anciennete_score?: ScoringColor;
  bilans_count?: number;
  bilans_score?: ScoringColor;
  capitaux_propres?: number;
  capitaux_propres_score?: ScoringColor;
  procedure_collective?: boolean;
  google_rating?: number;
  google_reviews_count?: number;
  google_rating_score?: ScoringColor;
  indicators: CompanyIndicator[];
  alertes: string[];
  points_ok: string[];
}

// ============ GOOGLE PLACES API ============
interface GooglePlacesResult {
  found: boolean;
  name?: string;
  rating?: number;
  user_ratings_total?: number;
  score?: ScoringColor;
  indicator?: CompanyIndicator;
}

async function getGooglePlacesRating(
  raisonSociale: string,
  adresse: string,
  ville: string
): Promise<GooglePlacesResult> {
  const googleApiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
  
  if (!googleApiKey) {
    console.log("Google Places API key not configured");
    return { found: false };
  }

  // Build search query combining company name, address and city
  const searchInput = `${raisonSociale} ${adresse} ${ville}`.trim();
  
  if (!searchInput || searchInput.length < 3) {
    console.log("Insufficient data for Google Places search");
    return { found: false };
  }

  try {
    const params = new URLSearchParams({
      input: searchInput,
      inputtype: "textquery",
      fields: "name,rating,user_ratings_total",
      key: googleApiKey,
    });

    console.log("Searching Google Places for:", searchInput);
    
    const response = await fetch(`${GOOGLE_PLACES_API_URL}?${params.toString()}`, {
      method: "GET",
    });

    if (!response.ok) {
      console.error("Google Places API error:", response.status);
      return { found: false };
    }

    const data = await response.json();
    console.log("Google Places API response:", JSON.stringify(data));

    if (data.status !== "OK" || !data.candidates || data.candidates.length === 0) {
      console.log("No results found in Google Places");
      return { found: false };
    }

    const place = data.candidates[0];
    const rating = place.rating;
    const reviewsCount = place.user_ratings_total || 0;

    // No rating available or no reviews
    if (rating === undefined || rating === null || reviewsCount === 0) {
      return {
        found: true,
        name: place.name,
        rating: undefined,
        user_ratings_total: reviewsCount,
        score: "ORANGE",
        indicator: {
          label: "Réputation en ligne",
          value: "Aucun avis disponible",
          score: "ORANGE",
          explanation: "L'entreprise n'a pas encore d'avis clients sur Google. Cela ne préjuge pas de sa qualité de service. Les avis Google sont publics et peuvent évoluer dans le temps."
        }
      };
    }

    // Determine score based on rating according to specified thresholds
    let score: ScoringColor;
    let explanation: string;
    
    if (rating > 4.5) {
      score = "VERT";
      explanation = `Excellente réputation en ligne avec une note de ${rating}/5 sur Google, basée sur ${reviewsCount} avis clients. Les avis Google sont publics et peuvent évoluer dans le temps.`;
    } else if (rating >= 4.0) {
      score = "ORANGE";
      explanation = `Bonne réputation en ligne avec une note de ${rating}/5 sur Google, basée sur ${reviewsCount} avis clients. Quelques axes d'amélioration possibles. Les avis Google sont publics et peuvent évoluer dans le temps.`;
    } else {
      score = "ROUGE";
      explanation = `Réputation en ligne à surveiller avec une note de ${rating}/5 sur Google, basée sur ${reviewsCount} avis clients. Il est recommandé de consulter les avis en détail avant de vous engager. Les avis Google sont publics et peuvent évoluer dans le temps.`;
    }

    const ratingDisplay = `${rating}/5 (${reviewsCount} avis Google)`;

    return {
      found: true,
      name: place.name,
      rating,
      user_ratings_total: reviewsCount,
      score,
      indicator: {
        label: "Réputation en ligne",
        value: ratingDisplay,
        score,
        explanation
      }
    };
  } catch (error) {
    console.error("Google Places API error:", error);
    return { found: false };
  }
}
// ============ END GOOGLE PLACES API ============

async function analyzeCompanyWithPappers(siret: string): Promise<CompanyAnalysis> {
  const pappersApiKey = Deno.env.get("PAPPERS_API_KEY");
  
  if (!pappersApiKey) {
    console.log("Pappers API key not configured");
    return { found: false, alertes: [], points_ok: [], indicators: [] };
  }

  // Extract SIREN from SIRET (first 9 digits)
  const siren = siret.replace(/\s/g, "").substring(0, 9);
  
  if (siren.length < 9 || !/^\d{9}$/.test(siren)) {
    console.log("Invalid SIREN format:", siren);
    return { found: false, alertes: ["Numéro SIREN/SIRET invalide ou non trouvé dans le devis"], points_ok: [], indicators: [] };
  }

  try {
    // Fetch company data with financial statements
    const response = await fetch(
      `${PAPPERS_API_URL}/entreprise?siren=${siren}&api_token=${pappersApiKey}`,
      { method: "GET" }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return { 
          found: false, 
          alertes: ["Entreprise non trouvée dans les registres officiels (SIREN: " + siren + ")"], 
          points_ok: [],
          indicators: []
        };
      }
      console.error("Pappers API error:", response.status, await response.text());
      return { found: false, alertes: [], points_ok: [], indicators: [] };
    }

    const data: PappersCompanyInfo = await response.json();
    console.log("Pappers API response received for SIREN:", siren);
    
    const alertes: string[] = [];
    const points_ok: string[] = [];
    const indicators: CompanyIndicator[] = [];

    // Verify company exists and is active
    if (data.date_cessation) {
      alertes.push(`🚨 ALERTE: L'entreprise a cessé son activité le ${data.date_cessation}`);
    } else {
      points_ok.push("✓ Entreprise en activité");
    }

    // ============ 1. ANCIENNETÉ DE LA SOCIÉTÉ ============
    let ancienneteYears = 0;
    let ancienneteScore: ScoringColor = "ROUGE";
    
    if (data.date_creation) {
      const creationDate = new Date(data.date_creation);
      const now = new Date();
      ancienneteYears = Math.floor((now.getTime() - creationDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      
      // Calcul précis en années et mois pour l'affichage
      const diffMonths = Math.floor((now.getTime() - creationDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
      const years = Math.floor(diffMonths / 12);
      const months = diffMonths % 12;
      const ancienneteDisplay = years > 0 
        ? `${years} an${years > 1 ? 's' : ''}${months > 0 ? ` et ${months} mois` : ''}`
        : `${months} mois`;
      
      // Scoring selon les règles définies
      if (ancienneteYears < 2) {
        ancienneteScore = "ROUGE";
        alertes.push(`🔴 Entreprise récente : ${ancienneteDisplay} d'existence (créée le ${formatDateFR(data.date_creation)}). Une entreprise de moins de 2 ans présente un risque plus élevé.`);
        indicators.push({
          label: "Ancienneté de l'entreprise",
          value: ancienneteDisplay,
          score: "ROUGE",
          explanation: "L'entreprise a moins de 2 ans. Il est recommandé d'être vigilant car les jeunes entreprises ont un taux de défaillance plus élevé."
        });
      } else if (ancienneteYears < 5) {
        ancienneteScore = "ORANGE";
        points_ok.push(`🟠 Entreprise établie depuis ${ancienneteDisplay} (créée le ${formatDateFR(data.date_creation)})`);
        indicators.push({
          label: "Ancienneté de l'entreprise",
          value: ancienneteDisplay,
          score: "ORANGE",
          explanation: "L'entreprise a entre 2 et 5 ans d'existence. Elle a passé la période la plus risquée mais reste relativement jeune."
        });
      } else {
        ancienneteScore = "VERT";
        points_ok.push(`🟢 Entreprise bien établie : ${ancienneteDisplay} d'existence (créée le ${formatDateFR(data.date_creation)})`);
        indicators.push({
          label: "Ancienneté de l'entreprise",
          value: ancienneteDisplay,
          score: "VERT",
          explanation: "L'entreprise a plus de 5 ans d'existence. C'est un signe de stabilité et de pérennité."
        });
      }
    } else {
      indicators.push({
        label: "Ancienneté de l'entreprise",
        value: "Information non disponible",
        score: "ORANGE",
        explanation: "La date de création n'a pas pu être récupérée. Cela ne préjuge pas de la qualité de l'entreprise."
      });
    }

    // ============ 2. DISPONIBILITÉ DES BILANS ============
    let bilansCount = 0;
    let bilansScore: ScoringColor = "ORANGE";
    
    // Check for bilans in comptes array (3 last years)
    if (data.comptes && Array.isArray(data.comptes)) {
      bilansCount = data.comptes.length;
    } else if (data.derniers_comptes) {
      // If only derniers_comptes is available, count as 1
      bilansCount = 1;
    }
    
    if (bilansCount >= 3) {
      bilansScore = "VERT";
      points_ok.push(`🟢 ${bilansCount} bilans comptables disponibles (3 dernières années complètes)`);
      indicators.push({
        label: "Disponibilité des bilans",
        value: `${bilansCount} bilans disponibles`,
        score: "VERT",
        explanation: "L'entreprise publie régulièrement ses comptes, signe de transparence financière."
      });
    } else if (bilansCount > 0) {
      bilansScore = "ORANGE";
      points_ok.push(`🟠 ${bilansCount} bilan${bilansCount > 1 ? 's' : ''} comptable${bilansCount > 1 ? 's' : ''} disponible${bilansCount > 1 ? 's' : ''}`);
      indicators.push({
        label: "Disponibilité des bilans",
        value: `${bilansCount} bilan${bilansCount > 1 ? 's' : ''} disponible${bilansCount > 1 ? 's' : ''}`,
        score: "ORANGE",
        explanation: "L'historique comptable est incomplet. Certaines entreprises (micro-entreprises, SCI) ne sont pas tenues de publier leurs comptes."
      });
    } else {
      bilansScore = "ORANGE";
      alertes.push("🟠 Aucun bilan publié - la vérification de la santé financière est limitée");
      indicators.push({
        label: "Disponibilité des bilans",
        value: "Aucun bilan disponible",
        score: "ORANGE",
        explanation: "Aucun bilan n'a été trouvé. Les micro-entreprises et certaines sociétés ne sont pas tenues de déposer leurs comptes. Cela ne signifie pas forcément un problème."
      });
    }

    // ============ 3. ANALYSE DES CAPITAUX PROPRES ============
    let capitauxPropres: number | undefined;
    let capitauxPropresScore: ScoringColor | undefined;
    
    // Get capitaux propres from the most recent bilan
    if (data.comptes && data.comptes.length > 0 && data.comptes[0].capitaux_propres !== undefined) {
      capitauxPropres = data.comptes[0].capitaux_propres;
    } else if (data.derniers_comptes?.capitaux_propres !== undefined) {
      capitauxPropres = data.derniers_comptes.capitaux_propres;
    }
    
    if (capitauxPropres !== undefined) {
      const capitauxFormatted = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(capitauxPropres);
      
      if (capitauxPropres < 0) {
        capitauxPropresScore = "ROUGE";
        alertes.push(`🔴 ALERTE IMPORTANTE : Capitaux propres négatifs (${capitauxFormatted}). L'entreprise présente une situation financière fragile.`);
        indicators.push({
          label: "Capitaux propres",
          value: capitauxFormatted,
          score: "ROUGE",
          explanation: "Les capitaux propres négatifs indiquent que l'entreprise a accumulé plus de pertes que d'apports. C'est un signal de fragilité financière important. L'entreprise pourrait avoir des difficultés à honorer ses engagements."
        });
      } else {
        capitauxPropresScore = "VERT";
        points_ok.push(`🟢 Capitaux propres positifs (${capitauxFormatted})`);
        indicators.push({
          label: "Capitaux propres",
          value: capitauxFormatted,
          score: "VERT",
          explanation: "Les capitaux propres sont positifs, ce qui indique une structure financière saine."
        });
      }
    } else if (bilansCount > 0) {
      // Bilan exists but no capitaux propres data
      indicators.push({
        label: "Capitaux propres",
        value: "Information non disponible",
        score: "ORANGE",
        explanation: "Les capitaux propres n'ont pas pu être récupérés. Cette information n'est pas toujours disponible dans les bilans simplifiés."
      });
    }

    // ============ 4. PROCÉDURES COLLECTIVES ============
    if (data.procedure_collective) {
      alertes.push("🔴 ALERTE FORTE : Procédure collective en cours (redressement ou liquidation judiciaire)");
      indicators.push({
        label: "Procédure collective",
        value: "En cours",
        score: "ROUGE",
        explanation: "L'entreprise fait l'objet d'une procédure collective. Cela signifie qu'elle rencontre des difficultés financières importantes. Il est fortement déconseillé de verser un acompte."
      });
    } else {
      points_ok.push("✓ Aucune procédure collective en cours");
    }

    // Add company name if found
    if (data.nom_entreprise) {
      points_ok.unshift(`✓ Entreprise identifiée : ${data.nom_entreprise}`);
    }

    // Extract address info for Google Places search
    const adresse = data.siege?.adresse_ligne_1 || "";
    const ville = data.siege?.ville || "";

    return {
      found: true,
      siren: data.siren,
      nom_entreprise: data.nom_entreprise,
      adresse,
      ville,
      anciennete_years: ancienneteYears,
      anciennete_score: ancienneteScore,
      bilans_count: bilansCount,
      bilans_score: bilansScore,
      capitaux_propres: capitauxPropres,
      capitaux_propres_score: capitauxPropresScore,
      procedure_collective: data.procedure_collective,
      indicators,
      alertes,
      points_ok,
    };
  } catch (error) {
    console.error("Pappers API error:", error);
    return { found: false, alertes: [], points_ok: [], indicators: [] };
  }
}

// Helper function to format date in French format
function formatDateFR(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { analysisId } = await req.json();

    if (!analysisId) {
      return new Response(
        JSON.stringify({ error: "analysisId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ error: "Lovable API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the analysis record
    const { data: analysis, error: fetchError } = await supabase
      .from("analyses")
      .select("*")
      .eq("id", analysisId)
      .single();

    if (fetchError || !analysis) {
      return new Response(
        JSON.stringify({ error: "Analysis not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update status to processing
    await supabase
      .from("analyses")
      .update({ status: "processing" })
      .eq("id", analysisId);

    // Download the PDF file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("devis")
      .download(analysis.file_path);

    if (downloadError || !fileData) {
      await supabase
        .from("analyses")
        .update({ status: "error", error_message: "Impossible de télécharger le fichier" })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({ error: "Failed to download file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert file to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    let binaryString = "";
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      binaryString += String.fromCharCode.apply(null, [...chunk]);
    }
    const base64 = btoa(binaryString);
    
    // Determine MIME type
    const fileName = analysis.file_name.toLowerCase();
    let mimeType = "application/pdf";
    if (fileName.endsWith(".png")) mimeType = "image/png";
    else if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) mimeType = "image/jpeg";
    else if (fileName.endsWith(".webp")) mimeType = "image/webp";

    const systemPrompt = `Tu es un expert en analyse de devis travaux pour particuliers en France. Tu analyses des devis d'artisans et tu identifies les risques, incohérences et points de vigilance. Tu réponds uniquement avec un JSON valide, sans texte libre.`;

    const userPrompt = `Analyse ce document de devis d'artisan. 

IMPORTANT: Extrait également:
- Le numéro SIRET ou SIREN de l'entreprise s'il est présent
- La catégorie principale de travaux (ex: peinture_interieure, carrelage_sol, electricite_renovation, plomberie_sdb, etc.)
- La quantité totale (en m², unités ou forfait selon la catégorie)
- Le montant HT total du devis
- Le code postal du chantier

Retourne un JSON STRICTEMENT STRUCTURÉ avec exactement les champs suivants :

- score (VERT, ORANGE ou ROUGE)
- resume (résumé clair pour un particulier)
- points_ok (liste des éléments conformes)
- alertes (liste des risques ou éléments manquants)
- recommandations (actions concrètes à conseiller au particulier)
- siret (numéro SIRET ou SIREN extrait du document, ou null si non trouvé)
- categorie_travaux (une des catégories: peinture_interieure, carrelage_sol, carrelage_mural, parquet_stratifie, parquet_massif, isolation_combles, isolation_murs, placo_cloison, electricite_renovation, plomberie_sdb, cuisine_pose, toiture_tuiles, facade_ravalement, menuiserie_fenetre, menuiserie_porte, chauffage_pac, chaudiere_gaz, ou null si non identifiable)
- quantite (nombre total, ex: 50 pour 50m², ou null)
- montant_ht (montant HT total en euros, ou null)
- code_postal_chantier (code postal du lieu des travaux, ou null)

FORMAT DE RÉPONSE ATTENDU (OBLIGATOIRE) :
{
  "score": "",
  "resume": "",
  "points_ok": [],
  "alertes": [],
  "recommandations": [],
  "siret": "",
  "categorie_travaux": "",
  "quantite": null,
  "montant_ht": null,
  "code_postal_chantier": ""
}

CONTRAINTES :
- Le score doit être justifié implicitement par les alertes
- Ne jamais employer de termes juridiques complexes
- Rester pédagogique et neutre
- Ne jamais affirmer qu'il s'agit d'une arnaque
- L'analyse est informative et non contractuelle
- NE PAS générer d'alerte concernant la date du devis (ancienneté du devis, devis ancien, date de validité, etc.) - ce n'est pas un critère pertinent pour l'analyse`;

    // Use Lovable AI Gateway with Gemini (supports PDF natively)
    const aiResponse = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", errorText);
      await supabase
        .from("analyses")
        .update({ 
          status: "error", 
          error_message: "Impossible de lire le contenu du fichier. Vérifiez que le fichier est lisible." 
        })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({ error: "Failed to analyze document" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await aiResponse.json();
    const analysisContent = aiResult.choices?.[0]?.message?.content;

    if (!analysisContent) {
      await supabase
        .from("analyses")
        .update({ status: "error", error_message: "L'IA n'a pas pu analyser le devis" })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({ error: "AI analysis failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let parsedAnalysis;
    try {
      parsedAnalysis = JSON.parse(analysisContent);
    } catch (parseError) {
      console.error("Parse error, raw content:", analysisContent);
      await supabase
        .from("analyses")
        .update({ status: "error", error_message: "Erreur lors du traitement de l'analyse" })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({ error: "Failed to parse AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize arrays from AI analysis
    let allPointsOk = Array.isArray(parsedAnalysis.points_ok) ? [...parsedAnalysis.points_ok] : [];
    let allAlertes = Array.isArray(parsedAnalysis.alertes) ? [...parsedAnalysis.alertes] : [];
    let allRecommandations = Array.isArray(parsedAnalysis.recommandations) ? [...parsedAnalysis.recommandations] : [];

    // ============ QUALIBAT DETECTION FROM DOCUMENT TEXT ============
    const qualibatResult = detectQualibatFromText(analysisContent);
    
    if (qualibatResult.point_ok) {
      allPointsOk.push(qualibatResult.point_ok);
    }
    if (qualibatResult.alerte) {
      allAlertes.push(qualibatResult.alerte);
    }
    console.log("QUALIBAT detection result:", qualibatResult.hasQualibat ? "FOUND" : "NOT FOUND");
    // ============ END QUALIBAT DETECTION ============

    // ============ ASSURANCES DETECTION (AI-based) ============
    console.log("Starting assurance extraction...");
    const assuranceExtraction = await extractAssuranceInfo(base64, mimeType, lovableApiKey);
    const assuranceResult = analyzeAssurances(
      assuranceExtraction,
      parsedAnalysis.categorie_travaux,
      analysisContent
    );
    
    console.log("Assurance analysis result:", {
      decennale: assuranceResult.decennale,
      rcpro: assuranceResult.rcpro,
      globalScore: assuranceResult.globalScore
    });
    
    if (assuranceResult.point_ok) {
      allPointsOk.push(assuranceResult.point_ok);
    }
    if (assuranceResult.alerte) {
      allAlertes.push(assuranceResult.alerte);
    }
    if (assuranceResult.recommandation) {
      allRecommandations.push(assuranceResult.recommandation);
    }
    // ============ END ASSURANCES DETECTION ============

    // ============ PRICE COMPARISON ANALYSIS ============
    let priceComparisonResult: PriceComparisonResult | null = null;
    
    if (parsedAnalysis.categorie_travaux && parsedAnalysis.quantite && parsedAnalysis.montant_ht && parsedAnalysis.code_postal_chantier) {
      console.log("Price comparison data found:", {
        categorie: parsedAnalysis.categorie_travaux,
        quantite: parsedAnalysis.quantite,
        montant_ht: parsedAnalysis.montant_ht,
        code_postal: parsedAnalysis.code_postal_chantier
      });
      
      // Fetch reference prices and zones from database
      const [referencePrixResult, zonesResult] = await Promise.all([
        supabase.from("travaux_reference_prix").select("*"),
        supabase.from("zones_geographiques").select("*")
      ]);
      
      if (referencePrixResult.data && zonesResult.data) {
        priceComparisonResult = comparePrix(
          parsedAnalysis.categorie_travaux,
          parseFloat(parsedAnalysis.quantite),
          parseFloat(parsedAnalysis.montant_ht),
          parsedAnalysis.code_postal_chantier,
          referencePrixResult.data as TravauxReferencePrix[],
          zonesResult.data as ZoneGeographique[]
        );
        
        if (priceComparisonResult) {
          console.log("Price comparison result:", priceComparisonResult);
          
          // Add price analysis to results
          if (priceComparisonResult.point_ok) {
            allPointsOk.push(priceComparisonResult.point_ok);
          }
          if (priceComparisonResult.alerte) {
            allAlertes.push(priceComparisonResult.alerte);
          }
          
          // Add explanation to recommendations
          allRecommandations.push(`💰 Analyse des prix: ${priceComparisonResult.explication}`);
        } else {
          console.log("Category not found in reference prices:", parsedAnalysis.categorie_travaux);
        }
      }
    } else {
      console.log("Price comparison data incomplete, skipping price analysis");
    }
    // ============ END PRICE COMPARISON ============

    // If SIRET found, analyze company with Pappers, BODACC, RGE and Google Places
    let companyAnalysis: CompanyAnalysis | null = null;
    let bodaccResult: BodaccResult | null = null;
    let googlePlacesResult: GooglePlacesResult | null = null;
    let rgeResult: RGEResult | null = null;
    
    if (parsedAnalysis.siret) {
      console.log("SIRET found in document:", parsedAnalysis.siret);
      const siren = parsedAnalysis.siret.replace(/\s/g, "").substring(0, 9);
      
      // Run Pappers, BODACC and RGE checks in parallel
      // Pass work category and raw text for intelligent RGE relevance detection
      const [pappersResult, bodaccCheck, rgeCheck] = await Promise.all([
        analyzeCompanyWithPappers(parsedAnalysis.siret),
        checkBodaccProcedures(siren),
        checkRGEQualification(parsedAnalysis.siret, parsedAnalysis.categorie_travaux, analysisContent),
      ]);
      
      companyAnalysis = pappersResult;
      bodaccResult = bodaccCheck;
      rgeResult = rgeCheck;
      
      // If company found, also fetch Google Places rating
      if (companyAnalysis.found && companyAnalysis.nom_entreprise) {
        googlePlacesResult = await getGooglePlacesRating(
          companyAnalysis.nom_entreprise,
          companyAnalysis.adresse || "",
          companyAnalysis.ville || ""
        );
        
        // Add Google Places results to company analysis
        if (googlePlacesResult.found && googlePlacesResult.indicator) {
          companyAnalysis.indicators.push(googlePlacesResult.indicator);
          companyAnalysis.google_rating = googlePlacesResult.rating;
          companyAnalysis.google_reviews_count = googlePlacesResult.user_ratings_total;
          companyAnalysis.google_rating_score = googlePlacesResult.score;
          
          // Add to points_ok or alertes based on score
          if (googlePlacesResult.score === "VERT") {
            companyAnalysis.points_ok.push(`🟢 Réputation en ligne : ${googlePlacesResult.rating}/5 sur Google (${googlePlacesResult.user_ratings_total} avis)`);
          } else if (googlePlacesResult.score === "ORANGE") {
            companyAnalysis.points_ok.push(`🟠 Réputation en ligne : ${googlePlacesResult.rating !== undefined ? `${googlePlacesResult.rating}/5 sur Google` : "Aucun avis disponible"} (${googlePlacesResult.user_ratings_total || 0} avis)`);
          } else if (googlePlacesResult.score === "ROUGE") {
            companyAnalysis.alertes.push(`🔴 Réputation en ligne à surveiller : ${googlePlacesResult.rating}/5 sur Google (${googlePlacesResult.user_ratings_total} avis) - Consultez les avis avant de vous engager`);
          }
        } else {
          // Fallback: company not found on Google Places
          companyAnalysis.indicators.push({
            label: "Réputation en ligne",
            value: "Établissement non trouvé sur Google",
            score: "ORANGE",
            explanation: "L'entreprise n'a pas été trouvée sur Google. Cela ne préjuge pas de sa qualité de service. Certaines entreprises n'ont pas de fiche Google Business. Les avis Google sont publics et peuvent évoluer dans le temps."
          });
        }
      }
      
      if (companyAnalysis.found) {
        // Prepend company analysis results
        allPointsOk = [...companyAnalysis.points_ok, ...allPointsOk];
        allAlertes = [...companyAnalysis.alertes, ...allAlertes];
        
        // Add company-specific recommendation if there are alerts
        if (companyAnalysis.alertes.length > 0) {
          allRecommandations.unshift("Vérifiez la situation de l'entreprise sur societe.com ou infogreffe.fr");
        }
      } else if (companyAnalysis.alertes.length > 0) {
        allAlertes = [...companyAnalysis.alertes, ...allAlertes];
      }
      
      // Add BODACC results
      if (bodaccResult) {
        allPointsOk = [...bodaccResult.points_ok, ...allPointsOk];
        allAlertes = [...bodaccResult.alertes, ...allAlertes];
      }
      
      // Add RGE qualification results
      if (rgeResult) {
        if (rgeResult.indicator && companyAnalysis.found) {
          companyAnalysis.indicators.push(rgeResult.indicator);
        }
        if (rgeResult.point_ok) {
          allPointsOk.push(rgeResult.point_ok);
        }
        if (rgeResult.alerte) {
          allAlertes.push(rgeResult.alerte);
        }
      }
    } else {
      allAlertes.unshift("⚠️ Aucun numéro SIRET/SIREN trouvé sur le devis - vérification de l'entreprise impossible");
      allRecommandations.unshift("Demandez à l'artisan son numéro SIRET pour vérifier son immatriculation");
    }

    // ============ PAYMENT CONDITIONS ANALYSIS (Combined: mode, acompte, IBAN) ============
    console.log("Starting payment conditions analysis...");
    const paymentConditionsResult = await analyzePaymentConditions(
      analysisContent,
      base64,
      mimeType,
      lovableApiKey
    );
    
    console.log("Payment conditions result:", {
      modes: paymentConditionsResult.extraction.modes_paiement,
      acompte: paymentConditionsResult.extraction.acompte_pourcentage,
      paiementIntegral: paymentConditionsResult.extraction.paiement_integral_avant_travaux,
      iban: {
        hasIBAN: paymentConditionsResult.iban.hasIBAN,
        isValid: paymentConditionsResult.iban.isValid,
        countryCode: paymentConditionsResult.iban.countryCode,
      },
      score: paymentConditionsResult.score,
      vigilanceCount: paymentConditionsResult.vigilanceCount
    });
    
    if (paymentConditionsResult.point_ok) {
      allPointsOk.push(paymentConditionsResult.point_ok);
    }
    if (paymentConditionsResult.alerte) {
      allAlertes.push(paymentConditionsResult.alerte);
    }
    if (paymentConditionsResult.recommandation) {
      allRecommandations.push(paymentConditionsResult.recommandation);
    }
    // ============ END PAYMENT CONDITIONS ANALYSIS ============

    // Recalculate score based on combined alerts
    let score = parsedAnalysis.score?.toUpperCase() || "ORANGE";
    const validScores = ["VERT", "ORANGE", "ROUGE"];
    
    // Adjust score based on Pappers findings
    if (companyAnalysis) {
      if (companyAnalysis.procedure_collective) {
        score = "ROUGE";
      } else if (companyAnalysis.anciennete_score === "ROUGE" || companyAnalysis.capitaux_propres_score === "ROUGE") {
        score = "ROUGE";
      } else if (companyAnalysis.anciennete_score === "ORANGE" || companyAnalysis.capitaux_propres_score === "ORANGE") {
        if (score === "VERT") score = "ORANGE";
      }
    }
    
    // BODACC procedure = automatic RED score
    if (bodaccResult?.hasProcedure) {
      score = "ROUGE";
    }
    
    // Price comparison impact on score
    if (priceComparisonResult) {
      if (priceComparisonResult.score === "ROUGE") {
        score = "ROUGE";
      } else if (priceComparisonResult.score === "ORANGE" && score === "VERT") {
        score = "ORANGE";
      }
    }
    
    // Assurance impact on score
    if (assuranceResult.globalScore === "ROUGE") {
      score = "ROUGE";
    } else if (assuranceResult.globalScore === "ORANGE" && score === "VERT") {
      score = "ORANGE";
    }
    
    // Google Places rating impact on score (only RED ratings affect score)
    if (googlePlacesResult?.score === "ROUGE") {
      if (score === "VERT") score = "ORANGE";
    }
    
    // Payment conditions impact on score
    // ROUGE conditions: IBAN invalide, espèces, paiement intégral avant travaux, ou 2+ critères de vigilance
    if (paymentConditionsResult.score === "ROUGE") {
      if (score === "VERT") {
        score = "ORANGE";
      }
      // Combined with other issues, payment ROUGE can push to global ROUGE
      if (score === "ORANGE" && paymentConditionsResult.vigilanceCount >= 2) {
        score = "ROUGE";
      }
    } else if (paymentConditionsResult.score === "ORANGE" && score === "VERT") {
      score = "ORANGE";
    }
    
    if (!validScores.includes(score)) {
      score = "ORANGE";
    }

    // Update the analysis with results
    const { error: updateError } = await supabase
      .from("analyses")
      .update({
        status: "completed",
        score: score,
        resume: parsedAnalysis.resume || "Analyse terminée",
        points_ok: allPointsOk,
        alertes: allAlertes,
        recommandations: allRecommandations,
        raw_text: analysisContent,
      })
      .eq("id", analysisId);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to save analysis results" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        analysisId,
        score,
        companyVerified: companyAnalysis?.found || false,
        message: "Analyse terminée avec succès" 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
