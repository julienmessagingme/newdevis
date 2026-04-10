import { useState, useMemo, useRef, useEffect } from 'react';
import { Pencil, RotateCcw } from 'lucide-react';

interface SimulationFinancementProps {
  budgetTotal: number;
}

function calcMensualite(montant: number, tauxAnnuel: number, dureeMois: number): number {
  if (montant <= 0 || dureeMois <= 0) return 0;
  const t = tauxAnnuel / 100 / 12;
  if (t === 0) return montant / dureeMois;
  return montant * (t / (1 - Math.pow(1 + t, -dureeMois)));
}

export default function SimulationFinancement({ budgetTotal }: SimulationFinancementProps) {
  const [duree, setDuree]       = useState(60);
  const [taux, setTaux]         = useState(4);
  const [montant, setMontant]   = useState(budgetTotal);
  const [editing, setEditing]   = useState(false);
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Si budgetTotal change (rechargement), resync le montant
  useEffect(() => { setMontant(budgetTotal); }, [budgetTotal]);

  const startEdit = () => {
    setInputVal(String(montant));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitEdit = () => {
    const parsed = parseInt(inputVal.replace(/\s/g, ''), 10);
    if (!isNaN(parsed) && parsed > 0) setMontant(parsed);
    setEditing(false);
  };

  const mensualite = useMemo(
    () => calcMensualite(montant, taux, duree),
    [montant, taux, duree],
  );

  const mensualiteArrondie = Math.round(mensualite);
  const coutTotal  = mensualiteArrondie * duree;
  const coutCredit = coutTotal - montant;
  const isModified = montant !== budgetTotal;

  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5 space-y-5">
      {/* Montant du projet — éditable */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-slate-400 text-sm shrink-0">Montant à financer</span>

        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              type="number"
              inputMode="decimal"
              min={1000}
              step={500}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit();
                if (e.key === 'Escape') setEditing(false);
              }}
              className="w-28 bg-white/10 border border-blue-400/50 rounded-lg px-2 py-0.5
                         text-white font-semibold text-sm text-right focus:outline-none
                         focus:border-blue-400 [appearance:textfield]
                         [&::-webkit-outer-spin-button]:appearance-none
                         [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-white text-sm font-semibold">€</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={startEdit}
            className="flex items-center gap-1.5 group"
            title="Modifier le montant"
          >
            <span className={`font-semibold text-sm ${isModified ? 'text-blue-300' : 'text-white'}`}>
              {montant.toLocaleString('fr-FR')} €
            </span>
            <Pencil className="h-3 w-3 text-slate-500 group-hover:text-blue-400 transition-colors" />
          </button>
        )}

        {/* Bouton reset si montant modifié */}
        {isModified && !editing && (
          <button
            type="button"
            onClick={() => setMontant(budgetTotal)}
            title="Remettre l'estimation initiale"
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Durée */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-slate-400 text-sm">Durée du crédit</label>
          <span className="text-blue-300 font-semibold text-sm">{duree} mois</span>
        </div>
        <input
          type="range"
          min={24}
          max={120}
          step={6}
          value={duree}
          onChange={(e) => setDuree(Number(e.target.value))}
          className="w-full accent-blue-500 cursor-pointer"
        />
        <div className="flex justify-between text-xs text-slate-600">
          <span>24 mois</span>
          <span>120 mois</span>
        </div>
      </div>

      {/* Taux */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-slate-400 text-sm">Taux annuel indicatif</label>
          <span className="text-blue-300 font-semibold text-sm">{taux.toFixed(1)} %</span>
        </div>
        <input
          type="range"
          min={3}
          max={6}
          step={0.1}
          value={taux}
          onChange={(e) => setTaux(Number(e.target.value))}
          className="w-full accent-blue-500 cursor-pointer"
        />
        <div className="flex justify-between text-xs text-slate-600">
          <span>3 %</span>
          <span>6 %</span>
        </div>
      </div>

      {/* Résultat */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-center">
        <p className="text-slate-400 text-xs mb-1">Mensualité estimée</p>
        <p className="text-blue-300 text-3xl font-display font-bold">
          {mensualiteArrondie.toLocaleString('fr-FR')} <span className="text-lg">€/mois</span>
        </p>
        <div className="mt-3 flex justify-center gap-6 text-xs text-slate-500">
          <span>
            Coût total :{' '}
            <span className="text-slate-300 font-medium">
              {Math.round(coutTotal).toLocaleString('fr-FR')} €
            </span>
          </span>
          <span>
            Coût du crédit :{' '}
            <span className="text-slate-300 font-medium">
              +{Math.round(coutCredit).toLocaleString('fr-FR')} €
            </span>
          </span>
        </div>
      </div>

      <p className="text-slate-600 text-xs text-center">
        Simulation indicative — hors assurance emprunteur et frais de dossier.
        Consultez votre banque pour une offre personnalisée.
      </p>
    </div>
  );
}
