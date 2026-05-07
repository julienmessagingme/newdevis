/**
 * Logout cross-domaine entre verifiermondevis.fr et gerermonchantier.fr.
 *
 * localStorage est isolé par origin → un signOut sur vmd.fr ne touche pas
 * la session sur gmc.fr (et inversement). On orchestre donc un nettoyage
 * sur les deux origines :
 *
 * 1. `supabase.auth.signOut({ scope: 'global' })` invalide TOUS les
 *    refresh tokens du user serveur-side (donc même les sessions vivant
 *    sur l'autre origin deviennent inutilisables au prochain refresh).
 * 2. Le localStorage de l'origine courante est vidé (Supabase le fait
 *    via `signOut()`, on s'assure du backup au cas où).
 * 3. Un iframe caché vers `<other-origin>/auth/clear-session` charge cette
 *    page sur l'autre origin → elle vide son propre localStorage.
 * 4. On attend ~800ms pour laisser l'iframe le temps de charger + vider,
 *    puis on redirige `/`.
 *
 * À utiliser depuis tous les boutons de déconnexion (Header.astro inline,
 * Header.tsx React, etc.).
 */
import { supabase } from '@/integrations/supabase/client';

const GMC_HOST_RE = /^(www\.)?gerermonchantier\.fr$/i;

export async function signOutCrossDomain(redirectTo: string = '/'): Promise<void> {
  // 1. Supabase global signOut : invalide tous les refresh tokens du user
  //    serveur-side. Best-effort — si ça échoue (réseau), on continue quand
  //    même le clean local pour ne pas laisser le user dans un état zombie.
  try {
    await supabase.auth.signOut({ scope: 'global' });
  } catch (e) {
    console.error('[signOut] global signOut failed:', e);
  }

  // 2. Backup : vide manuellement les clés Supabase du localStorage local
  //    (signOut() le fait normalement, mais belt-and-suspenders)
  try {
    Object.keys(localStorage)
      .filter((k) => k.includes('auth-token'))
      .forEach((k) => localStorage.removeItem(k));
    sessionStorage.removeItem('vmd_session_active');
  } catch {}

  // 3. Hidden iframe pour vider l'autre origin
  try {
    const isGmcOrigin = GMC_HOST_RE.test(window.location.hostname);
    const otherOrigin = isGmcOrigin
      ? 'https://www.verifiermondevis.fr'
      : 'https://gerermonchantier.fr';
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = `${otherOrigin}/auth/clear-session`;
    document.body.appendChild(iframe);
  } catch {}

  // 4. Redirect après court délai (laisser l'iframe charger + clear)
  setTimeout(() => {
    window.location.href = redirectTo;
  }, 800);
}
