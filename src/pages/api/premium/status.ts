export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireAuth } from '@/lib/apiHelpers';

export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  const { data, error } = await supabase
    .from('subscriptions')
    .select('status, trial_ends_at, current_period_end')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    return jsonError(error.message, 500);
  }

  let isPremium = false;
  let trialDaysLeft: number | null = null;

  if (data?.status === 'active') {
    isPremium = true;
  } else if (data?.status === 'trial' && data.trial_ends_at) {
    const trialEnd = new Date(data.trial_ends_at);
    if (trialEnd > new Date()) {
      isPremium = true;
      trialDaysLeft = Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    }
  }

  return jsonOk({
    isPremium,
    status: data?.status ?? 'inactive',
    trialDaysLeft,
    trialEndsAt: data?.trial_ends_at ?? null,
    currentPeriodEnd: data?.current_period_end ?? null,
  });
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
