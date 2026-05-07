/**
 * Allowlist temporaire des utilisateurs ayant accès au module GérerMonChantier.
 *
 * Pour l'instant, GMC est en accès restreint (julien + Johan). Quand on ouvrira
 * GMC à des utilisateurs externes, on remplacera cette allowlist par une
 * lecture de table (par ex. `subscriptions.has_gmc_access` ou similaire).
 *
 * Source unique : importé par `Header.astro` (script inline) et par les pages
 * d'auth (`Login.tsx`, `auth/callback.astro`).
 */
export const GMC_ACCESS_EMAILS = [
  'julien@messagingme.fr',
  'bridey.johan@gmail.com',
] as const;

export function hasGmcAccess(email: string | null | undefined): boolean {
  if (!email) return false;
  return (GMC_ACCESS_EMAILS as readonly string[]).includes(email.toLowerCase());
}
