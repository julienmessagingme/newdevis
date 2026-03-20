/**
 * Hook : charge les insights maître d'œuvre pour un chantier.
 * Cache en sessionStorage (5 min) pour éviter les appels répétés à Gemini.
 */
import { useState, useEffect, useCallback } from 'react';

export interface InsightItem {
  type: 'success' | 'warning' | 'alert' | 'info';
  text: string;
  icon?: string;
}

export interface InsightsData {
  global: InsightItem[];
  lots: Record<string, InsightItem>;
}

const TTL = 5 * 60 * 1000; // 5 min

function key(id: string, n: number) { return `insights:${id}:${n}`; }

function readCache(k: string): InsightsData | null {
  try {
    const raw = sessionStorage.getItem(k);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > TTL) { sessionStorage.removeItem(k); return null; }
    return data as InsightsData;
  } catch { return null; }
}

function writeCache(k: string, data: InsightsData) {
  try { sessionStorage.setItem(k, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

export function useInsights(
  chantierId: string | null,
  token: string | null | undefined,
  docsCount: number,
) {
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [loading, setLoading]   = useState(false);

  const load = useCallback(async (force = false) => {
    if (!chantierId || !token) return;
    const k = key(chantierId, docsCount);
    if (!force) {
      const cached = readCache(k);
      if (cached) { setInsights(cached); return; }
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/insights`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: InsightsData = await res.json();
        setInsights(data);
        writeCache(k, data);
      }
    } catch {}
    setLoading(false);
  }, [chantierId, token, docsCount]);

  useEffect(() => { load(); }, [load]);

  /** Forcer le rechargement (ex : après upload d'un document) */
  const refresh = useCallback(() => load(true), [load]);

  return { insights, loading, refresh };
}
