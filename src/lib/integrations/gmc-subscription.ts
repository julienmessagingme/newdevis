import { supabase } from "@/integrations/supabase/client";
import { computeGmcInfo, EMPTY_GMC_INFO, type GmcSubInfo } from "./gmc-status-compute";

// Lecture cote client du statut d'abonnement GMC (table gmc_subscriptions, separee
// de subscriptions VMD). Pour les surfaces serveur-authentifiees, preferer
// l'endpoint /api/gmc/status (autoritaire, pas de dependance a l'hydratation client).

export type { GmcSubInfo, GmcStatus, GmcPlan } from "./gmc-status-compute";

/** Statut d'abonnement GMC de l'utilisateur. Jamais throw : renvoie EMPTY si absent/erreur. */
export async function getGmcStatus(userId: string): Promise<GmcSubInfo> {
  const { data, error } = await supabase
    .from("gmc_subscriptions")
    .select("status, plan, trial_ends_at, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return EMPTY_GMC_INFO;
  return computeGmcInfo(data, Date.now());
}
