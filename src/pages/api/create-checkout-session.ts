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

  let body: { userId?: string; userEmail?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Corps de requête invalide' }),
      { status: 400, headers: CORS },
    );
  }

  const { userId, userEmail } = body;
  if (!userId || !userEmail) {
    return new Response(
      JSON.stringify({ error: 'userId et userEmail requis' }),
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
