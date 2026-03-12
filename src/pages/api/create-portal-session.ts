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

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: { user: callerUser }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !callerUser) {
    return new Response(
      JSON.stringify({ error: 'Token invalide' }),
      { status: 401, headers: CORS },
    );
  }

  const userId = callerUser.id;
  const stripe = new Stripe(stripeSecretKey);

  try {
    // Retrieve Stripe customer ID from subscriptions
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!sub?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ error: 'Aucun abonnement Stripe trouvé' }),
        { status: 404, headers: CORS },
      );
    }

    const origin = new URL(request.url).origin;

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/parametres`,
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: CORS },
    );
  } catch (e) {
    console.error('[create-portal-session] Error:', (e as Error).message);
    return new Response(
      JSON.stringify({ error: 'Erreur lors de la création du portail' }),
      { status: 500, headers: CORS },
    );
  }
};
