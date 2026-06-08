/**
 * usePlanning — hook React pour la gestion du planning chantier.
 *
 * Modèle CPM (Critical Path Method) :
 * - Source de vérité : duree_jours + delai_avant_jours par lot + lot_dependencies
 * - Dates = toujours DÉRIVÉES via computePlanningDates (tri topo + forward pass)
 * - Lanes visuelles = pure présentation (first-fit sur dates calculées dans le composant)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { LotChantier, Subphase, PlanningEdge, PlanningEdgeRow } from '@/types/chantier-ia';
import {
  computePlanningDates,
  computeStartDateFromEnd,
  computeAdvancedStartDateFromEnd,
  getTotalWeeks,
  parseDate,
  type DependencyMap,
} from '@/lib/chantier/planningUtils';

interface PlanningState {
  lots: LotChantier[];
  /** deps : lot_id → Set des prédécesseurs (multi-parent). */
  deps: DependencyMap;
  /** Sous-phases (plates) du chantier — feature premium GMC. */
  subphases: Subphase[];
  /** Arêtes du graphe avancé (deps de sous-phases, cross-lot possible). Avec `id`
   *  pour permettre la suppression (removeSubphaseDep). */
  subphaseDeps: PlanningEdgeRow[];
  startDate: Date | null;
  /** Date de fin souhaitée (objectif) — null si non défini. ISO yyyy-mm-dd. */
  dateFinSouhaitee: string | null;
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

/** Aplatit la réponse GET `subphases: { lot_id: Subphase[] }` en tableau plat. */
function flattenSubphases(raw: unknown): Subphase[] {
  if (!raw || typeof raw !== 'object') return [];
  const out: Subphase[] = [];
  for (const v of Object.values(raw as Record<string, unknown>)) {
    if (Array.isArray(v)) out.push(...(v as Subphase[]));
  }
  return out;
}

export function usePlanning(chantierId: string | null | undefined, token: string | null | undefined) {
  const [state, setState] = useState<PlanningState>({
    lots: [],
    deps: new Map(),
    subphases: [],
    subphaseDeps: [],
    startDate: null,
    dateFinSouhaitee: null,
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
  const fetchPlanning = useCallback(async (opts?: { silent?: boolean }) => {
    if (!chantierId || !token) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const mySeq = ++reqSeqRef.current;

    // silent = refetch de reconciliation (après action sous-phase) : on NE met PAS
    // loading:true pour ne pas faire flasher le Gantt (le state actuel reste affiché).
    if (!opts?.silent) setState(s => ({ ...s, loading: true, error: null }));

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

      setState({ lots, deps, subphases: flattenSubphases(data.subphases), subphaseDeps: Array.isArray(data.subphaseDeps) ? data.subphaseDeps : [], startDate: sd, dateFinSouhaitee: data.dateFinSouhaitee ?? null, totalWeeks: tw, loading: false, saving: false, error: null });
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

      setState({ lots, deps, subphases: flattenSubphases(data.subphases), subphaseDeps: Array.isArray(data.subphaseDeps) ? data.subphaseDeps : [], startDate: sd, dateFinSouhaitee: data.dateFinSouhaitee ?? null, totalWeeks: tw, loading: false, saving: false, error: null });

      // V3.4.16+ (2026-05-18) — Notifie les autres écrans (DashboardHome, etc.)
      // qui ont cached le planning. Sans ce dispatch, la bulle Planning de
      // l'accueil reste figée sur les anciennes dates après modification depuis
      // l'onglet Planning. Mirroir du pattern `chantierBudgetChanged`.
      window.dispatchEvent(new CustomEvent('chantierPlanningChanged', {
        detail: { chantierId },
      }));
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

  /** Change durée / délai / lane_index d'un lot. Déclenche recompute global. */
  const updateLot = useCallback((lotId: string, changes: { duree_jours?: number; delai_avant_jours?: number; lane_index?: number | null }) => {
    setState(s => {
      const updated = s.lots.map(l => l.id === lotId ? { ...l, ...changes } : l);
      const recomputed = recomputeLocal(updated, s.deps, s.startDate);
      return { ...s, lots: recomputed, totalWeeks: getTotalWeeks(recomputed) };
    });
    patchPlanning({ lots: [{ id: lotId, ...changes }] });
  }, [patchPlanning, recomputeLocal]);

  /** Batch : met à jour plusieurs lots d'un coup (ex: snapshot des lanes
   *  visuelles courantes + nouvelle lane pour le lot déplacé). Atomique. */
  const applyLotsBatch = useCallback((
    updates: Array<{ lotId: string; lane_index?: number | null; duree_jours?: number; delai_avant_jours?: number }>,
  ) => {
    setState(s => {
      const byId = new Map(updates.map(u => [u.lotId, u]));
      const updated = s.lots.map(l => {
        const u = byId.get(l.id);
        if (!u) return l;
        const next = { ...l };
        if ('lane_index' in u) next.lane_index = u.lane_index ?? null;
        if (typeof u.duree_jours === 'number') next.duree_jours = u.duree_jours;
        if (typeof u.delai_avant_jours === 'number') next.delai_avant_jours = u.delai_avant_jours;
        return next;
      });
      const recomputed = recomputeLocal(updated, s.deps, s.startDate);
      return { ...s, lots: recomputed, totalWeeks: getTotalWeeks(recomputed) };
    });
    patchPlanning({
      lots: updates.map(u => {
        const body: Record<string, unknown> = { id: u.lotId };
        if ('lane_index' in u) body.lane_index = u.lane_index;
        if (typeof u.duree_jours === 'number') body.duree_jours = u.duree_jours;
        if (typeof u.delai_avant_jours === 'number') body.delai_avant_jours = u.delai_avant_jours;
        return body;
      }),
    });
  }, [patchPlanning, recomputeLocal]);

  /** Batch combiné pour D&D : met à jour deps + lane_indices dans UN SEUL
   *  PATCH. Garantit l'atomicité serveur et évite les races entre deux
   *  requêtes séparées (le reqSeqRef anti-rollback marche mieux avec 1 req). */
  const applyDragChange = useCallback((
    depsUpdates: Array<{ lotId: string; depIds: string[] }>,
    lotsUpdates: Array<{ lotId: string; lane_index?: number | null; duree_jours?: number; delai_avant_jours?: number }>,
  ) => {
    setState(s => {
      const newDeps = new Map(s.deps);
      for (const { lotId, depIds } of depsUpdates) {
        newDeps.set(lotId, new Set(depIds.filter(d => d !== lotId)));
      }
      const byId = new Map(lotsUpdates.map(u => [u.lotId, u]));
      const updatedLots = s.lots.map(l => {
        const u = byId.get(l.id);
        if (!u) return l;
        const next = { ...l };
        if ('lane_index' in u) next.lane_index = u.lane_index ?? null;
        if (typeof u.duree_jours === 'number') next.duree_jours = u.duree_jours;
        if (typeof u.delai_avant_jours === 'number') next.delai_avant_jours = u.delai_avant_jours;
        return next;
      });
      const recomputed = recomputeLocal(updatedLots, newDeps, s.startDate);
      return { ...s, lots: recomputed, deps: newDeps, totalWeeks: getTotalWeeks(recomputed) };
    });
    const body: Record<string, unknown> = {};
    if (depsUpdates.length > 0) {
      body.dependencies = Object.fromEntries(
        depsUpdates.map(u => [u.lotId, u.depIds.filter(d => d !== u.lotId)]),
      );
    }
    if (lotsUpdates.length > 0) {
      body.lots = lotsUpdates.map(u => {
        const b: Record<string, unknown> = { id: u.lotId };
        if ('lane_index' in u) b.lane_index = u.lane_index;
        if (typeof u.duree_jours === 'number') b.duree_jours = u.duree_jours;
        if (typeof u.delai_avant_jours === 'number') b.delai_avant_jours = u.delai_avant_jours;
        return b;
      });
    }
    if (Object.keys(body).length > 0) patchPlanning(body);
  }, [patchPlanning, recomputeLocal]);

  /** Met à jour la date de début du chantier. */
  const updateStartDate = useCallback((date: Date) => {
    setState(s => {
      const recomputed = computePlanningDates(s.lots, date, s.deps);
      return { ...s, startDate: date, lots: recomputed, totalWeeks: getTotalWeeks(recomputed) };
    });
    patchPlanning({ dateDebutChantier: date.toISOString().split('T')[0] });
  }, [patchPlanning]);

  /**
   * Date de fin → 2 comportements selon que le chantier a démarré ou non.
   *
   * V3.4.16+ (2026-05-18) — Bug fix : avant ce changement, `updateEndDate`
   * recalculait SYSTÉMATIQUEMENT la `dateDebutChantier` en remontant via le
   * CPM (forward pass inverse). Conséquence absurde sur un chantier DÉJÀ
   * démarré (ex: démarré 31/03, user veut décaler la fin du 27/04 au 01/07)
   * → la date de début était écrasée à 04/06 (= 01/07 - 27j ouvrés), comme
   * si le chantier n'avait pas encore commencé. Aberrant.
   *
   * Désormais :
   *   - Chantier PAS encore démarré (startDate dans le futur ou null) :
   *     comportement historique → recalcule startDate en remontant depuis
   *     endDate. C'est légitime, l'user organise son chantier en amont.
   *   - Chantier DÉJÀ démarré (startDate < aujourd'hui) : on garde la date
   *     de début actuelle et on persiste UNIQUEMENT `dateFinSouhaitee` comme
   *     OBJECTIF. Les dates des lots restent calculées depuis le start réel,
   *     et `estimatedEnd` (= max(lot.date_fin)) peut différer de l'objectif
   *     → ça permet à la bulle Planning d'afficher "Livraison visée 1 juil."
   *     même si le CPM estime un autre delivery. C'est cohérent : l'user
   *     a saisi un objectif, pas une obligation mécanique.
   */
  const updateEndDate = useCallback((endDate: Date) => {
    const endStr = endDate.toISOString().split('T')[0];
    setState(s => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const currentStart = s.startDate;
      const isChantierStarted = currentStart && currentStart.getTime() < today.getTime();

      if (isChantierStarted) {
        // Garde la date de début réelle, persiste uniquement l'objectif fin.
        // Les lots ne sont PAS recalculés (déjà aux bonnes dates depuis le vrai start).
        patchPlanning({ dateFinSouhaitee: endStr });
        return { ...s, dateFinSouhaitee: endStr };
      }

      // Chantier pas démarré : recalcule startDate en remontant depuis endDate.
      // Subphase-aware : le chemin critique peut passer par les sous-phases.
      const hasSubs = s.subphases.length > 0;
      const computedStart = hasSubs
        ? computeAdvancedStartDateFromEnd(s.lots, s.subphases, s.deps, s.subphaseDeps, endDate)
        : computeStartDateFromEnd(s.lots, endDate, s.deps);
      const computedStartStr = computedStart.toISOString().split('T')[0];
      patchPlanning({ dateDebutChantier: computedStartStr, dateFinSouhaitee: endStr });
      if (hasSubs) {
        // Dates lots+sous-phases reconciliées par la réponse serveur (subphase-aware).
        return { ...s, startDate: computedStart, dateFinSouhaitee: endStr };
      }
      const recomputed = computePlanningDates(s.lots, computedStart, s.deps);
      return { ...s, startDate: computedStart, dateFinSouhaitee: endStr, lots: recomputed, totalWeeks: getTotalWeeks(recomputed) };
    });
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

  // ── Sous-phases (premium) ─────────────────────────────────────────────────
  // Actions NON-optimistes : appel de l'endpoint dédié puis refetch autoritatif.
  // Les endpoints recalculent les dates côté serveur (subphase-aware) mais ne
  // renvoient que l'entité → on refetch pour récupérer dates lots dérivées +
  // sous-phases. Retourne { ok, error } pour que l'UI affiche les refus (cycle…).
  const subphaseRequest = useCallback(async (
    url: string,
    method: 'POST' | 'PATCH' | 'DELETE',
    body?: Record<string, unknown>,
  ): Promise<{ ok: boolean; status: number; error?: string }> => {
    if (!chantierId || !token) return { ok: false, status: 0, error: 'non authentifié' };
    setState(s => ({ ...s, saving: true }));
    try {
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* ignore */ }
        setState(s => ({ ...s, saving: false }));
        return { ok: false, status: res.status, error: msg };
      }
      await fetchPlanning({ silent: true }); // reconcile sans flash de loading
      window.dispatchEvent(new CustomEvent('chantierPlanningChanged', { detail: { chantierId } }));
      return { ok: true, status: res.status };
    } catch (e: any) {
      setState(s => ({ ...s, saving: false }));
      return { ok: false, status: 0, error: e?.message ?? 'erreur réseau' };
    }
  }, [chantierId, token, fetchPlanning]);

  /** Crée une sous-phase dans un lot. */
  const addSubphase = useCallback((
    lotId: string,
    payload: { nom: string; duree_jours?: number; delai_avant_jours?: number },
  ) => subphaseRequest(`/api/chantier/${chantierId}/lots/${lotId}/subphases`, 'POST', payload),
  [chantierId, subphaseRequest]);

  /** Édite une sous-phase (nom/durée/délai/statut/lane/ordre). */
  const updateSubphase = useCallback((
    subId: string,
    patch: { nom?: string; duree_jours?: number; delai_avant_jours?: number; statut?: string; lane_index?: number | null; ordre?: number },
  ) => subphaseRequest(`/api/chantier/${chantierId}/subphases/${subId}`, 'PATCH', patch),
  [chantierId, subphaseRequest]);

  /** Supprime une sous-phase (les arêtes sont nettoyées par CASCADE). */
  const deleteSubphase = useCallback((subId: string) =>
    subphaseRequest(`/api/chantier/${chantierId}/subphases/${subId}`, 'DELETE'),
  [chantierId, subphaseRequest]);

  /** Ajoute une dépendance avancée (from dépend de to). Refus possible : cycle (409). */
  const addSubphaseDep = useCallback((edge: PlanningEdge) =>
    subphaseRequest(`/api/chantier/${chantierId}/subphases/deps`, 'POST', edge as unknown as Record<string, unknown>),
  [chantierId, subphaseRequest]);

  /** Supprime une dépendance avancée par son id. */
  const removeSubphaseDep = useCallback((edgeId: string) =>
    subphaseRequest(`/api/chantier/${chantierId}/subphases/deps?id=${encodeURIComponent(edgeId)}`, 'DELETE'),
  [chantierId, subphaseRequest]);

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
    applyLotsBatch,
    applyDragChange,
    addSubphase,
    updateSubphase,
    deleteSubphase,
    addSubphaseDep,
    removeSubphaseDep,
    recompactPlanning,
    refetch: fetchPlanning,
  };
}
