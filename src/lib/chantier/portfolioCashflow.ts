// Coeur PUR de la phase 4 du portefeuille : projection de tresorerie consolidee.
// Regroupe par mois les sorties attendues (echeanciers de tous les chantiers)
// -> "cash a prevoir" mois par mois.
//
// Aucun import Supabase/fetch/env. Les montants viennent deja du moteur
// d'echeancier (payment_events_v + amount_estimate calcule cote endpoint) :
// on ne recalcule aucun montant, on les ventile par mois.

export interface CashflowEvent {
  /** Date d'echeance (ISO). Les events sans date sont ignores. */
  dueDate: string | null;
  /** Montant effectif (amount ?? amount_estimate). <= 0 ignore. */
  amount: number;
  /** Deja paye (status = 'paid') vs a prevoir. */
  paid: boolean;
}

export interface CashflowMonth {
  /** Cle 'YYYY-MM'. */
  month: string;
  /** Libelle FR court, ex "juil. 2026". */
  label: string;
  /** Montant deja paye sur le mois. */
  paid: number;
  /** Montant restant a prevoir sur le mois. */
  pending: number;
  /** Mois anterieur au mois courant. */
  isPast: boolean;
}

export interface PortfolioCashflow {
  months: CashflowMonth[];
  totalPending: number;
  totalPaid: number;
  /** Plus gros montant mensuel (paid+pending) -> echelle des barres UI. */
  peak: number;
}

const MONTHS_FR = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

function monthKeyFromIso(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${y}-${m}`;
}

function labelFromKey(key: string): string {
  const [y, m] = key.split('-');
  const idx = parseInt(m, 10) - 1;
  return `${MONTHS_FR[idx] ?? m} ${y}`;
}

/**
 * Ventile les events par mois (sorties). Tri chronologique. Marque les mois
 * passes (anterieurs au mois de `nowMs`). Ignore les events sans date ou montant.
 */
export function bucketCashflowByMonth(
  events: CashflowEvent[],
  nowMs: number = Date.now(),
): PortfolioCashflow {
  const map = new Map<string, { paid: number; pending: number }>();
  let totalPending = 0;
  let totalPaid = 0;

  for (const e of events) {
    if (!e.dueDate || !(e.amount > 0)) continue;
    const key = monthKeyFromIso(e.dueDate);
    if (!key) continue;
    const bucket = map.get(key) ?? { paid: 0, pending: 0 };
    if (e.paid) { bucket.paid += e.amount; totalPaid += e.amount; }
    else { bucket.pending += e.amount; totalPending += e.amount; }
    map.set(key, bucket);
  }

  const now = new Date(nowMs);
  const currentKey = `${now.getUTCFullYear()}-${(now.getUTCMonth() + 1).toString().padStart(2, '0')}`;

  const months: CashflowMonth[] = [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([month, v]) => ({
      month,
      label: labelFromKey(month),
      paid: Math.round(v.paid),
      pending: Math.round(v.pending),
      isPast: month < currentKey,
    }));

  const peak = months.reduce((mx, m) => Math.max(mx, m.paid + m.pending), 0);

  return { months, totalPending: Math.round(totalPending), totalPaid: Math.round(totalPaid), peak };
}
