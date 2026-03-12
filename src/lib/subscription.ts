import { supabase } from "@/integrations/supabase/client";

export type SubscriptionStatus = "active" | "inactive" | "trial";

export interface SubscriptionInfo {
  isPremium: boolean;
  status: SubscriptionStatus;
  trialDaysLeft: number | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  lifetimeAnalysisCount: number;
}

/** Vérifie si l'utilisateur courant a un accès premium actif */
export async function getPremiumStatus(userId: string): Promise<SubscriptionInfo> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("status, trial_ends_at, current_period_end, lifetime_analysis_count")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return { isPremium: false, status: "inactive", trialDaysLeft: null, trialEndsAt: null, currentPeriodEnd: null, lifetimeAnalysisCount: 0 };
  }

  const status = data.status as SubscriptionStatus;
  let isPremium = false;
  let trialDaysLeft: number | null = null;

  if (status === "active") {
    isPremium = true;
  } else if (status === "trial" && data.trial_ends_at) {
    const trialEnd = new Date(data.trial_ends_at);
    const now = new Date();
    if (trialEnd > now) {
      isPremium = true;
      trialDaysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }
  }

  return {
    isPremium,
    status,
    trialDaysLeft,
    trialEndsAt: data.trial_ends_at ?? null,
    currentPeriodEnd: data.current_period_end ?? null,
    lifetimeAnalysisCount: data.lifetime_analysis_count ?? 0,
  };
}

// startTrial and activatePremium removed — subscription activation
// must go through Stripe Checkout only (server-side via webhook).
