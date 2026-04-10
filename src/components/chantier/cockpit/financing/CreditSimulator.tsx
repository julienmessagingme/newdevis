import { useState, useMemo } from 'react';
import { CreditCard } from 'lucide-react';
import { fmtEur, fmtEurPrecis } from '@/lib/financingUtils';

export function SliderField({ label, value, min, max, step, onChange, display }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</label>
        <span className="text-sm font-extrabold text-blue-700 tabular-nums bg-blue-50 px-2.5 py-1 rounded-lg">{display}</span>
      </div>
      <div className="relative h-6 flex items-center">
        <div className="absolute w-full h-2 rounded-full bg-gray-200" />
        <div
          className="absolute h-2 rounded-full bg-blue-500 pointer-events-none"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="relative w-full h-2 appearance-none bg-transparent cursor-pointer"
          style={{ WebkitAppearance: 'none' }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-300 font-medium">
        <span>{min}{label.includes('Taux') ? ' %' : label.includes('Durée') ? ' mois' : ' €'}</span>
        <span>{max}{label.includes('Taux') ? ' %' : label.includes('Durée') ? ' mois' : ' €'}</span>
      </div>
    </div>
  );
}

export default function CreditSimulator() {
  const [montant, setMontant] = useState('');
  const [duree,   setDuree]   = useState(120);
  const [taux,    setTaux]    = useState(3.5);

  const result = useMemo(() => {
    const M = parseFloat(montant);
    const n = duree;
    const t = taux / 100;
    if (!M || M <= 0 || n <= 0) return null;
    if (t === 0) {
      const mensualite = M / n;
      return { mensualite, coutTotal: M, interets: 0 };
    }
    const r = t / 12;
    const mensualite = M * r / (1 - Math.pow(1 + r, -n));
    const coutTotal  = mensualite * n;
    return { mensualite, coutTotal, interets: coutTotal - M };
  }, [montant, duree, taux]);

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3.5">
        <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">🏦 Simulateur crédit travaux</p>
        <p className="text-xs text-blue-700 leading-relaxed">
          Estimez vos mensualités pour financer votre reste à charge par emprunt.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Montant à financer</label>
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
          <input
            type="number"
            inputMode="decimal"
            value={montant}
            onChange={e => setMontant(e.target.value)}
            placeholder="ex : 30 000"
            min="1000"
            className="flex-1 bg-transparent text-sm font-semibold text-gray-900 outline-none placeholder:text-gray-300 placeholder:font-normal"
          />
          <span className="text-xs font-bold text-gray-400 shrink-0">€</span>
        </div>
      </div>

      <SliderField
        label="Durée de remboursement"
        value={duree} min={1} max={360} step={1}
        onChange={setDuree} display={`${duree} mois`}
      />
      <SliderField
        label="Taux annuel"
        value={taux} min={0.5} max={12} step={0.1}
        onChange={setTaux} display={`${taux.toFixed(1)} %`}
      />

      {result ? (
        <div className="grid grid-cols-1 gap-3">
          <div className="bg-blue-600 rounded-2xl p-5 text-center text-white">
            <p className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1">Mensualité estimée</p>
            <p className="text-4xl font-extrabold leading-none">{fmtEurPrecis(result.mensualite)}</p>
            <p className="text-xs opacity-60 mt-1">par mois pendant {duree} mois</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-gray-100 rounded-xl p-4 text-center">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Coût total</p>
              <p className="text-lg font-extrabold text-gray-900">{fmtEur(result.coutTotal)}</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
              <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-1">Intérêts</p>
              <p className="text-lg font-extrabold text-amber-700">{fmtEur(result.interets)}</p>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 text-center leading-relaxed border-t border-gray-50 pt-3">
            Simulation indicative. Consultez votre banque ou un courtier pour une offre personnalisée.
          </p>
        </div>
      ) : (
        <div className="text-center py-6">
          <CreditCard className="h-8 w-8 text-gray-200 mx-auto mb-2" />
          <p className="text-xs text-gray-400">Saisissez le montant pour simuler votre emprunt</p>
        </div>
      )}
    </div>
  );
}
