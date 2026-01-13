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

// ============ PRICE COMPARISON LOGIC ============

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
interface RGEResult {
  isRGE: boolean;
  qualifications: string[];
  score: ScoringColor;
  indicator?: CompanyIndicator;
  point_ok?: string;
  alerte?: string;
}

async function checkRGEQualification(siret: string): Promise<RGEResult> {
  const result: RGEResult = {
    isRGE: false,
    qualifications: [],
    score: "ORANGE",
  };

  // Clean SIRET - remove spaces
  const cleanSiret = siret.replace(/\s/g, "");
  
  // Extract SIREN (first 9 digits) for search
  const siren = cleanSiret.substring(0, 9);
  
  if (siren.length < 9 || !/^\d{9}$/.test(siren)) {
    console.log("Invalid SIREN for RGE check:", siren);
    return result;
  }

  try {
    // Search by SIRET first, then by SIREN if not found
    console.log("Checking RGE qualification for SIRET:", cleanSiret);
    
    // Try with full SIRET
    let response = await fetch(
      `${ADEME_RGE_API_URL}?siret=${cleanSiret}&size=100`,
      { method: "GET" }
    );

    if (!response.ok) {
      console.log("ADEME RGE API error:", response.status);
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
      // No RGE qualification found
      result.score = "ORANGE";
      result.indicator = {
        label: "Qualification RGE",
        value: "Non référencé RGE",
        score: "ORANGE",
        explanation: "L'entreprise n'est pas référencée dans l'annuaire des professionnels RGE à ce jour. La qualification RGE est obligatoire uniquement pour bénéficier de certaines aides publiques (MaPrimeRénov', CEE, Éco-PTZ). Cela ne préjuge pas de la qualité de l'artisan."
      };
      result.alerte = "⚠️ Qualification RGE : Non (artisan non référencé RGE à ce jour). La mention RGE est obligatoire uniquement pour bénéficier des aides de l'État.";
      
      return result;
    }

    // RGE qualification found!
    result.isRGE = true;
    result.score = "VERT";
    
    // Collect all qualifications
    const qualificationsSet = new Set<string>();
    const domainesSet = new Set<string>();
    
    for (const rge of results) {
      // Extract qualification name (nom_qualification or libelle_qualification)
      const qualifName = rge.nom_qualification || rge.libelle_qualification || rge.qualification || "";
      if (qualifName) {
        qualificationsSet.add(qualifName);
      }
      
      // Extract domain (domaine or type_travaux)
      const domaine = rge.domaine || rge.type_travaux || rge.code_qualification || "";
      if (domaine) {
        domainesSet.add(domaine);
      }
    }
    
    result.qualifications = Array.from(qualificationsSet);
    const domaines = Array.from(domainesSet);
    
    // Format display text
    const qualifDisplay = result.qualifications.length > 0 
      ? result.qualifications.slice(0, 3).join(", ") + (result.qualifications.length > 3 ? ` (+${result.qualifications.length - 3} autres)` : "")
      : "Qualification(s) RGE";
    
    result.indicator = {
      label: "Qualification RGE",
      value: `Oui (${result.qualifications.length} qualification${result.qualifications.length > 1 ? 's' : ''})`,
      score: "VERT",
      explanation: `L'entreprise est référencée dans l'annuaire officiel des professionnels RGE (France Rénov' / ADEME). ${qualifDisplay}. Cette qualification permet aux clients de bénéficier des aides de l'État.`
    };
    
    result.point_ok = `🟢 Qualification RGE : Oui (artisan reconnu par France Rénov'). ${result.qualifications.length} qualification${result.qualifications.length > 1 ? 's' : ''} active${result.qualifications.length > 1 ? 's' : ''}.`;
    
    console.log("RGE qualification found:", result.qualifications);
    
    return result;
  } catch (error) {
    console.error("ADEME RGE API error:", error);
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
      const [pappersResult, bodaccCheck, rgeCheck] = await Promise.all([
        analyzeCompanyWithPappers(parsedAnalysis.siret),
        checkBodaccProcedures(siren),
        checkRGEQualification(parsedAnalysis.siret),
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
    
    // Google Places rating impact on score (only RED ratings affect score)
    if (googlePlacesResult?.score === "ROUGE") {
      if (score === "VERT") score = "ORANGE";
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
