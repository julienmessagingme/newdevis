import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildContext } from "./context.ts";
import { buildSystemPrompt } from "./prompt.ts";
import { TOOLS_SCHEMA_BATCH, TOOLS_SCHEMA_INTERACTIVE, executeTool } from "./tools.ts";
import type { RunType, AssistantMessage } from "./types.ts";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const geminiKey = Deno.env.get("GOOGLE_AI_API_KEY") ?? "";
const whapiToken = Deno.env.get("WHAPI_TOKEN") ?? "";
const sendgridKey = Deno.env.get("SENDGRID_API_KEY") ?? "";
const agentSecretKey = Deno.env.get("AGENT_SECRET_KEY") ?? "";
const apiBase = Deno.env.get("API_BASE") ?? "https://www.verifiermondevis.fr";
const MAX_TOOL_ROUNDS = 3;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  const body = await req.json().catch(() => ({}));
  const runType: RunType = body.run_type ?? "evening";
  const singleChantierId: string | null = body.chantier_id ?? null;

  // ── Interactive mode: synchronous request-response ─────────────────────────
  if (runType === "interactive") {
    if (!singleChantierId) {
      return new Response(JSON.stringify({ error: "chantier_id required for interactive mode" }), { status: 400 });
    }
    const userMessage: string = body.user_message ?? "";
    const conversationHistory: AssistantMessage[] = body.conversation_history ?? [];

    try {
      const result = await handleInteractive(singleChantierId, userMessage, conversationHistory);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("[agent-interactive] error:", err instanceof Error ? err.message : err);
      return new Response(JSON.stringify({ error: "Erreur interne de l'agent" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  // ── Batch mode: morning / evening ─────────────────────────────────────────
  const supabase = createClient(supabaseUrl, supabaseKey);

  let chantierIds: string[];
  if (singleChantierId) {
    chantierIds = [singleChantierId];
  } else {
    const { data: activeChantiers } = await supabase
      .from("chantiers")
      .select("id")
      .not("phase", "eq", "reception");
    chantierIds = (activeChantiers ?? []).map((c: any) => c.id);
  }

  if (chantierIds.length === 0) {
    return new Response(JSON.stringify({ processed: 0, reason: "no_active_chantiers" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Process a single chantier (batch mode) ──────────────────────────────
  async function processChantier(chantierId: string): Promise<boolean> {
    const { data: lastRun } = await supabase
      .from("agent_runs")
      .select("created_at")
      .eq("chantier_id", chantierId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (runType === "morning" && lastRun) {
      const elapsed = Date.now() - new Date(lastRun.created_at).getTime();
      if (elapsed < 60_000) {
        console.log(`[agent] Cooldown skip ${chantierId}: last run ${Math.round(elapsed / 1000)}s ago`);
        return false;
      }
    }

    const ctx = await buildContext(supabase, chantierId, lastRun?.created_at ?? null, agentSecretKey, apiBase);

    if (
      runType === "morning" &&
      ctx.messages_since_last_run.length === 0 &&
      ctx.budget_conseils.length === 0 &&
      ctx.risk_alerts.length === 0
    ) {
      return false;
    }

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: buildSystemPrompt(ctx, runType) },
      {
        role: "user",
        content: runType === "morning"
          ? "Analyse les messages reçus et détecte les impacts sur le planning et le budget."
          : "Génère le digest de la journée. Résume les événements, les alertes, et les prochaines actions.",
      },
    ];

    let rounds = 0;
    const totalActions: Array<Record<string, unknown>> = [];

    while (rounds < MAX_TOOL_ROUNDS) {
      rounds++;
      const res = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${geminiKey}` },
        body: JSON.stringify({ model: "gemini-2.5-flash", messages, tools: TOOLS_SCHEMA_BATCH, max_tokens: 16384 }),
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

    // Evening: generate digest + send + insert into chantier_assistant_messages
    // GARANTIE : on écrit TOUJOURS une entrée chantier_journal, même vide.
    if (runType === "evening") {
      let digestContent = "";
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "assistant" && typeof messages[i].content === "string") {
          digestContent = messages[i].content as string;
          break;
        }
      }

      if (!digestContent || digestContent.length <= 20) {
        const fallbackRes = await fetch(GEMINI_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${geminiKey}` },
          body: JSON.stringify({ model: "gemini-2.5-flash", messages, max_tokens: 4096 }),
        });
        const fallbackData = await fallbackRes.json();
        const fallbackContent = fallbackData.choices?.[0]?.message?.content;
        if (typeof fallbackContent === "string" && fallbackContent.length > 20) {
          digestContent = fallbackContent;
        } else {
          console.warn(`[evening-digest] LLM returned no usable text for ${chantierId}, writing placeholder`);
        }
      }

      const insightsCount = ctx.todays_insights_with_actions.length;
      const severities = ctx.todays_insights_with_actions.map(i => i.severity);
      const maxSeverity = severities.includes("critical") ? "critical"
        : severities.includes("warning") ? "warning" : "info";

      // Fallback textuel déterministe si l'IA n'a rien produit
      const hasRealContent = digestContent && digestContent.length > 20;
      const journalBody = hasRealContent
        ? digestContent
        : `**Journée calme sur ${ctx.chantier.emoji} ${ctx.chantier.nom}.**\n\nAucun message WhatsApp, aucune alerte budget, aucun paiement en retard, aucun risque détecté aujourd'hui.\n\n_Entrée générée automatiquement à 19h._`;

      // Envoi WA / email uniquement si vrai contenu IA
      if (hasRealContent) {
        await sendDigestMessage(
          supabase, chantierId, ctx.chantier.user_id, ctx.chantier.nom,
          ctx.chantier.emoji, digestContent,
        );

        // Insert as agent-initiated assistant message (proactive, for chat UI)
        await supabase.from("chantier_assistant_messages").insert({
          chantier_id:    chantierId,
          role:           "assistant",
          content:        digestContent,
          agent_initiated: true,
          is_read:        false,
        }).then(() => {}).catch(() => {}); // non-blocking
      }

      // GARANTIE : journal ALWAYS written — upsert par (chantier_id, journal_date)
      const today = new Date().toISOString().split("T")[0];
      await supabase.from("chantier_journal").upsert({
        chantier_id: chantierId,
        user_id: ctx.chantier.user_id,
        journal_date: today,
        body: journalBody,
        alerts_count: insightsCount,
        max_severity: maxSeverity,
        updated_at: new Date().toISOString(),
      }, { onConflict: "chantier_id,journal_date" });
    }

    await supabase.from("agent_runs").insert({
      chantier_id: chantierId,
      run_type: runType,
      messages_analyzed: ctx.messages_since_last_run.length,
      insights_created: totalActions.filter(a => a.tool === "log_insight").length,
      actions_taken: totalActions,
    });

    return true;
  }

  let processed = 0;
  if (singleChantierId) {
    try {
      if (await processChantier(singleChantierId)) processed++;
    } catch (err) {
      console.error(`[agent] Error processing ${singleChantierId}:`, err instanceof Error ? err.message : err);
    }
  } else {
    const CONCURRENCY = 3;
    for (let i = 0; i < chantierIds.length; i += CONCURRENCY) {
      const batch = chantierIds.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(batch.map(id => processChantier(id)));
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) processed++;
        if (r.status === "rejected") console.error("[agent] batch error:", r.reason instanceof Error ? r.reason.message : String(r.reason));
      }
    }
  }

  return new Response(JSON.stringify({ processed, run_type: runType }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// ── Interactive handler ────────────────────────────────────────────────────────
async function handleInteractive(
  chantierId: string,
  userMessage: string,
  conversationHistory: AssistantMessage[],
): Promise<{ response_text: string; tool_calls_executed: string[]; tool_trace: Array<{ tool: string; args: Record<string, unknown>; result_ok: boolean; result_preview: string }> }> {
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Build context (with conversation history)
  const ctx = await buildContext(supabase, chantierId, null, agentSecretKey, apiBase, conversationHistory);

  // Build messages: system prompt + conversation history + current user message
  const systemPrompt = buildSystemPrompt(ctx, "interactive");
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: systemPrompt },
  ];

  // Inject conversation history (max 20 last messages to stay within context)
  // Le filtre regex précédent (anti-hallucinations) cassait l'alternance user/assistant
  // quand un assistant message était retiré → Gemini produisait des réponses vides (bug 2026-04-15).
  // On laisse passer tous les messages, le prompt système contient maintenant une consigne
  // explicite "PHRASES INTERDITES + IGNORE les réponses passées polluées".
  const historySlice = conversationHistory.slice(-20);
  for (const msg of historySlice) {
    if (msg.role === "user" || msg.role === "assistant") {
      const entry: Record<string, unknown> = { role: msg.role, content: msg.content ?? "" };
      if (msg.tool_calls) entry.tool_calls = msg.tool_calls;
      messages.push(entry);
    } else if (msg.role === "tool" && msg.tool_call_id) {
      messages.push({ role: "tool", tool_call_id: msg.tool_call_id, content: msg.content ?? "" });
    }
  }

  // Add current user message
  messages.push({ role: "user", content: userMessage });

  let rounds = 0;
  const toolCallsExecuted: string[] = [];
  // Trace détaillée : chaque tool_call avec ses args + résultat (pour persistance observabilité)
  const toolTrace: Array<{ tool: string; args: Record<string, unknown>; result_ok: boolean; result_preview: string }> = [];

  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${geminiKey}` },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages,
        tools: TOOLS_SCHEMA_INTERACTIVE,
        max_tokens: 8192,
      }),
    });

    const data = await res.json();
    const choice = data.choices?.[0]?.message;
    if (!choice?.tool_calls || choice.tool_calls.length === 0) {
      // Final text response
      let responseText = typeof choice?.content === "string" ? choice.content : "";

      // Filet de sécurité : si Gemini renvoie content vide ET aucun tool_call,
      // relance une dernière tentative en précisant d'agir (ne pas renvoyer du vide à l'utilisateur).
      if (responseText.trim().length === 0) {
        console.warn(`[interactive] Empty response from Gemini, retrying with nudge`);
        const retryMessages = [
          ...messages,
          { role: "user", content: "Réponds directement. Si tu dois appeler un tool (ex: update_lot_dates après confirmation), appelle-le maintenant. Si tu réponds en texte, écris une phrase complète en français — jamais une réponse vide." },
        ];
        const retryRes = await fetch(GEMINI_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${geminiKey}` },
          body: JSON.stringify({ model: "gemini-2.5-flash", messages: retryMessages, tools: TOOLS_SCHEMA_INTERACTIVE, max_tokens: 4096 }),
        });
        const retryData = await retryRes.json();
        const retryChoice = retryData.choices?.[0]?.message;
        if (retryChoice?.tool_calls && retryChoice.tool_calls.length > 0) {
          // Retry a produit un tool_call — l'exécute et retourne une phrase pré-formulée
          for (const tc of retryChoice.tool_calls) {
            const args = JSON.parse(tc.function.arguments);
            const result = await executeTool(chantierId, tc.function.name, args, { run_type: "interactive" });
            toolCallsExecuted.push(tc.function.name);
            let resultOk = false;
            try { resultOk = JSON.parse(result)?.ok === true; } catch { /* ignore */ }
            toolTrace.push({ tool: tc.function.name, args, result_ok: resultOk, result_preview: String(result).slice(0, 300) });
          }
          responseText = retryChoice.content && retryChoice.content.trim().length > 0
            ? retryChoice.content
            : "C'est fait.";
        } else if (retryChoice?.content && retryChoice.content.trim().length > 0) {
          responseText = retryChoice.content;
        } else {
          responseText = "Je n'ai pas saisi ta demande. Peux-tu reformuler ?";
        }
      }

      supabase.from("agent_runs").insert({
        chantier_id: chantierId,
        run_type: "interactive",
        messages_analyzed: 1,
        insights_created: 0,
        actions_taken: toolTrace,
      }).then(() => {}).catch(() => {});
      return { response_text: responseText, tool_calls_executed: toolCallsExecuted, tool_trace: toolTrace };
    }

    messages.push({ role: "assistant", content: choice.content, tool_calls: choice.tool_calls });

    for (const tc of choice.tool_calls) {
      const args = JSON.parse(tc.function.arguments);
      const result = await executeTool(chantierId, tc.function.name, args, { run_type: "interactive" });
      toolCallsExecuted.push(tc.function.name);
      // Parse result pour extraire ok + preview (pour traçage)
      let resultOk = false;
      let resultPreview = "";
      try {
        const parsed = JSON.parse(result);
        resultOk = parsed?.ok === true;
        resultPreview = result.slice(0, 300);
      } catch {
        resultPreview = String(result).slice(0, 300);
      }
      toolTrace.push({ tool: tc.function.name, args, result_ok: resultOk, result_preview: resultPreview });
      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }

  // Force a final text response if all rounds consumed by tool calls
  const fallbackRes = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${geminiKey}` },
    body: JSON.stringify({ model: "gemini-2.5-flash", messages, max_tokens: 2048 }),
  });
  const fallbackData = await fallbackRes.json();
  const fallbackText = fallbackData.choices?.[0]?.message?.content ?? "Je n'ai pas pu générer une réponse. Réessaie.";
  // Log interactive run for observability (fire-and-forget)
  supabase.from("agent_runs").insert({
    chantier_id: chantierId,
    run_type: "interactive",
    messages_analyzed: 1,
    insights_created: 0,
    actions_taken: toolTrace,
  }).then(() => {}).catch(() => {});
  return { response_text: fallbackText, tool_calls_executed: toolCallsExecuted, tool_trace: toolTrace };
}

// ── Digest delivery (WhatsApp + Email uniquement — le journal est upsert inline) ─

async function sendDigestMessage(
  supabase: any,
  chantierId: string,
  userId: string,
  nom: string,
  emoji: string,
  text: string,
) {
  const { data: { user } } = await supabase.auth.admin.getUserById(userId);
  const phone = user?.phone ?? user?.user_metadata?.phone;
  const email = user?.email;

  const label = `${emoji} ${nom}`.trim();

  if (whapiToken && phone) {
    const chatId = phone.replace(/^\+/, "") + "@s.whatsapp.net";
    const msgBody = `\u{1F4CB} Digest — ${label}\n\n${text}`;
    try {
      const resp = await fetch("https://gate.whapi.cloud/messages/text", {
        method: "POST",
        headers: { Authorization: `Bearer ${whapiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: chatId, body: msgBody }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const msgId: string | undefined = data?.message?.id;
        if (msgId) {
          await supabase.from("whatsapp_outgoing_messages").insert({
            id: msgId, chantier_id: chantierId, group_jid: chatId, body: msgBody, run_type: "evening",
          });
        }
      }
    } catch {
      // fire-and-forget
    }
  }

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
}
