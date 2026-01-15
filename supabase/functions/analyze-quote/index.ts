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
type DocumentType = "devis_travaux" | "facture" | "diagnostic_immobilier" | "autre";

// ============================================================
// PHASE 1 — EXTRACTION UNIQUE (UN SEUL APPEL IA)
// ============================================================
// Identifie le type de document + extrait TOUTES les données factuelles
// ❌ INTERDIT de calculer un score
// ❌ INTERDIT d'interpréter
// ❌ INTERDIT d'émettre une recommandation
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
// PHASE 2 — VÉRIFICATION (APIs EXTERNES - SANS IA)
// ============================================================

interface VerificationResult {
  // Pappers
  entreprise_immatriculee: boolean | null; // null = non vérifié, true = trouvé, false = introuvable
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
  lookup_status: "ok" | "not_found" | "error" | "skipped";
  
  // IBAN
  iban_verifie: boolean;
  iban_valide: boolean | null;
  iban_pays: string | null;
  iban_code_pays: string | null;
  iban_banque: string | null;
  
  // RGE
  rge_pertinent: boolean;
  rge_trouve: boolean;
  rge_qualifications: string[];
  
  // Google
  google_trouve: boolean;
  google_note: number | null;
  google_nb_avis: number | null;
  google_match_fiable: boolean;
  
  // Géorisques
  georisques_consulte: boolean;
  georisques_risques: string[];
  georisques_zone_sismique: string | null;
  georisques_commune: string | null;
  
  // Prix marché
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
}

// ============================================================
// PHASE 3 — SCORING DÉTERMINISTE (SANS IA - RÈGLES STRICTES)
// ============================================================
// ⚠️ UN FEU ROUGE NE PEUT ÊTRE DÉCLENCHÉ QUE SI AU MOINS UN DES CAS SUIVANTS EST CONFIRMÉ EXPLICITEMENT
// ❌ TOUT AUTRE CRITÈRE EST INTERDIT COMME DÉCLENCHEUR DE FEU ROUGE
// ============================================================

interface ScoringResult {
  score_global: ScoringColor;
  criteres_rouges: string[];   // Critiques confirmés
  criteres_oranges: string[];  // Vigilance réelle confirmée
  criteres_verts: string[];    // Positifs
  criteres_informatifs: string[]; // ℹ️ Données manquantes/indisponibles - SANS IMPACT sur le score
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
// PHASE 1: EXTRACTION UNIQUE (UN SEUL APPEL IA)
// ============================================================

async function extractDataFromDocument(
  base64Content: string,
  mimeType: string,
  lovableApiKey: string
): Promise<ExtractedData> {
  
  const systemPrompt = `Tu es VerifierMonDevis.fr, un outil d'aide à la décision à destination des particuliers.

Tu n'évalues PAS les artisans.
Tu ne portes AUCUN jugement de valeur.
Tu fournis des indicateurs factuels, pédagogiques et vérifiables.

RÈGLES D'EXTRACTION:
1. N'invente AUCUNE information. Si une donnée n'est pas visible, retourne null.
2. Pour le mode de paiement: NE JAMAIS déduire "espèces" par défaut. "espèces" SEULEMENT si les mots "espèces", "cash", "comptant en espèces" sont explicitement présents dans le document.
3. Si un IBAN ou RIB est présent, le mode de paiement est "virement", pas "espèces".
4. Pour les assurances: true si clairement mentionnée, false si absente, null si doute.

Tu dois effectuer UNE SEULE extraction complète et structurée.`;

  const userPrompt = `Analyse ce document et extrait TOUTES les données factuelles.

IDENTIFICATION DU DOCUMENT:
1. DEVIS DE TRAVAUX : "Devis", montants HT/TTC, descriptions de travaux, assurance décennale
2. DIAGNOSTIC IMMOBILIER : DPE, amiante, plomb, gaz, électricité, ERP, Carrez
3. FACTURE : "Facture", numéro de facture, "Net à payer", travaux passés
4. AUTRE : Document non conforme

EXTRACTION STRICTE - Réponds UNIQUEMENT avec ce JSON:

{
  "type_document": "devis_travaux | facture | diagnostic_immobilier | autre",
  "entreprise": {
    "nom": "nom exact ou null",
    "siret": "numéro SIRET 14 chiffres sans espaces ou null",
    "adresse": "adresse complète ou null",
    "iban": "IBAN complet ou null",
    "assurance_decennale_mentionnee": true | false | null,
    "assurance_rc_pro_mentionnee": true | false | null,
    "certifications_mentionnees": ["RGE", "QUALIBAT", etc] ou []
  },
  "client": {
    "adresse_chantier": "adresse complète du chantier ou null",
    "code_postal": "code postal 5 chiffres ou null",
    "ville": "ville ou null"
  },
  "travaux": [
    {
      "libelle": "description exacte",
      "categorie": "plomberie|electricite|chauffage|isolation|toiture|menuiserie|peinture|maconnerie|renovation_sdb|renovation_cuisine|carrelage|parquet|facade|autre",
      "montant": 5000 ou null,
      "quantite": 50 ou null,
      "unite": "m²|unité|forfait|ml" ou null
    }
  ],
  "paiement": {
    "acompte_pct": 30 ou null,
    "acompte_avant_travaux_pct": pourcentage dû AVANT début des travaux ou null,
    "modes": ["virement", "cheque"] - JAMAIS "especes" sauf si explicitement écrit,
    "echeancier_detecte": true | false
  },
  "dates": {
    "date_devis": "YYYY-MM-DD ou null",
    "date_execution_max": "YYYY-MM-DD ou null"
  },
  "totaux": {
    "ht": 10000 ou null,
    "tva": 2000 ou null,
    "ttc": 12000 ou null,
    "taux_tva": 20 ou null
  },
  "anomalies_detectees": ["liste des incohérences factuelles détectées"],
  "resume_factuel": "description factuelle courte du document sans jugement"
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

    const parsed = JSON.parse(content);
    
    // Normalize and validate
    const typeDocument = ["devis_travaux", "facture", "diagnostic_immobilier", "autre"].includes(parsed.type_document) 
      ? parsed.type_document 
      : "autre";
    
    // CRITICAL: If IBAN is present, remove "especes" from payment modes
    let modes = Array.isArray(parsed.paiement?.modes) 
      ? parsed.paiement.modes.filter((m: string) => ["virement", "cheque", "carte_bancaire", "especes"].includes(m?.toLowerCase()))
      : [];
    
    if (parsed.entreprise?.iban) {
      modes = modes.filter((m: string) => m?.toLowerCase() !== "especes");
      if (!modes.includes("virement")) {
        modes.unshift("virement");
      }
    }

    const extracted: ExtractedData = {
      type_document: typeDocument,
      entreprise: {
        nom: parsed.entreprise?.nom || null,
        siret: parsed.entreprise?.siret?.replace(/\s/g, "") || null,
        adresse: parsed.entreprise?.adresse || null,
        iban: parsed.entreprise?.iban?.replace(/\s/g, "") || null,
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
      travaux: Array.isArray(parsed.travaux) ? parsed.travaux.map((t: any) => ({
        libelle: t.libelle || "",
        categorie: t.categorie || "autre",
        montant: typeof t.montant === "number" ? t.montant : null,
        quantite: typeof t.quantite === "number" ? t.quantite : null,
        unite: t.unite || null,
      })) : [],
      paiement: {
        acompte_pct: typeof parsed.paiement?.acompte_pct === "number" ? parsed.paiement.acompte_pct : null,
        acompte_avant_travaux_pct: typeof parsed.paiement?.acompte_avant_travaux_pct === "number" 
          ? parsed.paiement.acompte_avant_travaux_pct : null,
        modes: modes,
        echeancier_detecte: Boolean(parsed.paiement?.echeancier_detecte),
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
      resume_factuel: parsed.resume_factuel || "Analyse du document en cours.",
    };

    console.log("PHASE 1 COMPLETE - Extracted:", {
      type: extracted.type_document,
      entreprise: extracted.entreprise.nom,
      siret: extracted.entreprise.siret,
      travaux_count: extracted.travaux.length,
      total_ttc: extracted.totaux.ttc,
      modes_paiement: extracted.paiement.modes,
    });

    return extracted;
  } catch (error) {
    console.error("Extraction error:", error);
    throw error;
  }
}

// ============================================================
// PHASE 2: VÉRIFICATION (APIs EXTERNES - CONDITIONNÉES)
// ============================================================
// 👉 Pappers / INSEE → uniquement si SIRET détecté
// 👉 Google Reviews → uniquement si entreprise identifiable
// 👉 OpenIBAN → uniquement si IBAN détecté
// 👉 Géorisques / GPU → uniquement si adresse chantier complète
// 👉 Interdiction de refaire un appel si donnée déjà connue
// ============================================================

// 2.1 Verify IBAN with OpenIBAN
async function verifyIBAN(iban: string | null): Promise<{
  verifie: boolean;
  valide: boolean | null;
  pays: string | null;
  code_pays: string | null;
  banque: string | null;
}> {
  if (!iban) return { verifie: false, valide: null, pays: null, code_pays: null, banque: null };

  try {
    const response = await fetch(`${OPENIBAN_API_URL}/${iban}?getBIC=true&validateBankCode=true`);

    if (!response.ok) {
      // API failure = no conclusion, NOT invalid
      return { verifie: false, valide: null, pays: null, code_pays: iban.substring(0, 2), banque: null };
    }

    const data = await response.json();
    return {
      verifie: true,
      valide: data.valid === true,
      pays: data.bankData?.country || null,
      code_pays: data.bankData?.countryCode || iban.substring(0, 2),
      banque: data.bankData?.name || null,
    };
  } catch (error) {
    console.error("IBAN verification error:", error);
    return { verifie: false, valide: null, pays: null, code_pays: iban.substring(0, 2), banque: null };
  }
}

// 2.2 Verify company with Pappers
async function verifyCompany(siret: string | null): Promise<{
  immatriculee: boolean | null;
  radiee: boolean | null;
  procedure_collective: boolean | null;
  capitaux_propres: number | null;
  capitaux_propres_negatifs: boolean | null;
  date_creation: string | null;
  anciennete: number | null;
  bilans: number;
  nom: string | null;
  adresse: string | null;
  ville: string | null;
  lookup_status: "ok" | "not_found" | "error" | "skipped";
}> {
  const defaultResult = {
    immatriculee: null,
    radiee: null,
    procedure_collective: null,
    capitaux_propres: null,
    capitaux_propres_negatifs: null,
    date_creation: null,
    anciennete: null,
    bilans: 0,
    nom: null,
    adresse: null,
    ville: null,
    lookup_status: "skipped" as const,
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

    // 404 = EXPLICIT negative proof: company not found in registers
    if (response.status === 404) {
      return { ...defaultResult, immatriculee: false, lookup_status: "not_found" };
    }

    // Other errors = uncertainty, no negative conclusion
    if (!response.ok) {
      console.error("Pappers API error:", response.status);
      return { ...defaultResult, lookup_status: "error" };
    }

    const data = await response.json();

    let anciennete: number | null = null;
    if (data.date_creation) {
      const creationDate = new Date(data.date_creation);
      const now = new Date();
      anciennete = Math.floor((now.getTime() - creationDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    }

    let bilans = 0;
    let capitaux: number | null = null;
    if (data.comptes && Array.isArray(data.comptes)) {
      bilans = data.comptes.length;
      if (data.comptes.length > 0 && data.comptes[0].capitaux_propres !== undefined) {
        capitaux = data.comptes[0].capitaux_propres;
      }
    } else if (data.derniers_comptes) {
      bilans = 1;
      if (data.derniers_comptes.capitaux_propres !== undefined) {
        capitaux = data.derniers_comptes.capitaux_propres;
      }
    }

    return {
      immatriculee: true,
      radiee: data.statut === "Radiée" || data.statut === "Fermé",
      procedure_collective: Boolean(data.procedure_collective),
      capitaux_propres: capitaux,
      capitaux_propres_negatifs: capitaux !== null ? capitaux < 0 : null,
      date_creation: data.date_creation || null,
      anciennete,
      bilans,
      nom: data.nom_entreprise || null,
      adresse: data.siege?.adresse_ligne_1 || null,
      ville: data.siege?.ville || null,
      lookup_status: "ok",
    };
  } catch (error) {
    console.error("Pappers error:", error);
    return { ...defaultResult, lookup_status: "error" };
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
  "isolation", "isolant", "combles", "pompe à chaleur", "pac",
  "photovoltaïque", "solaire", "vmc", "ventilation", "rénovation énergétique",
];

async function checkRGE(
  siret: string | null,
  travaux: ExtractedData["travaux"]
): Promise<{ pertinent: boolean; trouve: boolean; qualifications: string[] }> {
  const travauxText = travaux.map(t => `${t.categorie} ${t.libelle}`).join(" ").toLowerCase();
  const isPertinent = RGE_RELEVANT_KEYWORDS.some(kw => travauxText.includes(kw.toLowerCase()));
  
  if (!isPertinent || !siret) {
    return { pertinent: isPertinent, trouve: false, qualifications: [] };
  }

  const siren = siret.replace(/\s/g, "").substring(0, 9);
  
  try {
    const response = await fetch(`${ADEME_RGE_API_URL}?q=${siren}&q_fields=siret&size=10`);
    if (!response.ok) return { pertinent: true, trouve: false, qualifications: [] };
    
    const data = await response.json();
    if (data.total === 0 || !data.results) return { pertinent: true, trouve: false, qualifications: [] };

    const qualifications = data.results
      .filter((r: any) => r.siret?.startsWith(siren))
      .map((r: any) => r.nom_qualification || r.domaine)
      .filter(Boolean);
    
    return { pertinent: true, trouve: qualifications.length > 0, qualifications };
  } catch {
    return { pertinent: true, trouve: false, qualifications: [] };
  }
}

// 2.5 Google Places rating
async function getGoogleRating(
  companyName: string | null,
  address: string | null,
  city: string | null
): Promise<{ trouve: boolean; note: number | null; nb_avis: number | null; match_fiable: boolean }> {
  const googleApiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
  if (!googleApiKey || !companyName) return { trouve: false, note: null, nb_avis: null, match_fiable: false };

  const searchInput = `${companyName} ${address || ""} ${city || ""}`.trim();
  if (searchInput.length < 3) return { trouve: false, note: null, nb_avis: null, match_fiable: false };

  try {
    const params = new URLSearchParams({
      input: searchInput,
      inputtype: "textquery",
      fields: "name,rating,user_ratings_total",
      key: googleApiKey,
    });

    const response = await fetch(`${GOOGLE_PLACES_API_URL}?${params.toString()}`);
    if (!response.ok) return { trouve: false, note: null, nb_avis: null, match_fiable: false };

    const data = await response.json();
    if (data.status !== "OK" || !data.candidates?.length) {
      return { trouve: false, note: null, nb_avis: null, match_fiable: false };
    }

    const place = data.candidates[0];
    const placeName = (place.name || "").toLowerCase();
    const searchName = companyName.toLowerCase();
    const matchFiable = placeName.includes(searchName) || searchName.includes(placeName);

    return {
      trouve: true,
      note: place.rating !== undefined ? place.rating : null,
      nb_avis: place.user_ratings_total || 0,
      match_fiable: matchFiable,
    };
  } catch (error) {
    console.error("Google Places error:", error);
    return { trouve: false, note: null, nb_avis: null, match_fiable: false };
  }
}

// 2.6 Géorisques
async function getGeorisques(
  address: string | null,
  postalCode: string | null
): Promise<{ consulte: boolean; risques: string[]; zone_sismique: string | null; commune: string | null }> {
  const defaultResult = { consulte: false, risques: [], zone_sismique: null, commune: null };
  
  const addressToGeocode = address || postalCode;
  if (!addressToGeocode) return defaultResult;

  try {
    const cleanedAddress = cleanAddress(addressToGeocode);
    if (cleanedAddress.length < 5) return defaultResult;

    const geocodeResponse = await fetch(`${ADRESSE_API_URL}?q=${encodeURIComponent(cleanedAddress)}&limit=1`);
    if (!geocodeResponse.ok) return defaultResult;

    const geocodeData = await geocodeResponse.json();
    if (!geocodeData.features?.length) return defaultResult;

    const codeInsee = geocodeData.features[0].properties?.citycode;
    const commune = geocodeData.features[0].properties?.city;
    if (!codeInsee) return defaultResult;

    const [risksResponse, seismicResponse] = await Promise.all([
      fetch(`${GEORISQUES_API_URL}/gaspar/risques?code_insee=${codeInsee}`),
      fetch(`${GEORISQUES_API_URL}/zonage_sismique?code_insee=${codeInsee}`),
    ]);

    const risques: string[] = [];
    let zoneSismique: string | null = null;

    if (risksResponse.ok) {
      const risksData = await risksResponse.json();
      if (risksData.data?.[0]?.risques_detail) {
        for (const risque of risksData.data[0].risques_detail) {
          if (risque.num_risque?.startsWith("1") && risque.num_risque.length <= 2) {
            if (!risques.includes(risque.libelle_risque_long)) {
              risques.push(risque.libelle_risque_long);
            }
          }
        }
      }
    }

    if (seismicResponse.ok) {
      const seismicData = await seismicResponse.json();
      if (seismicData.data?.[0]?.zone_sismicite) {
        zoneSismique = seismicData.data[0].zone_sismicite;
      }
    }

    return { consulte: true, risques, zone_sismique: zoneSismique, commune };
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
  travaux: ExtractedData["travaux"],
  postalCode: string | null,
  referencePrix: TravauxReferencePrix[],
  zones: ZoneGeographique[]
): VerificationResult["comparaisons_prix"] {
  const comparisons: VerificationResult["comparaisons_prix"] = [];
  
  if (!postalCode) return comparisons;

  const prefix = postalCode.substring(0, 2);
  const zone = zones.find(z => z.prefixe_postal === prefix);
  const coefficient = zone?.coefficient || 0.90;
  const zoneType = zone?.type_zone || "province";

  for (const t of travaux) {
    if (!t.quantite || !t.montant || t.quantite <= 0) continue;

    const reference = referencePrix.find(r => 
      r.categorie_travaux.toLowerCase() === t.categorie.toLowerCase()
    );
    if (!reference) continue;

    const unitPrice = t.montant / t.quantite;
    const rangeMin = reference.prix_min_national * coefficient;
    const rangeMax = reference.prix_max_national * coefficient;

    let score: ScoringColor;
    let explication: string;

    if (unitPrice <= rangeMax) {
      score = "VERT";
      explication = "Prix cohérent avec le marché";
    } else if (unitPrice <= rangeMax * 1.3) {
      score = "ORANGE";
      explication = "Prix au-dessus du marché";
    } else {
      score = "ORANGE"; // NEVER RED for prices alone per spec
      explication = `Prix très supérieur au marché (${unitPrice.toFixed(2)}€ vs ${rangeMax.toFixed(2)}€ max)`;
    }

    comparisons.push({
      categorie: t.categorie,
      libelle: t.libelle || t.categorie,
      prix_unitaire_devis: unitPrice,
      fourchette_min: rangeMin,
      fourchette_max: rangeMax,
      zone: zoneType,
      score,
      explication,
    });
  }

  return comparisons;
}

// Main VERIFY function
async function verifyData(extracted: ExtractedData, supabase: any): Promise<VerificationResult> {
  console.log("PHASE 2 - Starting verification...");

  const siren = extractSiren(extracted.entreprise.siret);

  // Fetch reference data
  const [referencePrixResult, zonesResult] = await Promise.all([
    supabase.from("travaux_reference_prix").select("*"),
    supabase.from("zones_geographiques").select("*"),
  ]);

  // Run verifications in parallel (conditional per spec)
  const [ibanResult, companyResult, bodaccResult, rgeResult, georisquesResult] = await Promise.all([
    extracted.entreprise.iban ? verifyIBAN(extracted.entreprise.iban) : Promise.resolve({ verifie: false, valide: null, pays: null, code_pays: null, banque: null }),
    extracted.entreprise.siret ? verifyCompany(extracted.entreprise.siret) : Promise.resolve({ immatriculee: null, radiee: null, procedure_collective: null, capitaux_propres: null, capitaux_propres_negatifs: null, date_creation: null, anciennete: null, bilans: 0, nom: null, adresse: null, ville: null, lookup_status: "skipped" as const }),
    siren ? checkBodacc(siren) : Promise.resolve(false),
    checkRGE(extracted.entreprise.siret, extracted.travaux),
    (extracted.client.adresse_chantier || extracted.client.code_postal) ? getGeorisques(extracted.client.adresse_chantier, extracted.client.code_postal) : Promise.resolve({ consulte: false, risques: [], zone_sismique: null, commune: null }),
  ]);

  // Google only if company identifiable
  const googleResult = extracted.entreprise.nom 
    ? await getGoogleRating(
        companyResult.nom || extracted.entreprise.nom,
        companyResult.adresse || extracted.entreprise.adresse,
        companyResult.ville || extracted.client.ville
      )
    : { trouve: false, note: null, nb_avis: null, match_fiable: false };

  // Price comparisons
  const priceComparisons = comparePrices(
    extracted.travaux,
    extracted.client.code_postal,
    referencePrixResult.data || [],
    zonesResult.data || [],
  );

  const verified: VerificationResult = {
    entreprise_immatriculee: companyResult.immatriculee,
    entreprise_radiee: companyResult.radiee,
    procedure_collective: companyResult.procedure_collective || bodaccResult || null,
    capitaux_propres: companyResult.capitaux_propres,
    capitaux_propres_negatifs: companyResult.capitaux_propres_negatifs,
    date_creation: companyResult.date_creation,
    anciennete_annees: companyResult.anciennete,
    bilans_disponibles: companyResult.bilans,
    nom_officiel: companyResult.nom,
    adresse_officielle: companyResult.adresse,
    ville_officielle: companyResult.ville,
    lookup_status: companyResult.lookup_status,
    
    iban_verifie: ibanResult.verifie,
    iban_valide: ibanResult.valide,
    iban_pays: ibanResult.pays,
    iban_code_pays: ibanResult.code_pays,
    iban_banque: ibanResult.banque,
    
    rge_pertinent: rgeResult.pertinent,
    rge_trouve: rgeResult.trouve,
    rge_qualifications: rgeResult.qualifications,
    
    google_trouve: googleResult.trouve,
    google_note: googleResult.note,
    google_nb_avis: googleResult.nb_avis,
    google_match_fiable: googleResult.match_fiable,
    
    georisques_consulte: georisquesResult.consulte,
    georisques_risques: georisquesResult.risques,
    georisques_zone_sismique: georisquesResult.zone_sismique,
    georisques_commune: georisquesResult.commune,
    
    comparaisons_prix: priceComparisons,
  };

  console.log("PHASE 2 COMPLETE - Verification:", {
    immatriculee: verified.entreprise_immatriculee,
    procedure_collective: verified.procedure_collective,
    capitaux_negatifs: verified.capitaux_propres_negatifs,
    iban_valide: verified.iban_valide,
    google_note: verified.google_note,
  });

  return verified;
}

// ============================================================
// PHASE 3: SCORING DÉTERMINISTE (RÈGLES STRICTES - SANS IA)
// ============================================================
// 🔴 CRITÈRES CRITIQUES — FEU ROUGE (LISTE BLANCHE STRICTE)
// ⚠️ UN FEU ROUGE NE PEUT ÊTRE DÉCLENCHÉ QUE SI AU MOINS UN DES CAS SUIVANTS EST CONFIRMÉ EXPLICITEMENT
// ❌ TOUT AUTRE CRITÈRE EST INTERDIT COMME DÉCLENCHEUR DE FEU ROUGE
// ============================================================

function calculateScore(extracted: ExtractedData, verified: VerificationResult): ScoringResult {
  const rouges: string[] = [];
  const oranges: string[] = [];
  const verts: string[] = [];
  const informatifs: string[] = []; // ℹ️ Éléments informatifs SANS impact sur le score

  // ============================================================
  // 🔴 CRITÈRES ROUGES — LISTE BLANCHE STRICTE (6 cas uniquement)
  // ============================================================
  // ⚠️ UN FEU ROUGE NE PEUT ÊTRE DÉCLENCHÉ QUE SI CONFIRMÉ EXPLICITEMENT
  // ❌ Une donnée manquante/indisponible ne déclenche JAMAIS de ROUGE
  // ============================================================

  // 1) Entreprise non immatriculée ou radiée (API officielle CONFIRMÉ)
  if (verified.entreprise_immatriculee === false) {
    rouges.push("Entreprise non immatriculée ou introuvable dans les registres officiels (confirmé via API)");
  }
  if (verified.entreprise_radiee === true) {
    rouges.push("Entreprise radiée des registres officiels (confirmé via API)");
  }

  // 2) Procédure collective en cours CONFIRMÉE
  if (verified.procedure_collective === true) {
    rouges.push("Procédure collective en cours (redressement ou liquidation, confirmé)");
  }

  // 3) Capitaux propres négatifs CONFIRMÉS (dernier bilan)
  if (verified.capitaux_propres_negatifs === true && verified.capitaux_propres !== null) {
    const formatted = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(verified.capitaux_propres);
    rouges.push(`Capitaux propres négatifs au dernier bilan (${formatted})`);
  }

  // 4) Paiement en espèces EXPLICITEMENT mentionné
  const hasExplicitCash = extracted.paiement.modes.some(m => m.toLowerCase() === "especes");
  if (hasExplicitCash) {
    rouges.push("Paiement en espèces explicitement demandé sur le devis");
  }

  // 5) Acompte STRICTEMENT > 50% AVANT début des travaux
  const acompteAvantTravaux = extracted.paiement.acompte_avant_travaux_pct ?? 
    (!extracted.paiement.echeancier_detecte ? extracted.paiement.acompte_pct : null);
  
  if (acompteAvantTravaux !== null && acompteAvantTravaux > 50) {
    rouges.push(`Acompte supérieur à 50% demandé avant travaux (${acompteAvantTravaux}%)`);
  }

  // 6) Assurance incohérente confirmée niveau 2 (après upload attestation)
  // Note: Géré séparément via analyze-attestation

  // ============================================================
  // 🟠 CRITÈRES ORANGE — VIGILANCE RÉELLE CONFIRMÉE UNIQUEMENT
  // ============================================================
  // ⚠️ UNIQUEMENT les critères de vigilance RÉELS et CONFIRMÉS
  // ❌ Les données manquantes/indisponibles sont INFORMATIVES, pas ORANGE
  // ============================================================

  // A) IBAN étranger CONFIRMÉ (≠ invalide, ≠ absent)
  if (verified.iban_verifie && verified.iban_valide === true && verified.iban_code_pays && verified.iban_code_pays !== "FR") {
    oranges.push(`IBAN étranger (${getCountryName(verified.iban_code_pays)}) - à confirmer si attendu`);
  }

  // B) IBAN invalide CONFIRMÉ (erreur de format vérifiée)
  if (verified.iban_verifie && verified.iban_valide === false) {
    oranges.push("Format IBAN invalide (erreur de saisie probable)");
  }

  // C) Acompte entre 30% et 50% (donnée présente et confirmée)
  if (acompteAvantTravaux !== null && acompteAvantTravaux > 30 && acompteAvantTravaux <= 50) {
    oranges.push(`Acompte modéré (${acompteAvantTravaux}%) - un acompte ≤ 30% est recommandé`);
  }

  // D) Note Google < 4 (trouvée et confirmée, pas absente)
  if (verified.google_trouve && verified.google_note !== null && verified.google_note < 4.0) {
    oranges.push(`Note Google inférieure au seuil de confort (${verified.google_note}/5)`);
  }

  // E) Prix hors fourchette CONFIRMÉ (comparaison effectuée)
  const priceIssues = verified.comparaisons_prix.filter(p => p.score === "ORANGE");
  if (priceIssues.length > 0) {
    oranges.push(`${priceIssues.length} poste(s) avec prix au-dessus du marché à vérifier`);
  }

  // F) Entreprise jeune < 2 ans (CONFIRMÉ via API, pas absent)
  if (verified.entreprise_immatriculee === true && verified.anciennete_annees !== null && verified.anciennete_annees < 2) {
    oranges.push(`Entreprise récente (${verified.anciennete_annees} an${verified.anciennete_annees > 1 ? "s" : ""}) - ancienneté à prendre en compte`);
  }

  // ============================================================
  // ℹ️ ÉLÉMENTS INFORMATIFS — SANS IMPACT SUR LE SCORE
  // ============================================================
  // Ces éléments sont affichés pour information mais ne déclenchent
  // NI FEU ORANGE NI FEU ROUGE
  // ============================================================

  // IBAN non détecté sur le devis (donnée manquante = informatif)
  if (!extracted.entreprise.iban) {
    informatifs.push("ℹ️ Coordonnées bancaires non détectées sur le devis - demandez un RIB à l'artisan");
  }

  // SIRET non détecté (donnée manquante = informatif)
  if (!extracted.entreprise.siret) {
    if (extracted.entreprise.nom) {
      informatifs.push("ℹ️ SIRET non détecté sur le devis - demandez-le à l'artisan pour vérification");
    } else {
      informatifs.push("ℹ️ Coordonnées entreprise non identifiées sur le devis");
    }
  }

  // Vérification entreprise non effectuée ou en erreur (API indisponible = informatif)
  if (extracted.entreprise.siret && verified.lookup_status === "error") {
    informatifs.push("ℹ️ Vérification entreprise temporairement indisponible - données à confirmer manuellement");
  } else if (extracted.entreprise.siret && verified.lookup_status === "skipped") {
    informatifs.push("ℹ️ Vérification entreprise non effectuée");
  }

  // Assurance décennale non mentionnée ou partielle (donnée manquante = informatif)
  if (extracted.entreprise.assurance_decennale_mentionnee === false) {
    informatifs.push("ℹ️ Assurance décennale non détectée sur le devis - demandez l'attestation à l'artisan");
  } else if (extracted.entreprise.assurance_decennale_mentionnee === null) {
    informatifs.push("ℹ️ Assurance décennale à confirmer - mention partielle ou absente");
  }

  // Note Google non trouvée (API non concluante = informatif)
  if (!verified.google_trouve) {
    informatifs.push("ℹ️ Aucun avis Google trouvé pour cette entreprise");
  }

  // RGE non trouvé mais pertinent (donnée non trouvée = informatif, pas vigilance)
  if (verified.rge_pertinent && !verified.rge_trouve) {
    informatifs.push("ℹ️ Qualification RGE non trouvée - vérifiez l'éligibilité aux aides si applicable");
  }

  // Travaux peu détaillés (informatif)
  if (extracted.travaux.length === 0) {
    informatifs.push("ℹ️ Aucun poste de travaux détaillé détecté sur le devis");
  }

  // ============================================================
  // 🟢 CRITÈRES POSITIFS — FEU VERT
  // ============================================================

  // SIRET valide
  if (verified.entreprise_immatriculee === true) {
    verts.push("Entreprise identifiée dans les registres officiels");
  }

  // IBAN français valide
  if (verified.iban_verifie && verified.iban_valide === true && verified.iban_code_pays === "FR") {
    verts.push("IBAN France valide");
  }

  // Paiement traçable
  const hasTraceable = extracted.paiement.modes.some(m => ["virement", "cheque", "carte_bancaire"].includes(m.toLowerCase()));
  if (hasTraceable && !hasExplicitCash) {
    verts.push("Mode de paiement traçable");
  }

  // Acompte ≤ 30%
  if (acompteAvantTravaux !== null && acompteAvantTravaux <= 30) {
    verts.push(`Acompte raisonnable (${acompteAvantTravaux}%)`);
  }

  // Certifications pertinentes
  if (extracted.entreprise.certifications_mentionnees.some(c => c.toUpperCase().includes("RGE"))) {
    verts.push("Certification RGE mentionnée");
  }
  if (extracted.entreprise.certifications_mentionnees.some(c => c.toUpperCase().includes("QUALIBAT"))) {
    verts.push("Certification QUALIBAT mentionnée");
  }
  if (verified.rge_trouve) {
    verts.push("Qualification RGE vérifiée");
  }

  // Note Google ≥ 4.2
  if (verified.google_trouve && verified.google_note !== null && verified.google_note >= 4.2) {
    verts.push(`Bonne réputation en ligne (${verified.google_note}/5 sur Google)`);
  }

  // Ancienneté ≥ 5 ans
  if (verified.anciennete_annees !== null && verified.anciennete_annees >= 5) {
    verts.push(`Entreprise établie (${verified.anciennete_annees} ans d'ancienneté)`);
  }

  // Capitaux propres positifs
  if (verified.capitaux_propres !== null && verified.capitaux_propres >= 0) {
    verts.push("Situation financière saine (capitaux propres positifs)");
  }

  // Assurance décennale mentionnée
  if (extracted.entreprise.assurance_decennale_mentionnee === true) {
    verts.push("Assurance décennale mentionnée sur le devis");
  }

  // RC Pro mentionnée
  if (extracted.entreprise.assurance_rc_pro_mentionnee === true) {
    verts.push("RC Pro mentionnée sur le devis");
  }

  // ============================================================
  // CALCUL DU SCORE GLOBAL — RÈGLES NON NÉGOCIABLES
  // ============================================================
  // SI ≥ 1 critère critique CONFIRMÉ → FEU ROUGE
  // SINON SI ≥ 1 critère de vigilance RÉEL → FEU ORANGE
  // SINON → FEU VERT (même si éléments informatifs manquants)
  // ❌ Aucune exception
  // ❌ Les données manquantes ne déclenchent JAMAIS ORANGE ou ROUGE
  // ============================================================

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

  // ============================================================
  // SCORES PAR BLOC
  // ============================================================

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
// PHASE 4: RENDER (Construction sortie pour UI)
// ============================================================
// Chaque point de vigilance avec message explicatif pédagogique
// ❌ Aucun langage accusatoire
// ❌ Aucun jugement de probité
// ❌ Aucune conclusion juridique
// ============================================================

function renderOutput(
  extracted: ExtractedData,
  verified: VerificationResult,
  scoring: ScoringResult
): { points_ok: string[]; alertes: string[]; recommandations: string[]; types_travaux: any[] } {
  
  const points_ok: string[] = [];
  const alertes: string[] = [];
  const recommandations: string[] = [];

  // ============ BLOC 1: ENTREPRISE & FIABILITÉ ============

  if (verified.entreprise_immatriculee === true) {
    points_ok.push(`✓ Entreprise identifiée : ${verified.nom_officiel || extracted.entreprise.nom}`);
    
    if (verified.anciennete_annees !== null) {
      if (verified.anciennete_annees >= 5) {
        points_ok.push(`🟢 Entreprise établie : ${verified.anciennete_annees} ans d'existence`);
      } else if (verified.anciennete_annees >= 2) {
        points_ok.push(`🟠 Entreprise établie depuis ${verified.anciennete_annees} ans`);
      } else {
        alertes.push(`ℹ️ Entreprise récente (${verified.anciennete_annees} an(s)). Cet indicateur est basé sur des données publiques et permet d'identifier des tendances générales. Il ne constitue ni une preuve ni un jugement sur l'artisan.`);
      }
    }

    if (verified.bilans_disponibles >= 3) {
      points_ok.push(`🟢 ${verified.bilans_disponibles} bilans comptables disponibles`);
    } else if (verified.bilans_disponibles > 0) {
      points_ok.push(`🟠 ${verified.bilans_disponibles} bilan(s) comptable(s) disponible(s)`);
    } else {
      points_ok.push("ℹ️ Aucun bilan publié - la vérification financière est limitée");
    }

    if (verified.capitaux_propres !== null && verified.capitaux_propres >= 0) {
      const formatted = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(verified.capitaux_propres);
      points_ok.push(`🟢 Capitaux propres positifs (${formatted})`);
    } else if (verified.capitaux_propres_negatifs === true) {
      const formatted = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(verified.capitaux_propres!);
      alertes.push(`🔴 Capitaux propres négatifs (${formatted}). Cet indicateur est basé sur les derniers bilans publiés. Il peut indiquer une situation financière tendue.`);
    }

    if (verified.procedure_collective === true) {
      alertes.push("🔴 Procédure collective en cours (confirmée via BODACC). Cela indique une situation de redressement ou liquidation judiciaire.");
    } else if (verified.procedure_collective === false) {
      points_ok.push("✓ Aucune procédure collective en cours");
    }
  } else if (verified.entreprise_immatriculee === false) {
    alertes.push("🔴 Entreprise introuvable dans les registres officiels (confirmé via API). Cet indicateur est basé sur une recherche dans les bases de données publiques.");
  } else if (extracted.entreprise.siret) {
    points_ok.push(`ℹ️ SIRET présent : ${extracted.entreprise.siret}`);
    if (verified.lookup_status === "error") {
      points_ok.push("ℹ️ Les données entreprise n'ont pas pu être exploitées automatiquement (limitation temporaire). Cela n'indique pas un risque en soi.");
    } else {
      points_ok.push("ℹ️ Vous pouvez vérifier les informations sur societe.com ou infogreffe.fr");
    }
  } else if (extracted.entreprise.nom) {
    points_ok.push(`ℹ️ Entreprise : ${extracted.entreprise.nom}`);
    points_ok.push("ℹ️ SIRET non détecté sur le devis. Vous pouvez le demander à l'artisan pour une vérification complète.");
  } else {
    points_ok.push("ℹ️ Coordonnées entreprise non identifiées sur le devis.");
  }

  // Google Places
  if (verified.google_trouve && verified.google_note !== null) {
    if (verified.google_note >= 4.5) {
      points_ok.push(`🟢 Réputation en ligne : ${verified.google_note}/5 sur Google (${verified.google_nb_avis} avis)`);
    } else if (verified.google_note >= 4.0) {
      points_ok.push(`🟠 Réputation en ligne : ${verified.google_note}/5 sur Google (${verified.google_nb_avis} avis)`);
    } else {
      alertes.push(`ℹ️ Note Google inférieure au seuil de confort (${verified.google_note}/5). Cet indicateur est basé sur des données publiques. Consultez les avis pour plus de détails.`);
    }
  } else if (verified.google_trouve) {
    points_ok.push("🟠 Réputation en ligne : Aucun avis disponible sur Google");
  } else {
    points_ok.push("ℹ️ Établissement non trouvé sur Google (non critique)");
  }

  // RGE
  if (verified.rge_trouve) {
    points_ok.push(`🟢 Qualification RGE vérifiée : ${verified.rge_qualifications.slice(0, 2).join(", ")}`);
  } else if (verified.rge_pertinent) {
    points_ok.push("ℹ️ RGE non trouvé. Si vous souhaitez bénéficier d'aides à la rénovation énergétique, vérifiez l'éligibilité.");
  } else {
    points_ok.push("✓ Qualification RGE : non requise pour ce type de travaux");
  }

  // Certifications
  if (extracted.entreprise.certifications_mentionnees.some(c => c.toUpperCase().includes("QUALIBAT"))) {
    points_ok.push("🟢 Qualification QUALIBAT mentionnée sur le devis");
  }

  // ============ BLOC 2: DEVIS & COHÉRENCE ============

  for (const comparison of verified.comparaisons_prix) {
    if (comparison.score === "VERT") {
      points_ok.push(`✓ ${comparison.libelle}: prix cohérent (${comparison.prix_unitaire_devis.toFixed(2)}€)`);
    } else {
      alertes.push(`ℹ️ ${comparison.libelle}: ${comparison.explication}. Cet indicateur est basé sur des fourchettes de prix indicatives. Il ne constitue pas un jugement définitif.`);
    }
  }

  if (extracted.travaux.length === 0) {
    points_ok.push("ℹ️ Aucun poste de travaux détecté. Le détail des prestations pourrait être demandé.");
  }

  // ============ BLOC 3: SÉCURITÉ & PAIEMENT ============

  // Mode de paiement
  const hasTraceable = extracted.paiement.modes.some(m => ["virement", "cheque", "carte_bancaire"].includes(m.toLowerCase()));
  const hasCash = extracted.paiement.modes.some(m => m.toLowerCase() === "especes");

  if (hasCash) {
    alertes.push("🔴 Paiement en espèces explicitement mentionné. Privilégiez un mode de paiement traçable (virement, chèque).");
  } else if (hasTraceable) {
    points_ok.push("✓ Mode de paiement traçable accepté");
  }

  // IBAN
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

  // Acompte
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

  // Échéancier
  if (extracted.paiement.echeancier_detecte) {
    points_ok.push("✓ Échéancier de paiement prévu");
  }

  // Assurances
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

  // ============ BLOC 4: CONTEXTE CHANTIER ============

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

  // ============ RECOMMANDATIONS ============

  recommandations.push(`📊 ${scoring.explication}`);
  recommandations.push("📋 Pour confirmer les assurances, demandez les attestations d'assurance (PDF) à jour.");

  if (scoring.score_global === "ORANGE" && scoring.criteres_rouges.length === 0) {
    recommandations.push("✅ Les points de vigilance listés sont des vérifications de confort recommandées, pas des signaux d'alerte critiques.");
  }

  if (acompte !== null && acompte > 30) {
    recommandations.push("💡 Il est recommandé de limiter l'acompte à 30% maximum du montant total.");
  }

  // ============ TYPES TRAVAUX ENRICHIS ============

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

    // Download the file
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

    // Convert to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const base64Content = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    
    let mimeType = "application/pdf";
    const fileName = analysis.file_name.toLowerCase();
    if (fileName.endsWith(".png")) mimeType = "image/png";
    else if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) mimeType = "image/jpeg";
    else if (fileName.endsWith(".webp")) mimeType = "image/webp";

    console.log("=== PIPELINE START ===");
    console.log("Analysis ID:", analysisId);
    console.log("File:", analysis.file_name);

    // ============ PHASE 1: EXTRACTION UNIQUE ============
    let extracted: ExtractedData;
    
    try {
      console.log("--- PHASE 1: EXTRACTION (UN SEUL APPEL IA) ---");
      extracted = await extractDataFromDocument(base64Content, mimeType, lovableApiKey);
      
      // Handle rejected documents
      if (extracted.type_document === "facture") {
        await supabase
          .from("analyses")
          .update({
            status: "completed",
            score: null,
            resume: "Document non conforme : facture détectée",
            points_ok: [],
            alertes: ["Ce document est une facture, pas un devis. VerifierMonDevis.fr analyse uniquement des devis, c'est-à-dire des documents émis AVANT réalisation des travaux."],
            recommandations: ["Veuillez transmettre un devis pour bénéficier de l'analyse."],
            raw_text: JSON.stringify({ type_document: "facture", extracted }),
          })
          .eq("id", analysisId);

        return new Response(
          JSON.stringify({ success: true, analysisId, score: null, message: "Document non conforme (facture)" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (extracted.type_document === "autre") {
        await supabase
          .from("analyses")
          .update({
            status: "completed",
            score: null,
            resume: "Document non conforme",
            points_ok: [],
            alertes: ["Le document transmis ne correspond pas à un devis de travaux. Veuillez transmettre un devis conforme pour bénéficier de l'analyse."],
            recommandations: ["VerifierMonDevis.fr analyse les devis de travaux de rénovation, construction, plomberie, électricité, etc."],
            raw_text: JSON.stringify({ type_document: "autre", extracted }),
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

      await supabase
        .from("analyses")
        .update({ status: "error", error_message: publicMessage })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({ error: errorCode, message: publicMessage }),
        { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ PHASE 2: VÉRIFICATION (APIs - SANS IA) ============
    console.log("--- PHASE 2: VÉRIFICATION (APIs conditionnées) ---");
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

    // Store debug data
    const rawDataForDebug = JSON.stringify({
      type_document: extracted.type_document,
      extracted,
      verified,
      scoring,
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
