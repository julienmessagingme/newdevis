export const prerender = false;

import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripeSecretKey = import.meta.env.STRIPE_SECRET_KEY;
const webhookSecret = import.meta.env.STRIPE_WEBHOOK_SECRET;
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

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

        // Fetch subscription to get period_end
        let periodEnd: string | null = null;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          periodEnd = new Date(sub.current_period_end * 1000).toISOString();
        }

        await supabase
          .from('subscriptions')
          .upsert(
            {
              user_id: userId,
              status: 'active',
              plan: 'pass_serenite',
              stripe_customer_id: typeof session.customer === 'string' ? session.customer : (session.customer as Stripe.Customer)?.id,
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

        const status = subscription.status === 'active' ? 'active'
          : subscription.status === 'past_due' ? 'past_due'
          : 'inactive';

        await supabase
          .from('subscriptions')
          .update({
            status,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          })
          .eq('user_id', userId);

        console.log('[stripe-webhook] Subscription updated for user:', userId, 'status:', status);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.supabase_user_id;
        if (!userId) break;

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
          await supabase
            .from('subscriptions')
            .update({ status: 'past_due' })
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
