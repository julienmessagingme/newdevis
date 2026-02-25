import { useState, useEffect } from 'react';
import ReactApp from '@/components/ReactApp';
import StrategicBadge from '@/components/analysis/StrategicBadge';

// ── Types ──────────────────────────────────────────────────────────────────

interface StrategicScores {
  ivp_score: number | null;
  ipi_score: number | null;
  label: string;
  breakdown_owner: Record<string, number> | null;
  breakdown_investor: Record<string, number> | null;
  weighted_recovery_rate: number | null;
}

interface SimPayload {
  status: 'idle' | 'loading' | 'done' | 'error';
  scores?: StrategicScores;
  error?: string;
}

// ── Inner component (must be inside ReactApp for context) ──────────────────

function SimulateurScores() {
  const [payload, setPayload] = useState<SimPayload>({ status: 'idle' });

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<SimPayload>).detail;
      setPayload(detail);
    };
    document.addEventListener('simulateur-scores-update', handler);
    return () => document.removeEventListener('simulateur-scores-update', handler);
  }, []);

  // ── Idle: nothing to show ──
  if (payload.status === 'idle') return null;

  // ── Loading ──
  if (payload.status === 'loading') {
    return (
      <div className="flex items-center gap-3 text-sm text-slate-500 bg-slate-50 rounded-xl px-4 py-3 border border-slate-200">
        <svg
          className="h-4 w-4 animate-spin text-slate-400 flex-shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Calcul de l'Indice Stratégique Immobilier™…
      </div>
    );
  }

  // ── Error ──
  if (payload.status === 'error') {
    return (
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        Analyse stratégique indisponible momentanément.
        {payload.error ? ` (${payload.error})` : ''}
      </p>
    );
  }

  // ── Done ──
  if (payload.status === 'done' && payload.scores) {
    const rawText = JSON.stringify({ strategic_scores: payload.scores });
    return <StrategicBadge rawText={rawText} isPremium={false} />;
  }

  return null;
}

// ── Export: wrapped in ReactApp ────────────────────────────────────────────

export default function SimulateurScoresApp() {
  return (
    <ReactApp>
      <SimulateurScores />
    </ReactApp>
  );
}
