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
 * Track un événement custom — propagé à Amplitude ET à Google Analytics (gtag) si chargé.
 * No-op côté serveur (SSR-safe).
 *
 * V2026-05-11 : ajout propagation gtag pour avoir le funnel visible côté GA4 (la
 * référence des outils marketing classiques) en plus d'Amplitude (product analytics).
 * Sans ça, les events comme `redirect_to_inscription` n'étaient pas visibles dans GA4 où
 * l'équipe marketing pilote ses KPIs.
 */
export function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return;
  amplitude.track(eventName, properties ?? {});
  // Propagation GA4 — fail silently si gtag pas chargé (consent pending / adblock / SSR)
  try {
    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    if (typeof gtag === 'function') {
      gtag('event', eventName, properties ?? {});
    }
  } catch {
    /* never throw */
  }
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
