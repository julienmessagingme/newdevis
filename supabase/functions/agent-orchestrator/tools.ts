// Re-export depuis le module modulaire `tools/`.
// Garde la compatibilité d'import pour `index.ts` (root) sans toucher à ses imports.
// Modifications futures de tools : éditer `tools/<domaine>.ts`.
export {
  TOOLS_SCHEMA_BATCH,
  ACTION_TOOLS_SCHEMA,
  TOOLS_SCHEMA_INTERACTIVE,
  TOOLS_SCHEMA,
  executeTool,
} from "./tools/index.ts";
