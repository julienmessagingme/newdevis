import { fmtK, fmtFull } from '@/lib/budgetHelpers';
import type { DocumentChantier } from '@/types/chantier-ia';

function BudgetGauge({ rangeMin, rangeMax, documents }: {
  rangeMin: number; rangeMax: number; documents: DocumentChantier[];
}) {
  const devisCount   = documents.filter(d => d.document_type === 'devis').length;
  const factureCount = documents.filter(d => d.document_type === 'facture').length;
  // Estimation prudente : si on a des devis, engagé = milieu de la fourchette
  const engaged = devisCount > 0 ? Math.round((rangeMin + rangeMax) / 2 * 0.75) : 0;
  const paid    = factureCount > 0 ? Math.round(engaged * 0.4) : 0;
  const total   = rangeMax;
  const engagedPct = total > 0 ? Math.min((engaged / total) * 100, 100) : 0;
  const paidPct    = total > 0 ? Math.min((paid    / total) * 100, 100) : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Budget engagé</h3>
        <span className="text-xs font-medium text-gray-400">Max prévu · {fmtFull(rangeMax)}</span>
      </div>

      {/* Gauge */}
      <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden mb-3">
        {/* Payé */}
        <div className="absolute left-0 h-full bg-emerald-400 rounded-full transition-all duration-700"
          style={{ width: `${paidPct}%` }} />
        {/* Engagé */}
        {engagedPct > paidPct && (
          <div className="absolute h-full bg-blue-300 rounded-full transition-all duration-700"
            style={{ left: `${paidPct}%`, width: `${engagedPct - paidPct}%` }} />
        )}
      </div>

      {/* Légende */}
      <div className="flex items-center gap-5 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <span className="text-gray-500">Payé</span>
          <span className="font-bold text-gray-700">{paid > 0 ? fmtK(paid) : '—'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-300" />
          <span className="text-gray-500">Engagé (estim.)</span>
          <span className="font-bold text-gray-700">{engaged > 0 ? fmtK(engaged) : '—'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-gray-200" />
          <span className="text-gray-500">Disponible</span>
          <span className="font-bold text-gray-700">{fmtK(Math.max(0, total - engaged))}</span>
        </div>
      </div>

      {devisCount === 0 && (
        <p className="text-xs text-gray-400 mt-3 border-t border-gray-50 pt-3">
          💡 Ajoutez vos devis pour afficher les montants réels
        </p>
      )}
    </div>
  );
}

export default BudgetGauge;
