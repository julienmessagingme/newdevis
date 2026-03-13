import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Loader2, AlertCircle, ArrowLeft, Info, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import DashboardChantier from '@/components/chantier/nouveau/DashboardChantier';
import ScreenAmeliorations from '@/components/chantier/nouveau/ScreenAmeliorations';
import type { ChantierIAResult, StatutArtisan } from '@/types/chantier-ia';

const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

type Screen = 'dashboard' | 'ameliorer';

// Extrait l'id depuis /mon-chantier/<id>
function extractIdFromPath(): string | null {
  const parts = window.location.pathname.split('/').filter(Boolean);
  // Attendu : ['mon-chantier', '<uuid>']
  return parts.length >= 2 ? (parts[parts.length - 1] ?? null) : null;
}

export default function ChantierDetail() {
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [result, setResult] = useState<ChantierIAResult | null>(null);
  const [chantierId, setChantierId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // false = chantier manuel sans plan IA détaillé
  const [isPlanComplet, setIsPlanComplet] = useState(true);

  const getToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  useEffect(() => {
    const id = extractIdFromPath();

    if (!id) {
      setError('Identifiant de chantier manquant dans l\'URL.');
      setLoading(false);
      return;
    }

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const t = session?.access_token ?? null;
      if (!t) {
        window.location.href = `/connexion?redirect=/mon-chantier/${id}`;
        return;
      }
      setToken(t);
      setUserId(session!.user.id);

      let res: Response;
      try {
        res = await fetch(`/api/chantier/${id}`, {
          headers: { Authorization: `Bearer ${t}` },
        });
      } catch {
        setError('Erreur réseau lors du chargement du chantier.');
        setLoading(false);
        return;
      }

      if (res.status === 404) {
        setError('Ce chantier est introuvable ou ne vous appartient pas.');
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError('Erreur lors du chargement du chantier. Veuillez réessayer.');
        setLoading(false);
        return;
      }

      const data = await res.json();
      setResult(data.result ?? null);
      setIsPlanComplet(data.isPlanComplet !== false); // false explicite uniquement
      setChantierId(id);
      setLoading(false);
    })();
  }, [getToken]);

  /** Persiste le toggle d'un todo en DB — fire and forget, ne bloque pas l'UI */
  const handleToggleTache = useCallback(async (todoId: string, done: boolean) => {
    const id = chantierId;
    if (!id) return;

    // Réutilise le token en mémoire ou le recharge si expiré
    const t = token ?? await getToken();
    if (!t) return;

    try {
      const res = await fetch(`/api/chantier/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${t}`,
        },
        body: JSON.stringify({ todoId, done }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('[ChantierDetail] PATCH todo failed:', err?.error ?? res.status);
        toast.error('La tâche n\'a pas pu être sauvegardée', { duration: 2500 });
      }
    } catch (e) {
      console.error('[ChantierDetail] PATCH todo network error:', e instanceof Error ? e.message : String(e));
      toast.error('La tâche n\'a pas pu être sauvegardée', { duration: 2500 });
    }
    // L'état local dans DashboardChantier est déjà mis à jour avant cet appel —
    // une erreur ici ne le révertit pas : UX reste cohérente
  }, [token, chantierId, getToken]);

  /** Persiste le statut d'un lot en DB — fire and forget, même pattern que handleToggleTache.
   *  Si lotId commence par 'fallback-', le lot est read-only (ancien chantier) : no-op. */
  const handleLotStatutChange = useCallback(async (lotId: string, statut: StatutArtisan) => {
    if (lotId.startsWith('fallback-')) return; // lot dérivé de meta.artisans, pas persistable

    const id = chantierId;
    if (!id) return;

    const t = token ?? await getToken();
    if (!t) return;

    try {
      const res = await fetch(`/api/chantier/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${t}`,
        },
        body: JSON.stringify({ lotId, statut }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('[ChantierDetail] PATCH lot failed:', err?.error ?? res.status);
        toast.error("Le statut n'a pas pu être sauvegardé", { duration: 2500 });
      }
    } catch (e) {
      console.error('[ChantierDetail] PATCH lot error:', e instanceof Error ? e.message : String(e));
      toast.error("Le statut n'a pas pu être sauvegardé", { duration: 2500 });
    }
    // L'état local dans DashboardChantier est déjà mis à jour avant cet appel
  }, [token, chantierId, getToken]);

  const handleUpdate = useCallback((updated: ChantierIAResult) => {
    setResult(updated);
  }, []);

  // ── États de chargement / erreur ────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center gap-4 px-4 text-center">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-white font-semibold text-lg">{error ?? 'Impossible de charger ce chantier.'}</p>
        <a
          href="/mon-chantier"
          className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à mes chantiers
        </a>
      </div>
    );
  }

  // ── Écran amélioration ──────────────────────────────────────────────────────

  if (screen === 'ameliorer' && chantierId && token) {
    return (
      <ScreenAmeliorations
        result={result}
        chantierId={chantierId}
        token={token}
        onBack={() => setScreen('dashboard')}
        onUpdate={handleUpdate}
      />
    );
  }

  // ── Dashboard principal ─────────────────────────────────────────────────────

  return (
    <>
      {/* Banner discret — visible uniquement pour les chantiers sans plan IA détaillé */}
      {!isPlanComplet && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-[#0d1525]/95 backdrop-blur-sm border-b border-white/[0.07] px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Info className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            <p className="text-xs text-slate-400 truncate">
              Ce chantier n'a pas de plan détaillé — seules les informations de base sont disponibles.
            </p>
          </div>
          <a
            href="/mon-chantier"
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium whitespace-nowrap transition-colors shrink-0"
          >
            <Sparkles className="h-3 w-3" />
            Créer un plan
          </a>
        </div>
      )}

      <DashboardChantier
        result={result}
        chantierId={chantierId}
        onAmeliorer={() => setScreen('ameliorer')}
        onNouveau={() => { window.location.href = '/mon-chantier'; }}
        onToggleTache={handleToggleTache}
        onLotStatutChange={handleLotStatutChange}
        token={token}
        userId={userId}
      />
    </>
  );
}
