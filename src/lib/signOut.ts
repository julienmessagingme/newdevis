/**
 * Logout cross-domaine entre verifiermondevis.fr et gerermonchantier.fr.
 *
 * localStorage est isolé par origin → un signOut sur vmd.fr ne touche pas
 * la session sur gmc.fr (et inversement). Pour gérer les deux origines :
 *
 * 1. `supabase.auth.signOut({ scope: 'global' })` invalide TOUS les
 *    refresh tokens du user serveur-side.
 * 2. Vide le localStorage de l'origine courante (en backup, supabase
 *    le fait via signOut() mais belt-and-suspenders).
 * 3. Navigue (full page redirect, PAS iframe — bloqué par CSP
 *    `frame-ancestors 'none'`) vers `<other-origin>/auth/clear-session?return=…`.
 *    Cette page vide son propre localStorage puis redirige vers `return`.
 *
 * UX : le user voit brièvement (~300ms) un écran "Déconnexion en cours…" sur
 * l'autre origin avant de revenir sur l'origine courante (logout-redirect-back
 * dance).
 *
 * À utiliser depuis tous les boutons de déconnexion (Header.astro inline,
 * Header.tsx React, etc.).
 */
import { supabase } from '@/integrations/supabase/client';

const GMC_HOST_RE = /^(www\.)?gerermonchantier\.fr$/i;

export async function signOutCrossDomain(redirectTo: string = '/'): Promise<void> {
  // 1. Supabase global signOut serveur-side. Best-effort — si ça échoue
  // (réseau), on continue le clean local pour ne pas laisser le user zombie.
  try {
    await supabase.auth.signOut({ scope: 'global' });
  } catch (e) {
    console.error('[signOut] global signOut failed:', e);
  }

  // 2. Backup : vide manuellement les clés Supabase du localStorage local.
  try {
    Object.keys(localStorage)
      .filter((k) => k.includes('auth-token'))
      .forEach((k) => localStorage.removeItem(k));
    sessionStorage.removeItem('vmd_session_active');
  } catch {}

  // 3. Redirect chain vers l'autre origin (pas d'iframe — CSP `frame-ancestors`
  // bloque). La page /auth/clear-session vide son localStorage et redirige back.
  const isGmcOrigin = GMC_HOST_RE.test(window.location.hostname);
  const otherOrigin = isGmcOrigin
    ? 'https://www.verifiermondevis.fr'
    : 'https://gerermonchantier.fr';
  const returnUrl = `${window.location.origin}${redirectTo}`;
  window.location.href = `${otherOrigin}/auth/clear-session?return=${encodeURIComponent(returnUrl)}`;
}
