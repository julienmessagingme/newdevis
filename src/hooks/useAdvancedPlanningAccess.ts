import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AdvancedPlanningAccessState {
  allowed: boolean;
  reason: string | null;
  isLoading: boolean;
}

/**
 * Habilitation au planning avancé (sous-phases) côté client.
 * Lit GET /api/gmc/advanced-planning-access (source de vérité serveur).
 * Sert UNIQUEMENT à l'UX (afficher le toggle "Avancé" déverrouillé/verrouillé) :
 * la sécurité réelle est le garde serveur requireAdvancedPlanning sur les écritures.
 */
export function useAdvancedPlanningAccess(): AdvancedPlanningAccessState {
  const [state, setState] = useState<AdvancedPlanningAccessState>({
    allowed: false,
    reason: null,
    isLoading: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          if (!cancelled) setState({ allowed: false, reason: 'unauthenticated', isLoading: false });
          return;
        }
        const res = await fetch('/api/gmc/advanced-planning-access', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (!cancelled) setState({ allowed: false, reason: 'denied', isLoading: false });
          return;
        }
        const json = await res.json();
        if (!cancelled) {
          setState({ allowed: !!json.allowed, reason: json.reason ?? null, isLoading: false });
        }
      } catch {
        if (!cancelled) setState({ allowed: false, reason: 'error', isLoading: false });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}
