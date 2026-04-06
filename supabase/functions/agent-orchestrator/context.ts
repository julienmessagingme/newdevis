import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ChantierContext } from "./types.ts";

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Static context data that changes rarely and is expensive to fetch (4 API calls).
 * Cached in agent_context_cache with 4h TTL. Invalidated by contacts/lots/planning/docs mutations.
 */
interface CachedStaticContext {
  chantier: ChantierContext["chantier"];
  lots: ChantierContext["lots"];
  budget_conseils: ChantierContext["budget_conseils"];
  overdue_payments: ChantierContext["overdue_payments"];
  phoneToContact: Array<[string, { nom: string; lot_id: string | null; role: string }]>;
  groupJidToName: Array<[string, string]>;
  groupJidToLot: Array<[string, string]>;
}

/**
 * Rich context built from EXISTING API routes + cache.
 * Static data (budget, planning, contacts, payments) → cached 4h in agent_context_cache.
 * Dynamic data (messages, insights, tasks) → always fresh from Supabase.
 */
export async function buildContext(
  supabase: SupabaseClient,
  chantierId: string,
  lastRunAt: string | null,
  agentKey: string,
  apiBase: string,
): Promise<ChantierContext> {
  const since = lastRunAt ?? new Date(Date.now() - 86400000).toISOString();

  // ── Try cache for static data ────────────────────────────────────────
  let staticCtx: CachedStaticContext | null = null;

  const { data: cached } = await supabase
    .from("agent_context_cache")
    .select("context_json, hydrated_at")
    .eq("chantier_id", chantierId)
    .eq("invalidated", false)
    .single();

  if (cached?.context_json && cached.hydrated_at) {
    const age = Date.now() - new Date(cached.hydrated_at).getTime();
    if (age < CACHE_TTL_MS) {
      staticCtx = cached.context_json as CachedStaticContext;
    }
  }

  // ── Build static context from API routes if cache miss ───────────────
  if (!staticCtx) {
    const headers: Record<string, string> = { "X-Agent-Key": agentKey };

    const [budgetRes, planningRes, contactsRes, paymentEventsRes, chantierRes, waGroupsRes] =
      await Promise.all([
        fetch(`${apiBase}/api/chantier/${chantierId}/budget`, { headers }).then(r => r.json()),
        fetch(`${apiBase}/api/chantier/${chantierId}/planning`, { headers }).then(r => r.json()),
        fetch(`${apiBase}/api/chantier/${chantierId}/contacts`, { headers }).then(r => r.json()),
        fetch(`${apiBase}/api/chantier/${chantierId}/payment-events`, { headers }).then(r => r.json()),
        supabase.from("chantiers")
          .select("id, nom, emoji, phase, type_projet, date_debut_chantier, metadonnees, user_id")
          .eq("id", chantierId).single(),
        supabase.from("chantier_whatsapp_groups")
          .select("group_jid, name")
          .eq("chantier_id", chantierId),
      ]);

    const chantier = chantierRes.data;
    const contacts = contactsRes?.contacts ?? [];
    const waGroups = waGroupsRes.data ?? [];

    // Phone → contact mapping
    const phoneToContactMap = new Map<string, { nom: string; lot_id: string | null; role: string }>();
    for (const c of contacts) {
      if (c.telephone) {
        const norm = c.telephone.replace(/^\+/, "").replace(/^0/, "33");
        phoneToContactMap.set(norm, { nom: c.nom, lot_id: c.lot_id, role: c.role ?? "" });
      }
    }

    // Group JID → name mapping
    const groupJidToNameMap = new Map<string, string>(
      waGroups.map((g: any) => [g.group_jid, g.name])
    );

    // Merge planning + budget lots
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
        contact_phone: lotContact?.telephone ?? null,
        contact_metier: lotContact?.role ?? null,
      };
    });

    // Group → lot fuzzy mapping
    const groupJidToLotMap = new Map<string, string>();
    for (const [jid, gName] of groupJidToNameMap) {
      const gLower = gName.toLowerCase();
      for (const lot of enrichedLots) {
        const lotNomClean = lot.nom.replace(/^\P{L}+/u, "").toLowerCase();
        if (lotNomClean && gLower.includes(lotNomClean)) {
          groupJidToLotMap.set(jid, lot.nom);
          break;
        }
      }
    }

    // Overdue payments
    const allEvents = paymentEventsRes?.payment_events ?? [];
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

    staticCtx = {
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
      budget_conseils: budgetRes?.conseils ?? [],
      overdue_payments: overduePayments,
      phoneToContact: [...phoneToContactMap.entries()],
      groupJidToName: [...groupJidToNameMap.entries()],
      groupJidToLot: [...groupJidToLotMap.entries()],
    };

    // Persist cache (fire-and-forget)
    supabase.from("agent_context_cache").upsert({
      chantier_id: chantierId,
      context_json: staticCtx,
      hydrated_at: new Date().toISOString(),
      invalidated: false,
    }, { onConflict: "chantier_id" }).then(() => {}).catch(() => {});
  }

  // ── Rebuild maps from cached arrays ──────────────────────────────────
  const phoneToContact = new Map(staticCtx.phoneToContact);
  const groupJidToName = new Map(staticCtx.groupJidToName);
  const groupJidToLot = new Map(staticCtx.groupJidToLot);
  const enrichedLots = staticCtx.lots;

  // ── Always-fresh dynamic data ────────────────────────────────────────
  const [waMessagesRes, insightsRes] = await Promise.all([
    supabase.from("chantier_whatsapp_messages")
      .select("from_number, from_me, group_id, body, type, timestamp")
      .eq("chantier_id", chantierId)
      .gte("timestamp", since)
      .order("timestamp", { ascending: true })
      .limit(50),
    supabase.from("agent_insights")
      .select("type, title, created_at")
      .eq("chantier_id", chantierId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const waMessages = waMessagesRes.data ?? [];

  // ── Map messages → contact → lot ─────────────────────────────────────
  const mappedMessages = waMessages.map((m: any) => {
    const groupName = groupJidToName.get(m.group_id) ?? null;
    const groupLot = groupJidToLot.get(m.group_id) ?? null;

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

  // ── Detect owner's unanswered questions ──────────────────────────────
  const ownerQuestions = mappedMessages.filter((m: any) => m.is_owner && m.body.includes("?"));
  const ownerPendingQuestions: Array<{ body: string; timestamp: string; group_name: string | null; inferred_lot: string | null }> = [];

  // Batch check: collect all question group_ids and check replies in one query
  const questionGroupIds = [...new Set(ownerQuestions.map((q: any) => {
    const wm = waMessages.find((m: any) => m.timestamp === q.timestamp);
    return wm?.group_id;
  }).filter(Boolean))];

  const repliesByGroup = new Map<string, string[]>();
  if (questionGroupIds.length > 0) {
    const oldestQuestion = ownerQuestions.reduce((min: any, q: any) => q.timestamp < min ? q.timestamp : min, ownerQuestions[0].timestamp);
    const { data: allReplies } = await supabase
      .from("chantier_whatsapp_messages")
      .select("group_id, timestamp")
      .eq("chantier_id", chantierId)
      .in("group_id", questionGroupIds)
      .eq("from_me", false)
      .gte("timestamp", oldestQuestion);

    for (const r of allReplies ?? []) {
      const arr = repliesByGroup.get(r.group_id) ?? [];
      arr.push(r.timestamp);
      repliesByGroup.set(r.group_id, arr);
    }
  }

  for (const q of ownerQuestions) {
    // Check in-batch replies first
    const repliesAfter = mappedMessages.filter((m: any) =>
      !m.is_owner && q.group_name && m.group_name === q.group_name && m.timestamp > q.timestamp
    );
    if (repliesAfter.length === 0) {
      const wm = waMessages.find((m: any) => m.timestamp === q.timestamp);
      const groupReplies = repliesByGroup.get(wm?.group_id ?? "") ?? [];
      const hasReply = groupReplies.some(ts => ts > q.timestamp);
      if (!hasReply) {
        ownerPendingQuestions.push({
          body: q.body,
          timestamp: q.timestamp,
          group_name: q.group_name,
          inferred_lot: q.matched_lot,
        });
      }
    }
  }

  // ── Risk alerts (silence + no devis + approaching deadlines) ─────────
  const riskAlerts: Array<{ lot_nom: string; risk: string; details: string }> = [];
  const now = Date.now();

  // Batch-fetch last message per contact phone
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
    chantier: staticCtx.chantier,
    lots: enrichedLots,
    messages_since_last_run: mappedMessages,
    owner_pending_questions: ownerPendingQuestions,
    budget_conseils: staticCtx.budget_conseils,
    overdue_payments: staticCtx.overdue_payments,
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
        .select("id, titre, priorite, done, created_at")
        .eq("chantier_id", chantierId)
        .order("ordre", { ascending: true });
      return (data ?? []).map((t: any) => ({
        ...t,
        created_today: new Date(t.created_at) >= todayStart,
      }));
    })(),
  };
}
