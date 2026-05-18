/**
 * Helper post-login : décide où rediriger un user après authentification réussie.
 *
 * Règle : **le domaine de connexion fait foi**.
 * - Connexion sur gerermonchantier.fr → cockpit chantier (`/mon-chantier`).
 * - Connexion sur verifiermondevis.fr → tableau de bord VMD (`/tableau-de-bord`).
 *
 * On ne fait PLUS de SSO handoff cross-brand automatique au login : un user qui
 * se connecte sur vmd.fr atterrit sur le dashboard VMD même s'il a accès GMC —
 * il bascule ensuite vers GMC via le bouton "Mon Chantier" (qui, lui, fait le
 * handoff). Inversement pour gmc.fr. Cela respecte l'intention de l'utilisateur
 * (il a choisi le domaine sur lequel se connecter) et évite les boucles auth.
 *
 * Un `?redirect=…` explicite (path relatif) reste prioritaire — cas d'un user
 * non-logué renvoyé vers la page de login depuis une route protégée.
 *
 * Utilisé depuis :
 * - `Login.tsx` (form submit success)
 * - `auth/callback.astro` (script inline, après OAuth Google success)
 */
import type { Brand } from '@/lib/auth/brand';

export interface PostLoginRedirectArgs {
  /** Brand de la page de connexion sur laquelle l'user vient de se logger. */
  currentBrand: Brand;
  /** Email réel du user (conservé pour compat appelants — non utilisé). */
  userEmail?: string;
  /** Access token du user (conservé pour compat appelants — non utilisé). */
  accessToken?: string;
  /** Redirect explicite passé en query string `?redirect=…`. */
  explicitRedirect: string | null;
}

/**
 * Effectue le redirect post-login. Modifie `window.location.href`.
 * Doit être appelé après que la session Supabase est posée en localStorage.
 */
export async function performPostLoginRedirect(args: PostLoginRedirectArgs): Promise<void> {
  const { currentBrand, explicitRedirect } = args;

  // 1. Redirect explicite respecté (path relatif uniquement, anti open-redirect).
  if (
    explicitRedirect &&
    explicitRedirect.startsWith('/') &&
    !explicitRedirect.startsWith('//')
  ) {
    window.location.href = explicitRedirect;
    return;
  }

  // 2. Le domaine de connexion fait foi : on reste sur le brand courant.
  window.location.href = currentBrand === 'gmc' ? '/mon-chantier' : '/tableau-de-bord';
}
