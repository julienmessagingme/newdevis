import { fmtFull } from '@/lib/budgetHelpers';
import type { DocumentChantier } from '@/types/chantier-ia';

function BudgetGauge({ rangeMin, rangeMax, documents }: {
  rangeMin: number; rangeMax: number; documents: DocumentChantier[];
}) {
  const factures = documents.filter(d => d.document_type === 'facture');
  const devisValides = documents.filter(d =>
    d.document_type === 'devis' &&
    (d.devis_statut === 'valide' || d.devis_statut === 'attente_facture')
  );

  // ── Montants réels depuis la DB ───────────────────────────────────────────
  const totalPaye = factures
    .filter(d => d.facture_statut === 'payee')
    .reduce((s, d) => s + (d.montant ?? 0), 0);

  const totalAcompte = factures
    .filter(d => d.facture_statut === 'payee_partiellement')
    .reduce((s, d) => s + (d.montant_paye ?? 0), 0);

  const totalEngage = devisValides.reduce((s, d) => s + (d.montant ?? 0), 0);

  // ── Budget de référence ───────────────────────────────────────────────────
  const budget = rangeMax > 0 ? rangeMax : (rangeMin > 0 ? rangeMin * 1.1 : 0);
  const hasData = budget > 0;

  const pct = (v: number) => hasData ? Math.min(Math.round((v / budget) * 100), 100) : 0;

  const pctPaye    = pct(totalPaye);
  const pctAcompte = pct(totalAcompte);
  const pctEngage  = pct(totalEngage);

  // La barre est divisée en 3 segments empilés : payé + acompte + engagé
  const pctPayeAcompte = Math.min(pctPaye + pctAcompte, 100);
  const pctTotal       = Math.min(pctPaye + pctAcompte + Math.max(0, pctEngage - pctPayeAcompte), 100);

  const disponible = hasData ? Math.max(0, budget - totalEngage - totalPaye - totalAcompte) : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Avancement budgétaire</h3>
        {budget > 0 && (
          <span className="text-xs font-medium text-gray-400">
            Budget max · {fmtFull(budget)}
          </span>
        )}
      </div>

      {/* Gauge */}
      <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden mb-3">
        {/* Engagé (devis validés) */}
        {pctTotal > 0 && (
          <div className="absolute left-0 h-full bg-blue-100 rounded-full transition-all duration-700"
            style={{ width: `${pctTotal}%` }} />
        )}
        {/* Acompte versé */}
        {pctPayeAcompte > pctPaye && (
          <div className="absolute h-full bg-blue-400 rounded-full transition-all duration-700"
            style={{ left: `${pctPaye}%`, width: `${pctPayeAcompte - pctPaye}%` }} />
        )}
        {/* Payé */}
        {pctPaye > 0 && (
          <div className="absolute left-0 h-full bg-emerald-400 rounded-full transition-all duration-700"
            style={{ width: `${pctPaye}%` }} />
        )}
      </div>

      {/* Légende */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
        <LegendItem dot="bg-emerald-400" label="Payé" value={totalPaye} pct={pctPaye} />
        <LegendItem dot="bg-blue-400"    label="Acompte"  value={totalAcompte} pct={pctAcompte} show={totalAcompte > 0} />
        <LegendItem dot="bg-blue-100"    label="Engagé (devis validés)" value={totalEngage} pct={pctEngage} show={totalEngage > 0} />
        {hasData && <LegendItem dot="bg-gray-200" label="Disponible" value={disponible} pct={100 - pctTotal} />}
      </div>

      {devisValides.length === 0 && factures.length === 0 && (
        <p className="text-xs text-gray-400 mt-3 border-t border-gray-50 pt-3">
          💡 Validez des devis pour suivre votre budget en temps réel
        </p>
      )}
    </div>
  );
}

function LegendItem({ dot, label, value, pct, show = true }: {
  dot: string; label: string; value: number; pct: number; show?: boolean;
}) {
  if (!show) return null;
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
      <span className="text-gray-500">{label}</span>
      <span className="font-bold text-gray-700">{value > 0 ? fmtFull(value) : '—'}</span>
      {pct > 0 && <span className="text-gray-300">({pct}%)</span>}
    </div>
  );
}

export default BudgetGauge;
