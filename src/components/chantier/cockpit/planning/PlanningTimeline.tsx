/**
 * PlanningTimeline — vue Gantt horizontale par semaines.
 * Barres colorées par lot, drag & drop HTML5 natif pour réordonner et redimensionner.
 * Split layout: left column (lot names) is sticky, right area (Gantt bars) scrolls horizontally.
 */
import { useState, useRef, useCallback, useMemo } from 'react';
import { Calendar, Loader2, AlertCircle, Users, AlignLeft, Plus } from 'lucide-react';
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

// Hash stable depuis l'ID du lot → couleur permanente, indépendante de l'ordre.
function getLotColor(lotId: string) {
  let hash = 0;
  for (let i = 0; i < lotId.length; i++) {
    hash = ((hash << 5) - hash) + lotId.charCodeAt(i);
    hash |= 0;
  }
  return LOT_COLORS[Math.abs(hash) % LOT_COLORS.length];
}

// -- Barre Gantt redimensionnable ---------------------------------------------

function GanttBar({ lot, color, left, width, weekWidth, laneHeight, onResize, onMove }: {
  lot: LotChantier;
  color: { bg: string; light: string; text: string; border: string };
  left: number;
  width: number;
  weekWidth: number;
  laneHeight: number;
  onResize: (deltaDays: number) => void;
  /** targetLaneIdx : index absolu de la lane visée (null si pas de changement détecté).
   *  Conventions : 0..lanes.length-1 = lane existante, lanes.length = ghost row,
   *  negatif = pas détecté → parent utilise currentLaneIdx comme fallback. */
  onMove: (deltaDays: number, targetLaneIdx: number | null) => void;
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

    // pointer-events: none → la barre draggée est transparente aux events, ce
    // qui permet à elementFromPoint de trouver la row sous-jacente et pas la
    // barre elle-même.
    if (barRef.current) barRef.current.style.pointerEvents = 'none';

    // Fonction helper : détecte la row sous le curseur et met à jour le
    // surlignage visuel (une seule row mise en valeur à la fois).
    let lastHoveredRow: Element | null = null;
    const clearHover = () => {
      if (lastHoveredRow) {
        (lastHoveredRow as HTMLElement).style.backgroundColor = '';
        (lastHoveredRow as HTMLElement).style.outline = '';
        (lastHoveredRow as HTMLElement).style.outlineOffset = '';
        lastHoveredRow = null;
      }
    };
    const highlightRowUnderCursor = (cx: number, cy: number): Element | null => {
      const el = document.elementFromPoint(cx, cy);
      const row = el?.closest('[data-gantt-row]') ?? null;
      if (row === lastHoveredRow) return row;
      clearHover();
      if (row) {
        const isGhost = row.getAttribute('data-ghost') === 'true';
        (row as HTMLElement).style.backgroundColor = isGhost ? 'rgba(139, 92, 246, 0.18)' : 'rgba(59, 130, 246, 0.12)';
        (row as HTMLElement).style.outline = isGhost ? '2px dashed rgb(139, 92, 246)' : '2px solid rgb(59, 130, 246)';
        (row as HTMLElement).style.outlineOffset = '-2px';
        lastHoveredRow = row;
      }
      return row;
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!barRef.current) return;
      const dx = ev.clientX - startXRef.current;
      const dy = ev.clientY - startYRef.current;
      barRef.current.style.left = `${Math.max(0, startLeftRef.current + dx)}px`;
      barRef.current.style.transform = `translateY(${dy}px)`;
      highlightRowUnderCursor(ev.clientX, ev.clientY);
    };
    const onMouseUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setInteraction(null);
      if (barRef.current) {
        barRef.current.style.transform = '';
        barRef.current.style.pointerEvents = '';
      }
      const deltaDays = Math.round((ev.clientX - startXRef.current) / pxPerDay);

      const row = highlightRowUnderCursor(ev.clientX, ev.clientY);
      clearHover();

      let targetLaneIdx: number | null = null;
      if (row) {
        const idx = parseInt(row.getAttribute('data-lane-idx') ?? '-1', 10);
        if (!isNaN(idx) && idx >= 0) targetLaneIdx = idx;
      }

      if (deltaDays !== 0 || targetLaneIdx !== null) onMove(deltaDays, targetLaneIdx);
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
// Ghost row ("drop here") : plus haute pour un drop plus forgiving. Ne rentre
// pas dans le calcul de laneDelta côté drag (qui utilise LOT_ROW_HEIGHT), mais
// offre plus d'espace visuel pour atteindre le seuil laneDelta >= lanes.length.
const GHOST_ROW_HEIGHT = 56;

// -- Composant principal ------------------------------------------------------

interface Props {
  chantierId: string | null | undefined;
  token: string | null | undefined;
}

export default function PlanningTimeline({ chantierId, token }: Props) {
  const { lots, deps, startDate, totalWeeks, loading, saving, updateLot, updateStartDate, updateEndDate, applyDepsBatch, recompactPlanning } = usePlanning(chantierId, token);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dateMode, setDateMode] = useState<null | 'start' | 'end'>(null);

  // Lots affichés sur le Gantt : ceux qui ont une durée et des dates calculées
  const planningLots = useMemo(() =>
    lots.filter(l => l.duree_jours != null && l.duree_jours > 0 && l.date_debut && l.date_fin)
      .sort((a, b) => (a.date_debut ?? '').localeCompare(b.date_debut ?? '')),
    [lots]
  );

  // Lots sans données (pas de durée ou pas de date calculée)
  const unplannedLots = useMemo(() =>
    lots.filter(l => l.duree_jours == null || l.duree_jours <= 0 || !l.date_debut || !l.date_fin),
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

  // -- Drag D&D : réécrit le graphe de dépendances -----------------------------
  //
  // Le modèle CPM ne connaît QUE les dépendances. Le drop utilisateur est
  // interprété en termes de deps, avec TRANSFERT automatique pour préserver
  // la chaîne existante (les successeurs de X n'accompagnent PAS X dans son
  // déplacement — ils se rebindent sur les ex-prédécesseurs de X).
  //
  // Invariants :
  //  - Le lot déplacé X prend de nouveaux prédécesseurs (selon le drop).
  //  - Les ex-successeurs de X (qui avaient X dans leur deps) perdent X et
  //    héritent des ex-prédécesseurs de X → ils ne bougent pas visuellement.
  //  - Si X atterrit entre A et B dans une chaîne A→B, B remplace A par X.
  //
  // Tout est batché via applyDepsBatch (atomique côté serveur).
  const handleLotMoveWithLane = useCallback(
    (lot: LotChantier, currentLaneIdx: number, deltaDays: number, targetLaneIdxOrNull: number | null) => {
      const targetLaneIdx = targetLaneIdxOrNull ?? currentLaneIdx;
      if (deltaDays === 0 && targetLaneIdx === currentLaneIdx) return;

      const pxPerDay = WEEK_WIDTH / 5;
      const barStyle = getBarStyle(lot);
      const newCenterPx = barStyle.left + deltaDays * pxPerDay + barStyle.width / 2;

      // ── 1. Prépare les updates via une map (fusion idempotente) ───────────
      const finalDeps = new Map<string, Set<string>>();
      const touch = (id: string) => {
        if (!finalDeps.has(id)) finalDeps.set(id, new Set(deps.get(id) ?? []));
      };

      // ── 2. Détermine les NOUVEAUX prédécesseurs du lot déplacé ────────────
      const xOldPreds = Array.from(deps.get(lot.id) ?? []);

      let newXPreds: string[] = [];
      let targetSuccessor: LotChantier | null = null;
      let targetPredecessor: LotChantier | null = null;

      if (targetLaneIdx >= lanes.length) {
        // Ghost row → INDÉPENDANT : pas de deps, démarre à startDate.
        // C'est la SEULE façon de "sortir de la chaîne" et créer une nouvelle
        // side lane autonome.
        newXPreds = [];
      } else {
        // Lane existante (main OU side) → chain au predecessor sur cette lane
        // si présent. Permet de créer des sous-chaînes sur les side lanes.
        const targetLaneLots = (lanes[targetLaneIdx] ?? [])
          .filter(l => l.id !== lot.id)
          .sort((a, b) => (a.date_debut ?? '').localeCompare(b.date_debut ?? ''));
        for (const tl of targetLaneLots) {
          const tbs = getBarStyle(tl);
          const tCenter = tbs.left + tbs.width / 2;
          if (tCenter <= newCenterPx) {
            targetPredecessor = tl;
          } else {
            targetSuccessor = tl;
            break;
          }
        }
        // Side lane vide → independent. Sinon chaîne au predecessor trouvé.
        newXPreds = targetPredecessor ? [targetPredecessor.id] : [];
      }

      // ── 3. X récupère ses nouveaux prédécesseurs ──────────────────────────
      touch(lot.id);
      const xSet = finalDeps.get(lot.id)!;
      xSet.clear();
      for (const p of newXPreds) xSet.add(p);

      // ── 4. Transfère les ex-successeurs de X vers les ex-prédécesseurs de X
      //     Les lots qui dépendaient de X héritent des ex-deps de X → ils
      //     restent à la même position visuelle au lieu d'accompagner X.
      for (const other of lots) {
        if (other.id === lot.id) continue;
        const otherDeps = deps.get(other.id);
        if (otherDeps && otherDeps.has(lot.id)) {
          touch(other.id);
          const s = finalDeps.get(other.id)!;
          s.delete(lot.id);
          for (const p of xOldPreds) s.add(p);
        }
      }

      // ── 5. Rebind target successor ────────────────────────────────────────
      //   a) Si X s'insère entre A et B sur la même lane (A→B dep existant)
      //      → B dépend maintenant de X (remplace A).
      //   b) Si X s'insère AU DÉBUT de la lane (pas de predecessor, S = 1er
      //      lot) → S dépend maintenant de X → X devient la nouvelle tête.
      //      Sans ça, X et S ont tous deux deps=[] et démarrent à startDate :
      //      le lane assignment visuel les sépare ("S descend").
      if (targetPredecessor && targetSuccessor) {
        touch(targetSuccessor.id);
        const s = finalDeps.get(targetSuccessor.id)!;
        if (s.has(targetPredecessor.id)) {
          s.delete(targetPredecessor.id);
          s.add(lot.id);
        }
      } else if (!targetPredecessor && targetSuccessor) {
        touch(targetSuccessor.id);
        const s = finalDeps.get(targetSuccessor.id)!;
        s.add(lot.id);
      }

      // ── 6. Apply batch ────────────────────────────────────────────────────
      const batch = Array.from(finalDeps.entries()).map(([lotId, depSet]) => ({
        lotId,
        depIds: Array.from(depSet).filter(d => d !== lotId),
      }));
      if (batch.length === 0) return;
      applyDepsBatch(batch);
    },
    [lanes, deps, lots, applyDepsBatch, getBarStyle]
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
            <span className="text-gray-300">|</span>
            <button
              onClick={recompactPlanning}
              title="Recoller tous les lots à gauche (supprime les trous laissés par des lots déplacés ou supprimés)"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-blue-600 transition-colors"
            >
              <AlignLeft className="h-3.5 w-3.5" />
              Recompacter
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
                  data-gantt-row=""
                  data-lane-idx={laneIdx}
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

            {/* Ghost row : zone de drop pour créer une nouvelle lane parallèle */}
            <div
              data-gantt-row=""
              data-ghost="true"
              data-lane-idx={lanes.length}
              className="border-b border-dashed border-violet-200 bg-violet-50/40"
              style={{ height: GHOST_ROW_HEIGHT }}
            >
              <div className="px-3 h-full flex items-center gap-2 text-violet-500">
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span className="text-[11px] font-medium truncate">
                  Glissez un lot ici
                </span>
              </div>
            </div>
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
                  data-gantt-row=""
                  data-lane-idx={laneIdx}
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
                    const color = getLotColor(lot.id);
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
                        onMove={(deltaDays, targetLaneIdx) => {
                          if (!lot.date_debut) return;
                          handleLotMoveWithLane(lot, laneIdx, deltaDays, targetLaneIdx);
                        }}
                      />
                    );
                  })}
                </div>
              ))}

              {/* Ghost row Gantt : zone de drop pour créer une nouvelle side lane */}
              <div
                data-gantt-row=""
                data-ghost="true"
                data-lane-idx={lanes.length}
                className="relative border-b border-dashed border-violet-200 bg-violet-50/40"
                style={{ height: GHOST_ROW_HEIGHT }}
              >
                <div className="absolute inset-0 flex pointer-events-none">
                  {weeks.map((_, i) => (
                    <div key={i} className="flex-none border-r border-gray-50/60" style={{ width: WEEK_WIDTH }} />
                  ))}
                </div>
                <div className="relative h-full flex items-center justify-center text-violet-400 text-[11px] font-medium pointer-events-none">
                  Déposez un lot ici pour l'exécuter en parallèle
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer légende */}
        <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <p className="text-[10px] text-gray-400">
            Glissez horizontalement pour réordonner · Verticalement pour changer de lane · Tirez les bords pour la durée
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
