/**
 * src/lib/integrations/resendKey.ts
 *
 * 2026-09-08 — LA CLÉ RESEND SE LIT AU RUNTIME, JAMAIS VIA `import.meta.env`.
 *
 * 🔴 Défaut trouvé en cherchant pourquoi un utilisateur n'avait pas reçu la
 * notification de sa revue expert : **Vite remplace `import.meta.env.X` par sa
 * valeur AU BUILD**. Pour une variable non préfixée `PUBLIC_`, absente de
 * l'environnement de build Vercel, cette valeur est `undefined` — et le
 * `if (RESEND_API_KEY)` qui suit devient toujours faux. Le bundler supprime
 * alors tout le bloc : **le code d'envoi n'existe même plus dans la fonction
 * déployée**.
 *
 * Vérifié sur le build du 08/09, en cherchant « api.resend.com » dans les
 * fonctions servies :
 *   · `desinscription`, `gmc-feedback`, `stripe-webhook` → **0 occurrence**,
 *     tout le code d'envoi avait disparu ;
 *   · `decide` et `conclusion`, qui lisent `process.env`, → présent.
 *
 * `process.env` est une lecture à l'exécution : elle survit au bundling et voit
 * les variables réellement configurées sur Vercel. C'est la seule forme à
 * utiliser côté serveur.
 *
 * ⚠️ Ne jamais « simplifier » en revenant à `import.meta.env` : le code
 * continuera de compiler, les tests passeront, et les emails cesseront
 * silencieusement de partir.
 */

/** La clé Resend du compte VMD, ou celle par défaut. `null` si aucune. */
export function resendApiKey(): string | null {
  const brut =
    process.env.RESEND_API_KEY_VMD ||
    process.env.RESEND_API_KEY ||
    "";
  const cle = brut.trim();
  return cle.length > 0 ? cle : null;
}

/**
 * Pourquoi aucune clé n'est disponible — pour un message d'erreur qui nomme le
 * remède plutôt que de dire « échec ».
 */
export function diagnosticCleResend(): string {
  const vmd = (process.env.RESEND_API_KEY_VMD ?? "").trim();
  const std = (process.env.RESEND_API_KEY ?? "").trim();
  if (vmd || std) return "clé présente";
  return "aucune clé Resend dans l'environnement Vercel (RESEND_API_KEY_VMD ni RESEND_API_KEY)";
}
