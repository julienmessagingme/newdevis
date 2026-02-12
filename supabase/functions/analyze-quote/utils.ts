// ============ CORS HEADERS ============

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============ PIPELINE ERROR ============

export class PipelineError extends Error {
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

export const isPipelineError = (e: unknown): e is PipelineError => e instanceof PipelineError;

// ============ API ENDPOINTS ============

export const GEMINI_AI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
export const PAPPERS_API_URL = "https://api.pappers.fr/v2";
export const GOOGLE_PLACES_API_URL = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json";
export const ADEME_RGE_API_URL = "https://data.ademe.fr/data-fair/api/v1/datasets/liste-des-entreprises-rge-2/lines";
export const OPENIBAN_API_URL = "https://openiban.com/validate";
export const GEORISQUES_API_URL = "https://georisques.gouv.fr/api/v1";
export const ADRESSE_API_URL = "https://api-adresse.data.gouv.fr/search";
export const GPU_API_URL = "https://apicarto.ign.fr/api/gpu/document";

// ============ CIRCUIT BREAKER SETTINGS ============

const CIRCUIT_BREAKER_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

// ============ HELPER FUNCTIONS ============

export function getCountryName(countryCode: string): string {
  const countries: Record<string, string> = {
    "FR": "France", "DE": "Allemagne", "BE": "Belgique", "CH": "Suisse",
    "ES": "Espagne", "IT": "Italie", "PT": "Portugal", "LU": "Luxembourg",
    "NL": "Pays-Bas", "GB": "Royaume-Uni", "IE": "Irlande", "PL": "Pologne",
  };
  return countries[countryCode] || countryCode;
}

export function cleanAddress(rawAddress: string): string {
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

export function extractSiren(siret: string | null): string | null {
  if (!siret) return null;
  const cleaned = siret.replace(/\s/g, "");
  return cleaned.length >= 9 ? cleaned.substring(0, 9) : null;
}

// ============================================================
// HELPER: REPAIR TRUNCATED JSON
// ============================================================

export function repairTruncatedJson(json: string): string {
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

export async function computeFileHash(data: Uint8Array): Promise<string> {
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

export async function checkCircuitBreaker(
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
