export const prerender = false;

import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const stripeSecretKey = import.meta.env.STRIPE_SECRET_KEY;
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

const PRICE_ID = 'price_1T9rrRF67GfPqM0XxH5rRrDM';

export const POST: APIRoute = async ({ request }) => {
  if (!stripeSecretKey || !supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Configuration serveur manquante' }),
      { status: 500, headers: CORS },
    );
  }

  // Verify caller identity from JWT
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'Non authentifié' }),
      { status: 401, headers: CORS },
    );
  }

  const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey);
  const { data: { user: callerUser }, error: authError } = await supabaseAuth.auth.getUser(token);
  if (authError || !callerUser) {
    return new Response(
      JSON.stringify({ error: 'Token invalide' }),
      { status: 401, headers: CORS },
    );
  }

  // Use the authenticated user's ID and email — ignore body values
  const userId = callerUser.id;
  const userEmail = callerUser.email;
  if (!userEmail) {
    return new Response(
      JSON.stringify({ error: 'Email utilisateur manquant' }),
      { status: 400, headers: CORS },
    );
  }

  const stripe = new Stripe(stripeSecretKey);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Check if user already has a Stripe customer ID
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();

    let customerId = sub?.stripe_customer_id;

    if (!customerId) {
      // Create a new Stripe customer
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { supabase_user_id: userId },
      });
      customerId = customer.id;

      // Store the customer ID
      await supabase
        .from('subscriptions')
        .upsert(
          { user_id: userId, stripe_customer_id: customerId },
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
              user_id: userId,
              status: 'active',
              plan: 'pass_serenite',
              stripe_customer_id: customerId,
              stripe_subscription_id: activeSub.id,
              current_period_end: new Date(activeSub.current_period_end * 1000).toISOString(),
            },
            { onConflict: 'user_id' },
          );

        return new Response(
          JSON.stringify({ error: 'Vous avez déjà un abonnement Pass Sérénité actif.', already_subscribed: true }),
          { status: 409, headers: CORS },
        );
      }
    }

    // Determine origin for redirect URLs
    const origin = new URL(request.url).origin;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      success_url: `${origin}/pass-serenite?success=true`,
      cancel_url: `${origin}/pass-serenite?canceled=true`,
      metadata: { supabase_user_id: userId },
      subscription_data: {
        metadata: { supabase_user_id: userId },
      },
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: CORS },
    );
  } catch (e) {
    const errMsg = (e as Error).message;
    console.error('[create-checkout-session] Error:', errMsg);
    return new Response(
      JSON.stringify({ error: 'Erreur lors de la création de la session', details: errMsg }),
      { status: 500, headers: CORS },
    );
  }
};
