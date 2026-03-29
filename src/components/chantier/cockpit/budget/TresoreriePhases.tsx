import { useMemo } from 'react';
import { fmtK } from '@/lib/budgetHelpers';
import { PHASE_LABELS, PHASE_COLORS } from '@/lib/budgetHelpers';
import type { ChantierIAResult } from '@/types/chantier-ia';

function TresoreriePhases({ result }: { result: ChantierIAResult }) {
  const phaseData = useMemo(() => {
    const lots = result.lots ?? [];
    const roadmap = result.roadmap ?? [];

    // Grouper les étapes par phase et collecter les mois
    const phaseMap: Record<string, { mois: Set<string>; lots: Set<string> }> = {};
    for (const step of roadmap) {
      const p = step.phase ?? 'finitions';
      if (!phaseMap[p]) phaseMap[p] = { mois: new Set(), lots: new Set() };
      if (step.mois) phaseMap[p].mois.add(step.mois);
      if (step.artisan) phaseMap[p].lots.add(step.artisan);
    }

    // Associer budgets aux phases
    const phaseBudgets: Record<string, { min: number; max: number; mois: string[] }> = {};
    const phaseOrder = ['preparation', 'autorisations', 'gros_oeuvre', 'second_oeuvre', 'finitions', 'reception'];

    for (const phase of phaseOrder) {
      if (!phaseMap[phase]) continue;
      const relatedLots = lots.filter(l =>
        Array.from(phaseMap[phase].lots).some(a => l.nom.toLowerCase().includes(a.toLowerCase()))
      );
      // Si pas de lot correspondant, répartir uniformément
      const phaseLots = relatedLots.length > 0 ? relatedLots : lots.slice(0, Math.ceil(lots.length / phaseOrder.length));
      const min = phaseLots.reduce((s, l) => s + (l.budget_min_ht ?? 0), 0) / (phaseLots.length || 1) * 0.3;
      const max = phaseLots.reduce((s, l) => s + (l.budget_max_ht ?? 0), 0) / (phaseLots.length || 1) * 0.3;
      phaseBudgets[phase] = { min, max, mois: Array.from(phaseMap[phase].mois).slice(0, 2) };
    }

    return { phaseOrder, phaseBudgets };
  }, [result]);

  const { phaseOrder, phaseBudgets } = phaseData;
  const allPhases = phaseOrder.filter(p => phaseBudgets[p]);
  const maxBudget = Math.max(...allPhases.map(p => phaseBudgets[p]?.max ?? 0), 1);

  if (allPhases.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-gray-900">Trésorerie prévisionnelle</h3>
        <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider">Par phase · estimation</span>
      </div>

      <div className="flex items-end gap-3">
        {allPhases.map(phase => {
          const data = phaseBudgets[phase];
          if (!data) return null;
          const heightPct = maxBudget > 0 ? (data.max / maxBudget) * 100 : 0;
          const colorBar = PHASE_COLORS[phase] ?? 'bg-gray-300';
          return (
            <div key={phase} className="flex-1 flex flex-col items-center gap-2">
              <span className="text-[10px] font-bold text-gray-600">{fmtK(data.max)}</span>
              <div className="w-full rounded-lg overflow-hidden bg-gray-50" style={{ height: '80px' }}>
                <div className={`w-full ${colorBar} rounded-lg transition-all duration-500`}
                  style={{ height: `${heightPct}%`, marginTop: `${100 - heightPct}%` }} />
              </div>
              <div className="text-center">
                <p className="text-[9px] font-semibold text-gray-500 leading-tight">
                  {PHASE_LABELS[phase] ?? phase}
                </p>
                {data.mois[0] && (
                  <p className="text-[9px] text-gray-300 leading-tight">{data.mois[0]}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-gray-300 mt-3 text-center">
        Estimation basée sur votre planning — ajoutez vos factures pour affiner
      </p>
    </div>
  );
}

export default TresoreriePhases;
