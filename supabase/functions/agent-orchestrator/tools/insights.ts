// Tools insights/clarifications : log_insight + request_clarification.
// Batch-safe — utilisés en fin de chaque run pour journaliser.
import { Handler, Tool, API_BASE } from "./shared.ts";

export const BATCH_SCHEMAS: Tool[] = [
  {
    type: "function",
    function: {
      name: "log_insight",
      description: "Enregistre ton analyse ET les actions que tu as prises. TOUJOURS appeler en dernier.",
      parameters: {
        type: "object",
        properties: {
          type:     { type: "string", enum: ["planning_impact", "budget_alert", "conversation_summary", "risk_detected", "lot_status_change", "needs_clarification"] },
          severity: { type: "string", enum: ["info", "warning", "critical"] },
          title:    { type: "string", description: "Titre court" },
          body:     { type: "string", description: "Détail en markdown" },
          needs_confirmation: { type: "boolean" },
          actions_summary: {
            type: "array",
            description: "Résumé lisible de chaque action prise.",
            items: {
              type: "object",
              properties: {
                tool:    { type: "string" },
                summary: { type: "string", description: "Description lisible en français" },
              },
              required: ["tool", "summary"],
            },
          },
        },
        required: ["type", "severity", "title", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_clarification",
      description: "Le numéro de téléphone n'est pas associé à un lot. Crée une tâche urgente pour que l'utilisateur identifie le contact. NE modifie PAS le planning.",
      parameters: {
        type: "object",
        properties: {
          phone:           { type: "string", description: "Numéro de téléphone inconnu" },
          message_summary: { type: "string", description: "Résumé du message reçu" },
          message_id:      { type: "string", description: "ID du message WhatsApp original" },
          suggested_lot:   { type: "string", description: "Lot le plus probable (optionnel)" },
        },
        required: ["phone", "message_summary"],
      },
    },
  },
];

export const ACTION_SCHEMAS: Tool[] = [];

export const handlers: Record<string, Handler> = {
  log_insight: async ({ chantierId, headers, args }) => {
    const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/agent-insights`, {
      method: "POST", headers,
      body: JSON.stringify({
        type: args.type, severity: args.severity, title: args.title, body: args.body,
        needs_confirmation: args.needs_confirmation ?? false,
        actions_taken: args.actions_summary ?? [],
        source_event: {},
      }),
    });
    return JSON.stringify({ ok: res.ok, data: await res.json() });
  },

  request_clarification: async ({ chantierId, headers, args }) => {
    const [insightRes, taskRes] = await Promise.all([
      fetch(`${API_BASE}/api/chantier/${chantierId}/agent-insights`, {
        method: "POST", headers,
        body: JSON.stringify({
          type: "needs_clarification", severity: "warning",
          title: `Numéro inconnu : ${args.phone}`, body: args.message_summary,
          needs_confirmation: true,
          source_event: { phone: args.phone, message_id: args.message_id, suggested_lot: args.suggested_lot },
        }),
      }),
      fetch(`${API_BASE}/api/chantier/${chantierId}/taches`, {
        method: "POST", headers,
        body: JSON.stringify({ titre: `Identifier le contact ${args.phone}`, priorite: "urgent" }),
      }),
    ]);
    return JSON.stringify({
      ok: insightRes.ok && taskRes.ok,
      insight: await insightRes.json(),
      task: await taskRes.json(),
    });
  },
};
