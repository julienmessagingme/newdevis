import { useEffect, useRef, useState } from 'react';
import type { ChantierIAResult, SseEvent } from '@/types/chantier-ia';

const GEN_STEPS = [
  { ico: '🧠', name: 'Analyse du projet' },
  { ico: '🗓️', name: 'Structure & planning' },
  { ico: '💰', name: 'Budget estimatif' },
  { ico: '📋', name: 'Formalités & artisans' },
  { ico: '✅', name: 'Checklist & aides' },
];

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

  // SSE reader
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let aborted = false;

    const run = async () => {
      try {
        const response = await fetch('/api/chantier/generer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: requestBody,
        });

        if (!response.ok) {
          onError('Erreur de connexion au serveur');
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          onError('Stream non disponible');
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (!aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const json = line.slice(6).trim();
            if (!json) continue;

            let event: SseEvent;
            try {
              event = JSON.parse(json);
            } catch {
              continue;
            }

            if (event.type === 'step') {
              setSteps((prev) => {
                const next = [...prev];
                next[event.step] = { status: event.status, detail: event.detail };
                return next;
              });
            } else if (event.type === 'progress') {
              setPct(event.pct);
            } else if (event.type === 'result') {
              onResult(event.data);
              return;
            } else if (event.type === 'error') {
              onError(event.message);
              return;
            }
          }
        }
      } catch (err) {
        if (!aborted) {
          console.error('[ScreenGenerating] fetch error:', err);
          onError('Erreur réseau, veuillez réessayer');
        }
      }
    };

    run();

    return () => {
      aborted = true;
    };
  }, [token, requestBody, onResult, onError]);

  const strokeOffset = CIRCUMFERENCE * (1 - displayPct / 100);

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Ring SVG */}
        <div className="flex justify-center mb-8">
          <div className="relative w-40 h-40">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
              {/* Track */}
              <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
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
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#06d6c7" />
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
                stroke="rgba(59,130,246,0.2)" strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray="30 284"
                strokeDashoffset="0"
              />
            </svg>
            {/* Pourcentage */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-display font-bold text-white">{displayPct}%</span>
              <span className="text-xs text-slate-500 mt-0.5">en cours</span>
            </div>
          </div>
        </div>

        {/* Titre */}
        <div className="text-center mb-8">
          <h2 className="text-xl font-display font-bold text-white mb-1">Génération en cours…</h2>
          <p className="text-slate-500 text-sm">Claude analyse votre projet et crée votre plan sur mesure</p>
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
                    ? 'border-blue-500/40 bg-blue-500/10'
                    : isDone
                    ? 'border-emerald-500/30 bg-emerald-500/8'
                    : 'border-white/[0.04] bg-white/[0.02] opacity-40'
                }`}
              >
                {/* Icon */}
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0 transition-all ${
                  isActive ? 'bg-blue-500/20' : isDone ? 'bg-emerald-500/15' : 'bg-white/5'
                }`}>
                  {isDone ? '✓' : step.ico}
                </div>
                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isDone ? 'text-emerald-300' : isActive ? 'text-white' : 'text-slate-500'}`}>
                    {step.name}
                  </p>
                  {s.detail && (
                    <p className={`text-xs mt-0.5 ${isDone ? 'text-emerald-500' : 'text-slate-400'}`}>
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
                        className="w-1.5 h-1.5 rounded-full bg-blue-400"
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
