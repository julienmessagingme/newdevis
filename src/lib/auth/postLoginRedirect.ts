/**
 * Helper post-login : décide où rediriger un user après authentification réussie,
 * en orchestrant un SSO handoff cross-domaine si la cible n'est pas sur le
 * même brand que la page de connexion actuelle.
 *
 * Logique :
 * 1. Si un `?redirect=…` explicite est passé en URL → on le respecte (sécurité :
 *    paths relatifs uniquement). Cas typique : `connexion?redirect=/mon-chantier`
 *    quand un user non-logué a tenté d'accéder directement à /mon-chantier.
 * 2. Si on est déjà sur gmc.fr → toujours /mon-chantier sans vérifier l'allowlist.
 *    Règle : le contrôle d'accès GMC est géré côté serveur/middleware, pas ici.
 *    Sans cette règle, un user allowlisté qui se connecte sur gmc.fr se retrouve
 *    renvoyé vers vmd.fr (boucle infinie).
 * 3. Sur vmd.fr : cible selon l'accès produit du user (allowlist GMC).
 *    - User a accès GMC → SSO handoff cross-domain vers gmc.fr/mon-chantier
 *    - Sinon → vmd.fr/tableau-de-bord (redirect direct, même brand)
 * 4. Fallback si SSO handoff échoue → redirect hard cross-domain.
 *
 * Utilisé depuis :
 * - `Login.tsx` (form submit success)
 * - `auth/callback.astro` (script inline, après OAuth Google success)
 */
import type { Brand } from '@/lib/auth/brand';
import { hasGmcAccess } from '@/lib/auth/gmcAccess';

const ORIGIN_BY_BRAND: Record<Brand, string> = {
  vmd: 'https://www.verifiermondevis.fr',
  gmc: 'https://gerermonchantier.fr',
};

export interface PostLoginRedirectArgs {
  /** Brand de la page de connexion sur laquelle l'user vient de se logger. */
  currentBrand: Brand;
  /** Email réel du user (depuis `data.user.email` Supabase). */
  userEmail: string;
  /** Access token du user, pour appeler l'endpoint SSO. */
  accessToken: string;
  /** Redirect explicite passé en query string `?redirect=…`. */
  explicitRedirect: string | null;
}

/**
 * Effectue le redirect post-login. Modifie `window.location.href`. Ne return rien.
 * Doit être appelé après que la session Supabase est posée en localStorage.
 */
export async function performPostLoginRedirect(args: PostLoginRedirectArgs): Promise<void> {
  const { currentBrand, userEmail, accessToken, explicitRedirect } = args;

  // 1. Redirect explicite respecté (path relatif uniquement, anti open-redirect)
  if (
    explicitRedirect &&
    explicitRedirect.startsWith('/') &&
    !explicitRedirect.startsWith('//')
  ) {
    window.location.href = explicitRedirect;
    return;
  }

  // 2. Si on est déjà sur gmc.fr → toujours /mon-chantier.
  //    NE PAS vérifier l'allowlist ici : l'user est déjà sur le bon domain,
  //    le renvoyer sur vmd.fr crée une boucle infinie (bug loop auth GMC↔VMD).
  if (currentBrand === 'gmc') {
    window.location.href = '/mon-chantier';
    return;
  }

  // 3. Sur vmd.fr : cible selon l'accès produit du user (allowlist GMC)
  const userHasGmc = hasGmcAccess(userEmail);
  const targetBrand: Brand = userHasGmc ? 'gmc' : 'vmd';
  const targetPath = userHasGmc ? '/mon-chantier' : '/tableau-de-bord';

  // 4. Même brand (vmd → vmd) → redirect direct
  if (targetBrand === 'vmd') {
    window.location.href = targetPath;
    return;
  }

  // 5. Cross-domain (vmd → gmc) → SSO handoff via magic link Supabase
  if (accessToken) {
    try {
      const res = await fetch('/api/sso/handoff', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ targetBrand, targetPath }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.handoff_url) {
          window.location.href = json.handoff_url;
          return;
        }
      }
      console.error('[postLoginRedirect] SSO handoff failed:', res.status);
    } catch (e) {
      console.error('[postLoginRedirect] SSO exception:', e);
    }
  }

  // 6. Fallback : redirect hard cross-domain (l'utilisateur devra se reconnecter
  // sur l'origine cible si SSO indisponible). Mieux que de laisser bloqué.
  window.location.href = `${ORIGIN_BY_BRAND[targetBrand]}${targetPath}`;
}
