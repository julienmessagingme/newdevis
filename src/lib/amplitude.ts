/**
 * Amplitude Analytics — utilitaire client-side uniquement.
 * Initialisation globale : BaseLayout.astro (une seule fois pour toute l'app).
 * Tracking événements : import trackEvent() depuis les composants React.
 */
import * as amplitude from '@amplitude/unified';

const AMPLITUDE_API_KEY = '19fac5b54a5d6612409e582f67650773';

let initialized = false;

/**
 * Initialise Amplitude une seule fois.
 * Appelé depuis BaseLayout.astro — ne jamais appeler depuis les composants.
 */
export function initAmplitude(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  amplitude.initAll(AMPLITUDE_API_KEY, {
    serverZone: 'EU',
    analytics: { autocapture: true },
    sessionReplay: { sampleRate: 1 },
  });
}

/**
 * Track un événement custom. No-op côté serveur (SSR-safe).
 */
export function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return;
  amplitude.track(eventName, properties);
}

/**
 * Track une page view. Appelé automatiquement depuis BaseLayout sur chaque page.
 */
export function trackPageView(path?: string): void {
  trackEvent('page_view', {
    path: path ?? window.location.pathname,
    url: window.location.href,
    referrer: document.referrer || undefined,
  });
}
