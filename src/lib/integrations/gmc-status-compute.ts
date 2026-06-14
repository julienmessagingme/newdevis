// Logique PURE de calcul du statut d'abonnement GMC.
// Aucun import : utilisable cote CLIENT (getGmcStatus) ET cote SERVEUR (/api/gmc/status),
// sans tirer le client navigateur (localStorage) dans le bundle serveur.

export type GmcStatus = "inactive" | "trial" | "active" | "past_due" | "expired";
export type GmcPlan = "gmc_essentiel" | "gmc_multi";

export interface GmcSubRow {
  status?: string | null;
  plan?: string | null;
  trial_ends_at?: string | null;
  current_period_end?: string | null;
}

export interface GmcSubInfo {
  /** A acces a GMC : essai en cours, payant actif, ou tolerance past_due. */
  hasAccess: boolean;
  status: GmcStatus;
  /** Essai 30 j en cours (non expire). */
  isTrial: boolean;
  /** Jours restants d'essai (null hors essai). */
  trialDaysLeft: number | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  plan: GmcPlan | null;
  /** Abonne payant (active, ou past_due en tolerance). */
  isPaid: boolean;
  /** Peut gerer plusieurs chantiers (offre Multi payante active). */
  isMulti: boolean;
}

export const EMPTY_GMC_INFO: GmcSubInfo = {
  hasAccess: false, status: "inactive", isTrial: false, trialDaysLeft: null,
  trialEndsAt: null, currentPeriodEnd: null, plan: null, isPaid: false, isMulti: false,
};

/** Derive le statut metier GMC depuis une ligne gmc_subscriptions. Jamais throw. */
export function computeGmcInfo(row: GmcSubRow | null | undefined, nowMs: number): GmcSubInfo {
  if (!row) return EMPTY_GMC_INFO;
  const status = (row.status ?? "inactive") as GmcStatus;

  let isTrial = false;
  let trialDaysLeft: number | null = null;
  if (status === "trial" && row.trial_ends_at) {
    const end = new Date(row.trial_ends_at).getTime();
    if (end > nowMs) {
      isTrial = true;
      trialDaysLeft = Math.ceil((end - nowMs) / 86_400_000);
    }
  }

  // past_due : paiement en echec, on tolere l'acces le temps des relances Stripe.
  const isPaid = status === "active" || status === "past_due";
  const plan = (row.plan as GmcPlan | null) ?? null;
  const isMulti = isPaid && plan === "gmc_multi";

  return {
    hasAccess: isPaid || isTrial,
    status, isTrial, trialDaysLeft,
    trialEndsAt: row.trial_ends_at ?? null,
    currentPeriodEnd: row.current_period_end ?? null,
    plan, isPaid, isMulti,
  };
}
