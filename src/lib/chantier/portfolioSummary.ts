// Coeur PUR de l'agregation portefeuille multi-chantier.
//
// Aucun import qui touche Supabase / fetch / env : ce fichier ne fait que
// TRANSFORMER des donnees deja recuperees (reponses des routes budget + planning
// existantes) en un resume leger par chantier + des totaux portefeuille.
// Garde-fou n1 du plan : on n'invente JAMAIS un chiffre, on agrege l'existant.
// 100% testable en isolation (Vitest).

// ── Formes brutes consommees (sous-ensemble des reponses des routes) ──────────

/** Sous-ensemble du `totaux` renvoye par GET /api/chantier/[id]/budget. */
export interface RawBudgetTotaux {
  paye?: number | null;
  acompte?: number | null;
  a_payer?: number | null;
  a_venir?: number | null;
}

export interface RawBudgetResponse {
  totaux?: RawBudgetTotaux | null;
}

/** Lot tel que renvoye par GET /api/chantier/[id]/planning (champs utiles ici). */
export interface RawPlanningLot {
  id?: string;
  statut?: string | null;
  date_fin?: string | null;
}

export interface RawPlanningResponse {
  dateDebutChantier?: string | null;
  dateFinSouhaitee?: string | null;
  lots?: RawPlanningLot[] | null;
}

/** Ligne chantier (query directe de la table `chantiers`). */
export interface RawChantierRow {
  id: string;
  nom: string;
  emoji: string;
  budget: number | null;
  phase: string;
}

// ── Sorties typees ───────────────────────────────────────────────────────────

export interface ChantierSummary {
  id: string;
  nom: string;
  emoji: string;
  phase: string;
  // Planning
  dateDebutChantier: string | null;
  dateFinSouhaitee: string | null;
  /** Livraison estimee = max(lots.date_fin). Null si aucune date connue. */
  estimatedEnd: string | null;
  /** En retard : voir buildChantierSummary pour la regle exacte. */
  isLate: boolean;
  lotsCount: number;
  lotsDone: number;
  // Budget (5 KPI, derives du moteur budget existant)
  budgetCible: number | null;
  /** Decaisse = paye + acompte. */
  decaisse: number;
  /** A regler = a_payer (reconcilie par le moteur budget). */
  aRegler: number;
  /** A venir = engagements signes pas encore factures. */
  aVenir: number;
  /** Flux certains = decaisse + a regler. */
  fluxCertains: number;
  /** true si les 2 sous-appels (budget ET planning) ont echoue pour ce chantier. */
  fetchError: boolean;
}

export interface PortfolioTotals {
  chantierCount: number;
  lateCount: number;
  budgetCibleTotal: number;
  decaisseTotal: number;
  aReglerTotal: number;
  aVenirTotal: number;
  fluxCertainsTotal: number;
}

// ── Constantes ───────────────────────────────────────────────────────────────

/** Statuts de lot consideres comme "termine" pour le compteur d'avancement.
 *  Aligne sur la logique d'avancement du cockpit (DashboardHome). 'ok' est le
 *  statut ARTISAN (StatutArtisan), pas un statut de lot : on ne le compte pas ici. */
const DONE_LOT_STATUSES = new Set(['termine', 'contrat_signe']);

// ── Helpers internes ─────────────────────────────────────────────────────────

function num(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Convertit une date ISO (date seule ou datetime) en epoch ms, NaN si invalide. */
function toMs(d: string | null | undefined): number {
  if (!d) return NaN;
  return new Date(d).getTime();
}

// ── Construction d'un resume chantier ────────────────────────────────────────

/**
 * Transforme une ligne chantier + ses reponses budget/planning en resume leger.
 *
 * `budget` ou `planning` a null = le sous-appel correspondant a echoue (cote
 * endpoint) : on degrade proprement (KPI a 0 / pas de date) sans planter.
 * Si LES DEUX sont null -> fetchError = true (le chantier est injoignable).
 *
 * Regle isLate :
 *  - objectif (dateFinSouhaitee) ET estimation connus  -> retard si estimation > objectif
 *  - sinon, estimation connue + lots non tous termines -> retard si estimation < maintenant
 *  - sinon -> pas de retard
 */
export function buildChantierSummary(
  chantier: RawChantierRow,
  budget: RawBudgetResponse | null,
  planning: RawPlanningResponse | null,
  nowMs: number = Date.now(),
): ChantierSummary {
  const fetchError = budget === null && planning === null;

  const lots = planning?.lots ?? [];
  const lotsCount = lots.length;
  const lotsDone = lots.filter(
    (l) => l.statut != null && DONE_LOT_STATUSES.has(l.statut),
  ).length;

  // Livraison estimee = max des date_fin de lots.
  let estimatedEnd: string | null = null;
  let maxMs = -Infinity;
  for (const l of lots) {
    const ms = toMs(l.date_fin);
    if (!Number.isNaN(ms) && ms > maxMs) {
      maxMs = ms;
      estimatedEnd = l.date_fin ?? null;
    }
  }

  const dateFinSouhaitee = planning?.dateFinSouhaitee ?? null;
  const objectifMs = toMs(dateFinSouhaitee);

  let isLate = false;
  if (estimatedEnd !== null) {
    if (!Number.isNaN(objectifMs)) {
      isLate = maxMs > objectifMs;
    } else if (lotsDone < lotsCount) {
      isLate = maxMs < nowMs;
    }
  }

  const totaux = budget?.totaux ?? null;
  const decaisse = num(totaux?.paye) + num(totaux?.acompte);
  const aRegler = num(totaux?.a_payer);
  const aVenir = num(totaux?.a_venir);

  return {
    id: chantier.id,
    nom: chantier.nom,
    emoji: chantier.emoji,
    phase: chantier.phase,
    dateDebutChantier: planning?.dateDebutChantier ?? null,
    dateFinSouhaitee,
    estimatedEnd,
    isLate,
    lotsCount,
    lotsDone,
    budgetCible: chantier.budget,
    decaisse,
    aRegler,
    aVenir,
    fluxCertains: decaisse + aRegler,
    fetchError,
  };
}

// ── Totaux portefeuille ──────────────────────────────────────────────────────

/**
 * Agrege les resumes en totaux portefeuille. Les chantiers en fetchError sont
 * exclus des agregats FINANCIERS (KPI a 0, non fiables) mais comptes dans
 * chantierCount et lateCount (ils restent des chantiers du portefeuille).
 */
export function buildPortfolioTotals(summaries: ChantierSummary[]): PortfolioTotals {
  const totals: PortfolioTotals = {
    chantierCount: summaries.length,
    lateCount: 0,
    budgetCibleTotal: 0,
    decaisseTotal: 0,
    aReglerTotal: 0,
    aVenirTotal: 0,
    fluxCertainsTotal: 0,
  };

  for (const s of summaries) {
    if (s.isLate) totals.lateCount += 1;
    if (s.fetchError) continue; // pas d'agregat financier sur un chantier injoignable
    totals.budgetCibleTotal += num(s.budgetCible);
    totals.decaisseTotal += s.decaisse;
    totals.aReglerTotal += s.aRegler;
    totals.aVenirTotal += s.aVenir;
    totals.fluxCertainsTotal += s.fluxCertains;
  }

  return totals;
}
