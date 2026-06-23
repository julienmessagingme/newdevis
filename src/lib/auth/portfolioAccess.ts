import { jsonError, requireAuth, type AuthContext } from '@/lib/api/apiHelpers';
import { getAdvancedPlanningAccess } from './advancedPlanningAccess';

/**
 * Habilitation au POSTE DE PILOTAGE PORTEFEUILLE (vue multi-chantier).
 *
 * Meme regle que le planning avance (offre Multi) : admin + allowlist GMC +
 * abonne Multi actif. Essentiel et essai gratuit ne sont PAS habilites (apercu
 * + accroche d'upsell cote UI). On lit TOUJOURS la DB (jamais un claim du JWT).
 *
 * Alias dedie volontaire : le portefeuille est conceptuellement distinct du
 * planning avance meme s'ils partagent le palier Multi aujourd'hui. Si les deux
 * divergent un jour, on change ici sans toucher la garde planning.
 */
export { getAdvancedPlanningAccess as getPortfolioAccess } from './advancedPlanningAccess';

/**
 * Garde serveur : authentifie + exige l'habilitation portefeuille (offre Multi).
 * Pour les futurs endpoints portefeuille en ecriture. L'endpoint /summary, qui a
 * besoin du contexte auth pour la requete DB, fait requireAuth + getPortfolioAccess
 * separement.
 */
export async function requirePortfolio(request: Request): Promise<AuthContext | Response> {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const access = await getAdvancedPlanningAccess(ctx.supabase, ctx.user.id, ctx.user.email);
  if (!access.allowed) {
    return jsonError('Poste de pilotage reserve a l\'offre Multi', 403);
  }
  return ctx;
}
