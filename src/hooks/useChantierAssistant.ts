/**
 * useChantierAssistant — appel à /api/chantier/assistant (Gemini 2.0-flash).
 * Retourne l'analyse IA structurée : action_prioritaire, insights, alertes, conseil_metier.
 * Cache en mémoire par chantierId pour éviter les appels répétitifs.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { AssistantResult } from '@/pages/api/chantier/assistant';
import type { LotChantier, DocumentChantier } from '@/types/chantier-ia';
import type { ChantierIAResult } from '@/types/chantier-ia';

// Cache simple en mémoire (durée de la session)
const assistantCache = new Map<string, AssistantResult>();

interface UseChantierAssistantParams {
  chantierId: string | null;
  token: string | null | undefined;
  result: ChantierIAResult;
  documents: DocumentChantier[];
  lots: LotChantier[];
  enabled?: boolean; // désactiver sur les sections qui n'en ont pas besoin
}

interface UseChantierAssistantReturn {
  data: AssistantResult | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useChantierAssistant({
  chantierId,
  token,
  result,
  documents,
  lots,
  enabled = true,
}: UseChantierAssistantParams): UseChantierAssistantReturn {
  const [data, setData]       = useState<AssistantResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const fetchRef              = useRef(0);

  const buildBody = useCallback(() => {
    const devis = documents
      .filter(d => d.document_type === 'devis')
      .map(d => {
        const lot = d.lot_id ? lots.find(l => l.id === d.lot_id) : null;
        return {
          nom:           d.nom,
          montant:       null as number | null,
          analyse_id:    d.analyse_id ?? null,
          analysisScore: null as string | null,
          anomalies:     null as string | null,
          lot_id:        d.lot_id ?? null,
          lot_nom:       lot?.nom ?? null,
        };
      });

    const lotsWithCount = lots.map(l => ({
      nom:            l.nom,
      statut:         l.statut ?? 'a_trouver',
      budget_min_ht:  l.budget_min_ht ?? null,
      budget_avg_ht:  l.budget_avg_ht ?? null,
      budget_max_ht:  l.budget_max_ht ?? null,
      devisCount:     documents.filter(d => d.lot_id === l.id && d.document_type === 'devis').length,
    }));

    const hasLotBudget = lots.some(l => (l.budget_min_ht ?? 0) > 0);
    const budgetMin    = hasLotBudget
      ? lots.reduce((s, l) => s + (l.budget_min_ht ?? 0), 0)
      : (result.budgetTotal ?? 0) > 5000 ? Math.round(result.budgetTotal * 0.88) : null;
    const budgetMax    = hasLotBudget
      ? lots.reduce((s, l) => s + (l.budget_max_ht ?? 0), 0)
      : (result.budgetTotal ?? 0) > 5000 ? Math.round(result.budgetTotal * 1.15) : null;

    return {
      description: result.description ?? result.nom ?? '',
      lots:        lotsWithCount,
      devis,
      budgetMin,
      budgetMax,
      planning:    (result.roadmap ?? []).map(r => ({ phase: r.titre ?? r.nom ?? '', statut: '' })),
    };
  }, [result, documents, lots]);

  const fetch_ = useCallback(async (force = false) => {
    if (!enabled || !chantierId || !token) return;

    const cacheKey = `${chantierId}:${documents.length}:${lots.length}`;

    // Utiliser le cache si disponible et pas de force refresh
    if (!force && assistantCache.has(cacheKey)) {
      setData(assistantCache.get(cacheKey)!);
      return;
    }

    const id = ++fetchRef.current;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/chantier/assistant', {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildBody()),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json: AssistantResult = await res.json();

      if (id === fetchRef.current) {
        assistantCache.set(cacheKey, json);
        setData(json);
      }
    } catch (e) {
      if (id === fetchRef.current) {
        setError('Analyse IA indisponible');
      }
    } finally {
      if (id === fetchRef.current) setLoading(false);
    }
  }, [enabled, chantierId, token, buildBody, documents.length, lots.length]);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  return {
    data,
    loading,
    error,
    refresh: () => fetch_(true),
  };
}
