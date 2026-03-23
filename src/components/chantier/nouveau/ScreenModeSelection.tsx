import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import type { ProjectMode } from '@/types/chantier-ia';

interface Props {
  onSelect: (mode: ProjectMode) => void;
  defaultMode?: ProjectMode;
}

// ── Mini mock UIs ────────────────────────────────────────────────────────────

function MockGuided() {
  const steps = [
    { label: 'Choisir un architecte', done: true },
    { label: 'Déposer le permis', done: true },
    { label: 'Sélectionner les artisans', done: false },
    { label: 'Démarrer les travaux', done: false },
  ];
  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`w-4 h-4 rounded-full shrink-0 flex items-center justify-center border ${
            s.done ? 'bg-violet-500 border-violet-500' : 'border-gray-300'
          }`}>
            {s.done && <Check className="w-2.5 h-2.5 text-white" />}
          </div>
          <span className={`text-[11px] ${s.done ? 'line-through text-gray-400' : 'text-gray-600'}`}>
            {s.label}
          </span>
          {!s.done && i === 2 && (
            <span className="ml-auto text-[9px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full font-medium">
              En cours
            </span>
          )}
        </div>
      ))}
      <div className="mt-3 bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-2">
        <p className="text-[10px] text-violet-600 font-medium">💡 Conseil</p>
        <p className="text-[10px] text-gray-500 mt-0.5">Demandez 3 devis avant de choisir</p>
      </div>
    </div>
  );
}

function MockFlexible() {
  const lots = [
    { label: 'Piscine', amount: '24 000€', pct: 53, status: 'done' },
    { label: 'Terrasse', amount: '7 500€', pct: 17, status: 'active' },
    { label: 'Façade', amount: '8 200€', pct: 18, status: 'idle' },
  ];
  return (
    <div>
      <div className="flex items-end justify-between mb-1.5">
        <span className="text-[10px] text-gray-400 uppercase tracking-wider">Budget</span>
        <span className="text-sm font-bold text-gray-900">45 000 €</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full mb-3 overflow-hidden">
        <div className="h-full w-[62%] bg-gradient-to-r from-blue-500 to-blue-400 rounded-full" />
      </div>
      <div className="space-y-1.5">
        {lots.map((lot) => (
          <div key={lot.label} className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              lot.status === 'done' ? 'bg-blue-400' :
              lot.status === 'active' ? 'bg-amber-400' : 'bg-gray-200'
            }`} />
            <span className="text-[11px] text-gray-600 flex-1">{lot.label}</span>
            <span className="text-[11px] text-gray-400">{lot.amount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockExpert() {
  const tasks = [
    { label: 'Gros œuvre', start: 0, width: 45, color: 'bg-emerald-400' },
    { label: 'Plomberie',  start: 30, width: 30, color: 'bg-emerald-300' },
    { label: 'Électricité',start: 45, width: 35, color: 'bg-emerald-200' },
    { label: 'Finitions',  start: 65, width: 35, color: 'bg-emerald-100' },
  ];
  const months = ['Avr', 'Mai', 'Juin', 'Juil'];
  return (
    <div>
      <div className="flex mb-1.5">
        <div className="w-16 shrink-0" />
        <div className="flex-1 flex">
          {months.map((m) => (
            <div key={m} className="flex-1 text-center text-[9px] text-gray-400">{m}</div>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        {tasks.map((t) => (
          <div key={t.label} className="flex items-center gap-2 h-5">
            <span className="w-16 shrink-0 text-[10px] text-gray-400 truncate">{t.label}</span>
            <div className="flex-1 relative h-full">
              <div
                className={`absolute top-0 bottom-0 rounded ${t.color}`}
                style={{ left: `${t.start}%`, width: `${t.width}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span className="text-[10px] text-gray-400">3 lots en retard détectés</span>
      </div>
    </div>
  );
}

// ── Config des modes ─────────────────────────────────────────────────────────

const MODES: {
  mode: ProjectMode;
  title: string;
  bullets: string[];
  accent: string;
  ring: string;
  preview: React.ReactNode;
}[] = [
  {
    mode: 'guided',
    title: 'Mode guidé',
    bullets: ['Étapes simplifiées', 'Conseils en continu', 'Alertes importantes'],
    accent: 'text-violet-600',
    ring: 'ring-violet-400',
    preview: <MockGuided />,
  },
  {
    mode: 'flexible',
    title: 'Mode organisé',
    bullets: ['Vue globale du chantier', 'Suivi des tâches', 'Budget détaillé'],
    accent: 'text-blue-600',
    ring: 'ring-blue-400',
    preview: <MockFlexible />,
  },
  {
    mode: 'investor',
    title: 'Mode expert',
    bullets: ['Planning avancé (GANTT)', 'Suivi des délais', 'Vue multi-lots'],
    accent: 'text-emerald-600',
    ring: 'ring-emerald-400',
    preview: <MockExpert />,
  },
];

// ── Composant principal ──────────────────────────────────────────────────────

export default function ScreenModeSelection({ onSelect, defaultMode }: Props) {
  const [selected, setSelected] = useState<ProjectMode | null>(defaultMode ?? null);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-3">
            Choisissez votre mode de gestion
          </h1>
          <p className="text-gray-500 text-base">
            Votre espace s\u2019adapte automatiquement à votre façon de piloter
          </p>
        </div>

        {/* Cards */}
        <div className="flex flex-col gap-3 mb-8">
          {MODES.map(({ mode, title, bullets, accent, ring, preview }) => {
            const isSelected = selected === mode;
            return (
              <button
                key={mode}
                onClick={() => setSelected(mode)}
                className={`
                  w-full text-left rounded-2xl border overflow-hidden transition-all duration-200
                  ${isSelected
                    ? `border-gray-200 ring-2 ${ring} bg-white shadow-sm`
                    : 'border-gray-100 bg-gray-50 hover:border-gray-200 hover:bg-white hover:shadow-sm'
                  }
                `}
              >
                <div className="flex">
                  {/* Left: info */}
                  <div className="flex-1 min-w-0 px-5 py-5">
                    <div className="flex items-center gap-2.5 mb-3">
                      {/* Radio dot */}
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                        isSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                      }`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <span className={`font-semibold text-sm ${isSelected ? accent : 'text-gray-700'}`}>
                        {title}
                      </span>
                    </div>
                    <ul className="space-y-1.5 pl-6">
                      {bullets.map((b) => (
                        <li key={b} className="flex items-center gap-2 text-xs text-gray-500">
                          <span className={`w-1 h-1 rounded-full shrink-0 ${isSelected ? accent.replace('text-', 'bg-') : 'bg-gray-300'}`} />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Right: mock preview */}
                  <div className={`w-52 shrink-0 px-4 py-5 border-l transition-colors ${
                    isSelected ? 'border-gray-100 bg-gray-50' : 'border-gray-100 bg-gray-50/50'
                  }`}>
                    {preview}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Note */}
        <p className="text-center text-xs text-gray-400 mb-6">
          Vous pourrez modifier ce choix à tout moment dans les paramètres
        </p>

        {/* CTA */}
        <button
          disabled={!selected}
          onClick={() => selected && onSelect(selected)}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3.5 text-sm transition-all"
        >
          Accéder à mon tableau de bord
          <ArrowRight className="h-4 w-4" />
        </button>

      </div>
    </div>
  );
}
