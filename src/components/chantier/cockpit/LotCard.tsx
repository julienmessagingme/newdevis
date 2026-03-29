import { Plus, ChevronRight, FileText } from 'lucide-react';
import type { LotChantier, DocumentChantier } from '@/types/chantier-ia';
import type { InsightItem } from './useInsights';
import { fmtK, IS } from '@/lib/dashboardHelpers';

function LotCard({ lot, docs, insight, onAdd, onDetail }: {
  lot: LotChantier; docs: DocumentChantier[];
  insight?: InsightItem; onAdd: () => void; onDetail: () => void;
}) {
  const devisCount   = docs.filter(d => d.document_type === 'devis').length;
  const factureCount = docs.filter(d => d.document_type === 'facture').length;
  const hasRef       = (lot.budget_min_ht ?? 0) > 0 || (lot.budget_max_ht ?? 0) > 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col">
      <div className="p-5 flex-1 space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl shrink-0 leading-none">{lot.emoji ?? '🔧'}</span>
          <h3 className="font-bold text-gray-900 text-sm leading-tight truncate">{lot.nom}</h3>
        </div>
        {docs.length === 0 ? (
          <div className="space-y-2">
            <span className="inline-flex text-xs text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full">Aucun devis ajouté</span>
            {hasRef && (
              <div className="bg-gray-50 rounded-xl px-3.5 py-2.5">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Prix observé</p>
                <p className="text-sm font-bold text-gray-700">{fmtK(lot.budget_min_ht ?? 0)} – {fmtK(lot.budget_max_ht ?? 0)}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {devisCount   > 0 && <span className="flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full"><FileText className="h-3 w-3" />{devisCount} devis</span>}
              {factureCount > 0 && <span className="flex items-center gap-1 text-xs font-medium text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full"><FileText className="h-3 w-3" />{factureCount} facture{factureCount > 1 ? 's' : ''}</span>}
            </div>
            {hasRef && <p className="text-xs text-gray-400">Réf. marché · {fmtK(lot.budget_min_ht ?? 0)} – {fmtK(lot.budget_max_ht ?? 0)}</p>}
          </div>
        )}
      </div>
      {/* Insight band */}
      {insight && (
        <div className={`px-4 py-2 border-t border-l-4 ${IS[insight.type].accent} ${IS[insight.type].border} ${IS[insight.type].bg} flex items-center gap-1.5`}>
          {insight.icon && <span className="text-[11px]">{insight.icon}</span>}
          <span className={`text-[11px] font-semibold ${IS[insight.type].text}`}>{insight.text}</span>
        </div>
      )}
      <div className="flex border-t border-gray-50">
        <button onClick={onDetail} className="flex-1 flex items-center justify-center gap-1 py-3 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors">Voir <ChevronRight className="h-3 w-3" /></button>
        <div className="w-px bg-gray-50" />
        <button onClick={onAdd} className="flex-1 flex items-center justify-center gap-1 py-3 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"><Plus className="h-3 w-3" /> Ajouter</button>
      </div>
    </div>
  );
}

export default LotCard;
