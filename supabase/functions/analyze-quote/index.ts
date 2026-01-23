import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

class PipelineError extends Error {
  status: number;
  code: string;
  publicMessage: string;

  constructor({
    status,
    code,
    publicMessage,
    cause,
  }: {
    status: number;
    code: string;
    publicMessage: string;
    cause?: unknown;
  }) {
    super(publicMessage);
    this.name = "PipelineError";
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
    // @ts-ignore - supported in modern runtimes
    this.cause = cause;
  }
}

const isPipelineError = (e: unknown): e is PipelineError => e instanceof PipelineError;

// ============ API ENDPOINTS ============
const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const PAPPERS_API_URL = "https://api.pappers.fr/v2";
const BODACC_API_URL = "https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records";
const GOOGLE_PLACES_API_URL = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json";
const ADEME_RGE_API_URL = "https://data.ademe.fr/data-fair/api/v1/datasets/liste-des-entreprises-rge-2/lines";
const OPENIBAN_API_URL = "https://openiban.com/validate";
const GEORISQUES_API_URL = "https://georisques.gouv.fr/api/v1";
const ADRESSE_API_URL = "https://api-adresse.data.gouv.fr/search";
const GPU_API_URL = "https://apicarto.ign.fr/api/gpu/document";

// ============ CIRCUIT BREAKER SETTINGS ============
const CIRCUIT_BREAKER_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

// ============ TYPE DEFINITIONS ============
type ScoringColor = "VERT" | "ORANGE" | "ROUGE";
type DocumentType = "devis_travaux" | "facture" | "diagnostic_immobilier" | "autre";

// ============================================================
// PHASE 1 — EXTRACTION UNIQUE (UN SEUL APPEL IA)
// ============================================================

interface ExtractedData {
  type_document: DocumentType;
  entreprise: {
    nom: string | null;
    siret: string | null;
    adresse: string | null;
    iban: string | null;
    assurance_decennale_mentionnee: boolean | null;
    assurance_rc_pro_mentionnee: boolean | null;
    certifications_mentionnees: string[];
  };
  client: {
    adresse_chantier: string | null;
    code_postal: string | null;
    ville: string | null;
  };
  travaux: Array<{
    libelle: string;
    categorie: string;
    montant: number | null;
    quantite: number | null;
    unite: string | null;
  }>;
  paiement: {
    acompte_pct: number | null;
    acompte_avant_travaux_pct: number | null;
    modes: string[];
    echeancier_detecte: boolean;
  };
  dates: {
    date_devis: string | null;
    date_execution_max: string | null;
  };
  totaux: {
    ht: number | null;
    tva: number | null;
    ttc: number | null;
    taux_tva: number | null;
  };
  anomalies_detectees: string[];
  resume_factuel: string;
}

// ============================================================
// DEBUG ADMIN — Structure pour audit des appels API
// ============================================================

interface ProviderCallDebug {
  enabled: boolean;
  attempted: boolean;
  cached: boolean;
  cache_hit: boolean;
  http_status: number | null;
  error: string | null;
  fetched_at: string | null;
  expires_at: string | null;
  latency_ms: number | null;
}

interface DebugInfo {
  provider_calls: {
    pappers: ProviderCallDebug;
  };
}

// ============================================================
// COMPANY CACHE — Structure de données
// ============================================================

interface CompanyPayload {
  date_creation: string | null;
  age_years: number | null;
  is_active: boolean;
  bilans_count: number;
  has_3_bilans: boolean;
  last_bilan_capitaux_propres: number | null;
  nom: string | null;
  adresse: string | null;
  ville: string | null;
  procedure_collective: boolean;
}

interface CachedCompanyData {
  id: string;
  siret: string;
  siren: string;
  provider: string;
  fetched_at: string;
  expires_at: string;
  payload: CompanyPayload;
  status: "ok" | "error" | "not_found";
  error_code: string | null;
  error_message: string | null;
}

// ============================================================
// PHASE 2 — VÉRIFICATION (APIs EXTERNES - SANS IA)
// ============================================================

interface VerificationResult {
  entreprise_immatriculee: boolean | null;
  entreprise_radiee: boolean | null;
  procedure_collective: boolean | null;
  capitaux_propres: number | null;
  capitaux_propres_negatifs: boolean | null;
  date_creation: string | null;
  anciennete_annees: number | null;
  bilans_disponibles: number;
  nom_officiel: string | null;
  adresse_officielle: string | null;
  ville_officielle: string | null;
  lookup_status: "ok" | "not_found" | "error" | "skipped" | "no_siret";
  
  iban_verifie: boolean;
  iban_valide: boolean | null;
  iban_pays: string | null;
  iban_code_pays: string | null;
  iban_banque: string | null;
  
  rge_pertinent: boolean;
  rge_trouve: boolean;
  rge_qualifications: string[];
  
  google_trouve: boolean;
  google_note: number | null;
  google_nb_avis: number | null;
  google_match_fiable: boolean;
  
  georisques_consulte: boolean;
  georisques_risques: string[];
  georisques_zone_sismique: string | null;
  georisques_commune: string | null;
  
  patrimoine_consulte: boolean;
  patrimoine_status: "possible" | "non_detecte" | "inconnu";
  patrimoine_types: string[];
  patrimoine_lat: number | null;
  patrimoine_lon: number | null;
  
  comparaisons_prix: Array<{
    categorie: string;
    libelle: string;
    prix_unitaire_devis: number;
    fourchette_min: number;
    fourchette_max: number;
    zone: string;
    score: ScoringColor;
    explication: string;
  }>;
  
  debug?: DebugInfo;
}

// ============================================================
// PHASE 3 — SCORING DÉTERMINISTE (SANS IA - RÈGLES STRICTES)
// ============================================================

interface ScoringResult {
  score_global: ScoringColor;
  criteres_rouges: string[];
  criteres_oranges: string[];
  criteres_verts: string[];
  criteres_informatifs: string[];
  explication: string;
  scores_blocs: {
    entreprise: ScoringColor;
    devis: ScoringColor;
    securite: ScoringColor;
    contexte: "INFORMATIF";
  };
}

// ============ HELPER FUNCTIONS ============

function getCountryName(countryCode: string): string {
  const countries: Record<string, string> = {
    "FR": "France", "DE": "Allemagne", "BE": "Belgique", "CH": "Suisse",
    "ES": "Espagne", "IT": "Italie", "PT": "Portugal", "LU": "Luxembourg",
    "NL": "Pays-Bas", "GB": "Royaume-Uni", "IE": "Irlande", "PL": "Pologne",
  };
  return countries[countryCode] || countryCode;
}

function formatDateFR(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function cleanAddress(rawAddress: string): string {
  if (!rawAddress) return "";
  return rawAddress
    .replace(/chez\s+le\s+client/gi, "")
    .replace(/voir\s+ci-dessus/gi, "")
    .replace(/idem/gi, "")
    .replace(/\(.*?\)/g, "")
    .replace(/[,;:\-–—]+/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSiren(siret: string | null): string | null {
  if (!siret) return null;
  const cleaned = siret.replace(/\s/g, "");
  return cleaned.length >= 9 ? cleaned.substring(0, 9) : null;
}

// ============================================================
// HELPER: REPAIR TRUNCATED JSON
// ============================================================

function repairTruncatedJson(json: string): string {
  let repaired = json;
  
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escapeNext = false;
  
  for (let i = 0; i < repaired.length; i++) {
    const char = repaired[i];
    
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (inString) continue;
    
    if (char === '{') openBraces++;
    else if (char === '}') openBraces--;
    else if (char === '[') openBrackets++;
    else if (char === ']') openBrackets--;
  }
  
  if (inString) {
    repaired += '"';
  }
  
  repaired = repaired.replace(/,\s*$/, '');
  
  while (openBrackets > 0) {
    repaired += ']';
    openBrackets--;
  }
  
  while (openBraces > 0) {
    repaired += '}';
    openBraces--;
  }
  
  return repaired;
}

// ============================================================
// HELPER: SHA-256 HASH FOR CIRCUIT BREAKER
// ============================================================

async function computeFileHash(data: Uint8Array): Promise<string> {
  const buffer = data.buffer instanceof ArrayBuffer ? data.buffer : new ArrayBuffer(data.byteLength);
  if (!(data.buffer instanceof ArrayBuffer)) {
    new Uint8Array(buffer).set(data);
  }
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================
// CIRCUIT BREAKER: Check recent failures
// ============================================================

async function checkCircuitBreaker(
  supabase: any,
  fileHash: string
): Promise<{ blocked: boolean; reason: string | null; lastFailure: any | null }> {
  const cutoffTime = new Date(Date.now() - CIRCUIT_BREAKER_WINDOW_MS).toISOString();
  
  const { data: recentFailures } = await supabase
    .from("document_extractions")
    .select("id, status, error_code, created_at, provider_calls")
    .eq("file_hash", fileHash)
    .in("status", ["failed", "timeout"])
    .gte("created_at", cutoffTime)
    .order("created_at", { ascending: false })
    .limit(1);
  
  if (recentFailures && recentFailures.length > 0) {
    const failure = recentFailures[0];
    return {
      blocked: true,
      reason: `OCR failed within last 30 minutes (${failure.error_code || failure.status}). Manual retry required.`,
      lastFailure: failure,
    };
  }
  
  return { blocked: false, reason: null, lastFailure: null };
}

// ============================================================
// PHASE 1: EXTRACTION WITH EXTRACT-DOCUMENT CALL
// ============================================================

async function callExtractDocument(
  supabase: any,
  analysisId: string,
  filePath: string,
  extractionId: string
): Promise<{ success: boolean; data?: any; error?: string; errorCode?: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  
  // Update status to extracting
  await supabase
    .from("document_extractions")
    .update({ status: "extracting", started_at: new Date().toISOString() })
    .eq("id", extractionId);
  
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/extract-document`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        analysis_id: analysisId,
        file_path: filePath,
        extraction_id: extractionId,
        freemium_mode: true,
      }),
    });
    
    const result = await response.json();
    
    if (!response.ok || result.error) {
      // Update extraction status to failed
      await supabase
        .from("document_extractions")
        .update({
          status: result.error_code === "OCR_TIMEOUT" ? "timeout" : "failed",
          error_code: result.error_code || "EXTRACTION_FAILED",
          error_details: { message: result.error || result.message, provider_calls: result.provider_calls },
        })
        .eq("id", extractionId);
      
      return { 
        success: false, 
        error: result.error || result.message || "Extraction failed",
        errorCode: result.error_code || "EXTRACTION_FAILED",
      };
    }
    
    // Update status to extracted
    await supabase
      .from("document_extractions")
      .update({ status: "extracted" })
      .eq("id", extractionId);
    
    return { success: true, data: result.data };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown extraction error";
    
    await supabase
      .from("document_extractions")
      .update({
        status: "failed",
        error_code: "EXTRACTION_CALL_FAILED",
        error_details: { message: errorMsg },
      })
      .eq("id", extractionId);
    
    return { success: false, error: errorMsg, errorCode: "EXTRACTION_CALL_FAILED" };
  }
}

// ============================================================
// PHASE 1: EXTRACTION VIA AI (fallback if extract-document unavailable)
// ============================================================

async function extractDataFromDocument(
  base64Content: string,
  mimeType: string,
  lovableApiKey: string,
  retryCount: number = 0
): Promise<ExtractedData> {
  
  const MAX_RETRIES = 2;
  
  const systemPrompt = `Tu es VerifierMonDevis.fr, un outil d'aide à la décision à destination des particuliers.

Tu n'évalues PAS les artisans.
Tu ne portes AUCUN jugement de valeur.
Tu fournis des indicateurs factuels, pédagogiques et vérifiables.

RÈGLES D'EXTRACTION:
1. N'invente AUCUNE information. Si une donnée n'est pas visible, retourne null.
2. Pour le mode de paiement:
   - "espèces" SEULEMENT si les mots "espèces", "cash", "comptant en espèces" sont explicitement présents.
   - Si "chèque", "virement", "carte bancaire", "CB", "à réception", "à la livraison" sont mentionnés, les inclure.
   - Si un IBAN ou RIB est présent, le mode de paiement INCLUT "virement".
   - Ne jamais déduire "espèces" par défaut.
3. Pour les assurances: true si clairement mentionnée, false si absente, null si doute.
4. Pour les travaux: identifier la CATÉGORIE MÉTIER principale même si un produit spécifique/marque est mentionné.
5. LIMITE les travaux aux 5 PRINCIPAUX postes (par montant décroissant).
6. Réponds UNIQUEMENT avec un JSON valide et COMPLET. Ne tronque pas la réponse.

Tu dois effectuer UNE SEULE extraction complète et structurée.`;

  const userPrompt = `Analyse ce document et extrait TOUTES les données factuelles.

IDENTIFICATION DU DOCUMENT:
1. DEVIS DE TRAVAUX : "Devis", montants HT/TTC, descriptions de travaux, assurance décennale
2. DIAGNOSTIC IMMOBILIER : DPE, amiante, plomb, gaz, électricité, ERP, Carrez
3. FACTURE : "Facture", numéro de facture, "Net à payer", travaux passés
4. AUTRE : Document non conforme

EXTRACTION STRICTE - Réponds UNIQUEMENT avec ce JSON COMPLET (max 5 travaux):

{
  "type_document": "devis_travaux | facture | diagnostic_immobilier | autre",
  "entreprise": {
    "nom": "nom exact ou null",
    "siret": "numéro SIRET 14 chiffres sans espaces ou null",
    "adresse": "adresse complète ou null",
    "iban": "IBAN complet ou null",
    "assurance_decennale_mentionnee": true | false | null,
    "assurance_rc_pro_mentionnee": true | false | null,
    "certifications_mentionnees": []
  },
  "client": {
    "adresse_chantier": "adresse complète du chantier ou null",
    "code_postal": "code postal 5 chiffres ou null",
    "ville": "ville ou null"
  },
  "travaux": [
    {
      "libelle": "description courte",
      "categorie": "categorie",
      "montant": 5000,
      "quantite": 50,
      "unite": "m2"
    }
  ],
  "paiement": {
    "acompte_pct": 30,
    "acompte_avant_travaux_pct": null,
    "modes": ["virement"],
    "echeancier_detecte": false
  },
  "dates": {
    "date_devis": "YYYY-MM-DD",
    "date_execution_max": null
  },
  "totaux": {
    "ht": 10000,
    "tva": 2000,
    "ttc": 12000,
    "taux_tva": 20
  },
  "anomalies_detectees": [],
  "resume_factuel": "description factuelle courte"
}`;

  try {
    console.log(`Extraction attempt ${retryCount + 1}/${MAX_RETRIES + 1}`);
    
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
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Content}` } },
            ],
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 4000,
      }),
    });

    if (!aiResponse.ok) {
      const details = await aiResponse.text().catch(() => "");
      console.error("Extract AI error:", aiResponse.status, details);

      if (aiResponse.status === 402) {
        throw new PipelineError({
          status: 402,
          code: "AI_PAYMENT_REQUIRED",
          publicMessage: "Le service d'analyse est temporairement indisponible (crédits IA insuffisants). Veuillez réessayer plus tard.",
        });
      }

      if (aiResponse.status === 429) {
        throw new PipelineError({
          status: 429,
          code: "AI_RATE_LIMIT",
          publicMessage: "Le service d'analyse est temporairement surchargé. Veuillez réessayer dans quelques minutes.",
        });
      }

      throw new PipelineError({
        status: 502,
        code: "AI_GATEWAY_ERROR",
        publicMessage: "Le service d'analyse est temporairement indisponible. Veuillez réessayer plus tard.",
      });
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.log("Direct JSON parse failed, attempting cleanup...");
      
      let cleanedContent = content;
      
      const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonBlockMatch) {
        cleanedContent = jsonBlockMatch[1].trim();
      }
      
      const jsonStart = cleanedContent.indexOf('{');
      const jsonEnd = cleanedContent.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleanedContent = cleanedContent.substring(jsonStart, jsonEnd + 1);
      }
      
      cleanedContent = cleanedContent.replace(/,(\s*[}\]])/g, '$1');
      cleanedContent = repairTruncatedJson(cleanedContent);
      
      try {
        parsed = JSON.parse(cleanedContent);
        console.log("JSON cleanup successful");
      } catch (secondError) {
        console.error("JSON cleanup failed, content sample:", cleanedContent.substring(0, 500));
        
        if (retryCount < MAX_RETRIES) {
          console.log(`Retrying extraction (attempt ${retryCount + 2})...`);
          return extractDataFromDocument(base64Content, mimeType, lovableApiKey, retryCount + 1);
        }
        
        throw new Error(`Failed to parse AI response as JSON after ${MAX_RETRIES + 1} attempts`);
      }
    }
    
    const typeDocument = ["devis_travaux", "facture", "diagnostic_immobilier", "autre"].includes(parsed.type_document) 
      ? parsed.type_document 
      : "autre";

    console.log("PHASE 1 COMPLETE - Extracted:", {
      type: typeDocument,
      entreprise: parsed.entreprise?.nom || "unknown",
      siret: parsed.entreprise?.siret || "unknown",
      travaux_count: parsed.travaux?.length || 0,
      total_ttc: parsed.totaux?.ttc || 0,
      modes_paiement: parsed.paiement?.modes || [],
    });

    return {
      type_document: typeDocument,
      entreprise: {
        nom: parsed.entreprise?.nom || null,
        siret: parsed.entreprise?.siret?.replace(/\s/g, "") || null,
        adresse: parsed.entreprise?.adresse || null,
        iban: parsed.entreprise?.iban || null,
        assurance_decennale_mentionnee: parsed.entreprise?.assurance_decennale_mentionnee ?? null,
        assurance_rc_pro_mentionnee: parsed.entreprise?.assurance_rc_pro_mentionnee ?? null,
        certifications_mentionnees: Array.isArray(parsed.entreprise?.certifications_mentionnees) 
          ? parsed.entreprise.certifications_mentionnees 
          : [],
      },
      client: {
        adresse_chantier: parsed.client?.adresse_chantier || null,
        code_postal: parsed.client?.code_postal || null,
        ville: parsed.client?.ville || null,
      },
      travaux: Array.isArray(parsed.travaux) 
        ? parsed.travaux.slice(0, 5).map((t: any) => ({
            libelle: t.libelle || "",
            categorie: t.categorie || "autre",
            montant: typeof t.montant === "number" ? t.montant : null,
            quantite: typeof t.quantite === "number" ? t.quantite : null,
            unite: t.unite || null,
          }))
        : [],
      paiement: {
        acompte_pct: typeof parsed.paiement?.acompte_pct === "number" ? parsed.paiement.acompte_pct : null,
        acompte_avant_travaux_pct: typeof parsed.paiement?.acompte_avant_travaux_pct === "number" 
          ? parsed.paiement.acompte_avant_travaux_pct 
          : null,
        modes: Array.isArray(parsed.paiement?.modes) ? parsed.paiement.modes : [],
        echeancier_detecte: parsed.paiement?.echeancier_detecte === true,
      },
      dates: {
        date_devis: parsed.dates?.date_devis || null,
        date_execution_max: parsed.dates?.date_execution_max || null,
      },
      totaux: {
        ht: typeof parsed.totaux?.ht === "number" ? parsed.totaux.ht : null,
        tva: typeof parsed.totaux?.tva === "number" ? parsed.totaux.tva : null,
        ttc: typeof parsed.totaux?.ttc === "number" ? parsed.totaux.ttc : null,
        taux_tva: typeof parsed.totaux?.taux_tva === "number" ? parsed.totaux.taux_tva : null,
      },
      anomalies_detectees: Array.isArray(parsed.anomalies_detectees) ? parsed.anomalies_detectees : [],
      resume_factuel: parsed.resume_factuel || "Devis analysé",
    };
    
  } catch (error) {
    if (isPipelineError(error)) throw error;
    
    if (retryCount < MAX_RETRIES) {
      console.log(`Error occurred, retrying (attempt ${retryCount + 2})...`);
      return extractDataFromDocument(base64Content, mimeType, lovableApiKey, retryCount + 1);
    }
    
    throw error;
  }
}

// ============================================================
// PHASE 2: VERIFICATION (all the API calls)
// ============================================================

async function verifyData(
  extracted: ExtractedData,
  supabase: any
): Promise<VerificationResult> {
  
  const result: VerificationResult = {
    entreprise_immatriculee: null,
    entreprise_radiee: null,
    procedure_collective: null,
    capitaux_propres: null,
    capitaux_propres_negatifs: null,
    date_creation: null,
    anciennete_annees: null,
    bilans_disponibles: 0,
    nom_officiel: null,
    adresse_officielle: null,
    ville_officielle: null,
    lookup_status: "skipped",
    iban_verifie: false,
    iban_valide: null,
    iban_pays: null,
    iban_code_pays: null,
    iban_banque: null,
    rge_pertinent: false,
    rge_trouve: false,
    rge_qualifications: [],
    google_trouve: false,
    google_note: null,
    google_nb_avis: null,
    google_match_fiable: false,
    georisques_consulte: false,
    georisques_risques: [],
    georisques_zone_sismique: null,
    georisques_commune: null,
    patrimoine_consulte: false,
    patrimoine_status: "inconnu",
    patrimoine_types: [],
    patrimoine_lat: null,
    patrimoine_lon: null,
    comparaisons_prix: [],
    debug: {
      provider_calls: {
        pappers: {
          enabled: false,
          attempted: false,
          cached: false,
          cache_hit: false,
          http_status: null,
          error: null,
          fetched_at: null,
          expires_at: null,
          latency_ms: null,
        },
      },
    },
  };

  console.log("PHASE 2 - Starting verification...");

  // 1. PAPPERS - Company verification
  const siret = extracted.entreprise.siret;
  const siren = extractSiren(siret);
  
  if (siret && siren) {
    result.debug!.provider_calls.pappers.enabled = true;
    
    // Check cache first
    const { data: cached } = await supabase
      .from("company_cache")
      .select("*")
      .eq("siret", siret)
      .gt("expires_at", new Date().toISOString())
      .single();
    
    if (cached) {
      console.log("Cache HIT for SIRET:", siret);
      result.debug!.provider_calls.pappers.cached = true;
      result.debug!.provider_calls.pappers.cache_hit = true;
      
      if (cached.status === "ok") {
        const payload = cached.payload as CompanyPayload;
        result.entreprise_immatriculee = payload.is_active;
        result.entreprise_radiee = !payload.is_active;
        result.procedure_collective = payload.procedure_collective;
        result.date_creation = payload.date_creation;
        result.anciennete_annees = payload.age_years;
        result.bilans_disponibles = payload.bilans_count;
        result.capitaux_propres = payload.last_bilan_capitaux_propres;
        result.capitaux_propres_negatifs = payload.last_bilan_capitaux_propres !== null 
          ? payload.last_bilan_capitaux_propres < 0 
          : null;
        result.nom_officiel = payload.nom;
        result.adresse_officielle = payload.adresse;
        result.ville_officielle = payload.ville;
        result.lookup_status = "ok";
      } else if (cached.status === "not_found") {
        result.lookup_status = "not_found";
      } else {
        result.lookup_status = "error";
        result.debug!.provider_calls.pappers.error = cached.error_message;
      }
    } else {
      // Call Pappers API
      result.debug!.provider_calls.pappers.attempted = true;
      const pappersKey = Deno.env.get("PAPPERS_API_KEY");
      
      if (pappersKey) {
        const startTime = Date.now();
        try {
          const pappersUrl = `${PAPPERS_API_URL}/entreprise?siret=${siret}&api_token=${pappersKey}`;
          const pappersResponse = await fetch(pappersUrl);
          
          result.debug!.provider_calls.pappers.http_status = pappersResponse.status;
          result.debug!.provider_calls.pappers.latency_ms = Date.now() - startTime;
          result.debug!.provider_calls.pappers.fetched_at = new Date().toISOString();
          result.debug!.provider_calls.pappers.expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          
          if (pappersResponse.ok) {
            const data = await pappersResponse.json();
            
            const dateCreation = data.date_creation || null;
            let ageYears: number | null = null;
            if (dateCreation) {
              const created = new Date(dateCreation);
              ageYears = Math.floor((Date.now() - created.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
            }
            
            const bilans = data.finances || [];
            const lastBilan = bilans[0];
            const capitauxPropres = lastBilan?.capitaux_propres ?? null;
            
            const payload: CompanyPayload = {
              date_creation: dateCreation,
              age_years: ageYears,
              is_active: data.entreprise_cessee !== true,
              bilans_count: bilans.length,
              has_3_bilans: bilans.length >= 3,
              last_bilan_capitaux_propres: capitauxPropres,
              nom: data.nom_entreprise || data.denomination || null,
              adresse: data.siege?.adresse_ligne_1 || null,
              ville: data.siege?.ville || null,
              procedure_collective: data.procedure_collective === true,
            };
            
            // Cache the result
            await supabase.from("company_cache").upsert({
              siret,
              siren,
              provider: "pappers",
              payload,
              status: "ok",
              fetched_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            }, { onConflict: "siret" });
            
            result.entreprise_immatriculee = payload.is_active;
            result.entreprise_radiee = !payload.is_active;
            result.procedure_collective = payload.procedure_collective;
            result.date_creation = payload.date_creation;
            result.anciennete_annees = payload.age_years;
            result.bilans_disponibles = payload.bilans_count;
            result.capitaux_propres = payload.last_bilan_capitaux_propres;
            result.capitaux_propres_negatifs = capitauxPropres !== null ? capitauxPropres < 0 : null;
            result.nom_officiel = payload.nom;
            result.adresse_officielle = payload.adresse;
            result.ville_officielle = payload.ville;
            result.lookup_status = "ok";
            
          } else if (pappersResponse.status === 404) {
            result.lookup_status = "not_found";
            
            await supabase.from("company_cache").upsert({
              siret,
              siren,
              provider: "pappers",
              payload: {},
              status: "not_found",
              fetched_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 1 day for not_found
            }, { onConflict: "siret" });
            
          } else {
            result.lookup_status = "error";
            result.debug!.provider_calls.pappers.error = `API returned ${pappersResponse.status}`;
            
            await supabase.from("company_cache").upsert({
              siret,
              siren,
              provider: "pappers",
              payload: {},
              status: "error",
              error_code: `HTTP_${pappersResponse.status}`,
              error_message: `API returned ${pappersResponse.status}`,
              fetched_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour for errors
            }, { onConflict: "siret" });
          }
        } catch (error) {
          result.lookup_status = "error";
          result.debug!.provider_calls.pappers.error = error instanceof Error ? error.message : "Unknown error";
          result.debug!.provider_calls.pappers.latency_ms = Date.now() - startTime;
        }
      } else {
        result.debug!.provider_calls.pappers.error = "API key not configured";
      }
    }
  } else {
    result.lookup_status = "no_siret";
  }

  // 2. OpenIBAN - IBAN validation
  if (extracted.entreprise.iban) {
    try {
      const ibanClean = extracted.entreprise.iban.replace(/\s/g, "");
      const ibanResponse = await fetch(`${OPENIBAN_API_URL}/${ibanClean}?getBIC=true`);
      
      if (ibanResponse.ok) {
        const ibanData = await ibanResponse.json();
        result.iban_verifie = true;
        result.iban_valide = ibanData.valid === true;
        result.iban_code_pays = ibanClean.substring(0, 2);
        result.iban_pays = getCountryName(result.iban_code_pays);
        result.iban_banque = ibanData.bankData?.name || null;
      }
    } catch (error) {
      console.error("OpenIBAN error:", error);
    }
  }

  // 3. Google Places - Reputation
  const googleApiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
  if (googleApiKey && extracted.entreprise.nom) {
    try {
      const searchQuery = encodeURIComponent(`${extracted.entreprise.nom} entreprise`);
      const placesUrl = `${GOOGLE_PLACES_API_URL}?input=${searchQuery}&inputtype=textquery&fields=name,rating,user_ratings_total&key=${googleApiKey}`;
      
      const placesResponse = await fetch(placesUrl);
      if (placesResponse.ok) {
        const placesData = await placesResponse.json();
        if (placesData.candidates && placesData.candidates.length > 0) {
          const place = placesData.candidates[0];
          result.google_trouve = true;
          result.google_note = place.rating || null;
          result.google_nb_avis = place.user_ratings_total || null;
          result.google_match_fiable = true;
        }
      }
    } catch (error) {
      console.error("Google Places error:", error);
    }
  }

  // 4. RGE - Qualifications
  const workCategories = extracted.travaux.map(t => t.categorie.toLowerCase());
  const rgeRelevantCategories = ["isolation", "chauffage", "pompe à chaleur", "pac", "solaire", "photovoltaique", "renovation_energetique"];
  result.rge_pertinent = workCategories.some(cat => 
    rgeRelevantCategories.some(rge => cat.includes(rge) || rge.includes(cat))
  );
  
  if (result.rge_pertinent && siren) {
    try {
      const rgeResponse = await fetch(`${ADEME_RGE_API_URL}?q=${siren}&size=5`);
      if (rgeResponse.ok) {
        const rgeData = await rgeResponse.json();
        if (rgeData.results && rgeData.results.length > 0) {
          result.rge_trouve = true;
          result.rge_qualifications = rgeData.results.map((r: any) => r.nom_qualification || r.qualification).filter(Boolean);
        }
      }
    } catch (error) {
      console.error("RGE API error:", error);
    }
  }

  // 5. Géorisques - Site context
  const codePostal = extracted.client.code_postal;
  if (codePostal) {
    try {
      // Get coordinates from address
      const adresseQuery = extracted.client.adresse_chantier 
        ? `${extracted.client.adresse_chantier} ${codePostal} ${extracted.client.ville || ""}`
        : `${codePostal} ${extracted.client.ville || ""}`;
      
      const geoResponse = await fetch(`${ADRESSE_API_URL}?q=${encodeURIComponent(adresseQuery)}&limit=1`);
      if (geoResponse.ok) {
        const geoData = await geoResponse.json();
        if (geoData.features && geoData.features.length > 0) {
          const [lon, lat] = geoData.features[0].geometry.coordinates;
          const commune = geoData.features[0].properties.city || geoData.features[0].properties.label;
          
          result.patrimoine_lat = lat;
          result.patrimoine_lon = lon;
          result.georisques_commune = commune;
          
          // Georisques API
          const risquesResponse = await fetch(`${GEORISQUES_API_URL}/resultats_commune?code_insee=${geoData.features[0].properties.citycode || ""}`);
          if (risquesResponse.ok) {
            const risquesData = await risquesResponse.json();
            result.georisques_consulte = true;
            
            if (risquesData.risques_naturels) {
              result.georisques_risques = risquesData.risques_naturels.map((r: any) => r.libelle_risque || r.type).filter(Boolean);
            }
            result.georisques_zone_sismique = risquesData.zone_sismique || null;
          }
          
          // GPU API for heritage
          try {
            const gpuResponse = await fetch(`${GPU_API_URL}?lat=${lat}&lon=${lon}`);
            if (gpuResponse.ok) {
              const gpuData = await gpuResponse.json();
              result.patrimoine_consulte = true;
              
              if (gpuData.features && gpuData.features.length > 0) {
                const heritageTypes = gpuData.features
                  .filter((f: any) => f.properties?.typepsc?.includes("monument") || f.properties?.typepsc?.includes("patrimoine"))
                  .map((f: any) => f.properties?.libelle || f.properties?.typepsc);
                
                if (heritageTypes.length > 0) {
                  result.patrimoine_status = "possible";
                  result.patrimoine_types = heritageTypes;
                } else {
                  result.patrimoine_status = "non_detecte";
                }
              } else {
                result.patrimoine_status = "non_detecte";
              }
            }
          } catch (gpuError) {
            console.error("GPU API error:", gpuError);
          }
        }
      }
    } catch (error) {
      console.error("Géorisques error:", error);
    }
  }

  // 6. Price comparisons
  if (extracted.travaux.length > 0 && codePostal) {
    // Get zone coefficient
    const prefix = codePostal.substring(0, 2);
    const { data: zoneData } = await supabase
      .from("zones_geographiques")
      .select("type_zone, coefficient")
      .eq("prefixe_postal", prefix)
      .single();
    
    const zoneType = zoneData?.type_zone || "france_moyenne";
    const coefficient = zoneData?.coefficient || 1.0;
    
    for (const travail of extracted.travaux) {
      if (travail.montant && travail.quantite && travail.quantite > 0) {
        const prixUnitaire = travail.montant / travail.quantite;
        
        // Get reference prices
        const { data: refPrix } = await supabase
          .from("travaux_reference_prix")
          .select("prix_min_national, prix_max_national, unite")
          .ilike("categorie_travaux", `%${travail.categorie}%`)
          .limit(1)
          .single();
        
        let score: ScoringColor = "VERT";
        let explication = "Prestation spécifique - pas de référence standardisée disponible";
        let fourchetteMin = 0;
        let fourchetteMax = 0;
        
        if (refPrix) {
          fourchetteMin = refPrix.prix_min_national * coefficient;
          fourchetteMax = refPrix.prix_max_national * coefficient;
          
          if (prixUnitaire < fourchetteMin * 0.7) {
            score = "VERT";
            explication = `Prix unitaire (${prixUnitaire.toFixed(2)}€/${travail.unite || "u"}) inférieur à la fourchette basse`;
          } else if (prixUnitaire <= fourchetteMax * 1.3) {
            score = "VERT";
            explication = `Prix unitaire dans la fourchette de marché`;
          } else {
            score = "VERT"; // Price never downgrades score per new rules
            explication = `Prix unitaire au-dessus de la fourchette haute - à contextualiser`;
          }
        }
        
        result.comparaisons_prix.push({
          categorie: travail.categorie,
          libelle: travail.libelle,
          prix_unitaire_devis: prixUnitaire,
          fourchette_min: fourchetteMin,
          fourchette_max: fourchetteMax,
          zone: zoneType,
          score,
          explication,
        });
      }
    }
  }

  console.log("PHASE 2 COMPLETE - Verification:", {
    immatriculee: result.entreprise_immatriculee,
    procedure_collective: result.procedure_collective,
    capitaux_negatifs: result.capitaux_propres_negatifs,
    iban_valide: result.iban_valide,
    google_note: result.google_note,
    pappers_cached: result.debug?.provider_calls.pappers.cache_hit,
  });

  return result;
}

// ============================================================
// PHASE 3: DETERMINISTIC SCORING
// ============================================================

function calculateScore(
  extracted: ExtractedData,
  verified: VerificationResult
): ScoringResult {
  
  const rouges: string[] = [];
  const oranges: string[] = [];
  const verts: string[] = [];
  const informatifs: string[] = [];

  // ROUGE criteria
  if (verified.entreprise_radiee === true) {
    rouges.push("Entreprise radiée des registres officiels (confirmé via API)");
  }

  if (verified.procedure_collective === true) {
    rouges.push("Procédure collective en cours (redressement ou liquidation, confirmé)");
  }

  if (verified.capitaux_propres_negatifs === true && verified.capitaux_propres !== null) {
    const formatted = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(verified.capitaux_propres);
    rouges.push(`Capitaux propres négatifs au dernier bilan (${formatted})`);
  }

  const hasExplicitCash = extracted.paiement.modes.some(m => m.toLowerCase() === "especes");
  if (hasExplicitCash) {
    rouges.push("Paiement en espèces explicitement demandé sur le devis");
  }

  const acompteAvantTravaux = extracted.paiement.acompte_avant_travaux_pct ?? 
    (!extracted.paiement.echeancier_detecte ? extracted.paiement.acompte_pct : null);
  
  if (acompteAvantTravaux !== null && acompteAvantTravaux > 50) {
    rouges.push(`Acompte supérieur à 50% demandé avant travaux (${acompteAvantTravaux}%)`);
  }

  // ORANGE criteria
  if (verified.iban_verifie && verified.iban_valide === true && verified.iban_code_pays && verified.iban_code_pays !== "FR") {
    oranges.push(`IBAN étranger (${getCountryName(verified.iban_code_pays)}) - à confirmer si attendu`);
  }

  if (verified.iban_verifie && verified.iban_valide === false) {
    oranges.push("Format IBAN invalide (erreur de saisie probable)");
  }

  if (acompteAvantTravaux !== null && acompteAvantTravaux > 30 && acompteAvantTravaux <= 50) {
    oranges.push(`Acompte modéré (${acompteAvantTravaux}%) - un acompte ≤ 30% est recommandé`);
  }

  if (verified.google_trouve && verified.google_note !== null && verified.google_note < 4.0) {
    oranges.push(`Note Google inférieure au seuil de confort (${verified.google_note}/5)`);
  }

  if (verified.entreprise_immatriculee === true && verified.anciennete_annees !== null && verified.anciennete_annees < 2) {
    oranges.push(`Entreprise récente (${verified.anciennete_annees} an${verified.anciennete_annees > 1 ? "s" : ""}) - ancienneté à prendre en compte`);
  }

  // INFORMATIF criteria
  if (!extracted.entreprise.iban) {
    informatifs.push("ℹ️ Coordonnées bancaires non détectées sur le devis - demandez un RIB à l'artisan");
  }

  if (!extracted.entreprise.siret) {
    if (extracted.entreprise.nom) {
      informatifs.push("ℹ️ SIRET non détecté sur le devis - demandez-le à l'artisan pour vérification");
    } else {
      informatifs.push("ℹ️ Coordonnées entreprise non identifiées sur le devis");
    }
  }

  if (extracted.entreprise.siret && verified.lookup_status === "error") {
    informatifs.push("ℹ️ Vérification entreprise temporairement indisponible - données à confirmer manuellement");
  } else if (extracted.entreprise.siret && verified.lookup_status === "skipped") {
    informatifs.push("ℹ️ Vérification entreprise non effectuée");
  }

  if (extracted.entreprise.assurance_decennale_mentionnee === false) {
    informatifs.push("ℹ️ Assurance décennale non détectée sur le devis - demandez l'attestation à l'artisan");
  } else if (extracted.entreprise.assurance_decennale_mentionnee === null) {
    informatifs.push("ℹ️ Assurance décennale à confirmer - mention partielle ou absente");
  }

  if (!verified.google_trouve) {
    informatifs.push("ℹ️ Aucun avis Google trouvé pour cette entreprise");
  }

  if (verified.rge_pertinent && !verified.rge_trouve) {
    informatifs.push("ℹ️ Qualification RGE non trouvée - vérifiez l'éligibilité aux aides si applicable");
  }

  if (extracted.travaux.length === 0) {
    informatifs.push("ℹ️ Aucun poste de travaux détaillé détecté sur le devis");
  }

  // VERT criteria
  if (verified.entreprise_immatriculee === true) {
    verts.push("Entreprise identifiée dans les registres officiels");
  }

  if (verified.iban_verifie && verified.iban_valide === true && verified.iban_code_pays === "FR") {
    verts.push("IBAN France valide");
  }

  const hasTraceable = extracted.paiement.modes.some(m => ["virement", "cheque", "carte_bancaire"].includes(m.toLowerCase()));
  if (hasTraceable && !hasExplicitCash) {
    verts.push("Mode de paiement traçable");
  }

  if (acompteAvantTravaux !== null && acompteAvantTravaux <= 30) {
    verts.push(`Acompte raisonnable (${acompteAvantTravaux}%)`);
  }

  if (extracted.entreprise.certifications_mentionnees.some(c => c.toUpperCase().includes("RGE"))) {
    verts.push("Certification RGE mentionnée");
  }
  if (extracted.entreprise.certifications_mentionnees.some(c => c.toUpperCase().includes("QUALIBAT"))) {
    verts.push("Certification QUALIBAT mentionnée");
  }
  if (verified.rge_trouve) {
    verts.push("Qualification RGE vérifiée");
  }

  if (verified.google_trouve && verified.google_note !== null && verified.google_note >= 4.2) {
    verts.push(`Bonne réputation en ligne (${verified.google_note}/5 sur Google)`);
  }

  if (verified.anciennete_annees !== null && verified.anciennete_annees >= 5) {
    verts.push(`Entreprise établie (${verified.anciennete_annees} ans d'ancienneté)`);
  }

  if (verified.capitaux_propres !== null && verified.capitaux_propres >= 0) {
    verts.push("Situation financière saine (capitaux propres positifs)");
  }

  if (extracted.entreprise.assurance_decennale_mentionnee === true) {
    verts.push("Assurance décennale mentionnée sur le devis");
  }

  if (extracted.entreprise.assurance_rc_pro_mentionnee === true) {
    verts.push("RC Pro mentionnée sur le devis");
  }

  // Calculate global score
  let score_global: ScoringColor;
  let explication: string;

  if (rouges.length > 0) {
    score_global = "ROUGE";
    explication = `${rouges.length} point(s) critique(s) détecté(s) nécessitant une attention particulière avant engagement.`;
  } else if (oranges.length > 0) {
    score_global = "ORANGE";
    explication = `${oranges.length} point(s) de vigilance à vérifier. L'ensemble des éléments analysés ne révèle pas de risque critique.`;
  } else {
    score_global = "VERT";
    explication = verts.length > 0 
      ? `Aucun point de vigilance. Éléments positifs : ${verts.slice(0, 3).join(", ")}${verts.length > 3 ? "..." : ""}.`
      : "Aucun point critique ni de vigilance détecté sur ce devis.";
  }

  const scores_blocs = {
    entreprise: rouges.some(r => r.includes("Entreprise") || r.includes("Procédure") || r.includes("Capitaux"))
      ? "ROUGE" as ScoringColor
      : oranges.some(o => o.includes("Entreprise") || o.includes("SIRET") || o.includes("récente") || o.includes("Note Google"))
        ? "ORANGE" as ScoringColor
        : "VERT" as ScoringColor,
    
    devis: oranges.some(o => o.includes("prix") || o.includes("travaux"))
      ? "ORANGE" as ScoringColor
      : "VERT" as ScoringColor,
    
    securite: rouges.some(r => r.includes("Acompte") || r.includes("espèces"))
      ? "ROUGE" as ScoringColor
      : oranges.some(o => o.includes("IBAN") || o.includes("Acompte") || o.includes("Assurance"))
        ? "ORANGE" as ScoringColor
        : "VERT" as ScoringColor,
    
    contexte: "INFORMATIF" as const,
  };

  console.log("PHASE 3 COMPLETE - Scoring:", {
    score_global,
    rouges,
    oranges,
    informatifs_count: informatifs.length,
    verts_count: verts.length,
  });

  console.log("Critères rouges:", rouges);
  console.log("Critères oranges:", oranges);

  return {
    score_global,
    criteres_rouges: rouges,
    criteres_oranges: oranges,
    criteres_verts: verts,
    criteres_informatifs: informatifs,
    explication,
    scores_blocs,
  };
}

// ============================================================
// PHASE 4: RENDER OUTPUT
// ============================================================

function renderOutput(
  extracted: ExtractedData,
  verified: VerificationResult,
  scoring: ScoringResult
): { points_ok: string[]; alertes: string[]; recommandations: string[]; types_travaux: any[] } {
  
  const points_ok: string[] = [];
  const alertes: string[] = [];
  const recommandations: string[] = [];

  // BLOC 1: ENTREPRISE
  if (verified.entreprise_immatriculee === true) {
    points_ok.push(`✓ Entreprise identifiée : ${verified.nom_officiel || extracted.entreprise.nom}`);
    
    if (verified.anciennete_annees !== null) {
      if (verified.anciennete_annees >= 5) {
        points_ok.push(`🟢 Entreprise établie : ${verified.anciennete_annees} ans d'existence`);
      } else if (verified.anciennete_annees >= 2) {
        points_ok.push(`🟠 Entreprise établie depuis ${verified.anciennete_annees} ans`);
      } else {
        alertes.push(`🟠 Entreprise récente (${verified.anciennete_annees} an(s)). L'ancienneté est un indicateur parmi d'autres, elle ne préjuge pas de la qualité du travail.`);
      }
    }

    if (verified.bilans_disponibles >= 3) {
      points_ok.push(`🟢 ${verified.bilans_disponibles} bilans comptables disponibles`);
    } else if (verified.bilans_disponibles > 0) {
      points_ok.push(`🟠 ${verified.bilans_disponibles} bilan(s) comptable(s) disponible(s)`);
    } else {
      points_ok.push("ℹ️ Aucun bilan publié - la vérification financière n'a pas pu être effectuée");
    }

    if (verified.capitaux_propres !== null && verified.capitaux_propres >= 0) {
      const formatted = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(verified.capitaux_propres);
      points_ok.push(`🟢 Capitaux propres positifs (${formatted})`);
    } else if (verified.capitaux_propres_negatifs === true) {
      const formatted = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(verified.capitaux_propres!);
      alertes.push(`🔴 Capitaux propres négatifs (${formatted}). Cet indicateur est basé sur les derniers bilans publiés et peut indiquer une situation financière tendue.`);
    }

    if (verified.procedure_collective === true) {
      alertes.push("🔴 Procédure collective en cours (confirmée via BODACC). Cela indique une situation de redressement ou liquidation judiciaire.");
    } else if (verified.procedure_collective === false) {
      points_ok.push("✓ Aucune procédure collective en cours");
    }
    
  } else if (verified.lookup_status === "not_found") {
    if (extracted.entreprise.nom) {
      points_ok.push(`ℹ️ Entreprise : ${extracted.entreprise.nom}`);
    }
    points_ok.push(`ℹ️ SIRET présent : ${extracted.entreprise.siret}`);
    points_ok.push("ℹ️ Vérification registre non concluante. Cela n'indique pas un problème en soi — vous pouvez vérifier sur societe.com ou infogreffe.fr.");
    
  } else if (verified.lookup_status === "no_siret") {
    if (extracted.entreprise.nom) {
      points_ok.push(`ℹ️ Entreprise : ${extracted.entreprise.nom}`);
    }
    points_ok.push("ℹ️ SIRET non détecté sur le devis, vérification registre non réalisée. Vous pouvez le demander à l'artisan.");
    
  } else if (verified.lookup_status === "error") {
    points_ok.push(`ℹ️ SIRET présent : ${extracted.entreprise.siret}`);
    points_ok.push("ℹ️ Vérification registre indisponible temporairement. Cela n'indique pas un risque en soi.");
    
  } else if (extracted.entreprise.siret) {
    points_ok.push(`ℹ️ SIRET présent : ${extracted.entreprise.siret}`);
    points_ok.push("ℹ️ Vous pouvez vérifier les informations sur societe.com ou infogreffe.fr");
    
  } else {
    if (extracted.entreprise.nom) {
      points_ok.push(`ℹ️ Entreprise : ${extracted.entreprise.nom}`);
    }
    points_ok.push("ℹ️ Informations entreprise partielles. Demandez le SIRET à l'artisan pour une vérification complète.");
  }

  // Google reputation
  if (verified.google_trouve && verified.google_note !== null) {
    if (verified.google_note >= 4.2) {
      points_ok.push(`🟢 Bonne réputation en ligne : ${verified.google_note}/5 (${verified.google_nb_avis} avis Google)`);
    } else if (verified.google_note >= 4.0) {
      points_ok.push(`✓ Réputation en ligne correcte : ${verified.google_note}/5 (${verified.google_nb_avis} avis Google)`);
    } else {
      points_ok.push(`ℹ️ Note Google : ${verified.google_note}/5 (${verified.google_nb_avis} avis)`);
    }
  } else if (!verified.google_trouve && extracted.entreprise.nom) {
    points_ok.push("ℹ️ Aucun avis Google trouvé - cela ne préjuge pas de la qualité de l'entreprise");
  }

  // RGE
  if (verified.rge_trouve) {
    points_ok.push(`🟢 Qualification RGE vérifiée : ${verified.rge_qualifications.slice(0, 2).join(", ")}`);
  } else if (verified.rge_pertinent) {
    points_ok.push("ℹ️ Qualification RGE non trouvée. Si vous visez des aides (MaPrimeRénov', CEE...), demandez le certificat RGE à l'artisan.");
  }

  // Certifications
  if (extracted.entreprise.certifications_mentionnees.some(c => c.toUpperCase().includes("QUALIBAT"))) {
    points_ok.push("🟢 Qualification QUALIBAT mentionnée sur le devis");
  }

  // BLOC 2: DEVIS
  if (verified.comparaisons_prix.length > 0) {
    const identifiedTypes = verified.comparaisons_prix.map(c => c.libelle).slice(0, 3);
    points_ok.push(`✓ Types de travaux identifiés : ${identifiedTypes.join(", ")}`);
    
    for (const comparison of verified.comparaisons_prix) {
      if (comparison.fourchette_min > 0 && comparison.fourchette_max > 0) {
        points_ok.push(`📊 ${comparison.libelle} : ${comparison.explication}`);
      } else {
        points_ok.push(`ℹ️ ${comparison.libelle} : prestation spécifique sans référence standardisée - comparaison non applicable`);
      }
    }
  }

  if (extracted.travaux.length > 0 && verified.comparaisons_prix.length === 0) {
    const travauxLabels = extracted.travaux.slice(0, 3).map(t => t.libelle || t.categorie).join(", ");
    points_ok.push(`ℹ️ Travaux identifiés (${travauxLabels}) - prestations spécifiques sans référence marché standardisée`);
    points_ok.push("ℹ️ L'absence de comparaison chiffrée n'indique pas un problème - elle reflète la nature sur mesure des prestations");
  }

  if (extracted.travaux.length === 0) {
    points_ok.push("ℹ️ Aucun poste de travaux détaillé détecté - vous pouvez demander un devis plus détaillé à l'artisan");
  }

  // BLOC 3: SÉCURITÉ
  const hasTraceable = extracted.paiement.modes.some(m => ["virement", "cheque", "carte_bancaire"].includes(m.toLowerCase()));
  const hasCash = extracted.paiement.modes.some(m => m.toLowerCase() === "especes");

  if (hasCash) {
    alertes.push("🔴 Paiement en espèces explicitement mentionné. Privilégiez un mode de paiement traçable (virement, chèque).");
  } else if (hasTraceable) {
    points_ok.push("✓ Mode de paiement traçable accepté");
  }

  if (verified.iban_verifie) {
    if (verified.iban_valide === true) {
      if (verified.iban_code_pays === "FR") {
        points_ok.push(`✓ IBAN valide et domicilié en France${verified.iban_banque ? ` (${verified.iban_banque})` : ""}`);
      } else {
        alertes.push(`ℹ️ IBAN étranger (${getCountryName(verified.iban_code_pays || "")}) détecté. Cela peut être normal selon le contexte. À vérifier.`);
      }
    } else if (verified.iban_valide === false) {
      alertes.push("ℹ️ Format IBAN à vérifier (possible erreur de saisie sur le devis).");
    }
  } else if (!extracted.entreprise.iban) {
    points_ok.push("ℹ️ Coordonnées bancaires non détectées sur le devis. À demander si paiement par virement.");
  }

  const acompte = extracted.paiement.acompte_avant_travaux_pct ?? extracted.paiement.acompte_pct;
  if (acompte !== null) {
    if (acompte <= 30) {
      points_ok.push(`✓ Acompte raisonnable (${acompte}%)`);
    } else if (acompte <= 50) {
      alertes.push(`ℹ️ Acompte modéré (${acompte}%). Un acompte ≤ 30% est généralement recommandé. Cela reste une pratique courante.`);
    } else {
      alertes.push(`🔴 Acompte élevé (${acompte}%). Un acompte supérieur à 50% avant travaux représente un risque en cas de problème.`);
    }
  }

  if (extracted.paiement.echeancier_detecte) {
    points_ok.push("✓ Échéancier de paiement prévu");
  }

  if (extracted.entreprise.assurance_decennale_mentionnee === true) {
    points_ok.push("✓ Assurance décennale mentionnée sur le devis");
  } else if (extracted.entreprise.assurance_decennale_mentionnee === false) {
    points_ok.push("ℹ️ Assurance décennale non détectée. Demandez l'attestation d'assurance pour confirmer la couverture.");
  } else {
    points_ok.push("ℹ️ Mention d'assurance décennale partielle ou incertaine. Demandez l'attestation pour confirmation.");
  }

  if (extracted.entreprise.assurance_rc_pro_mentionnee === true) {
    points_ok.push("✓ RC Pro mentionnée sur le devis");
  }

  // BLOC 4: CONTEXTE
  if (verified.georisques_consulte) {
    if (verified.georisques_risques.length > 0) {
      points_ok.push(`📍 Contexte chantier (${verified.georisques_commune}) : ${verified.georisques_risques.length} risque(s) naturel(s) - ${verified.georisques_risques.slice(0, 3).join(", ")}`);
    } else {
      points_ok.push(`📍 Contexte chantier (${verified.georisques_commune}) : Aucune contrainte particulière identifiée`);
    }
    if (verified.georisques_zone_sismique) {
      points_ok.push(`📍 Zone sismique : ${verified.georisques_zone_sismique}`);
    }
  } else if (extracted.client.adresse_chantier || extracted.client.code_postal) {
    points_ok.push("📍 Contexte chantier : Adresse détectée mais consultation Géorisques non effectuée");
  } else {
    points_ok.push("📍 Contexte chantier : Adresse non détectée sur le devis");
  }

  if (verified.patrimoine_consulte) {
    if (verified.patrimoine_status === "possible") {
      const typesStr = verified.patrimoine_types.length > 0 
        ? ` (${verified.patrimoine_types.join(", ")})` 
        : "";
      points_ok.push(`📍 Patrimoine / ABF : POSSIBLE — le chantier semble situé dans une zone de protection patrimoniale${typesStr}`);
    } else if (verified.patrimoine_status === "non_detecte") {
      points_ok.push("📍 Patrimoine / ABF : NON DÉTECTÉ — aucune zone patrimoniale n'a été détectée autour de l'adresse du chantier à partir des données publiques disponibles");
    }
  } else if (extracted.client.adresse_chantier || extracted.client.code_postal) {
    points_ok.push("📍 Patrimoine / ABF : INCONNU — l'adresse du chantier n'a pas pu être géolocalisée, la vérification n'a pas pu être réalisée");
  }

  // RECOMMANDATIONS
  recommandations.push(`📊 ${scoring.explication}`);
  recommandations.push("📋 Pour confirmer les assurances, demandez les attestations d'assurance (PDF) à jour.");

  if (scoring.score_global === "ORANGE" && scoring.criteres_rouges.length === 0) {
    recommandations.push("✅ Les points de vigilance listés sont des vérifications de confort recommandées, pas des signaux d'alerte critiques.");
  }

  if (acompte !== null && acompte > 30) {
    recommandations.push("💡 Il est recommandé de limiter l'acompte à 30% maximum du montant total.");
  }

  // TYPES TRAVAUX
  const types_travaux = extracted.travaux.map(t => {
    const priceComparison = verified.comparaisons_prix.find(
      p => p.categorie.toLowerCase() === t.categorie.toLowerCase()
    );
    
    return {
      categorie: t.categorie,
      libelle: t.libelle || t.categorie,
      quantite: t.quantite,
      unite: t.unite || "forfait",
      montant_ht: t.montant,
      score_prix: priceComparison?.score || null,
      fourchette_min: priceComparison?.fourchette_min || null,
      fourchette_max: priceComparison?.fourchette_max || null,
      zone_type: priceComparison?.zone || null,
      explication: priceComparison?.explication || null,
    };
  });

  return { points_ok, alertes, recommandations, types_travaux };
}

// ============ MAIN HANDLER ============
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

    // Download the file for hash computation
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("devis")
      .download(analysis.file_path);

    if (downloadError || !fileData) {
      await supabase
        .from("analyses")
        .update({ status: "error", error_message: "Impossible de télécharger le fichier" })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({ error: "File download failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert to base64 - chunked approach
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Compute file hash for cache and circuit breaker
    const fileHash = await computeFileHash(uint8Array);
    console.log("File hash:", fileHash);
    
    // Generate request ID for tracing
    const requestId = crypto.randomUUID();
    
    // ============ STEP 0: CREATE DOCUMENT_EXTRACTIONS RECORD ============
    // Create immediately to track pipeline status
    const { data: extractionRecord, error: insertError } = await supabase
      .from("document_extractions")
      .insert({
        file_hash: fileHash,
        file_path: analysis.file_path,
        analysis_id: analysisId,
        request_id: requestId,
        status: "created",
        started_at: new Date().toISOString(),
        provider: "pending",
        ocr_used: false,
        cache_hit: false,
      })
      .select()
      .single();
    
    if (insertError) {
      console.error("Failed to create document_extractions record:", insertError);
      // Continue anyway - the analysis should still work
    }
    
    const extractionId = extractionRecord?.id;
    console.log("Created document_extractions record:", extractionId);
    
    // ============ CIRCUIT BREAKER CHECK ============
    const circuitBreaker = await checkCircuitBreaker(supabase, fileHash);
    if (circuitBreaker.blocked) {
      console.log("Circuit breaker triggered:", circuitBreaker.reason);
      
      // Update extraction record with circuit breaker info
      if (extractionId) {
        await supabase
          .from("document_extractions")
          .update({
            status: "failed",
            error_code: "CIRCUIT_BREAKER",
            error_details: { reason: circuitBreaker.reason, last_failure: circuitBreaker.lastFailure },
          })
          .eq("id", extractionId);
      }
      
      await supabase
        .from("analyses")
        .update({ 
          status: "failed", 
          error_message: "OCR a échoué récemment pour ce document. Veuillez relancer manuellement." 
        })
        .eq("id", analysisId);
      
      return new Response(
        JSON.stringify({ 
          error: "CIRCUIT_BREAKER", 
          message: circuitBreaker.reason,
          manual_retry_required: true,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // ============ CHECK CACHE ============
    const { data: cachedExtraction } = await supabase
      .from("document_extractions")
      .select("*")
      .eq("file_hash", fileHash)
      .eq("status", "parsed")
      .gt("expires_at", new Date().toISOString())
      .not("id", "eq", extractionId || "")
      .single();
    
    if (cachedExtraction && cachedExtraction.raw_text) {
      console.log("Cache hit for file hash:", fileHash);
      
      // Update our extraction record with cache info
      if (extractionId) {
        await supabase
          .from("document_extractions")
          .update({
            status: "parsed",
            cache_hit: true,
            raw_text: cachedExtraction.raw_text,
            ocr_debug: cachedExtraction.ocr_debug,
            parser_debug: cachedExtraction.parser_debug,
            qty_ref_debug: cachedExtraction.qty_ref_debug,
            provider: cachedExtraction.provider,
          })
          .eq("id", extractionId);
      }
    }

    // Convert to base64 for AI extraction
    const chunkSize = 8192;
    let binaryString = "";
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      binaryString += String.fromCharCode(...chunk);
    }
    const base64Content = btoa(binaryString);
    
    let mimeType = "application/pdf";
    const fileName = analysis.file_name.toLowerCase();
    if (fileName.endsWith(".png")) mimeType = "image/png";
    else if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) mimeType = "image/jpeg";
    else if (fileName.endsWith(".webp")) mimeType = "image/webp";

    console.log("=== PIPELINE START ===");
    console.log("Analysis ID:", analysisId);
    console.log("File:", analysis.file_name);
    console.log("Request ID:", requestId);

    // ============ PHASE 1: EXTRACTION ============
    let extracted: ExtractedData;
    
    try {
      console.log("--- PHASE 1: EXTRACTION (UN SEUL APPEL IA) ---");
      
      // Update status to extracting
      if (extractionId) {
        await supabase
          .from("document_extractions")
          .update({ status: "extracting" })
          .eq("id", extractionId);
      }
      
      extracted = await extractDataFromDocument(base64Content, mimeType, lovableApiKey);
      
      // Update status to extracted
      if (extractionId) {
        await supabase
          .from("document_extractions")
          .update({ 
            status: "extracted",
            provider: "lovable_ai",
            ocr_used: true,
            raw_text: JSON.stringify(extracted),
            ocr_debug: {
              ocr_provider: "lovable_ai",
              ocr_reason: "direct_ai_extraction",
              request_id: requestId,
            },
          })
          .eq("id", extractionId);
      }
      
      // Handle rejected documents
      if (extracted.type_document === "facture") {
        if (extractionId) {
          await supabase
            .from("document_extractions")
            .update({ status: "parsed" })
            .eq("id", extractionId);
        }
        
        await supabase
          .from("analyses")
          .update({
            status: "completed",
            score: null,
            resume: "Document non conforme : facture détectée",
            points_ok: [],
            alertes: ["Ce document est une facture, pas un devis. VerifierMonDevis.fr analyse uniquement des devis, c'est-à-dire des documents émis AVANT réalisation des travaux."],
            recommandations: ["Veuillez transmettre un devis pour bénéficier de l'analyse."],
            raw_text: JSON.stringify({ type_document: "facture", extracted, document_detection: { type: "facture", analysis_mode: "rejected" } }),
          })
          .eq("id", analysisId);

        return new Response(
          JSON.stringify({ success: true, analysisId, score: null, message: "Document non conforme (facture)" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (extracted.type_document === "autre") {
        if (extractionId) {
          await supabase
            .from("document_extractions")
            .update({ status: "parsed" })
            .eq("id", extractionId);
        }
        
        await supabase
          .from("analyses")
          .update({
            status: "completed",
            score: null,
            resume: "Document non conforme",
            points_ok: [],
            alertes: ["Le document transmis ne correspond pas à un devis de travaux. Veuillez transmettre un devis conforme pour bénéficier de l'analyse."],
            recommandations: ["VerifierMonDevis.fr analyse les devis de travaux de rénovation, construction, plomberie, électricité, etc."],
            raw_text: JSON.stringify({ type_document: "autre", extracted, document_detection: { type: "autre", analysis_mode: "rejected" } }),
          })
          .eq("id", analysisId);

        return new Response(
          JSON.stringify({ success: true, analysisId, score: null, message: "Document non conforme" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

    } catch (error) {
      console.error("Extraction failed:", error);

      const publicMessage = isPipelineError(error) ? error.publicMessage : "Impossible de lire le contenu du fichier";
      const statusCode = isPipelineError(error) ? error.status : 500;
      const errorCode = isPipelineError(error) ? error.code : "EXTRACTION_FAILED";

      // Update extraction record with error
      if (extractionId) {
        await supabase
          .from("document_extractions")
          .update({
            status: "failed",
            error_code: errorCode,
            error_details: { message: publicMessage },
          })
          .eq("id", extractionId);
      }

      await supabase
        .from("analyses")
        .update({ status: "failed", error_message: publicMessage })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({ error: errorCode, message: publicMessage }),
        { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ PHASE 2: VÉRIFICATION (APIs - SANS IA) ============
    console.log("--- PHASE 2: VÉRIFICATION (APIs conditionnées) ---");
    
    if (extractionId) {
      await supabase
        .from("document_extractions")
        .update({ status: "parsing" })
        .eq("id", extractionId);
    }
    
    const verified = await verifyData(extracted, supabase);

    // ============ PHASE 3: SCORING DÉTERMINISTE (SANS IA) ============
    console.log("--- PHASE 3: SCORING DÉTERMINISTE ---");
    const scoring = calculateScore(extracted, verified);

    // ============ PHASE 4: RENDER ============
    console.log("--- PHASE 4: RENDER ---");
    const output = renderOutput(extracted, verified, scoring);

    console.log("=== PIPELINE COMPLETE ===");
    console.log("Final score:", scoring.score_global);
    console.log("Critères rouges:", scoring.criteres_rouges);
    console.log("Critères oranges:", scoring.criteres_oranges.length);

    // Update extraction record to parsed
    if (extractionId) {
      await supabase
        .from("document_extractions")
        .update({
          status: "parsed",
          parser_debug: {
            version: "1.0",
            travaux_count: extracted.travaux.length,
            totaux_detected: extracted.totaux.ttc !== null,
          },
          qty_ref_debug: {
            comparisons_count: verified.comparaisons_prix.length,
            rge_checked: verified.rge_pertinent,
          },
        })
        .eq("id", extractionId);
    }

    // Store debug data
    const rawDataForDebug = JSON.stringify({
      type_document: extracted.type_document,
      extracted,
      verified,
      scoring,
      document_detection: { type: extracted.type_document, analysis_mode: "full" },
    });

    // Update the analysis with results
    const { error: updateError } = await supabase
      .from("analyses")
      .update({
        status: "completed",
        score: scoring.score_global,
        resume: extracted.resume_factuel,
        points_ok: output.points_ok,
        alertes: output.alertes,
        recommandations: output.recommandations,
        raw_text: rawDataForDebug,
        types_travaux: output.types_travaux.length > 0 ? output.types_travaux : null,
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
        score: scoring.score_global,
        companyVerified: verified.entreprise_immatriculee === true,
        message: "Analyse terminée avec succès",
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
