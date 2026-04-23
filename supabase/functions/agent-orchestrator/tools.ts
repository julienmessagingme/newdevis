import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const AGENT_SECRET_KEY = Deno.env.get("AGENT_SECRET_KEY") ?? "";
const API_BASE = Deno.env.get("API_BASE") ?? "https://www.verifiermondevis.fr";
const WHAPI_TOKEN = Deno.env.get("WHAPI_TOKEN") ?? "";

// ── Tools available in morning / evening runs (no irreversible actions) ──────

export const TOOLS_SCHEMA_BATCH = [
  {
    type: "function",
    function: {
      name: "update_planning",
      description: "Modifie le planning d'un lot : durée, délai, OU dépendances. Déclenche le recalcul cascade via CPM.\n\n- duree_jours : nouvelle durée (ex: '+5j car surprise démolition').\n- delai_avant_jours : décale le lot de N jours ouvrés sans toucher aux prédécesseurs (ex: 'bouge plomberie d'1 semaine' → 5).\n- depends_on_ids : liste des prédécesseurs du lot (REMPLACE la liste complète). Utiliser pour structurer le graph : ex. 'Plaquiste démarre quand Plombier ET Électricien ont fini' → depends_on_ids=[plombier_id, elec_id]. Vide [] = lot démarre à startDate.\n\nTu peux combiner plusieurs champs dans le même appel.",
      parameters: {
        type: "object",
        properties: {
          lot_id:             { type: "string", description: "ID UUID du lot à modifier" },
          duree_jours:        { type: "number", description: "Nouvelle durée en jours ouvrés (optionnel)" },
          delai_avant_jours:  { type: "number", description: "Délai en jours ouvrés avant ce lot (optionnel, 0 = aucun)" },
          depends_on_ids:     { type: "array", items: { type: "string" }, description: "Liste des prédécesseurs du lot (UUIDs). Remplace la liste courante. Optionnel." },
          raison:             { type: "string", description: "Raison de la modification (pour le journal)" },
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
          titre:   { type: "string", description: "Titre de la tâche" },
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
      name: "get_message_read_status",
      description: "Interroge les accusés de lecture des 3 derniers messages envoyés à un contact spécifique.",
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
          phone:           { type: "string", description: "Numéro de téléphone inconnu" },
          message_summary: { type: "string", description: "Résumé du message reçu" },
          message_id:      { type: "string", description: "ID du message WhatsApp original" },
          suggested_lot:   { type: "string", description: "Lot le plus probable (optionnel)" },
        },
        required: ["phone", "message_summary"],
      },
    },
  },
  // ── Read-only query tools (safe for all run types) ────────────────────────
  {
    type: "function",
    function: {
      name: "get_chantier_summary",
      description: "Retourne l'état général du chantier : informations, lots avec statuts et dates, budget.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_chantier_planning",
      description: "Retourne le détail du planning : ordre des lots, dates, durée, statut, groupes parallèles.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_chantier_data",
      description: "Requête ad-hoc sur les données du chantier.",
      parameters: {
        type: "object",
        properties: {
          query_type: {
            type: "string",
            enum: ["count_devis", "sum_travaux_en_cours", "sum_travaux_totaux", "list_documents", "list_intervenants"],
            description: "Type de requête à exécuter",
          },
        },
        required: ["query_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_photos",
      description: "Retourne les photos WhatsApp récentes avec leur description Vision IA.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Nombre de jours en arrière (défaut: 7)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_chantier_groups",
      description: "Liste les groupes WhatsApp du chantier avec leurs membres actifs.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_contacts_chantier",
      description: "Retourne les contacts du chantier, optionnellement filtrés par lot ou par rôle.",
      parameters: {
        type: "object",
        properties: {
          lot_id: { type: "string", description: "Filtrer par lot UUID (optionnel)" },
          role:   { type: "string", description: "Filtrer par rôle (artisan, architecte, maitre_oeuvre, client, autre — optionnel)" },
        },
        required: [],
      },
    },
  },
];

// ── Additional action tools — INTERACTIVE mode only ──────────────────────────
// These tools can have irreversible effects. They MUST NOT run in morning/evening.

export const ACTION_TOOLS_SCHEMA = [
  {
    type: "function",
    function: {
      name: "arrange_lot",
      description: "Réorganise un lot dans le planning : soit le chaîner APRÈS un autre lot (démarre quand l'autre finit, même ligne visuelle), soit le mettre en PARALLÈLE d'un autre lot (démarre en même temps, ligne distincte). Recalcule les dates en cascade.",
      parameters: {
        type: "object",
        properties: {
          lot_id:           { type: "string", description: "ID UUID du lot à déplacer" },
          mode:             { type: "string", enum: ["chain_after", "parallel_with"], description: "chain_after = enchaîner séquentiellement après le lot de référence / parallel_with = faire tourner en même temps que le lot de référence" },
          reference_lot_id: { type: "string", description: "ID UUID du lot de référence (celui avec qui on chaîne ou parallélise)" },
          raison:           { type: "string", description: "Raison de la réorganisation (pour le journal)" },
        },
        required: ["lot_id", "mode", "reference_lot_id"],
      },
    },
  },
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
  {
    type: "function",
    function: {
      name: "update_lot_dates",
      description: "Décale un lot à une nouvelle date de début et recalcule la cascade. REQUIERT confirmation explicite.",
      parameters: {
        type: "object",
        properties: {
          lot_id:          { type: "string", description: "ID UUID du lot" },
          new_start_date:  { type: "string", description: "Nouvelle date de début (YYYY-MM-DD)" },
          new_end_date:    { type: "string", description: "Nouvelle date de fin (optionnel — calculée depuis duree_jours si absent)" },
          raison:          { type: "string", description: "Raison du décalage" },
        },
        required: ["lot_id", "new_start_date", "raison"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "shift_lot",
      description:
        "Décale un lot dans le temps de N jours ouvrés. Deux modes :\n" +
        "- cascade=true : applique le décalage, les successeurs DAG suivent automatiquement (ex: si plombier décalé, l'élec qui dépend de plombier se décale aussi).\n" +
        "- cascade=false : DÉTACHE le lot de sa chaîne. Les successeurs perdent ce lot comme prédécesseur ET héritent de ses anciens prédécesseurs (ils restent à leur position visuelle). Le lot est mis sur une nouvelle side lane indépendante avec le délai appliqué.\n" +
        "AVANT D'APPELER ce tool : vérifie si le lot a des successeurs DANS LE CONTEXTE. Si oui, demande à l'utilisateur 'cascade ou détache ?' sans appeler le tool. N'appelle le tool QU'APRÈS la réponse explicite de l'utilisateur.",
      parameters: {
        type: "object",
        properties: {
          lot_id:  { type: "string", description: "ID UUID du lot à décaler" },
          jours:   { type: "number", description: "Nombre de jours ouvrés de décalage (positif)" },
          cascade: { type: "boolean", description: "true = successeurs suivent ; false = lot détaché de la chaîne" },
          raison:  { type: "string", description: "Raison du décalage (journal)" },
        },
        required: ["lot_id", "jours", "cascade", "raison"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_whatsapp_message",
      description: "Envoie un message WhatsApp à un groupe ou à un contact individuel. REQUIERT confirmation explicite de l'utilisateur. L'agent ne doit JAMAIS envoyer sans que l'utilisateur ait dit 'ok', 'envoie', 'confirme' ou équivalent.",
      parameters: {
        type: "object",
        properties: {
          to:   { type: "string", description: "JID du groupe (xxx@g.us) ou numéro individuel (33XXXXXXXXX@s.whatsapp.net)" },
          body: { type: "string", description: "Contenu du message à envoyer" },
        },
        required: ["to", "body"],
      },
    },
  },
];

// ── Combined schema for interactive mode ────────────────────────────────────
export const TOOLS_SCHEMA_INTERACTIVE = [...TOOLS_SCHEMA_BATCH, ...ACTION_TOOLS_SCHEMA];

// ── Legacy alias for batch runs ──────────────────────────────────────────────
export const TOOLS_SCHEMA = TOOLS_SCHEMA_BATCH;

// ── Tool executor ─────────────────────────────────────────────────────────────

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

  // Guard: action tools MUST NOT run in morning/evening modes
  const ACTION_TOOLS = ["mark_lot_completed", "update_lot_dates", "send_whatsapp_message", "arrange_lot", "shift_lot"];
  if (ACTION_TOOLS.includes(toolName) && meta.run_type !== "interactive") {
    console.warn(`[tools] Blocked action tool '${toolName}' in '${meta.run_type}' mode`);
    return JSON.stringify({ ok: false, error: `Tool '${toolName}' is only available in interactive mode` });
  }

  try {
    switch (toolName) {
      // ── Existing batch tools ─────────────────────────────────────────────
      case "update_planning": {
        const body: Record<string, unknown> = {};
        const lotUpdate: Record<string, unknown> = { id: args.lot_id };
        if (typeof args.duree_jours === "number") lotUpdate.duree_jours = args.duree_jours;
        if (typeof args.delai_avant_jours === "number") lotUpdate.delai_avant_jours = args.delai_avant_jours;
        if (Object.keys(lotUpdate).length > 1) body.lots = [lotUpdate];
        if (Array.isArray(args.depends_on_ids)) {
          body.dependencies = { [args.lot_id]: args.depends_on_ids };
        }
        const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/planning`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(body),
        });
        return JSON.stringify({ ok: res.ok, data: await res.json() });
      }

      case "update_lot_status": {
        const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/lots`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ lot_id: args.lot_id, statut: args.statut, raison: args.raison }),
        });
        return JSON.stringify({ ok: res.ok, data: await res.json() });
      }

      case "create_task": {
        const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/taches`, {
          method: "POST",
          headers,
          body: JSON.stringify({ titre: args.titre, priorite: args.priorite }),
        });
        return JSON.stringify({ ok: res.ok, data: await res.json() });
      }

      case "complete_task": {
        const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/taches`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ titre: args.titre, done: true }),
        });
        return JSON.stringify({ ok: res.ok, data: await res.json() });
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
        return JSON.stringify({ ok: res.ok, data: await res.json() });
      }

      case "get_message_read_status": {
        const phone = String(args.phone ?? "").replace(/^\+/, "");
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );
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
            status: s.status, updated_at: s.updated_at, hours_ago: hoursAgo,
            hours_since_sent: hoursSinceSent, body_preview: (msg?.body ?? "").slice(0, 100), sent_at: msg?.sent_at,
          };
        });
        return JSON.stringify({ ok: true, phone, statuses: rows });
      }

      case "request_clarification": {
        const [insightRes, taskRes] = await Promise.all([
          fetch(`${API_BASE}/api/chantier/${chantierId}/agent-insights`, {
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
          }),
          fetch(`${API_BASE}/api/chantier/${chantierId}/taches`, {
            method: "POST",
            headers,
            body: JSON.stringify({ titre: `Identifier le contact ${args.phone}`, priorite: "urgent" }),
          }),
        ]);
        return JSON.stringify({
          ok: insightRes.ok && taskRes.ok,
          insight: await insightRes.json(),
          task: await taskRes.json(),
        });
      }

      // ── New read-only query tools ─────────────────────────────────────────
      case "get_chantier_summary": {
        const [planningRes, budgetRes, chantierRes] = await Promise.all([
          fetch(`${API_BASE}/api/chantier/${chantierId}/planning`, { headers }),
          fetch(`${API_BASE}/api/chantier/${chantierId}/budget`, { headers }),
          (async () => {
            const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
            const { data } = await sb.from("chantiers").select("nom, emoji, phase, type_projet").eq("id", chantierId).single();
            return data;
          })(),
        ]);
        const planning = await planningRes.json();
        const budget = await budgetRes.json();
        return JSON.stringify({ ok: true, chantier: chantierRes, lots: planning?.lots ?? [], budget_ia: budget?.budget_ia });
      }

      case "get_chantier_planning": {
        const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/planning`, { headers });
        return JSON.stringify({ ok: res.ok, data: await res.json() });
      }

      case "get_chantier_data": {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );
        const queryType = String(args.query_type ?? "");

        switch (queryType) {
          case "count_devis": {
            const { count } = await supabase
              .from("documents_chantier")
              .select("id", { count: "exact", head: true })
              .eq("chantier_id", chantierId)
              .eq("document_type", "devis");
            return JSON.stringify({ ok: true, count });
          }
          case "sum_travaux_en_cours": {
            const { data } = await supabase
              .from("lots_chantier")
              .select("budget_avg_ht")
              .eq("chantier_id", chantierId)
              .eq("statut", "en_cours");
            const sum = (data ?? []).reduce((acc: number, l: any) => acc + (l.budget_avg_ht ?? 0), 0);
            return JSON.stringify({ ok: true, sum_ht: sum });
          }
          case "sum_travaux_totaux": {
            const { data } = await supabase
              .from("lots_chantier")
              .select("budget_avg_ht")
              .eq("chantier_id", chantierId);
            const sum = (data ?? []).reduce((acc: number, l: any) => acc + (l.budget_avg_ht ?? 0), 0);
            return JSON.stringify({ ok: true, sum_ht: sum });
          }
          case "list_documents": {
            const { data } = await supabase
              .from("documents_chantier")
              .select("id, nom, document_type, source, created_at, lot_id")
              .eq("chantier_id", chantierId)
              .order("created_at", { ascending: false })
              .limit(20);
            return JSON.stringify({ ok: true, documents: data ?? [] });
          }
          case "list_intervenants": {
            const { data } = await supabase
              .from("contacts_chantier")
              .select("nom, telephone, role, contact_category, lot_id")
              .eq("chantier_id", chantierId);
            return JSON.stringify({ ok: true, contacts: data ?? [] });
          }
          default:
            return JSON.stringify({ ok: false, error: `Unknown query_type: ${queryType}` });
        }
      }

      case "get_recent_photos": {
        const days = Number(args.days ?? 7);
        const since = new Date(Date.now() - days * 86400000).toISOString();
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );
        const { data } = await supabase
          .from("documents_chantier")
          .select("id, nom, vision_description, lot_id, whatsapp_message_id, created_at, bucket_path")
          .eq("chantier_id", chantierId)
          .eq("source", "whatsapp")
          .eq("document_type", "photo")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(10);
        return JSON.stringify({ ok: true, photos: data ?? [] });
      }

      case "list_chantier_groups": {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );
        const { data: groups } = await supabase
          .from("chantier_whatsapp_groups")
          .select("id, group_jid, name, chantier_whatsapp_members(phone, name, role, status)")
          .eq("chantier_id", chantierId);
        const result = (groups ?? []).map((g: any) => ({
          ...g,
          active_members: (g.chantier_whatsapp_members ?? []).filter((m: any) => m.status === "active"),
        }));
        return JSON.stringify({ ok: true, groups: result });
      }

      case "get_contacts_chantier": {
        const res = await fetch(
          `${API_BASE}/api/chantier/${chantierId}/contacts${args.lot_id ? `?lot_id=${args.lot_id}` : ""}`,
          { headers },
        );
        let contacts = (await res.json())?.contacts ?? [];
        if (args.role) {
          contacts = contacts.filter((c: any) => c.role === args.role || c.contact_category === args.role);
        }
        return JSON.stringify({ ok: res.ok, contacts });
      }

      // ── Action tools (interactive only — guard already checked above) ──────
      case "arrange_lot": {
        // Modèle CPM DAG : on écrit dans lot_dependencies via l'API planning.
        // chain_after    : lot.deps = [refId]
        // parallel_with  : lot.deps = deps(refId) (mêmes prédécesseurs → démarrent ensemble)
        const mode = String(args.mode ?? "");
        if (mode !== "chain_after" && mode !== "parallel_with") {
          return JSON.stringify({ ok: false, error: "mode doit être 'chain_after' ou 'parallel_with'" });
        }
        const lotId = String(args.lot_id ?? "");
        const refId = String(args.reference_lot_id ?? "");
        if (!lotId || !refId || lotId === refId) {
          return JSON.stringify({ ok: false, error: "lot_id et reference_lot_id requis et distincts" });
        }

        let depsForLot: string[];
        if (mode === "chain_after") {
          depsForLot = [refId];
        } else {
          // parallel_with : récupère les deps du lot de référence
          const planRes = await fetch(`${API_BASE}/api/chantier/${chantierId}/planning`, { headers });
          const planData = planRes.ok ? await planRes.json() : {};
          const refDeps = (planData?.dependencies ?? {})[refId] ?? [];
          depsForLot = Array.isArray(refDeps) ? refDeps : [];
        }

        // PATCH avec dependencies + delai_avant_jours=0 (repart de la date naturelle du CPM)
        const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/planning`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            lots: [{ id: lotId, delai_avant_jours: 0, lane_index: null }],
            dependencies: { [lotId]: depsForLot },
          }),
        });
        if (!res.ok) {
          const errTxt = await res.text();
          return JSON.stringify({ ok: false, error: `PATCH planning failed: ${errTxt.slice(0, 200)}` });
        }
        const data = await res.json();
        const lotFinal = (data?.lots ?? []).find((l: any) => l.id === lotId);
        const refFinal = (data?.lots ?? []).find((l: any) => l.id === refId);
        return JSON.stringify({
          ok: true,
          mode,
          lot_nom: lotFinal?.nom ?? "?",
          ref_nom: refFinal?.nom ?? "?",
          lot_date_debut: lotFinal?.date_debut,
          lot_date_fin: lotFinal?.date_fin,
          raison: args.raison,
        });
      }

      case "mark_lot_completed": {
        const body: Record<string, unknown> = {
          lot_id: args.lot_id,
          statut: "termine",
          raison: args.raison,
        };
        if (args.evidence_doc_id) body.evidence_doc_id = args.evidence_doc_id;
        const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/lots`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(body),
        });
        return JSON.stringify({ ok: res.ok, data: await res.json() });
      }

      case "update_lot_dates": {
        const lotUpdate: Record<string, unknown> = { id: args.lot_id, date_debut: args.new_start_date };
        if (args.new_end_date) lotUpdate.date_fin = args.new_end_date;
        const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/planning`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ lots: [lotUpdate] }),
        });
        const body = await res.json();
        // DEBUG : en cas d'échec, retourner la clé envoyée (longueur + prefix) pour diagnostic
        if (!res.ok) {
          return JSON.stringify({
            ok: false,
            data: body,
            _debug_key_len: AGENT_SECRET_KEY.length,
            _debug_key_prefix: AGENT_SECRET_KEY.slice(0, 8),
            _debug_key_suffix: AGENT_SECRET_KEY.slice(-8),
            _debug_api_base: API_BASE,
          });
        }
        return JSON.stringify({ ok: true, data: body });
      }

      case "shift_lot": {
        const lotId = String(args.lot_id ?? "");
        const jours = Number(args.jours ?? 0);
        const cascade = Boolean(args.cascade);
        if (!lotId || !Number.isFinite(jours) || jours <= 0) {
          return JSON.stringify({ ok: false, error: "lot_id et jours (>0) requis" });
        }
        const res = await fetch(
          `${API_BASE}/api/chantier/${chantierId}/planning/shift-lot`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ lot_id: lotId, jours, cascade, raison: args.raison }),
          },
        );
        return JSON.stringify({ ok: res.ok, data: await res.json() });
      }

      case "send_whatsapp_message": {
        if (!WHAPI_TOKEN) {
          return JSON.stringify({ ok: false, error: "WHAPI_TOKEN not configured" });
        }

        const to = String(args.to ?? "");
        const body = String(args.body ?? "");

        const whapiRes = await fetch("https://gate.whapi.cloud/messages/text", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${WHAPI_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ to, body }),
        });

        if (!whapiRes.ok) {
          const errText = await whapiRes.text().catch(() => "");
          return JSON.stringify({ ok: false, error: `whapi ${whapiRes.status}: ${errText.slice(0, 100)}` });
        }

        const whapiData = await whapiRes.json();
        const msgId: string | undefined = whapiData?.message?.id;

        // Log outgoing message for read-tracking (fire-and-forget)
        if (msgId) {
          const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
          );
          supabase.from("whatsapp_outgoing_messages").insert({
            id:          msgId,
            chantier_id: chantierId,
            group_jid:   to,
            body,
            run_type:    "interactive",
            sent_at:     new Date().toISOString(),
          }).then(() => {}).catch(() => {});
        }

        return JSON.stringify({ ok: true, message_id: msgId ?? null });
      }

      default:
        return JSON.stringify({ ok: false, error: `Unknown tool: ${toolName}` });
    }
  } catch (err) {
    return JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}
