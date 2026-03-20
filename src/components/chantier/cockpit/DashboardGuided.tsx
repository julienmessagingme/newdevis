import { useState } from 'react';
import { Check, Clock, ChevronRight, Upload, FileText, AlertTriangle } from 'lucide-react';
import type { ChantierIAResult, ProjectMode, TacheIA } from '@/types/chantier-ia';
import { useInsights, type InsightItem } from './useInsights';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtEuro(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)} k€`;
  return `${n} €`;
}

const PHASE_ICONS: Record<string, string> = {
  preparation: '📐',
  autorisations: '📋',
  gros_oeuvre: '🏗️',
  second_oeuvre: '🔧',
  finitions: '✨',
  reception: '🎉',
};

const PHASE_LABELS: Record<string, string> = {
  preparation: 'Préparation',
  autorisations: 'Autorisations',
  gros_oeuvre: 'Gros œuvre',
  second_oeuvre: 'Second œuvre',
  finitions: 'Finitions',
  reception: 'Réception',
};

// ── Props ─────────────────────────────────────────────────────────────────────

const INSIGHT_STYLES: Record<InsightItem['type'], { bg: string; text: string; border: string }> = {
  success: { bg: 'bg-emerald-50',  text: 'text-emerald-800', border: 'border-emerald-100' },
  warning: { bg: 'bg-amber-50',    text: 'text-amber-800',   border: 'border-amber-100'   },
  alert:   { bg: 'bg-red-50',      text: 'text-red-800',     border: 'border-red-100'     },
  info:    { bg: 'bg-blue-50',     text: 'text-blue-800',    border: 'border-blue-100'    },
};

interface Props {
  result: ChantierIAResult;
  chantierId: string | null;
  token?: string | null;
  onToggleTache?: (todoId: string, done: boolean) => void;
  onProjectModeChange?: (mode: ProjectMode) => void;
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function DashboardGuided({ result, chantierId, token, onToggleTache, onProjectModeChange }: Props) {
  const [tasks, setTasks] = useState<TacheIA[]>(result.taches ?? []);
  const { insights, loading: insightsLoading } = useInsights(chantierId, token, 0);

  const budgetMin = Math.round(result.budgetTotal * 0.85);
  const budgetMax = Math.round(result.budgetTotal * 1.20);

  // Phases depuis roadmap (dédupliquées)
  const phasesSeen = new Set<string>();
  const phases = result.roadmap
    .filter(r => { if (phasesSeen.has(r.phase)) return false; phasesSeen.add(r.phase); return true; })
    .map(r => ({ phase: r.phase, isCurrent: r.isCurrent }));

  const completedCount = tasks.filter(t => t.done).length;
  const orderedTasks = [
    ...tasks.filter(t => !t.done && t.priorite === 'urgent'),
    ...tasks.filter(t => !t.done && t.priorite !== 'urgent'),
    ...tasks.filter(t => t.done),
  ];

  const formalitesObligatoires = result.formalites.filter(f => f.obligatoire);

  function handleToggle(task: TacheIA) {
    const newDone = !task.done;
    setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, done: newDone } : t)));
    if (task.id && onToggleTache) onToggleTache(task.id, newDone);
  }

  return (
    <div className="min-h-screen bg-[#f7f8fc] flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl">{result.emoji}</span>
            <div className="min-w-0">
              <h1 className="font-bold text-gray-900 text-base leading-tight truncate">{result.nom}</h1>
              <p className="text-sm text-gray-400 mt-0.5">{fmtEuro(budgetMin)} – {fmtEuro(budgetMax)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onProjectModeChange && (
              <button
                onClick={() => onProjectModeChange('flexible')}
                className="text-xs text-gray-400 hover:text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Changer de mode
              </button>
            )}
            <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl px-4 py-2.5 transition-colors">
              <Upload className="h-4 w-4" />
              Importer un devis
            </button>
          </div>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 max-w-5xl w-full mx-auto">

        {/* Sidebar phases */}
        <aside className="w-52 shrink-0 py-8 px-4 space-y-1">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-3">Phases du projet</p>
          {phases.length > 0 ? phases.map(({ phase, isCurrent }) => (
            <div
              key={phase}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                isCurrent
                  ? 'bg-blue-600 text-white font-medium shadow-sm shadow-blue-200'
                  : 'text-gray-500 hover:bg-white hover:text-gray-800 hover:shadow-sm'
              }`}
            >
              <span className="text-base leading-none">{PHASE_ICONS[phase] ?? '▸'}</span>
              <span>{PHASE_LABELS[phase] ?? phase}</span>
              {isCurrent && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-200" />}
            </div>
          )) : Object.entries(PHASE_LABELS).map(([phase, label]) => (
            <div key={phase} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-gray-300">
              <span className="text-base leading-none">{PHASE_ICONS[phase]}</span>
              <span>{label}</span>
            </div>
          ))}

          {/* Avancement */}
          {tasks.length > 0 && (
            <div className="mx-2 mt-6 pt-5 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">Progression</span>
                <span className="text-xs font-semibold text-gray-700">{completedCount}/{tasks.length}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: tasks.length > 0 ? `${(completedCount / tasks.length) * 100}%` : '0%' }}
                />
              </div>
            </div>
          )}
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 py-8 pl-4 pr-6 space-y-5">

          {/* ── Insights maître d'œuvre ─────────────────────────────────── */}
          {(insightsLoading || (insights?.global?.length ?? 0) > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {insightsLoading ? (
                [1, 2].map(i => <div key={i} className="h-7 w-36 bg-gray-100 rounded-full animate-pulse" />)
              ) : (
                insights?.global.map((item, i) => {
                  const s = INSIGHT_STYLES[item.type];
                  return (
                    <span key={i} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${s.bg} ${s.text} ${s.border}`}>
                      {item.icon && <span className="leading-none">{item.icon}</span>}
                      {item.text}
                    </span>
                  );
                })
              )}
            </div>
          )}

          {/* Prochaine action */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="bg-blue-600 px-5 py-3 flex items-center gap-2">
              <ChevronRight className="h-4 w-4 text-blue-200" />
              <span className="text-sm font-semibold text-white">Prochaine action</span>
              {result.prochaineAction.deadline && (
                <span className="ml-auto flex items-center gap-1.5 text-blue-200 text-xs bg-blue-700/50 px-2 py-0.5 rounded-full">
                  <Clock className="h-3 w-3" />
                  {result.prochaineAction.deadline}
                </span>
              )}
            </div>
            <div className="px-5 py-5">
              <h2 className="text-base font-bold text-gray-900 mb-2">{result.prochaineAction.titre}</h2>
              <p className="text-sm text-gray-500 leading-relaxed">{result.prochaineAction.detail}</p>
            </div>
          </div>

          {/* Checklist */}
          {tasks.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 text-sm">Liste de tâches</h3>
                <span className="text-xs text-gray-400">{completedCount}/{tasks.length} terminées</span>
              </div>
              <div className="divide-y divide-gray-50">
                {orderedTasks.map((task, idx) => (
                  <div
                    key={task.id ?? idx}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/60 transition-colors cursor-pointer select-none"
                    onClick={() => handleToggle(task)}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                      task.done ? 'bg-emerald-500 border-emerald-500' : 'border-gray-200 hover:border-gray-400'
                    }`}>
                      {task.done && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className={`flex-1 text-sm ${task.done ? 'line-through text-gray-300' : 'text-gray-700'}`}>
                      {task.titre}
                    </span>
                    {task.priorite === 'urgent' && !task.done && (
                      <span className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        Urgent
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Démarches */}
          {formalitesObligatoires.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 text-sm">Démarches à effectuer</h3>
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                  {formalitesObligatoires.length} démarche{formalitesObligatoires.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {formalitesObligatoires.map((f, i) => (
                  <div key={i} className="flex items-start gap-3 px-5 py-4">
                    <span className="text-xl shrink-0 mt-0.5">{f.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800">{f.nom}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{f.detail}</p>
                    </div>
                    <span className="shrink-0 text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
                      Obligatoire
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Aides & financement */}
          {result.aides.filter(a => a.eligible).length > 0 && (
            <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold text-emerald-800">Aides auxquelles vous pouvez prétendre</span>
              </div>
              <div className="space-y-2">
                {result.aides.filter(a => a.eligible).map((a, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="text-base">{a.emoji}</span>
                    <div>
                      <span className="text-sm font-medium text-emerald-900">{a.nom}</span>
                      {a.montant != null && (
                        <span className="ml-2 text-xs font-semibold text-emerald-700">
                          {a.montant > 0 ? `jusqu'à ${fmtEuro(a.montant)}` : ''}
                        </span>
                      )}
                      <p className="text-xs text-emerald-700 mt-0.5">{a.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Budget récapitulatif simple */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 text-sm">Budget estimatif</h3>
              <span className="text-sm font-bold text-gray-900">{fmtEuro(budgetMin)} – {fmtEuro(budgetMax)}</span>
            </div>
            <div className="space-y-2">
              {result.lignesBudget.slice(0, 5).map((l, i) => {
                const pct = result.budgetTotal > 0 ? (l.montant / result.budgetTotal) * 100 : 0;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: l.couleur || '#6366f1' }}
                    />
                    <span className="text-xs text-gray-600 flex-1 truncate">{l.label}</span>
                    <span className="text-xs text-gray-400 shrink-0">{fmtEuro(l.montant)}</span>
                    <div className="w-20 h-1.5 bg-gray-100 rounded-full shrink-0 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: l.couleur || '#6366f1' }}
                      />
                    </div>
                  </div>
                );
              })}
              {result.lignesBudget.length > 5 && (
                <p className="text-xs text-gray-400 pl-5">+{result.lignesBudget.length - 5} autres postes</p>
              )}
            </div>
          </div>

          {/* Documents à fournir (artisans) */}
          {result.artisans.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="px-5 py-4 border-b border-gray-50">
                <h3 className="font-semibold text-gray-900 text-sm">Artisans à consulter</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {result.artisans.map((a, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                    <span className="text-xl shrink-0">{a.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{a.metier}</p>
                      <p className="text-xs text-gray-400 truncate">{a.role}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      a.statut === 'ok'
                        ? 'bg-emerald-50 text-emerald-700'
                        : a.statut === 'a_contacter'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-gray-100 text-gray-500'
                    }`}>
                      {a.statut === 'ok' ? 'Trouvé ✓' : a.statut === 'a_contacter' ? 'À contacter' : 'À trouver'}
                    </span>
                    <FileText className="h-4 w-4 text-gray-300" />
                  </div>
                ))}
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
