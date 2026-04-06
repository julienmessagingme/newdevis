import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AgentInsight {
  id: string;
  type: string;
  severity: string;
  title: string;
  body: string;
  source_event: Record<string, unknown> | null;
  actions_taken: Array<{ tool: string; summary: string }>;
  needs_confirmation: boolean;
  read_by_user: boolean;
  created_at: string;
}

interface UseAgentInsightsReturn {
  insights: AgentInsight[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (insightId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useAgentInsights(
  chantierId: string | null,
  token: string | null | undefined,
): UseAgentInsightsReturn {
  const [insights, setInsights] = useState<AgentInsight[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchInsights = useCallback(async () => {
    if (!chantierId || !token) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/agent-insights?limit=30`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setInsights(data.insights ?? []);
        setUnreadCount(data.unread_count ?? 0);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [chantierId, token]);

  useEffect(() => { fetchInsights(); }, [fetchInsights]);

  const markAsRead = useCallback(async (insightId: string) => {
    if (!chantierId || !token) return;
    await fetch(`/api/chantier/${chantierId}/agent-insights`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ insight_id: insightId }),
    });
    setInsights(prev => prev.map(i => i.id === insightId ? { ...i, read_by_user: true } : i));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, [chantierId, token]);

  const markAllRead = useCallback(async () => {
    if (!chantierId || !token) return;
    await fetch(`/api/chantier/${chantierId}/agent-insights`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mark_all_read: true }),
    });
    setInsights(prev => prev.map(i => ({ ...i, read_by_user: true })));
    setUnreadCount(0);
  }, [chantierId, token]);

  return { insights, unreadCount, loading, markAsRead, markAllRead, refresh: fetchInsights };
}
