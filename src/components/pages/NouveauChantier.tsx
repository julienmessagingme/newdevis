import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { createClient } from '@supabase/supabase-js';
import ScreenPrompt from '@/components/chantier/nouveau/ScreenPrompt';
import ScreenGenerating from '@/components/chantier/nouveau/ScreenGenerating';
import ScreenWow from '@/components/chantier/nouveau/ScreenWow';
import DashboardChantier from '@/components/chantier/nouveau/DashboardChantier';
import ScreenAmeliorations from '@/components/chantier/nouveau/ScreenAmeliorations';
import ScreenQualification from '@/components/chantier/nouveau/ScreenQualification';
import ScreenModeSelection from '@/components/chantier/nouveau/ScreenModeSelection';
import type { ChantierIAResult, ChantierGuideForm, FollowUpQuestion, ProjectMode } from '@/types/chantier-ia';

const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

type Ecran = 'prompt' | 'qualification' | 'generating' | 'wow' | 'mode_selection' | 'dashboard' | 'ameliorer';


export default function NouveauChantier() {
  const [ecran, setEcran] = useState<Ecran>('prompt');
  const [result, setResult] = useState<ChantierIAResult | null>(null);
  const [chantierId, setChantierId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [requestBody, setRequestBody] = useState('');
  const startTimeRef = useRef<number>(0);
  const [tempsMs, setTempsMs] = useState(0);
  const [projectMode, setProjectMode] = useState<ProjectMode | null>(null);
  // Déclenché si l'utilisateur clique "Voir le dashboard" avant que chantierId soit disponible
  const [pendingRedirect, setPendingRedirect] = useState(false);

  // Dès que chantierId est disponible et qu'un redirect est en attente → navigation vers /mon-chantier/[id]
  useEffect(() => {
    if (pendingRedirect && chantierId) {
      window.location.href = `/mon-chantier/${chantierId}`;
    }
  }, [pendingRedirect, chantierId]);

  // Qualification state
  const [isQualifying, setIsQualifying] = useState(false);
  const [qualificationQuestions, setQualificationQuestions] = useState<FollowUpQuestion[]>([]);
  const [currentDescription, setCurrentDescription] = useState('');

  const getToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const handleGenerate = useCallback(
    async (description: string, mode: 'libre' | 'guide', guidedForm?: ChantierGuideForm) => {
      const token = await getToken();
      if (!token) {
        toast.error('Vous devez être connecté pour créer un chantier');
        window.location.href = '/connexion?redirect=/mon-chantier';
        return;
      }

      // Mode guidé : skip qualification (données structurées déjà collectées)
      if (mode === 'guide') {
        startTimeRef.current = Date.now();
        const body = JSON.stringify({ description, mode, guidedForm });
        setRequestBody(body);
        setEcran('generating');
        return;
      }

      // Mode libre : appel edge function qualifier pour questions contextuelles
      setIsQualifying(true);
      try {
        let questions: FollowUpQuestion[] = [];
        try {
          const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
          const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
          const res = await fetch(`${supabaseUrl}/functions/v1/chantier-qualifier`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
              apikey: supabaseAnonKey,
            },
            body: JSON.stringify({ description }),
          });
          if (res.ok) {
            const data = await res.json();
            questions = data.questions ?? [];
          }
        } catch {
          // Erreur qualifier non bloquante — génération directe
        }

        if (questions.length > 0) {
          setCurrentDescription(description);
          setQualificationQuestions(questions);
          setEcran('qualification');
        } else {
          // Aucune question → génération directe
          startTimeRef.current = Date.now();
          setRequestBody(JSON.stringify({ description, mode }));
          setEcran('generating');
        }
      } finally {
        setIsQualifying(false);
      }
    },
    [getToken],
  );

  const handleQualificationSubmit = useCallback(
    async (answers: Record<string, string>) => {
      const token = await getToken();
      if (!token) {
        toast.error('Session expirée, veuillez vous reconnecter');
        window.location.href = '/connexion?redirect=/mon-chantier';
        return;
      }

      startTimeRef.current = Date.now();
      const body = JSON.stringify({
        description: currentDescription,
        mode: 'libre',
        qualificationAnswers: answers,
      });
      setRequestBody(body);
      setEcran('generating');
    },
    [getToken, currentDescription],
  );

  const handleResult = useCallback(
    async (r: ChantierIAResult) => {
      setTempsMs(Date.now() - startTimeRef.current);
      setResult(r);
      setEcran('wow');

      // Sauvegarde en background + stockage token/userId pour le dashboard
      // Note: project_mode sera envoyé séparément lors du handleModeSelect
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const tok = session?.access_token ?? null;
        const uid = session?.user?.id ?? null;
        setToken(tok);
        setUserId(uid);
        if (!tok) return;
        const res = await fetch('/api/chantier/sauvegarder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
          body: JSON.stringify({ result: r }),
        });
        if (res.ok) {
          const data = await res.json();
          setChantierId(data.chantierId ?? null);
        }
      } catch (err) {
        console.error('[NouveauChantier] Erreur sauvegarde chantier:', err instanceof Error ? err.message : String(err));
      }
    },
    [],
  );

  // Appelé depuis ScreenModeSelection — met à jour le mode et redirige vers le dashboard
  const handleModeSelect = useCallback(
    async (mode: ProjectMode) => {
      setProjectMode(mode);

      // Persistance du mode en base (PATCH sur le chantier si l'ID est déjà connu)
      if (chantierId) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const tok = session?.access_token ?? token;
          if (tok) {
            await fetch(`/api/chantier/${chantierId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
              body: JSON.stringify({ projectMode: mode }),
            });
          }
        } catch (err) {
          console.error('[NouveauChantier] Erreur persistance project_mode:', err instanceof Error ? err.message : String(err));
        }
        window.location.href = `/mon-chantier/${chantierId}`;
      } else {
        // chantierId pas encore connu — attendre via pendingRedirect
        setPendingRedirect(true);
      }
    },
    [chantierId, token],
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
    return <ScreenPrompt onGenerate={handleGenerate} isLoading={isQualifying} />;
  }

  if (ecran === 'qualification') {
    return (
      <ScreenQualification
        questions={qualificationQuestions}
        description={currentDescription}
        onSubmit={handleQualificationSubmit}
        onBack={() => setEcran('prompt')}
      />
    );
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
        onDashboard={() => setEcran('mode_selection')}
        onAmeliorer={() => setEcran('ameliorer')}
      />
    );
  }

  if (ecran === 'mode_selection') {
    // Bonus : pré-sélectionner "guided" si l'utilisateur vient depuis une analyse VerifierMonDevis
    const params = new URLSearchParams(window.location.search);
    const fromAnalyse = params.get('from') === 'analyse' || params.get('devis') === '1';
    return (
      <ScreenModeSelection
        onSelect={handleModeSelect}
        defaultMode={fromAnalyse ? 'guided' : undefined}
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
        token={token}
        userId={userId}
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
  return <ScreenPrompt onGenerate={handleGenerate} isLoading={isQualifying} />;
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

  useEffect(() => {
    getToken().then((t) => {
      if (!t) {
        onError('Session expirée, veuillez vous reconnecter');
      } else {
        setToken(t);
      }
      setChecked(true);
    });
  }, [getToken, onError]);

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

  useEffect(() => {
    getToken().then(setToken);
  }, [getToken]);

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
