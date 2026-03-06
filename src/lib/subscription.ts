import { supabase } from "@/integrations/supabase/client";

export type SubscriptionStatus = "active" | "inactive" | "trial";

export interface SubscriptionInfo {
  isPremium: boolean;
  status: SubscriptionStatus;
  trialDaysLeft: number | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
}

/** Vérifie si l'utilisateur courant a un accès premium actif */
export async function getPremiumStatus(userId: string): Promise<SubscriptionInfo> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("status, trial_ends_at, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return { isPremium: false, status: "inactive", trialDaysLeft: null, trialEndsAt: null, currentPeriodEnd: null };
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
  };
}

/** Démarre un essai gratuit de 14 jours pour l'utilisateur */
export async function startTrial(userId: string): Promise<{ success: boolean; error?: string }> {
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);

  const { error } = await supabase
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        status: "trial",
        plan: "premium_monthly",
        trial_ends_at: trialEnd.toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Active manuellement un abonnement premium (pour tests / early adopters) */
export async function activatePremium(userId: string): Promise<{ success: boolean; error?: string }> {
  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const { error } = await supabase
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        status: "active",
        plan: "premium_monthly",
        current_period_end: periodEnd.toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) return { success: false, error: error.message };
  return { success: true };
}
