import { useMemo } from 'react';
import { Layers, ChevronRight } from 'lucide-react';
import { fmtK } from '@/lib/budgetHelpers';
import type { ChantierIAResult, DocumentChantier } from '@/types/chantier-ia';

function LotBreakdown({ result, documents, rangeMin, rangeMax, onGoToLot, onAddDoc }: {
  result: ChantierIAResult;
  documents: DocumentChantier[];
  rangeMin: number;
  rangeMax: number;
  onGoToLot?: (lotId: string) => void;
  onAddDoc: () => void;
}) {
  const lots = result.lots ?? [];
  const totalMax = lots.reduce((s, l) => s + (l.budget_max_ht ?? 0), 0) || rangeMax || 1;
  const totalMin = lots.reduce((s, l) => s + (l.budget_min_ht ?? 0), 0);
  const hasTotalBudget = totalMax > 0 && totalMin > 0;

  const lotsWithData = useMemo(() => {
    return lots.map(lot => {
      const min = lot.budget_min_ht ?? 0;
      const max = lot.budget_max_ht ?? 0;
      const avg = (min + max) / 2;
      const pctMin = totalMax > 0 ? (min / totalMax) * 100 : 0;
      const pctMax = totalMax > 0 ? (max / totalMax) * 100 : 0;
      const devisCount  = documents.filter(d => d.lot_id === lot.id && d.document_type === 'devis').length;
      const docCount    = documents.filter(d => d.lot_id === lot.id).length;
      return { ...lot, min, max, avg, pctMin, pctMax, devisCount, docCount };
    }).sort((a, b) => b.avg - a.avg);
  }, [lots, documents, totalMax]);

  if (lots.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-gray-400" />
          <h3 className="font-semibold text-gray-900">Intervenants nécessaires</h3>
        </div>
        <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider">
          {lots.length} intervenant{lots.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="divide-y divide-gray-50">
        {lotsWithData.map(lot => {
          const statusCfg = lot.devisCount === 0
            ? { dot: 'bg-red-400',     badge: 'bg-red-50 text-red-600 border-red-100',     label: '0 devis'  }
            : lot.devisCount === 1
            ? { dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 border-amber-100', label: '1 devis' }
            : { dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 border-emerald-100', label: `${lot.devisCount} devis` };

          return (
            <button key={lot.id}
              onClick={() => onGoToLot?.(lot.id)}
              className={`w-full flex items-center gap-3 py-3.5 text-left transition-all group ${
                onGoToLot ? 'hover:bg-gray-50 rounded-xl px-3 -mx-3 cursor-pointer' : 'cursor-default'
              }`}>
              {/* Emoji intervenant */}
              <div className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-lg shrink-0 group-hover:border-blue-100 group-hover:bg-blue-50 transition-colors">
                {lot.emoji ?? '🔧'}
              </div>

              {/* Nom + barre */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-sm font-semibold text-gray-800 truncate group-hover:text-blue-700 transition-colors">{lot.nom}</span>
                  <span className="text-sm font-bold text-gray-700 shrink-0">
                    {lot.min > 0 ? `${fmtK(lot.min)} – ${fmtK(lot.max)}` : <span className="text-gray-300 font-normal text-xs">Non estimé</span>}
                  </span>
                </div>
                {/* Barre budget */}
                <div className="relative h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  {lot.pctMax > 0 && (
                    <>
                      <div className="absolute h-full bg-blue-100 rounded-full" style={{ left: 0, width: `${lot.pctMax}%` }} />
                      <div className="absolute h-full bg-blue-500 rounded-full" style={{ left: 0, width: `${lot.pctMin}%` }} />
                    </>
                  )}
                </div>
              </div>

              {/* Badge devis + chevron */}
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusCfg.badge}`}>
                  {statusCfg.label}
                </span>
                {onGoToLot && <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-blue-400 transition-colors" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer total */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
        {hasTotalBudget ? (
          <>
            <span className="text-xs text-gray-400">Total (somme des intervenants)</span>
            <span className="text-sm font-bold text-gray-800">
              {fmtK(totalMin)} – {fmtK(totalMax)}
            </span>
          </>
        ) : (
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-gray-400">Aucun devis ajouté pour le moment</span>
            <button onClick={onAddDoc}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors">
              + Ajouter un devis
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default LotBreakdown;
