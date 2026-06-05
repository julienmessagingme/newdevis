// Wrapper sûr autour du Meta Pixel (fbq).
//
// `fbq` n'existe sur `window` QU'APRÈS le consentement cookies : il est chargé
// par `loadTrackingScripts()` dans `src/layouts/BaseLayout.astro`, uniquement
// quand l'utilisateur a cliqué « Accepter ». Si pas de consentement → ces
// helpers sont des no-op silencieux (conformité RGPD garantie par construction).

type FbqParams = Record<string, unknown>;

function getFbq(): ((...args: unknown[]) => void) | null {
  if (typeof window === "undefined") return null;
  const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq;
  return typeof fbq === "function" ? fbq : null;
}

/** Déclenche un événement standard Meta (ex: 'Lead', 'CompleteRegistration'). */
export function trackPixel(event: string, params?: FbqParams): void {
  const fbq = getFbq();
  if (!fbq) return;
  try {
    if (params) fbq("track", event, params);
    else fbq("track", event);
  } catch {
    // no-op : ne jamais casser le flux applicatif pour du tracking
  }
}

/**
 * Déclenche un événement au plus une fois par `key` et par navigateur.
 * Utile pour ne pas re-compter une conversion à chaque rechargement de page
 * (ex: revisite d'une analyse déjà vue).
 */
export function trackPixelOnce(key: string, event: string, params?: FbqParams): void {
  if (typeof window === "undefined") return;
  const storageKey = `fb_px_${key}`;
  try {
    if (localStorage.getItem(storageKey)) return;
    localStorage.setItem(storageKey, "1");
  } catch {
    // localStorage indisponible (mode privé strict) → on laisse passer l'event
  }
  trackPixel(event, params);
}
