import { useEffect, useRef, useState } from 'react';
import type { ChantierIAResult } from '@/types/chantier-ia';

const GEN_STEPS = [
  { ico: '🧠', name: 'Analyse du projet', doneDetail: 'Projet analysé ✓' },
  { ico: '🗓️', name: 'Structure & planning', doneDetail: 'Roadmap créée ✓' },
  { ico: '💰', name: 'Budget estimatif', doneDetail: 'Budget estimé ✓' },
  { ico: '📋', name: 'Formalités & artisans', doneDetail: 'Formalités et artisans ✓' },
  { ico: '✅', name: 'Checklist & aides', doneDetail: 'Checklist + aides ✓' },
];

const ACTIVE_DETAILS = [
  'Identification des travaux…',
  'Construction du plan…',
  'Estimation budget par poste…',
  'Formalités + artisans détectés…',
  'Génération checklist…',
];

// Timing (ms) at which each step becomes active
const STEP_DELAYS = [0, 2000, 4500, 7000, 9500];
// Progress % when each step becomes active
const STEP_PCTS = [5, 30, 55, 75, 90];

const CIRCUMFERENCE = 2 * Math.PI * 50; // 314.16

type StepStatus = 'idle' | 'active' | 'done';

interface StepState {
  status: StepStatus;
  detail: string;
}

interface ScreenGeneratingProps {
  token: string;
  requestBody: string; // JSON stringifié { description, mode, guidedForm }
  onResult: (r: ChantierIAResult) => void;
  onError: (msg: string) => void;
}

export default function ScreenGenerating({ token, requestBody, onResult, onError }: ScreenGeneratingProps) {
  const [steps, setSteps] = useState<StepState[]>(
    GEN_STEPS.map(() => ({ status: 'idle', detail: '' }))
  );
  const [pct, setPct] = useState(0);
  const [displayPct, setDisplayPct] = useState(0);
  const animFrameRef = useRef<number>(0);
  const startedRef = useRef(false);

  // Animation fluide du pourcentage
  useEffect(() => {
    let current = displayPct;
    const animate = () => {
      if (current < pct) {
        current = Math.min(current + 1, pct);
        setDisplayPct(current);
        animFrameRef.current = requestAnimationFrame(animate);
      }
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [pct]);

  // Main fetch + fake progress
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let aborted = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Schedule fake step transitions while waiting for the API
    STEP_DELAYS.forEach((delay, i) => {
      timers.push(
        setTimeout(() => {
          if (aborted) return;
          setSteps((prev) => {
            const next = [...prev];
            // Mark previous step done
            if (i > 0) next[i - 1] = { status: 'done', detail: GEN_STEPS[i - 1].doneDetail };
            // Mark current step active
            next[i] = { status: 'active', detail: ACTIVE_DETAILS[i] };
            return next;
          });
          setPct(STEP_PCTS[i]);
        }, delay)
      );
    });

    const run = async () => {
      try {
        const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;

        const response = await fetch(`${supabaseUrl}/functions/v1/chantier-generer`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': supabaseAnonKey,
          },
          body: requestBody,
        });

        // Cancel fake timers — the real response has arrived
        timers.forEach((t) => clearTimeout(t));
        if (aborted) return;

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          onError((errData as { error?: string }).error ?? 'Erreur de connexion au serveur');
          return;
        }

        const data = await response.json() as { result?: ChantierIAResult; error?: string };

        if (data.error || !data.result) {
          onError(data.error ?? 'Réponse invalide du serveur');
          return;
        }

        // Complete all steps instantly
        setSteps(GEN_STEPS.map((s) => ({ status: 'done', detail: s.doneDetail })));
        setPct(100);

        // Short pause so user sees 100% before transition
        setTimeout(() => {
          if (!aborted) onResult(data.result!);
        }, 400);
      } catch (err) {
        timers.forEach((t) => clearTimeout(t));
        if (!aborted) {
          console.error('[ScreenGenerating] fetch error:', err);
          onError('Erreur réseau, veuillez réessayer');
        }
      }
    };

    run();

    return () => {
      aborted = true;
      timers.forEach((t) => clearTimeout(t));
    };
  }, [token, requestBody, onResult, onError]);

  const strokeOffset = CIRCUMFERENCE * (1 - displayPct / 100);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Ring SVG */}
        <div className="flex justify-center mb-8">
          <div className="relative w-40 h-40">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
              {/* Track */}
              <circle cx="60" cy="60" r="50" fill="none" stroke="#E5E7EB" strokeWidth="8" />
              {/* Progress */}
              <circle
                cx="60" cy="60" r="50" fill="none"
                stroke="url(#ia-ring-grad)" strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={strokeOffset}
                style={{ transition: 'stroke-dashoffset 0.3s ease-out' }}
              />
              <defs>
                <linearGradient id="ia-ring-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#2563eb" />
                  <stop offset="100%" stopColor="#0ea5e9" />
                </linearGradient>
              </defs>
            </svg>
            {/* Spinner ring */}
            <svg
              className="absolute inset-0 w-full h-full"
              style={{ animation: 'ia-ring-spin 2s linear infinite' }}
              viewBox="0 0 120 120"
            >
              <circle
                cx="60" cy="60" r="50" fill="none"
                stroke="rgba(37,99,235,0.15)" strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray="30 284"
                strokeDashoffset="0"
              />
            </svg>
            {/* Pourcentage */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-gray-900">{displayPct}%</span>
              <span className="text-xs text-gray-400 mt-0.5">en cours</span>
            </div>
          </div>
        </div>

        {/* Titre */}
        <div className="text-center mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Génération en cours…</h2>
          <p className="text-gray-500 text-sm">Notre IA analyse votre projet et crée votre plan sur mesure</p>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {GEN_STEPS.map((step, i) => {
            const s = steps[i];
            const isActive = s.status === 'active';
            const isDone = s.status === 'done';

            return (
              <div
                key={step.name}
                className={`flex items-center gap-4 rounded-xl p-4 border transition-all duration-500 ${
                  isActive
                    ? 'border-blue-200 bg-blue-50'
                    : isDone
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-gray-100 bg-gray-50 opacity-50'
                }`}
              >
                {/* Icon */}
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0 transition-all ${
                  isActive ? 'bg-blue-100' : isDone ? 'bg-emerald-100' : 'bg-white'
                }`}>
                  {isDone ? '✓' : step.ico}
                </div>
                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isDone ? 'text-emerald-700' : isActive ? 'text-blue-700' : 'text-gray-400'}`}>
                    {step.name}
                  </p>
                  {s.detail && (
                    <p className={`text-xs mt-0.5 ${isDone ? 'text-emerald-500' : 'text-blue-500'}`}>
                      {s.detail}
                    </p>
                  )}
                </div>
                {/* Active indicator */}
                {isActive && (
                  <div className="flex gap-1 shrink-0">
                    {[0, 1, 2].map((d) => (
                      <div
                        key={d}
                        className="w-1.5 h-1.5 rounded-full bg-blue-500"
                        style={{ animation: `ia-typing-dot 1.2s ease-in-out ${d * 0.2}s infinite` }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
