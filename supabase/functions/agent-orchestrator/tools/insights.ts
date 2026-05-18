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
  // request_clarification : RETIRÉ du schéma (2026-05-18). Le tool était devenu
  // obsolète (un participant de groupe WhatsApp n'est jamais un "inconnu"). Le
  // retirer du schéma garantit que Gemini ne peut plus l'appeler — plus fiable
  // que de compter sur une consigne de prompt. Le handler reste défini plus bas
  // comme no-op défensif (au cas où un ancien pending_decision le référencerait).
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

  // request_clarification — NEUTRALISÉ (2026-05-18).
  // Avant : créait une tâche URGENTE "Identifier le contact <num>" + une alerte
  // "Numéro inconnu". Or un participant d'un groupe WhatsApp est forcément
  // quelqu'un que le propriétaire a ajouté lui-même (souvent son propre numéro) —
  // ce n'est JAMAIS un inconnu. Cette alerte était inutile et revenait chaque
  // jour dans le digest. Le tool reste exposé pour compat schéma mais ne produit
  // plus aucun artefact (ni tâche, ni insight).
  request_clarification: async ({ args }) => {
    return JSON.stringify({
      ok: true,
      noop: true,
      note: `Aucune action requise : le participant ${args.phone ?? "?"} fait partie d'un groupe WhatsApp du chantier, il est donc légitime. Utilise le nom du groupe pour rattacher son message à un lot.`,
    });
  },
};
