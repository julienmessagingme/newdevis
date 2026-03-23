import { useEffect, useRef } from 'react';
import { Sparkles, ArrowRight, Pencil } from 'lucide-react';
import type { ChantierIAResult } from '@/types/chantier-ia';

interface ScreenWowProps {
  result: ChantierIAResult;
  tempsMs: number;
  onDashboard: () => void;
  onAmeliorer: () => void;
}

const COLORS = ['#3b82f6', '#06d6c7', '#f59e0b', '#ec4899', '#8b5cf6', '#10b981', '#f97316', '#60a5fa'];

function launchConfetti(container: HTMLDivElement) {
  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    const size = 6 + Math.random() * 8;
    el.style.cssText = `
      position:absolute;
      width:${size}px;height:${size}px;
      background:${COLORS[Math.floor(Math.random() * COLORS.length)]};
      border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
      left:${10 + Math.random() * 80}%;
      top:-10px;
      opacity:1;
      transform:rotate(${Math.random() * 360}deg);
      animation:ia-confetti-fall ${1.5 + Math.random() * 2}s ease-in ${Math.random() * 0.8}s forwards;
    `;
    container.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }
}

export default function ScreenWow({ result, tempsMs, onDashboard, onAmeliorer }: ScreenWowProps) {
  const confettiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (confettiRef.current) {
      launchConfetti(confettiRef.current);
    }
  }, []);

  const tempsSec = (tempsMs / 1000).toFixed(1);

  const stats = [
    { label: 'Budget estimé', value: `${result.budgetTotal.toLocaleString('fr-FR')} €`, icon: '💰', color: 'text-blue-600' },
    { label: 'Durée estimée', value: `${result.dureeEstimeeMois} mois`, icon: '🗓️', color: 'text-cyan-600' },
    { label: 'Artisans', value: `${result.nbArtisans}`, icon: '👷', color: 'text-amber-600' },
    { label: 'Formalités', value: `${result.nbFormalites}`, icon: '📋', color: 'text-purple-600' },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Confetti container */}
      <div ref={confettiRef} className="absolute inset-0 pointer-events-none overflow-hidden" />

      <div className="relative w-full max-w-lg text-center">
        {/* Badge temps */}
        <div
          className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-full px-4 py-1.5 text-emerald-700 text-sm font-medium mb-6"
          style={{ animation: 'ia-pop-in 0.4s ease-out both' }}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Plan généré en {tempsSec}s
        </div>

        {/* Titre */}
        <div style={{ animation: 'ia-fade-up 0.5s ease-out 0.1s both' }}>
          <div className="text-5xl mb-3">{result.emoji}</div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-gray-900 mb-2">
            {result.nom}
          </h1>
          <p className="text-gray-500 text-sm max-w-xs mx-auto">{result.description}</p>
        </div>

        {/* Stats */}
        <div
          className="grid grid-cols-2 gap-3 mt-8 mb-8"
          style={{ animation: 'ia-fade-up 0.5s ease-out 0.2s both' }}
        >
          {stats.map((s) => (
            <div
              key={s.label}
              className="bg-gray-50 border border-gray-100 rounded-2xl p-4"
            >
              <div className="text-2xl mb-1">{s.icon}</div>
              <div className={`text-xl font-display font-bold ${s.color}`}>{s.value}</div>
              <div className="text-gray-500 text-xs mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div
          className="flex flex-col sm:flex-row gap-3"
          style={{ animation: 'ia-fade-up 0.5s ease-out 0.3s both' }}
        >
          <button
            onClick={onAmeliorer}
            className="flex-1 flex items-center justify-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium rounded-xl py-3 px-5 text-sm transition-all"
          >
            <Pencil className="h-4 w-4" />
            Améliorer mon plan
          </button>
          <button
            onClick={onDashboard}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3 px-5 text-sm transition-all"
          >
            Accéder au tableau de bord
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
