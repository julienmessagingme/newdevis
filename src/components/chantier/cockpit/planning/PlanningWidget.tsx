/**
 * PlanningWidget — mini-timeline compacte pour la vue d'ensemble.
 * Affiche la durée totale et une barre colorée par lot.
 */
import { useMemo } from 'react';
import { Calendar, ChevronRight } from 'lucide-react';
import type { LotChantier } from '@/types/chantier-ia';
import { formatDuration, getWeekNumber, getTotalWeeks } from '@/lib/planningUtils';

interface Props {
  lots: LotChantier[];
  startDate: Date | null;
  onGoToPlanning: () => void;
}

// Couleurs cycliques (version allégée)
const COLORS = [
  'bg-blue-400', 'bg-emerald-400', 'bg-amber-400', 'bg-violet-400',
  'bg-rose-400', 'bg-cyan-400', 'bg-orange-400', 'bg-indigo-400',
];

export default function PlanningWidget({ lots, startDate, onGoToPlanning }: Props) {
  const planningLots = useMemo(() =>
    lots.filter(l => l.ordre_planning != null && l.duree_jours != null && l.duree_jours > 0 && l.date_debut && l.date_fin)
      .sort((a, b) => (a.ordre_planning ?? 0) - (b.ordre_planning ?? 0)),
    [lots]
  );

  const totalWeeks = useMemo(() => getTotalWeeks(planningLots), [planningLots]);

  if (planningLots.length === 0 || !startDate) return null;

  // Fin du planning
  const ends = planningLots.map(l => new Date(l.date_fin!).getTime());
  const latestEnd = new Date(Math.max(...ends));
  const totalMs = latestEnd.getTime() - startDate.getTime();

  return (
    <button
      onClick={onGoToPlanning}
      className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 text-left hover:shadow-md hover:scale-[1.005] transition-all duration-200 group"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <Calendar className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Planning</p>
            <p className="text-sm font-bold text-gray-900">
              {totalWeeks} semaine{totalWeeks > 1 ? 's' : ''} · {planningLots.length} intervenant{planningLots.length > 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-blue-600 group-hover:text-blue-700 transition-colors">
          <span className="text-xs font-semibold">Voir le planning</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </div>
      </div>

      {/* Mini-timeline */}
      <div className="h-8 w-full rounded-lg bg-gray-100 relative overflow-hidden flex">
        {planningLots.map((lot, i) => {
          if (!lot.date_debut || !lot.date_fin || totalMs <= 0) return null;
          const lotStart = new Date(lot.date_debut).getTime() - startDate.getTime();
          const lotEnd = new Date(lot.date_fin).getTime() - startDate.getTime();
          const left = (lotStart / totalMs) * 100;
          const width = ((lotEnd - lotStart) / totalMs) * 100;

          return (
            <div
              key={lot.id}
              className={`absolute top-1 bottom-1 rounded ${COLORS[i % COLORS.length]} opacity-80`}
              style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
              title={`${lot.emoji} ${lot.nom} — ${formatDuration(lot.duree_jours ?? 0)}`}
            />
          );
        })}
      </div>

      {/* Dates */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-gray-400">
          {startDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        </span>
        <span className="text-[10px] text-gray-400">
          {latestEnd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      </div>
    </button>
  );
}
