import { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Circle,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react";
import type { ChantierDashboard } from "@/types/chantier-dashboard";
import type { RoadmapTask, TaskStatus } from "@/types/roadmap";
import {
  computeTasksFromChantier,
  calculateProgress,
  getNextActions,
  PHASE_LABELS,
} from "@/lib/roadmapUtils";

// ── Config visuelle par statut ─────────────────────────────────────────────────
const STATUS_CONFIG: Record<
  TaskStatus,
  {
    icon: React.ReactNode;
    iconClass: string;
    rowClass: string;
    titleClass: string;
  }
> = {
  done: {
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    iconClass: "text-green-400",
    rowClass: "",
    titleClass: "text-slate-500",
  },
  in_progress: {
    icon: <ChevronRight className="h-3.5 w-3.5" />,
    iconClass: "text-blue-400",
    rowClass: "bg-blue-500/10 border border-blue-500/20 rounded-lg",
    titleClass: "text-white font-medium",
  },
  warning: {
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    iconClass: "text-orange-400",
    rowClass: "bg-orange-500/8 border border-orange-500/20 rounded-lg",
    titleClass: "text-orange-200 font-medium",
  },
  todo: {
    icon: <Circle className="h-3.5 w-3.5" />,
    iconClass: "text-slate-700",
    rowClass: "",
    titleClass: "text-slate-500",
  },
};

// ── Couleur de la jauge selon le % ─────────────────────────────────────────────
function getBarColor(pct: number): string {
  if (pct >= 80) return "from-green-500 to-emerald-400";
  if (pct >= 50) return "from-blue-500 to-cyan-400";
  return "from-blue-600 to-blue-400";
}

// ── Ligne de tâche ─────────────────────────────────────────────────────────────
function TaskRow({ task }: { task: RoadmapTask }) {
  const cfg = STATUS_CONFIG[task.status];
  return (
    <div
      className={`flex items-center gap-2.5 px-2.5 py-2 transition-colors ${cfg.rowClass}`}
    >
      <span className={`flex-shrink-0 ${cfg.iconClass}`}>{cfg.icon}</span>
      <span className={`text-sm leading-tight truncate ${cfg.titleClass}`}>
        {task.title}
      </span>
    </div>
  );
}

// ── Composant principal ────────────────────────────────────────────────────────
interface ProjectRoadmapCardProps {
  chantier?: ChantierDashboard | null;
  delay?: number;
}

export default function ProjectRoadmapCard({
  chantier,
  delay = 0,
}: ProjectRoadmapCardProps) {
  const [expanded, setExpanded] = useState(false);

  const tasks        = computeTasksFromChantier(chantier);
  const progress     = calculateProgress(tasks);
  const nextActions  = getNextActions(tasks);
  const barColor     = getBarColor(progress);

  // Phase courante = phase de la 1ère tâche active (in_progress ou warning)
  const activeTask   = tasks.find(
    (t) => t.status === "in_progress" || t.status === "warning"
  );
  const currentPhase = PHASE_LABELS[activeTask?.phase ?? "fin"];

  // Vue réduite : 2 dernières "done" + toutes les actives + 3 prochaines "todo"
  const doneTasks     = tasks.filter((t) => t.status === "done");
  const activeTasks   = tasks.filter(
    (t) => t.status === "in_progress" || t.status === "warning"
  );
  const upcomingTasks = tasks.filter((t) => t.status === "todo");

  const collapsedTasks: RoadmapTask[] = [
    ...doneTasks.slice(-2),
    ...activeTasks,
    ...upcomingTasks.slice(0, 3),
  ];
  const hiddenCount = tasks.length - collapsedTasks.length;

  const visibleTasks = expanded ? tasks : collapsedTasks;

  return (
    <div
      className="bg-[#162035] border border-white/10 rounded-2xl p-5 animate-fade-up"
      style={{ animationDelay: `${delay}s`, animationFillMode: "both" }}
    >

      {/* ── Header : titre + % ── */}
      <div className="flex items-start justify-between mb-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Feuille de route
        </p>
        <span className="font-display text-2xl font-bold text-white leading-none">
          {progress}%
        </span>
      </div>

      {/* Phase actuelle */}
      <p className="text-xs text-slate-400 mb-3">
        Phase actuelle :{" "}
        <span className="text-slate-200 font-medium">{currentPhase}</span>
      </p>

      {/* ── Barre de progression ── */}
      <div className="h-1.5 rounded-full bg-white/8 mb-5 overflow-hidden">
        <div
          className={`h-1.5 rounded-full bg-gradient-to-r ${barColor} transition-all duration-1000`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* ── Liste des tâches ── */}
      <div className="flex flex-col gap-0.5 mb-1">
        {visibleTasks.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </div>

      {/* ── Toggle tout voir ── */}
      {hiddenCount > 0 || expanded ? (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-400 transition-colors mt-1"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" />
              Réduire
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              Voir les {hiddenCount} étapes suivantes
            </>
          )}
        </button>
      ) : null}

      {/* ── Actions recommandées ── */}
      {nextActions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/5">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Zap className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Actions recommandées cette semaine
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {nextActions.map((action) => (
              <div key={action.id} className="flex items-start gap-2">
                <span className="text-slate-600 mt-0.5 text-xs flex-shrink-0 select-none">
                  •
                </span>
                <span className="text-sm text-slate-300 leading-tight">
                  {action.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
