// ── Types Feuille de route chantier ───────────────────────────────────────────

export type TaskStatus = "done" | "in_progress" | "todo" | "warning";

export type TaskPhase =
  | "preparation"
  | "selection"
  | "administratif"
  | "chantier"
  | "fin";

export type TaskPriority = "low" | "medium" | "high";

export type RoadmapTask = {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  phase: TaskPhase;
  priority: TaskPriority;
  dueDate?: string;
  isAutomatic: boolean;
};
