import { FileText, Hammer, ShieldCheck, ClipboardCheck, Folder } from 'lucide-react';
import type { EtapeRoadmap } from '@/types/chantier-ia';

// ── Types ───────────────────────────────────────────────────────────────────

type StatutEtape = 'done' | 'active' | 'upcoming';

interface TimelineStep {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  phases: string[]; // clés `phase` de EtapeRoadmap associées à cette étape
}

// ── Étapes fixes ────────────────────────────────────────────────────────────

const STEPS: TimelineStep[] = [
  {
    id: 'projet',
    label: 'Projet',
    icon: Folder,
    phases: ['preparation'],
  },
  {
    id: 'devis',
    label: 'Devis',
    icon: FileText,
    phases: ['devis', 'chiffrage'],
  },
  {
    id: 'autorisations',
    label: 'Autorisations',
    icon: ShieldCheck,
    phases: ['autorisations', 'administratif'],
  },
  {
    id: 'travaux',
    label: 'Travaux',
    icon: Hammer,
    phases: ['travaux', 'finitions', 'chantier'],
  },
  {
    id: 'reception',
    label: 'Réception',
    icon: ClipboardCheck,
    phases: ['reception', 'livraison'],
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Déduit le statut de chaque étape à partir de la roadmap IA.
 *
 * Logique :
 * - Si la roadmap est vide → seule la 1ère étape est "active", les autres "upcoming"
 * - Sinon, on cherche l'index de l'étape courante (isCurrent) dans STEPS,
 *   puis toutes les étapes avant = "done", celle-ci = "active", les suivantes = "upcoming"
 */
function resolveStatuts(
  roadmap: EtapeRoadmap[],
): Record<string, StatutEtape> {
  const result: Record<string, StatutEtape> = {};

  if (!roadmap.length) {
    STEPS.forEach((s, i) => {
      result[s.id] = i === 0 ? 'active' : 'upcoming';
    });
    return result;
  }

  // Étape courante dans la roadmap
  const currentEtape = roadmap.find((e) => e.isCurrent);
  const currentPhase = currentEtape?.phase?.toLowerCase() ?? '';

  // Index dans STEPS de l'étape courante
  const activeIdx = STEPS.findIndex((s) =>
    s.phases.some((p) => currentPhase.includes(p)),
  );

  // Si aucune correspondance → première étape active
  const resolved = activeIdx >= 0 ? activeIdx : 0;

  STEPS.forEach((s, i) => {
    if (i < resolved) result[s.id] = 'done';
    else if (i === resolved) result[s.id] = 'active';
    else result[s.id] = 'upcoming';
  });

  return result;
}

// ── Styles par statut ────────────────────────────────────────────────────────

const CIRCLE_CLASS: Record<StatutEtape, string> = {
  done:     'bg-emerald-500 border-emerald-500 text-white',
  active:   'bg-blue-600 border-blue-500 text-white ring-2 ring-blue-500/30',
  upcoming: 'bg-transparent border-white/[0.12] text-slate-600',
};

const LABEL_CLASS: Record<StatutEtape, string> = {
  done:     'text-emerald-400',
  active:   'text-blue-300 font-semibold',
  upcoming: 'text-slate-600',
};

const CONNECTOR_CLASS: Record<StatutEtape, string> = {
  done:     'bg-emerald-500/50',
  active:   'bg-blue-500/30',
  upcoming: 'bg-white/[0.06]',
};

// ── Composant ────────────────────────────────────────────────────────────────

interface ChantierTimelineProps {
  roadmap: EtapeRoadmap[];
}

export default function ChantierTimeline({ roadmap }: ChantierTimelineProps) {
  const statuts = resolveStatuts(roadmap);

  return (
    <div className="bg-[#0d1525] border border-white/[0.06] rounded-2xl px-5 py-4 mb-5">
      <p className="text-[10px] text-slate-500 uppercase tracking-wide font-medium mb-4">
        Avancement du chantier
      </p>

      {/* Timeline horizontale */}
      <div className="flex items-start">
        {STEPS.map((step, i) => {
          const statut = statuts[step.id] ?? 'upcoming';
          const Icon = step.icon;
          const isLast = i === STEPS.length - 1;

          return (
            <div key={step.id} className="flex items-start flex-1 min-w-0">

              {/* Étape */}
              <div className="flex flex-col items-center flex-shrink-0">
                {/* Cercle */}
                <div
                  className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all ${CIRCLE_CLASS[statut]}`}
                >
                  {statut === 'done' ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
                      <path
                        d="M3 8l4 4 6-6"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>

                {/* Label */}
                <span
                  className={`mt-2 text-[11px] text-center leading-tight transition-colors ${LABEL_CLASS[statut]}`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connecteur horizontal (sauf dernier) */}
              {!isLast && (
                <div className="flex-1 flex items-center" style={{ marginTop: '1.125rem' }}>
                  <div
                    className={`h-0.5 w-full mx-1.5 rounded-full transition-all ${CONNECTOR_CLASS[statut]}`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
