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
      description: "Marque une tâche existante comme terminée.",
      parameters: {
        type: "object",
        properties: {
          titre: { type: "string", description: "Titre exact de la tâche à compléter" },
        },
        required: ["titre"],
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
    const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/taches`, {
      method: "PATCH", headers,
      body: JSON.stringify({ titre: args.titre, done: true }),
    });
    return JSON.stringify({ ok: res.ok, data: await res.json() });
  },
};
