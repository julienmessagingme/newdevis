export const prerender = false;

import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { optionsResponse, jsonOk, jsonError, requireAuth } from '@/lib/api/apiHelpers';
import {
  gmcPriceId, gmcPlanDb, GMC_FIRST_MONTH_COUPON,
  type GmcPlanKey, type GmcInterval,
} from '@/lib/integrations/gmc-stripe-config';

const stripeSecretKey = import.meta.env.STRIPE_SECRET_KEY;
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

export const POST: APIRoute = async ({ request }) => {
  if (!stripeSecretKey || !supabaseUrl || !supabaseServiceKey) {
    return jsonError('Configuration serveur manquante', 500);
  }

  // Identite de l'appelant via JWT
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user } = ctx;

  const userEmail = user.email;
  if (!userEmail) return jsonError('Email utilisateur manquant', 400);

  // Offre choisie (plan + periodicite + flag offre -50%)
  let body: { plan?: string; interval?: string; offer?: boolean } = {};
  try { body = await request.json(); } catch { /* defaults */ }

  const plan: GmcPlanKey = body.plan === 'multi' ? 'multi' : 'essentiel';
  const interval: GmcInterval = body.interval === 'year' ? 'year' : 'month';
  const priceId = gmcPriceId(plan, interval);
  if (!priceId) {
    return jsonError('Tarif indisponible (configuration Stripe incomplete)', 500);
  }

  // Coupon -50% 1er mois : UNIQUEMENT sur le mensuel. Sur l'annuel, duration:once
  // donnerait -50% sur l'annee entiere (hors offre). Ignore si l'env du coupon manque.
  const applyCoupon = body.offer === true && interval === 'month' && !!GMC_FIRST_MONTH_COUPON;

  const stripe = new Stripe(stripeSecretKey);
  // Client service-role dedie aux ecritures gmc_subscriptions (RLS = service_role only).
  const admin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Customer Stripe lie a gmc_subscriptions (reutilise la ligne d'essai existante)
    const { data: sub } = await admin
      .from('gmc_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let customerId = sub?.stripe_customer_id as string | undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { supabase_user_id: user.id, product: 'gmc' },
      });
      customerId = customer.id;
      await admin
        .from('gmc_subscriptions')
        .upsert(
          { user_id: user.id, stripe_customer_id: customerId, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        );
    } else {
      // Deja un abonnement actif ? on evite le doublon.
      const existing = await stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 1 });
      if (existing.data.length > 0) {
        return jsonError('Vous avez deja un abonnement GMC actif.', 409);
      }
    }

    const origin = new URL(request.url).origin;
    const planDb = gmcPlanDb(plan);
    const meta = { supabase_user_id: user.id, product: 'gmc', plan: planDb };

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      // discounts et allow_promotion_codes sont mutuellement exclusifs chez Stripe.
      ...(applyCoupon
        ? { discounts: [{ coupon: GMC_FIRST_MONTH_COUPON! }] }
        : { allow_promotion_codes: true }),
      success_url: `${origin}/mon-chantier?abonnement=success`,
      cancel_url: `${origin}/gmc-abonnement?canceled=true`,
      metadata: meta,
      subscription_data: { metadata: meta },
    });

    return jsonOk({ url: session.url });
  } catch (e) {
    console.error('[gmc/create-checkout-session] Error:', (e as Error).message);
    return jsonError('Erreur lors de la creation de la session', 500);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
