export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, requireAuth } from '@/lib/api/apiHelpers';
import { computeGmcInfo } from '@/lib/integrations/gmc-status-compute';
import { GMC_PAYMENTS_LIVE } from '@/lib/integrations/gmc-stripe-config';

// Source de verite serveur du statut d'abonnement GMC (lecture service-role,
// pas de dependance a l'hydratation du client navigateur). Consomme par le hub
// (gate 2e chantier), le tunnel, le bloc Abonnement, le bandeau d'essai.
export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  const { data } = await supabase
    .from('gmc_subscriptions')
    .select('status, plan, trial_started_at, trial_ends_at, current_period_end, stripe_customer_id, signup_source')
    .eq('user_id', user.id)
    .maybeSingle();

  // Historique des passages de statut (timeline "Mon abonnement").
  const { data: events } = await supabase
    .from('gmc_subscription_events')
    .select('event, detail, at')
    .eq('user_id', user.id)
    .order('at', { ascending: true });

  return jsonOk({
    ...computeGmcInfo(data, Date.now()),
    paymentsLive: GMC_PAYMENTS_LIVE,
    trialStartedAt: data?.trial_started_at ?? null,
    // Compte offert (signup_source='comp') = pas de client Stripe -> on masque le portail.
    isComp: data?.signup_source === 'comp',
    hasStripeCustomer: !!data?.stripe_customer_id,
    events: events ?? [],
  });
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
