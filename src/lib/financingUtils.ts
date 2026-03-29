// ── Formatting helpers ────────────────────────────────────────────────────────

export const fmtEur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

export const fmtEurPrecis = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export function fmtDateFR(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function fmtDateShort(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short',
  });
}

export function daysUntil(iso: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(iso + 'T00:00:00');
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

// ── Simulateur d'aides travaux (style EFFY) ──────────────────────────────────

export const WORK_TYPES_EFFY = [
  { key: 'isolation_combles', label: 'Isolation combles',         emoji: '🏠', desc: 'Plafond, toiture, grenier' },
  { key: 'isolation_murs',    label: 'Isolation des murs',        emoji: '🧱', desc: 'Par l\'extérieur (bardage) ou l\'intérieur' },
  { key: 'pac',               label: 'Pompe à chaleur',           emoji: '🌀', desc: 'Remplace la chaudière, très économique' },
  { key: 'biomasse',          label: 'Bois / granulés',           emoji: '🪵', desc: 'Chaudière à granulés ou poêle à bois' },
  { key: 'ballon_thermo',     label: 'Chauffe-eau thermodynamique', emoji: '💧', desc: 'Eau chaude sanitaire économique' },
  { key: 'vmc',               label: 'Ventilation double flux',   emoji: '💨', desc: 'Renouvelle l\'air sans perdre la chaleur' },
  { key: 'fenetres',          label: 'Fenêtres',                  emoji: '🪟', desc: 'Double ou triple vitrage' },
  { key: 'autre',             label: 'Autres travaux',            emoji: '🔨', desc: 'Rénovation non éligible aux aides MPR' },
] as const;

export type EffyWorkType = typeof WORK_TYPES_EFFY[number]['key'];

// Plafonds revenus fiscaux 2025 (hors Île-de-France) par taille ménage
// [très_modeste, modeste, intermédiaire] — au-delà = supérieur
export const INCOME_THRESHOLDS_2025: Record<number, [number, number, number]> = {
  1: [17173, 21986, 30063],
  2: [25212, 32279, 44120],
  3: [30313, 38814, 53035],
  4: [35411, 45342, 61944],
  5: [40522, 51884, 70860],
};

export type MprBracket = 'tres_modestes' | 'modestes' | 'intermediaires' | 'superieurs';

export function detectBracket(householdSize: number, annualIncome: number): MprBracket {
  const n = Math.max(1, Math.min(householdSize, 5));
  const [tm, m, inter] = INCOME_THRESHOLDS_2025[n];
  if (annualIncome <= tm)    return 'tres_modestes';
  if (annualIncome <= m)     return 'modestes';
  if (annualIncome <= inter) return 'intermediaires';
  return 'superieurs';
}

// Taux MPR 2025 par type × tranche (barème ANAH — gestes individuels)
export const MPR_RATES: Record<EffyWorkType, Record<MprBracket, number>> = {
  isolation_combles: { tres_modestes: 0.75, modestes: 0.60, intermediaires: 0.40, superieurs: 0.15 },
  isolation_murs:    { tres_modestes: 0.75, modestes: 0.60, intermediaires: 0.40, superieurs: 0.15 },
  pac:               { tres_modestes: 0.80, modestes: 0.65, intermediaires: 0.45, superieurs: 0.20 },
  biomasse:          { tres_modestes: 0.80, modestes: 0.65, intermediaires: 0.45, superieurs: 0.20 },
  ballon_thermo:     { tres_modestes: 0.40, modestes: 0.30, intermediaires: 0.20, superieurs: 0    },
  vmc:               { tres_modestes: 0.50, modestes: 0.35, intermediaires: 0.20, superieurs: 0    },
  fenetres:          { tres_modestes: 0.40, modestes: 0.30, intermediaires: 0.15, superieurs: 0    },
  autre:             { tres_modestes: 0,    modestes: 0,    intermediaires: 0,    superieurs: 0    },
};
export const MPR_CAP: Record<EffyWorkType, number> = {
  isolation_combles: 30000, isolation_murs: 30000, pac: 17000, biomasse: 12000,
  ballon_thermo: 3000, vmc: 5000, fenetres: 15000, autre: 0,
};
export const CEE_AMOUNT: Record<EffyWorkType, number> = {
  isolation_combles: 1800, isolation_murs: 1500, pac: 1200, biomasse: 1000,
  ballon_thermo: 200, vmc: 300, fenetres: 400, autre: 0,
};
export const ECO_PTZ_ELIGIBLE: Record<EffyWorkType, boolean> = {
  isolation_combles: true, isolation_murs: true, pac: true, biomasse: true,
  ballon_thermo: true, vmc: true, fenetres: true, autre: false,
};
export const ECO_PTZ_MAX_AMOUNT = 50000;

export const BRACKET_CFG: Record<MprBracket, { bg: string; text: string; border: string; label: string }> = {
  tres_modestes:  { bg: 'bg-blue-100',   text: 'text-blue-800',   border: 'border-blue-200',   label: 'Tranche 1 sur 4' },
  modestes:       { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-200', label: 'Tranche 2 sur 4' },
  intermediaires: { bg: 'bg-violet-100', text: 'text-violet-800', border: 'border-violet-200', label: 'Tranche 3 sur 4' },
  superieurs:     { bg: 'bg-pink-100',   text: 'text-pink-800',   border: 'border-pink-200',   label: 'Tranche 4 sur 4' },
};

export interface EffyResult {
  maprime: number;
  maprimeRate: number;
  maprimeEligible: boolean;
  cee: number;
  ecoPtzEligible: boolean;
  total: number;
  reste: number;
  bracket: MprBracket;
  savingsPct: number;
}

export function computeEffyAides(wt: EffyWorkType, bracket: MprBracket, cost: number, isOwner: boolean): EffyResult {
  const rate        = MPR_RATES[wt][bracket];
  const maprimeRate = isOwner ? rate : 0;
  const maprime     = isOwner ? Math.min(Math.round(cost * maprimeRate), MPR_CAP[wt]) : 0;
  const cee         = CEE_AMOUNT[wt];
  const total       = maprime + cee;
  const reste       = Math.max(0, cost - total);
  const savingsPct  = cost > 0 ? Math.round((total / cost) * 100) : 0;
  return {
    maprime, maprimeRate, maprimeEligible: maprime > 0,
    cee, ecoPtzEligible: ECO_PTZ_ELIGIBLE[wt] && isOwner,
    total, reste, bracket, savingsPct,
  };
}
