// Tools statuts lot : update_lot_status (batch) + mark_lot_completed (action).
import { Handler, Tool, API_BASE } from "./shared.ts";

export const BATCH_SCHEMAS: Tool[] = [
  {
    type: "function",
    function: {
      name: "update_lot_status",
      description: "Change le statut d'un lot (a_faire → en_cours → termine).",
      parameters: {
        type: "object",
        properties: {
          lot_id: { type: "string", description: "ID UUID du lot" },
          statut: { type: "string", enum: ["a_faire", "en_cours", "termine"], description: "Nouveau statut" },
          raison: { type: "string", description: "Raison du changement" },
        },
        required: ["lot_id", "statut", "raison"],
      },
    },
  },
];

export const ACTION_SCHEMAS: Tool[] = [
  {
    type: "function",
    function: {
      name: "mark_lot_completed",
      description: "Marque un lot comme terminé et y associe un document preuve (optionnel). REQUIERT une confirmation explicite de l'utilisateur.",
      parameters: {
        type: "object",
        properties: {
          lot_id:          { type: "string", description: "ID UUID du lot" },
          evidence_doc_id: { type: "string", description: "ID UUID du document preuve (optionnel)" },
          raison:          { type: "string", description: "Confirmation ou raison du passage en terminé" },
        },
        required: ["lot_id", "raison"],
      },
    },
  },
];

export const handlers: Record<string, Handler> = {
  update_lot_status: async ({ chantierId, headers, args }) => {
    const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/lots`, {
      method: "PATCH", headers,
      body: JSON.stringify({ lot_id: args.lot_id, statut: args.statut, raison: args.raison }),
    });
    return JSON.stringify({ ok: res.ok, data: await res.json() });
  },

  mark_lot_completed: async ({ chantierId, headers, args }) => {
    const body: Record<string, unknown> = {
      lot_id: args.lot_id, statut: "termine", raison: args.raison,
    };
    if (args.evidence_doc_id) body.evidence_doc_id = args.evidence_doc_id;
    const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/lots`, {
      method: "PATCH", headers, body: JSON.stringify(body),
    });
    return JSON.stringify({ ok: res.ok, data: await res.json() });
  },
};
