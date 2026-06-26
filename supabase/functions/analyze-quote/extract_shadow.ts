/**
 * supabase/functions/analyze-quote/extract_shadow.ts
 *
 * 🟢 Phase 3.2 (2026-06-24) — Shadow runner pour comparer extract.ts v1 vs extract_v2.ts
 *
 * Lit le feature flag `EXTRACT_V2_ENABLED` (off / shadow / on) dans Deno env.
 *
 * Mode "shadow" (le seul utilisé en Phase 3.2) :
 *   1. L'utilisateur reçoit la réponse de V1 (comportement actuel)
 *   2. Après réponse, V2 tourne en background via EdgeRuntime.waitUntil
 *   3. V2 termine → on calcule un diff structuré V1 vs V2
 *   4. On INSERT dans extract_comparisons (jamais consulté côté UI)
 *
 * Workflow d'analyse : scripts/phase3-analyze-shadow.ts produit un rapport
 * markdown des divergences récurrentes après 50-100 analyses shadow.
 *
 * Mode "on" (Phase 3.3, future) : V2 remplace V1. V1 reste comme fallback
 * si V2 échoue ou dépasse le budget temps.
 *
 * USAGE depuis index.ts :
 *   import { runShadowExtractV2 } from "./extract_shadow.ts";
 *   // ... après extract_v1 réussi
 *   if (EXTRACT_V2_ENABLED === "shadow") {
 *     EdgeRuntime.waitUntil(
 *       runShadowExtractV2(supabase, { analysisId, fileName, fileBytes, mimeType, googleApiKey, extractedV1, v1DurationMs })
 *     );
 *   }
 */

import type { ExtractedData } from "./types.ts";
import { extractDataFromDocumentV2, type ExtractedDataV2 } from "./extract_v2.ts";

// ──────────────────────────────────────────────────────────────────────────────
// Feature flag
// ──────────────────────────────────────────────────────────────────────────────

export type ExtractV2Mode = "off" | "shadow" | "on";

/**
 * Lit la variable d'env EXTRACT_V2_ENABLED et la normalise.
 * Par défaut : "off" (zero risque tant qu'on ne flip pas).
 */
export function getExtractV2Mode(): ExtractV2Mode {
  let raw: string | undefined;
  try {
    raw = typeof Deno !== "undefined" ? Deno.env.get("EXTRACT_V2_ENABLED") : undefined;
  } catch {
    raw = undefined;
  }
  if (!raw) return "off";
  const v = String(raw).toLowerCase().trim();
  if (v === "shadow" || v === "on" || v === "off") return v as ExtractV2Mode;
  if (v === "true" || v === "1") return "on";
  if (v === "false" || v === "0") return "off";
  console.warn(`[extract_shadow] EXTRACT_V2_ENABLED="${raw}" non reconnu, fallback "off"`);
  return "off";
}

// ──────────────────────────────────────────────────────────────────────────────
// Calcul du diff V1 vs V2
// ──────────────────────────────────────────────────────────────────────────────

interface DiffResume {
  totaux_ht_diff: number; // V2 - V1 (€)
  totaux_ttc_diff: number;
  nb_travaux_v1: number;
  nb_travaux_v2: number;
  nb_travaux_diff: number;
  iban_match: boolean;
  siret_match: boolean;
  type_document_match: boolean;
  is_foreign_match: boolean;
  is_incomplete_match: boolean;
  lignes_added: Array<{ libelle: string; montant: number | null }>; // dans V2 mais pas V1
  lignes_removed: Array<{ libelle: string; montant: number | null }>; // dans V1 mais pas V2
  lignes_modified: Array<{ libelle: string; v1_montant: number | null; v2_montant: number | null; ecart_pct: number }>;
  confiance_globale_v2: string;
  summary: string;
}

/**
 * Normalise un libellé pour comparaison (lowercase, trim, normalize NFD pour les accents).
 */
function normalizeLibelle(s: string | null | undefined): string {
  if (!s) return "";
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim();
}

/**
 * Calcule le diff structuré V1 vs V2.
 *
 * Heuristiques :
 *   - Lignes matchées par libellé normalisé (lowercase + sans accents)
 *   - Si match : on compare les montants → si écart > 5€ ou > 1% → modifié
 *   - Si pas de match : ligne added (en V2) ou removed (manque en V2)
 */
export function diffExtractions(v1: ExtractedData, v2: ExtractedDataV2): DiffResume {
  const v1Travaux = Array.isArray(v1.travaux) ? v1.travaux : [];
  const v2Travaux = Array.isArray(v2.travaux) ? v2.travaux : [];

  const v1ByLib = new Map<string, { libelle: string; montant: number | null }>();
  for (const t of v1Travaux) {
    const k = normalizeLibelle(t.libelle);
    if (k) v1ByLib.set(k, { libelle: t.libelle, montant: t.montant });
  }

  const lignes_added: DiffResume["lignes_added"] = [];
  const lignes_modified: DiffResume["lignes_modified"] = [];
  const v2Seen = new Set<string>();
  for (const t of v2Travaux) {
    const k = normalizeLibelle(t.libelle);
    if (!k) continue;
    v2Seen.add(k);
    const v1Entry = v1ByLib.get(k);
    if (!v1Entry) {
      lignes_added.push({ libelle: t.libelle, montant: t.montant });
      continue;
    }
    const v1m = v1Entry.montant ?? 0;
    const v2m = t.montant ?? 0;
    const diff = Math.abs(v1m - v2m);
    const ref = Math.max(v1m, v2m, 1);
    if (diff > 5 && diff / ref > 0.01) {
      lignes_modified.push({
        libelle: t.libelle,
        v1_montant: v1Entry.montant,
        v2_montant: t.montant,
        ecart_pct: Math.round((diff / ref) * 10000) / 10000,
      });
    }
  }

  const lignes_removed: DiffResume["lignes_removed"] = [];
  for (const t of v1Travaux) {
    const k = normalizeLibelle(t.libelle);
    if (!k) continue;
    if (!v2Seen.has(k)) {
      lignes_removed.push({ libelle: t.libelle, montant: t.montant });
    }
  }

  const v1Ht = v1.totaux?.ht ?? 0;
  const v2Ht = v2.totaux?.ht ?? 0;
  const v1Ttc = v1.totaux?.ttc ?? 0;
  const v2Ttc = v2.totaux?.ttc ?? 0;

  const iban_match = (v1.entreprise?.iban ?? null) === (v2.entreprise?.iban ?? null);
  const siret_match = (v1.entreprise?.siret ?? null) === (v2.entreprise?.siret ?? null);
  const type_document_match = v1.type_document === v2.type_document;
  const is_foreign_match = (v1.is_foreign_quote ?? false) === (v2.is_foreign_quote ?? false);
  const is_incomplete_match = (v1.is_incomplete_quote ?? false) === (v2.is_incomplete_quote ?? false);

  // Summary court pour scan rapide
  const summaryParts: string[] = [];
  if (Math.abs(v2Ht - v1Ht) > 1) summaryParts.push(`ΔHT ${(v2Ht - v1Ht).toFixed(0)}€`);
  if (Math.abs(v2Ttc - v1Ttc) > 1) summaryParts.push(`ΔTTC ${(v2Ttc - v1Ttc).toFixed(0)}€`);
  if (v2Travaux.length !== v1Travaux.length) summaryParts.push(`Δtravaux ${v2Travaux.length - v1Travaux.length}`);
  if (lignes_added.length > 0) summaryParts.push(`+${lignes_added.length} lignes`);
  if (lignes_removed.length > 0) summaryParts.push(`-${lignes_removed.length} lignes`);
  if (lignes_modified.length > 0) summaryParts.push(`~${lignes_modified.length} lignes`);
  if (!iban_match) summaryParts.push(`IBAN ≠`);
  if (!siret_match) summaryParts.push(`SIRET ≠`);
  if (!type_document_match) summaryParts.push(`type ${v1.type_document}→${v2.type_document}`);
  summaryParts.push(`conf=${v2.confiance_globale}`);
  const summary = summaryParts.join(" · ");

  return {
    totaux_ht_diff: Math.round((v2Ht - v1Ht) * 100) / 100,
    totaux_ttc_diff: Math.round((v2Ttc - v1Ttc) * 100) / 100,
    nb_travaux_v1: v1Travaux.length,
    nb_travaux_v2: v2Travaux.length,
    nb_travaux_diff: v2Travaux.length - v1Travaux.length,
    iban_match,
    siret_match,
    type_document_match,
    is_foreign_match,
    is_incomplete_match,
    lignes_added: lignes_added.slice(0, 20), // cap pour ne pas exploser le JSON
    lignes_removed: lignes_removed.slice(0, 20),
    lignes_modified: lignes_modified.slice(0, 20),
    confiance_globale_v2: v2.confiance_globale,
    summary,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Shadow runner (fire-and-forget)
// ──────────────────────────────────────────────────────────────────────────────

export interface ShadowRunInput {
  analysisId: string;
  fileName: string | null;
  fileBytes: Uint8Array;
  mimeType: string;
  googleApiKey: string;
  extractedV1: ExtractedData;
  v1DurationMs: number;
  v1EngineVersion?: string;
}

/**
 * Lance V2 en background, calcule le diff, insère dans extract_comparisons.
 *
 * Fire-and-forget : aucune exception ne remonte. Si V2 échoue, on logue
 * l'erreur dans la table mais on ne casse jamais le flux principal.
 *
 * À appeler via `EdgeRuntime.waitUntil(runShadowExtractV2(...))` pour que
 * l'execution se termine APRÈS la réponse user.
 */
export async function runShadowExtractV2(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  input: ShadowRunInput,
): Promise<void> {
  const { analysisId, fileName, fileBytes, mimeType, googleApiKey, extractedV1, v1DurationMs, v1EngineVersion } = input;

  const startV2 = performance.now();
  let v2Success = false;
  let v2Error: string | null = null;
  let extractedV2: ExtractedDataV2 | null = null;
  let v2DurationMs = 0;

  try {
    const result = await extractDataFromDocumentV2({
      fileBytes,
      mimeType,
      googleApiKey,
    });
    v2DurationMs = Math.round(performance.now() - startV2);
    if (result.success && result.data) {
      v2Success = true;
      extractedV2 = result.data;
    } else {
      v2Error = `${result.errorCode ?? "UNKNOWN"}: ${result.error ?? "no error message"}`;
    }
  } catch (e) {
    v2DurationMs = Math.round(performance.now() - startV2);
    v2Error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }

  let diff: Record<string, unknown> = {};
  if (extractedV2 !== null) {
    try {
      diff = diffExtractions(extractedV1, extractedV2) as unknown as Record<string, unknown>;
    } catch (e) {
      diff = { summary: `diff_failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  } else {
    diff = { summary: `v2_failed: ${v2Error ?? "unknown"}` };
  }

  try {
    const { error } = await supabase.from("extract_comparisons").insert({
      analysis_id: analysisId,
      file_name: fileName,
      extract_v1: extractedV1,
      extract_v2: extractedV2 ?? {},
      diff,
      v1_engine_version: v1EngineVersion ?? "v1",
      v2_engine_version: "v2-prompt-structure-first",
      v1_duration_ms: v1DurationMs,
      v2_duration_ms: v2DurationMs,
      v2_success: v2Success,
      v2_error: v2Error,
    });
    if (error) {
      console.error(`[extract_shadow] insert failed for analysis ${analysisId}:`, error.message);
    } else {
      console.log(
        `[extract_shadow] analysis=${analysisId} v2_success=${v2Success} v2_duration=${v2DurationMs}ms diff="${diff.summary ?? "—"}"`,
      );
    }
  } catch (e) {
    console.error(`[extract_shadow] unexpected error for analysis ${analysisId}:`, e instanceof Error ? e.message : e);
  }
}
