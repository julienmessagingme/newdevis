import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://www.verifiermondevis.fr",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_AI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

type ScoringColor = "VERT" | "ORANGE" | "ROUGE";
type ComparisonStatus = "OK" | "INCOMPLET" | "INCOHERENT" | "NON_DISPONIBLE";

interface AttestationExtraction {
  type_assurance: "decennale" | "rc_pro" | "autre";
  nom_entreprise_assuree: string;
  siret_ou_siren: string;
  adresse_assuree: string;
  assureur: string;
  numero_contrat: string;
  date_debut_couverture: string;
  date_fin_couverture: string;
  activites_couvertes: string;
  document_lisible: boolean;
}

interface AttestationComparison {
  nom_entreprise: ComparisonStatus;
  siret_siren: ComparisonStatus;
  adresse: ComparisonStatus;
  periode_validite: ComparisonStatus;
  activite_couverte: ComparisonStatus;
  coherence_globale: ComparisonStatus;
}

interface AttestationAnalysisResult {
  extraction: AttestationExtraction;
  comparison: AttestationComparison;
  score: ScoringColor;
}

// Extract attestation information using AI
async function extractAttestationInfo(
  base64Content: string,
  mimeType: string,
  googleApiKey: string
): Promise<AttestationExtraction> {
  const defaultResult: AttestationExtraction = {
    type_assurance: "autre",
    nom_entreprise_assuree: "",
    siret_ou_siren: "",
    adresse_assuree: "",
    assureur: "",
    numero_contrat: "",
    date_debut_couverture: "",
    date_fin_couverture: "",
    activites_couvertes: "",
    document_lisible: false,
  };

  try {
    const systemPrompt = `Tu es un expert en analyse de documents d'assurance professionnelle (décennale, RC Pro).
Tu extrais uniquement les informations présentes dans le document, sans inventer de données.
Réponds uniquement avec un JSON valide.`;

    const userPrompt = `Analyse cette attestation d'assurance et extrais les informations suivantes.

IMPORTANT: N'invente AUCUNE information. Si une donnée n'est pas visible, laisse le champ vide.

Données à extraire:
- type_assurance: "decennale" si c'est une assurance décennale/garantie décennale, "rc_pro" si c'est une RC professionnelle, "autre" sinon
- nom_entreprise_assuree: nom de l'entreprise assurée
- siret_ou_siren: numéro SIRET ou SIREN de l'entreprise assurée
- adresse_assuree: adresse de l'entreprise assurée
- assureur: nom de la compagnie d'assurance
- numero_contrat: numéro de police ou de contrat
- date_debut_couverture: date de début de validité (format JJ/MM/AAAA si possible)
- date_fin_couverture: date de fin de validité (format JJ/MM/AAAA si possible)
- activites_couvertes: description des activités professionnelles couvertes
- document_lisible: true si le document est lisible et exploitable, false sinon

Retourne un JSON avec EXACTEMENT ces champs:
{
  "type_assurance": "decennale" | "rc_pro" | "autre",
  "nom_entreprise_assuree": "...",
  "siret_ou_siren": "...",
  "adresse_assuree": "...",
  "assureur": "...",
  "numero_contrat": "...",
  "date_debut_couverture": "...",
  "date_fin_couverture": "...",
  "activites_couvertes": "...",
  "document_lisible": true | false
}`;

    const aiResponse = await fetch(GEMINI_AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${googleApiKey}`,
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
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
      console.error("Attestation extraction AI error:", aiResponse.status);
      return defaultResult;
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content;

    if (!content) {
      return defaultResult;
    }

    const parsed = JSON.parse(content);
    return {
      type_assurance: parsed.type_assurance || "autre",
      nom_entreprise_assuree: parsed.nom_entreprise_assuree || "",
      siret_ou_siren: parsed.siret_ou_siren || "",
      adresse_assuree: parsed.adresse_assuree || "",
      assureur: parsed.assureur || "",
      numero_contrat: parsed.numero_contrat || "",
      date_debut_couverture: parsed.date_debut_couverture || "",
      date_fin_couverture: parsed.date_fin_couverture || "",
      activites_couvertes: parsed.activites_couvertes || "",
      document_lisible: Boolean(parsed.document_lisible),
    };
  } catch (error) {
    console.error("Attestation extraction error:", error);
    return defaultResult;
  }
}

// Compare attestation info with quote info
function compareAttestationWithQuote(
  attestation: AttestationExtraction,
  quoteInfo: {
    nom_entreprise?: string;
    siret?: string;
    adresse?: string;
    categorie_travaux?: string;
  }
): AttestationComparison {
  const comparison: AttestationComparison = {
    nom_entreprise: "NON_DISPONIBLE",
    siret_siren: "NON_DISPONIBLE",
    adresse: "NON_DISPONIBLE",
    periode_validite: "NON_DISPONIBLE",
    activite_couverte: "NON_DISPONIBLE",
    coherence_globale: "NON_DISPONIBLE",
  };

  // Compare company name (fuzzy match)
  if (attestation.nom_entreprise_assuree && quoteInfo.nom_entreprise) {
    const normalizedAttestation = attestation.nom_entreprise_assuree.toLowerCase().replace(/[^a-z0-9]/g, "");
    const normalizedQuote = quoteInfo.nom_entreprise.toLowerCase().replace(/[^a-z0-9]/g, "");
    
    if (normalizedAttestation === normalizedQuote) {
      comparison.nom_entreprise = "OK";
    } else if (normalizedAttestation.includes(normalizedQuote) || normalizedQuote.includes(normalizedAttestation)) {
      comparison.nom_entreprise = "OK"; // Partial match is OK
    } else {
      // Calculate similarity
      const similarity = calculateSimilarity(normalizedAttestation, normalizedQuote);
      if (similarity > 0.7) {
        comparison.nom_entreprise = "OK";
      } else if (similarity > 0.4) {
        comparison.nom_entreprise = "INCOMPLET";
      } else {
        comparison.nom_entreprise = "INCOHERENT";
      }
    }
  } else if (!attestation.nom_entreprise_assuree) {
    comparison.nom_entreprise = "INCOMPLET";
  }

  // Compare SIRET/SIREN
  if (attestation.siret_ou_siren && quoteInfo.siret) {
    const cleanAttestation = attestation.siret_ou_siren.replace(/\s/g, "");
    const cleanQuote = quoteInfo.siret.replace(/\s/g, "");
    
    if (cleanAttestation === cleanQuote) {
      comparison.siret_siren = "OK";
    } else if (cleanAttestation.substring(0, 9) === cleanQuote.substring(0, 9)) {
      // Same SIREN, different SIRET establishment
      comparison.siret_siren = "OK";
    } else {
      comparison.siret_siren = "INCOHERENT";
    }
  } else if (!attestation.siret_ou_siren) {
    comparison.siret_siren = "INCOMPLET";
  }

  // Compare address (fuzzy)
  if (attestation.adresse_assuree && quoteInfo.adresse) {
    const normalizedAttestation = attestation.adresse_assuree.toLowerCase().replace(/[^a-z0-9]/g, "");
    const normalizedQuote = quoteInfo.adresse.toLowerCase().replace(/[^a-z0-9]/g, "");
    
    const similarity = calculateSimilarity(normalizedAttestation, normalizedQuote);
    if (similarity > 0.5) {
      comparison.adresse = "OK";
    } else if (similarity > 0.3) {
      comparison.adresse = "INCOMPLET";
    } else {
      // Check for postal code match
      const postalCodeAttestation = extractPostalCode(attestation.adresse_assuree);
      const postalCodeQuote = extractPostalCode(quoteInfo.adresse);
      if (postalCodeAttestation && postalCodeQuote && postalCodeAttestation === postalCodeQuote) {
        comparison.adresse = "OK";
      } else {
        comparison.adresse = "INCOHERENT";
      }
    }
  } else if (!attestation.adresse_assuree) {
    comparison.adresse = "INCOMPLET";
  }

  // Check period validity
  if (attestation.date_fin_couverture) {
    const today = new Date();
    const endDate = parseDate(attestation.date_fin_couverture);
    
    if (endDate) {
      if (endDate > today) {
        comparison.periode_validite = "OK";
      } else {
        comparison.periode_validite = "INCOHERENT"; // Expired
      }
    } else {
      comparison.periode_validite = "INCOMPLET";
    }
  } else {
    comparison.periode_validite = "INCOMPLET";
  }

  // Check activity coverage
  if (attestation.activites_couvertes && quoteInfo.categorie_travaux) {
    const normalizedActivites = attestation.activites_couvertes.toLowerCase();
    const normalizedTravaux = quoteInfo.categorie_travaux.toLowerCase();
    
    // Check if work type is mentioned in activities
    const workKeywords = getWorkTypeKeywords(normalizedTravaux);
    const hasMatch = workKeywords.some(keyword => normalizedActivites.includes(keyword));
    
    if (hasMatch) {
      comparison.activite_couverte = "OK";
    } else {
      // Check for general construction/building coverage
      const generalCoverage = ["bâtiment", "batiment", "construction", "travaux", "tous corps d'état", "tce"];
      const hasGeneralCoverage = generalCoverage.some(term => normalizedActivites.includes(term));
      
      if (hasGeneralCoverage) {
        comparison.activite_couverte = "OK";
      } else {
        comparison.activite_couverte = "INCOMPLET"; // Can't confirm, not necessarily wrong
      }
    }
  } else if (!attestation.activites_couvertes) {
    comparison.activite_couverte = "INCOMPLET";
  }

  // Calculate global coherence
  const statuses = [
    comparison.nom_entreprise,
    comparison.siret_siren,
    comparison.adresse,
    comparison.periode_validite,
    comparison.activite_couverte,
  ];
  
  const incoherentCount = statuses.filter(s => s === "INCOHERENT").length;
  const okCount = statuses.filter(s => s === "OK").length;
  const incompletCount = statuses.filter(s => s === "INCOMPLET").length;
  
  if (incoherentCount > 0) {
    comparison.coherence_globale = "INCOHERENT";
  } else if (okCount >= 3) {
    comparison.coherence_globale = "OK";
  } else if (incompletCount > 2) {
    comparison.coherence_globale = "INCOMPLET";
  } else {
    comparison.coherence_globale = "OK";
  }

  return comparison;
}

// Helper: Calculate string similarity (Jaccard-like)
function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  const set1 = new Set(str1.split(""));
  const set2 = new Set(str2.split(""));
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

// Helper: Extract postal code from address
function extractPostalCode(address: string): string | null {
  const match = address.match(/\b(\d{5})\b/);
  return match ? match[1] : null;
}

// Helper: Parse date from various formats
function parseDate(dateStr: string): Date | null {
  // Try DD/MM/YYYY format
  const match1 = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match1) {
    return new Date(parseInt(match1[3]), parseInt(match1[2]) - 1, parseInt(match1[1]));
  }
  
  // Try YYYY-MM-DD format
  const match2 = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match2) {
    return new Date(parseInt(match2[1]), parseInt(match2[2]) - 1, parseInt(match2[3]));
  }
  
  // Try natural language date
  const dateObj = new Date(dateStr);
  if (!isNaN(dateObj.getTime())) {
    return dateObj;
  }
  
  return null;
}

// Helper: Get work type keywords for matching
function getWorkTypeKeywords(workType: string): string[] {
  const keywordMap: Record<string, string[]> = {
    "toiture": ["toiture", "couverture", "toit", "charpente"],
    "charpente": ["charpente", "bois", "structure"],
    "maconnerie": ["maçonnerie", "maconnerie", "mur", "béton", "beton"],
    "peinture": ["peinture", "revêtement", "revetement", "finition"],
    "plomberie": ["plomberie", "sanitaire", "eau"],
    "electricite": ["électricité", "electricite", "électrique", "electrique"],
    "isolation": ["isolation", "thermique", "acoustique"],
    "carrelage": ["carrelage", "revêtement", "sol"],
    "menuiserie": ["menuiserie", "bois", "fenêtre", "fenetre", "porte"],
    "chauffage": ["chauffage", "climatisation", "ventilation", "hvac"],
  };
  
  for (const [key, keywords] of Object.entries(keywordMap)) {
    if (workType.includes(key)) {
      return keywords;
    }
  }
  
  // Return work type as single keyword if no mapping found
  return [workType];
}

// Determine score based on comparison results
function determineScore(comparison: AttestationComparison): ScoringColor {
  if (comparison.coherence_globale === "INCOHERENT") {
    return "ROUGE";
  }
  
  if (comparison.coherence_globale === "OK") {
    return "VERT";
  }
  
  return "ORANGE";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const googleApiKey = Deno.env.get("GOOGLE_AI_API_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    if (!googleApiKey) {
      throw new Error("Missing GOOGLE_AI_API_KEY");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { analysisId, attestationType, fileBase64, mimeType, quoteInfo } = await req.json();

    // Validate required parameters
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!analysisId || !UUID_RE.test(analysisId) || !attestationType || !fileBase64 || !mimeType) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid required parameters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Limit base64 file size (10 MB binary = ~13.3 MB base64)
    const MAX_BASE64_LENGTH = Math.ceil((10 * 1024 * 1024 / 3) * 4);
    if (fileBase64.length > MAX_BASE64_LENGTH) {
      return new Response(
        JSON.stringify({ error: "Fichier trop volumineux (max 10 Mo)" }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate attestationType
    const VALID_TYPES = ["decennale", "rc_pro"];
    if (!VALID_TYPES.includes(attestationType)) {
      return new Response(
        JSON.stringify({ error: "Type d'attestation invalide" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Analyzing ${attestationType} attestation for analysis ${analysisId}`);

    // Extract information from attestation
    const extraction = await extractAttestationInfo(fileBase64, mimeType, googleApiKey);
    
    console.log("Extraction result:", extraction);

    // Compare with quote info
    const comparison = compareAttestationWithQuote(extraction, quoteInfo);
    
    console.log("Comparison result:", comparison);

    // Determine score
    const score = determineScore(comparison);
    
    console.log("Level 2 score:", score);

    // Prepare update data based on attestation type
    const updateData: Record<string, any> = {
      attestation_analysis: {
        ...(await getExistingAttestationAnalysis(supabase, analysisId)),
        [attestationType]: extraction,
      },
      attestation_comparison: {
        ...(await getExistingAttestationComparison(supabase, analysisId)),
        [attestationType]: comparison,
      },
      assurance_source: "devis+attestation",
    };

    // Store attestation URL (if using storage)
    if (attestationType === "decennale") {
      updateData.attestation_decennale_url = `data:${mimeType};base64,${fileBase64.substring(0, 100)}...`; // Store reference, not full base64
    } else if (attestationType === "rc_pro") {
      updateData.attestation_rcpro_url = `data:${mimeType};base64,${fileBase64.substring(0, 100)}...`;
    }

    // Calculate overall Level 2 score (worst of both if both provided)
    const existingAnalysis = await supabase
      .from("analyses")
      .select("attestation_comparison")
      .eq("id", analysisId)
      .single();

    let overallLevel2Score = score;
    
    if (existingAnalysis.data?.attestation_comparison) {
      const otherType = attestationType === "decennale" ? "rc_pro" : "decennale";
      const otherComparison = existingAnalysis.data.attestation_comparison[otherType];
      
      if (otherComparison) {
        const otherScore = determineScore(otherComparison);
        // Take worst score
        if (score === "ROUGE" || otherScore === "ROUGE") {
          overallLevel2Score = "ROUGE";
        } else if (score === "ORANGE" || otherScore === "ORANGE") {
          overallLevel2Score = "ORANGE";
        } else {
          overallLevel2Score = "VERT";
        }
      }
    }
    
    updateData.assurance_level2_score = overallLevel2Score;

    // Update the analysis
    const { error: updateError } = await supabase
      .from("analyses")
      .update(updateData)
      .eq("id", analysisId);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to save attestation analysis" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        extraction,
        comparison,
        score,
        overallLevel2Score,
        message: "Attestation analysée avec succès",
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

// Helper to get existing attestation analysis
async function getExistingAttestationAnalysis(supabase: any, analysisId: string): Promise<Record<string, any>> {
  const { data } = await supabase
    .from("analyses")
    .select("attestation_analysis")
    .eq("id", analysisId)
    .single();
  
  return data?.attestation_analysis || {};
}

// Helper to get existing attestation comparison
async function getExistingAttestationComparison(supabase: any, analysisId: string): Promise<Record<string, any>> {
  const { data } = await supabase
    .from("analyses")
    .select("attestation_comparison")
    .eq("id", analysisId)
    .single();
  
  return data?.attestation_comparison || {};
}
