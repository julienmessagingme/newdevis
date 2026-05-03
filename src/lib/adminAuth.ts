import { jsonError, requireAuth, type AuthContext } from '@/lib/apiHelpers';

/**
 * Authentifie + vérifie que l'utilisateur a le rôle admin.
 * Retourne le contexte auth OU une Response d'erreur (401/403).
 *
 * Réutilisable pour toutes les routes /api/admin/*.
 */
export async function requireAdmin(request: Request): Promise<AuthContext | Response> {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;

  const { data: roleData } = await ctx.supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', ctx.user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (!roleData) return jsonError('Accès refusé', 403);
  return ctx;
}
