/**
 * ScreenEditPrompt — écran propre "Revoir / modifier mon projet"
 * Affiche le prompt original, permet de le modifier,
 * relance la génération IA et met à jour le chantier existant.
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, RotateCcw } from 'lucide-react';
import type { ChantierIAResult } from '@/types/chantier-ia';

const GEN_STEPS = [
  { ico: '🧠', label: 'Analyse du projet' },
  { ico: '🗓️', label: 'Structure & planning' },
  { ico: '💰', label: 'Budget estimatif' },
  { ico: '📋', label: 'Formalités & artisans' },
  { ico: '✅', label: 'Checklist & aides' },
];

const STEP_DELAYS = [0, 2000, 4500, 7000, 9500];

interface Props {
  result: ChantierIAResult;
  chantierId: string;
  token: string;
  onBack: () => void;
  onUpdate: (updated: ChantierIAResult) => void;
}

// ── Phase d'édition ─────────────────────────────────────────────────────────

function EditPhase({
  prompt, onLaunch,
}: {
  prompt: string;
  onLaunch: (newPrompt: string) => void;
}) {
  const [text, setText] = useState(prompt);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onLaunch(trimmed);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">

      {/* Titre */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
          Revoir votre projet
        </h1>
        <p className="text-gray-500 text-sm sm:text-base leading-relaxed">
          Modifiez la description ci-dessous puis relancez la génération.
          Le planning, le budget et les lots seront entièrement recalculés.
        </p>
      </div>

      {/* Textarea card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          className="w-full text-gray-900 text-base sm:text-lg resize-none px-5 sm:px-6 pt-5 sm:pt-6 pb-3 outline-none min-h-[160px] sm:min-h-[200px] leading-relaxed bg-transparent"
          maxLength={800}
          placeholder="Décrivez votre projet en détail…"
        />
        <div className="flex items-center justify-between px-5 sm:px-6 pb-4 sm:pb-5 pt-2 gap-3 border-t border-gray-100">
          <span className="text-xs text-gray-400 tabular-nums select-none">
            {text.length}/800
            {text.length > 0 && (
              <span className="text-gray-300 ml-1.5 hidden sm:inline">
                · ⌘+Entrée pour lancer
              </span>
            )}
          </span>
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="shrink-0 flex items-center gap-2 font-semibold rounded-xl px-5 sm:px-6 py-2.5 text-sm transition-all bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-white shadow-sm hover:shadow-md"
          >
            <RotateCcw className="h-4 w-4" />
            Régénérer mon plan
          </button>
        </div>
      </div>

      {/* Avertissement */}
      <div className="mt-4 flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
        <span className="text-base shrink-0">⚠️</span>
        <p className="text-xs text-amber-700 leading-relaxed">
          La régénération <strong>remplacera entièrement</strong> le plan actuel (budget, planning, lots, checklist).
          Vos documents et devis ajoutés seront conservés.
        </p>
      </div>
    </div>
  );
}

// ── Phase de génération ──────────────────────────────────────────────────────

function GeneratingPhase({
  newPrompt, chantierId, token, originalResult, onSuccess, onError,
}: {
  newPrompt: string;
  chantierId: string;
  token: string;
  originalResult: ChantierIAResult;
  onSuccess: (r: ChantierIAResult) => void;
  onError: (msg: string) => void;
}) {
  const [activeStep, setActiveStep] = useState(0);
  const [pct, setPct] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const timers: ReturnType<typeof setTimeout>[] = [];
    STEP_DELAYS.forEach((delay, i) => {
      timers.push(setTimeout(() => {
        setActiveStep(i);
        setPct(Math.round(10 + (i / GEN_STEPS.length) * 85));
      }, delay));
    });

    const run = async () => {
      try {
        const supabaseUrl    = import.meta.env.PUBLIC_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;

        const response = await fetch(`${supabaseUrl}/functions/v1/chantier-generer`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            apikey: supabaseAnonKey,
          },
          body: JSON.stringify({ description: newPrompt, mode: 'libre' }),
        });

        timers.forEach(clearTimeout);

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          onError((errData as { error?: string }).error ?? `Erreur serveur HTTP ${response.status}`);
          return;
        }

        const data = await response.json() as { result?: ChantierIAResult; error?: string };

        if (data.error || !data.result) {
          onError(data.error ?? 'Réponse invalide du serveur');
          return;
        }

        const result: ChantierIAResult = { ...data.result, promptOriginal: newPrompt };

        setActiveStep(GEN_STEPS.length - 1);
        setPct(100);

        // PATCH le chantier existant
        const patchRes = await fetch(`/api/chantier/${chantierId}/regenerer`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ result }),
        });

        if (!patchRes.ok) {
          const err = await patchRes.json().catch(() => ({}));
          onError(`Erreur lors de la sauvegarde : ${(err as { error?: string }).error ?? `HTTP ${patchRes.status}`}`);
          return;
        }

        setTimeout(() => onSuccess(result), 400);

      } catch (e) {
        timers.forEach(clearTimeout);
        onError(e instanceof Error ? e.message : 'Erreur réseau, veuillez réessayer');
      }
    };

    run();

    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="w-full max-w-md mx-auto text-center">
      <div className="mb-8">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
          <Loader2 className="h-7 w-7 text-blue-500 animate-spin" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Régénération en cours…</h2>
        <p className="text-sm text-gray-400">Votre plan est recalculé en tenant compte de vos modifications</p>
      </div>

      {/* Barre de progression */}
      <div className="w-full bg-gray-100 rounded-full h-2 mb-8 overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Étapes */}
      <div className="space-y-3 text-left">
        {GEN_STEPS.map((s, i) => {
          const isDone   = i < activeStep;
          const isActive = i === activeStep;
          return (
            <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              isActive ? 'bg-blue-50 border border-blue-100' :
              isDone   ? 'opacity-50' : 'opacity-25'
            }`}>
              <span className="text-xl shrink-0">{s.ico}</span>
              <p className={`text-sm font-medium ${isActive ? 'text-blue-700' : 'text-gray-600'}`}>
                {s.label}
              </p>
              {isDone && <span className="ml-auto text-emerald-500 text-xs font-bold">✓</span>}
              {isActive && <Loader2 className="ml-auto h-3 w-3 text-blue-400 animate-spin shrink-0" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Composant principal ──────────────────────────────────────────────────────

export default function ScreenEditPrompt({ result, chantierId, token, onBack, onUpdate }: Props) {
  const [phase, setPhase] = useState<'edit' | 'generating' | 'error'>('edit');
  const [newPrompt, setNewPrompt] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const originalPrompt = result.promptOriginal || result.description || '';

  return (
    <div className="min-h-screen bg-[#f7f8fc] flex flex-col">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
        {phase !== 'generating' && (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors group"
          >
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
            Retour au dashboard
          </button>
        )}
        <div className="flex-1" />
        <span className="text-sm font-semibold text-gray-700">
          {phase === 'generating' ? 'Génération en cours' : 'Modifier le projet'}
        </span>
      </div>

      {/* Contenu central */}
      <div className="flex-1 flex items-center justify-center px-4 py-10 sm:py-16">

        {phase === 'edit' && (
          <EditPhase
            prompt={originalPrompt}
            onLaunch={(p) => { setNewPrompt(p); setPhase('generating'); }}
          />
        )}

        {phase === 'generating' && (
          <GeneratingPhase
            newPrompt={newPrompt}
            chantierId={chantierId}
            token={token}
            originalResult={result}
            onSuccess={(updated) => onUpdate(updated)}
            onError={(msg) => { setErrorMsg(msg); setPhase('error'); }}
          />
        )}

        {phase === 'error' && (
          <div className="w-full max-w-md mx-auto text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">❌</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Une erreur est survenue</h2>
            <p className="text-sm text-gray-500 mb-6">{errorMsg}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={onBack}
                className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Retour
              </button>
              <button
                onClick={() => setPhase('generating')}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
              >
                Réessayer
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
