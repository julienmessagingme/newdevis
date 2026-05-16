/**
 * haptics.ts — retour haptique mobile.
 *
 * Wrap autour de `navigator.vibrate()` avec des patterns sémantiques.
 * Permet de marquer les actions importantes (paiement enregistré, lot complété,
 * devis signé, erreur réseau) avec un feedback tactile distinct.
 *
 * Compatibilité :
 *  - Android : navigator.vibrate() supporté largement (Chrome, Firefox, etc.).
 *  - iOS Safari : NON supporté en web (Apple bride volontairement). Le call
 *    est silencieusement ignoré → pas d'erreur. iOS PWA installée : idem.
 *  - Si on veut iOS un jour : passer via une PWA installable + Web Vibration
 *    API expérimentale ou Capacitor.
 *
 * Politesse : ne pas spammer. Réserver aux actions VALIDÉES (pas chaque tap
 * neutre). Désactivable globalement via localStorage["haptics_disabled"]="1".
 */

type HapticType = "light" | "medium" | "heavy" | "success" | "warning" | "error" | "selection";

const PATTERNS: Record<HapticType, number | number[]> = {
  light:     10,
  medium:    20,
  heavy:     40,
  success:   [12, 60, 12],         // double-tap court espacé
  warning:   [30, 50, 30],         // double-tap plus marqué
  error:     [40, 60, 40, 60, 40], // triple-tap insistant
  selection: 5,                    // très court (équivalent UISelectionFeedback iOS)
};

let cachedDisabled: boolean | null = null;
function isDisabled(): boolean {
  if (cachedDisabled !== null) return cachedDisabled;
  try {
    cachedDisabled = typeof localStorage !== "undefined" && localStorage.getItem("haptics_disabled") === "1";
  } catch {
    cachedDisabled = false;
  }
  return cachedDisabled;
}

export function haptic(type: HapticType = "light"): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (isDisabled()) return;
  try {
    navigator.vibrate(PATTERNS[type]);
  } catch { /* no-op */ }
}

/** Désactiver/réactiver globalement (préférence utilisateur). */
export function setHapticsEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.removeItem("haptics_disabled");
    else         localStorage.setItem("haptics_disabled", "1");
    cachedDisabled = !enabled;
  } catch { /* no-op */ }
}

export function areHapticsEnabled(): boolean {
  return !isDisabled();
}
