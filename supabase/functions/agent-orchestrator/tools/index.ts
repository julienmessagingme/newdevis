// Dispatcher central : assemble tous les modules tools, expose les schémas
// agrégés et un executeTool unique. Tout nouveau module se branche ici.
import { Handler, Tool, defaultHeaders } from "./shared.ts";

import * as planning from "./planning.ts";
import * as status from "./status.ts";
import * as tasks from "./tasks.ts";
import * as finance from "./finance.ts";
import * as insights from "./insights.ts";
import * as comm from "./comm.ts";
import * as read from "./read.ts";
import { injectDispatcher } from "./comm.ts";

// Interface stricte que chaque module doit respecter — un export manquant = erreur TS au build.
interface ToolModule {
  BATCH_SCHEMAS: Tool[];
  ACTION_SCHEMAS: Tool[];
  handlers: Record<string, Handler>;
}

// Order matters only for prompt clarity (LLM voit les tools dans cet ordre).
// Lecture en dernier pour ne pas masquer les actions disponibles.
const MODULES: ToolModule[] = [planning, status, tasks, finance, insights, comm, read];

// Sanity check au boot : refuse les collisions de noms entre modules.
// Sans ça, un dev qui ajoute par erreur `update_lot_status` dans planning.ts ET status.ts
// écraserait silencieusement le handler (Object.assign last-wins) → bug en prod.
{
  const seen = new Set<string>();
  for (const m of MODULES) {
    for (const name of Object.keys(m.handlers)) {
      if (seen.has(name)) {
        throw new Error(`[tools] Tool name collision detected: '${name}' défini dans plusieurs modules`);
      }
      seen.add(name);
    }
  }
}

// ── Schémas agrégés ─────────────────────────────────────────────────────────
// BATCH = safe pour morning/evening (pas d'effet irréversible côté tiers).
// INTERACTIVE = BATCH + ACTION (tout autorisé en mode chat).
export const TOOLS_SCHEMA_BATCH: Tool[] = MODULES.flatMap(m => m.BATCH_SCHEMAS);
export const ACTION_TOOLS_SCHEMA: Tool[] = MODULES.flatMap(m => m.ACTION_SCHEMAS);
export const TOOLS_SCHEMA_INTERACTIVE: Tool[] = [...TOOLS_SCHEMA_BATCH, ...ACTION_TOOLS_SCHEMA];

// Legacy alias.
export const TOOLS_SCHEMA = TOOLS_SCHEMA_BATCH;

// ── Map handlers : toolName → Handler ──────────────────────────────────────
const handlerMap: Record<string, Handler> = MODULES.reduce<Record<string, Handler>>(
  (acc, m) => ({ ...acc, ...m.handlers }),
  {},
);

// Set des tools "action" (irréversibles) : utilisé pour bloquer leur usage en
// mode batch (morning/evening). Dérivé du schéma ACTION pour éviter la
// duplication manuelle.
const ACTION_TOOL_NAMES = new Set(ACTION_TOOLS_SCHEMA.map(t => t.function.name));

/**
 * Dispatch + guard + uniformisation erreur. C'est le seul export utilisé par index.ts (root).
 *
 * ⚠️ IMPORTANT — DOIT rester une `function` declaration (hoisted), PAS un `const ... = async () => ...`.
 * Raison : la dernière ligne de ce fichier (`injectDispatcher(executeTool)`) s'exécute au load
 * du module pour casser la dépendance circulaire avec `comm.ts`. Si on le transforme en const,
 * TDZ → ReferenceError au démarrage de l'edge function.
 */
export async function executeTool(
  chantierId: string,
  toolName: string,
  args: Record<string, unknown>,
  meta: { run_type: string },
): Promise<string> {
  // Guard : action tools ne doivent JAMAIS tourner en batch (morning/evening).
  if (ACTION_TOOL_NAMES.has(toolName) && meta.run_type !== "interactive") {
    console.warn(`[tools] Blocked action tool '${toolName}' in '${meta.run_type}' mode`);
    return JSON.stringify({ ok: false, error: `Tool '${toolName}' is only available in interactive mode` });
  }

  const handler = handlerMap[toolName];
  if (!handler) {
    return JSON.stringify({ ok: false, error: `Unknown tool: ${toolName}` });
  }

  try {
    return await handler({
      chantierId,
      headers: defaultHeaders(),
      args,
      meta,
    });
  } catch (err) {
    return JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

// Branche le dispatcher dans comm.ts pour permettre à resolve_pending_decision
// d'exécuter l'expected_action via le même chemin que tous les autres tools.
// Casse la dépendance circulaire (comm.ts → index.ts → comm.ts).
injectDispatcher(executeTool);
