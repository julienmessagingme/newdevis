/**
 * Helper post-login : décide où rediriger un user après authentification réussie,
 * en orchestrant un SSO handoff cross-domaine si la cible n'est pas sur le
 * même brand que la page de connexion actuelle.
 *
 * Logique :
 * 1. Si un `?redirect=…` explicite est passé en URL → on le respecte (sécurité :
 *    paths relatifs uniquement). Cas typique : `connexion?redirect=/mon-chantier`
 *    quand un user non-logué a tenté d'accéder directement à /mon-chantier.
 * 2. Sinon, on calcule la cible naturelle selon l'accès du user :
 *    - User a accès GMC (allowlist) → cible = gmc.fr/mon-chantier
 *    - Sinon → cible = vmd.fr/tableau-de-bord
 * 3. Si la cible est sur le même brand que la page actuelle → redirect direct
 *    (juste `window.location.href = path`).
 * 4. Sinon → SSO handoff via `/api/sso/handoff` qui retourne l'action_link
 *    Supabase, puis navigation. Au pire (si l'API échoue), fallback hard
 *    redirect cross-domain qui forcera l'utilisateur à se reconnecter.
 *
 * Utilisé depuis :
 * - `Login.tsx` (form submit success)
 * - `auth/callback.astro` (script inline, après OAuth Google success)
 */
import type { Brand } from '@/lib/brand';
import { hasGmcAccess } from '@/lib/gmcAccess';

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

  // 2. Calcul de la cible naturelle selon l'accès produit du user
  const userHasGmc = hasGmcAccess(userEmail);
  const targetBrand: Brand = userHasGmc ? 'gmc' : 'vmd';
  const targetPath = userHasGmc ? '/mon-chantier' : '/tableau-de-bord';

  // 3. Même brand → redirect direct sur la même origin
  if (currentBrand === targetBrand) {
    window.location.href = targetPath;
    return;
  }

  // 4. Cross-domain → SSO handoff via magic link Supabase
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

  // 5. Fallback : redirect hard cross-domain (l'utilisateur devra se reconnecter
  // sur l'origine cible si SSO indisponible). Mieux que de laisser bloqué.
  window.location.href = `${ORIGIN_BY_BRAND[targetBrand]}${targetPath}`;
}
