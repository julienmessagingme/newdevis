import { fmtK, fmtFull } from '@/lib/budgetHelpers';
import type { DocumentChantier } from '@/types/chantier-ia';

function BudgetComparaison({ rangeMin, rangeMax, documents }: {
  rangeMin: number; rangeMax: number; documents: DocumentChantier[];
}) {
  const devisCount   = documents.filter(d => d.document_type === 'devis').length;
  const factureCount = documents.filter(d => d.document_type === 'facture').length;
  const rangeAvg = Math.round((rangeMin + rangeMax) / 2);

  const columns = [
    { label: 'Budget estimé', value: fmtFull(rangeAvg), sub: `${fmtK(rangeMin)} – ${fmtK(rangeMax)}`, color: 'text-gray-900', bg: 'bg-gray-50 border-gray-100' },
    { label: 'Devis reçus', value: devisCount > 0 ? `${devisCount}` : '—', sub: devisCount === 1 ? 'Insuffisant, obtenez-en 2 de plus' : devisCount > 1 ? 'Comparaison possible' : 'Ajoutez vos devis', color: devisCount >= 2 ? 'text-emerald-700' : 'text-amber-700', bg: devisCount >= 2 ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100' },
    ...(factureCount > 0 ? [{ label: 'Factures enregistrées', value: `${factureCount}`, sub: 'paiements suivis', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-100' }] : []),
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      {columns.map(col => (
        <div key={col.label} className={`rounded-2xl border ${col.bg} px-5 py-4`}>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{col.label}</p>
          <p className={`text-2xl font-extrabold ${col.color} leading-none`}>{col.value}</p>
          <p className="text-xs text-gray-400 mt-1">{col.sub}</p>
        </div>
      ))}
    </div>
  );
}

export default BudgetComparaison;
