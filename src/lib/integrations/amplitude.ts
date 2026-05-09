/**
 * Amplitude Analytics — client-side uniquement.
 *
 * Utilise @amplitude/analytics-browser (SDK standard, sans Session Replay).
 * @amplitude/unified était le package précédent — il embarque le Session Replay
 * qui charge du WebAssembly, ce qui fait silencieusement planter le bundling Vite.
 *
 * Initialisation globale : BaseLayout.astro (une seule fois par page).
 * Tracking events      : import trackEvent() depuis les composants React.
 */
import * as amplitude from '@amplitude/analytics-browser';

const AMPLITUDE_API_KEY = '19fac5b54a5d6612409e582f67650773';

let initialized = false;

/**
 * Initialise Amplitude une seule fois côté navigateur.
 * Appelé depuis BaseLayout.astro — ne jamais appeler depuis les composants.
 */
export function initAmplitude(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  amplitude.init(AMPLITUDE_API_KEY, {
    serverZone: 'EU',
    defaultTracking: {
      pageViews: false,      // on gère page_view manuellement
      sessions: true,        // durée session automatique
      formInteractions: false,
      fileDownloads: false,
    },
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
  amplitude.track(eventName, properties ?? {});
}

/**
 * Track une page view avec les métadonnées de navigation.
 * Appelé automatiquement depuis BaseLayout sur chaque page.
 */
export function trackPageView(path?: string): void {
  trackEvent('page_view', {
    path: path ?? window.location.pathname,
    url: window.location.href,
    referrer: document.referrer || undefined,
  });
}
