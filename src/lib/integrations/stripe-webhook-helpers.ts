// Helpers PURS du webhook Stripe : aucune lecture d'env, aucun I/O -> testables en isolation.
// Extraits de stripe-webhook.ts car ce sont les points sensibles (fin de periode, mapping
// de statut, routage du plan par price ID) ; un bug ici casse l'activation GMC + la
// facturation VMD. Couverts par stripe-webhook-helpers.test.ts.

import type Stripe from 'stripe';
import type { GmcPlanDb } from './gmc-stripe-config';

// current_period_end a migre de l'abonnement vers l'item dans les versions recentes de
// l'API Stripe (2025+). On lit les deux pour rester robuste selon la version du compte.
// Renvoie null (jamais une Invalid Date) si aucune source n'est presente : c'est ce qui
// avait casse l'activation (new Date(undefined) -> "Invalid time value" -> webhook 500).
export function subPeriodEndISO(sub: Stripe.Subscription): string | null {
  const s = sub as unknown as {
    current_period_end?: number;
    items?: { data?: Array<{ current_period_end?: number }> };
  };
  const ts = s.current_period_end ?? s.items?.data?.[0]?.current_period_end;
  return typeof ts === 'number' ? new Date(ts * 1000).toISOString() : null;
}

// Mappe le statut d'un abonnement Stripe -> statut stocke dans gmc_subscriptions.
export function gmcStatusFromStripe(
  s: Stripe.Subscription.Status,
): 'active' | 'past_due' | 'expired' | 'inactive' {
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

// L'ID d'abonnement d'une facture a change d'emplacement selon la version d'API Stripe.
// Ancien : invoice.subscription (string|objet). Recent (2025+) : invoice.subscription a ete
// retire -> on lit invoice.parent.subscription_details.subscription, puis les lignes. On lit
// TOUS les emplacements connus pour rester robuste quelle que soit la version du compte
// (sinon la branche invoice.payment_failed ne trouve plus l'abonnement -> past_due/dunning KO).
export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const inv = invoice as unknown as {
    subscription?: string | { id?: string } | null;
    parent?: { subscription_details?: { subscription?: string | { id?: string } | null } | null } | null;
    lines?: { data?: Array<{
      subscription?: string | { id?: string } | null;
      parent?: { subscription_item_details?: { subscription?: string | { id?: string } | null } | null } | null;
    }> } | null;
  };
  const pick = (v: string | { id?: string } | null | undefined): string | null =>
    typeof v === 'string' ? v : (v?.id ?? null);
  return (
    pick(inv.subscription) ??
    pick(inv.parent?.subscription_details?.subscription) ??
    pick(inv.lines?.data?.[0]?.parent?.subscription_item_details?.subscription) ??
    pick(inv.lines?.data?.[0]?.subscription) ??
    null
  );
}

export interface GmcPriceMap {
  essentielMonth?: string | null;
  essentielYear?: string | null;
  multiMonth?: string | null;
  multiYear?: string | null;
}

// Coeur PUR du routage de plan : compare un price ID au mapping fourni. La variante liee a
// l'env (gmcPlanFromPriceId dans gmc-stripe-config) delegue ici avec les prix de l'env.
export function planFromPriceId(
  priceId: string | null | undefined,
  prices: GmcPriceMap,
): GmcPlanDb | null {
  if (!priceId) return null;
  if (priceId === prices.essentielMonth || priceId === prices.essentielYear) return 'gmc_essentiel';
  if (priceId === prices.multiMonth || priceId === prices.multiYear) return 'gmc_multi';
  return null;
}
