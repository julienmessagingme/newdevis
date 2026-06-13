/**
 * Helper client-side pour naviguer depuis VMD vers GMC avec SSO handoff
 * automatique pour les utilisateurs allowlistés.
 *
 * À utiliser sur tous les liens et boutons dans le contexte VMD qui pointent
 * vers le module chantier (/mon-chantier, /mon-chantier/[id], etc.) — ce
 * helper s'assure que l'utilisateur arrive sur l'origine `gerermonchantier.fr`
 * et pas sur `verifiermondevis.fr/mon-chantier/...`.
 *
 * Logique :
 * - Pas connecté → navigation vers `https://www.gerermonchantier.fr/` (landing GMC).
 * - Connecté NON-allowlisté → idem (landing pour découverte / futur upsell Stripe).
 * - Connecté allowlisté → SSO handoff via `/api/sso/handoff` qui retourne
 *   une URL Supabase magic-link. Le navigateur navigue dessus → atterit sur
 *   `gerermonchantier.fr/auth/callback?next=<targetPath>` avec session active.
 * - Si le SSO échoue (réseau, rate limit, token expiré…) → fallback hard
 *   redirect cross-domain qui forcera l'utilisateur à se reconnecter sur gmc.fr.
 *
 * Usage typique :
 * ```tsx
 * <a href="https://www.gerermonchantier.fr/" onClick={(e) => {
 *   e.preventDefault();
 *   navigateToGmc('/mon-chantier/' + chantierId);
 * }}>Voir mon chantier</a>
 * ```
 */
import { hasGmcAccess } from '@/lib/auth/gmcAccess';

const GMC_LANDING = 'https://www.gerermonchantier.fr/';

export async function navigateToGmc(targetPath: string): Promise<void> {
  // Sécurité : `targetPath` doit être un path absolu sur gmc.fr (pas une URL externe).
  const safePath =
    typeof targetPath === 'string' && targetPath.startsWith('/') && !targetPath.startsWith('//')
      ? targetPath
      : '/mon-chantier';

  // 1. Lire la session depuis localStorage (Supabase y stocke les tokens)
  let accessToken: string | undefined;
  let userEmail: string | undefined;
  try {
    const authKey = Object.keys(localStorage).find((k) => k.includes('auth-token'));
    if (authKey) {
      const authData = JSON.parse(localStorage.getItem(authKey) || '{}');
      accessToken = authData?.access_token;
      userEmail = authData?.user?.email;
    }
  } catch {
    // localStorage indisponible (mode privé strict) — on continue en non-logué
  }

  // 2. Non connecté ou non-allowlisté → landing GMC (option a)
  if (!accessToken || !userEmail || !hasGmcAccess(userEmail)) {
    window.location.href = GMC_LANDING;
    return;
  }

  // 3. Allowlisté → SSO handoff
  try {
    const res = await fetch('/api/sso/handoff', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ targetBrand: 'gmc', targetPath: safePath }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json?.handoff_url) {
        window.location.href = json.handoff_url;
        return;
      }
    }
    console.error('[navigateToGmc] handoff failed:', res.status);
  } catch (e) {
    console.error('[navigateToGmc] handoff exception:', e);
  }

  // 4. Fallback : redirect hard cross-domain (forcera re-login sur gmc.fr si SSO HS)
  window.location.href = `https://www.gerermonchantier.fr${safePath}`;
}
