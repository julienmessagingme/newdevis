/**
 * usePlanning — hook React pour la gestion du planning chantier.
 *
 * Modèle CPM (Critical Path Method) :
 * - Source de vérité : duree_jours + delai_avant_jours par lot + lot_dependencies
 * - Dates = toujours DÉRIVÉES via computePlanningDates (tri topo + forward pass)
 * - Lanes visuelles = pure présentation (first-fit sur dates calculées dans le composant)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { LotChantier } from '@/types/chantier-ia';
import {
  computePlanningDates,
  computeStartDateFromEnd,
  getTotalWeeks,
  parseDate,
  type DependencyMap,
} from '@/lib/planningUtils';

interface PlanningState {
  lots: LotChantier[];
  /** deps : lot_id → Set des prédécesseurs (multi-parent). */
  deps: DependencyMap;
  startDate: Date | null;
  totalWeeks: number;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

function parseDepsJson(raw: unknown): DependencyMap {
  const deps = new Map<string, Set<string>>();
  if (!raw || typeof raw !== 'object') return deps;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(v)) continue;
    deps.set(k, new Set(v.filter((d): d is string => typeof d === 'string')));
  }
  return deps;
}

function depsToJson(deps: DependencyMap): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of deps) out[k] = Array.from(v);
  return out;
}

export function usePlanning(chantierId: string | null | undefined, token: string | null | undefined) {
  const [state, setState] = useState<PlanningState>({
    lots: [],
    deps: new Map(),
    startDate: null,
    totalWeeks: 0,
    loading: true,
    saving: false,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  // Compteur de séquence : on ignore toute réponse réseau qui n'est PAS la
  // dernière requête envoyée. Évite que d'anciennes réponses overwrite l'état
  // optimistique récent (race condition sur D&D rapide).
  const reqSeqRef = useRef(0);
  const pendingRef = useRef(0);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchPlanning = useCallback(async () => {
    if (!chantierId || !token) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const mySeq = ++reqSeqRef.current;

    setState(s => ({ ...s, loading: true, error: null }));

    try {
      const res = await fetch(`/api/chantier/${chantierId}/planning`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (mySeq !== reqSeqRef.current) return; // réponse périmée

      const sd = parseDate(data.dateDebutChantier);
      const lots: LotChantier[] = data.lots ?? [];
      const deps = parseDepsJson(data.dependencies);
      const tw = getTotalWeeks(lots);

      setState({ lots, deps, startDate: sd, totalWeeks: tw, loading: false, saving: false, error: null });
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      if (mySeq !== reqSeqRef.current) return;
      setState(s => ({ ...s, loading: false, error: e.message }));
    }
  }, [chantierId, token]);

  useEffect(() => { fetchPlanning(); }, [fetchPlanning]);

  // ── PATCH helper ──────────────────────────────────────────────────────────
  const patchPlanning = useCallback(async (body: Record<string, unknown>) => {
    if (!chantierId || !token) return;
    const mySeq = ++reqSeqRef.current;
    pendingRef.current += 1;
    setState(s => ({ ...s, saving: true }));

    try {
      const res = await fetch(`/api/chantier/${chantierId}/planning`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      pendingRef.current -= 1;
      // Ignore les réponses périmées : seule la PLUS RÉCENTE requête a le
      // droit d'écrire l'état complet (sinon flickering).
      if (mySeq !== reqSeqRef.current) {
        if (pendingRef.current === 0) setState(s => ({ ...s, saving: false }));
        return;
      }

      const sd = parseDate(data.dateDebutChantier);
      const lots: LotChantier[] = data.lots ?? [];
      const deps = parseDepsJson(data.dependencies);
      const tw = getTotalWeeks(lots);

      setState({ lots, deps, startDate: sd, totalWeeks: tw, loading: false, saving: false, error: null });
    } catch (e: any) {
      pendingRef.current -= 1;
      if (mySeq !== reqSeqRef.current) return;
      setState(s => ({ ...s, saving: false, error: e.message }));
    }
  }, [chantierId, token]);

  // Recompute local (optimistic) avec les deps courantes
  const recomputeLocal = useCallback((lots: LotChantier[], deps: DependencyMap, startDate: Date | null) =>
    startDate ? computePlanningDates(lots, startDate, deps) : lots
  , []);

  // ── Actions publiques ─────────────────────────────────────────────────────

  /** Change durée / délai d'un lot. Déclenche recompute global côté serveur. */
  const updateLot = useCallback((lotId: string, changes: { duree_jours?: number; delai_avant_jours?: number }) => {
    setState(s => {
      const updated = s.lots.map(l => l.id === lotId ? { ...l, ...changes } : l);
      const recomputed = recomputeLocal(updated, s.deps, s.startDate);
      return { ...s, lots: recomputed, totalWeeks: getTotalWeeks(recomputed) };
    });
    patchPlanning({ lots: [{ id: lotId, ...changes }] });
  }, [patchPlanning, recomputeLocal]);

  /** Met à jour la date de début du chantier. */
  const updateStartDate = useCallback((date: Date) => {
    setState(s => {
      const recomputed = computePlanningDates(s.lots, date, s.deps);
      return { ...s, startDate: date, lots: recomputed, totalWeeks: getTotalWeeks(recomputed) };
    });
    patchPlanning({ dateDebutChantier: date.toISOString().split('T')[0] });
  }, [patchPlanning]);

  /** Date de fin → calcule startDate en remontant via le chemin critique du DAG. */
  const updateEndDate = useCallback((endDate: Date) => {
    let computedStartStr = '';
    setState(s => {
      const computedStart = computeStartDateFromEnd(s.lots, endDate, s.deps);
      computedStartStr = computedStart.toISOString().split('T')[0];
      const recomputed = computePlanningDates(s.lots, computedStart, s.deps);
      return { ...s, startDate: computedStart, lots: recomputed, totalWeeks: getTotalWeeks(recomputed) };
    });
    if (computedStartStr) patchPlanning({ dateDebutChantier: computedStartStr });
  }, [patchPlanning]);

  /** Remplace la liste complète des prédécesseurs d'un lot. */
  const setDependencies = useCallback((lotId: string, depIds: string[]) => {
    setState(s => {
      const newDeps = new Map(s.deps);
      newDeps.set(lotId, new Set(depIds.filter(d => d !== lotId)));
      const recomputed = recomputeLocal(s.lots, newDeps, s.startDate);
      return { ...s, deps: newDeps, lots: recomputed, totalWeeks: getTotalWeeks(recomputed) };
    });
    patchPlanning({ dependencies: { [lotId]: depIds.filter(d => d !== lotId) } });
  }, [patchPlanning, recomputeLocal]);

  /** Ajoute un prédécesseur. */
  const addDependency = useCallback((lotId: string, depId: string) => {
    if (lotId === depId) return;
    setState(s => {
      const current = new Set(s.deps.get(lotId) ?? []);
      current.add(depId);
      const newDeps = new Map(s.deps);
      newDeps.set(lotId, current);
      const recomputed = recomputeLocal(s.lots, newDeps, s.startDate);
      return { ...s, deps: newDeps, lots: recomputed, totalWeeks: getTotalWeeks(recomputed) };
    });
    // Server: on envoie la liste COMPLÈTE voulue (pas de "add" partiel côté API)
    setState(s => {
      const current = s.deps.get(lotId);
      const wanted = current ? Array.from(current) : [depId];
      patchPlanning({ dependencies: { [lotId]: wanted } });
      return s;
    });
  }, [patchPlanning, recomputeLocal]);

  /** Retire un prédécesseur. */
  const removeDependency = useCallback((lotId: string, depId: string) => {
    setState(s => {
      const current = new Set(s.deps.get(lotId) ?? []);
      current.delete(depId);
      const newDeps = new Map(s.deps);
      newDeps.set(lotId, current);
      const recomputed = recomputeLocal(s.lots, newDeps, s.startDate);
      patchPlanning({ dependencies: { [lotId]: Array.from(current) } });
      return { ...s, deps: newDeps, lots: recomputed, totalWeeks: getTotalWeeks(recomputed) };
    });
  }, [patchPlanning, recomputeLocal]);

  /** Applique plusieurs changements de deps en une seule transaction. */
  const applyDepsBatch = useCallback((updates: Array<{ lotId: string; depIds: string[] }>) => {
    setState(s => {
      const newDeps = new Map(s.deps);
      for (const { lotId, depIds } of updates) {
        newDeps.set(lotId, new Set(depIds.filter(d => d !== lotId)));
      }
      const recomputed = recomputeLocal(s.lots, newDeps, s.startDate);
      return { ...s, deps: newDeps, lots: recomputed, totalWeeks: getTotalWeeks(recomputed) };
    });
    const body: Record<string, string[]> = {};
    for (const { lotId, depIds } of updates) body[lotId] = depIds.filter(d => d !== lotId);
    patchPlanning({ dependencies: body });
  }, [patchPlanning, recomputeLocal]);

  /** Force un recompute global (PATCH body vide). */
  const recompactPlanning = useCallback(() => {
    patchPlanning({});
  }, [patchPlanning]);

  return {
    ...state,
    updateLot,
    updateStartDate,
    updateEndDate,
    setDependencies,
    addDependency,
    removeDependency,
    applyDepsBatch,
    recompactPlanning,
    refetch: fetchPlanning,
  };
}
