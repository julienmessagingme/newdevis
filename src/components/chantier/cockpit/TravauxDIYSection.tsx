import {
  Plus, Wrench, Receipt,
} from 'lucide-react';
import type { DocumentChantier } from '@/types/chantier-ia';
import { fmtDate } from '@/lib/dashboardHelpers';

// ── Section Travaux réalisés par vous ─────────────────────────────────────────

function TravauxDIYSection({ documents, onAddDoc }: {
  documents: DocumentChantier[];
  onAddDoc: () => void;
}) {
  // Uniquement les factures de matériaux sans lot (achats faits par le client, pose à sa charge)
  const factures = documents.filter(d => d.document_type === 'facture' && !d.lot_id);
  const photos: DocumentChantier[] = []; // les photos vont dans l'onglet Documents, pas ici

  return (
    <div className="max-w-3xl mx-auto px-6 py-7">
      <p className="text-sm text-gray-400 mb-6 leading-relaxed">
        Enregistrez vos achats de matériaux (peinture, carrelage, bois…) que vous posez vous-même. Nous calculons l'économie réalisée sur la main d'œuvre.
      </p>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-4 text-center">
          <p className="text-2xl font-extrabold text-gray-900">{factures.length}</p>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5">Achats matériaux</p>
          <p className="text-[10px] text-gray-400 mt-0.5">factures enregistrées</p>
        </div>
        <div className="bg-emerald-50 rounded-2xl border border-emerald-100 px-4 py-4 text-center">
          <p className="text-2xl font-extrabold text-emerald-700">—</p>
          <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mt-0.5">Économie MO</p>
          <p className="text-[10px] text-emerald-400 mt-0.5">main d'œuvre estimée</p>
        </div>
      </div>
      {factures.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-2xl p-10 flex flex-col items-center text-center">
          <Wrench className="h-8 w-8 text-gray-300 mb-3" />
          <p className="font-semibold text-gray-700 mb-1">Aucun achat matériaux enregistré</p>
          <p className="text-xs text-gray-400 mb-5 max-w-xs leading-relaxed">
            Ajoutez vos factures de matériaux achetés en direct (pose à votre charge). On compare avec les prix artisans pour estimer votre économie.
          </p>
          <button onClick={onAddDoc}
            className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors">
            <Plus className="h-4 w-4" /> Ajouter une facture matériaux
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-100 rounded-2xl px-5 py-4">
            <p className="text-xs font-semibold text-amber-700 mb-1">💡 Comment fonctionne le calcul</p>
            <p className="text-xs text-amber-600 leading-relaxed">
              Nous comparons le coût de vos matériaux aux prix TTC observés sur des devis d'artisans (fourniture + pose). La différence représente votre économie sur la main d'œuvre.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
            {factures.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 px-5 py-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-emerald-50">
                  <Receipt className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{doc.nom}</p>
                  <p className="text-xs text-gray-400">{fmtDate(doc.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
          <button onClick={onAddDoc}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-2xl py-4 text-sm text-gray-400 hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50 transition-all">
            <Plus className="h-4 w-4" /> Ajouter une facture matériaux
          </button>
        </div>
      )}
    </div>
  );
}

export default TravauxDIYSection;
