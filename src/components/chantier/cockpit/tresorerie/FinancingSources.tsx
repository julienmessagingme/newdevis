import { Info } from 'lucide-react';
import { fmtEur } from '@/lib/financingUtils';

export const SOURCES_CFG = [
  { key: 'apport',      label: 'Apport personnel',  emoji: '💰', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100' },
  { key: 'credit',      label: 'Crédit travaux',     emoji: '🏦', color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-100'    },
  { key: 'maprime',     label: "MaPrimeRénov'",      emoji: '🟢', color: 'text-green-700',   bg: 'bg-green-50',   border: 'border-green-100'   },
  { key: 'cee',         label: 'CEE',                emoji: '💡', color: 'text-yellow-700',  bg: 'bg-yellow-50',  border: 'border-yellow-100'  },
  { key: 'eco_ptz',     label: 'Éco-PTZ',            emoji: '🏠', color: 'text-violet-700',  bg: 'bg-violet-50',  border: 'border-violet-100'  },
] as const;

export type SourceKey = typeof SOURCES_CFG[number]['key'];

export default function FinancingSources({
  budgetMax,
  amounts,
  setAmounts,
}: {
  budgetMax: number;
  amounts: Record<SourceKey, string>;
  setAmounts: React.Dispatch<React.SetStateAction<Record<SourceKey, string>>>;
}) {

  const total = Object.values(amounts).reduce((s, v) => {
    const n = parseFloat(v.replace(/\s/g, '').replace(',', '.'));
    return s + (isNaN(n) ? 0 : n);
  }, 0);

  const ref  = budgetMax > 0 ? budgetMax : null;
  const pct  = ref ? Math.min((total / ref) * 100, 100) : 0;
  const gap  = ref ? Math.max(0, ref - total) : null;
  const over = ref ? total > ref : false;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4 shadow-sm">
      <div>
        <h3 className="font-semibold text-gray-900 text-sm">Sources de financement</h3>
        <p className="text-[11px] text-gray-400 mt-0.5">Renseignez vos apports et aides pour visualiser votre couverture</p>
      </div>

      <div className="space-y-2">
        {SOURCES_CFG.map(src => (
          <div key={src.key} className={`flex items-center gap-3 ${src.bg} border ${src.border} rounded-xl px-3 py-2.5`}>
            <span className="text-base w-6 text-center shrink-0">{src.emoji}</span>
            <span className={`text-xs font-semibold flex-1 ${src.color}`}>{src.label}</span>
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1 w-28">
              <input
                type="text"
                inputMode="decimal"
                value={amounts[src.key]}
                onChange={e => setAmounts(prev => ({ ...prev, [src.key]: e.target.value }))}
                placeholder="0"
                className={`w-full text-xs font-bold ${src.color} bg-transparent outline-none tabular-nums text-right`}
              />
              <span className="text-[10px] text-gray-400 shrink-0">€</span>
            </div>
          </div>
        ))}
      </div>

      {/* Barre de couverture */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-gray-500 font-medium">Total financé</span>
          <span className={`font-extrabold tabular-nums ${over ? 'text-emerald-600' : total > 0 ? 'text-blue-700' : 'text-gray-300'}`}>
            {total > 0 ? fmtEur(total) : '—'}
          </span>
        </div>
        {ref && (
          <>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${over ? 'bg-emerald-400' : 'bg-blue-400'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-gray-400">Couverture : <strong className="text-gray-600">{Math.round(pct)} %</strong></span>
              {gap !== null && gap > 0 && (
                <span className="text-amber-600 font-semibold">Il manque encore {fmtEur(gap)}</span>
              )}
              {over && (
                <span className="text-emerald-600 font-semibold">Budget couvert ✓</span>
              )}
            </div>
          </>
        )}
      </div>

      {gap !== null && gap > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 flex gap-2">
          <Info className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700 leading-relaxed">
            Il vous manque <strong>{fmtEur(gap)}</strong> pour couvrir votre enveloppe.
            Consultez l'onglet <strong>Financement</strong> pour simuler vos aides.
          </p>
        </div>
      )}
    </div>
  );
}
