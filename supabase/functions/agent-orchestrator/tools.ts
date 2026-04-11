import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const AGENT_SECRET_KEY = Deno.env.get("AGENT_SECRET_KEY") ?? "";
const API_BASE = Deno.env.get("API_BASE") ?? "https://www.verifiermondevis.fr";

export const TOOLS_SCHEMA = [
  {
    type: "function",
    function: {
      name: "update_planning",
      description: "Met à jour le planning d'un lot (date de début, durée). Déclenche le recalcul en cascade via l'API existante.",
      parameters: {
        type: "object",
        properties: {
          lot_id: { type: "string", description: "ID UUID du lot" },
          date_debut: { type: "string", description: "Nouvelle date de début (YYYY-MM-DD)" },
          duree_jours: { type: "number", description: "Nouvelle durée en jours ouvrés" },
          raison: { type: "string", description: "Raison de la modification (pour le journal)" },
        },
        required: ["lot_id", "raison"],
      },
    },
  },
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
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Crée une tâche dans la checklist du chantier.",
      parameters: {
        type: "object",
        properties: {
          titre: { type: "string", description: "Titre de la tâche" },
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
  {
    type: "function",
    function: {
      name: "log_insight",
      description: "Enregistre ton analyse ET les actions que tu as prises. TOUJOURS appeler en dernier.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["planning_impact", "budget_alert", "conversation_summary", "risk_detected", "lot_status_change", "needs_clarification"] },
          severity: { type: "string", enum: ["info", "warning", "critical"] },
          title: { type: "string", description: "Titre court" },
          body: { type: "string", description: "Détail en markdown" },
          needs_confirmation: { type: "boolean" },
          actions_summary: {
            type: "array",
            description: "Résumé lisible de chaque action prise. Ex: [{tool:'update_planning', summary:'Lot Plomberie décalé 14→21 avril'}]",
            items: {
              type: "object",
              properties: {
                tool: { type: "string" },
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
      name: "get_message_read_status",
      description: "Interroge les accusés de lecture des 3 derniers messages envoyés à un contact spécifique. Utilise avant de créer une tâche de relance pour calibrer le ton (pas lu → patience ou relance ferme, lu sans réponse → suivi actif).",
      parameters: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Numéro du contact au format 33XXXXXXXXX (sans +)" },
        },
        required: ["phone"],
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
          phone: { type: "string", description: "Numéro de téléphone inconnu" },
          message_summary: { type: "string", description: "Résumé du message reçu" },
          message_id: { type: "string", description: "ID du message WhatsApp original" },
          suggested_lot: { type: "string", description: "Lot le plus probable d'après le contenu du message (optionnel)" },
        },
        required: ["phone", "message_summary"],
      },
    },
  },
];

export async function executeTool(
  chantierId: string,
  toolName: string,
  args: Record<string, unknown>,
  meta: { run_type: string },
): Promise<string> {
  const headers: Record<string, string> = {
    "X-Agent-Key": AGENT_SECRET_KEY,
    "Content-Type": "application/json",
  };

  try {
    switch (toolName) {
      case "update_planning": {
        const lotUpdate: Record<string, unknown> = { id: args.lot_id };
        if (args.date_debut) lotUpdate.date_debut = args.date_debut;
        if (args.duree_jours) lotUpdate.duree_jours = args.duree_jours;
        const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/planning`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ lots: [lotUpdate] }),
        });
        const data = await res.json();
        return JSON.stringify({ ok: res.ok, data });
      }

      case "update_lot_status": {
        const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/lots`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            lot_id: args.lot_id,
            statut: args.statut,
            raison: args.raison,
          }),
        });
        const data = await res.json();
        return JSON.stringify({ ok: res.ok, data });
      }

      case "create_task": {
        const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/taches`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            titre: args.titre,
            priorite: args.priorite,
          }),
        });
        const data = await res.json();
        return JSON.stringify({ ok: res.ok, data });
      }

      case "complete_task": {
        const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/taches`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            titre: args.titre,
            done: true,
          }),
        });
        const data = await res.json();
        return JSON.stringify({ ok: res.ok, data });
      }

      case "log_insight": {
        const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/agent-insights`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            type: args.type,
            severity: args.severity,
            title: args.title,
            body: args.body,
            needs_confirmation: args.needs_confirmation ?? false,
            actions_taken: args.actions_summary ?? [],
            source_event: {},
          }),
        });
        const data = await res.json();
        return JSON.stringify({ ok: res.ok, data });
      }

      case "get_message_read_status": {
        const phone = String(args.phone ?? "").replace(/^\+/, "");
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        // Fetch last 3 outgoing messages + statuses for this viewer_phone
        const { data: statuses, error } = await supabase
          .from("whatsapp_message_statuses")
          .select("message_id, status, updated_at, whatsapp_outgoing_messages(body, sent_at, group_jid)")
          .eq("viewer_phone", phone)
          .eq("chantier_id", chantierId)
          .order("updated_at", { ascending: false })
          .limit(3);

        if (error) return JSON.stringify({ ok: false, error: error.message });
        if (!statuses || statuses.length === 0) {
          return JSON.stringify({ ok: true, phone, result: "Aucun accusé de lecture trouvé pour ce contact." });
        }

        const rows = statuses.map((s: any) => {
          const msg = s.whatsapp_outgoing_messages;
          const sentAt = msg?.sent_at ? new Date(msg.sent_at).getTime() : 0;
          const hoursAgo = Math.round((Date.now() - new Date(s.updated_at).getTime()) / 3600000);
          const hoursSinceSent = sentAt ? Math.round((new Date(s.updated_at).getTime() - sentAt) / 3600000) : null;
          return {
            status: s.status,
            updated_at: s.updated_at,
            hours_ago: hoursAgo,
            hours_since_sent: hoursSinceSent,
            body_preview: (msg?.body ?? "").slice(0, 100),
            sent_at: msg?.sent_at,
          };
        });

        return JSON.stringify({ ok: true, phone, statuses: rows });
      }

      case "request_clarification": {
        // Creates both an insight AND a task
        const insightRes = await fetch(`${API_BASE}/api/chantier/${chantierId}/agent-insights`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            type: "needs_clarification",
            severity: "warning",
            title: `Numéro inconnu : ${args.phone}`,
            body: args.message_summary,
            needs_confirmation: true,
            source_event: { phone: args.phone, message_id: args.message_id, suggested_lot: args.suggested_lot },
          }),
        });

        const taskRes = await fetch(`${API_BASE}/api/chantier/${chantierId}/taches`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            titre: `Identifier le contact ${args.phone}`,
            priorite: "urgent",
          }),
        });

        return JSON.stringify({
          ok: insightRes.ok && taskRes.ok,
          insight: await insightRes.json(),
          task: await taskRes.json(),
        });
      }

      default:
        return JSON.stringify({ ok: false, error: `Unknown tool: ${toolName}` });
    }
  } catch (err) {
    return JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}
