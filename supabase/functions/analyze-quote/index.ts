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

    if (!analysisId) {
      return new Response(
        JSON.stringify({ error: "analysisId is required" }),
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
        .select()
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

    // Convert to base64 for AI extraction
    const chunkSize = 8192;
    let binaryString = "";
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      binaryString += String.fromCharCode(...chunk);
    }
    const base64Content = btoa(binaryString);

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

      if (extractionId) {
        await supabase
          .from("document_extractions")
          .update({ status: "extracting", ocr_status: "extracting" })
          .eq("id", extractionId);
      }

      extracted = await extractDataFromDocument(base64Content, mimeType, googleApiKey, domainConfig);

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
        for (const jt of jobTypePrices) {
          for (const idx of jt.workItemIndices) {
            if (idx < insertedItems.length) {
              const updateData: Record<string, unknown> = {
                job_type_group: jt.job_type_label,
              };
              if (jt.prices.length > 0) {
                updateData.n8n_response = jt.prices;
              }
              await supabase
                .from("analysis_work_items")
                .update(updateData)
                .eq("id", insertedItems[idx].id);
            }
          }
        }
        console.log("[MarketPrices] Stored job_type_group and responses for work items");
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

    // ============ PURGE OLD ANALYSES (keep max 10 per user) ============
    if (analysis.user_id) {
      try {
        const { data: oldAnalyses } = await supabase
          .from("analyses")
          .select("id, file_path")
          .eq("user_id", analysis.user_id)
          .order("created_at", { ascending: false })
          .range(10, 999);

        if (oldAnalyses && oldAnalyses.length > 0) {
          const idsToDelete = oldAnalyses.map((a) => a.id);
          // Delete stored files
          const filePaths = oldAnalyses.map((a) => a.file_path).filter(Boolean);
          if (filePaths.length > 0) {
            await supabase.storage.from("devis").remove(filePaths);
          }
          // Delete analyses (CASCADE deletes analysis_work_items + document_extractions)
          // price_observations survives (no FK)
          await supabase.from("analyses").delete().in("id", idsToDelete);
          console.log("[Purge] Deleted", idsToDelete.length, "old analyses for user", analysis.user_id);
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
