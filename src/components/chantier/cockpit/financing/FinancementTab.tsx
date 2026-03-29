import { useState } from 'react';
import AidesTravaux, { type SimulationData } from '@/components/chantier/cockpit/financing/AidesTravaux';
import CreditSimulator from '@/components/chantier/cockpit/financing/CreditSimulator';
import type { SourceKey } from '@/components/chantier/cockpit/FinancingSources';

export default function FinancementTab({
  onImportAides,
  initialSimulation,
  onSimulationSave,
}: {
  onImportAides: (values: Partial<Record<SourceKey, string>>) => void;
  initialSimulation?: SimulationData | null;
  onSimulationSave?: (data: SimulationData | null) => void;
}) {
  const [sub, setSub] = useState<'aides' | 'credit'>('aides');
  return (
    <div className="space-y-4">
      {/* Sous-nav */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
        <button
          type="button"
          onClick={() => setSub('aides')}
          className={`flex-1 text-xs font-semibold px-3 py-2 rounded-lg transition-all ${
            sub === 'aides' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          🏠 Aides travaux
        </button>
        <button
          type="button"
          onClick={() => setSub('credit')}
          className={`flex-1 text-xs font-semibold px-3 py-2 rounded-lg transition-all ${
            sub === 'credit' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          🏦 Crédit travaux
        </button>
      </div>

      {sub === 'aides'  && (
        <AidesTravaux
          onImportAides={onImportAides}
          initialSimulation={initialSimulation}
          onSimulationSave={onSimulationSave}
        />
      )}
      {sub === 'credit' && <CreditSimulator />}
    </div>
  );
}
