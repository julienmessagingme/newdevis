import type { SupabaseClient } from '@supabase/supabase-js';
import { jsonError, requireAuth, type AuthContext } from '@/lib/api/apiHelpers';
import { hasGmcAccess } from '@/lib/auth/gmcAccess';

/**
 * Habilitation au PLANNING AVANCÉ (sous-phases) — capacité premium GMC.
 *
 * SEAM minimal, prêt à brancher sur le futur paywall GMC. Habilités V1 :
 *   - admin (table user_roles, role='admin')
 *   - beta / allowlist GMC (hasGmcAccess — Julien + Johan aujourd'hui)
 * TODO (paywall GMC) : ajouter abonnés payants + essai actif quand le tier
 * d'abonnement GMC existera. NE MODIFIER QUE getAdvancedPlanningAccess — les
 * call sites (requireAdvancedPlanning, endpoint, hook) restent stables.
 *
 * Règle anti-bypass : on lit TOUJOURS la DB (jamais un claim du JWT).
 */
export interface AdvancedPlanningAccess {
  allowed: boolean;
  reason: 'admin' | 'beta' | 'subscribed' | 'trial' | 'denied';
}

export async function getAdvancedPlanningAccess(
  supabase: SupabaseClient,
  userId: string,
  email?: string | null,
): Promise<AdvancedPlanningAccess> {
  // 1. Admin
  const { data: role } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (role) return { allowed: true, reason: 'admin' };

  // 2. Beta / allowlist GMC (par email)
  let mail = email ?? null;
  if (!mail) {
    try {
      const { data } = await supabase.auth.admin.getUserById(userId);
      mail = data?.user?.email ?? null;
    } catch {
      /* getUserById indisponible → on retombe sur denied */
    }
  }
  if (hasGmcAccess(mail)) return { allowed: true, reason: 'beta' };

  // 3. TODO paywall GMC : tier abonnement (subscribed | trial_active) → allowed
  return { allowed: false, reason: 'denied' };
}

export async function canUseAdvancedPlanning(
  supabase: SupabaseClient,
  userId: string,
  email?: string | null,
): Promise<boolean> {
  return (await getAdvancedPlanningAccess(supabase, userId, email)).allowed;
}

/**
 * Garde serveur : authentifie + exige l'habilitation planning avancé.
 * Même pattern que requireAdmin (adminAuth.ts). À appliquer sur TOUTES les
 * écritures de sous-phases (étape 2). Retourne le contexte OU une Response 401/403.
 */
export async function requireAdvancedPlanning(request: Request): Promise<AuthContext | Response> {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const ok = await canUseAdvancedPlanning(ctx.supabase, ctx.user.id, ctx.user.email);
  if (!ok) return jsonError('Planning avancé réservé à l\'abonnement premium', 403);
  return ctx;
}
