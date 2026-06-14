import { supabase } from "@/integrations/supabase/client";
import { computeGmcInfo, EMPTY_GMC_INFO, type GmcSubInfo } from "./gmc-status-compute";

// Lecture cote client du statut d'abonnement GMC (table gmc_subscriptions, separee
// de subscriptions VMD). Pour les surfaces serveur-authentifiees, preferer
// l'endpoint /api/gmc/status (autoritaire, pas de dependance a l'hydratation client).

export type { GmcSubInfo, GmcStatus, GmcPlan } from "./gmc-status-compute";

/** Statut + flags de facturation (compte offert = pas de client Stripe -> pas de portail). */
export type GmcSubInfoExt = GmcSubInfo & { isComp: boolean; hasStripeCustomer: boolean };

type GmcRow = {
  status: string | null;
  plan: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  signup_source: string | null;
};

/** Statut d'abonnement GMC de l'utilisateur. Jamais throw : renvoie EMPTY si absent/erreur. */
export async function getGmcStatus(userId: string): Promise<GmcSubInfoExt> {
  // Le client typé ne connaît pas encore gmc_subscriptions (types Supabase à régénérer) :
  // cast localisé du builder, puis typage explicite de la ligne.
  const db = supabase as unknown as { from: (table: string) => any };
  const { data, error } = await db
    .from("gmc_subscriptions")
    .select("status, plan, trial_ends_at, current_period_end, stripe_customer_id, signup_source")
    .eq("user_id", userId)
    .maybeSingle();

  const row = (data ?? null) as GmcRow | null;
  if (error || !row) return { ...EMPTY_GMC_INFO, isComp: false, hasStripeCustomer: false };
  return {
    ...computeGmcInfo(row, Date.now()),
    isComp: row.signup_source === "comp",
    hasStripeCustomer: !!row.stripe_customer_id,
  };
}
