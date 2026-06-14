import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { createClient } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import ScreenOnboarding, { type OnboardingAnswers } from '@/components/chantier/nouveau/ScreenOnboarding';
import ScreenPrompt from '@/components/chantier/nouveau/ScreenPrompt';
import ScreenGenerating from '@/components/chantier/nouveau/ScreenGenerating';
import type { ChantierIAResult, ChantierGuideForm } from '@/types/chantier-ia';

const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

type Ecran = 'onboarding' | 'prompt' | 'generating' | 'saving';

export default function NouveauChantier() {
  // Auth AVANT le tunnel : on ne pose les questions qu'une fois connecté. Un
  // visiteur non connecté part vers l'INSCRIPTION (pas la connexion), puis revient
  // ici une fois le compte créé → le tunnel ne s'affiche qu'une seule fois, après
  // auth. Corrige : questions posées avant l'auth + re-posées après + atterrissage
  // sur l'écran de connexion au lieu de l'inscription.
  const [authChecked, setAuthChecked] = useState(false);

  const [ecran, setEcran]             = useState<Ecran>('onboarding');
  const [onboarding, setOnboarding]   = useState<OnboardingAnswers | null>(null);
  const [requestBody, setRequestBody] = useState('');
  const [isLoading, setIsLoading]     = useState(false);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) {
        const returnTo = window.location.pathname + window.location.search;
        window.location.href = '/inscription?returnTo=' + encodeURIComponent(returnTo);
        return;
      }

      // Gate 2e chantier : en gratuit/essai/Essentiel on ne crée qu'un chantier.
      // Au-delà → page d'abonnement (offre Multi). Bloque aussi l'accès direct au
      // tunnel par URL. La garde backend (sauvegarder) reste l'autorité finale.
      try {
        const [chRes, stRes] = await Promise.all([
          fetch('/api/chantier', { headers: { Authorization: `Bearer ${session.access_token}` } }),
          fetch('/api/gmc/status', { headers: { Authorization: `Bearer ${session.access_token}` } }),
        ]);
        const chJson = chRes.ok ? await chRes.json() : { chantiers: [] };
        const stJson = stRes.ok ? await stRes.json() : { isMulti: false };
        if (cancelled) return;
        const count = (chJson.chantiers ?? []).length;
        if (count >= 1 && !stJson.isMulti) {
          window.location.href = '/gmc-abonnement?plan=multi';
          return;
        }
      } catch {
        // Échec réseau : on laisse passer (la garde backend tranchera à la sauvegarde).
      }

      if (cancelled) return;
      setAuthChecked(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const getToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const [budgetCible, setBudgetCible] = useState<number | null>(null);

  // ── Étape 1 : questions d'onboarding → écran de description ───────────────
  const handleOnboarding = useCallback((answers: OnboardingAnswers) => {
    setOnboarding(answers);
    setEcran('prompt');
  }, []);

  // ── Étape 2 : saisie de la description → génération directe ───────────────
  const handleGenerate = useCallback(
    async (description: string, mode: 'libre' | 'guide', guidedForm?: ChantierGuideForm, userBudget?: number | null) => {
      const token = await getToken();
      if (!token) {
        // Garde-fou en cas d'expiration de session en cours de tunnel (l'auth est
        // déjà vérifiée au montage). L'utilisateur avait un compte → on le renvoie
        // vers la connexion, pas l'inscription.
        toast.error('Votre session a expiré, reconnectez-vous');
        window.location.href = '/connexion?redirect=/mon-chantier/nouveau';
        return;
      }

      setIsLoading(true);
      startTimeRef.current = Date.now();
      setBudgetCible(userBudget ?? null);

      // Dates issues de l'onboarding → qualificationAnswers consommé par chantier-generer
      const qa: Record<string, string> = {};
      if (onboarding?.dateMode === 'debut' && onboarding.dateValue) qa.date_debut = onboarding.dateValue;
      if (onboarding?.dateMode === 'fin'   && onboarding.dateValue) qa.date_fin   = onboarding.dateValue;

      setRequestBody(JSON.stringify({
        description, mode,
        ...(guidedForm ? { guidedForm } : {}),
        ...(userBudget && userBudget > 0 ? { budgetCible: userBudget } : {}),
        ...(Object.keys(qa).length > 0 ? { qualificationAnswers: qa } : {}),
      }));
      setEcran('generating');
      setIsLoading(false);
    },
    [getToken, onboarding],
  );

  // ── Étape 3 : génération terminée → sauvegarder → rediriger ───────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

      // Si l'utilisateur a déclaré un budget cible, on l'impose à la place de la valeur
      // inventée par Gemini — évite les chiffres au doigt mouillé sur le dashboard.
      const resultToSave = budgetCible && budgetCible > 0
        ? { ...r, budgetTotal: budgetCible, budgetUserDefined: true }
        : { ...r, budgetUserDefined: false };

      const res = await fetch('/api/chantier/sauvegarder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ result: resultToSave }),
      });

      // Garde multi-chantier côté serveur : 2e chantier sans offre Multi → abonnement.
      if (res.status === 403) {
        const body = await res.json().catch(() => ({} as { code?: string }));
        if (body.code === 'multi_required') {
          toast.info("Le multi-chantiers fait partie de l'offre Multi.");
          window.location.href = '/gmc-abonnement?plan=multi';
          return;
        }
      }

      if (res.ok) {
        const data = await res.json();
        const id = data.chantierId;
        if (id) {
          const suffix = '';
          window.location.href = `/mon-chantier/${id}${suffix}`;
          return;
        }
      }

      toast.error('Erreur lors de la sauvegarde du chantier');
      setEcran('prompt');
    } catch {
      toast.error('Erreur réseau');
      setEcran('prompt');
    }
  }, [budgetCible, onboarding]);

  const handleError = useCallback((msg: string) => {
    toast.error(msg);
    setEcran('prompt');
  }, []);

  // ── Rendu ──────────────────────────────────────────────────────────────────

  // Vérification d'auth en cours (avant tout affichage du tunnel) — évite le flash
  // des questions à un visiteur qui va être redirigé vers l'inscription.
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="h-7 w-7 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (ecran === 'onboarding') {
    return (
      <ScreenOnboarding
        onComplete={handleOnboarding}
        onBack={() => { window.location.href = '/mon-chantier'; }}
        initial={onboarding ?? undefined}
      />
    );
  }

  if (ecran === 'prompt') {
    return (
      <ScreenPrompt
        onGenerate={handleGenerate}
        isLoading={isLoading}
        initialBudgetMode={onboarding?.hasBudget ? 'has_budget' : 'estimate'}
        onBack={() => setEcran('onboarding')}
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

  // Saving — écran de transition pendant la sauvegarde en DB
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
      <div
        className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center"
        style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
      >
        <Loader2 className="h-7 w-7 text-blue-600 animate-spin" />
      </div>
      <p className="text-gray-900 font-semibold text-base">Préparation de votre tableau de bord…</p>
      <p className="text-gray-400 text-sm">Quelques secondes</p>
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
