export const prerender = false;

import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { optionsResponse, jsonOk, jsonError, requireAuth } from '@/lib/apiHelpers';

const stripeSecretKey = import.meta.env.STRIPE_SECRET_KEY;

const PRICE_ID = 'price_1T9rrRF67GfPqM0XxH5rRrDM';

export const POST: APIRoute = async ({ request }) => {
  if (!stripeSecretKey) {
    return jsonError('Configuration serveur manquante', 500);
  }

  // Verify caller identity from JWT
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  const userEmail = user.email;
  if (!userEmail) {
    return jsonError('Email utilisateur manquant', 400);
  }

  const stripe = new Stripe(stripeSecretKey);

  try {
    // Check if user already has a Stripe customer ID
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let customerId = sub?.stripe_customer_id;

    if (!customerId) {
      // Create a new Stripe customer
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      // Store the customer ID
      await supabase
        .from('subscriptions')
        .upsert(
          { user_id: user.id, stripe_customer_id: customerId },
          { onConflict: 'user_id' },
        );
    } else {
      // Check if customer already has an active subscription on Stripe
      const existingSubs = await stripe.subscriptions.list({
        customer: customerId,
        status: 'active',
        price: PRICE_ID,
        limit: 1,
      });

      if (existingSubs.data.length > 0) {
        // Already subscribed — update Supabase status in case webhook missed it
        const activeSub = existingSubs.data[0];
        await supabase
          .from('subscriptions')
          .upsert(
            {
              user_id: user.id,
              status: 'active',
              plan: 'pass_serenite',
              stripe_customer_id: customerId,
              stripe_subscription_id: activeSub.id,
              current_period_end: new Date(activeSub.current_period_end * 1000).toISOString(),
            },
            { onConflict: 'user_id' },
          );

        return jsonError('Vous avez déjà un abonnement Pass Sérénité actif.', 409);
      }
    }

    // Determine origin for redirect URLs
    const origin = new URL(request.url).origin;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${origin}/pass-serenite?success=true`,
      cancel_url: `${origin}/pass-serenite?canceled=true`,
      metadata: { supabase_user_id: user.id },
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
    });

    return jsonOk({ url: session.url });
  } catch (e) {
    const errMsg = (e as Error).message;
    console.error('[create-checkout-session] Error:', errMsg);
    return jsonError('Erreur lors de la création de la session', 500);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
