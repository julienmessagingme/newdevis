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

  const COLS = 'status, plan, trial_started_at, trial_ends_at, current_period_end, stripe_customer_id, signup_source';
  let { data } = await supabase
    .from('gmc_subscriptions')
    .select(COLS)
    .eq('user_id', user.id)
    .maybeSingle();

  // Pont VMD -> GMC : un utilisateur qui entre dans l'app GMC SANS ligne d'abonnement
  // (typiquement un compte VerifierMonDevis existant) obtient son essai gratuit ici,
  // de façon idempotente. C'est le seul point UNIVERSEL : toutes les surfaces GMC
  // (hub, cockpit, tunnel /mon-chantier/nouveau, bandeau essai, page abonnement)
  // appellent ce endpoint, quel que soit le mode de connexion (OAuth/email/SSO). Les
  // chemins de signup (trigger + gmc-ensure-trial) ne couvrent QUE les nouveaux comptes,
  // d'où le trou pour les utilisateurs VMD existants qui passent côté GMC.
  // L'INSERT déclenche le welcome GMC + l'entrée dans la séquence (dont l'offre -50%).
  // ignoreDuplicates : une ligne déjà existante (même un essai EXPIRÉ) n'est jamais
  // régénérée -> pas d'abus (on ne re-grante pas un essai à qui l'a déjà consommé).
  if (!data) {
    const now = Date.now();
    await supabase.from('gmc_subscriptions').upsert(
      {
        user_id: user.id,
        status: 'trial',
        plan: 'gmc_essentiel',
        trial_started_at: new Date(now).toISOString(),
        trial_ends_at: new Date(now + 30 * 86_400_000).toISOString(),
        signup_source: 'verifiermondevis',
      },
      { onConflict: 'user_id', ignoreDuplicates: true },
    );
    const reread = await supabase
      .from('gmc_subscriptions')
      .select(COLS)
      .eq('user_id', user.id)
      .maybeSingle();
    data = reread.data;
  }

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
