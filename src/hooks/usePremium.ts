import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPremiumStatus, type SubscriptionInfo } from "@/lib/subscription";

interface UsePremiumReturn extends SubscriptionInfo {
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function usePremium(): UsePremiumReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [info, setInfo] = useState<SubscriptionInfo>({
    isPremium: false,
    status: "inactive",
    trialDaysLeft: null,
    trialEndsAt: null,
    currentPeriodEnd: null,
    lifetimeAnalysisCount: 0,
  });

  const fetch = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsLoading(false);
      return;
    }
    const result = await getPremiumStatus(user.id);
    setInfo(result);
    setIsLoading(false);
  };

  useEffect(() => {
    fetch();
  }, []);

  return { ...info, isLoading, refresh: fetch };
}
