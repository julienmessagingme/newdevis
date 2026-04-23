import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ChantierContext, AssistantMessage } from "./types.ts";

const FETCH_TIMEOUT_MS = 5000; // timeout par appel API (5s)

/**
 * Rich context built from live API routes + Supabase queries.
 * NO CACHE : tout est fetch à chaque appel pour éviter les bugs de sync.
 * Au prix de ~5-7 requêtes SQL/API supplémentaires (invisibles < 300ms).
 *
 * Robustesse :
 *  - Chaque fetch a un timeout explicite (AbortController) pour éviter les
 *    hangs silencieux.
 *  - Erreur/timeout sur une source → warning log + data vide, PAS de crash.
 */
export async function buildContext(
  supabase: SupabaseClient,
  chantierId: string,
  lastRunAt: string | null,
  agentKey: string,
  apiBase: string,
  conversationHistory: AssistantMessage[] = [],
): Promise<ChantierContext> {
  const since = lastRunAt ?? new Date(Date.now() - 86400000).toISOString();
  const headers: Record<string, string> = { "X-Agent-Key": agentKey };

  // Helper : fetch avec timeout + parsing safe. Retourne {} si timeout/erreur.
  const safeFetchJson = async (url: string, label: string): Promise<any> => {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const r = await fetch(url, { headers, signal: ctrl.signal });
      clearTimeout(timeoutId);
      if (!r.ok) {
        console.warn(`[buildContext] ${label} HTTP ${r.status}`);
        return {};
      }
      return await r.json();
    } catch (err) {
      clearTimeout(timeoutId);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("aborted") || (err as Error).name === "AbortError") {
        console.warn(`[buildContext] ${label} TIMEOUT (${FETCH_TIMEOUT_MS}ms)`);
      } else {
        console.warn(`[buildContext] ${label} ERROR: ${msg}`);
      }
      return {};
    }
  };

  // ── Fetch parallèle : APIs + Supabase ────────────────────────────────────
  const [
    budgetRes, planningRes, contactsRes, paymentEventsRes,
    chantierRes, waGroupsRes,
  ] = await Promise.all([
    safeFetchJson(`${apiBase}/api/chantier/${chantierId}/budget`, "budget"),
    safeFetchJson(`${apiBase}/api/chantier/${chantierId}/planning`, "planning"),
    safeFetchJson(`${apiBase}/api/chantier/${chantierId}/contacts`, "contacts"),
    safeFetchJson(`${apiBase}/api/chantier/${chantierId}/payment-events`, "payment-events"),
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

  // Sanity check : si l'API planning a retourné 0 lots alors qu'il y en a en DB,
  // fallback direct DB (évite un agent qui répond "aucun lot" sur API foireuse).
  let planningLots = planningRes?.lots ?? [];
  if (planningLots.length === 0) {
    const { data: dbLots, count } = await supabase
      .from("lots_chantier")
      .select("id, nom, emoji, statut, duree_jours, delai_avant_jours, date_debut, date_fin, ordre_planning, lane_index, budget_avg_ht", { count: "exact" })
      .eq("chantier_id", chantierId)
      .order("date_debut", { ascending: true, nullsFirst: false });
    if ((count ?? 0) > 0) {
      console.warn(`[buildContext] API planning vide mais DB a ${count} lots — fallback direct`);
      planningLots = dbLots ?? [];
    }
  }

  // Phone → contact mapping
  const phoneToContact = new Map<string, { nom: string; lot_id: string | null; role: string }>();
  for (const c of contacts) {
    if (c.telephone) {
      const norm = c.telephone.replace(/^\+/, "").replace(/^0/, "33");
      phoneToContact.set(norm, { nom: c.nom, lot_id: c.lot_id, role: c.role ?? "" });
    }
  }

  // Group JID → name mapping
  const groupJidToName = new Map<string, string>(
    waGroups.map((g: any) => [g.group_jid, g.name])
  );

  // Merge planning + budget lots
  const budgetLots = budgetRes?.lots ?? [];
  const budgetByLotId = new Map(budgetLots.map((bl: any) => [bl.id, bl]));

  const enrichedLots = planningLots.map((pl: any) => {
    const bl = budgetByLotId.get(pl.id);
    const totaux = bl?.totaux ?? {};
    const nbDevis = bl?.nb_devis_recus ?? (bl?.devis ?? []).length;
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
  const groupJidToLot = new Map<string, string>();
  for (const [jid, gName] of groupJidToName) {
    const gLower = gName.toLowerCase();
    for (const lot of enrichedLots) {
      const lotNomClean = lot.nom.replace(/^\P{L}+/u, "").toLowerCase();
      if (lotNomClean && gLower.includes(lotNomClean)) {
        groupJidToLot.set(jid, lot.nom);
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

  // Contacts sans WhatsApp
  const lotById = new Map(enrichedLots.map((l: any) => [l.id, l.nom]));
  const contactsNoWA = contacts
    .filter((c: any) => c.has_whatsapp === false && c.telephone)
    .map((c: any) => ({
      nom: c.nom as string,
      telephone: c.telephone as string,
      lot_nom: c.lot_id ? (lotById.get(c.lot_id) ?? null) : null,
    }));

  // ── Always-fresh dynamic data ────────────────────────────────────────
  const photoCutoff = new Date(Date.now() - 7 * 86400000).toISOString();
  const [waMessagesRes, insightsRes, outgoingRes, recentPhotosRes] = await Promise.all([
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
    supabase.from("whatsapp_outgoing_messages")
      .select("id, body, sent_at, group_jid, whatsapp_message_statuses(viewer_phone, status, updated_at)")
      .eq("chantier_id", chantierId)
      .order("sent_at", { ascending: false })
      .limit(5),
    supabase.from("documents_chantier")
      .select("id, nom, vision_description, lot_id, whatsapp_message_id, created_at, bucket_path")
      .eq("chantier_id", chantierId)
      .eq("source", "whatsapp")
      .eq("document_type", "photo")
      .gte("created_at", photoCutoff)
      .not("vision_description", "is", null)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const waMessages = waMessagesRes.data ?? [];

  // Build read receipt summaries
  const outgoingMessages = outgoingRes.data ?? [];
  const recentOutgoingReadStatus = outgoingMessages.map((msg: any) => {
    const statuses: any[] = msg.whatsapp_message_statuses ?? [];
    const sentAt = new Date(msg.sent_at).getTime();
    return {
      message_id:   msg.id,
      body_preview: (msg.body ?? "").slice(0, 120),
      sent_at:      msg.sent_at,
      chat_jid:     msg.group_jid,
      statuses: statuses.map((s: any) => ({
        viewer_phone:    s.viewer_phone ?? s.viewer_id?.split("@")[0] ?? "",
        viewer_name:     phoneToContact.get(s.viewer_phone ?? s.viewer_id?.split("@")[0] ?? "")?.nom ?? null,
        status:          s.status,
        updated_at:      s.updated_at,
        hours_since_sent: Math.round((new Date(s.updated_at).getTime() - sentAt) / 3600000),
      })),
    };
  });

  // Map messages → contact → lot
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

  // Detect owner's unanswered questions
  const ownerQuestions = mappedMessages.filter((m: any) => m.is_owner && m.body.includes("?"));
  const ownerPendingQuestions: Array<{ body: string; timestamp: string; group_name: string | null; inferred_lot: string | null }> = [];

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

  // Risk alerts
  const riskAlerts: Array<{ lot_nom: string; risk: string; details: string }> = [];
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

  // Recent photos with lot names
  const rawPhotos = recentPhotosRes.data ?? [];
  const recentPhotos = rawPhotos.map((p: any) => ({
    doc_id: p.id,
    nom: p.nom,
    vision_description: p.vision_description,
    lot_id: p.lot_id,
    lot_nom: p.lot_id ? (enrichedLots.find((l: any) => l.id === p.lot_id)?.nom ?? null) : null,
    sender_phone: null,
    created_at: p.created_at,
    storage_path: p.bucket_path,
  }));

  // Documents list
  const { data: rawDocs } = await supabase
    .from("documents_chantier")
    .select("id, nom, document_type, lot_id, montant, devis_statut, analyse_id, created_at")
    .eq("chantier_id", chantierId)
    .order("created_at", { ascending: false })
    .limit(50);
  const documentsList = (rawDocs ?? []).map((d: any) => ({
    id: d.id,
    nom: d.nom,
    document_type: d.document_type,
    lot_id: d.lot_id,
    lot_nom: d.lot_id ? (enrichedLots.find((l: any) => l.id === d.lot_id)?.nom ?? null) : null,
    montant: d.montant ?? null,
    devis_statut: d.devis_statut ?? null,
    analyse_id: d.analyse_id ?? null,
    created_at: d.created_at,
  }));

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
    contacts_no_whatsapp: contactsNoWA,
    risk_alerts: riskAlerts,
    recent_insights: insightsRes.data ?? [],
    recent_outgoing_read_status: recentOutgoingReadStatus,
    recent_photos: recentPhotos,
    documents: documentsList,
    conversation_history: conversationHistory,

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
