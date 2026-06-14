import { supabase } from "@/integrations/supabase/client";

// Lecture cote client du statut d'abonnement GMC (table gmc_subscriptions, separee
// de subscriptions VMD). Pendant pour GMC de getPremiumStatus (subscription.ts).

export type GmcStatus = "inactive" | "trial" | "active" | "past_due" | "expired";
export type GmcPlan = "gmc_essentiel" | "gmc_multi";

export interface GmcSubInfo {
  /** A acces a GMC : essai en cours, payant actif, ou tolerance past_due. */
  hasAccess: boolean;
  status: GmcStatus;
  /** Essai 30 j en cours (non expire). */
  isTrial: boolean;
  /** Jours restants d'essai (null hors essai). */
  trialDaysLeft: number | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  plan: GmcPlan | null;
  /** Abonne payant (active, ou past_due en tolerance). */
  isPaid: boolean;
  /** Peut gerer plusieurs chantiers (offre Multi payante active). */
  isMulti: boolean;
}

const EMPTY: GmcSubInfo = {
  hasAccess: false, status: "inactive", isTrial: false, trialDaysLeft: null,
  trialEndsAt: null, currentPeriodEnd: null, plan: null, isPaid: false, isMulti: false,
};

/** Statut d'abonnement GMC de l'utilisateur. Jamais throw : renvoie EMPTY si absent/erreur. */
export async function getGmcStatus(userId: string): Promise<GmcSubInfo> {
  const { data, error } = await supabase
    .from("gmc_subscriptions")
    .select("status, plan, trial_ends_at, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return EMPTY;

  const status = data.status as GmcStatus;
  const now = new Date();

  let isTrial = false;
  let trialDaysLeft: number | null = null;
  if (status === "trial" && data.trial_ends_at) {
    const end = new Date(data.trial_ends_at);
    if (end > now) {
      isTrial = true;
      trialDaysLeft = Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
    }
  }

  // past_due : paiement en echec, on tolere l'acces le temps des relances Stripe.
  const isPaid = status === "active" || status === "past_due";
  const hasAccess = isPaid || isTrial;
  const plan = (data.plan as GmcPlan | null) ?? null;
  const isMulti = isPaid && plan === "gmc_multi";

  return {
    hasAccess, status, isTrial, trialDaysLeft,
    trialEndsAt: data.trial_ends_at ?? null,
    currentPeriodEnd: data.current_period_end ?? null,
    plan, isPaid, isMulti,
  };
}
