// Tools en LECTURE SEULE : safe pour batch + interactive.
import { Handler, Tool, API_BASE, supabaseAdmin } from "./shared.ts";

export const BATCH_SCHEMAS: Tool[] = [
  {
    type: "function",
    function: {
      name: "get_chantier_summary",
      description: "Retourne l'état général du chantier : informations, lots avec statuts et dates, budget.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_chantier_planning",
      description: "Retourne le détail du planning : ordre des lots, dates, durée, statut, groupes parallèles.",
      parameters: { type: "object", properties: {}, required: [] },
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
      parameters: { type: "object", properties: {}, required: [] },
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
];

export const ACTION_SCHEMAS: Tool[] = [];

export const handlers: Record<string, Handler> = {
  get_chantier_summary: async ({ chantierId, headers }) => {
    const [planningRes, budgetRes, chantierRes] = await Promise.all([
      fetch(`${API_BASE}/api/chantier/${chantierId}/planning`, { headers }),
      fetch(`${API_BASE}/api/chantier/${chantierId}/budget`, { headers }),
      (async () => {
        const sb = supabaseAdmin();
        const { data } = await sb.from("chantiers").select("nom, emoji, phase, type_projet").eq("id", chantierId).single();
        return data;
      })(),
    ]);
    const planning = await planningRes.json();
    const budget = await budgetRes.json();
    return JSON.stringify({ ok: true, chantier: chantierRes, lots: planning?.lots ?? [], budget_ia: budget?.budget_ia });
  },

  get_chantier_planning: async ({ chantierId, headers }) => {
    const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/planning`, { headers });
    return JSON.stringify({ ok: res.ok, data: await res.json() });
  },

  get_chantier_data: async ({ chantierId, args }) => {
    const sb = supabaseAdmin();
    const queryType = String(args.query_type ?? "");
    switch (queryType) {
      case "count_devis": {
        const { count } = await sb.from("documents_chantier").select("id", { count: "exact", head: true })
          .eq("chantier_id", chantierId).eq("document_type", "devis");
        return JSON.stringify({ ok: true, count });
      }
      case "sum_travaux_en_cours": {
        const { data } = await sb.from("lots_chantier").select("budget_avg_ht")
          .eq("chantier_id", chantierId).eq("statut", "en_cours");
        const sum = (data ?? []).reduce((acc: number, l: any) => acc + (l.budget_avg_ht ?? 0), 0);
        return JSON.stringify({ ok: true, sum_ht: sum });
      }
      case "sum_travaux_totaux": {
        const { data } = await sb.from("lots_chantier").select("budget_avg_ht").eq("chantier_id", chantierId);
        const sum = (data ?? []).reduce((acc: number, l: any) => acc + (l.budget_avg_ht ?? 0), 0);
        return JSON.stringify({ ok: true, sum_ht: sum });
      }
      case "list_documents": {
        const { data } = await sb.from("documents_chantier")
          .select("id, nom, document_type, source, created_at, lot_id")
          .eq("chantier_id", chantierId).order("created_at", { ascending: false }).limit(20);
        return JSON.stringify({ ok: true, documents: data ?? [] });
      }
      case "list_intervenants": {
        const { data } = await sb.from("contacts_chantier")
          .select("nom, telephone, role, contact_category, lot_id").eq("chantier_id", chantierId);
        return JSON.stringify({ ok: true, contacts: data ?? [] });
      }
      default:
        return JSON.stringify({ ok: false, error: `Unknown query_type: ${queryType}` });
    }
  },

  get_recent_photos: async ({ chantierId, args }) => {
    const days = Number(args.days ?? 7);
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const sb = supabaseAdmin();
    const { data } = await sb.from("documents_chantier")
      .select("id, nom, vision_description, lot_id, whatsapp_message_id, created_at, bucket_path")
      .eq("chantier_id", chantierId).eq("source", "whatsapp").eq("document_type", "photo")
      .gte("created_at", since).order("created_at", { ascending: false }).limit(10);
    return JSON.stringify({ ok: true, photos: data ?? [] });
  },

  list_chantier_groups: async ({ chantierId }) => {
    const sb = supabaseAdmin();
    const { data: groups } = await sb.from("chantier_whatsapp_groups")
      .select("id, group_jid, name, chantier_whatsapp_members(phone, name, role, status)")
      .eq("chantier_id", chantierId);
    const result = (groups ?? []).map((g: any) => ({
      ...g,
      active_members: (g.chantier_whatsapp_members ?? []).filter((m: any) => m.status === "active"),
    }));
    return JSON.stringify({ ok: true, groups: result });
  },

  get_contacts_chantier: async ({ chantierId, headers, args }) => {
    const res = await fetch(
      `${API_BASE}/api/chantier/${chantierId}/contacts${args.lot_id ? `?lot_id=${args.lot_id}` : ""}`,
      { headers },
    );
    let contacts = (await res.json())?.contacts ?? [];
    if (args.role) {
      contacts = contacts.filter((c: any) => c.role === args.role || c.contact_category === args.role);
    }
    return JSON.stringify({ ok: res.ok, contacts });
  },

  get_message_read_status: async ({ chantierId, args }) => {
    const phone = String(args.phone ?? "").replace(/^\+/, "");
    const sb = supabaseAdmin();
    const { data: statuses, error } = await sb.from("whatsapp_message_statuses")
      .select("message_id, status, updated_at, whatsapp_outgoing_messages(body, sent_at, group_jid)")
      .eq("viewer_phone", phone).eq("chantier_id", chantierId)
      .order("updated_at", { ascending: false }).limit(3);
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
  },
};
