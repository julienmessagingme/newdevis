/**
 * BudgetBandeau — bandeau unique du header onglet Budget.
 * Affiche : Estimation IA / Budget réel / Payé + barre de progression + message intelligent.
 */
import { SlidersHorizontal, Pencil } from 'lucide-react';
import { fmtK, fmtFull } from '@/lib/budgetHelpers';

interface Props {
  emoji: string;
  nom: string;
  rangeMin: number;
  rangeMax: number;
  totalDevisValides: number;
  totalPaye: number;
  hasRange: boolean;
  isRefined: boolean;
  onAmeliorer?: () => void;
  onOpenModal?: () => void;
}

export default function BudgetBandeau({
  emoji, nom, rangeMin, rangeMax, totalDevisValides, totalPaye,
  hasRange, isRefined, onAmeliorer, onOpenModal,
}: Props) {

  // Barre de progression : payé / budget réel
  const progressPct = totalDevisValides > 0
    ? Math.min(100, Math.round((totalPaye / totalDevisValides) * 100))
    : 0;

  // Message intelligent
  let message = '';
  let messageColor = 'text-gray-400';
  if (hasRange && totalDevisValides > 0) {
    if (totalDevisValides < rangeMin) {
      message = 'Budget inférieur à l\'estimation initiale';
      messageColor = 'text-emerald-600';
    } else if (totalDevisValides <= rangeMax) {
      message = 'Dans la fourchette estimée';
      messageColor = 'text-blue-600';
    } else {
      message = 'Dépassement du budget estimé';
      messageColor = 'text-amber-600';
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 px-6 py-5 space-y-4">

      {/* ── Titre + actions ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl shrink-0">{emoji}</span>
          <h2 className="font-bold text-gray-900 text-base leading-tight truncate">
            Budget chantier
          </h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onOpenModal && hasRange && (
            <button
              onClick={onOpenModal}
              className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-full px-3 py-1.5 transition-all"
            >
              <SlidersHorizontal className="h-3 w-3" />
              Affiner
            </button>
          )}
          {onAmeliorer && (
            <button
              onClick={onAmeliorer}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              <Pencil className="h-3 w-3" />
              Modifier
            </button>
          )}
        </div>
      </div>

      {/* ── Chiffres : IA / Réel / Payé ────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-gray-400 mb-1">
            {isRefined ? 'IA (affinée)' : 'Estimation IA'}
          </p>
          {hasRange
            ? <p className="text-sm font-semibold text-gray-700 tabular-nums">{fmtK(rangeMin)} – {fmtK(rangeMax)}</p>
            : <p className="text-sm font-medium text-gray-300">—</p>
          }
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-1">Budget réel</p>
          <p className={`text-sm font-bold tabular-nums ${totalDevisValides > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
            {totalDevisValides > 0 ? fmtFull(totalDevisValides) : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-1">Payé</p>
          <p className={`text-sm font-bold tabular-nums ${totalPaye > 0 ? 'text-indigo-600' : 'text-gray-300'}`}>
            {totalPaye > 0 ? fmtFull(totalPaye) : '—'}
          </p>
        </div>
      </div>

      {/* ── Barre de progression ────────────────────────────────────────── */}
      {totalDevisValides > 0 && (
        <div className="space-y-1.5">
          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            {message
              ? <p className={`text-xs font-medium ${messageColor}`}>{message}</p>
              : <span />
            }
            {totalPaye > 0 && (
              <p className="text-xs text-gray-400 tabular-nums">{progressPct} % réglé</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
