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

/**
 * 🔴 2026-09-16 — LECTURES DÉPLACÉES DU CHARGEMENT DU MODULE VERS L'APPEL.
 *
 * Ces cinq valeurs étaient lues à l'import. Sous `tsx` (les tests standalone du
 * projet), `import.meta.env` vaut `undefined` : le simple IMPORT de ce module
 * plantait, et il suffisait qu'un module de la chaîne l'importe pour emporter
 * tout un fichier de tests. C'est ce qui cassait
 * `src/lib/auth/advancedPlanningAccess.test.ts` — les 10 tests que CLAUDE.md
 * désigne comme le filet d'anti-régression du gate « planning avancé ».
 * Personne ne l'a vu parce qu'aucune CI ne lançait ces tests.
 *
 * ⚠️ LE COMPORTEMENT EN PRODUCTION EST INCHANGÉ, ET C'EST LA CONDITION DU
 * CORRECTIF. Les accès restent des accès LITTÉRAUX à `import.meta.env.X` :
 * Vite les remplace par leur valeur au build exactement comme avant. Seul le
 * MOMENT de l'évaluation change — à l'appel plutôt qu'à l'import. Ne jamais
 * « simplifier » en indexant dynamiquement (`import.meta.env[cle]`) : Vite
 * n'inline que les accès littéraux, et la valeur deviendrait `undefined` en
 * production.
 *
 * 🟡 Le fond reste à corriger : ce module est « importé côté SERVEUR
 * uniquement » et lit des secrets via `import.meta.env`, ce que la règle du
 * 2026-09-08 interdit (« côté serveur, un secret se lit au RUNTIME via
 * `process.env` »). Le faire ici demande de vérifier les quatre routes qui en
 * dépendent et l'environnement de build Vercel — c'est une mesure à part
 * (`TODO.md`), pas un changement de fin de session sur le chemin de paiement.
 */
function prices(): Record<GmcPlanKey, Record<GmcInterval, string | undefined>> {
  return {
    essentiel: {
      month: import.meta.env.STRIPE_PRICE_GMC_ESSENTIEL_MONTH,
      year: import.meta.env.STRIPE_PRICE_GMC_ESSENTIEL_YEAR,
    },
    multi: {
      month: import.meta.env.STRIPE_PRICE_GMC_MULTI_MONTH,
      year: import.meta.env.STRIPE_PRICE_GMC_MULTI_YEAR,
    },
  };
}

/** ID du coupon Stripe -50% applique au 1er mois (duration: once). */
export function gmcFirstMonthCoupon(): string | undefined {
  return import.meta.env.STRIPE_COUPON_GMC_FIRST_MONTH as string | undefined;
}

/** Price ID Stripe pour un plan + une periodicite. null si l'env var manque. */
export function gmcPriceId(plan: GmcPlanKey, interval: GmcInterval): string | null {
  return prices()[plan]?.[interval] ?? null;
}

/** Nom de plan stocke en base a partir d'un price ID Stripe (robuste aux upgrades portail). */
export function gmcPlanFromPriceId(priceId?: string | null): GmcPlanDb | null {
  const p = prices();
  return planFromPriceId(priceId, {
    essentielMonth: p.essentiel.month,
    essentielYear: p.essentiel.year,
    multiMonth: p.multi.month,
    multiYear: p.multi.year,
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
export function gmcPaymentsLive(): boolean {
  return !!gmcPriceId('essentiel', 'month');
}
