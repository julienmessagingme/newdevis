import React from 'react';
import { ArrowLeft, Menu, Plus } from 'lucide-react';

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

export function BudgetHomeHeader({ nom, emoji, typeProjet, onMenuToggle, onAddDoc }: {
  nom: string;
  emoji?: string | null;
  typeProjet?: string | null;
  onMenuToggle: () => void;
  onAddDoc: () => void;
}) {
  // Illustration selon le type de projet
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
    <header className="bg-white border-b border-gray-100 px-5 py-5">
      <div className="flex items-center gap-3">
        {/* Bouton menu mobile */}
        <button onClick={onMenuToggle} className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 shrink-0">
          <Menu className="h-4 w-4" />
        </button>

        {/* Illustration + titre projet — gauche */}
        <div className="flex items-center gap-3 w-64 shrink-0 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center text-xl shrink-0 shadow-sm">
            {illustration}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Mon chantier</p>
            <h1 className="font-bold text-gray-900 text-sm leading-tight truncate">{nom}</h1>
          </div>
        </div>

        {/* CTA centré */}
        <div className="flex-1 flex flex-col items-center gap-1">
          <button
            onClick={onAddDoc}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl px-5 py-2.5 transition-colors shadow-sm shadow-blue-200"
          >
            <Plus className="h-4 w-4" />
            Ajouter un document
          </button>
          <p className="text-[11px] text-gray-400">devis · facture · photo · plan · ou importer depuis votre espace</p>
        </div>

        {/* Espace équilibrant à droite */}
        <div className="w-64 shrink-0 hidden lg:block" />
      </div>
    </header>
  );
}
