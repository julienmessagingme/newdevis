import { Plus, Search, ChevronRight } from 'lucide-react';

function QuickActions({ onAddDoc, onGoToAnalyse, onGoToLots }: {
  onAddDoc: () => void; onGoToAnalyse: () => void; onGoToLots: () => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        { label: 'Ajouter une facture', sub: 'Suivez vos paiements', icon: Plus, onClick: onAddDoc, bg: 'bg-blue-600 hover:bg-blue-700 text-white' },
        { label: 'Analyser un devis', sub: 'Détectez les surcoûts', icon: Search, onClick: onGoToAnalyse, bg: 'bg-white hover:bg-gray-50 text-gray-900 border border-gray-200' },
        { label: 'Voir les lots', sub: 'Gérez vos artisans', icon: ChevronRight, onClick: onGoToLots, bg: 'bg-white hover:bg-gray-50 text-gray-900 border border-gray-200' },
      ].map(({ label, sub, icon: Icon, onClick, bg }) => (
        <button key={label} onClick={onClick}
          className={`flex flex-col items-start gap-1 px-4 py-4 rounded-2xl transition-colors shadow-sm ${bg}`}>
          <Icon className="h-4 w-4 mb-1 opacity-70" />
          <p className="text-sm font-semibold leading-tight text-left">{label}</p>
          <p className="text-[11px] opacity-60 leading-tight text-left">{sub}</p>
        </button>
      ))}
    </div>
  );
}

export default QuickActions;
