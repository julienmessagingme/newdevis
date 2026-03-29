/**
 * PlanningTimeline — vue Gantt horizontale par semaines.
 * Barres colorées par lot, drag & drop HTML5 natif pour réordonner et redimensionner.
 * Split layout: left column (lot names) is sticky, right area (Gantt bars) scrolls horizontally.
 */
import { useState, useRef, useCallback, useMemo } from 'react';
import { Calendar, GripVertical, ChevronLeft, ChevronRight, Loader2, AlertCircle, Users } from 'lucide-react';
import type { LotChantier } from '@/types/chantier-ia';
import { usePlanning } from '@/hooks/usePlanning';
import { formatDuration, getWeekNumber, getWeekLabels, getTotalWeeks } from '@/lib/planningUtils';

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
  onResize: (deltaDays: number) => void;
  onMove: (deltaDays: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [interaction, setInteraction] = useState<'left' | 'right' | 'move' | null>(null);
  const startXRef = useRef(0);
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

  // Move (centre de la barre = glisser horizontalement)
  const handleMoveStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setInteraction('move');
    startXRef.current = e.clientX;
    startLeftRef.current = left;

    const onMouseMove = (ev: MouseEvent) => {
      if (!barRef.current) return;
      const dx = ev.clientX - startXRef.current;
      barRef.current.style.left = `${Math.max(0, startLeftRef.current + dx)}px`;
    };
    const onMouseUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setInteraction(null);
      const deltaDays = Math.round((ev.clientX - startXRef.current) / pxPerDay);
      if (deltaDays !== 0) onMove(deltaDays);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [left, pxPerDay, onMove]);

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
const PARALLEL_BADGE_HEIGHT = 26;

// -- Composant principal ------------------------------------------------------

interface Props {
  chantierId: string | null | undefined;
  token: string | null | undefined;
  initialLots?: LotChantier[];
  initialStartDate?: string | null;
}

export default function PlanningTimeline({ chantierId, token }: Props) {
  const { lots, startDate, totalWeeks, loading, saving, updateLot, updateStartDate, updateEndDate, reorderLots, moveLot } = usePlanning(chantierId, token);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [editingDuration, setEditingDuration] = useState<string | null>(null);
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

  // -- Drag & drop handlers ---------------------------------------------------

  const handleDragStart = useCallback((e: React.DragEvent, lotId: string) => {
    setDraggedId(lotId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', lotId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === targetId) { setDraggedId(null); return; }

    // Réordonner : insérer sourceId à la position de targetId
    const ids = planningLots.map(l => l.id);
    const fromIdx = ids.indexOf(sourceId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) { setDraggedId(null); return; }

    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, sourceId);

    reorderLots(ids);
    setDraggedId(null);
  }, [planningLots, reorderLots]);

  const handleDragEnd = useCallback(() => setDraggedId(null), []);

  // -- Duration edit ----------------------------------------------------------

  const handleDurationChange = useCallback((lotId: string, newDays: number) => {
    if (newDays < 1) newDays = 1;
    if (newDays > 120) newDays = 120;
    updateLot(lotId, { duree_jours: newDays });
    setEditingDuration(null);
  }, [updateLot]);

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

  // -- Groupes parallèles pour l'affichage -----------------------------------

  const rows = useMemo(() => {
    const result: { lots: LotChantier[]; isParallel: boolean }[] = [];
    let i = 0;
    while (i < planningLots.length) {
      const lot = planningLots[i];
      if (lot.parallel_group != null) {
        const group = planningLots.filter(l => l.parallel_group === lot.parallel_group);
        result.push({ lots: group, isParallel: true });
        i += group.length;
      } else {
        result.push({ lots: [lot], isParallel: false });
        i++;
      }
    }
    return result;
  }, [planningLots]);

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

            {/* Lot label rows */}
            {rows.map((row, rowIdx) => (
              <div key={rowIdx}>
                {/* Badge groupe parallèle */}
                {row.isParallel && row.lots.length > 1 && (
                  <div
                    className="flex items-center gap-1.5 px-4 bg-violet-50 border-b border-violet-100"
                    style={{ height: PARALLEL_BADGE_HEIGHT }}
                  >
                    <Users className="h-3 w-3 text-violet-500" />
                    <span className="text-[10px] font-semibold text-violet-600 uppercase tracking-wider">
                      Interventions parallèles
                    </span>
                  </div>
                )}

                {row.lots.map((lot) => {
                  const weekStart = startDate && lot.date_debut ? getWeekNumber(new Date(lot.date_debut), startDate) : 0;
                  const weekEnd = startDate && lot.date_fin ? getWeekNumber(new Date(lot.date_fin), startDate) : 0;
                  const isDragged = draggedId === lot.id;

                  return (
                    <div
                      key={lot.id}
                      className={`border-b border-gray-50 transition-colors ${isDragged ? 'bg-blue-50 opacity-50' : 'hover:bg-gray-50'}`}
                      style={{ height: LOT_ROW_HEIGHT }}
                      draggable
                      onDragStart={(e) => handleDragStart(e, lot.id)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, lot.id)}
                      onDragEnd={handleDragEnd}
                    >
                      <div className="px-3 py-2.5 flex items-center gap-2 cursor-grab active:cursor-grabbing h-full">
                        <GripVertical className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                        <span className="text-base shrink-0">{lot.emoji}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-800 truncate">{lot.nom}</p>
                          <div className="flex items-center gap-2 text-[11px] text-gray-400">
                            <span>S{weekStart}–S{weekEnd}</span>
                            <span>·</span>
                            {editingDuration === lot.id ? (
                              <input
                                type="number"
                                autoFocus
                                min={1}
                                max={120}
                                defaultValue={lot.duree_jours ?? 5}
                                onBlur={(e) => handleDurationChange(lot.id, parseInt(e.target.value) || 5)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                  if (e.key === 'Escape') setEditingDuration(null);
                                }}
                                className="w-12 border border-blue-300 rounded px-1 py-0 text-[11px] text-center focus:ring-1 focus:ring-blue-500 outline-none"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingDuration(lot.id); }}
                                className="hover:text-blue-600 hover:underline transition-colors"
                              >
                                {formatDuration(lot.duree_jours ?? 0)}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
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

              {/* Gantt bar rows */}
              {rows.map((row, rowIdx) => (
                <div key={rowIdx}>
                  {/* Parallel group badge spacer (matches left column height) */}
                  {row.isParallel && row.lots.length > 1 && (
                    <div
                      className="bg-violet-50 border-b border-violet-100"
                      style={{ height: PARALLEL_BADGE_HEIGHT }}
                    />
                  )}

                  {row.lots.map((lot) => {
                    const color = getLotColor(planningLots.indexOf(lot));
                    const barStyle = getBarStyle(lot);
                    const isDragged = draggedId === lot.id;

                    return (
                      <div
                        key={lot.id}
                        className={`border-b border-gray-50 transition-colors relative ${isDragged ? 'bg-blue-50 opacity-50' : 'hover:bg-gray-50'}`}
                        style={{ height: LOT_ROW_HEIGHT }}
                        draggable
                        onDragStart={(e) => handleDragStart(e, lot.id)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, lot.id)}
                        onDragEnd={handleDragEnd}
                      >
                        {/* Week grid lines */}
                        <div className="absolute inset-0 flex pointer-events-none">
                          {weeks.map((_, i) => (
                            <div key={i} className="flex-none border-r border-gray-50" style={{ width: WEEK_WIDTH }} />
                          ))}
                        </div>

                        {/* Gantt bar — resizable + movable */}
                        <GanttBar
                          lot={lot}
                          color={color}
                          left={barStyle.left}
                          width={barStyle.width}
                          weekWidth={WEEK_WIDTH}
                          onResize={(deltaDays) => {
                            const newDays = Math.max(1, Math.min(120, (lot.duree_jours ?? 5) + deltaDays));
                            if (newDays !== lot.duree_jours) updateLot(lot.id, { duree_jours: newDays });
                          }}
                          onMove={(deltaDays) => {
                            if (!lot.date_debut || deltaDays === 0) return;
                            moveLot(lot.id, deltaDays);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer légende */}
        <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <p className="text-[10px] text-gray-400">
            Glissez les lignes pour réordonner · Tirez les bords des barres pour ajuster la durée
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
