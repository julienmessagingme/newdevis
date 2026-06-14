// Mapping centralise des prix Stripe GMC (env-var driven, contrairement a VMD qui a
// le price ID en dur). Importe cote SERVEUR uniquement (routes /api/gmc/* + webhook).
//
// Env vars attendues (Vercel + .env local de test) :
//   STRIPE_PRICE_GMC_ESSENTIEL_MONTH   (12 EUR / mois)
//   STRIPE_PRICE_GMC_ESSENTIEL_YEAR    (120 EUR / an)
//   STRIPE_PRICE_GMC_MULTI_MONTH       (25 EUR / mois)
//   STRIPE_PRICE_GMC_MULTI_YEAR        (210 EUR / an)
//   STRIPE_COUPON_GMC_FIRST_MONTH      (coupon -50% duration:once)

import { planFromPriceId } from './stripe-webhook-helpers';

export type GmcPlanKey = 'essentiel' | 'multi';
export type GmcInterval = 'month' | 'year';
export type GmcPlanDb = 'gmc_essentiel' | 'gmc_multi';

const PRICES: Record<GmcPlanKey, Record<GmcInterval, string | undefined>> = {
  essentiel: {
    month: import.meta.env.STRIPE_PRICE_GMC_ESSENTIEL_MONTH,
    year: import.meta.env.STRIPE_PRICE_GMC_ESSENTIEL_YEAR,
  },
  multi: {
    month: import.meta.env.STRIPE_PRICE_GMC_MULTI_MONTH,
    year: import.meta.env.STRIPE_PRICE_GMC_MULTI_YEAR,
  },
};

/** ID du coupon Stripe -50% applique au 1er mois (duration: once). */
export const GMC_FIRST_MONTH_COUPON = import.meta.env.STRIPE_COUPON_GMC_FIRST_MONTH as string | undefined;

/** Price ID Stripe pour un plan + une periodicite. null si l'env var manque. */
export function gmcPriceId(plan: GmcPlanKey, interval: GmcInterval): string | null {
  return PRICES[plan]?.[interval] ?? null;
}

/** Nom de plan stocke en base a partir d'un price ID Stripe (robuste aux upgrades portail). */
export function gmcPlanFromPriceId(priceId?: string | null): GmcPlanDb | null {
  return planFromPriceId(priceId, {
    essentielMonth: PRICES.essentiel.month,
    essentielYear: PRICES.essentiel.year,
    multiMonth: PRICES.multi.month,
    multiYear: PRICES.multi.year,
  });
}

/** Convertit la cle de plan (UI) -> nom de plan stocke en base. */
export function gmcPlanDb(plan: GmcPlanKey): GmcPlanDb {
  return plan === 'multi' ? 'gmc_multi' : 'gmc_essentiel';
}

/** Vrai si les prix Stripe GMC sont configures sur cet environnement (= paiements
 *  reellement payables). Sert a n'activer le gate multi-chantier QUE quand
 *  l'abonnement existe : sinon on bloquerait des essais sans moyen de payer.
 *  S'active tout seul au go-live quand les price env vars sont posees sur Vercel. */
export const GMC_PAYMENTS_LIVE = !!gmcPriceId('essentiel', 'month');
