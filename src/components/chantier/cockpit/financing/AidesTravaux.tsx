import { useState } from 'react';
import { Check, ChevronRight, RotateCcw, Info } from 'lucide-react';
import {
  WORK_TYPES_EFFY,
  type EffyWorkType,
  detectBracket,
  computeEffyAides,
  BRACKET_CFG,
  MPR_CAP,
  ECO_PTZ_MAX_AMOUNT,
  type EffyResult,
  fmtEur,
} from '@/lib/financingUtils';
import type { SourceKey } from '@/components/chantier/cockpit/FinancingSources';

export interface SimulationData {
  workType: EffyWorkType;
  cost: string;
  isOwner: boolean;
  householdSize: number;
  annualIncome: string;
  result: EffyResult;
}

export default function AidesTravaux({ onImportAides, initialSimulation, onSimulationSave }: {
  onImportAides: (values: Partial<Record<SourceKey, string>>) => void;
  initialSimulation?: SimulationData | null;
  onSimulationSave?: (data: SimulationData | null) => void;
}) {
  const [step,          setStep]          = useState<1 | 2 | 3>(initialSimulation ? 3 : 1);
  const [workType,      setWorkType]      = useState<EffyWorkType | null>(initialSimulation?.workType ?? null);
  const [cost,          setCost]          = useState(initialSimulation?.cost ?? '');
  const [isOwner,       setIsOwner]       = useState<boolean | null>(initialSimulation?.isOwner ?? null);
  const [householdSize, setHouseholdSize] = useState(initialSimulation?.householdSize ?? 2);
  const [annualIncome,  setAnnualIncome]  = useState(initialSimulation?.annualIncome ?? '');
  const [result,        setResult]        = useState<EffyResult | null>(initialSimulation?.result ?? null);

  const costNum   = parseFloat(cost.replace(/\s/g, '').replace(',', '.'));
  const incomeNum = parseFloat(annualIncome.replace(/\s/g, '').replace(',', '.'));
  const canStep2  = workType !== null && !isNaN(costNum) && costNum > 0;
  const canCalc   = isOwner !== null && !isNaN(incomeNum) && incomeNum > 0;

  function goStep2() { if (canStep2) setStep(2); }

  function calculate() {
    if (!workType || !canCalc) return;
    const bracket = detectBracket(householdSize, incomeNum);
    const res = computeEffyAides(workType, bracket, costNum, isOwner!);
    setResult(res);
    setStep(3);
    onSimulationSave?.({ workType, cost, isOwner: isOwner!, householdSize, annualIncome, result: res });
  }

  function reset() {
    setStep(1); setWorkType(null); setCost(''); setIsOwner(null);
    setHouseholdSize(2); setAnnualIncome(''); setResult(null);
    onSimulationSave?.(null);
  }

  const ProgressBar = () => (
    <div className="flex items-center gap-1.5 mb-5">
      {([1, 2, 3] as const).map(s => (
        <div key={s} className="flex items-center gap-1.5 flex-1">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-all ${
            step > s  ? 'bg-emerald-500 text-white' :
            step === s ? 'bg-blue-600 text-white ring-4 ring-blue-100' :
            'bg-gray-100 text-gray-400'
          }`}>
            {step > s ? <Check className="h-3 w-3" /> : s}
          </div>
          {s < 3 && <div className={`flex-1 h-0.5 rounded-full transition-all ${step > s ? 'bg-emerald-400' : 'bg-gray-100'}`} />}
        </div>
      ))}
    </div>
  );

  // ── Étape 3 : résultats ──
  if (step === 3 && result) {
    const wt = WORK_TYPES_EFFY.find(w => w.key === workType);
    const bc = BRACKET_CFG[result.bracket];
    return (
      <div className="space-y-4">
        <ProgressBar />
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-gray-800">{wt?.emoji} {wt?.label} · {fmtEur(costNum)}</p>
            <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border mt-1 ${bc.bg} ${bc.text} ${bc.border}`}>
              {bc.label}
            </span>
          </div>
          <button type="button" onClick={reset}
            className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 shrink-0">
            <RotateCcw className="h-3 w-3" /> Modifier
          </button>
        </div>

        <div className={`rounded-2xl p-4 text-center ${result.savingsPct > 0 ? 'bg-gradient-to-br from-emerald-500 to-blue-600' : 'bg-gray-100'}`}>
          {result.savingsPct > 0 ? (
            <>
              <p className="text-xs font-bold text-white/70 uppercase tracking-wider mb-1">Économie estimée</p>
              <p className="text-4xl font-extrabold text-white leading-none">{fmtEur(result.total)}</p>
              <p className="text-sm text-white/80 mt-1">soit {result.savingsPct} % du coût des travaux</p>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="bg-white/15 rounded-xl p-2.5">
                  <p className="text-[10px] text-white/70 mb-0.5">Reste à charge</p>
                  <p className="text-lg font-extrabold text-white">{fmtEur(result.reste)}</p>
                </div>
                <div className="bg-white/15 rounded-xl p-2.5">
                  <p className="text-[10px] text-white/70 mb-0.5">Aides directes</p>
                  <p className="text-lg font-extrabold text-white">{fmtEur(result.total)}</p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm font-semibold text-gray-500 py-2">Ces travaux ne sont pas éligibles aux aides énergétiques</p>
          )}
        </div>

        <div className="space-y-2.5">
          <div className={`rounded-xl border p-3.5 ${result.maprimeEligible ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-100'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">🟢</span>
                <span className={`text-xs font-bold ${result.maprimeEligible ? 'text-green-800' : 'text-gray-400'}`}>MaPrimeRénov'</span>
                {result.maprimeEligible && <span className="text-[10px] font-semibold bg-green-200 text-green-800 px-1.5 py-0.5 rounded-full">Subvention État</span>}
              </div>
              <span className={`text-sm font-extrabold ${result.maprimeEligible ? 'text-green-700' : 'text-gray-300'}`}>
                {result.maprimeEligible ? `~${fmtEur(result.maprime)}` : 'Non éligible'}
              </span>
            </div>
            {result.maprimeEligible && (
              <p className="text-[10px] text-gray-500 mt-1.5 ml-6">
                Taux {Math.round(result.maprimeRate * 100)} % · plafond {fmtEur(MPR_CAP[workType!])} · artisan RGE requis
              </p>
            )}
            {!result.maprimeEligible && !isOwner && (
              <p className="text-[10px] text-amber-600 mt-1.5 ml-6">⚠ Réservée aux propriétaires occupants</p>
            )}
          </div>

          <div className={`rounded-xl border p-3.5 ${result.cee > 0 ? 'bg-yellow-50 border-yellow-100' : 'bg-gray-50 border-gray-100'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">💡</span>
                <span className={`text-xs font-bold ${result.cee > 0 ? 'text-yellow-800' : 'text-gray-400'}`}>CEE</span>
                {result.cee > 0 && <span className="text-[10px] font-semibold bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded-full">Cumulable MPR</span>}
              </div>
              <span className={`text-sm font-extrabold ${result.cee > 0 ? 'text-yellow-700' : 'text-gray-300'}`}>
                {result.cee > 0 ? `~${fmtEur(result.cee)}` : '—'}
              </span>
            </div>
            {result.cee > 0 && (
              <p className="text-[10px] text-gray-500 mt-1.5 ml-6">Prime versée par les fournisseurs d'énergie (Engie, EDF…)</p>
            )}
          </div>

          <div className={`rounded-xl border p-3.5 ${result.ecoPtzEligible ? 'bg-violet-50 border-violet-100' : 'bg-gray-50 border-gray-100'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">🏦</span>
                <span className={`text-xs font-bold ${result.ecoPtzEligible ? 'text-violet-800' : 'text-gray-400'}`}>Éco-PTZ</span>
                {result.ecoPtzEligible && <span className="text-[10px] font-semibold bg-violet-200 text-violet-800 px-1.5 py-0.5 rounded-full">0 % d'intérêts</span>}
              </div>
              <span className={`text-sm font-extrabold ${result.ecoPtzEligible ? 'text-violet-700' : 'text-gray-300'}`}>
                {result.ecoPtzEligible ? `jusqu'à ${fmtEur(ECO_PTZ_MAX_AMOUNT)}` : 'Non éligible'}
              </span>
            </div>
            {result.ecoPtzEligible && (
              <p className="text-[10px] text-gray-500 mt-1.5 ml-6">Prêt sans intérêt pour financer le reste à charge — jusqu'à 20 ans</p>
            )}
          </div>
        </div>

        {/* Bouton import vers Sources de financement */}
        {result.total > 0 && (
          <button
            type="button"
            onClick={() => onImportAides({
              maprime: result.maprimeEligible && result.maprime > 0 ? String(Math.round(result.maprime)) : '',
              cee:     result.cee > 0 ? String(Math.round(result.cee)) : '',
            })}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-sm rounded-xl px-4 py-3 transition-colors shadow-sm"
          >
            <Check className="h-4 w-4" />
            Importer vers Sources de financement →
          </button>
        )}

        <p className="text-[10px] text-gray-400 text-center leading-relaxed pt-2 border-t border-gray-50">
          Simulation indicative 2025 — barème ANAH. Montants soumis à conditions (artisan RGE, logement &gt; 2 ans, résidence principale).
          {' '}Conseiller France Rénov'{' '}<strong>0 808 800 700</strong> (gratuit).
        </p>
      </div>
    );
  }

  // ── Étape 2 : profil ──
  if (step === 2) {
    const previewBracket = !isNaN(incomeNum) && incomeNum > 0 ? detectBracket(householdSize, incomeNum) : null;
    const pbc = previewBracket ? BRACKET_CFG[previewBracket] : null;
    return (
      <div className="space-y-5">
        <ProgressBar />
        <div>
          <p className="text-sm font-bold text-gray-800 mb-0.5">Votre profil</p>
          <p className="text-[11px] text-gray-400">Pour calculer votre tranche de revenus ANAH</p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-gray-600">Vous êtes…</p>
          <div className="grid grid-cols-2 gap-2">
            {([{ v: true, label: 'Propriétaire', emoji: '🏠' }, { v: false, label: 'Locataire', emoji: '🔑' }] as const).map(o => (
              <button key={String(o.v)} type="button" onClick={() => setIsOwner(o.v)}
                className={`flex items-center gap-2 px-3 py-3 rounded-xl border text-left transition-all ${
                  isOwner === o.v ? 'bg-blue-50 border-blue-300 text-blue-800 shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:border-blue-200'
                }`}>
                <span className="text-lg">{o.emoji}</span>
                <span className="text-xs font-semibold">{o.label}</span>
              </button>
            ))}
          </div>
          {isOwner === false && (
            <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              ⚠ MaPrimeRénov' est réservée aux propriétaires. Vous pouvez toutefois bénéficier des CEE et de l'Éco-PTZ.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-gray-600">Personnes dans le foyer fiscal</p>
          <div className="flex gap-2">
            {([1, 2, 3, 4, 5] as const).map(n => (
              <button key={n} type="button" onClick={() => setHouseholdSize(n)}
                className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                  householdSize === n ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                }`}>
                {n === 5 ? '5+' : n}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-bold text-gray-600">Revenu fiscal de référence annuel du foyer</p>
            <div className="relative group/rfr">
              <Info className="h-3.5 w-3.5 text-gray-400 hover:text-blue-500 cursor-help transition-colors" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-gray-900 text-white text-[11px] leading-relaxed rounded-xl px-3.5 py-3 shadow-xl opacity-0 group-hover/rfr:opacity-100 pointer-events-none transition-opacity z-50">
                <p className="font-semibold mb-1.5">📄 Où le trouver ?</p>
                <p className="text-gray-300 mb-2">Sur votre <span className="text-white font-medium">avis d'imposition</span>, ligne <span className="text-white font-medium">« Revenu fiscal de référence »</span> en page 1 (en bas à gauche).</p>
                <p className="font-semibold mb-1">📅 Quelle année ?</p>
                <p className="text-gray-300">ANAH utilise l'avis <span className="text-white font-medium">N-2</span> (ex : pour une demande en 2025 → avis 2023 sur revenus 2022). En cas de doute, prenez le dernier avis reçu.</p>
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
            <input
              type="text"
              inputMode="decimal"
              value={annualIncome}
              onChange={e => setAnnualIncome(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && canCalc) calculate(); }}
              placeholder="ex : 32 000"
              className="flex-1 bg-transparent text-sm font-semibold text-gray-900 outline-none placeholder:text-gray-300 placeholder:font-normal"
            />
            <span className="text-xs font-bold text-gray-400 shrink-0">€ / an</span>
          </div>
          {pbc && (
            <p className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border ${pbc.bg} ${pbc.text} ${pbc.border}`}>
              Tranche estimée : {pbc.label}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={() => setStep(1)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 font-semibold bg-white border border-gray-200 rounded-xl px-4 py-2.5 transition-colors">
            ← Retour
          </button>
          <button type="button" onClick={calculate} disabled={!canCalc}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
            <ChevronRight className="h-4 w-4" />
            Calculer mes aides
          </button>
        </div>
      </div>
    );
  }

  // ── Étape 1 : travaux + coût ──
  return (
    <div className="space-y-5">
      <ProgressBar />
      <div>
        <p className="text-sm font-bold text-gray-800 mb-0.5">Vos travaux</p>
        <p className="text-[11px] text-gray-400">Estimez vos droits à MaPrimeRénov', CEE et Éco-PTZ en 1 minute</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold text-gray-600">Type de travaux</p>
        <div className="grid grid-cols-2 gap-2">
          {WORK_TYPES_EFFY.map(wt => (
            <button key={wt.key} type="button" onClick={() => setWorkType(wt.key)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all ${
                workType === wt.key
                  ? 'bg-blue-50 border-blue-300 text-blue-800 shadow-sm'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-blue-200 hover:bg-blue-50/40'
              }`}>
              <span className="text-base shrink-0">{wt.emoji}</span>
              <div className="min-w-0">
                <p className={`text-xs font-semibold leading-tight ${workType === wt.key ? 'text-blue-800' : 'text-gray-700'}`}>{wt.label}</p>
                <p className="text-[10px] text-gray-400 leading-tight truncate">{wt.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold text-gray-600">Coût estimé des travaux (TTC)</p>
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
          <input
            type="text"
            inputMode="decimal"
            value={cost}
            onChange={e => setCost(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && canStep2) goStep2(); }}
            placeholder="ex : 15 000"
            className="flex-1 bg-transparent text-sm font-semibold text-gray-900 outline-none placeholder:text-gray-300 placeholder:font-normal"
          />
          <span className="text-xs font-bold text-gray-400 shrink-0">€</span>
        </div>
      </div>

      <button type="button" onClick={goStep2} disabled={!canStep2}
        className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
        <ChevronRight className="h-4 w-4" />
        Suivant — Mon profil
      </button>
    </div>
  );
}
