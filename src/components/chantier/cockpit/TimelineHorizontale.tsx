import type { EtapeRoadmap } from '@/types/chantier-ia';

interface TimelineHorizontaleProps {
  roadmap: EtapeRoadmap[];
  onEtapeClick?: (etape: EtapeRoadmap) => void;
}

export default function TimelineHorizontale({ roadmap, onEtapeClick }: TimelineHorizontaleProps) {
  if (!roadmap.length) return null;

  const currentIdx = roadmap.findIndex((e) => e.isCurrent);

  return (
    <div className="overflow-x-auto scrollbar-none">
      <div className="flex items-start min-w-max gap-0">
        {roadmap.map((etape, i) => {
          const isPast    = i < currentIdx;
          const isCurrent = etape.isCurrent;
          const isLast    = i === roadmap.length - 1;

          const circleClass = isCurrent
            ? 'bg-blue-600 border-blue-500 text-white ring-2 ring-blue-500/30 ring-offset-1 ring-offset-[#0a0f1e]'
            : isPast
            ? 'bg-emerald-500 border-emerald-500 text-white'
            : 'bg-transparent border-white/[0.12] text-slate-600';

          const labelClass = isCurrent
            ? 'text-blue-300 font-semibold'
            : isPast
            ? 'text-emerald-400'
            : 'text-slate-600';

          const connectorClass = isPast
            ? 'bg-emerald-500/50'
            : isCurrent
            ? 'bg-blue-500/30'
            : 'bg-white/[0.06]';

          return (
            <div key={i} className="flex items-start">
              {/* Étape */}
              <button
                onClick={() => onEtapeClick?.(etape)}
                className={`flex flex-col items-center gap-1.5 group transition-opacity ${
                  onEtapeClick ? 'cursor-pointer' : 'cursor-default'
                }`}
              >
                {/* Cercle */}
                <div
                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all shrink-0 ${circleClass} ${
                    onEtapeClick ? 'group-hover:scale-110' : ''
                  }`}
                >
                  {isPast ? (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    etape.numero
                  )}
                </div>

                {/* Label */}
                <span className={`text-[10px] leading-tight text-center max-w-[56px] transition-colors ${labelClass}`}>
                  {etape.nom}
                </span>

                {/* Date */}
                {isCurrent && (
                  <span className="text-[9px] text-blue-400/70 max-w-[56px] text-center leading-tight">
                    {etape.mois}
                  </span>
                )}
              </button>

              {/* Connecteur (sauf dernier) */}
              {!isLast && (
                <div className="flex items-center" style={{ marginTop: '0.875rem' }}>
                  <div className={`h-0.5 w-8 sm:w-12 rounded-full transition-all ${connectorClass}`} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
