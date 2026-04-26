// Shared constants, types and helpers for all tool modules.
// One single source of truth for env vars and helpers used by handlers.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const AGENT_SECRET_KEY = Deno.env.get("AGENT_SECRET_KEY") ?? "";
export const API_BASE = Deno.env.get("API_BASE") ?? "https://www.verifiermondevis.fr";
export const WHAPI_TOKEN = Deno.env.get("WHAPI_TOKEN") ?? "";

/** OpenAI-compat tool schema (Gemini accepte ce format via /v1beta/openai). */
export interface Tool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** Contexte passé à chaque handler. */
export interface HandlerContext {
  chantierId: string;
  headers: Record<string, string>;
  args: Record<string, unknown>;
  meta: { run_type: string };
}

/** Signature commune : toujours un string JSON pour rester compatible avec le format tool result. */
export type Handler = (ctx: HandlerContext) => Promise<string>;

/** Headers standards pour appeler les API Astro côté agent. */
export function defaultHeaders(): Record<string, string> {
  return {
    "X-Agent-Key": AGENT_SECRET_KEY,
    "Content-Type": "application/json",
  };
}

/** Supabase service-role client — bypass RLS, à n'utiliser que côté agent (jamais exposé client). */
export function supabaseAdmin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}
