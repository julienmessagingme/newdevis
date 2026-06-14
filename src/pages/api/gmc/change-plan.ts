export const prerender = false;

import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { optionsResponse, jsonOk, jsonError, requireAuth } from '@/lib/api/apiHelpers';
import { gmcPriceId } from '@/lib/integrations/gmc-stripe-config';

const stripeSecretKey = import.meta.env.STRIPE_SECRET_KEY;
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

// Changement de plan EN PLACE (upgrade Essentiel -> Multi) pour un abonne payant.
// On modifie l'item d'abonnement Stripe (subscriptions.update) plutot que de passer par
// le portail (qui exigerait une config compte cote Stripe). Proration standard, reportee
// sur la prochaine facture. La periodicite (mensuel/annuel) est conservee.
//
// Le webhook customer.subscription.updated (metadata.product='gmc' deja posee au checkout)
// repercute le nouveau plan en base de facon idempotente ; on l'ecrit aussi ici pour que
// l'UI reflete l'upgrade immediatement, sans attendre le webhook.
export const POST: APIRoute = async ({ request }) => {
  if (!stripeSecretKey || !supabaseUrl || !supabaseServiceKey) {
    return jsonError('Configuration serveur manquante', 500);
  }

  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user } = ctx;

  let body: { plan?: string } = {};
  try { body = await request.json(); } catch { /* defaults */ }
  // V1 : seul l'upgrade vers Multi est expose (la descente se fait via le portail).
  if (body.plan && body.plan !== 'multi') {
    return jsonError('Changement de formule non supporte', 400);
  }

  // Ecritures gmc_subscriptions = service-role (RLS service_role only).
  const admin = createClient(supabaseUrl, supabaseServiceKey);
  const { data: sub } = await admin
    .from('gmc_subscriptions')
    .select('stripe_subscription_id, status, plan')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!sub?.stripe_subscription_id) {
    return jsonError("Aucun abonnement a modifier. Choisissez une formule pour vous abonner.", 400);
  }
  if (sub.status !== 'active') {
    return jsonError('Votre abonnement doit etre actif pour changer de formule.', 409);
  }
  if (sub.plan === 'gmc_multi') {
    return jsonOk({ already: true, plan: 'gmc_multi' });
  }

  const stripe = new Stripe(stripeSecretKey);
  try {
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    const item = stripeSub.items.data[0];
    if (!item) return jsonError('Abonnement Stripe introuvable', 404);

    // Conserve la periodicite courante (mensuel/annuel).
    const interval = item.price?.recurring?.interval === 'year' ? 'year' : 'month';
    const targetPrice = gmcPriceId('multi', interval);
    if (!targetPrice) return jsonError('Tarif Multi indisponible (configuration Stripe)', 500);
    if (item.price?.id === targetPrice) return jsonOk({ already: true, plan: 'gmc_multi' });

    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      items: [{ id: item.id, price: targetPrice }],
      proration_behavior: 'create_prorations',
    });

    // UI immediate (le webhook repassera, idempotent).
    await admin
      .from('gmc_subscriptions')
      .update({ plan: 'gmc_multi', updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    await admin
      .from('gmc_subscription_events')
      .insert({ user_id: user.id, event: 'plan_changed', detail: 'Multi-chantiers' });

    return jsonOk({ ok: true, plan: 'gmc_multi' });
  } catch (e) {
    console.error('[gmc/change-plan] Error:', (e as Error).message);
    return jsonError('Erreur lors du changement de formule', 500);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('POST,OPTIONS');
