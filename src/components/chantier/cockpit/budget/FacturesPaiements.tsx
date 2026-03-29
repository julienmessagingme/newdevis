import { CircleDollarSign, FileText, Plus } from 'lucide-react';
import { fmtFull } from '@/lib/budgetHelpers';
import type { DocumentChantier } from '@/types/chantier-ia';

function FacturesPaiements({ documents, onAddFacture }: {
  documents: DocumentChantier[]; onAddFacture: () => void;
}) {
  const factures = documents.filter(d => d.document_type === 'facture');
  const devis    = documents.filter(d => d.document_type === 'devis');

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <CircleDollarSign className="h-4 w-4 text-gray-400" />
          <h3 className="font-semibold text-gray-900">Factures & paiements</h3>
        </div>
        <button onClick={onAddFacture}
          className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors">
          <Plus className="h-3 w-3" /> Ajouter
        </button>
      </div>

      {/* Résumé compteurs */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-gray-50 rounded-xl px-4 py-3 text-center">
          <p className="text-xl font-extrabold text-gray-900">{devis.length}</p>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5">Devis</p>
        </div>
        <div className="bg-emerald-50 rounded-xl px-4 py-3 text-center">
          <p className="text-xl font-extrabold text-emerald-700">{factures.length}</p>
          <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mt-0.5">Factures</p>
        </div>
        <div className="bg-amber-50 rounded-xl px-4 py-3 text-center">
          <p className="text-xl font-extrabold text-amber-700">0</p>
          <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mt-0.5">En retard</p>
        </div>
      </div>

      {/* Liste factures */}
      {factures.length === 0 ? (
        <div className="text-center py-6 border-2 border-dashed border-gray-100 rounded-xl">
          <FileText className="h-6 w-6 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400 mb-3">Aucune facture enregistrée</p>
          <button onClick={onAddFacture}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors">
            + Ajouter une facture
          </button>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {factures.slice(0, 5).map(f => (
            <div key={f.id} className="flex items-center gap-3 py-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{f.nom}</p>
                <p className="text-xs text-gray-400">{new Date(f.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</p>
              </div>
              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Payé</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FacturesPaiements;
