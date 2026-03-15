import { useState } from 'react';

export interface OptionTravaux {
  id: string;
  label: string;
  emoji: string;
  budgetMultiplier: number; // 1.0 = base, 0.7 = -30%, 1.4 = +40%
  durabilite: number; // 1-5
  entretien: number;  // 1-5 (5 = très peu d'entretien)
  drainage?: number;  // 1-5, optionnel
  description: string;
}

interface SimulateurOptionsProps {
  baseBudget: number;
  lotLabel: string;
  options: OptionTravaux[];
  onSelectOption?: (option: OptionTravaux) => void;
}

function ImpactBar({ label, value, max = 5, color = 'blue' }: { label: string; value: number; max?: number; color?: string }) {
  const pct = Math.round((value / max) * 100);
  const barColor =
    color === 'emerald' ? 'bg-emerald-500'
    : color === 'amber' ? 'bg-amber-500'
    : color === 'rose' ? 'bg-rose-500'
    : 'bg-blue-500';
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-500 text-[10px] w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function SimulateurOptions({ baseBudget, lotLabel, options, onSelectOption }: SimulateurOptionsProps) {
  const [selectedId, setSelectedId] = useState<string>(options[0]?.id ?? '');

  const selectedOption = options.find((o) => o.id === selectedId);
  const adjustedBudget = selectedOption ? Math.round(baseBudget * selectedOption.budgetMultiplier) : baseBudget;
  const diff = adjustedBudget - baseBudget;

  const handleSelect = (option: OptionTravaux) => {
    setSelectedId(option.id);
    onSelectOption?.(option);
  };

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400 font-medium">Comparer les options</p>
        <div className="flex items-baseline gap-1">
          <span className="text-white font-bold text-sm">{adjustedBudget.toLocaleString('fr-FR')} €</span>
          {diff !== 0 && (
            <span className={`text-[10px] font-semibold ${diff > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {diff > 0 ? '+' : ''}{diff.toLocaleString('fr-FR')} €
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const isSelected = option.id === selectedId;
          const optBudget = Math.round(baseBudget * option.budgetMultiplier);
          const optDiff = optBudget - baseBudget;
          return (
            <button
              key={option.id}
              onClick={() => handleSelect(option)}
              className={`text-left rounded-xl p-3 border transition-all ${
                isSelected
                  ? 'border-blue-500/50 bg-blue-500/10'
                  : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-base leading-none">{option.emoji}</span>
                <span className={`text-xs font-semibold leading-tight ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                  {option.label}
                </span>
              </div>

              <div className="space-y-1 mb-2">
                <ImpactBar label="Budget" value={option.budgetMultiplier > 1 ? option.budgetMultiplier * 2 : option.budgetMultiplier * 3} max={5} color={option.budgetMultiplier > 1.2 ? 'amber' : option.budgetMultiplier < 0.85 ? 'emerald' : 'blue'} />
                <ImpactBar label="Durabilité" value={option.durabilite} max={5} color="emerald" />
                <ImpactBar label="Entretien" value={option.entretien} max={5} color="blue" />
                {option.drainage !== undefined && (
                  <ImpactBar label="Drainage" value={option.drainage} max={5} color="blue" />
                )}
              </div>

              <p className={`text-[10px] font-medium ${
                optDiff > 0 ? 'text-amber-400' : optDiff < 0 ? 'text-emerald-400' : 'text-slate-500'
              }`}>
                {optDiff > 0 ? '+' : optDiff < 0 ? '' : '='}{optBudget.toLocaleString('fr-FR')} €
              </p>
            </button>
          );
        })}
      </div>

      {selectedOption && (
        <p className="text-slate-500 text-[11px] leading-relaxed">{selectedOption.description}</p>
      )}
    </div>
  );
}
