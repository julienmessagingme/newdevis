// agent-scheduled-tick — cron 15min qui fire les rappels programmés.
//
// Lit `agent_scheduled_actions WHERE status='pending' AND due_at <= now()`,
// envoie un message WhatsApp dans le canal owner du chantier, met à jour le
// status. Si aucun canal owner configuré, marque 'failed' avec raison claire.
//
// verify_jwt = false (cf. CLAUDE.md piège ES256). Auth via service_role en interne.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const whapiToken  = Deno.env.get("WHAPI_TOKEN") ?? "";
const agentSecret = Deno.env.get("AGENT_SECRET_KEY") ?? "";

const BATCH_LIMIT = 50;          // max actions traitées par tick
const ACTION_TIMEOUT_MS = 8000;  // timeout par envoi whapi
const PARALLEL_BATCH = 8;        // nombre d'envois whapi en parallèle (vs séquentiel)

interface PendingAction {
  id: string;
  chantier_id: string;
  due_at: string;
  action_type: "reminder" | "auto_message";
  payload: { text?: string; lot_id?: string; tool?: string; args?: Record<string, unknown> };
  source: string | null;
}

async function sendWhatsAppToJid(jid: string, body: string): Promise<{ ok: boolean; error?: string }> {
  if (!whapiToken) return { ok: false, error: "WHAPI_TOKEN missing" };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ACTION_TIMEOUT_MS);
  try {
    const res = await fetch("https://gate.whapi.cloud/messages/text", {
      method: "POST",
      headers: { "Authorization": `Bearer ${whapiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: jid, body }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, error: `whapi ${res.status}: ${errText.slice(0, 100)}` };
    }
    return { ok: true };
  } catch (err) {
    clearTimeout(t);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

serve(async (req) => {
  // Auth manuelle (verify_jwt = false côté config.toml — piège ES256).
  // Accepte 2 schémas :
  //   1. Authorization: Bearer <service_role_key>  (utilisé par pg_cron via vault)
  //   2. X-Cron-Secret: <AGENT_SECRET_KEY>          (alternative quand vault non setup)
  // Sans l'un ou l'autre → 403.
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const cronSecret = req.headers.get("x-cron-secret") ?? "";
  const authorized =
    (bearer && bearer === supabaseKey) ||
    (cronSecret && agentSecret && cronSecret === agentSecret);
  if (!authorized) {
    return new Response("Forbidden", { status: 403 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. Atomic claim — passe les pending dus de 'pending' à 'firing' en UNE
  //    requête (RPC ou UPDATE FROM). Évite double envoi en cas de chevauchement
  //    de 2 invocations cron. SKIP LOCKED protège contre les claims concurrents.
  const { data: claimed, error: claimErr } = await supabase.rpc("claim_pending_reminders", {
    batch_limit: BATCH_LIMIT,
  });

  if (claimErr) {
    console.error("[scheduled-tick] claim error:", claimErr.message);
    return new Response(JSON.stringify({ error: claimErr.message }), { status: 500 });
  }

  const actions = (claimed ?? []) as PendingAction[];
  if (actions.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  // 2. Pre-fetch owner channels pour tous les chantiers concernés.
  const chantierIds = [...new Set(actions.map(a => a.chantier_id))];
  const { data: ownerChannels } = await supabase
    .from("chantier_whatsapp_groups")
    .select("chantier_id, group_jid")
    .in("chantier_id", chantierIds)
    .eq("is_owner_channel", true);
  const ownerJidByChantier = new Map<string, string>(
    (ownerChannels ?? []).map((g: any) => [g.chantier_id, g.group_jid]),
  );

  let succeeded = 0;
  let failed = 0;

  // 3. Process actions en parallèle par batches de PARALLEL_BATCH (vs séquentiel).
  //    Avec PARALLEL_BATCH=8 et timeout 8s, le pire cas est 50/8 × 8s = 50s — sous le 60s edge fn.
  async function processOne(action: PendingAction): Promise<"succeeded" | "failed"> {
    const ownerJid = ownerJidByChantier.get(action.chantier_id);

    if (!ownerJid) {
      await supabase.from("agent_scheduled_actions").update({
        status: "failed", fired_at: new Date().toISOString(),
        fired_result: { error: "no_owner_channel" },
      }).eq("id", action.id);
      return "failed";
    }

    if (action.action_type === "reminder") {
      const text = String(action.payload?.text ?? "").trim();
      if (!text) {
        await supabase.from("agent_scheduled_actions").update({
          status: "failed", fired_at: new Date().toISOString(),
          fired_result: { error: "empty_text" },
        }).eq("id", action.id);
        return "failed";
      }

      const message = `\u23F0 Rappel : ${text}`;
      const result = await sendWhatsAppToJid(ownerJid, message);

      await supabase.from("agent_scheduled_actions").update({
        status: result.ok ? "fired" : "failed",
        fired_at: new Date().toISOString(),
        fired_result: result,
      }).eq("id", action.id);

      return result.ok ? "succeeded" : "failed";
    }

    // action_type non supporté (auto_message ou autre) → marque failed avec raison.
    await supabase.from("agent_scheduled_actions").update({
      status: "failed", fired_at: new Date().toISOString(),
      fired_result: { error: `unsupported action_type: ${action.action_type}` },
    }).eq("id", action.id);
    return "failed";
  }

  for (let i = 0; i < actions.length; i += PARALLEL_BATCH) {
    const batch = actions.slice(i, i + PARALLEL_BATCH);
    const results = await Promise.allSettled(batch.map(processOne));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value === "succeeded") succeeded++;
      else failed++;
    }
  }

  return new Response(
    JSON.stringify({ processed: actions.length, succeeded, failed }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
