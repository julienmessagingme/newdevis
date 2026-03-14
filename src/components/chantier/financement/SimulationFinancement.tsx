import { useState, useMemo } from 'react';
import { CreditCard } from 'lucide-react';

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
  const [duree, setDuree] = useState(60);
  const [taux, setTaux] = useState(4);

  const mensualite = useMemo(
    () => calcMensualite(budgetTotal, taux, duree),
    [budgetTotal, taux, duree],
  );

  const coutTotal = mensualite * duree;
  const coutCredit = coutTotal - budgetTotal;

  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5 space-y-5">
      {/* Montant du projet */}
      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-sm">Montant du projet</span>
        <span className="text-white font-semibold text-sm">
          {budgetTotal.toLocaleString('fr-FR')} €
        </span>
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
          {Math.round(mensualite).toLocaleString('fr-FR')} <span className="text-lg">€/mois</span>
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
