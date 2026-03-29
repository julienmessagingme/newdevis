export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireAuth } from '@/lib/apiHelpers';

export const POST: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  // Check if already subscribed
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing?.status === 'active') {
    return jsonOk({ success: true, alreadyActive: true });
  }

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);

  const { error } = await supabase
    .from('subscriptions')
    .upsert(
      {
        user_id: user.id,
        status: 'trial',
        plan: 'premium_monthly',
        trial_ends_at: trialEnd.toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (error) {
    return jsonError(error.message, 500);
  }

  return jsonOk({ success: true });
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
