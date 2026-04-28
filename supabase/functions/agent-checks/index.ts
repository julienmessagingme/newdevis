import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "invalid body" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }); }

  const chantier_id = body.chantier_id as string;
  if (!chantier_id) return new Response(JSON.stringify({ error: "chantier_id required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

  const supabase = createClient(supabaseUrl, supabaseKey);
  const insights: Array<Record<string, unknown>> = [];

  // Get chantier owner + metadata
  const { data: chantier } = await supabase
    .from("chantiers")
    .select("user_id, metadonnees")
    .eq("id", chantier_id)
    .single();
  if (!chantier) return new Response(JSON.stringify({ error: "chantier not found" }), { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });

  const userId = chantier.user_id;

  // Load lots + documents in parallel
  const [lotsRes, docsRes] = await Promise.all([
    supabase.from("lots_chantier").select("id, nom, budget_avg_ht, date_debut, statut").eq("chantier_id", chantier_id),
    supabase.from("documents_chantier").select("id, lot_id, montant, document_type, facture_statut, devis_statut").eq("chantier_id", chantier_id),
  ]);
  const lots = lotsRes.data ?? [];
  const docs = docsRes.data ?? [];

  // ── CHECK 1: Budget overrun per lot ──────────────────────────
  for (const lot of lots) {
    if (!lot.budget_avg_ht || lot.budget_avg_ht <= 0) continue;
    const factures = docs.filter(d => d.lot_id === lot.id && d.document_type === "facture");
    const totalFactures = factures.reduce((sum, d) => sum + (d.montant ?? 0), 0);
    if (totalFactures > lot.budget_avg_ht) {
      const depassement = totalFactures - lot.budget_avg_ht;
      const pct = Math.round((depassement / lot.budget_avg_ht) * 100);
      insights.push({
        chantier_id, user_id: userId,
        type: "budget_alert",
        severity: pct > 20 ? "critical" : "warning",
        title: `Dépassement budget ${lot.nom} : +${pct}%`,
        body: `Le lot "${lot.nom}" a reçu ${totalFactures.toFixed(0)}€ de factures pour un budget prévu de ${lot.budget_avg_ht.toFixed(0)}€. Dépassement : ${depassement.toFixed(0)}€.`,
        source_event: { check: "budget_overrun", lot_id: lot.id },
      });
    }
  }

  // ── CHECK 2: Overdue payments ────────────────────────────────
  // PR4 : lit la VIEW payment_events_v (la table payment_events legacy
  // est en lecture-seule depuis PR4, drop prévu PR5).
  const { data: overduePayments } = await supabase
    .from("payment_events_v")
    .select("id, label, amount, due_date, source_type")
    .eq("project_id", chantier_id)
    .eq("status", "pending")
    .lt("due_date", new Date().toISOString().split("T")[0]);

  for (const pe of overduePayments ?? []) {
    const daysLate = Math.floor((Date.now() - new Date(pe.due_date).getTime()) / 86400000);
    insights.push({
      chantier_id, user_id: userId,
      type: "payment_overdue",
      severity: daysLate > 14 ? "critical" : "warning",
      title: `Paiement en retard : ${pe.label} (${daysLate}j)`,
      body: `${pe.label} — ${pe.amount?.toFixed(0)}€ — échéance ${pe.due_date}, en retard de ${daysLate} jours.`,
      source_event: { check: "payment_overdue", payment_event_id: pe.id },
    });
  }

  // ── CHECK 3: Lots without signed devis approaching start ───���─
  for (const lot of lots) {
    if (!lot.date_debut || lot.statut !== "a_faire") continue;
    const lotDevisValides = docs.filter(d => d.lot_id === lot.id && d.document_type === "devis" && d.devis_statut === "valide");
    if (lotDevisValides.length > 0) continue;
    const daysUntil = Math.floor((new Date(lot.date_debut).getTime() - Date.now()) / 86400000);
    if (daysUntil >= 0 && daysUntil <= 14) {
      insights.push({
        chantier_id, user_id: userId,
        type: "risk_detected",
        severity: daysUntil <= 7 ? "critical" : "warning",
        title: `${lot.nom} : pas de devis signé, début dans ${daysUntil}j`,
        body: `Le lot "${lot.nom}" doit d��marrer le ${lot.date_debut} mais aucun devis n'est signé.`,
        source_event: { check: "no_signed_devis", lot_id: lot.id },
      });
    }
  }

  // ── CHECK 4: Factures en litige ──────────────────────────────
  const litiges = docs.filter(d => d.document_type === "facture" && d.facture_statut === "en_litige");
  for (const doc of litiges) {
    const lot = lots.find(l => l.id === doc.lot_id);
    insights.push({
      chantier_id, user_id: userId,
      type: "budget_alert", severity: "critical",
      title: `Facture en litige${lot ? ` — ${lot.nom}` : ""}`,
      body: `Une facture de ${doc.montant?.toFixed(0) ?? "?"}€ est en litige.`,
      source_event: { check: "facture_litige", document_id: doc.id },
    });
  }

  // ── CHECK 5: Budget global dépassé (devis > budget IA × 1.08) ─
  const budgetIA = (chantier.metadonnees as Record<string, unknown>)?.budgetTotal as number | undefined;
  if (budgetIA && budgetIA > 0) {
    const totalDevisValides = docs
      .filter(d => d.document_type === "devis" && ["valide", "attente_facture"].includes(d.devis_statut ?? ""))
      .reduce((sum, d) => sum + (d.montant ?? 0), 0);
    if (totalDevisValides > budgetIA * 1.08) {
      const ecart = Math.round(totalDevisValides - budgetIA);
      insights.push({
        chantier_id, user_id: userId,
        type: "budget_alert", severity: "warning",
        title: `Budget global dépassé de ${ecart}€`,
        body: `Les devis validés totalisent ${totalDevisValides.toFixed(0)}€ pour un budget estimé de ${budgetIA.toFixed(0)}€ (+${Math.round((ecart / budgetIA) * 100)}%).`,
        source_event: { check: "budget_global_overrun" },
      });
    }
  }

  // ── CHECK 6: Devis à relancer ────────────────────────────────
  const aRelancer = docs.filter(d => d.document_type === "devis" && d.devis_statut === "a_relancer");
  if (aRelancer.length > 0) {
    insights.push({
      chantier_id, user_id: userId,
      type: "risk_detected", severity: "info",
      title: `${aRelancer.length} devis à relancer`,
      body: `Des devis sont en attente de relance artisan.`,
      source_event: { check: "devis_a_relancer", count: aRelancer.length },
    });
  }

  // ── CHECK 7: Paiements sans preuve ───────────────────────────
  const facPayees = docs.filter(d => d.document_type === "facture" && d.facture_statut === "payee");
  const preuves = docs.filter(d => d.document_type === "preuve_paiement");
  if (facPayees.length > 0 && preuves.length === 0) {
    insights.push({
      chantier_id, user_id: userId,
      type: "risk_detected", severity: "warning",
      title: "Aucune preuve de paiement conservée",
      body: `${facPayees.length} facture(s) payée(s) mais aucun justificatif uploadé. Conservez vos preuves pour les garanties et litiges.`,
      source_event: { check: "missing_proofs" },
    });
  }

  // ── INSERT insights (deduplicate by title within 24h, handle unique index conflict) ──
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  let inserted = 0;

  for (const ins of insights) {
    const { data: existing } = await supabase
      .from("agent_insights")
      .select("id")
      .eq("chantier_id", chantier_id)
      .eq("title", ins.title)
      .gte("created_at", yesterday)
      .limit(1);

    if (!existing || existing.length === 0) {
      const { error } = await supabase.from("agent_insights").insert(ins);
      if (!error) inserted++;
      // Unique index conflict (23505) is silently ignored — dedup working as expected
    }
  }

  console.log(`[agent-checks] ${chantier_id}: ${insights.length} checks, ${inserted} new insights`);

  return new Response(
    JSON.stringify({ checks: insights.length, inserted }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
