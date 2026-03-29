import { fmtK } from '@/lib/budgetHelpers';
import type { LotChantier } from '@/types/chantier-ia';

function BudgetExplication({ lots }: { lots: LotChantier[] }) {
  const lotsWithData = lots.filter(l => (l.main_oeuvre_ht ?? 0) > 0 || (l.materiaux_ht ?? 0) > 0);
  if (lotsWithData.length === 0) return null;

  const totalMO    = lotsWithData.reduce((s, l) => s + (l.main_oeuvre_ht ?? 0), 0);
  const totalMat   = lotsWithData.reduce((s, l) => s + (l.materiaux_ht   ?? 0), 0);
  const totalDivers= lotsWithData.reduce((s, l) => s + (l.divers_ht      ?? 0), 0);
  const total      = totalMO + totalMat + totalDivers || 1;

  const TAUX_HORAIRE = 55; // €/h moyen bâtiment TTC
  const totalHeures  = totalMO > 0 ? Math.round(totalMO / TAUX_HORAIRE) : 0;

  const pctMO    = Math.round((totalMO    / total) * 100);
  const pctMat   = Math.round((totalMat   / total) * 100);
  const pctDivers= 100 - pctMO - pctMat;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">

      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <span className="text-xl">🔍</span>
        <div>
          <h3 className="font-semibold text-gray-900">Comprendre votre budget</h3>
          <p className="text-xs text-gray-400">Main d'œuvre · Matériaux · Ce que vous payez vraiment</p>
        </div>
      </div>

      {/* Barre de répartition totale */}
      <div className="mb-5">
        <div className="flex h-4 rounded-full overflow-hidden gap-px">
          {pctMO   > 0 && <div className="bg-blue-500 transition-all duration-500"   style={{ width: `${pctMO}%`    }} />}
          {pctMat  > 0 && <div className="bg-amber-400 transition-all duration-500"  style={{ width: `${pctMat}%`   }} />}
          {pctDivers > 0 && <div className="bg-gray-200 transition-all duration-500" style={{ width: `${pctDivers}%` }} />}
        </div>
        <div className="flex items-center gap-4 mt-2.5 flex-wrap">
          {totalMO > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
              <span className="text-xs text-gray-500">Main d'œuvre</span>
              <span className="text-xs font-bold text-gray-800">{fmtK(totalMO)}</span>
              <span className="text-xs text-gray-400">({pctMO}%)</span>
            </div>
          )}
          {totalMat > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
              <span className="text-xs text-gray-500">Matériaux</span>
              <span className="text-xs font-bold text-gray-800">{fmtK(totalMat)}</span>
              <span className="text-xs text-gray-400">({pctMat}%)</span>
            </div>
          )}
          {totalDivers > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-gray-200 shrink-0" />
              <span className="text-xs text-gray-500">Divers</span>
              <span className="text-xs font-bold text-gray-800">{fmtK(totalDivers)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Encadré pédagogique */}
      <div className="bg-blue-50 rounded-xl px-4 py-3 mb-5 flex items-start gap-3">
        <span className="text-lg shrink-0">💡</span>
        <div>
          <p className="text-sm font-semibold text-blue-900 mb-1">Ce que cela signifie concrètement</p>
          <p className="text-xs text-blue-700 leading-relaxed">
            Sur votre budget estimé, environ <strong>{pctMO}%</strong> correspond au travail des artisans
            {totalHeures > 0 && <> — soit environ <strong>{totalHeures} heures de chantier</strong> au tarif moyen de {TAUX_HORAIRE} €/h</>}.
            Les <strong>{pctMat}%</strong> restants couvrent les matériaux
            (carrelage, plomberie, bois, peinture…) achetés pour votre projet.
            Cette répartition est tout à fait normale dans le bâtiment.
          </p>
        </div>
      </div>

      {/* Détail par intervenant */}
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Détail par intervenant</p>
      <div className="space-y-3">
        {lotsWithData.map(lot => {
          const mo      = lot.main_oeuvre_ht ?? 0;
          const mat     = lot.materiaux_ht   ?? 0;
          const div     = lot.divers_ht      ?? 0;
          const lotTot  = mo + mat + div || 1;
          const heures  = mo > 0 ? Math.round(mo / TAUX_HORAIRE) : 0;
          const pctMoL  = Math.round((mo  / lotTot) * 100);
          const pctMatL = Math.round((mat / lotTot) * 100);
          if (mo + mat + div === 0) return null;
          return (
            <div key={lot.id} className="bg-gray-50 rounded-xl p-4">
              {/* Ligne titre */}
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">{lot.emoji ?? '🔧'}</span>
                  <span className="text-sm font-semibold text-gray-800">{lot.nom}</span>
                </div>
                <span className="text-sm font-bold text-gray-700">{fmtK(mo + mat + div)}</span>
              </div>

              {/* Mini barre */}
              <div className="flex h-1.5 rounded-full overflow-hidden mb-3 gap-px">
                {pctMoL  > 0 && <div className="bg-blue-400"  style={{ width: `${pctMoL}%`  }} />}
                {pctMatL > 0 && <div className="bg-amber-300" style={{ width: `${pctMatL}%` }} />}
              </div>

              {/* Deux colonnes MO / Matériaux */}
              <div className="grid grid-cols-2 gap-2">
                {mo > 0 && (
                  <div className="bg-white rounded-lg px-3 py-2.5 border border-blue-50">
                    <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-1">
                      🛠 Main d'œuvre
                    </p>
                    <p className="text-sm font-extrabold text-gray-900">{fmtK(mo)}</p>
                    {heures > 0 && (
                      <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">
                        ≈ {heures} heure{heures > 1 ? 's' : ''} de travail
                        <span className="text-gray-300"> · {TAUX_HORAIRE} €/h moy.</span>
                      </p>
                    )}
                  </div>
                )}
                {mat > 0 && (
                  <div className="bg-white rounded-lg px-3 py-2.5 border border-amber-50">
                    <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-1">
                      🪵 Matériaux
                    </p>
                    <p className="text-sm font-extrabold text-gray-900">{fmtK(mat)}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">
                      fournitures &amp; équipements
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-gray-300 mt-4 text-center">
        Estimations indicatives · taux horaire moyen bâtiment : {TAUX_HORAIRE} €/h · hors TVA
      </p>
    </div>
  );
}

export default BudgetExplication;
