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

// ============ TYPE DEFINITIONS ============
type ScoringColor = "VERT" | "ORANGE" | "ROUGE";
type Confidence = "high" | "medium" | "low";

// Document type detection result
type DocumentType = 
  | "devis_travaux"              // Full analysis + standard scoring
  | "devis_prestation_technique" // Adapted analysis (no market price, no décennale required)
  | "devis_diagnostic_immobilier" // Specific analysis for property diagnostics
  | "facture"                    // Rejected - invoice, not a quote
  | "autre";                     // Rejected - non-conforming document

interface DocumentDetectionResult {
  type: DocumentType;
  confidence: Confidence;
  indicators: string[];       // What led to this classification
  analysis_mode: "full" | "adapted" | "diagnostic" | "rejected";
  rejection_message?: string;
  credibility_message: string;
  diagnostic_types?: string[]; // For diagnostic immobilier: list of detected diagnostics
}

// Reference prices for diagnostic immobilier (indicative national ranges)
const DIAGNOSTIC_REFERENCE_PRICES: Record<string, { min: number; max: number; label: string }> = {
  "dpe": { min: 100, max: 250, label: "DPE (Diagnostic de Performance Énergétique)" },
  "amiante": { min: 80, max: 200, label: "Diagnostic Amiante" },
  "plomb": { min: 100, max: 200, label: "Diagnostic Plomb (CREP)" },
  "gaz": { min: 100, max: 180, label: "Diagnostic Gaz" },
  "electricite": { min: 100, max: 180, label: "Diagnostic Électricité" },
  "erp": { min: 20, max: 50, label: "État des Risques et Pollutions (ERP)" },
  "carrez": { min: 50, max: 150, label: "Métrage Loi Carrez" },
  "boutin": { min: 50, max: 100, label: "Surface habitable (Boutin)" },
  "termites": { min: 80, max: 180, label: "Diagnostic Termites" },
  "assainissement": { min: 100, max: 200, label: "Diagnostic Assainissement" },
  "pack_vente": { min: 290, max: 440, label: "Pack Diagnostics Vente" },
  "pack_location": { min: 190, max: 300, label: "Pack Diagnostics Location" },
  "dtg": { min: 0, max: 0, label: "DTG (Diagnostic Technique Global)" }, // Not comparable
  "pppt": { min: 0, max: 0, label: "PPPT (Plan Pluriannuel de Travaux)" }, // Not comparable
};

// ============ STEP 1: EXTRACT - Structured quote extraction ============
interface QuoteExtracted {
  company: {
    name: string | null;
    siret: string | null;
    siren: string | null;
    address_company: string | null;
    confidence: Confidence;
  };
  chantier: {
    address_chantier: string | null;
    postal_code: string | null;
    city: string | null;
    confidence: Confidence;
  };
  travaux: Array<{
    category: string;
    description: string;
    amount_ht: number | null;
    quantity: number | null;
    unit: string | null;
    confidence: Confidence;
  }>;
  totals: {
    total_ht: number | null;
    total_tva: number | null;
    total_ttc: number | null;
    tva_rate: number | null;
    totals_incoherence: "yes" | "no" | "uncertain";
    incoherence_reason: string | null;
  };
  paiement: {
    payment_methods_detected: string[];
    iban_detected: string | null;
    rib_detected: boolean;
    payment_schedule_text: string | null;
    has_payment_schedule: boolean;
  };
  acompte: {
    deposit_percent: number | null;
    deposit_amount: number | null;
    deposit_before_work_percent: number | null;
  };
  assurances: {
    mentions_decennale: "yes" | "no" | "uncertain";
    mentions_rcpro: "yes" | "no" | "uncertain";
    insurer_name: string | null;
    policy_number: string | null;
    validity_dates_text: string | null;
  };
  labels: {
    mentions_rge: "yes" | "no" | "uncertain";
    mentions_qualibat: "yes" | "no" | "uncertain";
  };
  architecte_moe: {
    detected: boolean;
    type: "architecte" | "maitre_oeuvre" | null;
    name: string | null;
    honoraires_ht: number | null;
  };
  anomalies: string[];
  resume: string;
}

// ============ STEP 2: VERIFY - Verification results ============
interface QuoteVerified {
  // Pappers company info
  company_found: boolean;
  // Whether the official lookup succeeded, failed, or explicitly confirmed not found
  company_lookup_status: "ok" | "not_found" | "error" | "skipped";
  company_name: string | null;
  date_creation: string | null;
  anciennete_years: number | null;
  bilans_disponibles: number;
  capitaux_propres: number | null;
  capitaux_propres_positifs: boolean | null;
  procedure_collective: boolean;
  company_address: string | null;
  company_city: string | null;
  
  // IBAN verification
  iban_verified: boolean;
  iban_valid: boolean | null;
  iban_country: string | null;
  iban_country_code: string | null;
  iban_bank_name: string | null;
  
  // RGE verification
  rge_relevant: boolean;
  rge_found: boolean;
  rge_qualifications: string[];
  
  // Google Places
  google_found: boolean;
  google_rating: number | null;
  google_reviews_count: number | null;
  google_match_confidence: Confidence;
  
  // Géorisques
  georisques_queried: boolean;
  georisques_risks: string[];
  georisques_seismic_zone: string | null;
  georisques_commune: string | null;
  
  // Price comparison
  price_comparisons: Array<{
    category: string;
    label: string;
    unit_price_quote: number;
    range_min: number;
    range_max: number;
    zone_type: string;
    score: ScoringColor;
    explanation: string;
  }>;
}

// ============ STEP 3: SCORE - Scoring result ============
interface ScoringResult {
  global_score: ScoringColor;
  criteres_critiques: string[];
  criteres_majeurs: string[];
  criteres_confort: string[];
  score_explanation: string;
  bloc_scores: {
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

// ============ STEP 0: DETECT DOCUMENT TYPE ============
async function detectDocumentType(
  base64Content: string,
  mimeType: string,
  lovableApiKey: string
): Promise<DocumentDetectionResult> {
  const systemPrompt = `Tu es un expert en classification de documents commerciaux français. Tu identifies le type de document transmis avec précision.`;

  const userPrompt = `Analyse ce document et détermine son type parmi les catégories suivantes :

1. DEVIS DE TRAVAUX : Document préparatoire proposant des travaux de construction, rénovation, installation (plomberie, électricité, toiture, isolation, peinture, maçonnerie, menuiserie, etc.)
   Indices : "Devis", montants HT/TTC, descriptions de travaux, mentions d'assurance décennale, dates de validité

2. DEVIS DE DIAGNOSTIC IMMOBILIER : Document proposant des diagnostics obligatoires ou facultatifs liés à un bien immobilier
   Indices : DPE, amiante, plomb, gaz, électricité, ERP, Carrez, Boutin, termites, DTG, PPPT, "diagnostic immobilier", "pack vente", "pack location", certification diagnostiqueur
   CE TYPE EST PRIORITAIRE si des diagnostics immobiliers sont détectés

3. DEVIS DE PRESTATION TECHNIQUE : Document proposant des services intellectuels ou techniques liés au bâtiment (audit énergétique, étude thermique, expertise, contrôle technique) MAIS PAS de diagnostics immobiliers
   Indices : "Devis", "Audit", "Étude", honoraires, mission intellectuelle

4. FACTURE : Document émis APRÈS réalisation de travaux ou prestations
   Indices : "Facture", numéro de facture, "Net à payer", référence à des travaux passés, date d'échéance de paiement

5. AUTRE : Document qui n'est pas un devis ni une facture (bon de commande, contrat, attestation, courrier, etc.)

Réponds UNIQUEMENT avec ce JSON :
{
  "type": "devis_travaux | devis_diagnostic_immobilier | devis_prestation_technique | facture | autre",
  "confidence": "high | medium | low",
  "indicators": ["liste des éléments qui ont permis cette classification"],
  "document_title": "titre du document s'il est visible",
  "diagnostics_detected": ["dpe", "amiante", "plomb", "gaz", "electricite", "erp", "carrez", "boutin", "termites", "dtg", "pppt"] // uniquement si type = devis_diagnostic_immobilier
}`;

  try {
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
      }),
    });

    if (!aiResponse.ok) {
      console.error("Document detection AI error:", aiResponse.status);
      // Default to devis_travaux if detection fails to not block the user
      return {
        type: "devis_travaux",
        confidence: "low",
        indicators: ["Détection automatique non concluante - analyse standard appliquée"],
        analysis_mode: "full",
        credibility_message: "L'objectif de VerifierMonDevis.fr est de fournir une analyse pertinente et fiable.",
      };
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content;
    if (!content) {
      return {
        type: "devis_travaux",
        confidence: "low",
        indicators: ["Réponse AI vide - analyse standard appliquée"],
        analysis_mode: "full",
        credibility_message: "L'objectif de VerifierMonDevis.fr est de fournir une analyse pertinente et fiable.",
      };
    }

    const parsed = JSON.parse(content);
    const detectedType: DocumentType = 
      ["devis_travaux", "devis_diagnostic_immobilier", "devis_prestation_technique", "facture", "autre"].includes(parsed.type) 
        ? parsed.type 
        : "devis_travaux";

    const result: DocumentDetectionResult = {
      type: detectedType,
      confidence: parsed.confidence || "medium",
      indicators: Array.isArray(parsed.indicators) ? parsed.indicators : [],
      analysis_mode: "full",
      credibility_message: "L'objectif de VerifierMonDevis.fr est de fournir une analyse pertinente et fiable. Lorsque le document transmis ne correspond pas à un devis de travaux, l'analyse est volontairement limitée ou refusée afin d'éviter toute interprétation incorrecte.",
      diagnostic_types: Array.isArray(parsed.diagnostics_detected) ? parsed.diagnostics_detected : [],
    };

    // Set analysis mode and messages based on document type
    switch (detectedType) {
      case "devis_travaux":
        result.analysis_mode = "full";
        result.credibility_message = "Document identifié comme un devis de travaux - analyse complète appliquée.";
        break;
      
      case "devis_diagnostic_immobilier":
        result.analysis_mode = "diagnostic";
        result.credibility_message = "Ce devis concerne des diagnostics immobiliers. L'analyse est adaptée : pas d'exigence d'assurance décennale ni de certification RGE/Qualibat. Les tarifs des diagnostics immobiliers sont libres et peuvent varier selon la taille du bien, sa localisation et le nombre de diagnostics requis. Les comparaisons de prix sont fournies à titre indicatif afin d'aider à situer le devis par rapport aux pratiques courantes.";
        break;
        
      case "devis_prestation_technique":
        result.analysis_mode = "adapted";
        result.credibility_message = "Ce devis concerne une prestation technique (audit, étude, expertise). L'analyse est adaptée à la nature de la mission : la comparaison aux prix de marché travaux et l'exigence d'assurance décennale ne s'appliquent pas.";
        break;
        
      case "facture":
        result.analysis_mode = "rejected";
        result.rejection_message = "Le document transmis est une facture. VerifierMonDevis.fr analyse uniquement des devis, c'est-à-dire des documents émis AVANT réalisation des travaux. Une facture correspond à un document de règlement post-travaux.";
        break;
        
      case "autre":
        result.analysis_mode = "rejected";
        result.rejection_message = "Le document transmis ne correspond pas à un devis de travaux ou de prestation technique. Veuillez transmettre un devis conforme pour bénéficier de l'analyse.";
        break;
    }

    return result;
  } catch (error) {
    console.error("Document detection error:", error);
    // Default to full analysis if detection fails
    return {
      type: "devis_travaux",
      confidence: "low",
      indicators: ["Erreur de détection - analyse standard appliquée"],
      analysis_mode: "full",
      credibility_message: "L'objectif de VerifierMonDevis.fr est de fournir une analyse pertinente et fiable.",
    };
  }
}

// ============ STEP 1: EXTRACT ============
async function extractQuoteData(
  base64Content: string,
  mimeType: string,
  lovableApiKey: string,
  documentType: DocumentType = "devis_travaux"
): Promise<QuoteExtracted> {
  const systemPrompt = `Tu es un expert en extraction de données de devis travaux. Tu extrais UNIQUEMENT les informations présentes dans le document, sans inventer de données. Réponds uniquement avec un JSON valide.`;

  const userPrompt = `Analyse ce devis et extrait les informations avec précision.

RÈGLES CRITIQUES:
1. N'invente AUCUNE information. Si une donnée n'est pas visible, retourne null.
2. Pour le mode de paiement: NE JAMAIS déduire "espèces" par défaut. "espèces" SEULEMENT si les mots "espèces", "cash", "comptant en espèces" sont explicitement présents.
3. Si un IBAN ou RIB est présent, le mode de paiement principal est virement, pas espèces.
4. Pour les assurances: si mentionnée = "yes", si doute = "uncertain", si vraiment absente = "no".

EXTRACTION DEMANDÉE:

{
  "company": {
    "name": "nom de l'entreprise ou null",
    "siret": "numéro SIRET 14 chiffres ou null",
    "siren": "numéro SIREN 9 chiffres ou null (extrait du SIRET si besoin)",
    "address_company": "adresse complète de l'entreprise ou null",
    "confidence": "high/medium/low"
  },
  "chantier": {
    "address_chantier": "adresse complète du chantier ou null",
    "postal_code": "code postal 5 chiffres ou null",
    "city": "ville ou null",
    "confidence": "high/medium/low"
  },
  "travaux": [
    {
      "category": "plomberie|electricite|chauffage_pac|isolation|toiture|menuiserie|peinture|maconnerie|renovation_sdb|renovation_cuisine|carrelage|parquet|facade|renovation_globale|autre",
      "description": "description exacte du devis",
      "amount_ht": 5000,
      "quantity": 50,
      "unit": "m²|unité|forfait|ml",
      "confidence": "high/medium/low"
    }
  ],
  "totals": {
    "total_ht": 10000,
    "total_tva": 2000,
    "total_ttc": 12000,
    "tva_rate": 20,
    "totals_incoherence": "yes si total != somme des lignes, no si cohérent, uncertain si impossible à vérifier",
    "incoherence_reason": "explication si incohérence détectée ou null"
  },
  "paiement": {
    "payment_methods_detected": ["virement", "cheque", "carte_bancaire"] (JAMAIS "especes" sauf si explicitement mentionné),
    "iban_detected": "FR7612345678901234567890123 ou null",
    "rib_detected": true/false,
    "payment_schedule_text": "description de l'échéancier si présent ou null",
    "has_payment_schedule": true si échéancier en plusieurs versements
  },
  "acompte": {
    "deposit_percent": 30,
    "deposit_amount": 3000,
    "deposit_before_work_percent": pourcentage réellement dû AVANT le début des travaux (si échéancier, c'est le premier versement)
  },
  "assurances": {
    "mentions_decennale": "yes si clairement mentionnée, uncertain si partielle ou doute, no si vraiment absente",
    "mentions_rcpro": "yes si clairement mentionnée, uncertain si partielle ou doute, no si vraiment absente",
    "insurer_name": "nom de l'assureur ou null",
    "policy_number": "numéro de police ou null",
    "validity_dates_text": "dates de validité ou null"
  },
  "labels": {
    "mentions_rge": "yes/no/uncertain",
    "mentions_qualibat": "yes/no/uncertain"
  },
  "architecte_moe": {
    "detected": true/false,
    "type": "architecte ou maitre_oeuvre ou null",
    "name": "nom ou null",
    "honoraires_ht": 1500 ou null
  },
  "anomalies": ["liste des incohérences ou anomalies détectées dans le devis"],
  "resume": "résumé clair et pédagogique du devis pour un particulier"
}`;


  try {
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
      }),
    });

    if (!aiResponse.ok) {
      const details = await aiResponse.text().catch(() => "");
      console.error("Extract AI error:", aiResponse.status, details);

      if (aiResponse.status === 402) {
        throw new PipelineError({
          status: 402,
          code: "AI_PAYMENT_REQUIRED",
          publicMessage:
            "Le service d'analyse est temporairement indisponible (crédits IA insuffisants). Veuillez réessayer plus tard ou ajouter des crédits.",
        });
      }

      if (aiResponse.status === 429) {
        throw new PipelineError({
          status: 429,
          code: "AI_RATE_LIMIT",
          publicMessage:
            "Le service d'analyse est temporairement surchargé (trop de demandes). Veuillez réessayer dans quelques minutes.",
        });
      }

      throw new PipelineError({
        status: 502,
        code: "AI_GATEWAY_ERROR",
        publicMessage:
          "Le service d'analyse est temporairement indisponible. Veuillez réessayer plus tard.",
      });
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");

    const parsed = JSON.parse(content);
    
    // Normalize and validate extracted data
    const extracted: QuoteExtracted = {
      company: {
        name: parsed.company?.name || null,
        siret: parsed.company?.siret?.replace(/\s/g, "") || null,
        siren: parsed.company?.siren?.replace(/\s/g, "") || null,
        address_company: parsed.company?.address_company || null,
        confidence: parsed.company?.confidence || "medium",
      },
      chantier: {
        address_chantier: parsed.chantier?.address_chantier || null,
        postal_code: parsed.chantier?.postal_code || null,
        city: parsed.chantier?.city || null,
        confidence: parsed.chantier?.confidence || "medium",
      },
      travaux: Array.isArray(parsed.travaux) ? parsed.travaux.map((t: any) => ({
        category: t.category || "autre",
        description: t.description || "",
        amount_ht: typeof t.amount_ht === "number" ? t.amount_ht : null,
        quantity: typeof t.quantity === "number" ? t.quantity : null,
        unit: t.unit || null,
        confidence: t.confidence || "medium",
      })) : [],
      totals: {
        total_ht: typeof parsed.totals?.total_ht === "number" ? parsed.totals.total_ht : null,
        total_tva: typeof parsed.totals?.total_tva === "number" ? parsed.totals.total_tva : null,
        total_ttc: typeof parsed.totals?.total_ttc === "number" ? parsed.totals.total_ttc : null,
        tva_rate: typeof parsed.totals?.tva_rate === "number" ? parsed.totals.tva_rate : null,
        totals_incoherence: parsed.totals?.totals_incoherence || "uncertain",
        incoherence_reason: parsed.totals?.incoherence_reason || null,
      },
      paiement: {
        payment_methods_detected: Array.isArray(parsed.paiement?.payment_methods_detected) 
          ? parsed.paiement.payment_methods_detected.filter((m: string) => 
              ["virement", "cheque", "carte_bancaire", "especes"].includes(m.toLowerCase())
            )
          : [],
        iban_detected: parsed.paiement?.iban_detected || null,
        rib_detected: Boolean(parsed.paiement?.rib_detected),
        payment_schedule_text: parsed.paiement?.payment_schedule_text || null,
        has_payment_schedule: Boolean(parsed.paiement?.has_payment_schedule),
      },
      acompte: {
        deposit_percent: typeof parsed.acompte?.deposit_percent === "number" ? parsed.acompte.deposit_percent : null,
        deposit_amount: typeof parsed.acompte?.deposit_amount === "number" ? parsed.acompte.deposit_amount : null,
        deposit_before_work_percent: typeof parsed.acompte?.deposit_before_work_percent === "number" 
          ? parsed.acompte.deposit_before_work_percent : null,
      },
      assurances: {
        mentions_decennale: parsed.assurances?.mentions_decennale || "uncertain",
        mentions_rcpro: parsed.assurances?.mentions_rcpro || "uncertain",
        insurer_name: parsed.assurances?.insurer_name || null,
        policy_number: parsed.assurances?.policy_number || null,
        validity_dates_text: parsed.assurances?.validity_dates_text || null,
      },
      labels: {
        mentions_rge: parsed.labels?.mentions_rge || "uncertain",
        mentions_qualibat: parsed.labels?.mentions_qualibat || "uncertain",
      },
      architecte_moe: {
        detected: Boolean(parsed.architecte_moe?.detected),
        type: parsed.architecte_moe?.type || null,
        name: parsed.architecte_moe?.name || null,
        honoraires_ht: typeof parsed.architecte_moe?.honoraires_ht === "number" ? parsed.architecte_moe.honoraires_ht : null,
      },
      anomalies: Array.isArray(parsed.anomalies) ? parsed.anomalies : [],
      resume: parsed.resume || "Analyse du devis en cours.",
    };

    // CRITICAL: If IBAN/RIB is present, remove "especes" from payment methods
    if (extracted.paiement.iban_detected || extracted.paiement.rib_detected) {
      extracted.paiement.payment_methods_detected = extracted.paiement.payment_methods_detected
        .filter(m => m.toLowerCase() !== "especes");
    }

    // Extract SIREN from SIRET if needed
    if (!extracted.company.siren && extracted.company.siret && extracted.company.siret.length >= 9) {
      extracted.company.siren = extracted.company.siret.substring(0, 9);
    }

    return extracted;
  } catch (error) {
    console.error("Extract error:", error);
    throw error;
  }
}

// ============ STEP 2: VERIFY ============

// 2.1 Verify IBAN with OpenIBAN
async function verifyIBAN(iban: string | null): Promise<{
  verified: boolean;
  valid: boolean | null;
  country: string | null;
  countryCode: string | null;
  bankName: string | null;
}> {
  if (!iban) return { verified: false, valid: null, country: null, countryCode: null, bankName: null };

  // Anti-faux-rouge: un échec API ne doit JAMAIS être interprété comme "IBAN invalide".
  try {
    const response = await fetch(`${OPENIBAN_API_URL}/${iban}?getBIC=true&validateBankCode=true`);

    if (!response.ok) {
      return {
        verified: false,
        valid: null,
        country: null,
        countryCode: iban.substring(0, 2),
        bankName: null,
      };
    }

    const data = await response.json();
    return {
      verified: true,
      valid: data.valid === true,
      country: data.bankData?.country || null,
      countryCode: data.bankData?.countryCode || iban.substring(0, 2),
      bankName: data.bankData?.name || null,
    };
  } catch (error) {
    console.error("IBAN verification error:", error);
    return {
      verified: false,
      valid: null,
      country: null,
      countryCode: iban.substring(0, 2),
      bankName: null,
    };
  }
}

// 2.2 Verify company with Pappers
async function verifyCompany(siret: string | null): Promise<{
  found: boolean;
  lookup_status: "ok" | "not_found" | "error" | "skipped";
  name: string | null;
  date_creation: string | null;
  anciennete_years: number | null;
  bilans_count: number;
  capitaux_propres: number | null;
  capitaux_propres_positifs: boolean | null;
  procedure_collective: boolean;
  address: string | null;
  city: string | null;
}> {
  const defaultResult = {
    found: false,
    lookup_status: "skipped" as const,
    name: null,
    date_creation: null,
    anciennete_years: null,
    bilans_count: 0,
    capitaux_propres: null,
    capitaux_propres_positifs: null,
    procedure_collective: false,
    address: null,
    city: null,
  };

  if (!siret) return defaultResult;

  const pappersApiKey = Deno.env.get("PAPPERS_API_KEY");
  if (!pappersApiKey) {
    console.log("Pappers API key not configured");
    return defaultResult;
  }

  const siren = siret.replace(/\s/g, "").substring(0, 9);
  if (siren.length < 9 || !/^\d{9}$/.test(siren)) {
    console.log("Invalid SIREN format:", siren);
    return defaultResult;
  }

  try {
    const response = await fetch(`${PAPPERS_API_URL}/entreprise?siren=${siren}&api_token=${pappersApiKey}`);

    // 404 = preuve négative explicite: entreprise introuvable dans les registres via l'API
    if (response.status === 404) {
      return { ...defaultResult, lookup_status: "not_found" as const };
    }

    // Autres erreurs = incertitude (réseau, quota, 401, etc.) → ne pas conclure négativement
    if (!response.ok) {
      console.error("Pappers API error:", response.status);
      return { ...defaultResult, lookup_status: "error" as const };
    }

    const data = await response.json();

    let ancienneteYears: number | null = null;
    if (data.date_creation) {
      const creationDate = new Date(data.date_creation);
      const now = new Date();
      ancienneteYears = Math.floor(
        (now.getTime() - creationDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
      );
    }

    let bilansCount = 0;
    let capitauxPropres: number | null = null;
    if (data.comptes && Array.isArray(data.comptes)) {
      bilansCount = data.comptes.length;
      if (data.comptes.length > 0 && data.comptes[0].capitaux_propres !== undefined) {
        capitauxPropres = data.comptes[0].capitaux_propres;
      }
    } else if (data.derniers_comptes) {
      bilansCount = 1;
      if (data.derniers_comptes.capitaux_propres !== undefined) {
        capitauxPropres = data.derniers_comptes.capitaux_propres;
      }
    }

    return {
      found: true,
      lookup_status: "ok" as const,
      name: data.nom_entreprise || null,
      date_creation: data.date_creation || null,
      anciennete_years: ancienneteYears,
      bilans_count: bilansCount,
      capitaux_propres: capitauxPropres,
      capitaux_propres_positifs: capitauxPropres !== null ? capitauxPropres >= 0 : null,
      procedure_collective: Boolean(data.procedure_collective),
      address: data.siege?.adresse_ligne_1 || null,
      city: data.siege?.ville || null,
    };
  } catch (error) {
    console.error("Pappers error:", error);
    return { ...defaultResult, lookup_status: "error" as const };
  }
}

// 2.3 Check BODACC for procedures
async function checkBodacc(siren: string | null): Promise<boolean> {
  if (!siren || siren.length < 9) return false;
  
  try {
    const response = await fetch(
      `${BODACC_API_URL}?where=numeroIdentifiantRcs%3D%22${siren}%22%20AND%20(typeavis%3D%22Jugement%22%20OR%20typeavis%3D%22Jugement%20d'ouverture%22)&limit=1`
    );
    if (!response.ok) return false;
    const data = await response.json();
    return data.total_count > 0;
  } catch {
    return false;
  }
}

// 2.4 Check RGE qualification
const RGE_RELEVANT_KEYWORDS = [
  // RGE uniquement si travaux éligibles aux aides (rénovation énergétique)
  "isolation",
  "isolant",
  "combles",
  "pompe à chaleur",
  "pac",
  "photovoltaïque",
  "solaire",
  "vmc",
  "ventilation",
  "rénovation énergétique",
];

async function checkRGE(
  siret: string | null,
  travaux: QuoteExtracted["travaux"]
): Promise<{ relevant: boolean; found: boolean; qualifications: string[] }> {
  // Check if RGE is relevant for the work types
  const travauxText = travaux.map(t => `${t.category} ${t.description}`).join(" ").toLowerCase();
  const isRelevant = RGE_RELEVANT_KEYWORDS.some(kw => travauxText.includes(kw.toLowerCase()));
  
  if (!isRelevant || !siret) {
    return { relevant: isRelevant, found: false, qualifications: [] };
  }

  const siren = siret.replace(/\s/g, "").substring(0, 9);
  
  try {
    const response = await fetch(`${ADEME_RGE_API_URL}?q=${siren}&q_fields=siret&size=10`);
    if (!response.ok) return { relevant: true, found: false, qualifications: [] };
    
    const data = await response.json();
    if (data.total === 0 || !data.results) return { relevant: true, found: false, qualifications: [] };

    const qualifications = data.results
      .filter((r: any) => r.siret?.startsWith(siren))
      .map((r: any) => r.nom_qualification || r.domaine)
      .filter(Boolean);
    
    return { relevant: true, found: qualifications.length > 0, qualifications };
  } catch {
    return { relevant: true, found: false, qualifications: [] };
  }
}

// 2.5 Google Places rating
async function getGoogleRating(
  companyName: string | null,
  address: string | null,
  city: string | null
): Promise<{
  found: boolean;
  rating: number | null;
  reviews_count: number | null;
  match_confidence: Confidence;
}> {
  const googleApiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
  if (!googleApiKey || !companyName) return { found: false, rating: null, reviews_count: null, match_confidence: "low" };

  const searchInput = `${companyName} ${address || ""} ${city || ""}`.trim();
  if (searchInput.length < 3) return { found: false, rating: null, reviews_count: null, match_confidence: "low" };

  try {
    const params = new URLSearchParams({
      input: searchInput,
      inputtype: "textquery",
      fields: "name,rating,user_ratings_total",
      key: googleApiKey,
    });

    const response = await fetch(`${GOOGLE_PLACES_API_URL}?${params.toString()}`);
    if (!response.ok) return { found: false, rating: null, reviews_count: null, match_confidence: "low" };

    const data = await response.json();
    if (data.status !== "OK" || !data.candidates?.length) {
      return { found: false, rating: null, reviews_count: null, match_confidence: "low" };
    }

    const place = data.candidates[0];
    const rating = place.rating;
    const reviewsCount = place.user_ratings_total || 0;

    // Determine match confidence based on name similarity
    const placeName = (place.name || "").toLowerCase();
    const searchName = companyName.toLowerCase();
    const matchConfidence: Confidence = placeName.includes(searchName) || searchName.includes(placeName) 
      ? "high" : "medium";

    return {
      found: true,
      rating: rating !== undefined ? rating : null,
      reviews_count: reviewsCount,
      match_confidence: matchConfidence,
    };
  } catch (error) {
    console.error("Google Places error:", error);
    return { found: false, rating: null, reviews_count: null, match_confidence: "low" };
  }
}

// 2.6 Géorisques
async function getGeorisques(
  address: string | null,
  postalCode: string | null
): Promise<{
  queried: boolean;
  risks: string[];
  seismic_zone: string | null;
  commune: string | null;
}> {
  const defaultResult = { queried: false, risks: [], seismic_zone: null, commune: null };
  
  const addressToGeocode = address || postalCode;
  if (!addressToGeocode) return defaultResult;

  try {
    // Geocode address
    const cleanedAddress = cleanAddress(addressToGeocode);
    if (cleanedAddress.length < 5) return defaultResult;

    const geocodeResponse = await fetch(`${ADRESSE_API_URL}?q=${encodeURIComponent(cleanedAddress)}&limit=1`);
    if (!geocodeResponse.ok) return defaultResult;

    const geocodeData = await geocodeResponse.json();
    if (!geocodeData.features?.length) return defaultResult;

    const codeInsee = geocodeData.features[0].properties?.citycode;
    const commune = geocodeData.features[0].properties?.city;
    if (!codeInsee) return defaultResult;

    // Fetch risks and seismic zone in parallel
    const [risksResponse, seismicResponse] = await Promise.all([
      fetch(`${GEORISQUES_API_URL}/gaspar/risques?code_insee=${codeInsee}`),
      fetch(`${GEORISQUES_API_URL}/zonage_sismique?code_insee=${codeInsee}`),
    ]);

    const risks: string[] = [];
    let seismicZone: string | null = null;

    if (risksResponse.ok) {
      const risksData = await risksResponse.json();
      if (risksData.data?.[0]?.risques_detail) {
        for (const risque of risksData.data[0].risques_detail) {
          if (risque.num_risque?.startsWith("1") && risque.num_risque.length <= 2) {
            if (!risks.includes(risque.libelle_risque_long)) {
              risks.push(risque.libelle_risque_long);
            }
          }
        }
      }
    }

    if (seismicResponse.ok) {
      const seismicData = await seismicResponse.json();
      if (seismicData.data?.[0]?.zone_sismicite) {
        seismicZone = seismicData.data[0].zone_sismicite;
      }
    }

    return { queried: true, risks, seismic_zone: seismicZone, commune };
  } catch (error) {
    console.error("Georisques error:", error);
    return defaultResult;
  }
}

// 2.7 Price comparison
interface TravauxReferencePrix {
  categorie_travaux: string;
  unite: string;
  prix_min_national: number;
  prix_max_national: number;
}

interface ZoneGeographique {
  prefixe_postal: string;
  type_zone: string;
  coefficient: number;
}

function comparePrices(
  travaux: QuoteExtracted["travaux"],
  postalCode: string | null,
  referencePrix: TravauxReferencePrix[],
  zones: ZoneGeographique[]
): QuoteVerified["price_comparisons"] {
  const comparisons: QuoteVerified["price_comparisons"] = [];
  
  if (!postalCode) return comparisons;

  const prefix = postalCode.substring(0, 2);
  const zone = zones.find(z => z.prefixe_postal === prefix);
  const coefficient = zone?.coefficient || 0.90;
  const zoneType = zone?.type_zone || "province";

  for (const t of travaux) {
    if (!t.quantity || !t.amount_ht || t.quantity <= 0) continue;

    const reference = referencePrix.find(r => 
      r.categorie_travaux.toLowerCase() === t.category.toLowerCase()
    );
    if (!reference) continue;

    const unitPrice = t.amount_ht / t.quantity;
    const rangeMin = reference.prix_min_national * coefficient;
    const rangeMax = reference.prix_max_national * coefficient;

    let score: ScoringColor;
    let explanation: string;
    const label = t.description || t.category;

    if (unitPrice < rangeMin * 0.7) {
      score = "ROUGE";
      explanation = `Prix anormalement bas (${unitPrice.toFixed(2)}€/${reference.unite} vs ${rangeMin.toFixed(2)}€-${rangeMax.toFixed(2)}€)`;
    } else if (unitPrice < rangeMin) {
      score = "ORANGE";
      explanation = `Prix en dessous du marché`;
    } else if (unitPrice <= rangeMax) {
      score = "VERT";
      explanation = `Prix cohérent avec le marché`;
    } else if (unitPrice <= rangeMax * 1.3) {
      score = "ORANGE";
      explanation = `Prix au-dessus du marché`;
    } else {
      score = "ROUGE";
      explanation = `Prix très supérieur au marché (${unitPrice.toFixed(2)}€/${reference.unite} vs ${rangeMax.toFixed(2)}€ max)`;
    }

    comparisons.push({
      category: t.category,
      label,
      unit_price_quote: unitPrice,
      range_min: rangeMin,
      range_max: rangeMax,
      zone_type: zoneType,
      score,
      explanation,
    });
  }

  return comparisons;
}

// Main VERIFY function
async function verifyQuoteData(
  extracted: QuoteExtracted,
  supabase: any
): Promise<QuoteVerified> {
  console.log("Starting verification phase...");

  // Fetch reference data
  const [referencePrixResult, zonesResult] = await Promise.all([
    supabase.from("travaux_reference_prix").select("*"),
    supabase.from("zones_geographiques").select("*"),
  ]);

  // Run verifications in parallel (except Google which needs company name)
  const [ibanResult, companyResult, bodaccResult, rgeResult, georisquesResult] = await Promise.all([
    verifyIBAN(extracted.paiement.iban_detected),
    verifyCompany(extracted.company.siret),
    checkBodacc(extracted.company.siren),
    checkRGE(extracted.company.siret, extracted.travaux),
    getGeorisques(extracted.chantier.address_chantier, extracted.chantier.postal_code),
  ]);

  // Now fetch Google with the verified company name
  const googleResult = await getGoogleRating(
    companyResult.name || extracted.company.name,
    companyResult.address || extracted.company.address_company,
    companyResult.city || extracted.chantier.city
  );

  // Price comparisons
  const priceComparisons = comparePrices(
    extracted.travaux,
    extracted.chantier.postal_code,
    referencePrixResult.data || [],
    zonesResult.data || [],
  );

  const verified: QuoteVerified = {
    company_found: companyResult.found,
    company_lookup_status: companyResult.lookup_status,
    company_name: companyResult.name,
    date_creation: companyResult.date_creation,
    anciennete_years: companyResult.anciennete_years,
    bilans_disponibles: companyResult.bilans_count,
    capitaux_propres: companyResult.capitaux_propres,
    capitaux_propres_positifs: companyResult.capitaux_propres_positifs,
    procedure_collective: companyResult.procedure_collective || bodaccResult,
    company_address: companyResult.address,
    company_city: companyResult.city,
    
    iban_verified: ibanResult.verified,
    iban_valid: ibanResult.valid,
    iban_country: ibanResult.country,
    iban_country_code: ibanResult.countryCode,
    iban_bank_name: ibanResult.bankName,
    
    rge_relevant: rgeResult.relevant,
    rge_found: rgeResult.found,
    rge_qualifications: rgeResult.qualifications,
    
    google_found: googleResult.found,
    google_rating: googleResult.rating,
    google_reviews_count: googleResult.reviews_count,
    google_match_confidence: googleResult.match_confidence,
    
    georisques_queried: georisquesResult.queried,
    georisques_risks: georisquesResult.risks,
    georisques_seismic_zone: georisquesResult.seismic_zone,
    georisques_commune: georisquesResult.commune,
    
    price_comparisons: priceComparisons,
  };

  console.log("Verification complete:", {
    company_found: verified.company_found,
    iban_valid: verified.iban_valid,
    rge_found: verified.rge_found,
    google_rating: verified.google_rating,
    price_comparisons_count: verified.price_comparisons.length,
  });

  return verified;
}

// ============ STEP 3: SCORE ============
// ============================================================
// RÈGLES DE SCORING VERROUILLÉES - AUCUNE EXCEPTION AUTORISÉE
// ============================================================
// FEU ROUGE: UNIQUEMENT si au moins 1 critère critique CONFIRMÉ
// FEU ORANGE: Au moins 1 critère de vigilance ET aucun ROUGE
// FEU VERT: Aucun ROUGE, aucun ORANGE (ou conditions strictes remplies)
// ============================================================

function calculateScore(
  extracted: QuoteExtracted,
  verified: QuoteVerified,
  isAdaptedMode: boolean = false // For prestations techniques
): ScoringResult {
  const critiques: string[] = [];
  const majeurs: string[] = [];
  const confort: string[] = [];

  // ============ RÈGLE UNIQUE: company_verified ============
  // TRUE si entreprise identifiée via Pappers OU Google match fiable
  const company_verified =
    verified.company_found ||
    (verified.google_found && verified.google_match_confidence === "high");

  // ==============================================================
  // CRITÈRES CRITIQUES AUTORISÉS (LISTE BLANCHE STRICTE)
  // SEULS CES CRITÈRES PEUVENT DÉCLENCHER UN FEU ROUGE
  // AUCUN CUMUL DE CRITÈRES ORANGE NE PEUT DÉCLENCHER UN ROUGE
  // ==============================================================

  // 1) Entreprise non immatriculée ou radiée (CONFIRMÉE via API officielle)
  // UNIQUEMENT si lookup a retourné "not_found" explicitement
  if (!company_verified && verified.company_lookup_status === "not_found") {
    critiques.push("Entreprise introuvable dans les registres officiels (confirmé)");
  }

  // 2) Procédure collective en cours CONFIRMÉE
  if (verified.procedure_collective === true) {
    critiques.push("Procédure collective en cours (confirmée via BODACC)");
  }

  // 3) Capitaux propres négatifs CONFIRMÉS (dernier bilan disponible)
  if (verified.capitaux_propres_positifs === false && verified.capitaux_propres !== null) {
    critiques.push(
      `Capitaux propres négatifs (${new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(verified.capitaux_propres)} au dernier bilan)`,
    );
  }

  // 4) Paiement en espèces EXPLICITEMENT mentionné dans le devis
  const hasExplicitCash = extracted.paiement.payment_methods_detected.some(
    (m) => m.toLowerCase() === "especes",
  );
  if (hasExplicitCash) {
    critiques.push("Paiement en espèces explicitement demandé sur le devis");
  }

  // 5) Acompte STRICTEMENT > 50% exigé AVANT tout début de travaux
  const depositBeforeWork: number | null =
    extracted.acompte.deposit_before_work_percent ??
    (!extracted.paiement.has_payment_schedule ? extracted.acompte.deposit_percent : null);

  if (depositBeforeWork !== null && depositBeforeWork > 50) {
    critiques.push(`Acompte supérieur à 50% demandé avant travaux (${depositBeforeWork}%)`);
  }

  // 6) Assurance incohérente CONFIRMÉE niveau 2 (après upload attestation)
  // Note: Cette vérification est gérée séparément via analyze-attestation

  // ==============================================================
  // CRITÈRES ORANGE (VIGILANCE UNIQUEMENT - JAMAIS ROUGE)
  // ==============================================================

  // A) Incohérence des totaux du devis
  if (extracted.totals.totals_incoherence === "yes") {
    majeurs.push(
      `Incohérence des totaux détectée: ${extracted.totals.incoherence_reason || "vérification recommandée"}`,
    );
  }

  // B) Prix marché - PUREMENT INFORMATIF, ne dégrade JAMAIS le score
  // L'impossibilité de comparer n'est JAMAIS négative
  // NOT APPLICABLE in adapted mode (prestations techniques)
  if (!isAdaptedMode) {
    const priceRouge = verified.price_comparisons.filter((p) => p.score === "ROUGE");
    const priceOrange = verified.price_comparisons.filter((p) => p.score === "ORANGE");
    if (priceRouge.length > 0) {
      majeurs.push(`Prix élevés par rapport au marché (${priceRouge.length} poste${priceRouge.length > 1 ? "s" : ""} à vérifier)`);
    } else if (priceOrange.length > 0) {
      majeurs.push(`Prix à comparer au marché (${priceOrange.length} poste${priceOrange.length > 1 ? "s" : ""})`);
    }
  }

  // C) Acompte entre 30% et 50% (modéré, ORANGE uniquement)
  if (depositBeforeWork !== null && depositBeforeWork > 30 && depositBeforeWork <= 50) {
    majeurs.push(`Acompte de ${depositBeforeWork}% – un acompte ≤ 30% est généralement recommandé`);
  }

  // D) Échéancier présent mais % avant travaux incertain
  if (extracted.paiement.has_payment_schedule && depositBeforeWork === null && extracted.acompte.deposit_percent !== null) {
    majeurs.push("Échéancier de paiement détecté – le montant dû avant travaux reste à confirmer");
  }

  // E) IBAN - RÈGLES STRICTES (JAMAIS ROUGE)
  // IBAN étranger ≠ IBAN invalide
  // IBAN étranger = ORANGE uniquement
  // IBAN non détecté = ORANGE uniquement
  // Si OpenIBAN retourne "valide", INTERDIT d'afficher "IBAN non valide"
  if (verified.iban_verified) {
    if (verified.iban_valid === true) {
      // IBAN valide - vérifier si étranger (ORANGE, jamais ROUGE)
      if (verified.iban_country_code && verified.iban_country_code !== "FR") {
        majeurs.push(`Coordonnées bancaires : IBAN ${getCountryName(verified.iban_country_code)} (non critique, à confirmer si attendu)`);
      }
      // IBAN FR valide = pas d'alerte
    } else if (verified.iban_valid === false) {
      // Format IBAN à vérifier (possible erreur de saisie) - ORANGE
      majeurs.push("Format IBAN à vérifier – possible erreur de saisie sur le devis");
    }
  } else if (!extracted.paiement.iban_detected && !extracted.paiement.rib_detected) {
    // IBAN non détecté sur le devis - ORANGE
    majeurs.push("Coordonnées bancaires non détectées sur le devis");
  }

  // F) Entreprise : incertitudes API (formulations neutres, JAMAIS ROUGE)
  if (!company_verified) {
    if (!extracted.company.siret && !extracted.company.siren && !extracted.company.name) {
      majeurs.push("Coordonnées entreprise non détectées sur le devis – information à demander");
    } else if (verified.company_lookup_status === "error") {
      majeurs.push("Données entreprise non exploitées automatiquement – limitation temporaire des sources publiques");
    } else if (verified.company_lookup_status === "skipped") {
      majeurs.push("Vérification entreprise non effectuée – SIRET à confirmer manuellement");
    }
  }

  // G) Entreprise récente < 2 ans (si company_verified) - formulation neutre
  if (company_verified && verified.anciennete_years !== null && verified.anciennete_years < 2) {
    majeurs.push(`Entreprise créée récemment (${verified.anciennete_years} an${verified.anciennete_years > 1 ? "s" : ""}) – ancienneté à prendre en compte`);
  }

  // H) Assurances niveau 1 (devis) - JAMAIS ROUGE
  // NOT APPLICABLE in adapted mode (prestations techniques - no décennale required)
  const DECENNALE_KEYWORDS = [
    "toiture", "charpente", "maçonnerie", "gros oeuvre", "façade", "étanchéité",
    "fenêtre", "menuiserie", "piscine", "extension", "fondation",
  ];
  const travauxText = extracted.travaux.map((t) => `${t.category} ${t.description}`).join(" ").toLowerCase();
  const needsDecennale = !isAdaptedMode && DECENNALE_KEYWORDS.some((kw) => travauxText.includes(kw));

  if (needsDecennale && extracted.assurances.mentions_decennale !== "yes") {
    majeurs.push("Assurance décennale à confirmer pour ce type de travaux");
  }

  // I) RGE (uniquement si pertinent) - NOT APPLICABLE in adapted mode
  if (!isAdaptedMode && verified.rge_relevant && !verified.rge_found) {
    majeurs.push("Qualification RGE non trouvée – à vérifier si éligibilité aux aides souhaitée");
  }

  // J) Google Reviews - RÈGLES STRICTES (JAMAIS ROUGE)
  // Note > 4.5 → positif, 4.0-4.5 → neutre, < 4.0 → ORANGE, Absence → neutre
  if (verified.google_found && verified.google_rating !== null) {
    if (verified.google_rating < 4.0) {
      majeurs.push(`Note Google inférieure au seuil de confort (${verified.google_rating}/5) – avis à consulter`);
    }
  }

  // ==============================================================
  // CRITÈRES DE CONFORT (POSITIFS)
  // ==============================================================

  if (company_verified && verified.company_found) {
    confort.push("Entreprise identifiée dans les registres officiels");
  }

  if (verified.anciennete_years !== null && verified.anciennete_years >= 5) {
    confort.push(`Entreprise établie (${verified.anciennete_years} ans d'ancienneté)`);
  }

  if (verified.capitaux_propres_positifs === true) {
    confort.push("Situation financière saine (capitaux propres positifs)");
  }

  if (verified.google_found && verified.google_rating !== null) {
    if (verified.google_rating >= 4.5) {
      confort.push(`Excellente réputation en ligne (${verified.google_rating}/5)`);
    } else if (verified.google_rating >= 4) {
      confort.push(`Bonne réputation en ligne (${verified.google_rating}/5)`);
    }
  }

  if (verified.iban_verified && verified.iban_valid === true && verified.iban_country_code === "FR") {
    confort.push("IBAN France valide");
  }

  if (extracted.labels.mentions_qualibat === "yes") {
    confort.push("Certification QUALIBAT mentionnée");
  }

  if (verified.rge_found) {
    confort.push("Qualification RGE vérifiée");
  }

  if (extracted.assurances.mentions_decennale === "yes") {
    confort.push("Assurance décennale mentionnée sur le devis");
  }
  if (extracted.assurances.mentions_rcpro === "yes") {
    confort.push("Responsabilité civile professionnelle mentionnée");
  }

  // ==============================================================
  // CALCUL DU SCORE FINAL - RÈGLES VERROUILLÉES
  // ==============================================================
  // Si ≥1 critère ROUGE → score global = ROUGE
  // Sinon si ≥1 critère ORANGE → score global = ORANGE
  // Sinon → score global = VERT
  // INTERDICTION: Aucun recalcul implicite, aucun "ressenti"
  // ==============================================================

  let globalScore: ScoringColor;
  let explanation: string;

  if (critiques.length > 0) {
    // ==== FEU ROUGE: Au moins 1 critère critique CONFIRMÉ ====
    globalScore = "ROUGE";
    explanation = `Situation critique confirmée : ${critiques.join(" | ")}.`;
  } else if (majeurs.length > 0) {
    // ==== FEU ORANGE: Au moins 1 critère de vigilance ====
    globalScore = "ORANGE";
    explanation = `Points de vigilance identifiés : ${majeurs.slice(0, 3).join(" | ")}${majeurs.length > 3 ? ` (+${majeurs.length - 3} autres)` : ""}.`;
  } else {
    // ==== FEU VERT: Aucun ROUGE ni ORANGE ====
    // Vérification des conditions renforcées pour un VERT "solide"
    
    // Conditions de base OBLIGATOIRES
    const baseCondition1_entreprise = company_verified && verified.company_found && !verified.procedure_collective;
    
    const hasTraceablePayment = 
      extracted.paiement.iban_detected || 
      extracted.paiement.rib_detected ||
      extracted.paiement.payment_methods_detected.some(m => 
        ["virement", "cheque", "carte_bancaire"].includes(m.toLowerCase())
      );
    const noExplicitCash = !hasExplicitCash;
    const baseCondition2_paiement = hasTraceablePayment && noExplicitCash;
    
    const effectiveDeposit = extracted.acompte.deposit_before_work_percent ?? extracted.acompte.deposit_percent ?? 0;
    const baseCondition3_acompte = effectiveDeposit <= 30;
    
    const baseCondition4_assurance = 
      extracted.assurances.mentions_decennale === "yes" || 
      extracted.assurances.mentions_rcpro === "yes";
    
    const baseCondition5_coherence = 
      extracted.totals.totals_incoherence !== "yes" && 
      verified.capitaux_propres_positifs !== false;
    
    const allBaseConditionsMet = 
      baseCondition1_entreprise && 
      baseCondition2_paiement && 
      baseCondition3_acompte && 
      baseCondition4_assurance && 
      baseCondition5_coherence;
    
    // Critères de confiance renforcée (au moins 2 requis pour VERT optimal)
    let trustCriteriaCount = 0;
    const trustCriteriaMet: string[] = [];
    
    if (verified.google_found && verified.google_rating !== null && verified.google_rating >= 4) {
      trustCriteriaCount++;
      trustCriteriaMet.push(`Note Google ${verified.google_rating}/5`);
    }
    
    if (verified.anciennete_years !== null && verified.anciennete_years > 5) {
      trustCriteriaCount++;
      trustCriteriaMet.push(`${verified.anciennete_years} ans d'ancienneté`);
    }
    
    if (verified.rge_found || extracted.labels.mentions_qualibat === "yes") {
      trustCriteriaCount++;
      trustCriteriaMet.push(verified.rge_found ? "RGE vérifié" : "QUALIBAT mentionné");
    }
    
    const detailedPosts = extracted.travaux.filter(t => 
      t.amount_ht !== null && t.quantity !== null && t.description.length > 10
    );
    if (detailedPosts.length >= 3) {
      trustCriteriaCount++;
      trustCriteriaMet.push(`Devis détaillé (${detailedPosts.length} postes)`);
    }
    
    const isEUCountry = verified.iban_country_code && [
      "FR", "DE", "BE", "NL", "LU", "IT", "ES", "PT", "AT", "IE", 
      "FI", "GR", "EE", "LV", "LT", "SK", "SI", "MT", "CY"
    ].includes(verified.iban_country_code);
    if (verified.iban_verified && verified.iban_valid === true && isEUCountry) {
      trustCriteriaCount++;
      trustCriteriaMet.push(`IBAN ${verified.iban_country_code} valide`);
    }
    
    const hasSufficientTrustCriteria = trustCriteriaCount >= 2;
    
    // Décision finale VERT
    globalScore = "VERT";
    if (allBaseConditionsMet && hasSufficientTrustCriteria) {
      explanation = `Tous les critères de fiabilité sont réunis : ${trustCriteriaMet.join(", ")}.`;
    } else if (confort.length > 0) {
      explanation = `Aucun point de vigilance détecté. Éléments positifs : ${confort.slice(0, 3).join(", ")}${confort.length > 3 ? "..." : ""}.`;
    } else {
      explanation = "Aucun point critique ni de vigilance détecté sur ce devis.";
    }
  }

  // ==============================================================
  // SCORES PAR BLOC (cohérents avec les règles ci-dessus)
  // ==============================================================
  // Calculate price scores for bloc scoring (only in non-adapted mode)
  const priceRouge = isAdaptedMode ? [] : verified.price_comparisons.filter((p) => p.score === "ROUGE");
  const priceOrange = isAdaptedMode ? [] : verified.price_comparisons.filter((p) => p.score === "ORANGE");
  
  const blocScores = {
    entreprise:
      (!company_verified && verified.company_lookup_status === "not_found") ||
      verified.procedure_collective === true ||
      verified.capitaux_propres_positifs === false
        ? ("ROUGE" as ScoringColor)
        : !company_verified || (verified.anciennete_years !== null && verified.anciennete_years < 2)
          ? ("ORANGE" as ScoringColor)
          : ("VERT" as ScoringColor),

    devis:
      extracted.totals.totals_incoherence === "yes"
        ? ("ORANGE" as ScoringColor)
        : !isAdaptedMode && (priceRouge.length > 0 || priceOrange.length > 0)
          ? ("ORANGE" as ScoringColor)
          : ("VERT" as ScoringColor),

    securite:
      hasExplicitCash || (depositBeforeWork !== null && depositBeforeWork > 50)
        ? ("ROUGE" as ScoringColor)
        : (verified.iban_verified && verified.iban_valid === false) ||
            (verified.iban_verified && verified.iban_valid === true && verified.iban_country_code !== "FR") ||
            (depositBeforeWork !== null && depositBeforeWork > 30) ||
            (needsDecennale && extracted.assurances.mentions_decennale !== "yes")
          ? ("ORANGE" as ScoringColor)
          : ("VERT" as ScoringColor),

    contexte: "INFORMATIF" as const,
  };

  console.log("Scoring result (RÈGLES VERROUILLÉES):", {
    globalScore,
    critiques,
    majeurs,
    confort,
    explanation,
  });

  return {
    global_score: globalScore,
    criteres_critiques: critiques,
    criteres_majeurs: majeurs,
    criteres_confort: confort,
    score_explanation: explanation,
    bloc_scores: blocScores,
  };
}

// ============ STEP 4: RENDER - Build output for UI ============
function renderAnalysisOutput(
  extracted: QuoteExtracted,
  verified: QuoteVerified,
  scoring: ScoringResult,
  isAdaptedMode: boolean = false,
  documentDetection?: DocumentDetectionResult
): {
  points_ok: string[];
  alertes: string[];
  recommandations: string[];
  types_travaux: any[];
} {
  const points_ok: string[] = [];
  const alertes: string[] = [];
  const recommandations: string[] = [];

  // Add adapted mode message at the top if applicable
  if (isAdaptedMode && documentDetection) {
    points_ok.push(`📋 ${documentDetection.credibility_message}`);
  }

  // ============ BLOC 1: ENTREPRISE ============

  // RÈGLE CENTRALE: Calculer company_verified pour la cohérence UI/Scoring
  const company_verified = 
    verified.company_found || 
    (extracted.company.siret && extracted.company.siret.length >= 14) ||
    (verified.google_found && verified.google_match_confidence === "high");

  if (verified.company_found) {
    points_ok.push(`✓ Entreprise identifiée : ${verified.company_name}`);
    
    if (verified.anciennete_years !== null) {
      if (verified.anciennete_years >= 5) {
        points_ok.push(`🟢 Entreprise bien établie : ${verified.anciennete_years} ans d'existence (depuis ${formatDateFR(verified.date_creation || "")})`);
      } else if (verified.anciennete_years >= 2) {
        points_ok.push(`🟠 Entreprise établie depuis ${verified.anciennete_years} ans`);
      } else {
        // Entreprise récente = ORANGE, jamais ROUGE
        alertes.push(`⚠️ Entreprise récente : ${verified.anciennete_years} an(s) d'existence. Vigilance recommandée.`);
      }
    }

    if (verified.bilans_disponibles >= 3) {
      points_ok.push(`🟢 ${verified.bilans_disponibles} bilans comptables disponibles`);
    } else if (verified.bilans_disponibles > 0) {
      points_ok.push(`🟠 ${verified.bilans_disponibles} bilan(s) comptable(s) disponible(s)`);
    } else {
      // Aucun bilan = info manquante, pas alerte forte
      points_ok.push("ℹ️ Aucun bilan publié - la vérification financière est limitée");
    }

    if (verified.capitaux_propres_positifs === true) {
      const formatted = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(verified.capitaux_propres!);
      points_ok.push(`🟢 Capitaux propres positifs (${formatted})`);
    } else if (verified.capitaux_propres_positifs === false) {
      // Capitaux négatifs = CRITIQUE CONFIRMÉ
      const formatted = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(verified.capitaux_propres!);
      alertes.push(`🔴 ALERTE CRITIQUE : Capitaux propres négatifs (${formatted}). Situation financière fragile.`);
    }

    if (verified.procedure_collective) {
      alertes.push("🔴 ALERTE CRITIQUE : Procédure collective en cours (redressement ou liquidation)");
    } else {
      points_ok.push("✓ Aucune procédure collective en cours");
    }
  } else if (extracted.company.siret) {
    // SIRET présent mais non trouvé Pappers = INFO pédagogique, pas critique
    points_ok.push(`ℹ️ SIRET présent : ${extracted.company.siret}`);
    points_ok.push("ℹ️ Les données financières détaillées de l'entreprise n'ont pas pu être exploitées automatiquement (structure de groupe, établissement secondaire ou données non consolidées). Cela n'indique pas un risque en soi.");
    recommandations.push("Vous pouvez vérifier les informations sur societe.com ou infogreffe.fr si vous le souhaitez.");
  } else if (extracted.company.name) {
    // Nom présent mais pas de SIRET = demander le SIRET (formulation neutre)
    points_ok.push(`ℹ️ Entreprise : ${extracted.company.name}`);
    alertes.push("ℹ️ SIRET non détecté sur le devis – vous pouvez le demander à l'artisan pour une vérification complète");
    recommandations.push("Demandez le numéro SIRET à l'artisan pour compléter la vérification.");
  } else {
    alertes.push("ℹ️ Coordonnées entreprise non identifiées sur le devis – information à demander");
    recommandations.push("Demandez à l'artisan ses coordonnées complètes et son numéro SIRET.");
  }

  // Google Places - toujours afficher un statut
  if (verified.google_found) {
    if (verified.google_rating !== null) {
      if (verified.google_rating >= 4.5) {
        points_ok.push(`🟢 Réputation en ligne : ${verified.google_rating}/5 sur Google (${verified.google_reviews_count} avis)`);
      } else if (verified.google_rating >= 4) {
        points_ok.push(`🟠 Réputation en ligne : ${verified.google_rating}/5 sur Google (${verified.google_reviews_count} avis)`);
      } else {
        points_ok.push(`🟠 Réputation en ligne : ${verified.google_rating}/5 sur Google (${verified.google_reviews_count} avis) - Consultez les avis`);
      }
      
      if (verified.google_match_confidence !== "high") {
        points_ok.push("ℹ️ Correspondance Google à confirmer (plusieurs établissements possibles)");
      }
    } else {
      points_ok.push("🟠 Réputation en ligne : Aucun avis disponible sur Google");
    }
  } else {
    points_ok.push("🟠 Réputation en ligne : Établissement non trouvé sur Google (non critique)");
  }

  // RGE
  if (verified.rge_found) {
    points_ok.push(`🟢 Qualification RGE vérifiée : ${verified.rge_qualifications.slice(0, 2).join(", ")}`);
  } else if (verified.rge_relevant) {
    alertes.push("⚠️ RGE non trouvé pour ce SIRET - travaux potentiellement éligibles aux aides");
  } else {
    points_ok.push("✓ Qualification RGE : non requise pour ce type de travaux");
  }

  // QUALIBAT
  if (extracted.labels.mentions_qualibat === "yes") {
    points_ok.push("🟢 Qualification QUALIBAT mentionnée sur le devis");
  }

  // ============ BLOC 2: DEVIS ============

  // Incohérence des totaux
  if (extracted.totals.totals_incoherence === "yes") {
    alertes.push(`🔴 Incohérence détectée dans les totaux du devis: ${extracted.totals.incoherence_reason || "vérifiez la somme des lignes"}`);
  } else if (extracted.totals.totals_incoherence === "no") {
    points_ok.push("✓ Totaux du devis cohérents");
  }

  // Prix par catégorie
  for (const comparison of verified.price_comparisons) {
    if (comparison.score === "VERT") {
      points_ok.push(`✓ ${comparison.label}: prix cohérent (${comparison.unit_price_quote.toFixed(2)}€)`);
    } else if (comparison.score === "ORANGE") {
      alertes.push(`⚠️ ${comparison.label}: ${comparison.explanation}`);
    } else {
      alertes.push(`🚨 ${comparison.label}: ${comparison.explanation}`);
    }
  }

  // ============ BLOC 3: SÉCURITÉ ============

  // Mode de paiement
  const paymentMethods = extracted.paiement.payment_methods_detected;
  const hasTraceable = paymentMethods.some(m => ["virement", "cheque", "carte_bancaire"].includes(m.toLowerCase()));
  const hasCash = paymentMethods.some(m => m.toLowerCase() === "especes");

  if (hasCash) {
    alertes.push("🔴 ALERTE: Paiement en espèces explicitement demandé - Privilégiez un mode traçable");
  } else if (hasTraceable) {
    points_ok.push("✓ Mode de paiement traçable accepté");
  }

  // IBAN
  if (verified.iban_verified) {
    if (verified.iban_valid === false) {
      // Alignement UI/score: ce n'est PAS un critère critique (ORANGE)
      alertes.push("⚠️ IBAN techniquement invalide (à vérifier) – attention aux erreurs de saisie");
    } else if (verified.iban_valid === true) {
      if (verified.iban_country_code === "FR") {
        points_ok.push(`✓ IBAN valide et domicilié en France${verified.iban_bank_name ? ` (${verified.iban_bank_name})` : ""}`);
      } else {
        alertes.push(`⚠️ IBAN étranger (${getCountryName(verified.iban_country_code || "")}) - Vérifiez la raison`);
      }
    }
  } else if (extracted.paiement.iban_detected) {
    // IBAN détecté mais vérification indisponible = ORANGE, jamais ROUGE
    alertes.push("⚠️ IBAN détecté mais vérification technique indisponible (information à confirmer)");
  } else if (!extracted.paiement.iban_detected && !extracted.paiement.rib_detected) {
    // IBAN non détecté = info manquante, PAS critique
    points_ok.push("ℹ️ IBAN non détecté sur le devis (informations bancaires à demander si virement)");
  }

  // Acompte
  const depositPercent = extracted.acompte.deposit_before_work_percent ?? extracted.acompte.deposit_percent;
  if (depositPercent !== null) {
    if (depositPercent <= 30) {
      points_ok.push(`✓ Acompte raisonnable (${depositPercent}%)`);
    } else if (depositPercent <= 50) {
      alertes.push(`⚠️ Acompte modéré (${depositPercent}%) - Préférez un acompte ≤ 30%`);
    } else if (depositPercent < 100) {
      alertes.push(`🔴 Acompte élevé (${depositPercent}%) - Risque élevé si problème`);
    } else {
      alertes.push("🔴 Paiement intégral demandé avant travaux - Risque très élevé");
    }
  }

  // Échéancier
  if (extracted.paiement.has_payment_schedule) {
    points_ok.push(`✓ Échéancier de paiement prévu (${extracted.paiement.payment_schedule_text || "paiement en plusieurs fois"})`);
  }

  // Assurances (Niveau 1 = devis uniquement, jamais ROUGE)
  if (extracted.assurances.mentions_decennale === "yes") {
    const details = extracted.assurances.insurer_name ? ` (${extracted.assurances.insurer_name})` : "";
    points_ok.push(`✓ Assurance décennale mentionnée sur le devis${details}`);
  } else if (extracted.assurances.mentions_decennale === "uncertain") {
    alertes.push("⚠️ Assurance décennale : mention partielle – demandez l'attestation pour confirmer");
  } else {
    alertes.push("⚠️ Assurance décennale non détectée – demandez l'attestation d'assurance");
  }

  if (extracted.assurances.mentions_rcpro === "yes") {
    points_ok.push("✓ RC Pro mentionnée sur le devis");
  } else if (extracted.assurances.mentions_rcpro === "uncertain") {
    points_ok.push("ℹ️ RC Pro partiellement mentionnée");
  }

  recommandations.push("📋 Pour confirmer les assurances, demandez les attestations d'assurance (PDF) à jour.");

  // ============ BLOC 4: CONTEXTE (toujours affiché) ============

  if (verified.georisques_queried) {
    if (verified.georisques_risks.length > 0) {
      points_ok.push(`📍 Contexte chantier (${verified.georisques_commune}) : ${verified.georisques_risks.length} risque(s) naturel(s) - ${verified.georisques_risks.slice(0, 3).join(", ")}`);
    } else {
      points_ok.push(`📍 Contexte chantier (${verified.georisques_commune}) : Aucune contrainte particulière identifiée`);
    }
    if (verified.georisques_seismic_zone) {
      points_ok.push(`📍 Zone sismique : ${verified.georisques_seismic_zone}`);
    }
  } else if (extracted.chantier.address_chantier || extracted.chantier.postal_code) {
    points_ok.push("📍 Contexte chantier : Adresse détectée mais non exploitable pour les risques");
  } else {
    points_ok.push("📍 Contexte chantier : Adresse non détectée sur le devis");
  }

  // ============ RECOMMANDATIONS ============

  recommandations.push(`📊 ${scoring.score_explanation}`);

  // Message de synthèse positif pour ORANGE
  if (scoring.global_score === "ORANGE" && scoring.criteres_critiques.length === 0) {
    recommandations.push("✅ L'ensemble des éléments analysés suggère une entreprise sérieuse. Les points listés sont des vérifications de confort recommandées avant engagement.");
  }

  if (scoring.criteres_majeurs.length > 0 && scoring.global_score === "ORANGE") {
    recommandations.push("ℹ️ Les points ci-dessus sont des recommandations de vérification, pas des signaux d'alerte critiques.");
  }

  if (!verified.company_found && extracted.company.siret) {
    recommandations.push("Vous pouvez consulter societe.com ou infogreffe.fr pour plus de détails sur l'entreprise.");
  }

  if (depositPercent !== null && depositPercent > 30) {
    recommandations.push("Limitez l'acompte à 30% maximum du montant total.");
  }

  // ============ TYPES TRAVAUX ENRICHIS ============

  const types_travaux = extracted.travaux.map(t => {
    const priceComparison = verified.price_comparisons.find(
      p => p.category.toLowerCase() === t.category.toLowerCase()
    );
    
    return {
      categorie: t.category,
      libelle: t.description || t.category,
      quantite: t.quantity,
      unite: t.unit || "forfait",
      montant_ht: t.amount_ht,
      score_prix: priceComparison?.score || null,
      fourchette_min: priceComparison?.range_min || null,
      fourchette_max: priceComparison?.range_max || null,
      zone_type: priceComparison?.zone_type || null,
      explication: priceComparison?.explanation || null,
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

    console.log("=== PIPELINE START ===");
    console.log("Analysis ID:", analysisId);
    console.log("File:", analysis.file_name);

    // ============ STEP 0: DETECT DOCUMENT TYPE ============
    console.log("--- STEP 0: DETECT DOCUMENT TYPE ---");
    const documentDetection = await detectDocumentType(base64, mimeType, lovableApiKey);
    console.log("Document detection result:", {
      type: documentDetection.type,
      confidence: documentDetection.confidence,
      analysis_mode: documentDetection.analysis_mode,
      indicators: documentDetection.indicators,
    });

    // Handle rejected documents (facture or autre)
    if (documentDetection.analysis_mode === "rejected") {
      console.log("Document rejected:", documentDetection.rejection_message);
      
      await supabase
        .from("analyses")
        .update({
          status: "completed",
          score: null,
          resume: documentDetection.rejection_message,
          points_ok: [],
          alertes: [],
          recommandations: [
            documentDetection.credibility_message,
            "💡 Pour bénéficier de l'analyse VerifierMonDevis.fr, veuillez transmettre un devis (document émis avant travaux)."
          ],
          raw_text: JSON.stringify({
            document_detection: documentDetection,
          }),
          types_travaux: null,
        })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({
          success: true,
          analysisId,
          score: null,
          documentType: documentDetection.type,
          rejected: true,
          message: documentDetection.rejection_message,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Flag for adapted analysis modes
    const isAdaptedMode = documentDetection.analysis_mode === "adapted";
    const isDiagnosticMode = documentDetection.analysis_mode === "diagnostic";
    const isSpecialMode = isAdaptedMode || isDiagnosticMode;
    
    if (isAdaptedMode) {
      console.log("Adapted analysis mode for prestation technique");
    }
    if (isDiagnosticMode) {
      console.log("Diagnostic immobilier mode - diagnostics detected:", documentDetection.diagnostic_types);
    }

    // ============ STEP 1: EXTRACT ============
    console.log("--- STEP 1: EXTRACT ---");
    let extracted: QuoteExtracted;
    try {
      extracted = await extractQuoteData(base64, mimeType, lovableApiKey, documentDetection.type);
      console.log("Extraction complete:", {
        company: extracted.company.name,
        siret: extracted.company.siret,
        travaux_count: extracted.travaux.length,
        total_ttc: extracted.totals.total_ttc,
      });
    } catch (error) {
      console.error("Extraction failed:", error);

      const publicMessage = isPipelineError(error)
        ? error.publicMessage
        : "Impossible de lire le contenu du fichier";
      const statusCode = isPipelineError(error) ? error.status : 500;
      const errorCode = isPipelineError(error) ? error.code : "EXTRACTION_FAILED";

      await supabase
        .from("analyses")
        .update({ status: "error", error_message: publicMessage })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({ error: errorCode, message: publicMessage }),
        { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ STEP 2: VERIFY ============
    console.log("--- STEP 2: VERIFY ---");
    const verified = await verifyQuoteData(extracted, supabase);
    
    // For adapted/diagnostic mode: clear travaux price comparisons (not applicable)
    if (isSpecialMode) {
      verified.price_comparisons = [];
      console.log("Travaux price comparisons cleared for special mode");
    }
    
    // For diagnostic mode: perform diagnostic-specific price comparison
    const diagnosticPriceAnalysis: Array<{
      diagnostic_type: string;
      label: string;
      quote_price: number | null;
      range_min: number;
      range_max: number;
      score: ScoringColor;
      explanation: string;
    }> = [];
    
    if (isDiagnosticMode && documentDetection.diagnostic_types && documentDetection.diagnostic_types.length > 0) {
      const totalPrice = extracted.totals.total_ttc || extracted.totals.total_ht;
      
      // Check if it's a pack
      const isPack = documentDetection.diagnostic_types.length >= 3;
      const hasLocationKeywords = documentDetection.indicators.some(i => 
        i.toLowerCase().includes("location") || i.toLowerCase().includes("pack location")
      );
      
      if (isPack && totalPrice) {
        // Compare as pack
        const packType = hasLocationKeywords ? "pack_location" : "pack_vente";
        const packRef = DIAGNOSTIC_REFERENCE_PRICES[packType];
        
        let packScore: ScoringColor = "VERT";
        let packExplanation = "";
        
        if (totalPrice < packRef.min) {
          packScore = "VERT";
          packExplanation = `Prix inférieur à la moyenne (${packRef.min}€ - ${packRef.max}€)`;
        } else if (totalPrice <= packRef.max) {
          packScore = "VERT";
          packExplanation = `Prix dans la fourchette indicative nationale (${packRef.min}€ - ${packRef.max}€)`;
        } else if (totalPrice <= packRef.max * 1.3) {
          // ORANGE but NEVER RED for diagnostics
          packScore = "ORANGE";
          packExplanation = `Prix au-dessus de la fourchette indicative (${packRef.min}€ - ${packRef.max}€). Les tarifs peuvent varier selon la surface du bien et sa localisation.`;
        } else {
          // Still ORANGE, never RED for diagnostic pricing
          packScore = "ORANGE";
          packExplanation = `Prix significativement au-dessus de la fourchette indicative (${packRef.min}€ - ${packRef.max}€). Il est recommandé de comparer avec d'autres devis.`;
        }
        
        diagnosticPriceAnalysis.push({
          diagnostic_type: packType,
          label: packRef.label,
          quote_price: totalPrice,
          range_min: packRef.min,
          range_max: packRef.max,
          score: packScore,
          explanation: packExplanation,
        });
      } else {
        // Individual diagnostics - informative only
        for (const diagType of documentDetection.diagnostic_types) {
          const ref = DIAGNOSTIC_REFERENCE_PRICES[diagType.toLowerCase()];
          if (ref) {
            if (ref.min === 0 && ref.max === 0) {
              // DTG/PPPT - not comparable
              diagnosticPriceAnalysis.push({
                diagnostic_type: diagType,
                label: ref.label,
                quote_price: null,
                range_min: 0,
                range_max: 0,
                score: "VERT",
                explanation: "Ce type de diagnostic ne dispose pas de fourchette de prix standardisée (prix variable selon le contexte).",
              });
            } else {
              diagnosticPriceAnalysis.push({
                diagnostic_type: diagType,
                label: ref.label,
                quote_price: null, // Individual prices not always extractable
                range_min: ref.min,
                range_max: ref.max,
                score: "VERT", // Always VERT for informative display
                explanation: `Fourchette indicative nationale : ${ref.min}€ - ${ref.max}€`,
              });
            }
          }
        }
      }
      
      console.log("Diagnostic price analysis:", diagnosticPriceAnalysis);
    }

    // ============ STEP 3: SCORE ============
    console.log("--- STEP 3: SCORE ---");
    const scoring = calculateScore(extracted, verified, isSpecialMode);
    
    // For diagnostic mode: ensure price never triggers RED
    if (isDiagnosticMode) {
      // Remove any price-related critical criteria (defensive)
      scoring.criteres_critiques = scoring.criteres_critiques.filter(c => 
        !c.toLowerCase().includes("prix") && !c.toLowerCase().includes("tarif")
      );
    }

    // ============ STEP 4: RENDER ============
    console.log("--- STEP 4: RENDER ---");
    const output = renderAnalysisOutput(extracted, verified, scoring, isSpecialMode, documentDetection);
    
    // Add diagnostic-specific content
    if (isDiagnosticMode) {
      // Add diagnostic mode indicator at the top
      output.points_ok.unshift(`🏠 ${documentDetection.credibility_message}`);
      
      // Add diagnostic price analysis to types_travaux for display
      if (diagnosticPriceAnalysis.length > 0) {
        for (const diag of diagnosticPriceAnalysis) {
          output.types_travaux.push({
            categorie: "diagnostic_immobilier",
            libelle: diag.label,
            quantite: 1,
            unite: "forfait",
            montant_ht: diag.quote_price,
            score_prix: diag.score,
            fourchette_min: diag.range_min,
            fourchette_max: diag.range_max,
            zone_type: "national",
            explication: diag.explanation,
          });
        }
      }
      
      // Add mandatory pedagogical message for diagnostics
      output.recommandations.push(
        "💡 Les tarifs des diagnostics immobiliers sont libres et peuvent varier selon la taille du bien, sa localisation et le nombre de diagnostics requis. Les comparaisons de prix sont fournies à titre indicatif afin d'aider à situer le devis par rapport aux pratiques courantes."
      );
    }

    console.log("=== PIPELINE COMPLETE ===");
    console.log("Final score:", scoring.global_score);
    console.log("Critiques:", scoring.criteres_critiques);
    console.log("Majeurs:", scoring.criteres_majeurs);
    console.log("Document type:", documentDetection.type);

    // Store raw extracted data for debug mode
    const rawDataForDebug = JSON.stringify({
      document_detection: documentDetection,
      diagnostic_price_analysis: diagnosticPriceAnalysis,
      quote_extracted: extracted,
      quote_verified: verified,
      scoring: scoring,
    });

    // Update the analysis with results
    const { error: updateError } = await supabase
      .from("analyses")
      .update({
        status: "completed",
        score: scoring.global_score,
        resume: extracted.resume,
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
        score: scoring.global_score,
        companyVerified: verified.company_found,
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
