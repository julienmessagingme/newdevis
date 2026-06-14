export const prerender = false;

import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { gmcPlanFromPriceId } from '@/lib/integrations/gmc-stripe-config';

const stripeSecretKey = import.meta.env.STRIPE_SECRET_KEY;
const webhookSecret = import.meta.env.STRIPE_WEBHOOK_SECRET;
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

// Mappe le statut d'un abonnement Stripe -> statut stocke dans gmc_subscriptions.
function gmcStatusFromStripe(s: Stripe.Subscription.Status): 'active' | 'past_due' | 'expired' | 'inactive' {
  switch (s) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
    case 'paused':
      return 'expired';
    default:
      return 'inactive';
  }
}

export const POST: APIRoute = async ({ request }) => {
  if (!stripeSecretKey || !supabaseUrl || !supabaseServiceKey) {
    return new Response('Configuration serveur manquante', { status: 500 });
  }

  const stripe = new Stripe(stripeSecretKey);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Read raw body for signature verification
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');

  let event: Stripe.Event;

  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured — rejecting request');
    return new Response('Webhook secret not configured', { status: 500 });
  }

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', (err as Error).message);
    return new Response('Signature invalide', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        if (!userId) break;

        const subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : (session.subscription as Stripe.Subscription)?.id;

        // Recupere la fin de periode et le price (pour deduire le plan exact)
        let periodEnd: string | null = null;
        let priceId: string | null = null;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          periodEnd = new Date(sub.current_period_end * 1000).toISOString();
          priceId = sub.items.data[0]?.price?.id ?? null;
        }

        const customerId = typeof session.customer === 'string'
          ? session.customer
          : (session.customer as Stripe.Customer)?.id;

        // ── Branche GMC ────────────────────────────────────────────────
        if (session.metadata?.product === 'gmc') {
          const plan = gmcPlanFromPriceId(priceId) ?? session.metadata?.plan ?? null;
          await supabase
            .from('gmc_subscriptions')
            .upsert(
              {
                user_id: userId,
                status: 'active',
                plan,
                stripe_customer_id: customerId,
                stripe_subscription_id: subscriptionId || null,
                current_period_end: periodEnd,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'user_id' },
            );
          console.log('[stripe-webhook] GMC subscription activated for user:', userId, 'plan:', plan);
          break;
        }

        // ── Branche VMD (Pass Serenite) ────────────────────────────────
        await supabase
          .from('subscriptions')
          .upsert(
            {
              user_id: userId,
              status: 'active',
              plan: 'pass_serenite',
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId || null,
              current_period_end: periodEnd,
            },
            { onConflict: 'user_id' },
          );

        console.log('[stripe-webhook] Subscription activated for user:', userId);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.supabase_user_id;
        if (!userId) break;

        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        if (subscription.metadata?.product === 'gmc') {
          const plan = gmcPlanFromPriceId(subscription.items.data[0]?.price?.id);
          await supabase
            .from('gmc_subscriptions')
            .update({
              status: gmcStatusFromStripe(subscription.status),
              current_period_end: periodEnd,
              ...(plan ? { plan } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId);
          console.log('[stripe-webhook] GMC subscription updated for user:', userId, 'status:', subscription.status);
          break;
        }

        const status = subscription.status === 'active' ? 'active'
          : subscription.status === 'past_due' ? 'past_due'
          : 'inactive';

        await supabase
          .from('subscriptions')
          .update({
            status,
            current_period_end: periodEnd,
          })
          .eq('user_id', userId);

        console.log('[stripe-webhook] Subscription updated for user:', userId, 'status:', status);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.supabase_user_id;
        if (!userId) break;

        if (subscription.metadata?.product === 'gmc') {
          await supabase
            .from('gmc_subscriptions')
            .update({ status: 'expired', updated_at: new Date().toISOString() })
            .eq('user_id', userId);
          console.log('[stripe-webhook] GMC subscription canceled for user:', userId);
          break;
        }

        await supabase
          .from('subscriptions')
          .update({ status: 'inactive' })
          .eq('user_id', userId);

        console.log('[stripe-webhook] Subscription canceled for user:', userId);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = typeof invoice.subscription === 'string'
          ? invoice.subscription
          : (invoice.subscription as Stripe.Subscription)?.id;

        if (subId) {
          // Mises a jour scopees par stripe_subscription_id : seule la table qui
          // possede cet abonnement est touchee (VMD et GMC ne se chevauchent pas).
          await supabase
            .from('subscriptions')
            .update({ status: 'past_due' })
            .eq('stripe_subscription_id', subId);
          await supabase
            .from('gmc_subscriptions')
            .update({ status: 'past_due', updated_at: new Date().toISOString() })
            .eq('stripe_subscription_id', subId);
        }

        console.log('[stripe-webhook] Payment failed for subscription:', subId);
        break;
      }
    }
  } catch (e) {
    console.error('[stripe-webhook] Handler error:', (e as Error).message);
    return new Response('Erreur interne', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
