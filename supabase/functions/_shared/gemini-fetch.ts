/**
 * Shared helper pour les fetch Gemini — timeout explicite + retry avec backoff
 * exponentiel sur les erreurs transitoires.
 *
 * Pourquoi : avant ce helper, chaque call Gemini était un `fetch()` brut. Si
 * l'API renvoyait un 429 (rate limit) ou 5xx (transient), le code abandonnait
 * silencieusement → tool_call wasted côté agent ou groupe vide côté analyse.
 *
 * Règles :
 * - Retry sur 429, 500, 502, 503, 504 et erreurs réseau (TypeError fetch).
 * - Pas de retry sur 4xx autres (400, 401, 403, 404 → erreur permanente).
 * - Backoff exponentiel + jitter pour éviter le thundering herd.
 * - Timeout dur via AbortSignal.timeout (par défaut 30s).
 *
 * Ne pas utiliser ce helper dans extract.ts : chaque tentative ~40s, budget
 * Supabase 60s → un seul shot. Cf. extract.ts:130 commentaire MAX_RETRIES=0.
 */

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export interface GeminiFetchOptions {
  /** Timeout par tentative en ms (défaut 30000). */
  timeoutMs?: number;
  /** Nombre de tentatives total — la 1ère + N-1 retries (défaut 3). */
  maxAttempts?: number;
  /** Préfixe pour les logs de debug (ex: "[MarketPrices]"). */
  logPrefix?: string;
}

/**
 * Fetch avec timeout dur (sans retry).
 * Utiliser quand on ne veut pas de retry mais qu'on veut quand même couper net
 * en cas de stale (ex: extract.ts qui a son propre budget de temps).
 *
 * Note compat Deno : on n'utilise PAS `AbortSignal.any()` (introduit Deno 1.40+,
 * historiquement non dispo sur certaines versions Edge Functions Supabase).
 * À la place, on chaîne manuellement : un AbortController custom + relais
 * de l'abort externe via un listener. Compatible toutes versions Deno récentes.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 30000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Relais de l'abort externe vers notre controller (sans AbortSignal.any).
  let externalAbortHandler: (() => void) | null = null;
  if (init.signal) {
    if (init.signal.aborted) {
      controller.abort();
    } else {
      externalAbortHandler = () => controller.abort();
      init.signal.addEventListener("abort", externalAbortHandler);
    }
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
    if (externalAbortHandler && init.signal) {
      init.signal.removeEventListener("abort", externalAbortHandler);
    }
  }
}

/**
 * Fetch Gemini avec timeout + retry exponentiel sur erreurs transitoires.
 *
 * Backoff : 500ms, 2s, 8s (jusqu'à maxAttempts-1 retries).
 * Avec jitter ±25% pour éviter le thundering herd.
 */
export async function fetchGeminiWithRetry(
  url: string,
  init: RequestInit,
  opts: GeminiFetchOptions = {},
): Promise<Response> {
  const { timeoutMs = 30000, maxAttempts = 3, logPrefix = "[Gemini]" } = opts;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs);

      if (response.ok) return response;

      if (!RETRYABLE_STATUS.has(response.status) || attempt === maxAttempts) {
        return response;
      }

      const errBody = await response.text().catch(() => "");
      console.warn(
        `${logPrefix} ${response.status} ${response.statusText} (attempt ${attempt}/${maxAttempts}) — ${errBody.slice(0, 200)}`,
      );
    } catch (err) {
      lastError = err;
      const isTimeout = err instanceof Error && err.name === "TimeoutError";
      const isAbort = err instanceof Error && err.name === "AbortError";

      if (attempt === maxAttempts) throw err;

      console.warn(
        `${logPrefix} fetch error (attempt ${attempt}/${maxAttempts}): ${
          err instanceof Error ? err.message : String(err)
        }${isTimeout ? " [timeout]" : isAbort ? " [aborted]" : ""}`,
      );
    }

    // Backoff exponentiel avec jitter ±25%
    const baseDelay = 500 * Math.pow(4, attempt - 1); // 500, 2000, 8000
    const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1);
    await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
  }

  // Inatteignable (la dernière tentative throw ou return).
  throw lastError ?? new Error("fetchGeminiWithRetry: max attempts exhausted");
}
