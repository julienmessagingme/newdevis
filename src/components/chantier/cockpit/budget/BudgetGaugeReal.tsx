import { useState } from 'react';
import { Check, X, Pencil, Euro, Info } from 'lucide-react';
import { fmtEur } from '@/lib/financingUtils';

export default function BudgetGaugeReal({
  totalEngaged,
  totalPaid,
  budgetMax,
  lateAmount,
  onBudgetOverride,
}: {
  totalEngaged: number;
  totalPaid: number;
  budgetMax: number;
  lateAmount: number;
  onBudgetOverride: (v: number | null) => void;
}) {
  const [editing, setEditing]       = useState(false);
  const [editValue, setEditValue]   = useState('');
  const [showTooltip, setShowTooltip] = useState(false);

  const ref     = budgetMax > 0 ? budgetMax : (totalEngaged || 1);
  const paidPct = Math.min((totalPaid    / ref) * 100, 100);
  const engPct  = Math.min((totalEngaged / ref) * 100, 100);
  const isOver  = totalEngaged > ref && budgetMax > 0;
  const remaining = budgetMax > 0 ? Math.max(0, budgetMax - totalEngaged) : null;

  function startEdit() {
    setEditValue(budgetMax > 0 ? String(Math.round(budgetMax)) : '');
    setEditing(true);
  }

  function confirmEdit() {
    const v = parseFloat(editValue.replace(/\s/g, '').replace(',', '.'));
    if (!isNaN(v) && v > 0) {
      onBudgetOverride(v);
    }
    setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
  }

  function resetOverride() {
    onBudgetOverride(null);
    setEditing(false);
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-gray-900 text-sm">Budget total engagé</h3>

        {/* Badge enveloppe éditable */}
        <div className="flex items-center gap-1.5">
          {editing ? (
            <div className="flex items-center gap-1 border border-blue-300 bg-blue-50 rounded-lg px-2 py-0.5">
              <Euro className="h-3 w-3 text-blue-400 shrink-0" />
              <input
                autoFocus
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') cancelEdit(); }}
                className="w-24 text-xs font-bold text-blue-700 bg-transparent outline-none tabular-nums"
                placeholder="99 300"
              />
              <button type="button" onClick={confirmEdit} className="text-emerald-600 hover:text-emerald-700">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={cancelEdit} className="text-gray-400 hover:text-gray-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                isOver
                  ? 'bg-red-50 text-red-600 border-red-100'
                  : 'bg-gray-50 text-gray-500 border-gray-100'
              }`}>
                {budgetMax > 0 ? `Enveloppe · ${fmtEur(budgetMax)}` : 'Enveloppe non définie'}
                <button
                  type="button"
                  onClick={startEdit}
                  title="Modifier l'enveloppe"
                  className="ml-0.5 text-gray-400 hover:text-blue-600 transition-colors"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </span>

              {/* Tooltip ℹ */}
              <div className="relative">
                <button
                  type="button"
                  onMouseEnter={() => setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                  onClick={() => setShowTooltip(v => !v)}
                  className="text-gray-300 hover:text-blue-400 transition-colors"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
                {showTooltip && (
                  <div className="absolute right-0 top-6 z-20 w-64 bg-gray-900 text-white text-[11px] leading-relaxed rounded-xl p-3 shadow-xl">
                    Il s'agit de l'<strong>estimation haute</strong> générée par l'IA à partir de vos lots.
                    Cliquez sur <strong>✏</strong> pour saisir votre propre enveloppe budgétaire.
                    <div className="absolute -top-1.5 right-2 w-3 h-3 bg-gray-900 rotate-45" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Barre */}
      <div className="space-y-1.5">
        <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="absolute left-0 h-full bg-emerald-400 rounded-full transition-all duration-700"
            style={{ width: `${paidPct}%` }}
          />
          {engPct > paidPct && (
            <div
              className={`absolute h-full rounded-full transition-all duration-700 ${isOver ? 'bg-red-400' : 'bg-blue-400'}`}
              style={{ left: `${paidPct}%`, width: `${engPct - paidPct}%` }}
            />
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Payé</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Engagé (reste à payer)</span>
          {budgetMax > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-200 inline-block" /> Disponible</span>}
        </div>
      </div>

      {/* 3 KPI */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl py-2.5 px-2">
          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-0.5">Payé</p>
          <p className="text-base font-extrabold text-emerald-700">{totalPaid > 0 ? fmtEur(totalPaid) : '—'}</p>
          <p className="text-[10px] text-emerald-400 mt-0.5">versé aux artisans</p>
        </div>
        <div className={`border rounded-xl py-2.5 px-2 ${isOver ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'}`}>
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${isOver ? 'text-red-500' : 'text-blue-500'}`}>
            Engagé
          </p>
          <p className={`text-base font-extrabold ${isOver ? 'text-red-700' : 'text-blue-700'}`}>
            {totalEngaged > 0 ? fmtEur(totalEngaged) : '—'}
          </p>
          <p className={`text-[10px] mt-0.5 ${isOver ? 'text-red-400' : 'text-blue-400'}`}>total devis signés</p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl py-2.5 px-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Restant</p>
          <p className="text-base font-extrabold text-gray-700">
            {remaining !== null ? fmtEur(remaining) : '—'}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {remaining !== null ? 'budget non engagé' : 'budget non défini'}
          </p>
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 flex gap-2">
        <Info className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-500 leading-relaxed">
          <strong className="text-gray-600">Engagé</strong> = somme de tous vos devis validés (acomptes déjà versés + ce qui reste à payer).
          {lateAmount > 0 && (
            <span className="text-red-600 font-semibold"> Dont {fmtEur(lateAmount)} en retard de paiement.</span>
          )}
        </p>
      </div>
    </div>
  );
}
