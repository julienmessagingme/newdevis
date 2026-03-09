import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { createClient } from '@supabase/supabase-js';
import ScreenPrompt from '@/components/chantier/nouveau/ScreenPrompt';
import ScreenGenerating from '@/components/chantier/nouveau/ScreenGenerating';
import ScreenWow from '@/components/chantier/nouveau/ScreenWow';
import DashboardChantier from '@/components/chantier/nouveau/DashboardChantier';
import ScreenAmeliorations from '@/components/chantier/nouveau/ScreenAmeliorations';
import type { ChantierIAResult, ChantierGuideForm } from '@/types/chantier-ia';

const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

type Ecran = 'prompt' | 'generating' | 'wow' | 'dashboard' | 'ameliorer';

export default function NouveauChantier() {
  const [ecran, setEcran] = useState<Ecran>('prompt');
  const [result, setResult] = useState<ChantierIAResult | null>(null);
  const [chantierId, setChantierId] = useState<string | null>(null);
  const [requestBody, setRequestBody] = useState('');
  const startTimeRef = useRef<number>(0);
  const [tempsMs, setTempsMs] = useState(0);

  const getToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const handleGenerate = useCallback(
    async (description: string, mode: 'libre' | 'guide', guidedForm?: ChantierGuideForm) => {
      const token = await getToken();
      if (!token) {
        toast.error('Vous devez être connecté pour créer un chantier');
        window.location.href = '/connexion?redirect=/mon-chantier/nouveau';
        return;
      }

      startTimeRef.current = Date.now();
      const body = JSON.stringify({ description, mode, guidedForm });
      setRequestBody(body);
      setEcran('generating');
    },
    [getToken],
  );

  const handleResult = useCallback(
    async (r: ChantierIAResult) => {
      setTempsMs(Date.now() - startTimeRef.current);
      setResult(r);
      setEcran('wow');

      // Sauvegarde en background
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch('/api/chantier/sauvegarder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ result: r }),
        });
        if (res.ok) {
          const data = await res.json();
          setChantierId(data.chantierId ?? null);
        }
      } catch {
        // Non-bloquant — la sauvegarde échoue silencieusement
      }
    },
    [getToken],
  );

  const handleError = useCallback((msg: string) => {
    toast.error(msg);
    setEcran('prompt');
  }, []);

  const handleUpdate = useCallback((updated: ChantierIAResult) => {
    setResult(updated);
  }, []);

  // ── Rendu selon l'écran actif ──
  if (ecran === 'prompt') {
    return <ScreenPrompt onGenerate={handleGenerate} />;
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

  if (ecran === 'wow' && result) {
    return (
      <ScreenWow
        result={result}
        tempsMs={tempsMs}
        onDashboard={() => setEcran('dashboard')}
        onAmeliorer={() => setEcran('ameliorer')}
      />
    );
  }

  if (ecran === 'dashboard' && result) {
    return (
      <DashboardChantier
        result={result}
        chantierId={chantierId}
        onAmeliorer={() => setEcran('ameliorer')}
        onNouveau={() => setEcran('prompt')}
      />
    );
  }

  if (ecran === 'ameliorer' && result && chantierId) {
    return (
      <AmeliorerWithToken
        result={result}
        chantierId={chantierId}
        getToken={getToken}
        onBack={() => setEcran('dashboard')}
        onUpdate={handleUpdate}
      />
    );
  }

  // Fallback — retour au prompt
  return <ScreenPrompt onGenerate={handleGenerate} />;
}

// ── Helpers pour résoudre le token de façon async ──

function GeneratingWithToken({
  requestBody,
  getToken,
  onResult,
  onError,
}: {
  requestBody: string;
  getToken: () => Promise<string | null>;
  onResult: (r: ChantierIAResult) => void;
  onError: (msg: string) => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useState(() => {
    getToken().then((t) => {
      if (!t) {
        onError('Session expirée, veuillez vous reconnecter');
      } else {
        setToken(t);
      }
      setChecked(true);
    });
  });

  if (!checked) return null;
  if (!token) return null;

  return (
    <ScreenGenerating
      token={token}
      requestBody={requestBody}
      onResult={onResult}
      onError={onError}
    />
  );
}

function AmeliorerWithToken({
  result,
  chantierId,
  getToken,
  onBack,
  onUpdate,
}: {
  result: ChantierIAResult;
  chantierId: string;
  getToken: () => Promise<string | null>;
  onBack: () => void;
  onUpdate: (updated: ChantierIAResult) => void;
}) {
  const [token, setToken] = useState<string | null>(null);

  useState(() => {
    getToken().then(setToken);
  });

  if (!token) return null;

  return (
    <ScreenAmeliorations
      result={result}
      chantierId={chantierId}
      token={token}
      onBack={onBack}
      onUpdate={onUpdate}
    />
  );
}
