/** Run types for the orchestrator */
export type RunType = "morning" | "evening" | "interactive";

/** A message in the persistent chantier_assistant_messages conversation */
export interface AssistantMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_calls: unknown[] | null;
  tool_call_id: string | null;
  agent_initiated: boolean;
  is_read: boolean;
  created_at: string;
}

/** A recent photo from WhatsApp with Vision description */
export interface RecentPhoto {
  doc_id: string;
  nom: string;
  vision_description: string | null;
  lot_id: string | null;
  lot_nom: string | null;
  sender_phone: string | null;
  created_at: string;
  storage_path: string;
}

/** Context built by buildContext() — consumed by prompt.ts */
export interface ChantierContext {
  chantier: {
    id: string;
    nom: string;
    emoji: string;
    phase: string;
    budget_ia: number;
    date_debut: string | null;
    type_projet: string;
    user_id: string;
  };
  lots: Array<{
    id: string;
    nom: string;
    statut: string;
    duree_jours: number | null;
    date_debut: string | null;
    date_fin: string | null;
    ordre_planning: number | null;
    budget_avg_ht: number | null;
    devis_recus: number;
    devis_valides: number;
    facture_total: number;
    paye: number;
    a_payer: number;
    nb_devis: number;
    contact_nom: string | null;
    contact_phone: string | null;
    contact_metier: string | null;
  }>;
  messages_since_last_run: Array<{
    source: "whatsapp";
    from_name: string;
    from_phone: string;
    body: string;
    timestamp: string;
    matched_lot: string | null;
    group_name: string | null;
    is_owner: boolean;
    is_known_contact: boolean;
    contact_role: string | null;
  }>;
  owner_pending_questions: Array<{
    body: string;
    timestamp: string;
    group_name: string | null;
    inferred_lot: string | null;
  }>;
  budget_conseils: Array<{ type: string; message: string; severity?: string }>;
  overdue_payments: Array<{
    label: string;
    amount: number;
    due_date: string;
    days_late: number;
    lot_nom: string;
  }>;
  risk_alerts: Array<{
    lot_nom: string;
    risk: string;
    details: string;
  }>;
  recent_insights: Array<{
    type: string;
    title: string;
    created_at: string;
  }>;
  todays_insights_with_actions: Array<{
    type: string;
    severity: string;
    title: string;
    body: string;
    actions_taken: unknown[];
    source_event: unknown;
    created_at: string;
  }>;
  taches: Array<{
    id: string;
    titre: string;
    priorite: string;
    done: boolean;
    created_at: string;
    created_today: boolean;
  }>;
  /** Contacts dont has_whatsapp = false — ne jamais relancer via WA */
  contacts_no_whatsapp: Array<{
    nom: string;
    telephone: string;
    lot_nom: string | null;
  }>;
  /** 5 derniers messages sortants WhatsApp avec leur statut de lecture par participant */
  recent_outgoing_read_status: Array<{
    message_id: string;
    body_preview: string;
    sent_at: string;
    chat_jid: string;
    statuses: Array<{
      viewer_phone: string;
      viewer_name: string | null;
      status: "sent" | "delivered" | "read" | "played";
      updated_at: string;
      hours_since_sent: number;
    }>;
  }>;
  /** Photos WhatsApp récentes avec description Vision (jusqu'à 10 sur les 7 derniers jours) */
  recent_photos: RecentPhoto[];
  /** Liste des documents du chantier (devis, factures, photos, plans) — pour le mode interactive */
  documents: Array<{
    id: string;
    nom: string;
    document_type: string;
    lot_id: string | null;
    lot_nom: string | null;
    montant: number | null;
    devis_statut: string | null;
    created_at: string;
    analyse_id: string | null;
  }>;
  /** Historique de conversation (mode interactive uniquement) */
  conversation_history: AssistantMessage[];
}
