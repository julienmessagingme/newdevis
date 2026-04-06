import { useEffect, useState, useCallback } from 'react';

export interface Tache {
  id: string;
  titre: string;
  priorite: 'urgent' | 'important' | 'normal';
  done: boolean;
  ordre: number;
}

interface UseTachesReturn {
  taches: Tache[];
  pending: Tache[];
  loading: boolean;
  toggleDone: (id: string, done: boolean) => Promise<void>;
  addTask: (titre: string, priorite?: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const PRIO_ORDER: Record<string, number> = { urgent: 0, important: 1, normal: 2 };

export function useTaches(
  chantierId: string | null,
  token: string | null | undefined,
): UseTachesReturn {
  const [taches, setTaches] = useState<Tache[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTaches = useCallback(async () => {
    if (!chantierId || !token) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/taches`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTaches(data.taches ?? []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [chantierId, token]);

  useEffect(() => { fetchTaches(); }, [fetchTaches]);

  const toggleDone = useCallback(async (id: string, done: boolean) => {
    if (!chantierId || !token) return;
    // Optimistic update
    setTaches(prev => prev.map(t => t.id === id ? { ...t, done } : t));
    await fetch(`/api/chantier/${chantierId}/taches`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, done }),
    });
  }, [chantierId, token]);

  const addTask = useCallback(async (titre: string, priorite = 'normal') => {
    if (!chantierId || !token || !titre.trim()) return;
    const res = await fetch(`/api/chantier/${chantierId}/taches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ titre, priorite }),
    });
    if (res.ok) await fetchTaches();
  }, [chantierId, token, fetchTaches]);

  // Pending = not done, sorted by priority
  const pending = taches
    .filter(t => !t.done)
    .sort((a, b) => (PRIO_ORDER[a.priorite] ?? 2) - (PRIO_ORDER[b.priorite] ?? 2));

  return { taches, pending, loading, toggleDone, addTask, refresh: fetchTaches };
}
