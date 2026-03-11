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

  let body: { userId?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Corps de requête invalide' }),
      { status: 400, headers: CORS },
    );
  }

  const { userId } = body;
  if (!userId) {
    return new Response(
      JSON.stringify({ error: 'userId requis' }),
      { status: 400, headers: CORS },
    );
  }

  const stripe = new Stripe(stripeSecretKey);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
