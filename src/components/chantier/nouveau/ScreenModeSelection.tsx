import { useState } from 'react';
import { ArrowRight, BookOpen, LayoutDashboard, LineChart } from 'lucide-react';
import type { ProjectMode } from '@/types/chantier-ia';

interface Props {
  onSelect: (mode: ProjectMode) => void;
  defaultMode?: ProjectMode;
}

const MODES: {
  mode: ProjectMode;
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
  border: string;
  bg: string;
  iconBg: string;
  badge: string;
}[] = [
  {
    mode: 'guided',
    icon: <BookOpen className="h-6 w-6" />,
    title: 'Être guidé étape par étape',
    description: 'Idéal pour un premier chantier. Nous vous aidons à éviter les erreurs avec des conseils pédagogiques et des alertes renforcées.',
    color: 'text-violet-300',
    border: 'border-violet-500/40',
    bg: 'bg-violet-500/10 hover:bg-violet-500/20',
    iconBg: 'bg-violet-500/20 text-violet-300',
    badge: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  },
  {
    mode: 'flexible',
    icon: <LayoutDashboard className="h-6 w-6" />,
    title: 'Organiser mon chantier',
    description: 'Vous savez globalement quoi faire. Vous voulez surtout un outil pour tout suivre sans blocages inutiles.',
    color: 'text-blue-300',
    border: 'border-blue-500/40',
    bg: 'bg-blue-500/10 hover:bg-blue-500/20',
    iconBg: 'bg-blue-500/20 text-blue-300',
    badge: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  },
  {
    mode: 'investor',
    icon: <LineChart className="h-6 w-6" />,
    title: 'Suivre le chantier à distance',
    description: 'Idéal pour un projet locatif ou un chantier que vous ne gérez pas sur place. Accent sur la trésorerie et les rapports d\'avancement.',
    color: 'text-emerald-300',
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-500/10 hover:bg-emerald-500/20',
    iconBg: 'bg-emerald-500/20 text-emerald-300',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  },
];

export default function ScreenModeSelection({ onSelect, defaultMode }: Props) {
  const [selected, setSelected] = useState<ProjectMode | null>(defaultMode ?? null);

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-white/[0.05] border border-white/[0.08] rounded-full px-3 py-1 text-xs text-slate-400 mb-4">
            <span>Étape finale</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            Comment souhaitez-vous<br />gérer votre chantier ?
          </h1>
          <p className="text-slate-400 text-sm">
            Votre tableau de bord s'adaptera à votre façon de travailler.
          </p>
        </div>

        {/* Mode cards */}
        <div className="flex flex-col gap-3 mb-8">
          {MODES.map(({ mode, icon, title, description, color, border, bg, iconBg, badge }) => {
            const isSelected = selected === mode;
            return (
              <button
                key={mode}
                onClick={() => setSelected(mode)}
                className={`
                  w-full text-left rounded-2xl border p-4 transition-all duration-200
                  ${isSelected
                    ? `${bg} ${border} ring-2 ring-offset-2 ring-offset-[#0a0f1e] ${border.replace('/40', '')}`
                    : 'bg-white/[0.03] border-white/[0.07] hover:border-white/[0.14] hover:bg-white/[0.05]'}
                `}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center ${isSelected ? iconBg : 'bg-white/[0.06] text-slate-400'}`}>
                    {icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`font-semibold text-sm ${isSelected ? color : 'text-white'}`}>
                        {title}
                      </span>
                      {isSelected && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${badge}`}>
                          Sélectionné
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {description}
                    </p>
                  </div>

                  {/* Check indicator */}
                  <div className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all mt-0.5 ${
                    isSelected
                      ? `${border} bg-current`
                      : 'border-white/20'
                  }`}>
                    {isSelected && (
                      <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 text-white" fill="none">
                        <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Note: modifiable later */}
        <p className="text-center text-xs text-slate-500 mb-6">
          Vous pourrez modifier ce choix à tout moment dans les paramètres du projet.
        </p>

        {/* CTA */}
        <button
          disabled={!selected}
          onClick={() => selected && onSelect(selected)}
          className={`
            w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold text-sm transition-all
            ${selected
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'
              : 'bg-white/[0.05] text-slate-500 cursor-not-allowed'}
          `}
        >
          Accéder à mon tableau de bord
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
