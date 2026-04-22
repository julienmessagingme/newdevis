/**
 * usePlanning — hook React pour la gestion du planning chantier.
 * Source de vérité : ordre_planning + parallel_group + duree_jours.
 * Les dates date_debut/date_fin sont toujours DÉRIVÉES via computePlanningDates.
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

  // Helper : recompute local lots avec la startDate courante
  const recomputeLocal = (lots: LotChantier[], startDate: Date | null) =>
    startDate ? computePlanningDates(lots, startDate) : lots;

  // ── Actions publiques ───────────────────────────────────────────────────

  /** Met à jour la durée / ordre / groupe parallèle d'un lot.
   *  Déclenche un recompute global des dates côté serveur (cohérence BDD). */
  const updateLot = useCallback((lotId: string, changes: { duree_jours?: number; ordre_planning?: number; parallel_group?: number | null }) => {
    setState(s => {
      const updated = s.lots.map(l => l.id === lotId ? { ...l, ...changes } : l);
      const recomputed = recomputeLocal(updated, s.startDate);
      return { ...s, lots: recomputed, totalWeeks: getTotalWeeks(recomputed) };
    });
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
    let computedStartStr = '';
    setState(s => {
      const computedStart = computeStartDateFromEnd(s.lots, endDate);
      computedStartStr = computedStart.toISOString().split('T')[0];
      const recomputed = computePlanningDates(s.lots, computedStart);
      return { ...s, startDate: computedStart, lots: recomputed, totalWeeks: getTotalWeeks(recomputed) };
    });
    if (computedStartStr) patchPlanning({ dateDebutChantier: computedStartStr });
  }, [patchPlanning]);

  /** Réordonne globalement les lots via une liste d'IDs (drag & drop legacy) */
  const reorderLots = useCallback((orderedIds: string[]) => {
    setState(s => {
      const updated = orderedIds.map((id, i) => {
        const lot = s.lots.find(l => l.id === id);
        return lot ? { ...lot, ordre_planning: i + 1 } : null;
      }).filter(Boolean) as LotChantier[];
      const recomputed = recomputeLocal(updated, s.startDate);
      return { ...s, lots: recomputed, totalWeeks: getTotalWeeks(recomputed) };
    });
    patchPlanning({
      lots: orderedIds.map((id, i) => ({ id, ordre_planning: i + 1 })),
    });
  }, [patchPlanning]);

  /** Permute l'ordre_planning de 2 lots (drag horizontal dans une même lane) */
  const swapOrdre = useCallback((lotIdA: string, lotIdB: string) => {
    let updates: { id: string; ordre_planning: number }[] = [];
    setState(s => {
      const a = s.lots.find(l => l.id === lotIdA);
      const b = s.lots.find(l => l.id === lotIdB);
      if (!a || !b || a.ordre_planning == null || b.ordre_planning == null) return s;
      const newA = { ...a, ordre_planning: b.ordre_planning };
      const newB = { ...b, ordre_planning: a.ordre_planning };
      updates = [
        { id: lotIdA, ordre_planning: newA.ordre_planning! },
        { id: lotIdB, ordre_planning: newB.ordre_planning! },
      ];
      const updated = s.lots.map(l => l.id === lotIdA ? newA : (l.id === lotIdB ? newB : l));
      const recomputed = recomputeLocal(updated, s.startDate);
      return { ...s, lots: recomputed, totalWeeks: getTotalWeeks(recomputed) };
    });
    if (updates.length === 2) patchPlanning({ lots: updates });
  }, [patchPlanning]);

  /** Change le parallel_group d'un lot (drag vertical entre lanes).
   *  newPg = null → main lane (séquentiel)
   *  newPg = number → groupe parallèle existant ou nouveau. */
  const setLotPg = useCallback((lotId: string, newPg: number | null) => {
    setState(s => {
      const updated = s.lots.map(l => l.id === lotId ? { ...l, parallel_group: newPg } : l);
      const recomputed = recomputeLocal(updated, s.startDate);
      return { ...s, lots: recomputed, totalWeeks: getTotalWeeks(recomputed) };
    });
    patchPlanning({ lots: [{ id: lotId, parallel_group: newPg }] });
  }, [patchPlanning]);

  /** Déplace un lot à un rang précis (1-indexed) dans la séquence triée,
   *  + optionnellement change son parallel_group.
   *
   *  Approche : reconstruire la liste globale des lots dans l'ordre voulu, puis
   *  renuméroter ordre_planning de 1 à N. Plus robuste que "shift intermédiaires"
   *  car insensible aux trous et aux égalités d'ordre.
   *
   *  Exemple : `moveLotTo(plombier, null, 3)` → plombier devient le 3e lot
   *  dans la séquence main lane, les autres décalés en conséquence. */
  const moveLotTo = useCallback((lotId: string, newPg: number | null | undefined, targetRank: number) => {
    let updates: Array<{ id: string; ordre_planning?: number; parallel_group?: number | null }> = [];
    setState(s => {
      const lot = s.lots.find(l => l.id === lotId);
      if (!lot) return s;

      // Autres lots avec planning, triés par ordre_planning courant (stable)
      const others = s.lots
        .filter(l => l.id !== lotId && l.ordre_planning != null)
        .sort((a, b) => (a.ordre_planning ?? 0) - (b.ordre_planning ?? 0));

      // Insère le lot déplacé à la position cible dans la liste
      const insertIdx = Math.max(0, Math.min(targetRank - 1, others.length));
      const reordered = [...others.slice(0, insertIdx), lot, ...others.slice(insertIdx)];

      // Construit le nouveau state avec ordres renumérotés 1..N
      const nextLots = s.lots.map(l => ({ ...l }));
      reordered.forEach((orderedLot, i) => {
        const target = nextLots.find(l => l.id === orderedLot.id);
        if (target) target.ordre_planning = i + 1;
      });

      // Applique le nouveau pg au lot déplacé si demandé
      if (newPg !== undefined) {
        const movedLot = nextLots.find(l => l.id === lotId)!;
        movedLot.parallel_group = newPg ?? null;
      }

      // Construit le batch d'updates (lots réellement modifiés)
      updates = [];
      for (const newLot of nextLots) {
        const orig = s.lots.find(l => l.id === newLot.id);
        if (!orig) continue;
        const u: { id: string; ordre_planning?: number; parallel_group?: number | null } = { id: newLot.id };
        let touched = false;
        if (orig.ordre_planning !== newLot.ordre_planning && newLot.ordre_planning != null) {
          u.ordre_planning = newLot.ordre_planning;
          touched = true;
        }
        if (orig.parallel_group !== newLot.parallel_group) {
          u.parallel_group = newLot.parallel_group ?? null;
          touched = true;
        }
        if (touched) updates.push(u);
      }

      const recomputed = recomputeLocal(nextLots, s.startDate);
      return { ...s, lots: recomputed, totalWeeks: getTotalWeeks(recomputed) };
    });
    if (updates.length > 0) patchPlanning({ lots: updates });
  }, [patchPlanning]);

  /** Parallélise un lot avec un "partner" de la main lane — crée une side lane.
   *  Si le partner a pg=null, on crée un nouveau pg partagé (update des 2 lots).
   *  Si le partner a déjà un pg, on y rattache le lot déplacé.
   *  Le lot déplacé prend ordre = partner.ordre + 1 (consécutif → même groupe). */
  const parallelizeWith = useCallback((lotId: string, partnerId: string) => {
    let updates: Array<{ id: string; ordre_planning?: number; parallel_group?: number | null }> = [];
    setState(s => {
      const lot = s.lots.find(l => l.id === lotId);
      const partner = s.lots.find(l => l.id === partnerId);
      if (!lot || !partner || partner.ordre_planning == null) return s;

      // Détermine le pg partagé
      let sharedPg = partner.parallel_group;
      if (sharedPg == null) {
        const existingPgs = s.lots.map(l => l.parallel_group).filter((x): x is number => x != null);
        sharedPg = (existingPgs.length > 0 ? Math.max(...existingPgs) : 0) + 1;
      }

      const partnerOrdre = partner.ordre_planning;
      const targetOrdre = partnerOrdre + 1;
      const currentOrdre = lot.ordre_planning ?? 0;

      const nextLots = s.lots.map(l => ({ ...l }));

      // Shift intermédiaires pour libérer la position targetOrdre
      if (targetOrdre < currentOrdre) {
        for (const l of nextLots) {
          if (l.id === lotId) continue;
          const o = l.ordre_planning ?? 0;
          if (o >= targetOrdre && o < currentOrdre) l.ordre_planning = o + 1;
        }
      } else if (targetOrdre > currentOrdre) {
        for (const l of nextLots) {
          if (l.id === lotId) continue;
          const o = l.ordre_planning ?? 0;
          if (o > currentOrdre && o <= targetOrdre) l.ordre_planning = o - 1;
        }
      }

      // Lot déplacé : ordre + pg
      const movedLot = nextLots.find(l => l.id === lotId)!;
      movedLot.ordre_planning = targetOrdre;
      movedLot.parallel_group = sharedPg;

      // Partner : update pg si null (création du nouveau groupe partagé)
      if (partner.parallel_group == null) {
        const partnerLot = nextLots.find(l => l.id === partnerId)!;
        partnerLot.parallel_group = sharedPg;
      }

      // Build updates
      updates = [];
      for (const newLot of nextLots) {
        const orig = s.lots.find(l => l.id === newLot.id);
        if (!orig) continue;
        const u: { id: string; ordre_planning?: number; parallel_group?: number | null } = { id: newLot.id };
        let touched = false;
        if (orig.ordre_planning !== newLot.ordre_planning) {
          u.ordre_planning = newLot.ordre_planning ?? undefined;
          touched = true;
        }
        if (orig.parallel_group !== newLot.parallel_group) {
          u.parallel_group = newLot.parallel_group ?? null;
          touched = true;
        }
        if (touched) updates.push(u);
      }

      const recomputed = recomputeLocal(nextLots, s.startDate);
      return { ...s, lots: recomputed, totalWeeks: getTotalWeeks(recomputed) };
    });
    if (updates.length > 0) patchPlanning({ lots: updates });
  }, [patchPlanning]);

  /** Force le recompactage global des dates (utile après suppression d'un lot
   * laissant un trou, ou pour "remettre à plat" des déplacements manuels). */
  const recompactPlanning = useCallback(() => {
    patchPlanning({});
  }, [patchPlanning]);

  return {
    ...state,
    updateLot,
    updateStartDate,
    updateEndDate,
    reorderLots,
    swapOrdre,
    setLotPg,
    moveLotTo,
    parallelizeWith,
    recompactPlanning,
    refetch: fetchPlanning,
  };
}
