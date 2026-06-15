// captureError — error-tracking maison côté edge functions Deno. Best-effort, ne throw JAMAIS.
// Insère dans `error_log` (service-role) + ping Telegram instantané. Gated sur env -> no-op si
// non configuré. Importé par les fonctions sensibles (analyze-quote, agent-orchestrator, whapi…)
// dans leurs catch / points de fuite silencieuse.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function envOf(name: string): string | undefined {
  try { return typeof Deno !== "undefined" ? Deno.env.get(name) : undefined; } catch { return undefined; }
}

const SUPABASE_URL = envOf("SUPABASE_URL");
const SERVICE_ROLE = envOf("SUPABASE_SERVICE_ROLE_KEY");
const TG_TOKEN = envOf("TELEGRAM_ERROR_BOT_TOKEN");
const TG_CHAT = envOf("TELEGRAM_ERROR_CHAT_ID");

export interface ErrorContext {
  userId?: string | null;
  [key: string]: unknown;
}

export async function captureError(
  source: string,
  error: unknown,
  context?: ErrorContext,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack ?? null) : null;

  try {
    if (SUPABASE_URL && SERVICE_ROLE) {
      await createClient(SUPABASE_URL, SERVICE_ROLE).from("error_log").insert({
        source,
        message,
        stack,
        context: context ?? null,
        user_id: (context?.userId as string | undefined) ?? null,
      });
    }
  } catch { /* jamais bloquant */ }

  try {
    if (TG_TOKEN && TG_CHAT) {
      const ctxStr = context ? `\n${JSON.stringify(context)}` : "";
      const text = `🔴 VMD/GMC · ${source}\n${message}${ctxStr}`.slice(0, 3800);
      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: TG_CHAT, text, disable_web_page_preview: true }),
      });
    }
  } catch { /* jamais bloquant */ }
}
