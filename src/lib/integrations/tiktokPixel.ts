// Wrapper sûr autour du TikTok Pixel (window.ttq).
//
// `ttq` n'existe sur `window` QU'APRÈS le consentement cookies : il est chargé
// par `loadTrackingScripts()` dans `src/layouts/BaseLayout.astro`, uniquement
// quand l'utilisateur a cliqué « Accepter ». Si pas de consentement → ces
// helpers sont des no-op silencieux (conformité RGPD garantie par construction).
//
// Événements standards TikTok utilisés ici :
//   - PageView              → fire auto au chargement du pixel (BaseLayout)
//   - CompleteRegistration  → inscription d'un compte
//   - SubmitForm            → soumission/finalisation d'une analyse de devis
//   - Subscribe             → abonnement payant (à câbler plus tard si besoin)
//
// Liste complète : https://business-api.tiktok.com/portal/docs?id=1739585702922241

type TtqParams = Record<string, unknown>;

interface TtqLike {
  track: (event: string, params?: TtqParams) => void;
}

function getTtq(): TtqLike | null {
  if (typeof window === "undefined") return null;
  const ttq = (window as unknown as { ttq?: TtqLike }).ttq;
  return ttq && typeof ttq.track === "function" ? ttq : null;
}

/** Déclenche un événement standard TikTok (ex: 'CompleteRegistration', 'SubmitForm'). */
export function trackTikTok(event: string, params?: TtqParams): void {
  const ttq = getTtq();
  if (!ttq) return;
  try {
    if (params) ttq.track(event, params);
    else ttq.track(event);
  } catch {
    // no-op : ne jamais casser le flux applicatif pour du tracking
  }
}

/**
 * Déclenche un événement au plus une fois par `key` et par navigateur.
 * Utile pour ne pas re-compter une conversion à chaque rechargement de page
 * (ex: revisite d'une analyse déjà vue).
 */
export function trackTikTokOnce(key: string, event: string, params?: TtqParams): void {
  if (typeof window === "undefined") return;
  const storageKey = `tt_px_${key}`;
  try {
    if (localStorage.getItem(storageKey)) return;
    localStorage.setItem(storageKey, "1");
  } catch {
    // localStorage indisponible (mode privé strict) → on laisse passer l'event
  }
  trackTikTok(event, params);
}
