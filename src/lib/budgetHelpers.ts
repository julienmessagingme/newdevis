// ── Budget helpers (pure TS, no React) ────────────────────────────────────────

export function fmtK(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)} k€`;
  return `${Math.round(n)} €`;
}

export function fmtFull(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

export const PHASE_LABELS: Record<string, string> = {
  preparation: 'Préparation', autorisations: 'Autorisations',
  gros_oeuvre: 'Gros œuvre', second_oeuvre: 'Second œuvre',
  finitions: 'Finitions', reception: 'Réception',
};

export const PHASE_COLORS: Record<string, string> = {
  preparation: 'bg-blue-400', autorisations: 'bg-amber-400',
  gros_oeuvre: 'bg-orange-400', second_oeuvre: 'bg-violet-400',
  finitions: 'bg-emerald-400', reception: 'bg-teal-400',
};

export const PHASE_LIGHT: Record<string, string> = {
  preparation: 'bg-blue-50 text-blue-700', autorisations: 'bg-amber-50 text-amber-700',
  gros_oeuvre: 'bg-orange-50 text-orange-700', second_oeuvre: 'bg-violet-50 text-violet-700',
  finitions: 'bg-emerald-50 text-emerald-700', reception: 'bg-teal-50 text-teal-700',
};
