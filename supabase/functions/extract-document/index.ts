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
  provider: "pdf_text" | "textract" | "lovable_ai";
  provider_calls: ProviderCall[];
  cache_hit: boolean;
  file_hash: string;
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
  // Ensure we're passing an ArrayBuffer, not a SharedArrayBuffer
  const buffer = data.buffer instanceof ArrayBuffer ? data.buffer : new ArrayBuffer(data.byteLength);
  if (!(data.buffer instanceof ArrayBuffer)) {
    new Uint8Array(buffer).set(data);
  }
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============ HELPER: PDF TEXT EXTRACTION ============

async function extractPdfText(fileData: Uint8Array): Promise<{ text: string; quality: number }> {
  // Convert to string and look for text streams in PDF
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const pdfString = decoder.decode(fileData);
  
  // Extract text between stream/endstream markers
  const textMatches: string[] = [];
  
  // Look for BT...ET blocks (Begin Text / End Text)
  const btEtRegex = /BT\s*([\s\S]*?)\s*ET/g;
  let match;
  
  while ((match = btEtRegex.exec(pdfString)) !== null) {
    const textBlock = match[1];
    // Extract text from Tj and TJ operators
    const tjRegex = /\(([^)]*)\)\s*T[jJ]/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(textBlock)) !== null) {
      textMatches.push(tjMatch[1]);
    }
  }
  
  // Also try to extract FlateDecode streams (common in PDFs)
  // This is a simplified extraction - complex PDFs may need full parsing
  const textContent = textMatches.join(' ').replace(/\s+/g, ' ').trim();
  
  // Alternative: look for raw text patterns
  const rawTextPatterns = [
    // Common invoice/quote patterns
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
  
  // Calculate quality score
  const hasKeywords = /(?:HT|TVA|TTC|Total|DEVIS|FACTURE)/i.test(combinedText);
  const charCount = combinedText.length;
  const quality = charCount >= 800 && hasKeywords ? 0.7 : (charCount >= 400 ? 0.4 : 0.1);
  
  return { text: combinedText, quality };
}

// ============ HELPER: AWS TEXTRACT OCR ============

async function extractWithTextract(
  fileData: Uint8Array,
  mimeType: string,
  maxPages: number = 2
): Promise<{ text: string; blocks: TextBlock[]; pages: number }> {
  const awsAccessKey = Deno.env.get("AWS_ACCESS_KEY_ID");
  const awsSecretKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
  const awsRegion = Deno.env.get("AWS_REGION") || "eu-west-1";
  
  if (!awsAccessKey || !awsSecretKey) {
    throw new Error("AWS credentials not configured");
  }
  
  // Textract requires base64 encoded document
  const chunkSize = 8192;
  let binaryString = "";
  for (let i = 0; i < fileData.length; i += chunkSize) {
    const chunk = fileData.subarray(i, Math.min(i + chunkSize, fileData.length));
    binaryString += String.fromCharCode(...chunk);
  }
  const base64Content = btoa(binaryString);
  
  // Prepare Textract request
  const service = "textract";
  const host = `${service}.${awsRegion}.amazonaws.com`;
  const endpoint = `https://${host}`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);
  
  // For images, use DetectDocumentText (synchronous)
  // For PDFs with multiple pages, would need StartDocumentTextDetection (async)
  // For simplicity, using synchronous API which works for images and single-page PDFs
  const requestBody = JSON.stringify({
    Document: {
      Bytes: base64Content
    }
  });
  
  // Create AWS Signature V4
  const canonicalUri = "/";
  const canonicalQuerystring = "";
  const contentType = "application/x-amz-json-1.1";
  const amzTarget = "Textract.DetectDocumentText";
  
  // Create string to sign
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
  
  // Create signing key
  async function hmacSha256(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
    let keyBuffer: ArrayBuffer;
    if (key instanceof ArrayBuffer) {
      keyBuffer = key;
    } else {
      // Convert Uint8Array to a fresh ArrayBuffer to avoid SharedArrayBuffer issues
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
  
  // Make request
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
  
  // Parse Textract response
  const blocks: TextBlock[] = [];
  const textLines: string[] = [];
  
  for (const block of (result.Blocks || [])) {
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
  
  return {
    text: textLines.join('\n'),
    blocks,
    pages: 1 // Synchronous API only does 1 page
  };
}

// ============ HELPER: LOVABLE AI OCR FALLBACK ============

async function extractWithLovableAI(
  base64Content: string,
  mimeType: string
): Promise<{ text: string; blocks: TextBlock[] }> {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableApiKey) {
    throw new Error("LOVABLE_API_KEY not configured");
  }
  
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
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
    throw new Error(`Lovable AI error: ${response.status}`);
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

// ============ MAIN HANDLER ============

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { analysis_id, file_path, freemium_mode = true } = body;

    if (!analysis_id || !file_path) {
      return new Response(
        JSON.stringify({ error: "Missing analysis_id or file_path" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("=== EXTRACT-DOCUMENT START ===");
    console.log("Analysis ID:", analysis_id);
    console.log("File path:", file_path);

    // Download file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("devis")
      .download(file_path);

    if (downloadError || !fileData) {
      return new Response(
        JSON.stringify({ error: "File download failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Compute file hash for caching
    const fileHash = await computeFileHash(uint8Array);
    console.log("File hash:", fileHash);

    // Check cache
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
            file_hash: fileHash + "_" + analysis_id, // Unique per analysis
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
          });
      }

      return new Response(
        JSON.stringify({
          success: true,
          cache_hit: true,
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

    console.log("Cache miss. Extracting...");

    // Determine mime type
    let mimeType = "application/pdf";
    if (file_path.toLowerCase().endsWith(".png")) mimeType = "image/png";
    else if (file_path.toLowerCase().endsWith(".jpg") || file_path.toLowerCase().endsWith(".jpeg")) mimeType = "image/jpeg";
    else if (file_path.toLowerCase().endsWith(".webp")) mimeType = "image/webp";

    const providerCalls: ProviderCall[] = [];
    let finalResult: ExtractionResult | null = null;

    // STEP 1: Try PDF text extraction first (for PDFs only)
    if (mimeType === "application/pdf") {
      const startTime = Date.now();
      try {
        const pdfResult = await extractPdfText(uint8Array);
        providerCalls.push({
          provider: "pdf_text",
          latency_ms: Date.now() - startTime,
          pages_used: 1,
          success: true,
        });

        // Check if text is exploitable (>= 800 chars + keywords)
        if (pdfResult.quality >= 0.7) {
          console.log("PDF text extraction successful. Quality:", pdfResult.quality);
          finalResult = {
            raw_text: pdfResult.text,
            blocks: [{ text: pdfResult.text, block_type: "FULL_TEXT" }],
            pages_count: 1,
            quality_score: pdfResult.quality,
            provider: "pdf_text",
            provider_calls: providerCalls,
            cache_hit: false,
            file_hash: fileHash,
          };
        } else {
          console.log("PDF text quality too low:", pdfResult.quality, "Falling back to OCR.");
        }
      } catch (error) {
        console.error("PDF text extraction failed:", error);
        providerCalls.push({
          provider: "pdf_text",
          latency_ms: Date.now() - startTime,
          pages_used: 0,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // STEP 2: Try AWS Textract (if PDF text failed or for images)
    if (!finalResult) {
      const awsConfigured = Deno.env.get("AWS_ACCESS_KEY_ID") && Deno.env.get("AWS_SECRET_ACCESS_KEY");
      
      if (awsConfigured) {
        const startTime = Date.now();
        try {
          // Freemium: max 2 pages
          const maxPages = freemium_mode ? 2 : 10;
          const textractResult = await extractWithTextract(uint8Array, mimeType, maxPages);
          
          providerCalls.push({
            provider: "textract",
            latency_ms: Date.now() - startTime,
            pages_used: textractResult.pages,
            success: true,
          });

          console.log("Textract extraction successful. Lines:", textractResult.blocks.length);
          
          finalResult = {
            raw_text: textractResult.text,
            blocks: textractResult.blocks,
            pages_count: textractResult.pages,
            quality_score: 0.9,
            provider: "textract",
            provider_calls: providerCalls,
            cache_hit: false,
            file_hash: fileHash,
          };
        } catch (error) {
          console.error("Textract failed:", error);
          providerCalls.push({
            provider: "textract",
            latency_ms: Date.now() - startTime,
            pages_used: 0,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    }

    // STEP 3: Fallback to Lovable AI OCR
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

        const aiResult = await extractWithLovableAI(base64Content, mimeType);
        
        providerCalls.push({
          provider: "lovable_ai",
          latency_ms: Date.now() - startTime,
          pages_used: 1,
          success: true,
        });

        console.log("Lovable AI extraction successful. Lines:", aiResult.blocks.length);

        finalResult = {
          raw_text: aiResult.text,
          blocks: aiResult.blocks,
          pages_count: 1,
          quality_score: 0.75,
          provider: "lovable_ai",
          provider_calls: providerCalls,
          cache_hit: false,
          file_hash: fileHash,
        };
      } catch (error) {
        console.error("Lovable AI OCR failed:", error);
        providerCalls.push({
          provider: "lovable_ai",
          latency_ms: Date.now() - startTime,
          pages_used: 0,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // If all failed
    if (!finalResult) {
      return new Response(
        JSON.stringify({ 
          error: "All extraction methods failed",
          provider_calls: providerCalls 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store in cache
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
      });

    console.log("=== EXTRACT-DOCUMENT COMPLETE ===");
    console.log("Provider:", finalResult.provider);
    console.log("Quality:", finalResult.quality_score);

    return new Response(
      JSON.stringify({
        success: true,
        cache_hit: false,
        data: finalResult,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
