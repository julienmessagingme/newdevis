import type { DocumentType } from '@/types/chantier-ia';
import type { InsightItem } from '@/components/chantier/cockpit/useInsights';

// ── Formatters — re-exportés depuis les sources canoniques ────────────────────
export { fmtK } from '@/lib/budgetHelpers';
export { fmtEur } from '@/lib/financingUtils';

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export const TYPE_LABELS: Record<DocumentType, string> = {
  devis: 'Devis', facture: 'Facture', photo: 'Photo',
  plan: 'Plan', autorisation: 'Autorisation', assurance: 'Assurance', autre: 'Autre',
};


export const IS: Record<InsightItem['type'], { bg: string; text: string; border: string; accent: string }> = {
  success: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-100', accent: 'border-l-emerald-400' },
  warning: { bg: 'bg-amber-50',   text: 'text-amber-800',   border: 'border-amber-100',   accent: 'border-l-amber-400'   },
  alert:   { bg: 'bg-red-50',     text: 'text-red-800',     border: 'border-red-100',     accent: 'border-l-red-400'     },
  info:    { bg: 'bg-blue-50',    text: 'text-blue-800',    border: 'border-blue-100',     accent: 'border-l-blue-400'    },
};
