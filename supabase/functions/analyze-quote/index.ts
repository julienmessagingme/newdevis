import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { corsHeaders, PipelineError, isPipelineError, computeFileHash, checkCircuitBreaker } from "./utils.ts";
import type { ExtractedData, DomainType } from "./types.ts";
import { extractDataFromDocument } from "./extract.ts";
import { verifyData } from "./verify.ts";
import { calculateScore } from "./score.ts";
import { renderOutput } from "./render.ts";
import { lookupMarketPrices, type WorkItemFull, type JobTypePriceResult } from "./market-prices.ts";
import { summarizeWorkItems } from "./summarize.ts";
import { getDomainConfig } from "./domain-config.ts";

// ============ STRATEGIC SCORES — IVP / IPI ============

interface StrategicRow {
  job_type: string;
  value_intrinseque: number;
  liquidite: number;
  attractivite: number;
  energie: number;
  reduction_risque: number;
  impact_loyer: number;
  vacance: number;
  fiscalite: number;
  capex_risk: number;
}

interface StrategicItem {
  job_type: string;
  weight_ht: number;
}

function clampN(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function labelFromIvp(score100: number): string {
  if (score100 >= 90) return "Transformation patrimoniale";
  if (score100 >= 75) return "Potentiel stratégique";
  if (score100 >= 60) return "Valorisation significative";
  if (score100 >= 40) return "Optimisation modérée";
  return "Impact patrimonial limité";
}

function computeStrategicScores(items: StrategicItem[], matrix: StrategicRow[]) {
  const byJobType = new Map(matrix.map((m) => [m.job_type, m]));
  let totalWeight = 0;
  let ivpAcc = 0, ipiAcc = 0;
  let valueAcc = 0, liqAcc = 0, attrAcc = 0, energyAcc = 0, riskRedAcc = 0;
  let rentAcc = 0, vacAcc = 0, fiscAcc = 0, capexRiskAcc = 0;

  for (const it of items) {
    const m = byJobType.get(it.job_type);
    if (!m) continue;
    const w = it.weight_ht > 0 ? it.weight_ht : 1;
    totalWeight += w;

    const value = Number(m.value_intrinseque ?? 0);
    const liq   = Number(m.liquidite        ?? 0);
    const attr  = Number(m.attractivite     ?? 0);
    const nrj   = Number(m.energie          ?? 0);
    const rr    = Number(m.reduction_risque ?? 0);
    const rent  = Number(m.impact_loyer     ?? 0);
    const vac   = Number(m.vacance          ?? 0);
    const fisc  = Number(m.fiscalite        ?? 0);
    const capex = Number(m.capex_risk       ?? 0);

    const ivp = 0.30 * value + 0.25 * liq + 0.20 * attr + 0.15 * nrj + 0.10 * rr;
    const ipi = 0.35 * rent  + 0.25 * vac + 0.20 * nrj  + 0.10 * fisc + 0.10 * (5 - capex);

    ivpAcc       += ivp   * w;
    ipiAcc       += ipi   * w;
    valueAcc     += value * w;
    liqAcc       += liq   * w;
    attrAcc      += attr  * w;
    energyAcc    += nrj   * w;
    riskRedAcc   += rr    * w;
    rentAcc      += rent  * w;
    vacAcc       += vac   * w;
    fiscAcc      += fisc  * w;
    capexRiskAcc += capex * w;
  }

  if (totalWeight === 0) {
    return { ivp_score: null, ipi_score: null, label: "Non calculé", breakdown_owner: null, breakdown_investor: null };
  }

  const ivpScore100 = clampN(Math.round((ivpAcc / totalWeight) * 20), 0, 100);
  const ipiScore100 = clampN(Math.round((ipiAcc / totalWeight) * 20), 0, 100);

  const s = (v: number) => clampN(Math.round(((v / totalWeight) / 5) * 10), 0, 10);

  return {
    ivp_score: ivpScore100,
    ipi_score: ipiScore100,
    label: labelFromIvp(ivpScore100),
    breakdown_owner: {
      value:            s(valueAcc),
      liquidite:        s(liqAcc),
      attractivite:     s(attrAcc),
      energie:          s(energyAcc),
      reduction_risque: s(riskRedAcc),
    },
    breakdown_investor: {
      impact_loyer: s(rentAcc),
      vacance:      s(vacAcc),
      energie:      s(energyAcc),
      fiscalite:    s(fiscAcc),
      capex_risk:   clampN(Math.round(((capexRiskAcc / totalWeight) / 5) * 10), 0, 10),
    },
  };
}

// ============ MAIN HANDLER ============
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let analysisId: string | undefined;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const body = await req.json();
    analysisId = body.analysisId;
    const skipN8N = body.skipN8N === true;

    // Validate analysisId: required and must be a valid UUID
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!analysisId || !UUID_RE.test(analysisId)) {
      return new Response(
        JSON.stringify({ error: "analysisId is required and must be a valid UUID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const googleApiKey = Deno.env.get("GOOGLE_AI_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!googleApiKey) {
      console.error("GOOGLE_AI_API_KEY not configured");
      await supabase
        .from("analyses")
        .update({ status: "error", error_message: "Configuration serveur incomplète (clé IA manquante)" })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({ error: "Google AI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the analysis record
    const { data: analysis, error: fetchError } = await supabase
      .from("analyses")
      .select("*")
      .eq("id", analysisId)
      .single();

    if (fetchError || !analysis) {
      console.error("Analysis not found:", analysisId, fetchError);
      await supabase
        .from("analyses")
        .update({ status: "error", error_message: "Analyse introuvable" })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({ error: "Analysis not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load domain config
    const domainConfig = getDomainConfig((analysis.domain || "travaux") as DomainType);
    console.log("Domain:", domainConfig.domain);

    // Increment lifetime analysis count for the user (Pass Sérénité tracking)
    if (analysis.user_id) {
      try {
        await supabase.rpc("increment_analysis_count", { p_user_id: analysis.user_id });
      } catch (e) {
        console.warn("Failed to increment analysis count:", (e as Error).message);
      }
    }

    // Update status to processing
    await supabase
      .from("analyses")
      .update({ status: "processing", error_message: "[1/5] Téléchargement du fichier..." })
      .eq("id", analysisId);

    // Download the file for hash computation
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("devis")
      .download(analysis.file_path);

    if (downloadError || !fileData) {
      await supabase
        .from("analyses")
        .update({ status: "error", error_message: "Impossible de télécharger le fichier" })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({ error: "File download failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert to base64 - chunked approach
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Compute file hash for cache and circuit breaker
    const fileHash = await computeFileHash(uint8Array);
    console.log("File hash:", fileHash);

    // Generate request ID for tracing
    const requestId = crypto.randomUUID();

    // ============ STEP 0: GET OR CREATE DOCUMENT_EXTRACTIONS RECORD ============
    let extractionId: string | null = null;

    // First try to find the record created by the trigger
    const { data: existingExtraction } = await supabase
      .from("document_extractions")
      .select("id")
      .eq("analysis_id", analysisId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (existingExtraction) {
      extractionId = existingExtraction.id;
      await supabase
        .from("document_extractions")
        .update({
          file_hash: fileHash,
          request_id: requestId,
          started_at: new Date().toISOString(),
          provider: "pending",
          ocr_status: "created",
        })
        .eq("id", extractionId);
      console.log("Updated existing document_extractions record:", extractionId);
    } else {
      // Fallback: create manually if trigger didn't fire (shouldn't happen)
      const { data: newExtraction, error: insertError } = await supabase
        .from("document_extractions")
        .insert({
          file_hash: fileHash,
          file_path: analysis.file_path,
          analysis_id: analysisId,
          request_id: requestId,
          status: "created",
          started_at: new Date().toISOString(),
          provider: "pending",
          ocr_used: false,
          cache_hit: false,
          ocr_status: "created",
          parser_status: "pending",
          qtyref_status: "pending",
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("Failed to create document_extractions record:", insertError);
      } else {
        extractionId = newExtraction?.id || null;
        console.log("Created document_extractions record (fallback):", extractionId);
      }
    }

    // ============ CIRCUIT BREAKER CHECK ============
    const circuitBreaker = await checkCircuitBreaker(supabase, fileHash);
    if (circuitBreaker.blocked) {
      console.log("Circuit breaker triggered:", circuitBreaker.reason);

      if (extractionId) {
        await supabase
          .from("document_extractions")
          .update({
            status: "failed",
            error_code: "CIRCUIT_BREAKER",
            error_details: { reason: circuitBreaker.reason, last_failure: circuitBreaker.lastFailure },
          })
          .eq("id", extractionId);
      }

      await supabase
        .from("analyses")
        .update({
          status: "failed",
          error_message: "OCR a échoué récemment pour ce document. Veuillez relancer manuellement."
        })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({
          error: "CIRCUIT_BREAKER",
          message: circuitBreaker.reason,
          manual_retry_required: true,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ CHECK CACHE ============
    let cachedExtractedData: ExtractedData | null = null;
    const { data: cachedExtraction } = await supabase
      .from("document_extractions")
      .select("*")
      .eq("file_hash", fileHash)
      .eq("status", "parsed")
      .gt("expires_at", new Date().toISOString())
      .not("id", "eq", extractionId || "")
      .single();

    if (cachedExtraction && cachedExtraction.raw_text) {
      console.log("Cache hit for file hash:", fileHash);

      // Réutiliser les données extraites — évite un second appel Gemini non-déterministe
      try {
        const parsedCache = JSON.parse(cachedExtraction.raw_text) as ExtractedData;
        if (parsedCache?.type_document) {
          cachedExtractedData = parsedCache;
          console.log("Cache hit: ExtractedData réutilisée (type:", parsedCache.type_document, "), appel Gemini ignoré");
        }
      } catch {
        console.warn("Cache hit: impossible de parser raw_text, Gemini sera appelé");
      }

      if (extractionId) {
        await supabase
          .from("document_extractions")
          .update({
            status: "parsed",
            cache_hit: true,
            ocr_status: "success",
            parser_status: "success",
            qtyref_status: "success",
            raw_text: cachedExtraction.raw_text,
            ocr_debug: cachedExtraction.ocr_debug,
            parser_debug: cachedExtraction.parser_debug,
            qty_ref_debug: cachedExtraction.qty_ref_debug,
            provider: cachedExtraction.provider,
          })
          .eq("id", extractionId);
      }
    }

    let mimeType = "application/pdf";
    const fileName = analysis.file_name.toLowerCase();
    if (fileName.endsWith(".png")) mimeType = "image/png";
    else if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) mimeType = "image/jpeg";
    else if (fileName.endsWith(".webp")) mimeType = "image/webp";

    console.log("=== PIPELINE START ===");
    console.log("Analysis ID:", analysisId);
    console.log("File:", analysis.file_name);
    console.log("Request ID:", requestId);

    await supabase.from("analyses").update({ error_message: "[2/5] Extraction IA du document..." }).eq("id", analysisId);

    // ============ PHASE 1: EXTRACTION ============
    let extracted: ExtractedData;

    try {
      console.log("--- PHASE 1: EXTRACTION (UN SEUL APPEL IA) ---");

      if (cachedExtractedData) {
        // ── Chemin cache : données déjà extraites, pas d'appel Gemini ──────────
        extracted = cachedExtractedData;
        console.log("Phase 1: Cache hit — Gemini ignoré, type:", extracted.type_document);
      } else {
        // ── Chemin standard : extraction via Gemini ───────────────────────────
        if (extractionId) {
          await supabase
            .from("document_extractions")
            .update({ status: "extracting", ocr_status: "extracting" })
            .eq("id", extractionId);
        }

        // Promise.race : timeout dur 90s (execution_timeout_s = 150 dans config.toml).
        // AbortController seul ne suffit pas — response.json() peut hanger après réception des headers.
        // 90s laisse ~50s de marge pour le setup + les phases 3-5 dans la fenêtre de 150s.
        const hardTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new PipelineError({
            status: 504,
            code: "AI_TIMEOUT",
            publicMessage: "Le service d'analyse a mis trop de temps à répondre. Veuillez réessayer.",
          })), 90_000)
        );
        extracted = await Promise.race([
          extractDataFromDocument(uint8Array, mimeType, googleApiKey, domainConfig),
          hardTimeout,
        ]);

        // Update status to extracted with ocr_status = success
        if (extractionId) {
          const { error: ocrUpdateError } = await supabase
            .from("document_extractions")
            .update({
              status: "extracted",
              ocr_status: "success",
              provider: "gemini_ai",
              ocr_used: true,
              raw_text: JSON.stringify(extracted),
              text_length: JSON.stringify(extracted).length,
              ocr_debug: {
                ocr_provider: "gemini_ai",
                ocr_reason: "direct_ai_extraction",
                request_id: requestId,
                pages_total: 1,
                pages_used: 1,
              },
            })
            .eq("id", extractionId);

          if (ocrUpdateError) {
            console.error("Failed to update document_extractions ocr_status:", ocrUpdateError);
            const { error: retryError } = await supabase
              .from("document_extractions")
              .update({ ocr_status: "success" })
              .eq("id", extractionId);
            if (retryError) {
              console.error("Retry failed for ocr_status update:", retryError);
            }
          }
        }
      }

      // Handle rejected documents (facture)
      if (extracted.type_document === "facture") {
        if (extractionId) {
          await supabase
            .from("document_extractions")
            .update({
              status: "parsed",
              ocr_status: "success",
              parser_status: "success",
              qtyref_status: "success",
            })
            .eq("id", extractionId);
        }

        await supabase
          .from("analyses")
          .update({
            status: "completed",
            score: null,
            resume: "Document non conforme : facture détectée",
            points_ok: [],
            alertes: ["Ce document est une facture, pas un devis. VerifierMonDevis.fr analyse uniquement des devis, c'est-à-dire des documents émis AVANT réalisation des travaux."],
            recommandations: ["Veuillez transmettre un devis pour bénéficier de l'analyse."],
            raw_text: JSON.stringify({ type_document: "facture", extracted, document_detection: { type: "facture", analysis_mode: "rejected" } }),
          })
          .eq("id", analysisId);

        return new Response(
          JSON.stringify({ success: true, analysisId, score: null, message: "Document non conforme (facture)" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (extracted.type_document === "autre") {
        if (extractionId) {
          await supabase
            .from("document_extractions")
            .update({
              status: "parsed",
              ocr_status: "success",
              parser_status: "success",
              qtyref_status: "success",
            })
            .eq("id", extractionId);
        }

        await supabase
          .from("analyses")
          .update({
            status: "completed",
            score: null,
            resume: "Document non conforme",
            points_ok: [],
            alertes: ["Le document transmis ne correspond pas à un devis de travaux. Veuillez transmettre un devis conforme pour bénéficier de l'analyse."],
            recommandations: ["VerifierMonDevis.fr analyse les devis de travaux de rénovation, construction, plomberie, électricité, etc."],
            raw_text: JSON.stringify({ type_document: "autre", extracted, document_detection: { type: "autre", analysis_mode: "rejected" } }),
          })
          .eq("id", analysisId);

        return new Response(
          JSON.stringify({ success: true, analysisId, score: null, message: "Document non conforme" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

    } catch (error) {
      console.error("Extraction failed:", error);

      const publicMessage = isPipelineError(error) ? error.publicMessage : "Impossible de lire le contenu du fichier";
      const statusCode = isPipelineError(error) ? error.status : 500;
      const errorCode = isPipelineError(error) ? error.code : "EXTRACTION_FAILED";

      if (extractionId) {
        await supabase
          .from("document_extractions")
          .update({
            status: "failed",
            ocr_status: "failed",
            error_code: errorCode,
            error_details: { message: publicMessage },
          })
          .eq("id", extractionId);
      }

      await supabase
        .from("analyses")
        .update({ status: "failed", error_message: publicMessage })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({ error: errorCode, message: publicMessage }),
        { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ PHASE 1.5: SUMMARIZE WORK ITEMS ============
    await supabase.from("analyses").update({ error_message: "[2.5/5] Résumé des postes..." }).eq("id", analysisId);
    console.log("--- PHASE 1.5: SUMMARIZE WORK ITEMS ---");

    const workItemSummaries = await summarizeWorkItems(extracted.travaux, googleApiKey);
    console.log("[Summarize] Generated", workItemSummaries.length, "summaries");

    // Insert work items into analysis_work_items table
    if (workItemSummaries.length > 0) {
      const rows = workItemSummaries.map((item) => ({
        analysis_id: analysisId,
        description: item.description,
        category: item.category,
        amount_ht: item.amount_ht,
        quantity: item.quantity,
        unit: item.unit,
      }));

      const { error: insertError } = await supabase
        .from("analysis_work_items")
        .insert(rows);

      if (insertError) {
        console.error("[WorkItems] Insert error:", insertError);
      } else {
        console.log("[WorkItems] Inserted", rows.length, "work items");
      }
    }

    // ============ PHASE 2: VÉRIFICATION (APIs - SANS IA) + PRIX MARCHÉ en parallèle ============
    await supabase.from("analyses").update({ error_message: "[3/5] Vérifications entreprise..." }).eq("id", analysisId);
    console.log("--- PHASE 2: VÉRIFICATION (APIs conditionnées) + PRIX MARCHÉ ---");

    if (extractionId) {
      await supabase
        .from("document_extractions")
        .update({ status: "parsing", parser_status: "parsing" })
        .eq("id", extractionId);
    }

    // Build full work item inputs for market price lookup
    // Use ORIGINAL libelle from PDF (not Gemini summaries) so frontend displays exact devis text
    const priceWorkItems: WorkItemFull[] = extracted.travaux.map((t) => ({
      description: t.libelle,
      category: t.categorie || null,
      amount_ht: t.montant,
      quantity: t.quantite,
      unit: t.unite || null,
    }));

    // Call verifyData and market price lookup in parallel
    const marketPricePromise: Promise<JobTypePriceResult[]> = skipN8N
      ? Promise.resolve([])
      : lookupMarketPrices(supabase, priceWorkItems, googleApiKey, domainConfig);

    const [verifyResult, marketPriceResult] = await Promise.allSettled([
      verifyData(extracted, supabase),
      marketPricePromise,
    ]);

    // If verifyData failed, re-throw (preserve current behavior)
    if (verifyResult.status === "rejected") {
      throw verifyResult.reason;
    }
    const verified = verifyResult.value;

    // Market prices: job type results from Gemini + Supabase
    const jobTypePrices: JobTypePriceResult[] =
      marketPriceResult.status === "fulfilled"
        ? marketPriceResult.value
        : [];
    if (marketPriceResult.status === "rejected") {
      console.warn("[MarketPrices] Promise rejected:", marketPriceResult.reason);
    }
    if (skipN8N) {
      console.log("[MarketPrices] Skipped for anonymous user");
    }
    console.log("[MarketPrices] Job types:", jobTypePrices.length,
      "with prices:", jobTypePrices.filter(jt => jt.prices.length > 0).length);

    // Store market price data and job_type_group per work item
    if (jobTypePrices.length > 0) {
      const { data: insertedItems } = await supabase
        .from("analysis_work_items")
        .select("id")
        .eq("analysis_id", analysisId)
        .order("created_at", { ascending: true });

      if (insertedItems) {
        // Batch all work item updates in parallel (avoid N+1)
        const updatePromises: Promise<unknown>[] = [];
        for (const jt of jobTypePrices) {
          for (const idx of jt.workItemIndices) {
            if (idx < insertedItems.length) {
              const updateData: Record<string, unknown> = {
                job_type_group: jt.job_type_label,
              };
              if (jt.prices.length > 0) {
                updateData.n8n_response = jt.prices;
              }
              updatePromises.push(
                supabase
                  .from("analysis_work_items")
                  .update(updateData)
                  .eq("id", insertedItems[idx].id)
              );
            }
          }
        }
        await Promise.all(updatePromises);
        console.log("[MarketPrices] Stored job_type_group and responses for", updatePromises.length, "work items");
      }
    }

    // Build n8n_price_data for frontend — new hierarchical format per job type
    const n8nPriceDataForFrontend = jobTypePrices.map((jt) => ({
      job_type_label: jt.job_type_label,
      catalog_job_types: jt.catalog_job_types,
      main_unit: jt.main_unit,
      main_quantity: jt.main_quantity,
      devis_lines: jt.devis_lines,
      devis_total_ht: jt.devis_total_ht,
      prices: jt.prices,
    }));

    // ============ STRATEGIC SCORES (IVP/IPI) — non-bloquant ============
    let strategicScores: ReturnType<typeof computeStrategicScores> | null = null;
    try {
      // Construire les items pondérés depuis jobTypePrices
      const weightedItems: StrategicItem[] = [];
      for (const jt of jobTypePrices) {
        if (jt.catalog_job_types.length === 0) continue;
        const weightPerType = jt.devis_total_ht / jt.catalog_job_types.length;
        for (const jobType of jt.catalog_job_types) {
          weightedItems.push({ job_type: jobType, weight_ht: weightPerType });
        }
      }

      const uniqueJobTypes = [...new Set(weightedItems.map((i) => i.job_type))];
      console.log(`[StrategicScores] ${uniqueJobTypes.length} job_type(s) à scorer:`, uniqueJobTypes);

      if (uniqueJobTypes.length > 0) {
        const { data: matrixRows, error: matrixError } = await supabase
          .from("strategic_matrix")
          .select("*")
          .in("job_type", uniqueJobTypes);

        if (matrixError) {
          console.warn("[StrategicScores] Erreur requête strategic_matrix:", matrixError.message);
        } else if (matrixRows && matrixRows.length > 0) {
          console.log(`[StrategicScores] ${matrixRows.length} ligne(s) trouvée(s) dans strategic_matrix`);
          strategicScores = computeStrategicScores(weightedItems, matrixRows as StrategicRow[]);
          console.log(`[StrategicScores] IVP=${strategicScores.ivp_score} IPI=${strategicScores.ipi_score} label="${strategicScores.label}"`);
        } else {
          console.log("[StrategicScores] Aucune ligne trouvée dans strategic_matrix pour ces job_types");
        }
      } else {
        console.log("[StrategicScores] Aucun catalog_job_type disponible (skipN8N ou groupe Autre uniquement)");
      }
    } catch (strategicError) {
      console.warn("[StrategicScores] Erreur non-bloquante:", strategicError instanceof Error ? strategicError.message : strategicError);
      strategicScores = null;
    }

    // ============ SNAPSHOT PRICE OBSERVATIONS (gold data) ============
    if (jobTypePrices.length > 0 && analysis.user_id) {
      const zipCode = extracted.client?.code_postal || null;
      const obsRows = jobTypePrices
        .filter((jt) => jt.catalog_job_types.length > 0) // skip "Autre" group
        .map((jt) => ({
          analysis_id: analysisId,
          user_id: analysis.user_id,
          job_type_label: jt.job_type_label,
          catalog_job_types: jt.catalog_job_types,
          main_unit: jt.main_unit || "forfait",
          main_quantity: jt.main_quantity || 1,
          devis_total_ht: jt.devis_total_ht,
          line_count: jt.devis_lines.length,
          devis_lines: jt.devis_lines.map((l) => ({
            description: l.description,
            amount_ht: l.amount_ht,
            quantity: l.quantity,
            unit: l.unit,
          })),
          zip_code: zipCode,
          domain: domainConfig.domain,
        }));

      if (obsRows.length > 0) {
        const { error: obsError } = await supabase
          .from("price_observations")
          .insert(obsRows);
        if (obsError) {
          console.error("[PriceObservations] Insert error:", obsError.message);
        } else {
          console.log("[PriceObservations] Inserted", obsRows.length, "observations");
        }
      }
    }

    // ============ PHASE 3: SCORING DÉTERMINISTE (SANS IA) ============
    await supabase.from("analyses").update({ error_message: "[4/5] Calcul du score..." }).eq("id", analysisId);
    console.log("--- PHASE 3: SCORING DÉTERMINISTE ---");
    const scoring = calculateScore(extracted, verified, domainConfig);

    // ============ PHASE 4: RENDER ============
    await supabase.from("analyses").update({ error_message: "[5/5] Génération du rapport..." }).eq("id", analysisId);
    console.log("--- PHASE 4: RENDER ---");
    const output = renderOutput(extracted, verified, scoring, domainConfig);

    console.log("=== PIPELINE COMPLETE ===");
    console.log("Final score:", scoring.score_global);
    console.log("Critères rouges:", scoring.criteres_rouges);
    console.log("Critères oranges:", scoring.criteres_oranges.length);

    // Update extraction record to parsed
    if (extractionId) {
      const detectedUnits = [...new Set(extracted.travaux.map(t => t.unite).filter(Boolean))];
      const sampleLines = extracted.travaux.slice(0, 5).map(t => ({
        description: t.libelle,
        qty: t.quantite,
        unit: t.unite,
        total: t.montant,
      }));

      await supabase
        .from("document_extractions")
        .update({
          status: "parsed",
          parser_status: "success",
          qtyref_status: verified.comparaisons_prix.length > 0 ? "success" : "failed",
          parser_debug: {
            version: "1.0",
            travaux_count: extracted.travaux.length,
            totaux_detected: extracted.totaux.ttc !== null,
          },
          qty_ref_debug: {
            comparisons_count: verified.comparaisons_prix.length,
            rge_checked: verified.rge_pertinent,
            qty_ref_detected: extracted.travaux.some(t => t.quantite && t.quantite > 0),
          },
          sample_lines: sampleLines,
          detected_units_set: detectedUnits as string[],
          qtyref_candidates: verified.comparaisons_prix.length > 0 ? verified.comparaisons_prix : null,
          qtyref_failure_reason: verified.comparaisons_prix.length === 0 ? "no_price_comparisons" : null,
        })
        .eq("id", extractionId);
    }

    // Store debug data
    const rawDataForDebug = JSON.stringify({
      type_document: extracted.type_document,
      extracted,
      verified,
      scoring,
      document_detection: { type: extracted.type_document, analysis_mode: "full" },
      n8n_price_data: n8nPriceDataForFrontend,
      strategic_scores: strategicScores,
    });

    // Update the analysis with results
    const { error: updateError } = await supabase
      .from("analyses")
      .update({
        status: "completed",
        score: scoring.score_global,
        resume: extracted.resume_factuel,
        points_ok: output.points_ok,
        alertes: output.alertes,
        recommandations: output.recommandations,
        raw_text: rawDataForDebug,
        types_travaux: output.types_travaux.length > 0 ? output.types_travaux : null,
        error_message: null,
      })
      .eq("id", analysisId);

    if (updateError) {
      console.error("Update error (possible trigger block):", updateError);

      // Si le trigger bloque à cause de ocr_status, forcer ocr_status=success et réessayer
      if (String(updateError.message || "").includes("COMPLETED_WITHOUT_OCR_SUCCESS") && extractionId) {
        console.log("Trigger blocked completion - forcing ocr_status=success and retrying...");
        await supabase
          .from("document_extractions")
          .update({ ocr_status: "success", parser_status: "success", qtyref_status: "success" })
          .eq("id", extractionId);

        const { error: retryError } = await supabase
          .from("analyses")
          .update({
            status: "completed",
            score: scoring.score_global,
            resume: extracted.resume_factuel,
            points_ok: output.points_ok,
            alertes: output.alertes,
            recommandations: output.recommandations,
            raw_text: rawDataForDebug,
            types_travaux: output.types_travaux.length > 0 ? output.types_travaux : null,
            error_message: null,
          })
          .eq("id", analysisId);

        if (!retryError) {
          console.log("Retry succeeded after forcing ocr_status");
          return new Response(
            JSON.stringify({
              success: true,
              analysisId,
              score: scoring.score_global,
              companyVerified: verified.entreprise_immatriculee === true,
              message: "Analyse terminée avec succès (retry après trigger)",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        console.error("Retry also failed:", retryError);
      }

      // Marquer en erreur plutôt que laisser en "processing" pour toujours
      await supabase
        .from("analyses")
        .update({ status: "error", error_message: "Erreur lors de la sauvegarde des résultats. Veuillez relancer l'analyse." })
        .eq("id", analysisId);

      return new Response(
        JSON.stringify({ error: "Failed to save analysis results", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ LINKED DOCUMENT — shared by PAYMENT EVENTS and ENRICH blocks ============
    const { data: docLinked } = await supabase
      .from("documents_chantier")
      .select("id, chantier_id, document_type, lot_id")
      .eq("analyse_id", analysisId)
      .maybeSingle();

    // ============ PAYMENT EVENTS — génération timeline de paiement ============
    // Déclenché après la sauvegarde réussie de l'analyse.
    // Non-bloquant : les erreurs sont loggées mais n'échouent pas le pipeline.
    try {

      if (docLinked?.chantier_id) {
        const conditions = extracted.paiement?.conditions_paiement ?? [];
        const totalAmount = extracted.totaux?.ttc ?? extracted.totaux?.ht ?? null;

        if (Array.isArray(conditions) && conditions.length > 0) {
          const today = new Date().toISOString().slice(0, 10);
          const addDays = (base: string, days: number) => {
            const d = new Date(base);
            d.setDate(d.getDate() + days);
            return d.toISOString().slice(0, 10);
          };

          const sourceType: "devis" | "facture" =
            docLinked.document_type === "facture" ? "facture" : "devis";

          const events = (conditions as Array<Record<string, unknown>>)
            .filter((c) => c && typeof c === "object")
            .map((cond) => {
              // ── Montant ────────────────────────────────────────────────
              let amount: number | null = null;
              if (typeof cond.amount === "number" && (cond.amount as number) > 0) {
                amount = cond.amount as number;
              } else if (
                typeof cond.percentage === "number" &&
                (cond.percentage as number) > 0 &&
                totalAmount !== null
              ) {
                amount = Math.round(((cond.percentage as number) * (totalAmount as number)) / 100 * 100) / 100;
              }

              // ── Date d'échéance ────────────────────────────────────────
              let dueDate: string | null = null;
              const lbl = typeof cond.label === "string" ? cond.label.toLowerCase() : "";
              switch (cond.due_type) {
                case "date":
                  dueDate = typeof cond.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(cond.due_date as string)
                    ? cond.due_date as string : null;
                  break;
                case "delay":
                  if (typeof cond.delay_days === "number" && (cond.delay_days as number) >= 0)
                    dueDate = addDays(today, cond.delay_days as number);
                  break;
                case "milestone":
                  if (/signature|commande|acceptation/.test(lbl)) dueDate = today;
                  else if (/début|démarrage|chantier/.test(lbl))  dueDate = addDays(today, 7);
                  else if (/réception|livraison|fin\b|achèvement/.test(lbl)) dueDate = addDays(today, 30);
                  else dueDate = addDays(today, 14);
                  break;
              }

              const eventId = crypto.randomUUID();
              const label = typeof cond.label === "string" && cond.label.trim()
                ? cond.label.trim()
                : `${cond.type ?? "échéance"}`;

              return {
                id:          eventId,
                project_id:  docLinked.chantier_id,
                source_type: sourceType,
                source_id:   docLinked.id,
                amount,
                due_date:    dueDate,
                status:      "pending",
                is_override: false,
                label,
              };
            });

          if (events.length > 0) {
            // PR4 : écriture cashflow_terms uniquement (payment_events legacy
            // est en lecture-seule jusqu'au drop PR5).
            const cashflow_terms = [...events]
              .sort((a, b) => {
                const da = a.due_date ?? "\uffff";
                const db = b.due_date ?? "\uffff";
                if (da !== db) return da < db ? -1 : 1;
                return a.id.localeCompare(b.id);
              })
              .map(e => ({
                event_id: e.id,
                amount:   e.amount,
                due_date: e.due_date,
                status:   e.status,
                label:    e.label,
              }));

            const { error: termsErr } = await supabase
              .from("documents_chantier")
              .update({ cashflow_terms })
              .eq("id", docLinked.id);
            if (termsErr) {
              console.error("[PaymentEvents] cashflow_terms write error:", termsErr.message);
            } else {
              console.log(`[PaymentEvents] cashflow_terms écrits — ${cashflow_terms.length} terms`);
            }
          }
        }
      }
    } catch (paymentErr) {
      console.error("[PaymentEvents] erreur inattendue:", paymentErr instanceof Error ? paymentErr.message : paymentErr);
    }

    // ============ ENRICH DOCUMENT NAME + LOT MISMATCH CHECK ============
    // After successful analysis, write back the artisan name + summary to documents_chantier.nom.
    // This enables lot mismatch detection even for opaque filenames (xy.pdf, scan123.pdf).
    // Zero additional AI cost — reuses data already extracted by this pipeline.
    try {
      if (docLinked?.id) {
        const artisanNom = extracted.entreprise?.nom ?? '';
        const resume = extracted.resume_factuel ?? '';
        const enrichedNom = artisanNom
          ? `${artisanNom}${resume ? ' — ' + resume.slice(0, 60) : ''}`
          : resume ? resume.slice(0, 80) : null;

        // Write back montant TTC (or HT) to documents_chantier — needed for budget header
        const devisMontant = extracted.totaux?.ttc ?? extracted.totaux?.ht ?? null;
        const docUpdate: Record<string, unknown> = {};
        if (enrichedNom) docUpdate.nom = enrichedNom.slice(0, 100);
        if (devisMontant != null && devisMontant > 0) docUpdate.montant = devisMontant;

        if (Object.keys(docUpdate).length > 0) {
          await supabase
            .from("documents_chantier")
            .update(docUpdate)
            .eq("id", docLinked.id);

          // Check lot mismatch with the enriched name
          if (docLinked.lot_id) {
            const { data: lotData } = await supabase
              .from("lots_chantier")
              .select("nom")
              .eq("id", docLinked.lot_id)
              .single();

            if (lotData) {
              // Simple keyword-based type detection (same logic as frontend detectDevisType)
              // Partial copy of src/utils/extractProjectElements.ts LOT_TYPE_MAP (57 full keywords → 17 types).
              // This Deno version uses ~40 prefix stems for the same coverage. Update both if adding types.
              // Deno edge functions cannot import from src/ — this is an intentional copy.
              const LOT_KEYWORDS: Record<string, string> = {
                menuiserie: "fenetres", menuisier: "fenetres", fenetre: "fenetres", vitr: "fenetres",
                baie: "fenetres", volet: "fenetres", vitrage: "fenetres", survitrage: "fenetres",
                plombi: "plomberie", plombier: "plomberie", chauffag: "plomberie", chaudier: "plomberie",
                electri: "electricite", tableau: "electricite", eclairag: "electricite",
                macon: "maconnerie", maconnerie: "maconnerie", beton: "maconnerie", parpaing: "maconnerie",
                carrelag: "carrelage", carreleur: "carrelage", parquet: "carrelage",
                peintur: "peinture", peintre: "peinture", ravalement: "peinture",
                toitur: "toiture", couvreur: "toiture", charpent: "toiture", toit: "toiture",
                ardoise: "toiture", tuile: "toiture",
                isolat: "isolation", isolant: "isolation",
                terras: "terrasse", deck: "terrasse", dalle: "terrasse",
                cuisin: "cuisine",
                portail: "portail", portillon: "portail",
                cloture: "cloture", grillage: "cloture",
                piscine: "piscine", bassin: "piscine",
                pergola: "pergola", veranda: "pergola",
                salle: "salle_bain", sanitaire: "salle_bain",
                terrassier: "terrassement", terrassement: "terrassement",
                amenagement: "amenagement",
              };

              function detectType(text: string): string {
                const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                for (const [kw, type] of Object.entries(LOT_KEYWORDS)) {
                  if (lower.includes(kw)) return type;
                }
                return "autre";
              }

              const docType = detectType(enrichedNom ?? '');
              const lotType = detectType(lotData.nom);

              if (docType !== "autre" && lotType !== "autre" && docType !== lotType) {
                await supabase.from("agent_insights").insert({
                  chantier_id: docLinked.chantier_id,
                  user_id: analysis.user_id,
                  type: "risk_detected",
                  severity: "warning",
                  title: `Affectation douteuse : "${enrichedNom.slice(0, 40)}" dans lot "${lotData.nom}"`,
                  body: `Après analyse du contenu, ce devis semble concerner "${docType}" mais est affecté au lot "${lotData.nom}" (${lotType}). Vérifiez l'affectation.`,
                  source_event: { check: "lot_mismatch_post_analysis", document_id: docLinked.id, detected_type: docType, lot_type: lotType },
                });
                console.log(`[LotMismatch] "${enrichedNom.slice(0, 30)}" (${docType}) in lot "${lotData.nom}" (${lotType})`);
              }
            }
          }
        }
      }
      // ── Fire agent-orchestrator after devis content extraction ──
      if (docLinked?.chantier_id) {
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/agent-orchestrator`, {
          method: "POST",
          headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
          body: JSON.stringify({ chantier_id: docLinked.chantier_id, run_type: "morning" }),
        }).catch(() => {});
      }
    } catch (enrichErr) {
      console.error("[EnrichDocName] non-blocking error:", enrichErr instanceof Error ? enrichErr.message : enrichErr);
    }

    // ============ PURGE OLD ANALYSES (keep max 10 — or 30 for premium/admin) ============
    if (analysis.user_id) {
      try {
        // Déterminer la limite selon le statut de l'utilisateur
        let maxAnalyses = 10;

        // Vérifier abonnement actif (Pass Sérénité)
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("status")
          .eq("user_id", analysis.user_id)
          .single();
        if (sub?.status === "active") maxAnalyses = 30;

        // Vérifier rôle admin (toujours 30 quelle que soit la souscription)
        if (maxAnalyses < 30) {
          const { data: role } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", analysis.user_id)
            .single();
          if (role?.role === "admin") maxAnalyses = 30;
        }

        const { data: oldAnalyses } = await supabase
          .from("analyses")
          .select("id, file_path")
          .eq("user_id", analysis.user_id)
          .order("created_at", { ascending: false })
          .range(maxAnalyses, 999);

        if (oldAnalyses && oldAnalyses.length > 0) {
          const candidateIds = oldAnalyses.map((a) => a.id);

          // ── Protection : ne jamais purger les analyses liées à un document de chantier ──
          // Ces analyses sont sauvegardées volontairement par l'utilisateur dans son espace
          // chantier. La purge ne s'applique qu'aux analyses "autonomes" du tableau de bord.
          const { data: linkedDocs } = await supabase
            .from("documents_chantier")
            .select("analyse_id")
            .in("analyse_id", candidateIds);

          const protectedIds = new Set(
            (linkedDocs ?? []).map((d: any) => d.analyse_id).filter(Boolean)
          );

          const idsToDelete = candidateIds.filter((id) => !protectedIds.has(id));

          if (idsToDelete.length > 0) {
            // Delete stored files for unprotected analyses only
            const filePaths = oldAnalyses
              .filter((a) => idsToDelete.includes(a.id))
              .map((a) => a.file_path)
              .filter(Boolean);
            if (filePaths.length > 0) {
              await supabase.storage.from("devis").remove(filePaths);
            }
            // Delete analyses (CASCADE deletes analysis_work_items + document_extractions)
            // price_observations survives (no FK)
            await supabase.from("analyses").delete().in("id", idsToDelete);
            console.log(
              "[Purge] Deleted", idsToDelete.length, "unlinked analyses",
              "| protected (chantier-linked):", protectedIds.size,
              "| limit:", maxAnalyses,
              "| user:", analysis.user_id,
            );
          } else {
            console.log(
              "[Purge] All candidates protected (linked to chantier documents)",
              "| count:", protectedIds.size,
            );
          }
        }
      } catch (purgeError) {
        // Non-blocking: don't fail the pipeline if purge fails
        console.error("[Purge] Error:", purgeError instanceof Error ? purgeError.message : purgeError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        analysisId,
        score: scoring.score_global,
        companyVerified: verified.entreprise_immatriculee === true,
        message: "Analyse terminée avec succès",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    const errorMsg = error instanceof Error ? error.message : "Erreur inattendue lors de l'analyse";

    if (analysisId) {
      try {
        const errorSupabase = createClient(supabaseUrl, supabaseServiceKey);
        await errorSupabase
          .from("analyses")
          .update({ status: "error", error_message: errorMsg })
          .eq("id", analysisId);
      } catch (cleanupError) {
        console.error("Failed to update analysis status on error:", cleanupError);
      }
    }

    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
