import React from 'react';
import { ArrowLeft, Menu } from 'lucide-react';

export function PageHeader({ title, sub, action, onMenuToggle, onBack }: {
  title: string; sub?: string; action?: React.ReactNode; onMenuToggle: () => void; onBack?: () => void;
}) {
  return (
    <header className="bg-white border-b border-gray-100 px-6 py-4">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-blue-600 transition-colors mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Tableau de bord
        </button>
      )}
      <div className="flex items-center gap-3">
        <button onClick={onMenuToggle} className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
          <Menu className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-gray-900">{title}</h1>
          {sub && <p className="text-sm text-gray-400 mt-0.5">{sub}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}

// ── Budget Home Header (header premium section principale) ────────────────────

function fmtBudget(n: number): string {
  if (n <= 0) return '—';
  if (n >= 1000) return `${Math.round(n / 1000)}k €`;
  return `${Math.round(n)} €`;
}

export function BudgetHomeHeader({ nom, emoji, typeProjet, onMenuToggle, budgetEstime, budgetValide, facture }: {
  nom: string;
  emoji?: string | null;
  typeProjet?: string | null;
  onMenuToggle: () => void;
  budgetEstime: string;
  budgetValide: number;
  facture: number;
}) {
  const illustrations: Record<string, string> = {
    renovation:      '🏠',
    construction:    '🏗️',
    extension:       '🏡',
    amenagement:     '🛋️',
    piscine:         '🏊',
    jardin:          '🌿',
    toiture:         '🏠',
    salle_de_bain:   '🚿',
    cuisine:         '👨‍🍳',
    electricite:     '⚡',
    plomberie:       '🔧',
    isolation:       '🧱',
  };
  const illustration = emoji ?? illustrations[typeProjet ?? ''] ?? '🏗️';

  return (
    <header className="bg-white border-b border-gray-100 px-5 py-4">
      <div className="flex items-center gap-4">
        {/* Bouton menu mobile */}
        <button onClick={onMenuToggle} className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 shrink-0">
          <Menu className="h-4 w-4" />
        </button>

        {/* Illustration + titre projet */}
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center text-xl shrink-0 shadow-sm">
            {illustration}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Mon chantier</p>
            <h1 className="font-bold text-gray-900 text-sm leading-tight truncate">{nom}</h1>
          </div>
        </div>

        {/* KPIs budget — centré */}
        <div className="flex-1 flex items-center justify-center gap-6">
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Estimé</p>
            <p className="text-sm font-extrabold text-gray-900 tabular-nums">{budgetEstime}</p>
          </div>
          <div className="w-px h-8 bg-gray-100" />
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Validé</p>
            <p className={`text-sm font-extrabold tabular-nums ${budgetValide > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
              {budgetValide > 0 ? fmtBudget(budgetValide) : '—'}
            </p>
          </div>
          <div className="w-px h-8 bg-gray-100" />
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Facturé</p>
            <p className={`text-sm font-extrabold tabular-nums ${facture > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>
              {facture > 0 ? fmtBudget(facture) : '—'}
            </p>
          </div>
        </div>

        {/* Spacer droite pour équilibrage desktop */}
        <div className="w-10 shrink-0 hidden lg:block" />
      </div>
    </header>
  );
}
