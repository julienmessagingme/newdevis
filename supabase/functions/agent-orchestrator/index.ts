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
const agentSecretKey = Deno.env.get("AGENT_SECRET_KEY") ?? "";
const apiBase = Deno.env.get("API_BASE") ?? "https://www.verifiermondevis.fr";
const MAX_TOOL_ROUNDS = 3;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  const body = await req.json().catch(() => ({}));
  const runType: "morning" | "evening" = body.run_type ?? "evening";
  const singleChantierId: string | null = body.chantier_id ?? null;

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Find active chantiers (with messages or documents in last 24h)
  let chantierIds: string[];

  if (singleChantierId) {
    chantierIds = [singleChantierId];
  } else {
    const since = new Date(Date.now() - 86400000).toISOString();
    const { data: activeChantiers } = await supabase
      .from("chantier_whatsapp_messages")
      .select("chantier_id")
      .gte("timestamp", since);

    chantierIds = [...new Set((activeChantiers ?? []).map((c: any) => c.chantier_id))];
  }

  if (chantierIds.length === 0) {
    return new Response(JSON.stringify({ processed: 0, reason: "no_active_chantiers" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
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

      // Build rich context (5 API calls + 3 direct Supabase)
      const ctx = await buildContext(
        supabase,
        chantierId,
        lastRun?.created_at ?? null,
        agentSecretKey,
        apiBase,
      );

      // Skip if no messages and no alerts
      if (
        ctx.messages_since_last_run.length === 0 &&
        ctx.budget_conseils.length === 0 &&
        ctx.risk_alerts.length === 0
      ) {
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
      const totalActions: Array<Record<string, unknown>> = [];

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

      // If evening run, generate digest and send to user
      if (runType === "evening") {
        // Get the final text content from the last assistant message
        let digestContent = "";
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === "assistant" && typeof messages[i].content === "string") {
            digestContent = messages[i].content as string;
            break;
          }
        }

        if (digestContent && digestContent.length > 20) {
          // Compute severity stats from today's insights
          const insightsCount = ctx.todays_insights_with_actions.length;
          const severities = ctx.todays_insights_with_actions.map(i => i.severity);
          const maxSeverity = severities.includes("critical") ? "critical"
            : severities.includes("warning") ? "warning" : "info";

          await sendDigest(
            supabase, chantierId, ctx.chantier.user_id, ctx.chantier.nom,
            ctx.chantier.emoji, digestContent, insightsCount, maxSeverity,
          );
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

  return new Response(JSON.stringify({ processed, run_type: runType }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// ── Digest delivery (WhatsApp + Email + in-app journal) ──────────────

async function sendDigest(
  supabase: any,
  chantierId: string,
  userId: string,
  nom: string,
  emoji: string,
  text: string,
  insightsCount: number,
  maxSeverity: string,
) {
  const { data: { user } } = await supabase.auth.admin.getUserById(userId);
  const phone = user?.phone ?? user?.user_metadata?.phone;
  const email = user?.email;

  const label = `${emoji} ${nom}`.trim();

  // WhatsApp via whapi
  if (whapiToken && phone) {
    const chatId = phone.replace(/^\+/, "") + "@s.whatsapp.net";
    await fetch("https://gate.whapi.cloud/messages/text", {
      method: "POST",
      headers: { Authorization: `Bearer ${whapiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: chatId, body: `\u{1F4CB} Digest — ${label}\n\n${text}` }),
    }).catch(() => {});
  }

  // Email via SendGrid
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

  // In-app: upsert into chantier_journal (book-like, 1 page per day)
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
