import { describe, it, expect } from 'vitest';
import type Stripe from 'stripe';
import { subPeriodEndISO, gmcStatusFromStripe, planFromPriceId, invoiceSubscriptionId } from './stripe-webhook-helpers';

const PRICES = {
  essentielMonth: 'price_ess_m',
  essentielYear: 'price_ess_y',
  multiMonth: 'price_multi_m',
  multiYear: 'price_multi_y',
};

describe('subPeriodEndISO', () => {
  it("lit current_period_end au niveau de l'abonnement", () => {
    const ts = 1_700_000_000; // secondes unix
    const sub = { current_period_end: ts } as unknown as Stripe.Subscription;
    expect(subPeriodEndISO(sub)).toBe(new Date(ts * 1000).toISOString());
  });

  it("retombe sur l'item quand le niveau abonnement est absent (API 2025+)", () => {
    const ts = 1_700_000_000;
    const sub = { items: { data: [{ current_period_end: ts }] } } as unknown as Stripe.Subscription;
    expect(subPeriodEndISO(sub)).toBe(new Date(ts * 1000).toISOString());
  });

  it('privilegie le niveau abonnement si les deux sont presents', () => {
    const top = 1_700_000_000;
    const item = 1_699_000_000;
    const sub = {
      current_period_end: top,
      items: { data: [{ current_period_end: item }] },
    } as unknown as Stripe.Subscription;
    expect(subPeriodEndISO(sub)).toBe(new Date(top * 1000).toISOString());
  });

  it("renvoie null (jamais Invalid Date) quand aucune source n'est presente — le bug d'activation", () => {
    expect(subPeriodEndISO({} as unknown as Stripe.Subscription)).toBeNull();
    expect(subPeriodEndISO({ items: { data: [] } } as unknown as Stripe.Subscription)).toBeNull();
    expect(subPeriodEndISO({ items: { data: [{}] } } as unknown as Stripe.Subscription)).toBeNull();
  });
});

describe('gmcStatusFromStripe', () => {
  it('active / trialing -> active', () => {
    expect(gmcStatusFromStripe('active')).toBe('active');
    expect(gmcStatusFromStripe('trialing')).toBe('active');
  });

  it('past_due -> past_due', () => {
    expect(gmcStatusFromStripe('past_due')).toBe('past_due');
  });

  it('canceled / unpaid / incomplete_expired / paused -> expired', () => {
    for (const s of ['canceled', 'unpaid', 'incomplete_expired', 'paused'] as Stripe.Subscription.Status[]) {
      expect(gmcStatusFromStripe(s)).toBe('expired');
    }
  });

  it('incomplete (et autres) -> inactive', () => {
    expect(gmcStatusFromStripe('incomplete')).toBe('inactive');
  });
});

describe('planFromPriceId', () => {
  it('mappe Essentiel mensuel et annuel', () => {
    expect(planFromPriceId('price_ess_m', PRICES)).toBe('gmc_essentiel');
    expect(planFromPriceId('price_ess_y', PRICES)).toBe('gmc_essentiel');
  });

  it('mappe Multi mensuel et annuel', () => {
    expect(planFromPriceId('price_multi_m', PRICES)).toBe('gmc_multi');
    expect(planFromPriceId('price_multi_y', PRICES)).toBe('gmc_multi');
  });

  it('renvoie null pour un price inconnu, null ou undefined', () => {
    expect(planFromPriceId('price_unknown', PRICES)).toBeNull();
    expect(planFromPriceId(null, PRICES)).toBeNull();
    expect(planFromPriceId(undefined, PRICES)).toBeNull();
  });

  it('ne matche pas quand le mapping est vide (price env absent)', () => {
    expect(planFromPriceId('price_ess_m', {})).toBeNull();
    expect(planFromPriceId(undefined, {})).toBeNull();
  });
});

describe('invoiceSubscriptionId', () => {
  const id = (o: unknown) => invoiceSubscriptionId(o as Stripe.Invoice);

  it('ancien emplacement : invoice.subscription string', () => {
    expect(id({ subscription: 'sub_123' })).toBe('sub_123');
  });

  it('ancien emplacement : invoice.subscription objet', () => {
    expect(id({ subscription: { id: 'sub_123' } })).toBe('sub_123');
  });

  it('nouvel emplacement (API 2025+) : parent.subscription_details.subscription', () => {
    expect(id({ parent: { subscription_details: { subscription: 'sub_456' } } })).toBe('sub_456');
  });

  it('repli sur les lignes : lines.data[0].parent.subscription_item_details.subscription', () => {
    expect(id({ lines: { data: [{ parent: { subscription_item_details: { subscription: 'sub_789' } } }] } })).toBe('sub_789');
  });

  it('privilegie l\'ancien emplacement si present', () => {
    expect(id({ subscription: 'sub_old', parent: { subscription_details: { subscription: 'sub_new' } } })).toBe('sub_old');
  });

  it('renvoie null si aucun emplacement (facture hors abonnement)', () => {
    expect(id({})).toBeNull();
    expect(id({ subscription: null, lines: { data: [] } })).toBeNull();
  });
});
