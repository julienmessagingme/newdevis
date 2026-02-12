import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============ TYPE DEFINITIONS ============

interface ExtractionResult {
  raw_text: string;
  blocks: TextBlock[];
  pages_count: number;
  quality_score: number;
  provider: "pdf_text" | "textract" | "gemini_ai";
  provider_calls: ProviderCall[];
  cache_hit: boolean;
  file_hash: string;
  text_length: number;
  contains_table_signals: boolean;
  ocr_reason: string;
  request_id: string;
  ocr_debug: OcrDebug;
  textract_debug: TextractDebug | null;
  pages_used_list: number[];
  text_length_by_page: PageTextLength[];
}

interface OcrDebug {
  ocr_provider: string;
  ocr_reason: string;
  sha256: string;
  pages_total: number;
  pages_used: number;
  pages_used_list: number[];
  text_length_total: number;
  text_length_by_page: PageTextLength[];
  cache_hit: boolean;
  provider_calls: ProviderCall[];
}

interface TextractDebug {
  textract_job_id: string | null;
  textract_mode: string;
  textract_pages_returned: number;
  textract_blocks_count: number;
  textract_tables_count: number;
  textract_cells_count: number;
  textract_warning: string | null;
}

interface PageTextLength {
  page: number;
  length: number;
}

interface TextBlock {
  text: string;
  confidence?: number;
  block_type?: string;
  page?: number;
  geometry?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

interface ProviderCall {
  provider: string;
  latency_ms: number;
  pages_used: number;
  success: boolean;
  error?: string;
}

// ============ HELPER: SHA-256 HASH ============

async function computeFileHash(data: Uint8Array): Promise<string> {
  const buffer = data.buffer instanceof ArrayBuffer ? data.buffer : new ArrayBuffer(data.byteLength);
  if (!(data.buffer instanceof ArrayBuffer)) {
    new Uint8Array(buffer).set(data);
  }
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============ HELPER: PDF TEXT EXTRACTION ============

interface PdfExtractionResult {
  text: string;
  quality: number;
  text_length: number;
  contains_table_signals: boolean;
}

// Detect table signals in text (columns like Qté, PU, Total, Désignation, etc.)
function detectTableSignals(text: string): boolean {
  const tablePatterns = [
    /\b(?:Qté|Quantité|Qt[eé])\b.*\b(?:PU|Prix\s*unitaire|P\.U\.)\b.*\b(?:Total|Montant)\b/i,
    /\b(?:Désignation|Description|Libellé)\b.*\b(?:Qté|Quantité)\b/i,
    /\d+[,.]?\d*\s+\d+[,.]?\d*\s+\d+[,.]?\d*\s*€?/,
    /\d+[,.]?\d{2}\s*€?\s*\/\s*(?:m²|ml|u|h|forfait)/i,
    /(?:[\d,]+\s*€?\s+){2,}/,
    /(?:Réf|Référence)\s.*(?:Qté|Quantité)\s.*(?:Prix|Montant)/i,
    /(?:Montant\s*HT|Total\s*HT)\s.*(?:TVA|Taux)\s.*(?:TTC|Total\s*TTC)/i,
  ];
  
  return tablePatterns.some(pattern => pattern.test(text));
}

async function extractPdfText(fileData: Uint8Array): Promise<PdfExtractionResult> {
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const pdfString = decoder.decode(fileData);
  
  const textMatches: string[] = [];
  const btEtRegex = /BT\s*([\s\S]*?)\s*ET/g;
  let match;
  
  while ((match = btEtRegex.exec(pdfString)) !== null) {
    const textBlock = match[1];
    const tjRegex = /\(([^)]*)\)\s*T[jJ]/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(textBlock)) !== null) {
      textMatches.push(tjMatch[1]);
    }
  }
  
  const textContent = textMatches.join(' ').replace(/\s+/g, ' ').trim();
  
  const rawTextPatterns = [
    /(?:DEVIS|FACTURE|TOTAL|HT|TTC|TVA|€|\d+[,\.]\d{2})/gi,
    /(?:SIRET|SIREN)[\s:]*\d{9,14}/gi,
    /[A-Z][a-zéèêëàâäîïôöûü]+(?:\s+[A-Z][a-zéèêëàâäîïôöûü]+)*/g,
  ];
  
  let additionalText = '';
  for (const pattern of rawTextPatterns) {
    const matches = pdfString.match(pattern);
    if (matches) {
      additionalText += ' ' + matches.join(' ');
    }
  }
  
  const combinedText = (textContent + ' ' + additionalText).replace(/\s+/g, ' ').trim();
  const textLength = combinedText.length;
  const containsTableSignals = detectTableSignals(combinedText);
  
  const hasKeywords = /(?:HT|TVA|TTC|Total|DEVIS|FACTURE)/i.test(combinedText);
  const quality = textLength >= 800 && hasKeywords ? 0.7 : (textLength >= 400 ? 0.4 : 0.1);
  
  return { 
    text: combinedText, 
    quality, 
    text_length: textLength,
    contains_table_signals: containsTableSignals,
  };
}

// ============ HELPER: TIMEOUT WRAPPER ============

const TEXTRACT_TIMEOUT_MS = 90000; // 90 seconds

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  let timeoutId: number;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });
  
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

// ============ HELPER: AWS TEXTRACT OCR ============

interface TextractResult {
  text: string;
  blocks: TextBlock[];
  pages: number;
  textract_debug: TextractDebug;
}

async function extractWithTextract(
  fileData: Uint8Array,
  mimeType: string,
  maxPages: number = 2
): Promise<TextractResult> {
  const awsAccessKey = Deno.env.get("AWS_ACCESS_KEY_ID");
  const awsSecretKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
  const awsRegion = Deno.env.get("AWS_REGION") || "eu-west-1";
  
  if (!awsAccessKey || !awsSecretKey) {
    throw new Error("AWS credentials not configured");
  }
  
  const chunkSize = 8192;
  let binaryString = "";
  for (let i = 0; i < fileData.length; i += chunkSize) {
    const chunk = fileData.subarray(i, Math.min(i + chunkSize, fileData.length));
    binaryString += String.fromCharCode(...chunk);
  }
  const base64Content = btoa(binaryString);
  
  const service = "textract";
  const host = `${service}.${awsRegion}.amazonaws.com`;
  const endpoint = `https://${host}`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);
  
  const requestBody = JSON.stringify({
    Document: {
      Bytes: base64Content
    }
  });
  
  const canonicalUri = "/";
  const canonicalQuerystring = "";
  const contentType = "application/x-amz-json-1.1";
  const amzTarget = "Textract.DetectDocumentText";
  
  const payloadHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(requestBody));
  const payloadHashHex = Array.from(new Uint8Array(payloadHash)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  const canonicalHeaders = [
    `content-type:${contentType}`,
    `host:${host}`,
    `x-amz-date:${amzDate}`,
    `x-amz-target:${amzTarget}`,
  ].join('\n') + '\n';
  
  const signedHeaders = "content-type;host;x-amz-date;x-amz-target";
  
  const canonicalRequest = [
    "POST",
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHashHex
  ].join('\n');
  
  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${awsRegion}/${service}/aws4_request`;
  
  const canonicalRequestHash = await crypto.subtle.digest(
    "SHA-256", 
    new TextEncoder().encode(canonicalRequest)
  );
  const canonicalRequestHashHex = Array.from(new Uint8Array(canonicalRequestHash))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    canonicalRequestHashHex
  ].join('\n');
  
  async function hmacSha256(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
    let keyBuffer: ArrayBuffer;
    if (key instanceof ArrayBuffer) {
      keyBuffer = key;
    } else {
      keyBuffer = new ArrayBuffer(key.byteLength);
      new Uint8Array(keyBuffer).set(key);
    }
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBuffer,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  }
  
  const kDate = await hmacSha256(new TextEncoder().encode(`AWS4${awsSecretKey}`), dateStamp);
  const kRegion = await hmacSha256(kDate, awsRegion);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, "aws4_request");
  
  const signature = await hmacSha256(kSigning, stringToSign);
  const signatureHex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  
  const authorizationHeader = `${algorithm} Credential=${awsAccessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signatureHex}`;
  
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "Host": host,
      "X-Amz-Date": amzDate,
      "X-Amz-Target": amzTarget,
      "Authorization": authorizationHeader,
    },
    body: requestBody,
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Textract error: ${response.status} - ${errorText}`);
  }
  
  const result = await response.json();
  
  // Parse Textract response with detailed debug
  const blocks: TextBlock[] = [];
  const textLines: string[] = [];
  let tablesCount = 0;
  let cellsCount = 0;
  let totalBlocksCount = 0;
  
  for (const block of (result.Blocks || [])) {
    totalBlocksCount++;
    
    if (block.BlockType === "TABLE") {
      tablesCount++;
    }
    if (block.BlockType === "CELL") {
      cellsCount++;
    }
    
    if (block.BlockType === "LINE" && block.Text) {
      textLines.push(block.Text);
      blocks.push({
        text: block.Text,
        confidence: block.Confidence,
        block_type: block.BlockType,
        page: block.Page || 1,
        geometry: block.Geometry?.BoundingBox ? {
          left: block.Geometry.BoundingBox.Left,
          top: block.Geometry.BoundingBox.Top,
          width: block.Geometry.BoundingBox.Width,
          height: block.Geometry.BoundingBox.Height,
        } : undefined,
      });
    }
  }
  
  const textractDebug: TextractDebug = {
    textract_job_id: null, // Synchronous API doesn't return job ID
    textract_mode: "DetectDocumentText",
    textract_pages_returned: 1,
    textract_blocks_count: totalBlocksCount,
    textract_tables_count: tablesCount,
    textract_cells_count: cellsCount,
    textract_warning: tablesCount === 0 ? "⚠️ No tables detected by Textract" : null,
  };
  
  return {
    text: textLines.join('\n'),
    blocks,
    pages: 1,
    textract_debug: textractDebug,
  };
}

// ============ HELPER: GEMINI AI OCR FALLBACK ============

async function extractWithGeminiAI(
  base64Content: string,
  mimeType: string
): Promise<{ text: string; blocks: TextBlock[] }> {
  const googleApiKey = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!googleApiKey) {
    throw new Error("GOOGLE_AI_API_KEY not configured");
  }

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${googleApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `Tu es un OCR spécialisé dans l'extraction de texte de documents commerciaux (devis, factures).
Extrais TOUT le texte visible du document, ligne par ligne.
Retourne un JSON avec:
- "lines": tableau de toutes les lignes de texte détectées
- "tables": tableau des tableaux détectés (lignes, colonnes, cellules)

Sois exhaustif et préserve la structure.`
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extrais tout le texte de ce document:" },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Content}` } },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 16000,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Gemini AI error: ${response.status}`);
  }
  
  const result = await response.json();
  const content = result.choices?.[0]?.message?.content || "{}";
  
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { lines: [content] };
  }
  
  const lines = parsed.lines || [];
  const blocks: TextBlock[] = lines.map((line: string, i: number) => ({
    text: line,
    confidence: 0.8,
    block_type: "LINE",
    page: 1,
  }));
  
  return {
    text: lines.join('\n'),
    blocks,
  };
}

// ============ FORCED TEXTRACT MODE COUNTER ============
// For diagnostic: force Textract for next N documents

let forceTextractCounter = 10; // Force for next 10 documents

function shouldForceTextract(): boolean {
  if (forceTextractCounter > 0) {
    forceTextractCounter--;
    return true;
  }
  return false;
}

// ============ MAIN HANDLER ============

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Generate unique request ID for tracing
  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { analysis_id, file_path, freemium_mode = true, force_textract = false } = body;

    if (!analysis_id || !file_path) {
      return new Response(
        JSON.stringify({ error: "Missing analysis_id or file_path", request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("=== EXTRACT-DOCUMENT START ===");
    console.log("Request ID:", requestId);
    console.log("Analysis ID:", analysis_id);
    console.log("File path:", file_path);

    // Check if we should force Textract (debug mode or explicit request)
    const shouldForce = force_textract || shouldForceTextract();
    if (shouldForce) {
      console.log("🔧 FORCE TEXTRACT MODE ENABLED");
    }

    // Download file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("devis")
      .download(file_path);

    if (downloadError || !fileData) {
      return new Response(
        JSON.stringify({ error: "File download failed", request_id: requestId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Compute file hash for caching
    const fileHash = await computeFileHash(uint8Array);
    console.log("File hash:", fileHash);

    // Check cache (skip if force_textract)
    if (!shouldForce) {
      const { data: cached } = await supabase
        .from("document_extractions")
        .select("*")
        .eq("file_hash", fileHash)
        .gt("expires_at", new Date().toISOString())
        .single();

      if (cached) {
        console.log("Cache hit! Returning cached extraction.");
        
        // Link to this analysis if not already
        if (cached.analysis_id !== analysis_id) {
          await supabase
            .from("document_extractions")
            .insert({
              file_hash: fileHash + "_" + analysis_id,
              file_path,
              analysis_id,
              provider: cached.provider,
              ocr_used: cached.ocr_used,
              pages_used: cached.pages_used,
              pages_count: cached.pages_count,
              quality_score: cached.quality_score,
              cache_hit: true,
              raw_text: cached.raw_text,
              blocks: cached.blocks,
              parsed_data: cached.parsed_data,
              qty_ref_detected: cached.qty_ref_detected,
              qty_unit: cached.qty_unit,
              provider_calls: cached.provider_calls,
              request_id: requestId,
              text_length: cached.text_length,
              contains_table_signals: cached.contains_table_signals,
              ocr_reason: cached.ocr_reason,
            });
        }

        return new Response(
          JSON.stringify({
            success: true,
            cache_hit: true,
            request_id: requestId,
            data: {
              raw_text: cached.raw_text,
              blocks: cached.blocks,
              pages_count: cached.pages_count,
              quality_score: cached.quality_score,
              provider: cached.provider,
              file_hash: fileHash,
            }
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log("Cache miss. Extracting...");

    // Determine mime type
    let mimeType = "application/pdf";
    if (file_path.toLowerCase().endsWith(".png")) mimeType = "image/png";
    else if (file_path.toLowerCase().endsWith(".jpg") || file_path.toLowerCase().endsWith(".jpeg")) mimeType = "image/jpeg";
    else if (file_path.toLowerCase().endsWith(".webp")) mimeType = "image/webp";

    const providerCalls: ProviderCall[] = [];
    let finalResult: ExtractionResult | null = null;
    let textractDebug: TextractDebug | null = null;
    
    // Track PDF extraction metrics for decision logic
    let pdfTextLength = 0;
    let pdfContainsTableSignals = false;
    let ocrReason = "unknown";
    let pagesUsedList: number[] = [];
    let textLengthByPage: PageTextLength[] = [];

    // STEP 1: Try PDF text extraction first (for PDFs only, unless force_textract)
    if (mimeType === "application/pdf" && !shouldForce) {
      const startTime = Date.now();
      try {
        const pdfResult = await extractPdfText(uint8Array);
        pdfTextLength = pdfResult.text_length;
        pdfContainsTableSignals = pdfResult.contains_table_signals;
        
        providerCalls.push({
          provider: "pdf_text",
          latency_ms: Date.now() - startTime,
          pages_used: 1,
          success: true,
        });

        textLengthByPage = [{ page: 1, length: pdfTextLength }];

        console.log("PDF text extraction - Length:", pdfTextLength, "Table signals:", pdfContainsTableSignals);

        // STEP 2: Strict rule - stay with pdf_text only if text_length >= 1500 AND contains_table_signals
        if (pdfTextLength >= 1500 && pdfContainsTableSignals) {
          console.log("PDF text OK: length >= 1500 AND table signals detected. Staying with pdf_text.");
          ocrReason = "pdf_text_ok";
          pagesUsedList = [1];
          
          const ocrDebug: OcrDebug = {
            ocr_provider: "pdf_text",
            ocr_reason: ocrReason,
            sha256: fileHash,
            pages_total: 1,
            pages_used: 1,
            pages_used_list: pagesUsedList,
            text_length_total: pdfTextLength,
            text_length_by_page: textLengthByPage,
            cache_hit: false,
            provider_calls: providerCalls,
          };
          
          finalResult = {
            raw_text: pdfResult.text,
            blocks: [{ text: pdfResult.text, block_type: "FULL_TEXT" }],
            pages_count: 1,
            quality_score: pdfResult.quality,
            provider: "pdf_text",
            provider_calls: providerCalls,
            cache_hit: false,
            file_hash: fileHash,
            text_length: pdfTextLength,
            contains_table_signals: pdfContainsTableSignals,
            ocr_reason: ocrReason,
            request_id: requestId,
            ocr_debug: ocrDebug,
            textract_debug: null,
            pages_used_list: pagesUsedList,
            text_length_by_page: textLengthByPage,
          };
        } else {
          // Determine reason for OCR fallback
          if (pdfTextLength < 1500 && !pdfContainsTableSignals) {
            ocrReason = "pdf_text_short_no_table";
          } else if (pdfTextLength < 1500) {
            ocrReason = "pdf_text_short";
          } else {
            ocrReason = "pdf_text_no_table_signals";
          }
          console.log(`PDF text insufficient: ${ocrReason}. Falling back to Textract.`);
        }
      } catch (error) {
        console.error("PDF text extraction failed:", error);
        ocrReason = "pdf_text_failed";
        providerCalls.push({
          provider: "pdf_text",
          latency_ms: Date.now() - startTime,
          pages_used: 0,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    } else if (shouldForce) {
      ocrReason = "forced_textract";
      console.log("Skipping PDF text extraction (forced_textract mode)");
    } else {
      ocrReason = "image_input";
    }

    // STEP 3: Try AWS Textract (if PDF text didn't pass strict criteria, for images, or forced)
    if (!finalResult) {
      const awsConfigured = Deno.env.get("AWS_ACCESS_KEY_ID") && Deno.env.get("AWS_SECRET_ACCESS_KEY");
      
      if (awsConfigured) {
        const startTime = Date.now();
        try {
          // Freemium: max 2 pages
          const maxPages = freemium_mode ? 2 : 10;
          // Add 90s timeout for Textract
          const textractResult = await withTimeout(
            extractWithTextract(uint8Array, mimeType, maxPages),
            TEXTRACT_TIMEOUT_MS,
            "AWS Textract did not return within 90s"
          );
          textractDebug = textractResult.textract_debug;
          
          providerCalls.push({
            provider: "textract",
            latency_ms: Date.now() - startTime,
            pages_used: textractResult.pages,
            success: true,
          });

          console.log("Textract extraction successful. Lines:", textractResult.blocks.length);
          console.log("Textract debug:", JSON.stringify(textractDebug));
          
          const textractTextLength = textractResult.text.length;
          const textractTableSignals = detectTableSignals(textractResult.text);
          pagesUsedList = [1]; // Sync API only does page 1
          textLengthByPage = [{ page: 1, length: textractTextLength }];
          
          const ocrDebug: OcrDebug = {
            ocr_provider: "textract",
            ocr_reason: ocrReason,
            sha256: fileHash,
            pages_total: textractResult.pages,
            pages_used: textractResult.pages,
            pages_used_list: pagesUsedList,
            text_length_total: textractTextLength,
            text_length_by_page: textLengthByPage,
            cache_hit: false,
            provider_calls: providerCalls,
          };
          
          finalResult = {
            raw_text: textractResult.text,
            blocks: textractResult.blocks,
            pages_count: textractResult.pages,
            quality_score: 0.9,
            provider: "textract",
            provider_calls: providerCalls,
            cache_hit: false,
            file_hash: fileHash,
            text_length: textractTextLength,
            contains_table_signals: textractTableSignals,
            ocr_reason: ocrReason,
            request_id: requestId,
            ocr_debug: ocrDebug,
            textract_debug: textractDebug,
            pages_used_list: pagesUsedList,
            text_length_by_page: textLengthByPage,
          };
        } catch (error) {
          console.error("Textract failed:", error);
          ocrReason = "textract_failed";
          providerCalls.push({
            provider: "textract",
            latency_ms: Date.now() - startTime,
            pages_used: 0,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      } else {
        ocrReason = "textract_not_configured";
      }
    }

    // STEP 4: Fallback to Gemini AI OCR ONLY if Textract failed
    if (!finalResult) {
      const startTime = Date.now();
      try {
        // Convert to base64
        const chunkSize = 8192;
        let binaryString = "";
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
          binaryString += String.fromCharCode(...chunk);
        }
        const base64Content = btoa(binaryString);

        const aiResult = await extractWithGeminiAI(base64Content, mimeType);
        
        providerCalls.push({
          provider: "gemini_ai",
          latency_ms: Date.now() - startTime,
          pages_used: 1,
          success: true,
        });

        console.log("Gemini AI extraction successful. Lines:", aiResult.blocks.length);
        
        const aiTextLength = aiResult.text.length;
        const aiTableSignals = detectTableSignals(aiResult.text);
        pagesUsedList = [1];
        textLengthByPage = [{ page: 1, length: aiTextLength }];
        
        ocrReason = ocrReason === "textract_failed" ? "textract_failed_gemini_fallback" : "gemini_fallback";

        const ocrDebug: OcrDebug = {
          ocr_provider: "gemini_ai",
          ocr_reason: ocrReason,
          sha256: fileHash,
          pages_total: 1,
          pages_used: 1,
          pages_used_list: pagesUsedList,
          text_length_total: aiTextLength,
          text_length_by_page: textLengthByPage,
          cache_hit: false,
          provider_calls: providerCalls,
        };

        finalResult = {
          raw_text: aiResult.text,
          blocks: aiResult.blocks,
          pages_count: 1,
          quality_score: 0.75,
          provider: "gemini_ai",
          provider_calls: providerCalls,
          cache_hit: false,
          file_hash: fileHash,
          text_length: aiTextLength,
          contains_table_signals: aiTableSignals,
          ocr_reason: ocrReason,
          request_id: requestId,
          ocr_debug: ocrDebug,
          textract_debug: null,
          pages_used_list: pagesUsedList,
          text_length_by_page: textLengthByPage,
        };
      } catch (error) {
        console.error("Gemini AI OCR failed:", error);
        providerCalls.push({
          provider: "gemini_ai",
          latency_ms: Date.now() - startTime,
          pages_used: 0,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // If all failed - record failure in DB
    if (!finalResult) {
      const errorCode = providerCalls.some(p => p.error?.includes("90s")) ? "OCR_TIMEOUT" : "OCR_FAILED";
      const errorMessage = providerCalls.some(p => p.error?.includes("90s")) 
        ? "AWS Textract did not return within 90s" 
        : "All extraction methods failed";
      
      // Store failure in document_extractions for tracking
      await supabase
        .from("document_extractions")
        .insert({
          file_hash: fileHash,
          file_path,
          analysis_id,
          provider: "failed",
          ocr_used: false,
          pages_used: 0,
          pages_count: 0,
          quality_score: 0,
          cache_hit: false,
          raw_text: null,
          blocks: null,
          provider_calls: providerCalls,
          text_length: 0,
          contains_table_signals: false,
          ocr_reason: errorCode,
          request_id: requestId,
          force_textract: shouldForce,
          ocr_debug: {
            ocr_provider: "failed",
            ocr_reason: errorCode,
            sha256: fileHash,
            error_code: errorCode,
            error_message: errorMessage,
            pages_total: 0,
            pages_used: 0,
            pages_used_list: [],
            text_length_total: 0,
            text_length_by_page: [],
            cache_hit: false,
            provider_calls: providerCalls,
          },
        });
      
      // Update analysis status to failed
      await supabase
        .from("analyses")
        .update({ 
          status: "failed", 
          error_message: errorMessage 
        })
        .eq("id", analysis_id);
      
      console.error(`=== EXTRACT-DOCUMENT FAILED ===`);
      console.error(`Error code: ${errorCode}`);
      console.error(`Request ID: ${requestId}`);
      
      return new Response(
        JSON.stringify({ 
          error: errorMessage,
          error_code: errorCode,
          request_id: requestId,
          provider_calls: providerCalls 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store in cache with all debug fields
    await supabase
      .from("document_extractions")
      .insert({
        file_hash: fileHash,
        file_path,
        analysis_id,
        provider: finalResult.provider,
        ocr_used: finalResult.provider !== "pdf_text",
        pages_used: finalResult.pages_count,
        pages_count: finalResult.pages_count,
        quality_score: finalResult.quality_score,
        cache_hit: false,
        raw_text: finalResult.raw_text,
        blocks: finalResult.blocks,
        provider_calls: providerCalls,
        text_length: finalResult.text_length,
        contains_table_signals: finalResult.contains_table_signals,
        ocr_reason: finalResult.ocr_reason,
        request_id: requestId,
        force_textract: shouldForce,
        pages_used_list: finalResult.pages_used_list,
        text_length_by_page: finalResult.text_length_by_page,
        textract_debug: textractDebug,
        ocr_debug: finalResult.ocr_debug,
      });

    console.log("=== EXTRACT-DOCUMENT COMPLETE ===");
    console.log("Request ID:", requestId);
    console.log("Provider:", finalResult.provider);
    console.log("Quality:", finalResult.quality_score);

    return new Response(
      JSON.stringify({
        success: true,
        cache_hit: false,
        request_id: requestId,
        data: finalResult,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const isTimeout = errorMessage.includes("90s");
    const errorCode = isTimeout ? "OCR_TIMEOUT" : "EXTRACTION_ERROR";
    
    console.error(`=== EXTRACT-DOCUMENT ERROR ===`);
    console.error(`Error: ${errorMessage}`);
    console.error(`Request ID: ${requestId}`);
    
    // Try to update analysis status to failed
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      const body = await req.clone().json().catch(() => ({}));
      if (body.analysis_id) {
        await supabase
          .from("analyses")
          .update({ status: "failed", error_message: errorMessage })
          .eq("id", body.analysis_id);
      }
    } catch (dbError) {
      console.error("Failed to update analysis status:", dbError);
    }
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        error_code: errorCode,
        request_id: requestId 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
