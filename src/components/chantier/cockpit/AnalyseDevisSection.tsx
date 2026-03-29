import { useState, useEffect } from 'react';
import {
  Plus, FileText, Sparkles, ChevronRight, Trash2, FileSearch,
} from 'lucide-react';
import type { DocumentChantier, LotChantier } from '@/types/chantier-ia';
import DocScoreCell from '@/components/chantier/shared/DocScoreCell';
import { fmtK, fmtDate, IS } from '@/lib/dashboardHelpers';
import type { InsightItem, InsightsData } from './useInsights';

// ── Section Analyse des devis ─────────────────────────────────────────────────

function DevisCard({ doc, lot, insight, onDelete, chantierId, token, onAnalysed }: {
  doc: DocumentChantier;
  lot?: LotChantier;
  insight?: InsightItem;
  onDelete: () => void;
  chantierId?: string | null;
  token?: string | null;
  onAnalysed?: (docId: string, analysisId: string) => void;
}) {
  const s = insight ? IS[insight.type] : null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
      <div className="px-5 py-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <FileText className="h-5 w-5 text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{doc.nom}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-gray-400">{fmtDate(doc.created_at)}</span>
            {lot && (
              <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
                {lot.emoji ?? '🔧'} {lot.nom}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <DocScoreCell doc={doc} chantierId={chantierId ?? undefined} token={token} onAnalysed={onAnalysed} />
          <button onClick={onDelete}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {lot && ((lot.budget_min_ht ?? 0) > 0 || (lot.budget_max_ht ?? 0) > 0) && (
        <div className="px-5 pb-4">
          <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Prix marché observé</p>
              <p className="text-sm font-bold text-gray-700">{fmtK(lot.budget_min_ht ?? 0)} – {fmtK(lot.budget_max_ht ?? 0)}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
          </div>
        </div>
      )}
      {s && insight && (
        <div className={`px-5 py-3 border-t border-l-4 ${s.accent} ${s.border} ${s.bg} flex items-center gap-2`}>
          {insight.icon && <span className="text-sm shrink-0">{insight.icon}</span>}
          <p className={`text-xs font-semibold ${s.text}`}>{insight.text}</p>
        </div>
      )}
    </div>
  );
}

function AnalyseDevisSection({ documents: docsProp, lots, insights, insightsLoading, onAddDoc, chantierId, token }: {
  documents: DocumentChantier[];
  lots: LotChantier[];
  insights: InsightsData | null;
  insightsLoading: boolean;
  onAddDoc: () => void;
  chantierId?: string | null;
  token?: string | null;
}) {
  const [docs, setDocs] = useState(docsProp);
  useEffect(() => { setDocs(docsProp); }, [docsProp]);

  const devis = docs.filter(d => d.document_type === 'devis');
  const analyses = devis.filter(d => !!d.analyse_id).length;

  return (
    <div className="max-w-3xl mx-auto px-6 py-7">
      {devis.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 px-4 py-4 text-center">
            <p className="text-2xl font-extrabold text-gray-900">{devis.length}</p>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5">Devis</p>
          </div>
          <div className="bg-emerald-50 rounded-2xl border border-emerald-100 px-4 py-4 text-center">
            <p className="text-2xl font-extrabold text-emerald-700">{analyses}</p>
            <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mt-0.5">Analysés</p>
          </div>
          <div className="bg-amber-50 rounded-2xl border border-amber-100 px-4 py-4 text-center">
            <p className="text-2xl font-extrabold text-amber-700">{devis.length - analyses}</p>
            <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mt-0.5">À analyser</p>
          </div>
        </div>
      )}
      {devis.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-6">
            <FileSearch className="h-8 w-8 text-blue-400" />
          </div>
          <h2 className="font-bold text-gray-900 text-lg mb-2">Aucun devis à analyser</h2>
          <p className="text-sm text-gray-400 leading-relaxed mb-7 max-w-sm">
            Importez vos devis pour les comparer aux prix du marché et détecter les surcoûts.
          </p>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <a href="/nouvelle-analyse"
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors">
              <Sparkles className="h-4 w-4" /> Analyser un devis maintenant
            </a>
            <button onClick={onAddDoc}
              className="flex items-center justify-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors">
              <Plus className="h-4 w-4" /> Importer un devis
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {devis.map(doc => {
            const lot = lots.find(l => l.id === doc.lot_id);
            const lotInsight = lot ? insights?.lots?.[lot.id] : undefined;
            return (
              <DevisCard
                key={doc.id}
                doc={doc}
                lot={lot}
                insight={lotInsight}
                onDelete={() => {}}
                chantierId={chantierId}
                token={token}
                onAnalysed={(docId, analysisId) =>
                  setDocs(prev => prev.map(d => d.id === docId ? { ...d, analyse_id: analysisId } : d))
                }
              />
            );
          })}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <a href="/nouvelle-analyse"
              className="flex items-center justify-center gap-2 flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-3 text-sm transition-colors">
              <Sparkles className="h-4 w-4" /> Analyser un nouveau devis
            </a>
            <button onClick={onAddDoc}
              className="flex items-center justify-center gap-2 flex-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl px-5 py-3 text-sm transition-colors">
              <Plus className="h-4 w-4" /> Importer un devis
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AnalyseDevisSection;
