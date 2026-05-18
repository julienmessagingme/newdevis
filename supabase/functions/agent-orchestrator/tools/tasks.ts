// Tools tâches checklist : create_task + complete_task. Batch-safe.
import { Handler, Tool, API_BASE } from "./shared.ts";

export const BATCH_SCHEMAS: Tool[] = [
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Crée une tâche dans la checklist du chantier.",
      parameters: {
        type: "object",
        properties: {
          titre:    { type: "string", description: "Titre de la tâche" },
          priorite: { type: "string", enum: ["urgent", "important", "normal"], description: "Priorité" },
        },
        required: ["titre", "priorite"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description:
        "Marque une tâche existante comme terminée.\n" +
        "Passe de PRÉFÉRENCE task_id — récupère-le via get_chantier_data query_type='list_tasks'. " +
        "Le matching par titre exact (fallback) échoue dès que le libellé n'est pas reproduit au caractère près.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "UUID de la tâche (préféré — via get_chantier_data list_tasks)" },
          titre:   { type: "string", description: "Titre exact de la tâche (fallback si task_id inconnu)" },
        },
        required: [],
      },
    },
  },
];

export const ACTION_SCHEMAS: Tool[] = [];

export const handlers: Record<string, Handler> = {
  create_task: async ({ chantierId, headers, args }) => {
    const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/taches`, {
      method: "POST", headers,
      body: JSON.stringify({ titre: args.titre, priorite: args.priorite }),
    });
    return JSON.stringify({ ok: res.ok, data: await res.json() });
  },

  complete_task: async ({ chantierId, headers, args }) => {
    const taskId = typeof args.task_id === "string" ? args.task_id.trim() : "";
    const titre = typeof args.titre === "string" ? args.titre.trim() : "";
    if (!taskId && !titre) {
      return JSON.stringify({
        ok: false,
        error: "task_id ou titre requis. Récupère la liste des tâches via get_chantier_data query_type='list_tasks' pour obtenir le task_id.",
      });
    }
    // id prioritaire (matching fiable) ; titre = fallback rétro-compatible.
    const body: Record<string, unknown> = { done: true };
    if (taskId) body.id = taskId;
    else body.titre = titre;

    const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/taches`, {
      method: "PATCH", headers, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return JSON.stringify({
        ok: false,
        error: `complete_task ${res.status}`,
        data,
        hint: "Tâche introuvable. Récupère le bon task_id via get_chantier_data query_type='list_tasks'.",
      });
    }
    return JSON.stringify({ ok: true, data });
  },
};
