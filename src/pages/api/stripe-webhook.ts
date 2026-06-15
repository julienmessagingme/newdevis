export const prerender = false;

import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { gmcPlanFromPriceId } from '@/lib/integrations/gmc-stripe-config';
import { subPeriodEndISO, gmcStatusFromStripe, invoiceSubscriptionId } from '@/lib/integrations/stripe-webhook-helpers';
// Module de templates email PUR (aucun import Deno) -> importable cote Astro/Vercel comme cote edge function.
import { renderGmcEmail } from '../../../supabase/functions/_shared/gmc-emails';
import { captureError } from '@/lib/integrations/errorReporter';

const stripeSecretKey = import.meta.env.STRIPE_SECRET_KEY;
const webhookSecret = import.meta.env.STRIPE_WEBHOOK_SECRET;
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
const resendApiKey = import.meta.env.RESEND_API_KEY;

// Trace un passage de statut dans la timeline "Mon abonnement". Best-effort, jamais bloquant.
async function logGmcEvent(
  supabase: SupabaseClient,
  userId: string | null | undefined,
  event: string,
  detail: string | null,
): Promise<void> {
  if (!userId) return;
  try {
    await supabase.from('gmc_subscription_events').insert({ user_id: userId, event, detail });
  } catch { /* non bloquant */ }
}

// Envoi TEMPS REEL du paid_welcome juste apres le paiement (sinon il attend le cron quotidien <=24h).
// Best-effort + idempotent : reservation log-first sur gmc_email_log (contrainte unique user_id+template_id).
// Si le cron l'a deja envoye -> conflit -> skip. Si l'envoi Resend echoue -> rollback du log -> le cron reprendra.
// L'ancre des emails payants suivants (paid_onboard J+2, paid_checkin J+14) = le sent_at de cette ligne.
async function sendGmcPaidWelcome(supabase: SupabaseClient, userId: string): Promise<void> {
  if (!resendApiKey) return; // pas de cle Resend cote Vercel -> on laisse le cron s'en charger
  try {
    const { data: ins, error: insErr } = await supabase
      .from('gmc_email_log')
      .insert({ user_id: userId, template_id: 'gmc_paid_welcome' })
      .select('id')
      .maybeSingle();
    if (insErr || !ins) return; // conflit unique = deja envoye (cron ou run precedent)

    const { data: ud } = await supabase.auth.admin.getUserById(userId);
    const email = ud?.user?.email ?? '';
    if (!email) {
      await supabase.from('gmc_email_log').delete().eq('id', ins.id); // rollback
      return;
    }
    const um = (ud?.user?.user_metadata ?? {}) as Record<string, string>;
    const prenom = (um.first_name || (um.full_name || um.name || '').split(' ')[0] || '').trim();
    const { data: ch } = await supabase
      .from('chantiers').select('nom').eq('user_id', userId)
      .order('created_at', { ascending: true }).limit(1).maybeSingle();

    const { subject, html } = renderGmcEmail('gmc_paid_welcome', {
      prenom,
      nom_chantier: (ch?.nom as string) ?? '',
      lien_cta: 'https://www.gerermonchantier.fr/mon-chantier',
    });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'GererMonChantier <bonjour@gerermonchantier.fr>',
        to: [email],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      await supabase.from('gmc_email_log').delete().eq('id', ins.id); // echec -> retentera au cron
      console.error('[stripe-webhook] paid_welcome Resend', res.status, await res.text());
    }
  } catch (e) {
    console.error('[stripe-webhook] sendGmcPaidWelcome:', (e as Error).message);
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
          periodEnd = subPeriodEndISO(sub);
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
          await logGmcEvent(supabase, userId, 'subscribed', plan === 'gmc_multi' ? 'Multi-chantiers' : 'Essentiel');
          // Email de bienvenue payant en TEMPS REEL (idempotent vs le cron quotidien).
          await sendGmcPaidWelcome(supabase, userId);
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

        const periodEnd = subPeriodEndISO(subscription);

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
          await logGmcEvent(supabase, userId, 'canceled', null);
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
        const subId = invoiceSubscriptionId(invoice);

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
          const { data: gmcRow } = await supabase
            .from('gmc_subscriptions')
            .select('user_id')
            .eq('stripe_subscription_id', subId)
            .maybeSingle();
          await logGmcEvent(supabase, gmcRow?.user_id as string | undefined, 'payment_failed', null);
        }

        console.log('[stripe-webhook] Payment failed for subscription:', subId);
        break;
      }
    }
  } catch (e) {
    console.error('[stripe-webhook] Handler error:', (e as Error).message);
    await captureError('stripe-webhook', e, { eventType: event.type, eventId: event.id });
    return new Response('Erreur interne', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
