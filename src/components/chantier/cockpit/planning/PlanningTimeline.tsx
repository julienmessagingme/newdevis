/**
 * PlanningTimeline — vue Gantt horizontale par semaines.
 * Barres colorées par lot, drag & drop HTML5 natif pour réordonner et redimensionner.
 * Split layout: left column (lot names) is sticky, right area (Gantt bars) scrolls horizontally.
 */
import { useState, useRef, useCallback, useMemo } from 'react';
import { Calendar, Loader2, AlertCircle, Users } from 'lucide-react';
import type { LotChantier } from '@/types/chantier-ia';
import { usePlanning } from '@/hooks/usePlanning';
import { formatDuration, getWeekLabels } from '@/lib/planningUtils';

// -- Couleurs par lot (cyclique) ----------------------------------------------

const LOT_COLORS = [
  { bg: 'bg-blue-500',    light: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
  { bg: 'bg-emerald-500', light: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  { bg: 'bg-amber-500',   light: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
  { bg: 'bg-violet-500',  light: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  { bg: 'bg-rose-500',    light: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-200' },
  { bg: 'bg-cyan-500',    light: 'bg-cyan-50',   text: 'text-cyan-700',   border: 'border-cyan-200' },
  { bg: 'bg-orange-500',  light: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  { bg: 'bg-indigo-500',  light: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
];

function getLotColor(index: number) {
  return LOT_COLORS[index % LOT_COLORS.length];
}

// -- Barre Gantt redimensionnable ---------------------------------------------

function GanttBar({ lot, color, left, width, weekWidth, onResize, onMove }: {
  lot: LotChantier;
  color: { bg: string; light: string; text: string; border: string };
  left: number;
  width: number;
  weekWidth: number;
  laneHeight: number;
  onResize: (deltaDays: number) => void;
  onMove: (deltaDays: number, laneDelta: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [interaction, setInteraction] = useState<'left' | 'right' | 'move' | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startWidthRef = useRef(0);
  const startLeftRef = useRef(0);

  const pxPerDay = weekWidth / 5;

  // Resize (bords gauche/droit)
  const handleResizeStart = useCallback((e: React.MouseEvent, side: 'left' | 'right') => {
    e.preventDefault();
    e.stopPropagation();
    setInteraction(side);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    startLeftRef.current = left;

    const onMouseMove = (ev: MouseEvent) => {
      if (!barRef.current) return;
      const dx = ev.clientX - startXRef.current;
      if (side === 'right') {
        barRef.current.style.width = `${Math.max(pxPerDay, startWidthRef.current + dx)}px`;
      } else {
        barRef.current.style.width = `${Math.max(pxPerDay, startWidthRef.current - dx)}px`;
        barRef.current.style.left = `${startLeftRef.current + dx}px`;
      }
    };
    const onMouseUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setInteraction(null);
      const deltaDays = Math.round((ev.clientX - startXRef.current) / pxPerDay);
      if (deltaDays !== 0) onResize(side === 'right' ? deltaDays : -deltaDays);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [width, left, pxPerDay, onResize]);

  // Move (centre de la barre = glisser horizontalement + verticalement pour changer de lane)
  const handleMoveStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setInteraction('move');
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    startLeftRef.current = left;

    const onMouseMove = (ev: MouseEvent) => {
      if (!barRef.current) return;
      const dx = ev.clientX - startXRef.current;
      const dy = ev.clientY - startYRef.current;
      barRef.current.style.left = `${Math.max(0, startLeftRef.current + dx)}px`;
      // Feedback visuel : translate verticalement la barre pendant le drag
      barRef.current.style.transform = `translateY(${dy}px)`;
    };
    const onMouseUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setInteraction(null);
      if (barRef.current) barRef.current.style.transform = '';
      const deltaDays = Math.round((ev.clientX - startXRef.current) / pxPerDay);
      const deltaY = ev.clientY - startYRef.current;
      // Changement de lane si drag vertical dépasse la moitié d'une lane
      const laneDelta = Math.round(deltaY / laneHeight);
      if (deltaDays !== 0 || laneDelta !== 0) onMove(deltaDays, laneDelta);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [left, pxPerDay, laneHeight, onMove]);

  const cursorCls = interaction === 'move' ? 'cursor-grabbing' : interaction ? 'cursor-col-resize' : 'cursor-grab';

  return (
    <div
      ref={barRef}
      className={`absolute top-2 h-7 rounded-lg ${color.bg} shadow-sm flex items-center text-white text-[11px] font-semibold truncate group/bar ${interaction ? '' : 'transition-all duration-200'} ${cursorCls}`}
      style={{
        left,
        width: Math.max(width, 24),
        minWidth: 24,
      }}
      title={`${lot.nom} — ${formatDuration(lot.duree_jours ?? 0)} · Glissez pour déplacer`}
      onMouseDown={handleMoveStart}
    >
      {/* Poignée gauche */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2.5 cursor-w-resize z-10 opacity-0 group-hover/bar:opacity-100 flex items-center justify-center transition-opacity"
        onMouseDown={(e) => handleResizeStart(e, 'left')}
      >
        <div className="w-0.5 h-3.5 bg-white/70 rounded" />
      </div>

      {/* Contenu */}
      <span className="truncate px-3 pointer-events-none select-none">
        {width > 80 ? `${lot.emoji} ${lot.nom}` : lot.emoji}
      </span>

      {/* Poignée droite */}
      <div
        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-e-resize z-10 opacity-0 group-hover/bar:opacity-100 flex items-center justify-center transition-opacity"
        onMouseDown={(e) => handleResizeStart(e, 'right')}
      >
        <div className="w-0.5 h-3.5 bg-white/70 rounded" />
      </div>
    </div>
  );
}

// -- Row heights (shared constants) -------------------------------------------

const LOT_ROW_HEIGHT = 44;

// -- Composant principal ------------------------------------------------------

interface Props {
  chantierId: string | null | undefined;
  token: string | null | undefined;
}

export default function PlanningTimeline({ chantierId, token }: Props) {
  const { lots, startDate, totalWeeks, loading, saving, updateLot, updateStartDate, updateEndDate, moveLot } = usePlanning(chantierId, token);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dateMode, setDateMode] = useState<null | 'start' | 'end'>(null);

  // Lots avec planning data, triés
  const planningLots = useMemo(() =>
    lots.filter(l => l.ordre_planning != null && l.duree_jours != null && l.duree_jours > 0)
      .sort((a, b) => (a.ordre_planning ?? 0) - (b.ordre_planning ?? 0)),
    [lots]
  );

  // Lots sans planning
  const unplannedLots = useMemo(() =>
    lots.filter(l => l.ordre_planning == null || l.duree_jours == null || l.duree_jours <= 0),
    [lots]
  );

  // Semaines labels
  const weeks = useMemo(() =>
    startDate ? getWeekLabels(startDate, Math.max(totalWeeks, 1) + 1) : [],
    [startDate, totalWeeks]
  );

  const WEEK_WIDTH = 96; // px par semaine

  // (Drag & drop reorder + édition inline durée supprimés — les barres du Gantt
  // gèrent maintenant directement drag, resize, et les lanes remplacent l'ordre manuel.)

  // -- Calcul position/largeur d'une barre -----------------------------------

  const getBarStyle = useCallback((lot: LotChantier) => {
    if (!startDate || !lot.date_debut || !lot.date_fin) return { left: 0, width: WEEK_WIDTH };
    const start = new Date(lot.date_debut);
    const end = new Date(lot.date_fin);
    const startOffset = (start.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000);
    const duration = (end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000);
    return {
      left: startOffset * WEEK_WIDTH,
      width: Math.max(duration * WEEK_WIDTH, WEEK_WIDTH * 0.5), // min 0.5 semaine visible
    };
  }, [startDate]);

  // -- Lanes (first-fit interval scheduling) ---------------------------------
  // Regroupe les lots qui se chaînent dans le temps sur une MÊME ligne visuelle.
  // Les lots qui se chevauchent (parallèles) vont sur des lignes différentes.
  // Algorithme : tri par date_debut, placement greedy sur la 1re lane libre.

  const lanes = useMemo(() => {
    const withDates = planningLots.filter(l => l.date_debut && l.date_fin);
    const withoutDates = planningLots.filter(l => !l.date_debut || !l.date_fin);
    const sorted = [...withDates].sort((a, b) =>
      (a.date_debut ?? '').localeCompare(b.date_debut ?? '')
    );

    const result: LotChantier[][] = [];
    for (const lot of sorted) {
      const lotStart = new Date(lot.date_debut!).getTime();
      let placed = false;
      for (const lane of result) {
        const lastEnd = new Date(lane[lane.length - 1].date_fin!).getTime();
        if (lastEnd <= lotStart) {
          lane.push(lot);
          placed = true;
          break;
        }
      }
      if (!placed) result.push([lot]);
    }

    // Lots sans dates : chacun sur sa propre lane en fin de liste
    for (const lot of withoutDates) result.push([lot]);
    return result;
  }, [planningLots]);

  // -- Drag vertical : déchaîner / rechaîner un lot ---------------------------
  // laneDelta > 0 (descend) : sortir le lot de sa chaîne. On force son date_debut
  // à la date_debut du premier lot de la lane actuelle → chevauchement → first-fit
  // le pousse sur une nouvelle lane (DÉCHAÎNÉ).
  // laneDelta < 0 (monte) : le lot rejoint une lane plus haute. Set son date_debut
  // = date_fin du dernier lot de la lane cible avant sa position actuelle (RECHAÎNÉ).
  const handleLotMoveWithLane = useCallback(
    (lot: LotChantier, currentLaneIdx: number, deltaDays: number, laneDelta: number) => {
      // Pas de changement de lane → simple move horizontal existant
      if (laneDelta === 0) {
        if (deltaDays !== 0) moveLot(lot.id, deltaDays);
        return;
      }

      if (!lot.date_debut || !lot.date_fin) return;

      const targetLaneIdx = currentLaneIdx + laneDelta;
      const currentLane = lanes[currentLaneIdx];
      if (!currentLane) return;

      // Calcul de la nouvelle date_debut
      let newStart: Date | null = null;

      if (laneDelta > 0) {
        // DÉCHAÎNER : démarrer en même temps qu'un autre lot pour forcer chevauchement
        const anchor = currentLane.find(l => l.id !== lot.id && l.date_debut)?.date_debut
          ?? lot.date_debut;
        newStart = new Date(anchor);
        if (deltaDays !== 0) newStart.setDate(newStart.getDate() + deltaDays);
      } else {
        // RECHAÎNER : rejoindre une lane plus haute, se chaîner après les lots qui y sont
        const targetLane = lanes[Math.max(0, targetLaneIdx)];
        if (targetLane && targetLane.length > 0) {
          const lotStart = new Date(lot.date_debut).getTime();
          const candidates = targetLane
            .filter(l => l.id !== lot.id && l.date_fin)
            .sort((a, b) => (a.date_fin ?? '').localeCompare(b.date_fin ?? ''));
          const after = [...candidates].reverse().find(l => new Date(l.date_fin!).getTime() <= lotStart);
          if (after) {
            newStart = new Date(after.date_fin!);
            if (deltaDays !== 0) newStart.setDate(newStart.getDate() + deltaDays);
          } else {
            const firstOfLane = candidates[0];
            if (firstOfLane?.date_debut) newStart = new Date(firstOfLane.date_debut);
          }
        }
      }

      if (!newStart) return;
      const duree = lot.duree_jours ?? 5;
      const newEnd = new Date(newStart);
      newEnd.setDate(newEnd.getDate() + duree);

      const newStartStr = newStart.toISOString().slice(0, 10);
      const newEndStr = newEnd.toISOString().slice(0, 10);
      updateLot(lot.id, { date_debut: newStartStr, date_fin: newEndStr });
    },
    [lanes, moveLot, updateLot]
  );

  // -- Loading state ----------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        <span className="ml-2 text-sm text-gray-500">Chargement du planning…</span>
      </div>
    );
  }

  // -- Date picker (partagé entre empty state et header) ----------------------

  const datePicker = dateMode && (
    <div className="bg-white rounded-2xl border border-blue-200 shadow-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-900">
          {dateMode === 'start' ? '📅 Date de début du chantier' : '🏁 Date de fin souhaitée'}
        </h3>
        <button onClick={() => setDateMode(null)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
      </div>
      <p className="text-sm text-gray-500">
        {dateMode === 'start'
          ? 'Le planning des intervenants sera calculé à partir de cette date.'
          : 'Le planning sera calculé en remontant depuis cette date. La date de début sera déduite automatiquement.'}
      </p>
      <input
        type="date"
        autoFocus
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setDateMode(null);
        }}
        onBlur={(e) => {
          if (!e.target.value) { setDateMode(null); return; }
          const d = new Date(e.target.value);
          if (dateMode === 'start') {
            updateStartDate(d);
          } else {
            updateEndDate(d);
          }
          setDateMode(null);
        }}
      />
      {dateMode === 'start' && (
        <button onClick={() => setDateMode('end')} className="text-xs text-blue-600 hover:underline">
          Je connais plutôt ma date de fin souhaitée →
        </button>
      )}
      {dateMode === 'end' && (
        <button onClick={() => setDateMode('start')} className="text-xs text-blue-600 hover:underline">
          ← Je connais plutôt ma date de début
        </button>
      )}
    </div>
  );

  // -- Empty state : pas de planning -----------------------------------------

  if (planningLots.length === 0 && !startDate) {
    return (
      <div className="space-y-4">
        {dateMode ? datePicker : (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
              <Calendar className="h-7 w-7 text-blue-400" />
            </div>
            <h3 className="font-bold text-gray-900 text-lg mb-2">Planifiez vos travaux</h3>
            <p className="text-sm text-gray-400 max-w-md mx-auto leading-relaxed mb-5">
              Renseignez une date pour que le planning des intervenants se calcule automatiquement.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => setDateMode('start')}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors"
              >
                <Calendar className="h-4 w-4" />
                Je connais ma date de début
              </button>
              <button
                onClick={() => setDateMode('end')}
                className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-xl px-5 py-2.5 text-sm border border-gray-200 transition-colors"
              >
                🏁 Je connais ma date de fin
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (planningLots.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
          <Calendar className="h-7 w-7 text-blue-400" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg mb-2">Planning en attente</h3>
        <p className="text-sm text-gray-400 max-w-md mx-auto leading-relaxed">
          Les durées d'intervention seront calculées automatiquement lors de la création du chantier avec l'IA.
        </p>
      </div>
    );
  }

  // -- Main render ------------------------------------------------------------

  return (
    <div className="space-y-4">

      {/* -- Header : date de début + stats ---------------------------------- */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Planning du chantier</p>
              <p className="text-lg font-bold text-gray-900">
                {totalWeeks} semaine{totalWeeks > 1 ? 's' : ''} · {planningLots.length} intervenant{planningLots.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Date de début/fin éditable */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDateMode('start')}
              className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              <Calendar className="h-3.5 w-3.5" />
              {startDate
                ? `Début : ${startDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`
                : 'Définir la date de début'
              }
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={() => setDateMode('end')}
              className="text-sm font-medium text-gray-500 hover:text-blue-600 transition-colors"
            >
              Modifier la date de fin
            </button>
            {saving && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          </div>
        </div>
      </div>

      {/* -- Date picker modal ----------------------------------------------- */}
      {datePicker}

      {/* -- Timeline Gantt (split layout) ----------------------------------- */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

        <div className="flex">
          {/* ====== LEFT: fixed column (lot names, sticky) ====== */}
          <div className="w-[200px] shrink-0 border-r border-gray-100 bg-white z-10 sticky left-0">
            {/* Header */}
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Intervenant</p>
            </div>

            {/* Lane label rows — 1 ligne par lane (chaînée) */}
            {lanes.map((lane, laneIdx) => {
              const isParallelLane = laneIdx > 0; // lanes 2+ sont forcément des lots // en parallèle de la lane 1
              return (
                <div
                  key={laneIdx}
                  className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                  style={{ height: LOT_ROW_HEIGHT }}
                >
                  <div className="px-3 py-2 flex items-center gap-2 h-full">
                    {isParallelLane && (
                      <span title="Interventions parallèles" className="shrink-0">
                        <Users className="h-3 w-3 text-violet-400" />
                      </span>
                    )}
                    <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                      {lane.map((lot, i) => (
                        <div key={lot.id} className="flex items-center gap-1 shrink-0 min-w-0">
                          <span className="text-sm shrink-0">{lot.emoji}</span>
                          <span
                            className="text-xs font-semibold text-gray-800 truncate max-w-[90px]"
                            title={`${lot.nom} (${formatDuration(lot.duree_jours ?? 0)})`}
                          >
                            {lot.nom}
                          </span>
                          {i < lane.length - 1 && <span className="text-gray-300 text-[10px]">→</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ====== RIGHT: scrollable Gantt area ====== */}
          <div ref={scrollRef} className="flex-1 overflow-x-auto min-w-0">
            <div style={{ minWidth: `${Math.max(weeks.length * WEEK_WIDTH, 300)}px` }}>
              {/* Week headers */}
              <div className="flex border-b border-gray-100">
                {weeks.map((w, i) => (
                  <div key={i} className="flex-none text-center border-r border-gray-50 py-2" style={{ width: WEEK_WIDTH }}>
                    <p className="text-xs font-bold text-gray-600">{w.label}</p>
                    <p className="text-[10px] text-gray-400">{w.date}</p>
                  </div>
                ))}
              </div>

              {/* Gantt bar rows — 1 ligne par lane, toutes les barres d'une lane côte à côte */}
              {lanes.map((lane, laneIdx) => (
                <div
                  key={laneIdx}
                  className="border-b border-gray-50 relative hover:bg-gray-50 transition-colors"
                  style={{ height: LOT_ROW_HEIGHT }}
                >
                  {/* Week grid lines */}
                  <div className="absolute inset-0 flex pointer-events-none">
                    {weeks.map((_, i) => (
                      <div key={i} className="flex-none border-r border-gray-50" style={{ width: WEEK_WIDTH }} />
                    ))}
                  </div>

                  {/* Toutes les barres de cette lane */}
                  {lane.map((lot) => {
                    const color = getLotColor(planningLots.indexOf(lot));
                    const barStyle = getBarStyle(lot);
                    return (
                      <GanttBar
                        key={lot.id}
                        lot={lot}
                        color={color}
                        left={barStyle.left}
                        width={barStyle.width}
                        weekWidth={WEEK_WIDTH}
                        laneHeight={LOT_ROW_HEIGHT}
                        onResize={(deltaDays) => {
                          const newDays = Math.max(1, Math.min(120, (lot.duree_jours ?? 5) + deltaDays));
                          if (newDays !== lot.duree_jours) updateLot(lot.id, { duree_jours: newDays });
                        }}
                        onMove={(deltaDays, laneDelta) => {
                          if (!lot.date_debut) return;
                          handleLotMoveWithLane(lot, laneIdx, deltaDays, laneDelta);
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer légende */}
        <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <p className="text-[10px] text-gray-400">
            Glissez horizontalement pour déplacer · Verticalement pour déchaîner · Tirez les bords pour la durée
          </p>
          {unplannedLots.length > 0 && (
            <p className="text-[10px] text-amber-500 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {unplannedLots.length} intervenant{unplannedLots.length > 1 ? 's' : ''} sans planning
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
