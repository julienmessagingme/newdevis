/**
 * usePlanning — hook React pour la gestion du planning chantier.
 * Charge, met à jour et recalcule les dates des lots.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { LotChantier } from '@/types/chantier-ia';
import { computePlanningDates, computeStartDateFromEnd, getTotalWeeks, parseDate } from '@/lib/planningUtils';

interface PlanningState {
  lots: LotChantier[];
  startDate: Date | null;
  totalWeeks: number;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

export function usePlanning(chantierId: string | null | undefined, token: string | null | undefined) {
  const [state, setState] = useState<PlanningState>({
    lots: [], startDate: null, totalWeeks: 0, loading: true, saving: false, error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  // ── Fetch planning data ─────────────────────────────────────────────────
  const fetchPlanning = useCallback(async () => {
    if (!chantierId || !token) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setState(s => ({ ...s, loading: true, error: null }));

    try {
      const res = await fetch(`/api/chantier/${chantierId}/planning`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const sd = parseDate(data.dateDebutChantier);
      const lots: LotChantier[] = data.lots ?? [];
      const tw = getTotalWeeks(lots);

      setState({ lots, startDate: sd, totalWeeks: tw, loading: false, saving: false, error: null });
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      setState(s => ({ ...s, loading: false, error: e.message }));
    }
  }, [chantierId, token]);

  useEffect(() => { fetchPlanning(); }, [fetchPlanning]);

  // ── PATCH helper ────────────────────────────────────────────────────────
  const patchPlanning = useCallback(async (body: Record<string, unknown>) => {
    if (!chantierId || !token) return;
    setState(s => ({ ...s, saving: true }));

    try {
      const res = await fetch(`/api/chantier/${chantierId}/planning`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const sd = parseDate(data.dateDebutChantier);
      const lots: LotChantier[] = data.lots ?? [];
      const tw = getTotalWeeks(lots);

      setState({ lots, startDate: sd, totalWeeks: tw, loading: false, saving: false, error: null });
    } catch (e: any) {
      setState(s => ({ ...s, saving: false, error: e.message }));
    }
  }, [chantierId, token]);

  // ── Actions publiques ───────────────────────────────────────────────────

  /** Met à jour la durée / ordre / groupe parallèle d'un lot */
  const updateLot = useCallback((lotId: string, changes: { duree_jours?: number; ordre_planning?: number; parallel_group?: number | null }) => {
    // Optimistic update local
    setState(s => {
      const updated = s.lots.map(l => l.id === lotId ? { ...l, ...changes } : l);
      const recomputed = s.startDate ? computePlanningDates(updated, s.startDate) : updated;
      return { ...s, lots: recomputed, totalWeeks: getTotalWeeks(recomputed) };
    });
    // Persist
    patchPlanning({ lots: [{ id: lotId, ...changes }] });
  }, [patchPlanning]);

  /** Met à jour la date de début du chantier */
  const updateStartDate = useCallback((date: Date) => {
    setState(s => {
      const recomputed = computePlanningDates(s.lots, date);
      return { ...s, startDate: date, lots: recomputed, totalWeeks: getTotalWeeks(recomputed) };
    });
    patchPlanning({ dateDebutChantier: date.toISOString().split('T')[0] });
  }, [patchPlanning]);

  /** Met à jour la date de fin souhaitée → calcule la date de début en arrière */
  const updateEndDate = useCallback((endDate: Date) => {
    setState(s => {
      const computedStart = computeStartDateFromEnd(s.lots, endDate);
      const recomputed = computePlanningDates(s.lots, computedStart);
      return { ...s, startDate: computedStart, lots: recomputed, totalWeeks: getTotalWeeks(recomputed) };
    });
    patchPlanning({ dateDebutChantier: computeStartDateFromEnd(lots, endDate).toISOString().split('T')[0] });
  }, [patchPlanning, lots]);

  /** Réordonne les lots (drag & drop) */
  const reorderLots = useCallback((orderedIds: string[]) => {
    setState(s => {
      const updated = orderedIds.map((id, i) => {
        const lot = s.lots.find(l => l.id === id);
        return lot ? { ...lot, ordre_planning: i + 1 } : null;
      }).filter(Boolean) as LotChantier[];
      const recomputed = s.startDate ? computePlanningDates(updated, s.startDate) : updated;
      return { ...s, lots: recomputed, totalWeeks: getTotalWeeks(recomputed) };
    });
    patchPlanning({
      lots: orderedIds.map((id, i) => ({ id, ordre_planning: i + 1 })),
    });
  }, [patchPlanning]);

  return {
    ...state,
    updateLot,
    updateStartDate,
    updateEndDate,
    reorderLots,
    refetch: fetchPlanning,
  };
}
