# Agent Orchestration "Pilote de Chantier" — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a cost-efficient AI agent that monitors construction projects via deterministic SQL checks (free) + 2 daily LLM calls (Gemini 2.5 Flash). Dual-mode: edge function by default, OpenClaw optional.

**Architecture:** Real-time agent with context caching. On first event of the day, hydrates full context from existing APIs (budget, planning, contacts, payment-events) and caches it in Postgres. Subsequent events reuse the cache (~1.5K tokens instead of 6K). Deterministic SQL checks ($0) on every document upload. LLM (Gemini 2.5 Flash) triggered real-time on every WhatsApp/email message. Evening cron generates digest → journal de chantier (book UX) + WhatsApp + Email. Dual-mode: edge function (default, we pay) or OpenClaw (user pays, real-time + stateful).

**Cost:** ~$0.15/month per active user (cache reduces per-event cost to ~$0.0002). Budget/risk checks are SQL = $0.

**Tech Stack:** Supabase Edge Functions (Deno), Gemini 2.5 Flash, existing API routes, Whapi, SendGrid. Optional: OpenClaw.

**Design doc:** `docs/plans/2026-04-05-agent-orchestration-design.md`

---

## Task 1: Migration — Create `agent_insights` + `agent_config` tables

**Files:**
- Create: `supabase/migrations/20260405120000_create_agent_tables.sql`

**Step 1: Write the migration**

```sql
-- ============================================================
-- Agent insights: observations from deterministic checks + LLM
-- ============================================================
CREATE TABLE agent_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'planning_impact', 'budget_alert', 'payment_overdue', 'conversation_summary',
    'risk_detected', 'digest', 'lot_status_change', 'needs_clarification'
  )),
  severity TEXT CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source_event JSONB,
  actions_taken JSONB DEFAULT '[]'::jsonb,
  needs_confirmation BOOLEAN DEFAULT FALSE,
  read_by_user BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_insights_chantier ON agent_insights(chantier_id, created_at DESC);
CREATE INDEX idx_insights_unread ON agent_insights(chantier_id, read_by_user) WHERE NOT read_by_user;
CREATE INDEX idx_insights_user ON agent_insights(user_id, created_at DESC);

ALTER TABLE agent_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own insights"
  ON agent_insights FOR SELECT USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Service role can insert insights"
  ON agent_insights FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own insights"
  ON agent_insights FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ============================================================
-- Agent config: dual-mode (edge_function or openclaw)
-- ============================================================
CREATE TABLE agent_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  agent_mode TEXT NOT NULL DEFAULT 'edge_function'
    CHECK (agent_mode IN ('edge_function', 'openclaw', 'disabled')),
  openclaw_url TEXT,
  openclaw_token TEXT,
  openclaw_agent_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agent_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own config"
  ON agent_config FOR ALL USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Service role full access"
  ON agent_config FOR ALL USING (true);

-- ============================================================
-- Agent run log: tracks when the LLM last ran per chantier
-- (needed to know "messages since last run")
-- ============================================================
CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  run_type TEXT NOT NULL CHECK (run_type IN ('morning', 'evening')),
  messages_analyzed INT DEFAULT 0,
  insights_created INT DEFAULT 0,
  actions_taken JSONB DEFAULT '[]'::jsonb,
  tokens_used INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_runs_chantier ON agent_runs(chantier_id, created_at DESC);

-- ============================================================
-- Chantier journal: 1 page per day, like a book
-- The evening digest writes here (in addition to WhatsApp/email)
-- ============================================================
CREATE TABLE chantier_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  journal_date DATE NOT NULL,
  body TEXT NOT NULL,            -- markdown content (the digest)
  alerts_count INT DEFAULT 0,   -- for calendar dot colors
  max_severity TEXT DEFAULT 'info' CHECK (max_severity IN ('info', 'warning', 'critical')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(chantier_id, journal_date)
);

CREATE INDEX idx_journal_chantier ON chantier_journal(chantier_id, journal_date DESC);

ALTER TABLE chantier_journal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own journal"
  ON chantier_journal FOR SELECT USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Service role can write journal"
  ON chantier_journal FOR ALL USING (true);

-- ============================================================
-- Agent context cache: avoids re-hydrating 6K tokens on every event
-- Invalidated when documents/planning/contacts change (TTL 4h max)
-- ============================================================
CREATE TABLE agent_context_cache (
  chantier_id UUID PRIMARY KEY REFERENCES chantiers(id) ON DELETE CASCADE,
  context_json JSONB NOT NULL,       -- full hydrated context
  hydrated_at TIMESTAMPTZ NOT NULL,  -- when the cache was built
  invalidated BOOLEAN DEFAULT FALSE  -- set true when data changes
);

-- No RLS needed — only accessed by service_role from edge functions

ALTER TABLE chantier_journal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own journal"
  ON chantier_journal FOR SELECT USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Service role can write journal"
  ON chantier_journal FOR ALL USING (true);
```

**Step 2: Apply migration**

Run via Supabase MCP tool `apply_migration`.

**Step 3: Regenerate types**

```bash
npx supabase gen types typescript --project-id vhrhgsqxwvouswjaiczn > src/integrations/supabase/types.ts
```

**Step 4: Commit**

```bash
git add supabase/migrations/20260405120000_create_agent_tables.sql src/integrations/supabase/types.ts
git commit -m "feat: create agent_insights, agent_config, agent_runs tables"
```

---

## Task 2: API routes — insights + agent config

**Files:**
- Create: `src/pages/api/chantier/[id]/insights.ts`
- Create: `src/pages/api/chantier/agent-config.ts`

### Step 1: Insights route

Create `src/pages/api/chantier/[id]/insights.ts` — GET (list), POST (create from agent), PATCH (mark read).

See previous plan version for full code — unchanged except POST now also accepts `X-Agent-Key` auth.

### Step 2: Agent config route

Create `src/pages/api/chantier/agent-config.ts` — GET (read config), PUT (update mode + OpenClaw creds).

Validates that `openclaw_url` + `openclaw_token` are provided when mode is `openclaw`.

### Step 3: Auth support — add `X-Agent-Key` to apiHelpers.ts

Update `authenticate()` in `src/lib/apiHelpers.ts` to accept `X-Agent-Key` header as alternative to JWT. Returns synthetic user context with service_role supabase client.

**Step 4: Commit**

```bash
git add src/pages/api/chantier/[id]/insights.ts src/pages/api/chantier/agent-config.ts src/lib/apiHelpers.ts
git commit -m "feat: insights API + agent config API + X-Agent-Key auth"
```

---

## Task 3: Edge function — `agent-checks` (deterministic, real-time, $0)

**This is the Layer 1** — triggered on document upload (facture/devis). Pure SQL, no LLM. Runs in <500ms.

**Files:**
- Create: `supabase/functions/agent-checks/index.ts`

**Triggers:** Called fire-and-forget from:
- `api/chantier/[id]/documents/register` (manual invoice entry)
- `api/chantier/[id]/documents/depense-rapide` (quick expense)
- `api/chantier/[id]/documents/extract-invoice` (after AI extraction)

**NOT triggered by:** WhatsApp messages, emails (those are handled by the daily LLM cron).

### Step 1: Create the edge function

```typescript
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

  const { chantier_id } = await req.json();
  if (!chantier_id) return new Response(JSON.stringify({ error: "chantier_id required" }), { status: 400, headers: CORS });

  const supabase = createClient(supabaseUrl, supabaseKey);
  const insights: Array<Record<string, unknown>> = [];

  // Get chantier owner
  const { data: chantier } = await supabase
    .from("chantiers")
    .select("user_id, metadonnees")
    .eq("id", chantier_id)
    .single();
  if (!chantier) return new Response(JSON.stringify({ error: "chantier not found" }), { status: 404, headers: CORS });

  const userId = chantier.user_id;

  // ── CHECK 1: Budget overrun per lot ──────────────────────────
  const { data: lotBudgets } = await supabase.rpc("agent_check_budget_overrun", { p_chantier_id: chantier_id });
  // RPC returns: [{lot_id, lot_nom, budget_prevu, total_factures, depassement}]
  // We'll create this RPC in the migration — it's a single SQL query

  // Fallback: direct query if RPC not available
  const { data: lots } = await supabase
    .from("lots_chantier")
    .select("id, nom, budget_avg_ht")
    .eq("chantier_id", chantier_id);

  const { data: docs } = await supabase
    .from("documents_chantier")
    .select("lot_id, montant, document_type, facture_statut")
    .eq("chantier_id", chantier_id)
    .in("document_type", ["facture", "devis"]);

  if (lots && docs) {
    for (const lot of lots) {
      if (!lot.budget_avg_ht || lot.budget_avg_ht <= 0) continue;

      const factures = docs.filter(d => d.lot_id === lot.id && d.document_type === "facture");
      const totalFactures = factures.reduce((sum, d) => sum + (d.montant ?? 0), 0);

      if (totalFactures > lot.budget_avg_ht) {
        const depassement = totalFactures - lot.budget_avg_ht;
        const pct = Math.round((depassement / lot.budget_avg_ht) * 100);
        insights.push({
          chantier_id,
          user_id: userId,
          type: "budget_alert",
          severity: pct > 20 ? "critical" : "warning",
          title: `Dépassement budget ${lot.nom} : +${pct}%`,
          body: `Le lot "${lot.nom}" a reçu ${totalFactures.toFixed(0)}€ de factures pour un budget prévu de ${lot.budget_avg_ht.toFixed(0)}€. Dépassement : ${depassement.toFixed(0)}€.`,
          source_event: { check: "budget_overrun", lot_id: lot.id },
        });
      }
    }
  }

  // ── CHECK 2: Overdue payments ────────────────────────────────
  const { data: overduePayments } = await supabase
    .from("payment_events")
    .select("id, label, amount, due_date, source_type")
    .eq("project_id", chantier_id)
    .eq("status", "pending")
    .lt("due_date", new Date().toISOString().split("T")[0]);

  if (overduePayments && overduePayments.length > 0) {
    for (const pe of overduePayments) {
      const daysLate = Math.floor((Date.now() - new Date(pe.due_date).getTime()) / 86400000);
      insights.push({
        chantier_id,
        user_id: userId,
        type: "payment_overdue",
        severity: daysLate > 14 ? "critical" : "warning",
        title: `Paiement en retard : ${pe.label} (${daysLate}j)`,
        body: `${pe.label} — ${pe.amount?.toFixed(0)}€ — échéance ${pe.due_date}, en retard de ${daysLate} jours.`,
        source_event: { check: "payment_overdue", payment_event_id: pe.id },
      });
    }
  }

  // ── CHECK 3: Lots without signed devis approaching start ─────
  if (lots) {
    for (const lot of lots) {
      const lotDocs = docs?.filter(d => d.lot_id === lot.id && d.document_type === "devis" && d.devis_statut === "valide") ?? [];
      // Check if lot has date_debut in next 14 days
      const { data: lotDetail } = await supabase
        .from("lots_chantier")
        .select("date_debut, statut")
        .eq("id", lot.id)
        .single();

      if (lotDetail?.date_debut && lotDetail.statut === "a_faire" && lotDocs.length === 0) {
        const daysUntil = Math.floor((new Date(lotDetail.date_debut).getTime() - Date.now()) / 86400000);
        if (daysUntil <= 14 && daysUntil >= 0) {
          insights.push({
            chantier_id,
            user_id: userId,
            type: "risk_detected",
            severity: daysUntil <= 7 ? "critical" : "warning",
            title: `${lot.nom} : pas de devis signé, début dans ${daysUntil}j`,
            body: `Le lot "${lot.nom}" doit démarrer le ${lotDetail.date_debut} mais aucun devis n'est signé.`,
            source_event: { check: "no_signed_devis", lot_id: lot.id },
          });
        }
      }
    }
  }

  // ── CHECK 4: Factures en litige ────────────────────────────────
  if (docs) {
    const litiges = docs.filter(d => d.document_type === "facture" && d.facture_statut === "en_litige");
    for (const doc of litiges) {
      const lot = lots?.find(l => l.id === doc.lot_id);
      insights.push({
        chantier_id, user_id: userId,
        type: "budget_alert", severity: "critical",
        title: `Facture en litige${lot ? ` — ${lot.nom}` : ""}`,
        body: `Une facture de ${doc.montant?.toFixed(0) ?? "?"}€ est en litige.`,
        source_event: { check: "facture_litige", document_id: doc.id },
      });
    }
  }

  // ── CHECK 5: Budget global dépassé (devis > budget IA × 1.08) ─
  const budgetIA = chantier?.metadonnees?.budgetTotal;
  if (budgetIA && budgetIA > 0 && docs) {
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
  if (docs) {
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
  }

  // ── CHECK 7: Paiements sans preuve (payé mais pas de justificatif) ─
  if (docs) {
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
  }

  // ── INSERT all insights (deduplicate by title within 24h) ────
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  let inserted = 0;

  for (const ins of insights) {
    // Check if same insight already exists today
    const { data: existing } = await supabase
      .from("agent_insights")
      .select("id")
      .eq("chantier_id", chantier_id)
      .eq("title", ins.title)
      .gte("created_at", yesterday)
      .limit(1);

    if (!existing || existing.length === 0) {
      await supabase.from("agent_insights").insert(ins);
      inserted++;
    }
  }

  console.log(`[agent-checks] ${chantier_id}: ${insights.length} checks, ${inserted} new insights`);

  return new Response(
    JSON.stringify({ checks: insights.length, inserted }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
```

### Step 2: Wire document routes to trigger checks

Add fire-and-forget call to `agent-checks` in:
- `api/chantier/[id]/documents/register.ts` (after insert)
- `api/chantier/[id]/documents/depense-rapide.ts` (after insert)
- `api/chantier/[id]/documents/extract-invoice.ts` (after extraction)

```typescript
// Fire-and-forget deterministic checks
fetch(`${import.meta.env.PUBLIC_SUPABASE_URL}/functions/v1/agent-checks`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${import.meta.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ chantier_id: params.id }),
}).catch(() => {});
```

### Step 3: Commit

```bash
git add supabase/functions/agent-checks/ src/pages/api/chantier/[id]/documents/
git commit -m "feat: agent-checks deterministic budget/payment/risk checks ($0 cost)"
```

---

## Task 4: Edge function — `agent-orchestrator` (LLM, real-time + cache + digest soir)

**This is Layer 2** — cron 8h + 19h. Reads accumulated messages, builds rich context, calls Gemini 2.5 Flash with function calling, updates planning, generates digest.

**Files:**
- Create: `supabase/functions/agent-orchestrator/index.ts`
- Create: `supabase/functions/agent-orchestrator/context.ts`
- Create: `supabase/functions/agent-orchestrator/prompt.ts`
- Create: `supabase/functions/agent-orchestrator/tools.ts`
- Create: `supabase/functions/agent-orchestrator/types.ts`

### Step 1: Context builder (`context.ts`)

**This is the critical file.** Builds a complete, rich context by calling the EXISTING API routes that Johan built. Why API routes instead of direct SQL?
- `GET /budget` already computes totaux, conseils, lot breakdown — no duplication
- `GET /planning` already handles cascade logic
- `GET /payment-events` already enriches with artisan names + proof docs
- Auth via `X-Agent-Key` reuses existing logic

The context combines 5 API calls (parallel) + 2 direct Supabase queries (messages + insights).

```typescript
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Rich context built from EXISTING API routes.
 * Budget: uses GET /budget (Johan's work — totaux, conseils, lot breakdown)
 * Planning: uses GET /planning (lots with dates + cascade)
 * Payments: uses GET /payment-events (overdue detection)
 * Contacts: direct Supabase query (phone→lot mapping for messages)
 * Messages: direct Supabase query (since last agent run)
 */
export interface ChantierContext {
  chantier: {
    id: string; nom: string; emoji: string; phase: string;
    budget_ia: number; date_debut: string | null; type_projet: string;
  };
  lots: Array<{
    id: string; nom: string; statut: string;
    duree_jours: number | null; date_debut: string | null; date_fin: string | null;
    ordre_planning: number | null;
    // Budget data from GET /budget (pre-computed by Johan)
    budget_avg_ht: number | null;
    devis_recus: number; devis_valides: number;
    facture_total: number; paye: number; a_payer: number;
    nb_devis: number;  // for "pas assez de devis" alert
    // Contact mapping
    contact_nom: string | null; contact_phone: string | null; contact_metier: string | null;
  }>;
  messages_since_last_run: Array<{
    source: 'whatsapp' | 'email';
    from_name: string; from_phone: string;
    body: string; timestamp: string;
    matched_lot: string | null;  // pre-matched via phone→contact→lot
  }>;
  // Pre-computed from GET /budget — conseils[] already generated by Johan's buildConseils()
  budget_conseils: Array<{ type: string; urgency: string; titre: string; detail: string }>;
  // Pre-computed from GET /payment-events — overdue items
  overdue_payments: Array<{ label: string; amount: number; due_date: string; days_late: number; lot_nom: string }>;
  // Risk alerts computed here (message silence, no devis, approaching deadlines)
  risk_alerts: Array<{ lot_nom: string; risk: string; details: string }>;
  recent_insights: Array<{ type: string; title: string; created_at: string }>;
  // For digest: complete insights with actions taken by the AI
  todays_insights_with_actions: Array<{
    type: string; severity: string; title: string; body: string;
    actions_taken: Array<{ tool: string; summary: string }>;  // e.g. [{tool: "update_planning", summary: "Lot Plomberie décalé 14→21 avril"}]
    source_event: Record<string, unknown>;
    created_at: string;
  }>;
  // Tasks (todo_chantier) for the digest
  taches: Array<{
    titre: string; priorite: string; done: boolean;
    created_today: boolean;  // true if created since midnight
  }>;
}

export async function buildContext(
  supabase: SupabaseClient,
  chantierId: string,
  lastRunAt: string | null,
  agentKey: string,
  apiBase: string,
): Promise<ChantierContext> {
  const since = lastRunAt ?? new Date(Date.now() - 86400000).toISOString();
  const headers = { "X-Agent-Key": agentKey };

  // ── Parallel: 5 API calls (reuse Johan's logic) + 2 direct Supabase ──
  const [budgetRes, planningRes, contactsRes, paymentEventsRes, chantierRes, waMessagesRes, insightsRes] =
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
        .select("id, nom, emoji, phase, type_projet, date_debut_chantier, metadonnees")
        .eq("id", chantierId).single(),

      // Direct Supabase: WhatsApp messages since last run
      supabase.from("chantier_whatsapp_messages")
        .select("from_number, body, type, timestamp")
        .eq("chantier_id", chantierId)
        .gte("timestamp", since)
        .order("timestamp", { ascending: true })
        .limit(50),

      // Direct Supabase: recent insights
      supabase.from("agent_insights")
        .select("type, title, created_at")
        .eq("chantier_id", chantierId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  const chantier = chantierRes.data;
  const contacts = Array.isArray(contactsRes) ? contactsRes : (contactsRes?.data ?? []);
  const waMessages = waMessagesRes.data ?? [];

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
      // Financial data from Johan's budget API
      devis_recus: totaux.devis_recus ?? 0,
      devis_valides: totaux.devis_valides ?? 0,
      facture_total: totaux.facture ?? 0,
      paye: totaux.paye ?? 0,
      a_payer: totaux.a_payer ?? 0,
      nb_devis: nbDevis,
      // Contact mapping
      contact_nom: lotContact?.nom ?? null,
      contact_phone: lotContact?.phone ?? null,
      contact_metier: lotContact?.metier ?? null,
    };
  });

  // ── Map messages → contact → lot (pre-match for LLM) ─────────
  const mappedMessages = waMessages.map((m: any) => {
    const phone = String(m.from_number).replace(/^\+/, "");
    const contact = phoneToContact.get(phone);
    const lotName = contact?.lot_id
      ? enrichedLots.find((l: any) => l.id === contact.lot_id)?.nom ?? null
      : null;
    return {
      source: "whatsapp" as const,
      from_name: contact?.nom ?? phone,
      from_phone: phone,
      body: m.body ?? "",
      timestamp: m.timestamp,
      matched_lot: lotName,
      is_known_contact: !!contact,
      contact_role: contact?.role ?? null,  // "architecte", "maitre_oeuvre", "artisan", etc.
    };
  });

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

  for (const lot of enrichedLots) {
    // No signed devis approaching start
    if (lot.date_debut && lot.statut === "a_faire" && lot.nb_devis === 0) {
      const daysUntil = Math.floor((new Date(lot.date_debut).getTime() - now) / 86400000);
      if (daysUntil >= 0 && daysUntil <= 14) {
        riskAlerts.push({ lot_nom: lot.nom, risk: "no_devis", details: `Début dans ${daysUntil}j, aucun devis` });
      }
    }

    // Only 1 devis (Johan's AlertesIA logic)
    if (lot.nb_devis === 1 && lot.statut === "a_faire") {
      riskAlerts.push({ lot_nom: lot.nom, risk: "single_devis", details: `1 seul devis — idéalement 2-3 pour comparer` });
    }

    // Silent contact (5+ days without message)
    if (lot.contact_phone) {
      const norm = lot.contact_phone.replace(/^\+/, "").replace(/^0/, "33");
      // Check ALL messages, not just since last run
      const { data: lastMsgArr } = await supabase
        .from("chantier_whatsapp_messages")
        .select("timestamp")
        .eq("chantier_id", chantierId)
        .eq("from_number", norm)
        .order("timestamp", { ascending: false })
        .limit(1);

      const lastMsg = lastMsgArr?.[0];
      if (!lastMsg) {
        riskAlerts.push({ lot_nom: lot.nom, risk: "no_messages", details: `Aucun message de ${lot.contact_nom}` });
      } else {
        const daysSince = Math.floor((now - new Date(lastMsg.timestamp).getTime()) / 86400000);
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
    },
    lots: enrichedLots,
    messages_since_last_run: mappedMessages,
    // Directly from Johan's buildConseils() — no recalculation needed!
    budget_conseils: budgetRes?.conseils ?? [],
    overdue_payments: overduePayments,
    risk_alerts: riskAlerts,
    recent_insights: insightsRes.data ?? [],

    // Full insights with actions for digest context
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

    // Tasks for digest
    taches: await (async () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("todo_chantier")
        .select("titre, priorite, done, created_at")
        .eq("chantier_id", chantierId)
        .order("ordre", { ascending: true });
      return (data ?? []).map(t => ({
        ...t,
        created_today: new Date(t.created_at) >= todayStart,
      }));
    })(),
  };
}
```

### Step 2: System prompt (`prompt.ts`)

```typescript
import { ChantierContext } from "./types.ts";

export function buildSystemPrompt(ctx: ChantierContext, runType: "morning" | "evening"): string {
  const header = runType === "morning"
    ? "C'est l'analyse du MATIN. Concentre-toi sur les messages reçus et leurs impacts planning."
    : "C'est le DIGEST DU SOIR. Résume la journée et prépare les actions de demain.";

  return `Tu es l'agent "Pilote de Chantier" pour ${ctx.chantier.emoji} ${ctx.chantier.nom}.
${header}

RÈGLES :

IDENTIFICATION DU LOT — 3 cas possibles :
A) Le message vient d'un contact AVEC un lot assigné (indiqué par "→ lot X" dans les messages).
   → Tu peux agir directement sur ce lot (update_planning, update_lot_status).
B) Le message vient d'un contact SANS lot (architecte, maître d'œuvre, client, conjoint...).
   Le rôle du contact est indiqué entre crochets dans les messages : [architecte], [maitre_oeuvre], etc.
   → ARCHITECTE ou MAÎTRE D'ŒUVRE : a autorité sur le chantier entier. S'il dit "on repousse", c'est fiable → modifie dateDebutChantier ou les lots concernés. S'il mentionne un lot spécifique → agis sur ce lot.
   → AUTRE RÔLE (client, conjoint, voisin...) : log un insight "info", pas d'action planning directe.
   → S'il est général (conversation courante, banalités), log un insight "info" sans action.
C) Le message vient d'un numéro INCONNU (pas dans les contacts).
   → Appelle request_clarification. NE modifie RIEN.

ACTIONS :
1. Impact planning détecté (cas A ou B) → appelle update_planning.
2. Lot démarré ou terminé → appelle update_lot_status.
3. Action à faire identifiée → appelle create_task.
4. Numéro inconnu (cas C) → appelle request_clarification.
5. TOUJOURS appeler log_insight en dernier pour résumer ton analyse.

PLANNING ACTUEL :
${ctx.lots.map(l =>
  `- ${l.nom} | ${l.statut} | ${l.date_debut ?? '?'} → ${l.date_fin ?? '?'} | ${l.duree_jours ?? '?'}j | contact: ${l.contact_nom ?? 'aucun'} (${l.contact_phone ?? ''})
    Budget: ${l.budget_avg_ht ?? '?'}€ | Devis: ${l.devis_recus}€ (${l.nb_devis} devis) | Facturé: ${l.facture_total}€ | Payé: ${l.paye}€ | Reste: ${l.a_payer}€`
).join('\n')}

MESSAGES DEPUIS LE DERNIER RUN (${ctx.messages_since_last_run.length}) :
${ctx.messages_since_last_run.length > 0
  ? ctx.messages_since_last_run.map(m =>
      `[${m.timestamp}] ${m.from_name}${m.contact_role ? ` [${m.contact_role}]` : ''} (${m.from_phone}${m.matched_lot ? ` → lot "${m.matched_lot}"` : m.is_known_contact ? ' → pas de lot assigné' : ' → NUMÉRO INCONNU'}) : "${m.body}"`
    ).join('\n')
  : 'Aucun nouveau message'}

ALERTES BUDGET (pré-calculées par le système) :
${ctx.budget_conseils.length > 0
  ? ctx.budget_conseils.map(c => `[${c.urgency}] ${c.titre} — ${c.detail}`).join('\n')
  : '✅ Budget OK'}

PAIEMENTS EN RETARD :
${ctx.overdue_payments.length > 0
  ? ctx.overdue_payments.map(p => `🔴 ${p.label} (${p.lot_nom}) : ${p.amount}€ — en retard de ${p.days_late}j (échéance: ${p.due_date})`).join('\n')
  : '✅ Aucun retard'}

RISQUES DÉTECTÉS :
${ctx.risk_alerts.length > 0
  ? ctx.risk_alerts.map(r => `⚠️ ${r.lot_nom} : ${r.details}`).join('\n')
  : '✅ Aucun risque'}

${runType === "evening" ? `
ACTIONS DE L'IA AUJOURD'HUI :
${ctx.todays_insights_with_actions.length > 0
  ? ctx.todays_insights_with_actions.map(i => {
      const actions = (i.actions_taken ?? []).map((a: any) => `  🤖 ${a.summary || a.tool}`).join('\n');
      return `[${i.created_at}] ${i.title}${actions ? '\n' + actions : ''}`;
    }).join('\n')
  : 'Aucune action IA aujourd\'hui'}

TÂCHES (checklist) :
${(() => {
  const pending = ctx.taches.filter(t => !t.done);
  const doneToday = ctx.taches.filter(t => t.done && t.created_today);
  const lines: string[] = [];
  if (pending.length > 0) {
    lines.push(...pending.map(t => \`- [\${t.priorite}] \${t.titre}\${t.created_today ? ' ← CRÉÉE PAR L\\'IA' : ''}\`));
  }
  if (doneToday.length > 0) {
    lines.push(...doneToday.map(t => \`- ✅ \${t.titre} (complétée aujourd'hui)\`));
  }
  return lines.length > 0 ? lines.join('\\n') : 'Aucune tâche active';
})()}
` : ''}`;
}
```

### Step 3: Tools schema (`tools.ts`)

6 tools, all call API routes via `X-Agent-Key`. Key change vs previous version: `log_insight` now includes `actions_summary` — a human-readable list of what the AI did, used in the evening digest/journal.

```typescript
// log_insight tool — the actions_summary field is critical for the journal
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
}
```

The `actions_summary` is stored in `agent_insights.actions_taken` and read by the digest cron to generate the journal. Other tools unchanged: `update_planning`, `update_lot_status`, `create_task`, `complete_task`, `request_clarification`.

### Step 4: Main orchestrator (`index.ts`)

Key difference from v1: this is a **cron handler**, not a webhook handler. It iterates over all active chantiers.

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildContext } from "./context.ts";
import { buildSystemPrompt } from "./prompt.ts";
import { TOOLS_SCHEMA, executeTool } from "./tools.ts";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const geminiKey = Deno.env.get("GOOGLE_API_KEY") ?? "";
const whapiToken = Deno.env.get("WHAPI_TOKEN") ?? "";
const sendgridKey = Deno.env.get("SENDGRID_API_KEY") ?? "";
const MAX_TOOL_ROUNDS = 3;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  const body = await req.json().catch(() => ({}));
  const runType: "morning" | "evening" = body.run_type ?? "evening";
  // Can also be called for a single chantier (from OpenClaw trigger)
  const singleChantierId: string | null = body.chantier_id ?? null;

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Find active chantiers (with messages or documents in last 24h)
  let chantierIds: string[];

  if (singleChantierId) {
    chantierIds = [singleChantierId];
  } else {
    // Chantiers with WhatsApp activity in last 24h
    const since = new Date(Date.now() - 86400000).toISOString();
    const { data: activeChantiers } = await supabase
      .from("chantier_whatsapp_messages")
      .select("chantier_id")
      .gte("timestamp", since);

    chantierIds = [...new Set((activeChantiers ?? []).map(c => c.chantier_id))];
  }

  if (chantierIds.length === 0) {
    return new Response(JSON.stringify({ processed: 0, reason: "no_active_chantiers" }), { status: 200 });
  }

  let processed = 0;

  for (const chantierId of chantierIds) {
    try {
      // Get last run time
      const { data: lastRun } = await supabase
        .from("agent_runs")
        .select("created_at")
        .eq("chantier_id", chantierId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      // Build rich context
      const ctx = await buildContext(supabase, chantierId, lastRun?.created_at ?? null);

      // Skip if no messages and no alerts
      if (ctx.messages_since_last_run.length === 0 && ctx.budget_alerts.length === 0 && ctx.risk_alerts.length === 0) {
        continue;
      }

      // Call Gemini with function calling
      const messages: Array<Record<string, unknown>> = [
        { role: "system", content: buildSystemPrompt(ctx, runType) },
        { role: "user", content: runType === "morning"
          ? "Analyse les messages reçus et détecte les impacts sur le planning et le budget."
          : "Génère le digest de la journée. Résume les événements, les alertes, et les prochaines actions." },
      ];

      let rounds = 0;
      let totalActions: Array<Record<string, unknown>> = [];

      while (rounds < MAX_TOOL_ROUNDS) {
        rounds++;
        const res = await fetch(GEMINI_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${geminiKey}` },
          body: JSON.stringify({ model: "gemini-2.5-flash", messages, tools: TOOLS_SCHEMA, max_tokens: 4096 }),
        });

        const data = await res.json();
        const choice = data.choices?.[0]?.message;
        if (!choice?.tool_calls || choice.tool_calls.length === 0) break;

        messages.push({ role: "assistant", content: choice.content, tool_calls: choice.tool_calls });

        for (const tc of choice.tool_calls) {
          const args = JSON.parse(tc.function.arguments);
          const result = await executeTool(chantierId, tc.function.name, args, { run_type: runType });
          totalActions.push({ tool: tc.function.name, args, result });
          messages.push({ role: "tool", tool_call_id: tc.id, content: result });
        }
      }

      // If evening run, send digest to user
      if (runType === "evening") {
        const digestContent = messages[messages.length - 1]?.content as string ?? "";
        if (digestContent && digestContent.length > 20) {
          await sendDigest(supabase, chantierId, ctx.chantier.user_id ?? "", ctx.chantier.nom, ctx.chantier.emoji, digestContent);
        }
      }

      // Log the run
      await supabase.from("agent_runs").insert({
        chantier_id: chantierId,
        run_type: runType,
        messages_analyzed: ctx.messages_since_last_run.length,
        insights_created: totalActions.filter(a => a.tool === "log_insight").length,
        actions_taken: totalActions,
      });

      processed++;
    } catch (err) {
      console.error(`[agent] Error processing ${chantierId}:`, err instanceof Error ? err.message : err);
    }
  }

  return new Response(JSON.stringify({ processed, run_type: runType }), { status: 200 });
});

// ── Digest delivery (WhatsApp + Email + in-app) ──────────────────

async function sendDigest(supabase: any, chantierId: string, userId: string, nom: string, emoji: string, text: string) {
  const { data: { user } } = await supabase.auth.admin.getUserById(userId);
  const phone = user?.phone ?? user?.user_metadata?.phone;
  const email = user?.email;

  const label = `${emoji} ${nom}`.trim();

  // WhatsApp
  if (whapiToken && phone) {
    const chatId = phone.replace(/^\+/, "") + "@s.whatsapp.net";
    await fetch("https://gate.whapi.cloud/messages/text", {
      method: "POST",
      headers: { Authorization: `Bearer ${whapiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: chatId, body: `📋 Digest — ${label}\n\n${text}` }),
    }).catch(() => {});
  }

  // Email
  if (sendgridKey && email) {
    await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${sendgridKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: "noreply@verifiermondevis.fr", name: "GérerMonChantier" },
        subject: `Digest chantier — ${label}`,
        content: [{ type: "text/plain", value: text }],
      }),
    }).catch(() => {});
  }

  // In-app: write to chantier_journal (book-like, 1 page per day)
  const today = new Date().toISOString().split("T")[0];
  await supabase.from("chantier_journal").upsert({
    chantier_id: chantierId,
    user_id: userId,
    journal_date: today,
    body: text,
    alerts_count: insightsCount,
    max_severity: maxSeverity,
    updated_at: new Date().toISOString(),
  }, { onConflict: "chantier_id,journal_date" });
}
```

### Step 5: Crons

```sql
-- Morning analysis (8h UTC = 10h Paris été)
SELECT cron.schedule('agent-morning', '0 8 * * *', $$
  SELECT net.http_post(
    url := 'https://vhrhgsqxwvouswjaiczn.supabase.co/functions/v1/agent-orchestrator',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'), 'Content-Type', 'application/json'),
    body := '{"run_type": "morning"}'::jsonb
  )
$$);

-- Evening digest (17h UTC = 19h Paris été)
SELECT cron.schedule('agent-evening', '0 17 * * *', $$
  SELECT net.http_post(
    url := 'https://vhrhgsqxwvouswjaiczn.supabase.co/functions/v1/agent-orchestrator',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'), 'Content-Type', 'application/json'),
    body := '{"run_type": "evening"}'::jsonb
  )
$$);
```

### Step 6: Commit

```bash
git add supabase/functions/agent-orchestrator/
git commit -m "feat: agent-orchestrator with rich context, 2x/day cron, function calling"
```

---

## Task 5: Dual-mode routing — triggerAgent for OpenClaw

**Files:**
- Modify: `src/lib/apiHelpers.ts`

### Step 1: Add triggerAgent (OpenClaw mode only)

Since the default mode is cron-based (no real-time trigger), `triggerAgent` is only used for OpenClaw users who want real-time processing. Edge function users get their analysis at 8h and 19h.

```typescript
/**
 * Trigger agent for OpenClaw users ONLY (real-time).
 * Edge function users are handled by cron — no per-event trigger.
 * Called fire-and-forget from webhooks.
 */
export async function triggerAgentIfOpenClaw(event: {
  event_type: string;
  chantier_id: string;
  user_id: string;
  payload: Record<string, unknown>;
}) {
  try {
    const supabase = createServiceClient();
    const { data: config } = await supabase
      .from('agent_config')
      .select('agent_mode, openclaw_url, openclaw_token, openclaw_agent_id')
      .eq('user_id', event.user_id)
      .single();

    // Only trigger for OpenClaw users
    if (config?.agent_mode !== 'openclaw' || !config.openclaw_url || !config.openclaw_token) return;

    const url = config.openclaw_url.replace(/\/$/, '');
    const message = formatEventForOpenClaw(event);

    fetch(`${url}/hooks/agent`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.openclaw_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        name: 'GererMonChantier',
        agentId: config.openclaw_agent_id ?? undefined,
        sessionKey: `hook:chantier:${event.chantier_id}`,
        wakeMode: 'now',
        deliver: false,
      }),
    }).catch(() => {});
  } catch { /* silent fail */ }
}

function formatEventForOpenClaw(event: Record<string, unknown>): string {
  const p = event.payload as Record<string, string>;
  switch (event.event_type) {
    case 'whatsapp_message':
      return `[GererMonChantier] Message WhatsApp chantier ${event.chantier_id}\nDe: ${p.from}\nMessage: ${p.body}\n\nUtilise tes skills chantier-* pour analyser et agir.`;
    case 'inbound_email':
      return `[GererMonChantier] Email reçu chantier ${event.chantier_id}\nDe: ${p.from}\nSujet: ${p.subject}\nContenu: ${p.body}\n\nUtilise tes skills chantier-*.`;
    case 'document_uploaded':
      return `[GererMonChantier] Document uploadé chantier ${event.chantier_id}\nNom: ${p.nom}\nType: ${p.document_type}\n\nUtilise tes skills chantier-*.`;
    default:
      return `[GererMonChantier] Event ${event.event_type} chantier ${event.chantier_id}\n${JSON.stringify(p)}`;
  }
}
```

### Step 2: Wire in webhooks (OpenClaw users only)

In `whapi.ts` and `inbound-email.ts`, add after DB storage:

```typescript
// Real-time trigger for OpenClaw users only (edge_function users get cron)
const { triggerAgentIfOpenClaw } = await import('@/lib/apiHelpers');
triggerAgentIfOpenClaw({
  event_type: 'whatsapp_message',
  chantier_id: group.chantier_id,
  user_id: chantierOwner.user_id,
  payload: { from: String(msg.from ?? ''), body: body ?? '', type: msg.type, timestamp },
});
```

### Step 3: Commit

```bash
git add src/lib/apiHelpers.ts src/pages/api/webhooks/whapi.ts src/pages/api/webhooks/inbound-email.ts
git commit -m "feat: dual-mode routing — OpenClaw real-time, edge_function via cron"
```

---

## Task 6: OpenClaw skills + setup guide

**Files:**
- Create: `docs/openclaw-setup.md`
- Create: `docs/openclaw-skills/chantier-context/SKILL.md`
- Create: `docs/openclaw-skills/chantier-update-planning/SKILL.md`
- Create: `docs/openclaw-skills/chantier-tasks/SKILL.md`
- Create: `docs/openclaw-skills/chantier-insights/SKILL.md`
- Create: `docs/openclaw-skills/chantier-lot-status/SKILL.md`

Each SKILL.md contains:
- Description for OpenClaw skill matching
- curl commands with `$GERERMONCHANTIER_API_KEY` and `$GERERMONCHANTIER_BASE_URL`
- Rules (when to use, when NOT to use)

**What OpenClaw gives you over the edge function (documented in guide):**

| Avantage | Edge function (gratuit) | OpenClaw (tes tokens) |
|----------|------------------------|----------------------|
| Réactivité | 2x/jour (batch 8h+19h) | **Temps réel** (chaque message) |
| Contexte | Snapshot figé au moment du run | **Contexte vivant** qui s'enrichit message après message |
| Multi-tour | Impossible | **Attend une réponse** artisan, relance si pas de retour |
| Proactif | Non (V1) | **Oui** : envoie des messages WhatsApp de sa propre initiative |
| Mémoire | Aucune entre les runs | **Mémoire de session** + MEMORY.md long terme |

**OpenClaw context strategy (documented in guide):**
1. Au réveil (1er heartbeat) : appelle GET /budget + /planning + /contacts + /payment-events → hydrate le contexte complet
2. Stocke en mémoire de session (pas de re-query)
3. Chaque webhook /hooks/agent → ajoute le message au contexte vivant
4. Re-hydratation sélective : si un tool call modifie le planning → re-fetch /planning uniquement
5. Heartbeat périodique (toutes les 1h) : check si nouveaux docs uploadés → re-sync budget

**Coût estimé OpenClaw** : ~$0.48/mois (20 msgs/jour × Haiku $0.80/1M tokens)

**`openclaw-setup.md`** covers:
1. Get your `AGENT_SERVICE_KEY` from settings
2. Set env vars in OpenClaw
3. Copy skills to workspace
4. Enable hooks in openclaw.json
5. Switch mode to `openclaw` via API or dashboard
6. Configure HEARTBEAT.md for periodic re-sync
7. Test with a WhatsApp message
8. Customize SOUL.md for your chantier style

### Step 1: Commit

```bash
git add docs/openclaw-setup.md docs/openclaw-skills/
git commit -m "feat: OpenClaw skills and setup guide"
```

---

## Task 7: Deploy + env vars + test

### Step 1: Set environment variables

Supabase edge function secrets:
- `AGENT_SERVICE_KEY` — random 64-char hex (same in Vercel)
- `GOOGLE_API_KEY` — already set
- `WHAPI_TOKEN` — for digest WhatsApp
- `SENDGRID_API_KEY` — for digest email

Vercel:
- `AGENT_SERVICE_KEY` — same value

### Step 2: Deploy

```bash
npx supabase functions deploy agent-checks --no-verify-jwt
npx supabase functions deploy agent-orchestrator --no-verify-jwt
```

### Step 3: Test deterministic checks

Upload a facture with montant > budget du lot. Check `agent_insights` for a `budget_alert`.

### Step 4: Test LLM orchestrator

```bash
curl -X POST https://vhrhgsqxwvouswjaiczn.supabase.co/functions/v1/agent-orchestrator \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"run_type": "morning", "chantier_id": "<UUID>"}'
```

### Step 5: Commit

```bash
git commit -m "feat: agent orchestration V1 complete"
```

---

## Task 8: Contact roles + virtual lots (architecte, maître d'oeuvre)

**Problem:** Currently, the "Métier / Rôle" field on contacts is free text. The agent needs to know if someone is an architect (authority over whole project) vs. an artisan (authority over their lot). Also, when adding an architect, there's no lot to attach them to.

**Files:**
- Modify: `src/components/chantier/cockpit/ContactsSection.tsx` — replace free text role with select + auto-create lot
- Modify: `src/pages/api/chantier/[id]/contacts.ts` — handle virtual lot creation on POST
- Create: `supabase/migrations/20260405130000_contact_roles.sql` — add predefined roles

### Step 1: Migration — predefined contact categories

```sql
-- Add contact_category column with predefined values
-- Keep the existing 'role' column as free-text métier (plombier, électricien...)
-- New 'contact_category' column = the agent-relevant classification
ALTER TABLE contacts_chantier
  ADD COLUMN IF NOT EXISTS contact_category TEXT
  DEFAULT 'artisan'
  CHECK (contact_category IN ('artisan', 'architecte', 'maitre_oeuvre', 'bureau_etudes', 'client', 'autre'));

-- Backfill: detect existing roles that match categories
UPDATE contacts_chantier SET contact_category = 'architecte'
  WHERE role ILIKE '%architecte%' AND contact_category = 'artisan';
UPDATE contacts_chantier SET contact_category = 'maitre_oeuvre'
  WHERE (role ILIKE '%maitre%' OR role ILIKE '%maître%') AND contact_category = 'artisan';
```

### Step 2: Frontend — ContactsSection.tsx

Replace the free text "Métier / Rôle" input with two fields:

```tsx
{/* Catégorie (for the agent) */}
<div>
  <label className="block text-xs font-medium text-gray-500 mb-1">Catégorie</label>
  <select
    value={category} onChange={e => {
      setCategory(e.target.value);
      // Auto-suggest role based on category
      if (e.target.value === 'architecte' && !role) setRole('Architecte');
      if (e.target.value === 'maitre_oeuvre' && !role) setRole("Maître d'œuvre");
    }}
    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
  >
    <option value="artisan">🔧 Artisan / Entreprise</option>
    <option value="architecte">📐 Architecte</option>
    <option value="maitre_oeuvre">🏗️ Maître d'œuvre</option>
    <option value="bureau_etudes">📊 Bureau d'études</option>
    <option value="client">👤 Client / Particulier</option>
    <option value="autre">📋 Autre</option>
  </select>
</div>

{/* Métier libre (for display) */}
<div>
  <label className="block text-xs font-medium text-gray-500 mb-1">Métier / Spécialité</label>
  <input
    type="text" value={role} onChange={e => setRole(e.target.value)}
    placeholder={category === 'artisan' ? 'Ex: Électricien, Plombier...' : 'Ex: DPLG, OPC...'}
  />
</div>
```

### Step 3: Auto-create virtual lot

When category is `architecte`, `maitre_oeuvre`, or `bureau_etudes` AND no lot is selected, auto-create a lot with that name:

```tsx
// In the save handler, before POST /contacts:
if (['architecte', 'maitre_oeuvre', 'bureau_etudes'].includes(category) && !lotId) {
  // Check if a lot with this name already exists
  const existingLot = lots.find(l =>
    l.nom.toLowerCase().includes(category === 'maitre_oeuvre' ? "maître d'œuvre" : category)
  );

  if (existingLot) {
    lotId = existingLot.id;
  } else {
    // Create a virtual lot
    const lotNames: Record<string, string> = {
      architecte: '📐 Architecte',
      maitre_oeuvre: "🏗️ Maître d'œuvre",
      bureau_etudes: '📊 Bureau d\'études',
    };
    const res = await fetch(`/api/chantier/${chantierId}/lots`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nom: lotNames[category],
        emoji: category === 'architecte' ? '📐' : category === 'maitre_oeuvre' ? '🏗️' : '📊',
        // Budget 0 — virtual lot, not a work package
        budget_min_ht: 0, budget_avg_ht: 0, budget_max_ht: 0,
      }),
    });
    const newLot = await res.json();
    lotId = newLot.id;
    // Refresh lots list
    onRefresh?.();
  }
}
```

### Step 4: Update agent context

The `contact_category` field is now available in the context builder. Update the prompt to use it instead of the free-text `role`:

In `context.ts`, the phoneToContact map already includes `role`. Now also include `contact_category`:

```typescript
phoneToContact.set(norm, {
  nom: c.nom, lot_id: c.lot_id,
  metier: c.metier ?? "", role: c.role ?? "",
  category: c.contact_category ?? "artisan",
});
```

In the prompt, show `[architecte]` from `contact_category`, not from `role`:

```
[10:23] Marc Leroy [architecte] (0698765432 → lot "📐 Architecte") : "on repousse d'une semaine"
```

### Step 5: Commit

```bash
git add supabase/migrations/20260405130000_contact_roles.sql src/components/chantier/cockpit/ContactsSection.tsx src/pages/api/chantier/[id]/contacts.ts
git commit -m "feat: predefined contact categories (architecte, MOE) with auto-create virtual lot"
```

---

## Task 9: Pipeline "LOT INCONNU" — clarification workflow

**Problem:** A WhatsApp message comes from a number not in `contacts_chantier`, or from a contact without `lot_id`. The agent can't act on planning without knowing the lot. This is the most common case for new chantiers.

**Files:**
- Create: `src/pages/api/chantier/[id]/agent-retry.ts` — re-trigger agent on a specific message
- Modify: `supabase/functions/agent-orchestrator/tools.ts` — add `request_clarification` tool
- Create: `src/components/chantier/cockpit/ClarificationCard.tsx` — actionable card in dashboard

### Flow

```
Message from unknown number
  → Agent calls request_clarification tool (not just log_insight)
  → Tool creates:
    1. agent_insights (type: needs_clarification, source_message_id in source_event)
    2. todo_chantier (titre: "Identifier le contact 06...", priorite: urgent)

Dashboard shows ClarificationCard:
  "Message de 0687654321: 'on commence lundi'"
  [Affecter à un lot ▼]  [Créer un contact]  [Ignorer]

User clicks "Affecter à un lot":
  → Modal: select lot + enter name/métier
  → POST /api/chantier/[id]/contacts (create or update with lot_id)
  → POST /api/chantier/[id]/agent-retry (re-process original message)
  → Agent now has context → updates planning
  → Marks insight as read + task as done
```

### `request_clarification` tool (added to tools.ts)

```typescript
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
}
```

The tool execution creates both the insight AND the task in one call.

### `POST /api/chantier/[id]/agent-retry`

```typescript
// Re-trigger the agent on a specific message after clarification
// Body: { message_id: string }
// 1. Fetch the original message from chantier_whatsapp_messages
// 2. Invalidate agent_context_cache (contacts changed)
// 3. Call agent-orchestrator with the original message payload
```

### Step 1: Commit

```bash
git add supabase/functions/agent-orchestrator/tools.ts src/pages/api/chantier/[id]/agent-retry.ts src/components/chantier/cockpit/ClarificationCard.tsx
git commit -m "feat: LOT INCONNU pipeline — clarification workflow with retry"
```

---

## Summary

| # | Task | Cost | Files |
|---|------|------|-------|
| 1 | Migration (4 tables: insights, config, runs, journal) | — | 1 SQL |
| 2 | API routes (insights + config + journal + auth) | — | 4 files |
| 3 | `agent-checks` (deterministic, real-time) | **$0** | 1 edge fn + 3 wires |
| 4 | `agent-orchestrator` (LLM, 2x/day, rich context from existing APIs) | **$0.004/day** | 5 files + 2 crons |
| 5 | Dual-mode routing (OpenClaw trigger) | — | 3 modifs |
| 6 | OpenClaw skills + guide (avantages, contexte, HEARTBEAT) | — | 7 docs |
| 7 | Deploy + test | — | Config |
| 8 | Pipeline "LOT INCONNU" (clarification workflow + retry) | — | 2 routes + 1 component |
| 9 | Contact roles + virtual lots (architecte, MOE) | — | 2 modifs + 1 migration |
| 10 | Frontend: JournalChantier (livre, navigation fleches) | — | 2 components |

## Architecture diagram

```
REAL-TIME (every event):

WhatsApp msg / Email
    ↓
Mode edge_function:              Mode openclaw:
    ↓                               ↓
agent-orchestrator               triggerAgentIfOpenClaw
    ↓                               ↓
Check context cache              POST /hooks/agent
(hit: 1.5K tokens)              (user's LLM, user's cost)
(miss: hydrate 6K, cache)
    ↓
Gemini 2.5 Flash (function calling)
  - update_planning (cascade)
  - update_lot_status
  - create_task
  - request_clarification (LOT INCONNU)
  - log_insight (with actions_summary)
    ↓
agent_insights (with actions taken by AI)

Document upload:
    ↓
agent-checks (SQL, $0)
    ↓
7 checks: budget overrun, payment late,
  facture litige, budget global, no devis,
  devis a relancer, missing proofs
    ↓
agent_insights

Cron 19h (digest):
    ↓
Read today's insights + actions + taches
    ↓
Gemini rédige le digest
    ↓
chantier_journal (livre, 1 page/jour)
+ WhatsApp (Whapi) + Email (SendGrid)
```

## Task 10: Frontend — JournalChantier (livre avec navigation)

**Files:**
- Create: `src/components/chantier/cockpit/JournalChantier.tsx` — book-like component
- Create: `src/pages/api/chantier/[id]/journal.ts` — GET journal entries

### Step 1: API route

```typescript
// GET /api/chantier/[id]/journal?date=2026-04-07
// Returns a single journal page. If no date, returns latest.
// Also supports: ?from=2026-04-01&to=2026-04-07 for a range (calendar dots)
```

### Step 2: Component

```tsx
// JournalChantier.tsx
// - Arrow left (← Hier) / Arrow right (Demain →)
// - Date display centered (Lundi 7 avril 2026)
// - Body: markdown rendered digest
// - If no entry for the day: "📖 Rien à signaler ce jour-là"
// - Bottom: severity dot (green/orange/red) matching max_severity
// - Optional: mini calendar strip showing dots for days with entries
```

### Step 3: Commit

```bash
git add src/components/chantier/cockpit/JournalChantier.tsx src/pages/api/chantier/[id]/journal.ts
git commit -m "feat: JournalChantier book UI with daily page navigation"
```

---

## Cost comparison

| Scenario | Sans cache | Avec cache (design final) |
|----------|-----------|--------------------------|
| 1 chantier actif, 20 msgs/jour | $0.30/jour = $9/mois | $0.005/jour = **$0.15/mois** |
| 10 users actifs | $90/mois | **$1.50/mois** |
| 100 users actifs | $900/mois | **$15/mois** |
