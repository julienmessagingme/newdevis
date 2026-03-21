import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { createClient } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import ScreenPrompt from '@/components/chantier/nouveau/ScreenPrompt';
import ScreenGenerating from '@/components/chantier/nouveau/ScreenGenerating';
import type { ChantierIAResult, ChantierGuideForm } from '@/types/chantier-ia';

const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

type Ecran = 'prompt' | 'generating' | 'saving';

export default function NouveauChantier() {
  const [ecran, setEcran]             = useState<Ecran>('prompt');
  const [requestBody, setRequestBody] = useState('');
  const [isLoading, setIsLoading]     = useState(false);
  const startTimeRef = useRef<number>(0);

  const getToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  // ── Étape 1 : saisie de la description → génération directe ───────────────
  const handleGenerate = useCallback(
    async (description: string, mode: 'libre' | 'guide', guidedForm?: ChantierGuideForm) => {
      const token = await getToken();
      if (!token) {
        toast.error('Vous devez être connecté pour créer un chantier');
        window.location.href = '/connexion?redirect=/mon-chantier/nouveau';
        return;
      }

      setIsLoading(true);
      startTimeRef.current = Date.now();
      setRequestBody(JSON.stringify({ description, mode, ...(guidedForm ? { guidedForm } : {}) }));
      setEcran('generating');
      setIsLoading(false);
    },
    [getToken],
  );

  // ── Étape 3 : génération terminée → sauvegarder → rediriger ───────────────
  const handleResult = useCallback(async (r: ChantierIAResult) => {
    setEcran('saving');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const tok = session?.access_token ?? null;
      if (!tok) {
        toast.error('Session expirée');
        setEcran('prompt');
        return;
      }

      const res = await fetch('/api/chantier/sauvegarder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ result: r }),
      });

      if (res.ok) {
        const data = await res.json();
        const id = data.chantierId;
        if (id) {
          window.location.href = `/mon-chantier/${id}`;
          return;
        }
      }

      toast.error('Erreur lors de la sauvegarde du chantier');
      setEcran('prompt');
    } catch {
      toast.error('Erreur réseau');
      setEcran('prompt');
    }
  }, []);

  const handleError = useCallback((msg: string) => {
    toast.error(msg);
    setEcran('prompt');
  }, []);

  // ── Rendu ──────────────────────────────────────────────────────────────────
  if (ecran === 'prompt') {
    return <ScreenPrompt onGenerate={handleGenerate} isLoading={isLoading} />;
  }

  if (ecran === 'generating') {
    return (
      <GeneratingWithToken
        requestBody={requestBody}
        getToken={getToken}
        onResult={handleResult}
        onError={handleError}
      />
    );
  }

  // Saving — écran de transition pendant la sauvegarde en DB
  return (
    <div className="min-h-screen bg-[#080d1a] flex flex-col items-center justify-center gap-4">
      <div
        className="w-16 h-16 rounded-2xl bg-white/[0.06] border border-white/[0.10] flex items-center justify-center"
        style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
      >
        <Loader2 className="h-7 w-7 text-blue-400 animate-spin" />
      </div>
      <p className="text-white font-semibold text-base">Préparation de votre cockpit…</p>
      <p className="text-slate-500 text-sm">Quelques secondes</p>
    </div>
  );
}

// ── Helper async token ────────────────────────────────────────────────────────

function GeneratingWithToken({
  requestBody, getToken, onResult, onError,
}: {
  requestBody: string;
  getToken: () => Promise<string | null>;
  onResult: (r: ChantierIAResult) => void;
  onError: (msg: string) => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    getToken().then((t) => {
      if (!t) onError('Session expirée, veuillez vous reconnecter');
      else setToken(t);
      setChecked(true);
    });
  }, [getToken, onError]);

  if (!checked || !token) return null;

  return (
    <ScreenGenerating
      token={token}
      requestBody={requestBody}
      onResult={onResult}
      onError={onError}
    />
  );
}
