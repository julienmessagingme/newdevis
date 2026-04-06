import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AgentConfig {
  agent_mode: 'edge_function' | 'openclaw' | 'disabled';
  openclaw_url: string | null;
  openclaw_agent_id: string | null;
}

interface UseAgentConfigReturn {
  config: AgentConfig;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  save: (updates: Partial<AgentConfig> & { openclaw_token?: string }) => Promise<boolean>;
  refresh: () => Promise<void>;
}

const DEFAULT_CONFIG: AgentConfig = {
  agent_mode: 'edge_function',
  openclaw_url: null,
  openclaw_agent_id: null,
};

export function useAgentConfig(): UseAgentConfigReturn {
  const [config, setConfig] = useState<AgentConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setIsLoading(false); return; }

      const res = await fetch('/api/chantier/agent-config', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const { config: c } = await res.json();
        setConfig({
          agent_mode: c.agent_mode ?? 'edge_function',
          openclaw_url: c.openclaw_url ?? null,
          openclaw_agent_id: c.openclaw_agent_id ?? null,
        });
      } else {
        const { error: msg } = await res.json().catch(() => ({ error: null }));
        setError(msg ?? `Erreur ${res.status}`);
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const save = useCallback(async (updates: Partial<AgentConfig> & { openclaw_token?: string }): Promise<boolean> => {
    setIsSaving(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Non connecté'); setIsSaving(false); return false; }

      const res = await fetch('/api/chantier/agent-config', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const { error: msg } = await res.json();
        setError(msg ?? 'Erreur de sauvegarde');
        setIsSaving(false);
        return false;
      }

      const { config: c } = await res.json();
      setConfig({
        agent_mode: c.agent_mode ?? 'edge_function',
        openclaw_url: c.openclaw_url ?? null,
        openclaw_agent_id: c.openclaw_agent_id ?? null,
      });
      setIsSaving(false);
      return true;
    } catch (e) {
      setError((e as Error).message);
      setIsSaving(false);
      return false;
    }
  }, []);

  return { config, isLoading, isSaving, error, save, refresh: fetchConfig };
}
