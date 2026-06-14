// Mapping centralise des prix Stripe GMC (env-var driven, contrairement a VMD qui a
// le price ID en dur). Importe cote SERVEUR uniquement (routes /api/gmc/* + webhook).
//
// Env vars attendues (Vercel + .env local de test) :
//   STRIPE_PRICE_GMC_ESSENTIEL_MONTH   (12 EUR / mois)
//   STRIPE_PRICE_GMC_ESSENTIEL_YEAR    (120 EUR / an)
//   STRIPE_PRICE_GMC_MULTI_MONTH       (25 EUR / mois)
//   STRIPE_PRICE_GMC_MULTI_YEAR        (210 EUR / an)
//   STRIPE_COUPON_GMC_FIRST_MONTH      (coupon -50% duration:once)

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
  if (!priceId) return null;
  if (priceId === PRICES.essentiel.month || priceId === PRICES.essentiel.year) return 'gmc_essentiel';
  if (priceId === PRICES.multi.month || priceId === PRICES.multi.year) return 'gmc_multi';
  return null;
}

/** Convertit la cle de plan (UI) -> nom de plan stocke en base. */
export function gmcPlanDb(plan: GmcPlanKey): GmcPlanDb {
  return plan === 'multi' ? 'gmc_multi' : 'gmc_essentiel';
}
