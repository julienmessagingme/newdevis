import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ChantierContext } from "./types.ts";

/**
 * Rich context built from EXISTING API routes.
 * Budget: uses GET /budget (Johan's work — totaux, conseils, lot breakdown)
 * Planning: uses GET /planning (lots with dates + cascade)
 * Payments: uses GET /payment-events (overdue detection)
 * Contacts: direct Supabase query (phone→lot mapping for messages)
 * Messages: direct Supabase query (since last agent run)
 */
export async function buildContext(
  supabase: SupabaseClient,
  chantierId: string,
  lastRunAt: string | null,
  agentKey: string,
  apiBase: string,
): Promise<ChantierContext> {
  const since = lastRunAt ?? new Date(Date.now() - 86400000).toISOString();
  const headers: Record<string, string> = { "X-Agent-Key": agentKey };

  // ── Parallel: 5 API calls (reuse Johan's logic) + 3 direct Supabase ──
  const [budgetRes, planningRes, contactsRes, paymentEventsRes, chantierRes, waMessagesRes, waGroupsRes, insightsRes] =
    await Promise.all([
      // GET /budget — returns totaux, lots with financial data, conseils (already computed!)
      fetch(`${apiBase}/api/chantier/${chantierId}/budget`, { headers }).then(r => r.json()),

      // GET /planning — returns lots with dates + cascade data
      fetch(`${apiBase}/api/chantier/${chantierId}/planning`, { headers }).then(r => r.json()),

      // GET /contacts — artisan contact list
      fetch(`${apiBase}/api/chantier/${chantierId}/contacts`, { headers }).then(r => r.json()),

      // GET /payment-events — payment timeline with overdue detection
      fetch(`${apiBase}/api/chantier/${chantierId}/payment-events`, { headers }).then(r => r.json()),

      // Direct Supabase: chantier metadata
      supabase.from("chantiers")
        .select("id, nom, emoji, phase, type_projet, date_debut_chantier, metadonnees, user_id")
        .eq("id", chantierId).single(),

      // Direct Supabase: WhatsApp messages since last run (include from_me + group_id + group_name)
      supabase.from("chantier_whatsapp_messages")
        .select("from_number, from_me, group_id, body, type, timestamp")
        .eq("chantier_id", chantierId)
        .gte("timestamp", since)
        .order("timestamp", { ascending: true })
        .limit(50),

      // Direct Supabase: WhatsApp groups (for group_jid → name mapping)
      supabase.from("chantier_whatsapp_groups")
        .select("group_jid, name")
        .eq("chantier_id", chantierId),

      // Direct Supabase: recent insights
      supabase.from("agent_insights")
        .select("type, title, created_at")
        .eq("chantier_id", chantierId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  const chantier = chantierRes.data;
  // contactsRes shape: { contacts: [...], analyseArtisans: [...], lots: [...] }
  const contacts = contactsRes?.contacts ?? [];
  const waMessages = waMessagesRes.data ?? [];

  // ── Build group_jid → group name mapping ──────────────────────
  const waGroups = waGroupsRes.data ?? [];
  const groupJidToName = new Map<string, string>(
    waGroups.map((g: any) => [g.group_jid, g.name])
  );

  // ── Try to match group name → lot name (fuzzy) ──
  const groupJidToLot = new Map<string, string>();
  // Will be populated after enrichedLots is built

  // ── Build phone → contact → lot mapping ───────────────────────
  const phoneToContact = new Map<string, { nom: string; lot_id: string | null; metier: string; role: string }>();
  for (const c of contacts) {
    if (c.phone) {
      const norm = c.phone.replace(/^\+/, "").replace(/^0/, "33");
      phoneToContact.set(norm, { nom: c.nom, lot_id: c.lot_id, metier: c.metier ?? "", role: c.role ?? "" });
    }
  }

  // ── Merge planning lots + budget lots ─────────────────────────
  const planningLots = planningRes?.lots ?? [];
  const budgetLots = budgetRes?.lots ?? [];
  const budgetByLotId = new Map(budgetLots.map((bl: any) => [bl.id, bl]));

  const enrichedLots = planningLots.map((pl: any) => {
    const bl = budgetByLotId.get(pl.id);
    const totaux = bl?.totaux ?? {};
    const nbDevis = (bl?.devis ?? []).length;
    const lotContact = contacts.find((c: any) => c.lot_id === pl.id);

    return {
      id: pl.id,
      nom: pl.nom,
      statut: pl.statut ?? "a_faire",
      duree_jours: pl.duree_jours,
      date_debut: pl.date_debut,
      date_fin: pl.date_fin,
      ordre_planning: pl.ordre_planning,
      budget_avg_ht: pl.budget_avg_ht,
      devis_recus: totaux.devis_recus ?? 0,
      devis_valides: totaux.devis_valides ?? 0,
      facture_total: totaux.facture ?? 0,
      paye: totaux.paye ?? 0,
      a_payer: totaux.a_payer ?? 0,
      nb_devis: nbDevis,
      contact_nom: lotContact?.nom ?? null,
      contact_phone: lotContact?.phone ?? null,
      contact_metier: lotContact?.metier ?? null,
    };
  });

  // ── Build group → lot fuzzy mapping (group "Plomberie - Chantier X" matches lot "Plomberie") ──
  for (const [jid, gName] of groupJidToName) {
    const gLower = gName.toLowerCase();
    for (const lot of enrichedLots) {
      // Strip leading emoji/spaces from lot name (Unicode-aware — keeps accented chars)
      const lotNomClean = lot.nom.replace(/^\P{L}+/u, "").toLowerCase();
      if (lotNomClean && gLower.includes(lotNomClean)) {
        groupJidToLot.set(jid, lot.nom);
        break;
      }
    }
  }

  // ── Map messages → contact → lot (pre-match for LLM) ─────────
  const mappedMessages = waMessages.map((m: any) => {
    const groupName = groupJidToName.get(m.group_id) ?? null;
    const groupLot = groupJidToLot.get(m.group_id) ?? null;

    // CAS PROPRIÉTAIRE : from_me = true → c'est le client qui parle
    if (m.from_me) {
      return {
        source: "whatsapp" as const,
        from_name: "Vous (propriétaire)",
        from_phone: "",
        body: m.body ?? "",
        timestamp: m.timestamp,
        matched_lot: groupLot,
        group_name: groupName,
        is_owner: true,
        is_known_contact: true,
        contact_role: "proprietaire",
      };
    }

    // CAS ARTISAN / ARCHITECTE / INCONNU
    const phone = String(m.from_number).replace(/^\+/, "");
    const contact = phoneToContact.get(phone);
    const lotFromContact = contact?.lot_id
      ? enrichedLots.find((l: any) => l.id === contact.lot_id)?.nom ?? null
      : null;
    return {
      source: "whatsapp" as const,
      from_name: contact?.nom ?? phone,
      from_phone: phone,
      body: m.body ?? "",
      timestamp: m.timestamp,
      matched_lot: lotFromContact ?? groupLot,
      group_name: groupName,
      is_owner: false,
      is_known_contact: !!contact,
      contact_role: contact?.role ?? null,
    };
  });

  // ── Detect owner's unanswered questions (from_me with no reply in same group within 48h) ──
  const ownerQuestions = mappedMessages.filter((m: any) => m.is_owner && m.body.includes("?"));
  const ownerPendingQuestions: Array<{ body: string; timestamp: string; group_name: string | null; inferred_lot: string | null }> = [];
  for (const q of ownerQuestions) {
    const repliesAfter = mappedMessages.filter((m: any) =>
      !m.is_owner &&
      m.group_name === q.group_name &&
      m.timestamp > q.timestamp
    );
    if (repliesAfter.length === 0) {
      const { data: recentReplies } = await supabase
        .from("chantier_whatsapp_messages")
        .select("id")
        .eq("chantier_id", chantierId)
        .eq("group_id", waMessages.find((wm: any) => wm.timestamp === q.timestamp)?.group_id ?? "")
        .eq("from_me", false)
        .gt("timestamp", q.timestamp)
        .limit(1);
      if (!recentReplies || recentReplies.length === 0) {
        ownerPendingQuestions.push({
          body: q.body,
          timestamp: q.timestamp,
          group_name: q.group_name,
          inferred_lot: q.matched_lot,
        });
      }
    }
  }

  // ── Overdue payments (from payment-events API) ────────────────
  const allEvents = Array.isArray(paymentEventsRes) ? paymentEventsRes : (paymentEventsRes?.data ?? []);
  const now = Date.now();
  const overduePayments = allEvents
    .filter((pe: any) => pe.status === "pending" && pe.due_date && new Date(pe.due_date).getTime() < now)
    .map((pe: any) => ({
      label: pe.label ?? "Paiement",
      amount: pe.amount ?? 0,
      due_date: pe.due_date,
      days_late: Math.floor((now - new Date(pe.due_date).getTime()) / 86400000),
      lot_nom: pe.lot_nom ?? "Inconnu",
    }));

  // ── Risk alerts (silence + no devis + approaching deadlines) ──
  const riskAlerts: Array<{ lot_nom: string; risk: string; details: string }> = [];

  // Batch-fetch last message per contact phone (avoid N+1 queries)
  const lotPhones = enrichedLots
    .filter((l: any) => l.contact_phone)
    .map((l: any) => l.contact_phone!.replace(/^\+/, "").replace(/^0/, "33"));

  const lastMsgByPhone = new Map<string, string>();
  if (lotPhones.length > 0) {
    const { data: lastMsgs } = await supabase
      .from("chantier_whatsapp_messages")
      .select("from_number, timestamp")
      .eq("chantier_id", chantierId)
      .in("from_number", lotPhones)
      .order("timestamp", { ascending: false });

    for (const msg of lastMsgs ?? []) {
      if (!lastMsgByPhone.has(msg.from_number)) {
        lastMsgByPhone.set(msg.from_number, msg.timestamp);
      }
    }
  }

  for (const lot of enrichedLots) {
    if (lot.date_debut && lot.statut === "a_faire" && lot.nb_devis === 0) {
      const daysUntil = Math.floor((new Date(lot.date_debut).getTime() - now) / 86400000);
      if (daysUntil >= 0 && daysUntil <= 14) {
        riskAlerts.push({ lot_nom: lot.nom, risk: "no_devis", details: `Début dans ${daysUntil}j, aucun devis` });
      }
    }

    if (lot.nb_devis === 1 && lot.statut === "a_faire") {
      riskAlerts.push({ lot_nom: lot.nom, risk: "single_devis", details: `1 seul devis — idéalement 2-3 pour comparer` });
    }

    if (lot.contact_phone) {
      const norm = lot.contact_phone.replace(/^\+/, "").replace(/^0/, "33");
      const lastMsgTs = lastMsgByPhone.get(norm);

      if (!lastMsgTs) {
        riskAlerts.push({ lot_nom: lot.nom, risk: "no_messages", details: `Aucun message de ${lot.contact_nom}` });
      } else {
        const daysSince = Math.floor((now - new Date(lastMsgTs).getTime()) / 86400000);
        if (daysSince >= 5) {
          riskAlerts.push({ lot_nom: lot.nom, risk: "silent_contact", details: `Pas de nouvelles de ${lot.contact_nom} depuis ${daysSince}j` });
        }
      }
    }
  }

  return {
    chantier: {
      id: chantierId,
      nom: chantier?.nom ?? "",
      emoji: chantier?.emoji ?? "",
      phase: chantier?.phase ?? "",
      budget_ia: budgetRes?.budget_ia ?? chantier?.metadonnees?.budgetTotal ?? 0,
      date_debut: chantier?.date_debut_chantier ?? planningRes?.dateDebutChantier ?? null,
      type_projet: chantier?.type_projet ?? "",
      user_id: chantier?.user_id ?? "",
    },
    lots: enrichedLots,
    messages_since_last_run: mappedMessages,
    owner_pending_questions: ownerPendingQuestions,
    budget_conseils: budgetRes?.conseils ?? [],
    overdue_payments: overduePayments,
    risk_alerts: riskAlerts,
    recent_insights: insightsRes.data ?? [],

    todays_insights_with_actions: await (async () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("agent_insights")
        .select("type, severity, title, body, actions_taken, source_event, created_at")
        .eq("chantier_id", chantierId)
        .gte("created_at", todayStart.toISOString())
        .neq("type", "digest")
        .order("created_at", { ascending: true });
      return data ?? [];
    })(),

    taches: await (async () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("todo_chantier")
        .select("titre, priorite, done, created_at")
        .eq("chantier_id", chantierId)
        .order("ordre", { ascending: true });
      return (data ?? []).map((t: any) => ({
        ...t,
        created_today: new Date(t.created_at) >= todayStart,
      }));
    })(),
  };
}
