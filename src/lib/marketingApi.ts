/**
 * Helper serveur pour appeler l'API FastAPI gerermonchantier-marketing.
 *
 * À utiliser uniquement dans les routes Astro `/api/admin/marketing/*` (server-side).
 * Le Bearer token ne doit JAMAIS être exposé au client — pas de préfixe PUBLIC_.
 */

const DEFAULT_DEV_URL = 'http://localhost:8082';
const DEFAULT_TIMEOUT_MS = 360_000; // run-daily-content peut prendre 2-4 min (cf RUNBOOK)

function getApiBase(): string {
  // process.env lu au runtime (Vercel) ; import.meta.env en fallback dev (Vite SSR)
  const url = process.env.MARKETING_API_URL ?? import.meta.env.MARKETING_API_URL;
  return (url && url.trim()) || DEFAULT_DEV_URL;
}

function getApiToken(): string | null {
  const token = process.env.MARKETING_API_BEARER_TOKEN ?? import.meta.env.MARKETING_API_BEARER_TOKEN;
  return token && token.trim() ? token.trim() : null;
}

export interface MarketingFetchOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  timeoutMs?: number;
  /** Retourne la Response brute (pour streaming, ex: ZIP). Default: parse JSON. */
  raw?: boolean;
  signal?: AbortSignal;
}

export interface MarketingFetchError {
  status: number;
  message: string;
}

export class MarketingApiError extends Error {
  status: number;
  upstream?: unknown;
  constructor(status: number, message: string, upstream?: unknown) {
    super(message);
    this.name = 'MarketingApiError';
    this.status = status;
    this.upstream = upstream;
  }
}

/**
 * Appelle un endpoint FastAPI marketing avec le Bearer token.
 *
 * - Throw MarketingApiError(503) si token absent.
 * - Throw MarketingApiError(<status>, <upstream message>) si réponse non-2xx.
 * - Throw MarketingApiError(504) si timeout réseau.
 * - Throw MarketingApiError(502) sur autres erreurs réseau.
 */
export async function marketingFetch<T = unknown>(
  path: string,
  opts: MarketingFetchOptions = {},
): Promise<T> {
  const token = getApiToken();
  if (!token) {
    throw new MarketingApiError(503, 'MARKETING_API_BEARER_TOKEN non configuré côté serveur');
  }

  const base = getApiBase().replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${base}${cleanPath}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  // Si l'appelant fournit son propre signal, on le combine
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: opts.raw ? '*/*' : 'application/json',
    };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(url, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    if (opts.raw) return res as unknown as T;

    if (!res.ok) {
      let upstreamMsg: string | undefined;
      try {
        const data = await res.json();
        upstreamMsg = typeof data?.detail === 'string'
          ? data.detail
          : typeof data?.error === 'string'
            ? data.error
            : JSON.stringify(data).slice(0, 300);
      } catch {
        upstreamMsg = (await res.text()).slice(0, 300);
      }
      throw new MarketingApiError(
        res.status,
        upstreamMsg || `Marketing API error (${res.status})`,
      );
    }

    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof MarketingApiError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new MarketingApiError(504, 'Marketing API timeout');
    }
    const msg = err instanceof Error ? err.message : 'Erreur réseau Marketing API';
    throw new MarketingApiError(502, msg);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Appel raw qui retourne directement la Response (pour StreamingResponse type ZIP).
 * Lance une MarketingApiError sur non-2xx (idem marketingFetch).
 */
export async function marketingFetchRaw(
  path: string,
  opts: Omit<MarketingFetchOptions, 'raw'> = {},
): Promise<Response> {
  const res = await marketingFetch<Response>(path, { ...opts, raw: true });
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const data = await res.clone().json();
      detail = typeof data?.detail === 'string' ? data.detail : undefined;
    } catch {
      detail = (await res.clone().text()).slice(0, 300);
    }
    throw new MarketingApiError(res.status, detail || `Marketing API error (${res.status})`);
  }
  return res;
}

/**
 * Convertit une MarketingApiError en réponse JSON HTTP propre pour l'API route Astro.
 */
export function marketingErrorResponse(err: unknown, fallbackStatus = 502): Response {
  const headers = { 'Content-Type': 'application/json' } as const;
  if (err instanceof MarketingApiError) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: err.status, headers },
    );
  }
  const msg = err instanceof Error ? err.message : 'Erreur inconnue';
  return new Response(JSON.stringify({ error: msg }), { status: fallbackStatus, headers });
}
