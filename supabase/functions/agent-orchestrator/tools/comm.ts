// Tools communication : send_whatsapp_message + send_email + notify_owner_for_decision + resolve_pending_decision.
import { Handler, Tool, WHAPI_TOKEN, API_BASE, defaultHeaders, supabaseAdmin } from "./shared.ts";

// Injecté depuis tools/index.ts pour éviter dépendance circulaire (comm.ts → index.ts → comm.ts).
// resolve_pending_decision a besoin d'appeler le dispatcher pour exécuter l'expected_action.
type ToolDispatcher = (chantierId: string, name: string, args: Record<string, unknown>, meta: { run_type: string }) => Promise<string>;
let _dispatcher: ToolDispatcher | null = null;
export function injectDispatcher(d: ToolDispatcher) { _dispatcher = d; }

export const BATCH_SCHEMAS: Tool[] = [];

export const ACTION_SCHEMAS: Tool[] = [
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
  {
    type: "function",
    function: {
      name: "create_owner_whatsapp_channel",
      description:
        "Crée le canal WhatsApp privé 'Mon Chantier' avec UNIQUEMENT le owner dedans. Utilisé quand le user dit 'active mes notifs WhatsApp' ou avant de programmer un rappel pour la première fois.\n\n" +
        "Préconditions : le user doit avoir renseigné son numéro de téléphone dans son profil (Paramètres). Sinon le tool retourne une erreur claire à relayer.\n\n" +
        "Une fois créé, c'est le canal où l'agent envoie ses notifs proactives : clarifications, alertes critiques, rappels schedule_reminder, décisions à prendre via notify_owner_for_decision. Un seul canal owner par chantier.",
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
      name: "send_email",
      description:
        "Envoie un email à un contact du chantier via SendGrid. Le contact doit avoir une adresse email enregistrée. La conversation est automatiquement créée si elle n'existe pas, et toute réponse arrive dans le thread Messagerie.\n\n" +
        "Cas d'usage typique :\n" +
        "  • Beaucoup d'artisans ne sont pas sur WhatsApp et préfèrent l'email — utilise send_email plutôt que send_whatsapp_message dans ce cas.\n" +
        "  • Pour un message formel (relance facture, validation devis écrite) → email préféré.\n\n" +
        "REQUIERT confirmation explicite de l'utilisateur — comme send_whatsapp_message. Tu proposes le sujet + corps, l'utilisateur dit 'envoie / ok' avant l'envoi.\n\n" +
        "Si le contact n'a pas d'email enregistré, le tool renvoie une erreur — propose à l'utilisateur d'ajouter l'email via update_contact d'abord.",
      parameters: {
        type: "object",
        properties: {
          contact_id: { type: "string", description: "UUID du contact destinataire (récupéré via get_contacts_chantier)." },
          subject:    { type: "string", description: "Sujet de l'email. Court et explicite." },
          body:       { type: "string", description: "Corps du message en texte brut. Inclut une signature/politesse appropriée — l'utilisateur ne pourra pas l'éditer après l'envoi." },
        },
        required: ["contact_id", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resolve_pending_decision",
      description:
        "Résout une décision en attente après réponse de l'owner. Si answer commence par OUI (oui/ok/go/valide/yes), exécute l'expected_action stockée. Sinon (non/refuse/no), marque résolu sans exécuter.\n\n" +
        "Tu reçois la liste des PENDING DECISIONS dans ton contexte. Quand le user répond clairement à l'une d'elles (texte court 'oui', 'non', 'ok', 'pas maintenant'), appelle ce tool avec le decision_id correspondant.",
      parameters: {
        type: "object",
        properties: {
          decision_id: { type: "string", description: "ID UUID de la pending decision à résoudre" },
          answer:      { type: "string", description: "Réponse brute de l'owner. Le tool détecte oui/non automatiquement." },
        },
        required: ["decision_id", "answer"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "notify_owner_for_decision",
      description:
        "Crée une décision en attente côté owner ET envoie un message WhatsApp privé pour la lui demander. À utiliser quand un message externe (artisan) propose un changement (montant, date, ajout de prestation) qui impacte le chantier et nécessite l'accord de l'owner.\n\n" +
        "Workflow :\n" +
        "  1) Tu détectes une décision à arbitrer (ex: artisan demande +800€).\n" +
        "  2) Tu appelles ce tool avec une question claire et l'action à exécuter si OUI.\n" +
        "  3) Le tool crée une ligne agent_pending_decisions + envoie WhatsApp dans le canal privé du chantier.\n" +
        "  4) Quand l'owner répond OUI/NON, l'orchestrator récupère la pending la plus récente non-expirée et exécute (ou ignore) l'expected_action.\n\n" +
        "NE PAS répondre à l'artisan tant que l'owner n'a pas validé. NE PAS appeler le tool de l'expected_action toi-même — il sera exécuté automatiquement après confirmation owner.",
      parameters: {
        type: "object",
        properties: {
          question:        { type: "string", description: "Question à poser à l'owner. Doit être courte, claire, terminer par '?'. Ex: 'Le plombier annonce +800€ (pompe de relevage). Tu valides ?'" },
          expected_action: {
            type: "object",
            description: "Action à exécuter si l'owner répond OUI. Format { tool: 'shift_lot', args: {...} }. Le `tool` doit être un nom de tool existant (shift_lot, register_expense, send_whatsapp_message, etc.).",
            properties: {
              tool: { type: "string", description: "Nom du tool à appeler" },
              args: { type: "object", description: "Arguments du tool" },
            },
            required: ["tool", "args"],
          },
          context:         { type: "object", description: "Contexte facultatif (ex: { artisan_phone, devis_id, montant }) pour ton info au moment de résoudre." },
          source_event:    { type: "string", description: "Source de la décision (ex: 'whatsapp_message:msgId'). Optionnel mais utile pour le journal." },
          expires_in_hours: { type: "number", description: "Durée de validité de la décision en heures. Défaut 48h." },
        },
        required: ["question", "expected_action"],
      },
    },
  },
];

/**
 * Helper interne : envoie un WhatsApp via whapi + log dans whatsapp_outgoing_messages.
 * Réutilisé par send_whatsapp_message et notify_owner_for_decision.
 */
async function sendWhatsApp(chantierId: string, to: string, body: string): Promise<{ ok: boolean; message_id: string | null; error?: string }> {
  if (!WHAPI_TOKEN) return { ok: false, message_id: null, error: "WHAPI_TOKEN not configured" };
  const whapiRes = await fetch("https://gate.whapi.cloud/messages/text", {
    method: "POST",
    headers: { "Authorization": `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to, body }),
  });
  if (!whapiRes.ok) {
    const errText = await whapiRes.text().catch(() => "");
    return { ok: false, message_id: null, error: `whapi ${whapiRes.status}: ${errText.slice(0, 100)}` };
  }
  const whapiData = await whapiRes.json();
  const msgId: string | undefined = whapiData?.message?.id;
  if (msgId) {
    const sb = supabaseAdmin();
    sb.from("whatsapp_outgoing_messages").insert({
      id: msgId, chantier_id: chantierId, group_jid: to, body,
      run_type: "interactive", sent_at: new Date().toISOString(),
    }).then(() => {}).catch(() => {});
  }
  return { ok: true, message_id: msgId ?? null };
}

/**
 * Trouve le canal WhatsApp privé owner pour ce chantier.
 * Utilise la colonne is_owner_channel quand elle existe, sinon le premier groupe par ordre de création (fallback rétrocompat).
 * Retourne null si aucun canal owner configuré (vague 3 pas encore livrée).
 */
async function findOwnerChannelJid(chantierId: string): Promise<string | null> {
  const sb = supabaseAdmin();
  // Tentative 1 : colonne is_owner_channel (vague 3 — peut ne pas exister).
  const { data: ownerChan } = await sb.from("chantier_whatsapp_groups")
    .select("group_jid").eq("chantier_id", chantierId).eq("is_owner_channel", true).limit(1).maybeSingle();
  if (ownerChan?.group_jid) return ownerChan.group_jid;

  // Fallback : premier groupe créé pour ce chantier (vague 3 pas encore livrée).
  const { data: firstGroup } = await sb.from("chantier_whatsapp_groups")
    .select("group_jid").eq("chantier_id", chantierId).order("created_at", { ascending: true }).limit(1).maybeSingle();
  return firstGroup?.group_jid ?? null;
}

/** Détecte une réponse positive type "oui/ok/go/valide".
 *  Pré-check négatif : si le message contient un mot de refus N'IMPORTE OÙ,
 *  on retourne false même si ça commence par "ok" ("ok mais en fait non").
 */
function isPositive(answer: string): boolean {
  const trimmed = answer.trim();
  if (/\b(non|pas|annule|annuler|refuse|attends?|stop|surtout pas|finalement non)\b/iu.test(trimmed)) {
    return false;
  }
  return /^(oui|ok|go|vas[\s-]?y|confirme|valide|envoie|fais[\s-]?le|parfait|allons[\s-]?y|yes|yep|ouais|ça marche|c'est bon|carrément|d'accord)\b/iu.test(trimmed);
}

export const handlers: Record<string, Handler> = {
  send_whatsapp_message: async ({ chantierId, args }) => {
    const to = String(args.to ?? "");
    const body = String(args.body ?? "");
    const result = await sendWhatsApp(chantierId, to, body);
    return JSON.stringify(result);
  },

  create_owner_whatsapp_channel: async ({ chantierId, headers }) => {
    // Délègue à l'API existante avec flag is_owner_channel: true
    // (l'API gère récupération phone user, dédup canal existant, création whapi).
    const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/whatsapp`, {
      method: "POST", headers,
      body: JSON.stringify({ is_owner_channel: true }),
    });
    if (!res.ok) {
      const errTxt = await res.text();
      return JSON.stringify({ ok: false, error: `create_owner_whatsapp_channel ${res.status}: ${errTxt.slice(0, 200)}` });
    }
    const data = await res.json();
    if (data?.already_exists) {
      return JSON.stringify({
        ok: true, already_exists: true,
        message: "Le canal WhatsApp privé existe déjà pour ce chantier.",
        group_jid: data.group?.group_jid,
      });
    }
    return JSON.stringify({
      ok: true,
      group_jid: data?.group?.group_jid,
      message: "Canal WhatsApp privé créé. Tu vas recevoir les notifications de l'agent dans ce groupe.",
    });
  },

  send_email: async ({ chantierId, args }) => {
    const contactId = String(args.contact_id ?? "").trim();
    const subject = String(args.subject ?? "").trim();
    const body = String(args.body ?? "").trim();
    if (!contactId || !subject || !body) {
      return JSON.stringify({ ok: false, error: "contact_id, subject et body requis" });
    }

    // Pré-check : le contact a-t-il un email ? Évite un round-trip API si email manquant.
    const sb = supabaseAdmin();
    const { data: contact, error: cErr } = await sb
      .from("contacts_chantier")
      .select("id, nom, email, chantier_id")
      .eq("id", contactId)
      .single();
    if (cErr || !contact) {
      return JSON.stringify({ ok: false, error: "Contact introuvable" });
    }
    if (contact.chantier_id !== chantierId) {
      return JSON.stringify({ ok: false, error: "Contact d'un autre chantier" });
    }
    if (!contact.email) {
      return JSON.stringify({
        ok: false, error: "Pas d'email enregistré pour ce contact",
        message: `${contact.nom} n'a pas d'email enregistré. Demande à l'utilisateur d'ajouter l'email via update_contact d'abord.`,
        contact_id: contactId, contact_nom: contact.nom,
      });
    }

    // Anti-spam : cap dur de 5 emails sortants vers ce contact dans les 24h.
    // Protège contre boucles agent / hallucination "envoie à tous les artisans".
    const since24h = new Date(Date.now() - 86400000).toISOString();
    const { data: convForCount } = await sb.from("chantier_conversations")
      .select("id").eq("chantier_id", chantierId).eq("contact_id", contactId).maybeSingle();
    if (convForCount?.id) {
      const { count: recentCount } = await sb.from("chantier_messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", convForCount.id)
        .eq("direction", "outbound")
        .gte("created_at", since24h);
      if ((recentCount ?? 0) >= 5) {
        return JSON.stringify({
          ok: false, error: "rate_limit",
          message: `Cap atteint : 5 emails envoyés à ${contact.nom} dans les 24h. Demande au user d'attendre demain ou d'envoyer manuellement via la Messagerie.`,
        });
      }
    }

    // Délègue à l'API messages.ts (gère création conversation + SendGrid + log inbound).
    const res = await fetch(`${API_BASE}/api/chantier/${chantierId}/messages`, {
      method: "POST",
      headers: defaultHeaders(),
      body: JSON.stringify({ contact_id: contactId, subject, body }),
    });
    if (!res.ok) {
      const errTxt = await res.text();
      return JSON.stringify({ ok: false, error: `send_email ${res.status}: ${errTxt.slice(0, 200)}` });
    }
    const data = await res.json();
    return JSON.stringify({
      ok: true,
      contact_nom: contact.nom,
      contact_email: contact.email,
      conversation_id: data?.conversationId,
      message_id: data?.messageId,
      send_failed: !!data?.sendError,
      send_error: data?.sendError,
    });
  },

  notify_owner_for_decision: async ({ chantierId, args }) => {
    const question = String(args.question ?? "").trim();
    const expectedAction = args.expected_action;
    if (!question || !expectedAction || typeof expectedAction !== "object") {
      return JSON.stringify({ ok: false, error: "question et expected_action requis" });
    }
    const expiresInHours = Number(args.expires_in_hours ?? 48);
    const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString();

    const sb = supabaseAdmin();

    // 1. Crée la décision pending en DB (source de vérité — survit au crash agent).
    const { data: pending, error: insertErr } = await sb.from("agent_pending_decisions").insert({
      chantier_id: chantierId,
      question,
      context: args.context ?? null,
      expected_action: expectedAction,
      source_event: typeof args.source_event === "string" ? args.source_event : null,
      expires_at: expiresAt,
      status: "pending",
    }).select("id").single();

    if (insertErr || !pending) {
      return JSON.stringify({ ok: false, error: `Insert pending failed: ${insertErr?.message ?? "unknown"}` });
    }

    // 2. Envoie le message dans le canal privé owner. Si pas configuré → on garde la pending mais avertit.
    const ownerJid = await findOwnerChannelJid(chantierId);
    if (!ownerJid) {
      return JSON.stringify({
        ok: true,
        pending_id: pending.id,
        whatsapp_sent: false,
        warning: "Décision créée mais aucun canal WhatsApp owner configuré. Sera visible dans le panneau Activité IA seulement.",
      });
    }

    const waResult = await sendWhatsApp(chantierId, ownerJid, question);
    return JSON.stringify({
      ok: true,
      pending_id: pending.id,
      whatsapp_sent: waResult.ok,
      whatsapp_message_id: waResult.message_id,
      whatsapp_error: waResult.error,
    });
  },

  // resolve_pending_decision : exécute l'expected_action stockée APRÈS confirmation owner.
  // ⚠️ By-pass volontaire du protocole 2-tours : si l'expected_action est `send_whatsapp_message`
  // ou autre action irréversible, on l'exécute directement (l'owner a déjà confirmé via WhatsApp privé).
  // Le 1er tour de validation a eu lieu dans `notify_owner_for_decision`, le 2nd tour est cette résolution.
  resolve_pending_decision: async ({ chantierId, args, meta }) => {
    const decisionId = String(args.decision_id ?? "");
    const answer = String(args.answer ?? "").trim();
    if (!decisionId || !answer) {
      return JSON.stringify({ ok: false, error: "decision_id et answer requis" });
    }

    const sb = supabaseAdmin();

    // Récupère la pending. Vérifie chantier + statut + non expirée.
    const { data: pending, error: fetchErr } = await sb.from("agent_pending_decisions")
      .select("id, chantier_id, expected_action, status, expires_at")
      .eq("id", decisionId).single();

    if (fetchErr || !pending) {
      return JSON.stringify({ ok: false, error: "Pending decision introuvable" });
    }
    if (pending.chantier_id !== chantierId) {
      return JSON.stringify({ ok: false, error: "Pending decision d'un autre chantier" });
    }
    if (pending.status !== "pending") {
      return JSON.stringify({ ok: false, error: `Pending decision déjà ${pending.status}` });
    }
    if (new Date(pending.expires_at).getTime() < Date.now()) {
      // Marque expirée et refuse.
      await sb.from("agent_pending_decisions").update({ status: "expired" }).eq("id", decisionId);
      return JSON.stringify({ ok: false, error: "Pending decision expirée" });
    }

    const positive = isPositive(answer);

    if (!positive) {
      // Refus : marque résolu sans exécuter.
      await sb.from("agent_pending_decisions")
        .update({ status: "cancelled", resolved_answer: answer, resolved_at: new Date().toISOString() })
        .eq("id", decisionId);
      return JSON.stringify({ ok: true, executed: false, status: "cancelled", answer });
    }

    // Confirmation : exécute l'expected_action via le dispatcher injecté.
    if (!_dispatcher) {
      return JSON.stringify({ ok: false, error: "dispatcher non injecté (bug interne)" });
    }
    const action = pending.expected_action as { tool?: string; args?: Record<string, unknown> } | null;
    if (!action || !action.tool || typeof action.tool !== "string") {
      return JSON.stringify({ ok: false, error: "expected_action mal formée" });
    }

    const execResult = await _dispatcher(chantierId, action.tool, action.args ?? {}, meta);
    let execParsed: Record<string, unknown> = {};
    try { execParsed = JSON.parse(execResult); } catch { /* ignore */ }

    await sb.from("agent_pending_decisions").update({
      status: "resolved",
      resolved_answer: answer,
      resolved_at: new Date().toISOString(),
    }).eq("id", decisionId);

    return JSON.stringify({
      ok: true, executed: true, status: "resolved", answer,
      tool_executed: action.tool, tool_result: execParsed,
    });
  },
};
