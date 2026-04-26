// Tools actions programmées : schedule_reminder + cancel_reminder.
// Stockage agent_scheduled_actions, fired par cron edge function agent-scheduled-tick (15min).
import { Handler, Tool, supabaseAdmin } from "./shared.ts";

export const BATCH_SCHEMAS: Tool[] = [];

export const ACTION_SCHEMAS: Tool[] = [
  {
    type: "function",
    function: {
      name: "schedule_reminder",
      description:
        "Programme un rappel à envoyer au owner dans son canal WhatsApp privé.\n\n" +
        "Cas d'usage typique :\n" +
        "  • \"Rappelle-moi dans 3 jours de relancer le plombier\" → due_at_local = today+3j à 09:00, tz='Europe/Paris'\n" +
        "  • \"Préviens-moi 2 jours avant la livraison du carrelage\" → due_at_local = livraison-2j à 09:00\n" +
        "  • \"Rappel pour le RDV architecte vendredi 14h\" → due_at_local = vendredi 13:45 (15min avant)\n\n" +
        "TOUJOURS utiliser due_at_local (heure locale Paris) — le serveur convertit en UTC en gérant DST. Évite les erreurs LLM sur le décalage UTC saisonnier.\n" +
        "Heure par défaut si non précisée : 09:00 (heure Paris).\n" +
        "Si tu ne peux pas déterminer la date/heure, demande au user en TEXTE 'C'est pour quand exactement ?'\n\n" +
        "Le canal WhatsApp privé owner doit être créé au préalable (Settings → 'Activer le canal IA'), sinon le rappel ne sera jamais envoyé (status='failed' avec raison='no_owner_channel'). Si le user n'a pas activé le canal, propose-lui de le faire avant.",
      parameters: {
        type: "object",
        properties: {
          due_at_local:  { type: "string", description: "Date+heure LOCALE format YYYY-MM-DDTHH:MM (ex: '2026-05-15T09:00'). Le serveur calcule l'UTC en appliquant le tz." },
          tz:            { type: "string", description: "Timezone IANA (défaut 'Europe/Paris')." },
          reminder_text: { type: "string", description: "Texte du rappel envoyé en WhatsApp. Court, actionnable. Ex: 'Relancer le plombier pour le devis'." },
          lot_id:        { type: "string", description: "UUID du lot lié (optionnel — purement informatif, sera dans le payload)." },
        },
        required: ["due_at_local", "reminder_text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_reminder",
      description:
        "Annule un rappel programmé. *\"Oublie le rappel pour le plombier\"* → l'agent récupère la liste via la section SCHEDULED REMINDERS du contexte et appelle cancel_reminder avec l'id.",
      parameters: {
        type: "object",
        properties: {
          reminder_id: { type: "string", description: "UUID du reminder à annuler" },
        },
        required: ["reminder_id"],
      },
    },
  },
];

export const handlers: Record<string, Handler> = {
  schedule_reminder: async ({ chantierId, args }) => {
    // Accepte due_at_local (préféré, V2) OU due_at (legacy UTC, rétrocompat agents qui envoient à l'ancienne).
    const dueAtLocal = typeof args.due_at_local === "string" ? args.due_at_local.trim() : "";
    const dueAtUtcLegacy = typeof args.due_at === "string" ? args.due_at.trim() : "";
    const tz = (typeof args.tz === "string" && args.tz.trim()) ? args.tz.trim() : "Europe/Paris";
    const text = String(args.reminder_text ?? "").trim();
    if (!text) {
      return JSON.stringify({ ok: false, error: "reminder_text requis" });
    }

    // Calcule le UTC depuis (due_at_local + tz) ou utilise due_at directement.
    let parsed: Date;
    if (dueAtLocal) {
      // Format attendu : YYYY-MM-DDTHH:MM (sans tz suffix).
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(dueAtLocal)) {
        return JSON.stringify({ ok: false, error: `due_at_local format invalide (YYYY-MM-DDTHH:MM attendu, reçu '${dueAtLocal}')` });
      }
      // Approche robuste : on calcule l'offset tz pour CETTE date précise via Intl.
      // Étape 1 : on construit une Date naïve (interprétée UTC par le runtime).
      const naive = new Date(dueAtLocal + "Z");
      if (Number.isNaN(naive.getTime())) {
        return JSON.stringify({ ok: false, error: `due_at_local invalide` });
      }
      // Étape 2 : on calcule l'heure UTC qui correspond à dueAtLocal dans tz.
      // Méthode : compare naive (interpreted UTC) à naive interpreted as tz.
      try {
        const fmt = new Intl.DateTimeFormat("en-US", {
          timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
        });
        const parts = fmt.formatToParts(naive);
        const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
        const tzAsUtc = Date.UTC(
          Number(get("year")), Number(get("month")) - 1, Number(get("day")),
          Number(get("hour")), Number(get("minute")), Number(get("second")),
        );
        const offsetMs = tzAsUtc - naive.getTime();
        parsed = new Date(naive.getTime() - offsetMs);
      } catch {
        return JSON.stringify({ ok: false, error: `Timezone invalide : '${tz}'` });
      }
    } else if (dueAtUtcLegacy) {
      parsed = new Date(dueAtUtcLegacy);
      if (Number.isNaN(parsed.getTime())) {
        return JSON.stringify({ ok: false, error: `due_at invalide (ISO 8601 attendu, reçu '${dueAtUtcLegacy}')` });
      }
    } else {
      return JSON.stringify({ ok: false, error: "due_at_local OU due_at requis" });
    }

    // Refuse les dates dans le passé (>5 min) — éviter rappels qui partent immédiatement par erreur LLM.
    const nowMinus5min = Date.now() - 5 * 60 * 1000;
    if (parsed.getTime() < nowMinus5min) {
      return JSON.stringify({
        ok: false, error: "due_at dans le passé",
        message: `Date ${parsed.toISOString()} est dans le passé. Si tu voulais 'aujourd'hui à 9h' alors qu'il est 14h, propose plutôt demain ou demande au user.`,
      });
    }

    const lotId = typeof args.lot_id === "string" && args.lot_id ? args.lot_id : null;

    const sb = supabaseAdmin();

    // Cap 30 rappels pending par chantier — défense contre boucle agent / hallucination.
    const { count: pendingCount } = await sb.from("agent_scheduled_actions")
      .select("id", { count: "exact", head: true })
      .eq("chantier_id", chantierId)
      .eq("status", "pending");
    if ((pendingCount ?? 0) >= 30) {
      return JSON.stringify({
        ok: false, error: "rate_limit",
        message: `Cap atteint : 30 rappels en attente sur ce chantier. Demande au user d'annuler des rappels existants (cancel_reminder) avant d'en programmer de nouveaux.`,
      });
    }

    const { data: created, error } = await sb.from("agent_scheduled_actions").insert({
      chantier_id: chantierId,
      due_at: parsed.toISOString(),
      action_type: "reminder",
      payload: { text, lot_id: lotId },
      source: "tool:schedule_reminder",
      status: "pending",
    }).select("id").single();

    if (error || !created) {
      return JSON.stringify({ ok: false, error: `Insert reminder failed: ${error?.message ?? "unknown"}` });
    }

    return JSON.stringify({
      ok: true,
      reminder_id: created.id,
      due_at: parsed.toISOString(),
      reminder_text: text,
      message: "Rappel programmé. Sera envoyé dans le canal WhatsApp privé à la date prévue.",
    });
  },

  cancel_reminder: async ({ chantierId, args }) => {
    const reminderId = String(args.reminder_id ?? "").trim();
    if (!reminderId) {
      return JSON.stringify({ ok: false, error: "reminder_id requis" });
    }

    const sb = supabaseAdmin();

    // Vérifie ownership + statut pending avant cancel.
    const { data: reminder, error: fetchErr } = await sb
      .from("agent_scheduled_actions")
      .select("id, chantier_id, status")
      .eq("id", reminderId)
      .single();
    if (fetchErr || !reminder) {
      return JSON.stringify({ ok: false, error: "Reminder introuvable" });
    }
    if (reminder.chantier_id !== chantierId) {
      return JSON.stringify({ ok: false, error: "Reminder d'un autre chantier" });
    }
    if (reminder.status !== "pending") {
      return JSON.stringify({ ok: false, error: `Reminder déjà ${reminder.status}, ne peut plus être annulé` });
    }

    const { error: updateErr } = await sb
      .from("agent_scheduled_actions")
      .update({ status: "cancelled" })
      .eq("id", reminderId);
    if (updateErr) {
      return JSON.stringify({ ok: false, error: updateErr.message });
    }

    return JSON.stringify({ ok: true, reminder_id: reminderId, message: "Rappel annulé." });
  },
};
