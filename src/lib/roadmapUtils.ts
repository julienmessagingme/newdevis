import type { RoadmapTask, TaskPhase } from "@/types/roadmap";
import type { ChantierDashboard } from "@/types/chantier-dashboard";

// ── Labels de phases ───────────────────────────────────────────────────────────
export const PHASE_LABELS: Record<TaskPhase, string> = {
  preparation:   "Préparation du projet",
  selection:     "Sélection des artisans",
  administratif: "Démarches administratives",
  chantier:      "Travaux en cours",
  fin:           "Clôture du chantier",
};

// ── Seed : tâches par défaut ───────────────────────────────────────────────────
export const DEFAULT_TASKS: RoadmapTask[] = [
  {
    id: "add_devis",
    title: "Ajouter les devis",
    description: "Importez les devis reçus de vos artisans",
    status: "todo",
    phase: "selection",
    priority: "high",
    isAutomatic: true,
  },
  {
    id: "compare_devis",
    title: "Comparer les devis",
    description: "Analysez et comparez les offres reçues",
    status: "todo",
    phase: "selection",
    priority: "high",
    isAutomatic: true,
  },
  {
    id: "check_assurances",
    title: "Vérifier les assurances artisans",
    description: "Décennale et RC Pro obligatoires avant signature",
    status: "todo",
    phase: "selection",
    priority: "high",
    isAutomatic: true,
  },
  {
    id: "choose_artisan",
    title: "Choisir les artisans",
    description: "Sélectionnez les prestataires retenus",
    status: "todo",
    phase: "selection",
    priority: "high",
    isAutomatic: true,
  },
  {
    id: "sign_devis",
    title: "Signer les devis",
    description: "Finalisez les contrats avec les artisans",
    status: "todo",
    phase: "selection",
    priority: "high",
    isAutomatic: true,
  },
  {
    id: "declaration_prealable",
    title: "Déposer la déclaration préalable",
    description: "Obligatoire selon la nature des travaux",
    status: "todo",
    phase: "administratif",
    priority: "medium",
    isAutomatic: false,
  },
  {
    id: "plan_demarrage",
    title: "Planifier le démarrage",
    description: "Coordonnez les dates avec vos artisans",
    status: "todo",
    phase: "administratif",
    priority: "medium",
    isAutomatic: false,
  },
  {
    id: "premiere_reunion",
    title: "Première réunion de chantier",
    description: "Lancez officiellement les travaux",
    status: "todo",
    phase: "chantier",
    priority: "medium",
    isAutomatic: false,
  },
  {
    id: "suivi_photos",
    title: "Suivi photos chantier",
    description: "Documentez l'avancement régulièrement",
    status: "todo",
    phase: "chantier",
    priority: "low",
    isAutomatic: false,
  },
  {
    id: "suivi_factures",
    title: "Suivi des factures",
    description: "Vérifiez et archivez chaque facture reçue",
    status: "todo",
    phase: "chantier",
    priority: "medium",
    isAutomatic: false,
  },
  {
    id: "reception",
    title: "Réception du chantier",
    description: "Levée des réserves et PV de réception",
    status: "todo",
    phase: "fin",
    priority: "high",
    isAutomatic: false,
  },
  {
    id: "cloture",
    title: "Clôture du projet",
    description: "Bilan final, archivage, garanties",
    status: "todo",
    phase: "fin",
    priority: "low",
    isAutomatic: false,
  },
];

// ── Auto-détection à partir des données du chantier ───────────────────────────
export function computeTasksFromChantier(
  chantier?: ChantierDashboard | null
): RoadmapTask[] {
  // Deep clone pour ne pas muter le seed
  const tasks: RoadmapTask[] = DEFAULT_TASKS.map((t) => ({ ...t }));

  if (!chantier) {
    // Aucun chantier → première tâche en cours
    tasks[0].status = "in_progress";
    return tasks;
  }

  const { devis } = chantier;
  const hasDevis        = devis.length > 0;
  const hasMultiple     = devis.length >= 2;
  const hasSignedDevis  = devis.some((d) =>
    ["signe", "en_cours", "termine"].includes(d.statut)
  );

  // Mise à jour automatique des tâches isAutomatic
  for (const task of tasks) {
    if (!task.isAutomatic) continue;

    switch (task.id) {
      case "add_devis":
        task.status = hasDevis ? "done" : "todo";
        break;

      case "compare_devis":
        task.status = hasMultiple ? "done" : hasDevis ? "in_progress" : "todo";
        break;

      case "check_assurances":
        // Si des devis existent mais aucun n'est signé → warning (à vérifier avant)
        if (!hasDevis) {
          task.status = "todo";
        } else if (hasSignedDevis) {
          task.status = "done";
        } else {
          task.status = "warning";
        }
        break;

      case "choose_artisan":
        task.status = hasSignedDevis ? "done" : hasDevis ? "in_progress" : "todo";
        break;

      case "sign_devis":
        task.status = hasSignedDevis ? "done" : hasDevis ? "in_progress" : "todo";
        break;
    }
  }

  // S'il n'y a aucune tâche in_progress, promouvoir la première tâche "todo"
  const hasInProgress = tasks.some((t) => t.status === "in_progress");
  if (!hasInProgress) {
    const firstTodo = tasks.find((t) => t.status === "todo");
    if (firstTodo) firstTodo.status = "in_progress";
  }

  return tasks;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Progression = tâches "done" / total (en %) */
export function calculateProgress(tasks: RoadmapTask[]): number {
  if (tasks.length === 0) return 0;
  const done = tasks.filter((t) => t.status === "done").length;
  return Math.round((done / tasks.length) * 100);
}

/** Retourne les N prochaines actions à faire (non-done, triées par priorité) */
export function getNextActions(tasks: RoadmapTask[], count = 3): RoadmapTask[] {
  const ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return tasks
    .filter((t) => t.status !== "done")
    .sort((a, b) => ORDER[a.priority] - ORDER[b.priority])
    .slice(0, count);
}

/** Regroupe les tâches par phase */
export function groupTasksByPhase(
  tasks: RoadmapTask[]
): Record<TaskPhase, RoadmapTask[]> {
  const phases: TaskPhase[] = [
    "preparation",
    "selection",
    "administratif",
    "chantier",
    "fin",
  ];
  const grouped = {} as Record<TaskPhase, RoadmapTask[]>;
  for (const phase of phases) {
    grouped[phase] = tasks.filter((t) => t.phase === phase);
  }
  return grouped;
}
