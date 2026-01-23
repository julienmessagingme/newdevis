import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Parser version for tracking
const PARSER_VERSION = "2.0.0";

// ============ TYPE DEFINITIONS ============

interface ParsedQuote {
  totals: {
    ht: number | null;
    tva: number | null;
    ttc: number | null;
  };
  payments: {
    methods: string[];
    deposit_pct: number | null;
    iban: string | null;
  };
  lines: ParsedLine[];
  work_categories: WorkCategory[];
  qty_ref: number | null;
  qty_unit: string | null;
  parsing_warnings: string[];
}

interface ParsedLine {
  label: string;
  qty: number | null;
  unit: string | null;
  unit_price_ht: number | null;
  total_ht: number | null;
  qty_raw?: string;
  unit_raw?: string;
}

interface WorkCategory {
  category_key: string;
  lines: ParsedLine[];
  total_ht: number;
  max_qty: number | null;
  max_qty_unit: string | null;
}

// ============ DEBUG TYPES ============

interface ParserDebug {
  parser_version: string;
  line_items_count: number;
  line_items_with_qty_count: number;
  line_items_with_unit_count: number;
  detected_units_set: string[];
  qty_parse_errors: string[];
  sample_lines: SampleLine[];
}

interface SampleLine {
  raw_line: string;
  description: string;
  qty_raw: string | null;
  qty_value: number | null;
  unit_raw: string | null;
  unit_normalized: string | null;
  unit_price: number | null;
  total_price: number | null;
}

interface QtyRefCandidate {
  value: number;
  unit: string;
  confidence: number;
  evidence_line_id: number | null;
  source: string;
}

interface QtyRefDebug {
  category_code: string | null;
  expected_unit_type: string | null;
  qty_ref_detected: boolean;
  qty_ref_type: string | null;
  qty_ref_value: number | null;
  qty_ref_source: string;
  qty_ref_candidates: QtyRefCandidate[];
  qty_ref_selection_rule: string | null;
  qty_ref_failure_reason: string | null;
}

// ============ HELPER: UNIT DETECTION ============

const UNIT_PATTERNS: Record<string, RegExp[]> = {
  "m²": [/(\d+[\s,.]?\d*)\s*m²/gi, /(\d+[\s,.]?\d*)\s*m2/gi, /(\d+[\s,.]?\d*)\s*mètres?\s*carrés?/gi],
  "ml": [/(\d+[\s,.]?\d*)\s*ml/gi, /(\d+[\s,.]?\d*)\s*m\.?l\.?/gi, /(\d+[\s,.]?\d*)\s*mètres?\s*linéaires?/gi],
  "unité": [/(\d+[\s,.]?\d*)\s*(?:u|unité|pièce|pce)/gi],
  "forfait": [/forfait/gi, /ens(?:emble)?/gi],
  "h": [/(\d+[\s,.]?\d*)\s*(?:h|heure)/gi],
  "jour": [/(\d+[\s,.]?\d*)\s*(?:j|jour)/gi],
};

interface UnitDetectionResult {
  unit: string | null;
  qty: number | null;
  unit_raw: string | null;
  qty_raw: string | null;
}

function detectUnit(text: string): UnitDetectionResult {
  const normalizedText = text.toLowerCase();
  
  for (const [unit, patterns] of Object.entries(UNIT_PATTERNS)) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(normalizedText);
      if (match) {
        if (unit === "forfait") {
          return { unit: "forfait", qty: 1, unit_raw: match[0], qty_raw: "1" };
        }
        const qtyStr = match[1];
        if (qtyStr) {
          const qty = parseFloat(qtyStr.replace(/\s/g, '').replace(',', '.'));
          if (!isNaN(qty) && qty > 0) {
            return { unit, qty, unit_raw: match[0], qty_raw: qtyStr };
          }
        }
      }
    }
  }
  
  return { unit: null, qty: null, unit_raw: null, qty_raw: null };
}

// ============ HELPER: PRICE EXTRACTION ============

const PRICE_PATTERNS = [
  /(\d{1,3}(?:[\s\u00a0]?\d{3})*[,\.]\d{2})\s*€/g,
  /€\s*(\d{1,3}(?:[\s\u00a0]?\d{3})*[,\.]\d{2})/g,
  /(\d{1,3}(?:[\s\u00a0]?\d{3})*[,\.]\d{2})\s*EUR/gi,
];

function extractPrice(text: string): number | null {
  for (const pattern of PRICE_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      const priceStr = match[1].replace(/[\s\u00a0]/g, '').replace(',', '.');
      const price = parseFloat(priceStr);
      if (!isNaN(price) && price > 0) {
        return price;
      }
    }
  }
  return null;
}

// ============ HELPER: TOTALS EXTRACTION ============

function extractTotals(text: string): { ht: number | null; tva: number | null; ttc: number | null } {
  const lines = text.split('\n');
  let ht: number | null = null;
  let tva: number | null = null;
  let ttc: number | null = null;
  
  for (const line of lines) {
    if (/total\s*(?:général\s*)?ttc|ttc\s*:?|net\s*à\s*payer/i.test(line)) {
      const price = extractPrice(line);
      if (price) ttc = price;
    }
    else if (/total\s*(?:général\s*)?ht|ht\s*:|montant\s*ht/i.test(line)) {
      const price = extractPrice(line);
      if (price) ht = price;
    }
    else if (/tva\s*(?:\d+\s*%)?|montant\s*tva/i.test(line)) {
      const price = extractPrice(line);
      if (price) tva = price;
    }
  }
  
  if (ht && tva && !ttc) {
    ttc = ht + tva;
  } else if (ht && ttc && !tva) {
    tva = ttc - ht;
  } else if (tva && ttc && !ht) {
    ht = ttc - tva;
  }
  
  return { ht, tva, ttc };
}

// ============ HELPER: PAYMENT EXTRACTION ============

function extractPayments(text: string): { methods: string[]; deposit_pct: number | null; iban: string | null } {
  const methods: string[] = [];
  let deposit_pct: number | null = null;
  let iban: string | null = null;
  
  if (/chèque|cheque/i.test(text)) methods.push("chèque");
  if (/espèces|espece/i.test(text)) methods.push("espèces");
  if (/virement/i.test(text)) methods.push("virement");
  if (/carte\s*(?:bancaire)?|cb/i.test(text)) methods.push("carte bancaire");
  
  const depositMatch = /acompte\s*(?:de\s*)?(\d+)\s*%/i.exec(text);
  if (depositMatch) {
    deposit_pct = parseInt(depositMatch[1], 10);
  }
  
  const ibanMatch = /([A-Z]{2}\d{2}(?:\s?\d{4}){5,6})/i.exec(text);
  if (ibanMatch) {
    iban = ibanMatch[1].replace(/\s/g, '').toUpperCase();
  }
  
  return { methods, deposit_pct, iban };
}

// ============ HELPER: LINE PARSING ============

interface ParseLineResult {
  lines: ParsedLine[];
  rawLines: string[];
  qtyParseErrors: string[];
}

function parseLines(text: string): ParseLineResult {
  const lines: ParsedLine[] = [];
  const rawLines: string[] = [];
  const qtyParseErrors: string[] = [];
  const textLines = text.split('\n');
  
  for (const textLine of textLines) {
    if (!textLine.trim() || textLine.trim().length < 10) continue;
    if (/^(?:désignation|description|libellé|quantité|prix|total|ht|ttc)/i.test(textLine.trim())) continue;
    
    const price = extractPrice(textLine);
    if (!price) continue;
    
    rawLines.push(textLine);
    
    const { unit, qty, unit_raw, qty_raw } = detectUnit(textLine);
    
    let label = textLine
      .replace(/(\d{1,3}(?:[\s\u00a0]?\d{3})*[,\.]\d{2})\s*€?/g, '')
      .replace(/\d+[\s,.]?\d*\s*(?:m²|m2|ml|u|unité|forfait|h|heure|j|jour)/gi, '')
      .trim();
    
    label = label.replace(/^\s*[-–•]\s*/, '').trim();
    
    if (label.length < 3) continue;
    
    // Track parsing errors
    if (qty === null && /\d/.test(textLine)) {
      qtyParseErrors.push(`Line "${textLine.substring(0, 50)}...": contains digits but qty not detected`);
    }
    
    const parsedLine: ParsedLine = {
      label,
      qty: qty,
      unit: unit,
      unit_price_ht: (qty && price && qty > 0) ? price / qty : null,
      total_ht: price,
      qty_raw: qty_raw || undefined,
      unit_raw: unit_raw || undefined,
    };
    
    lines.push(parsedLine);
  }
  
  return { lines, rawLines, qtyParseErrors };
}

// ============ HELPER: FIND MAX QUANTITY ============

interface MaxQtyResult {
  qty: number | null;
  unit: string | null;
  lineIndex: number | null;
}

function findMaxQuantity(lines: ParsedLine[], targetUnit: string): MaxQtyResult {
  let maxQty: number | null = null;
  let maxUnit: string | null = null;
  let lineIndex: number | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.unit === targetUnit && line.qty !== null) {
      if (maxQty === null || line.qty > maxQty) {
        maxQty = line.qty;
        maxUnit = line.unit;
        lineIndex = i;
      }
    }
  }
  
  return { qty: maxQty, unit: maxUnit, lineIndex };
}

// ============ HELPER: FIND SURFACE TOTALE TAG ============

interface SurfaceTotaleResult {
  qty: number | null;
  lineIndex: number | null;
}

function findSurfaceTotaleLine(lines: ParsedLine[]): SurfaceTotaleResult {
  const surfaceTotalPatterns = [
    /surface\s*totale/i,
    /total\s*(?:surface|m²|m2)/i,
    /superficie\s*totale/i,
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of surfaceTotalPatterns) {
      if (pattern.test(line.label) && line.unit === "m²" && line.qty !== null && line.qty > 1) {
        return { qty: line.qty, lineIndex: i };
      }
    }
  }
  
  const m2Lines = lines.map((l, idx) => ({ ...l, idx })).filter(l => l.unit === "m²" && l.qty !== null && l.qty > 1);
  if (m2Lines.length > 0) {
    const maxM2Line = m2Lines.reduce((max, line) => 
      (line.qty || 0) > (max.qty || 0) ? line : max
    );
    return { qty: maxM2Line.qty, lineIndex: maxM2Line.idx };
  }
  
  return { qty: null, lineIndex: null };
}

// ============ HELPER: FIND GLOBAL SURFACE FIELD ============

function findGlobalSurfaceField(text: string): number | null {
  const globalPatterns = [
    /surface\s*(?:totale\s*)?[:=]\s*(\d+[\s,.]?\d*)\s*m²/gi,
    /total\s*m²\s*[:=]?\s*(\d+[\s,.]?\d*)/gi,
    /superficie\s*[:=]\s*(\d+[\s,.]?\d*)\s*m²/gi,
    /(\d+[\s,.]?\d*)\s*m²\s*(?:au\s*)?total/gi,
    /surface\s*(?:à\s*traiter|concernée)\s*[:=]?\s*(\d+[\s,.]?\d*)\s*m²/gi,
  ];
  
  for (const pattern of globalPatterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      const qty = parseFloat(match[1].replace(/\s/g, '').replace(',', '.'));
      if (!isNaN(qty) && qty > 1) {
        return qty;
      }
    }
  }
  
  return null;
}

// ============ HELPER: SUM UNIT QUANTITIES ============

function sumUnitQuantities(lines: ParsedLine[], targetUnit: string): { sum: number | null; linesWithQty: number; totalLines: number } {
  const targetLines = lines.filter(l => l.unit === targetUnit);
  const linesWithQty = targetLines.filter(l => l.qty !== null && l.qty > 0);
  
  if (linesWithQty.length === 0) {
    return { sum: null, linesWithQty: 0, totalLines: targetLines.length };
  }
  
  const sum = linesWithQty.reduce((acc, line) => acc + (line.qty || 0), 0);
  return { sum, linesWithQty: linesWithQty.length, totalLines: targetLines.length };
}

// ============ MAIN PARSER ============

interface QtyRefResult {
  qty_ref: number | null;
  qty_unit: string | null;
  qty_source: "surface_totale_line" | "global_field" | "sum_units" | "max_m2" | "max_ml" | "not_found";
  qty_detected: boolean;
}

interface ParseResult {
  parsed: ParsedQuote;
  parserDebug: ParserDebug;
  qtyRefDebug: QtyRefDebug;
}

function parseQuote(rawText: string, blocks?: any[], categoryCode?: string): ParseResult {
  const warnings: string[] = [];
  const qtyRefCandidates: QtyRefCandidate[] = [];
  
  const text = rawText;
  
  // Extract totals
  const totals = extractTotals(text);
  if (!totals.ht && !totals.ttc) {
    warnings.push("Aucun montant total (HT ou TTC) n'a été détecté.");
  }
  
  // Extract payments
  const payments = extractPayments(text);
  
  // Parse lines with debug info
  const { lines, rawLines, qtyParseErrors } = parseLines(text);
  if (lines.length === 0) {
    warnings.push("Aucune ligne de devis détaillée n'a pu être extraite.");
  }
  
  // Count lines with missing quantities
  const linesWithoutQty = lines.filter(l => l.qty === null);
  if (linesWithoutQty.length > 0) {
    warnings.push(`${linesWithoutQty.length} ligne(s) sans quantité détectée.`);
  }
  
  // Build detected units set
  const detectedUnitsSet = [...new Set(lines.filter(l => l.unit).map(l => l.unit!))];
  
  // Build sample lines (max 10)
  const sampleLines: SampleLine[] = lines.slice(0, 10).map((line, idx) => ({
    raw_line: rawLines[idx] || "",
    description: line.label,
    qty_raw: line.qty_raw || null,
    qty_value: line.qty,
    unit_raw: line.unit_raw || null,
    unit_normalized: line.unit,
    unit_price: line.unit_price_ht,
    total_price: line.total_ht,
  }));
  
  // ====== RÈGLES STRICTES DE DÉTECTION qty_ref ======
  
  let qtyResult: QtyRefResult = {
    qty_ref: null,
    qty_unit: null,
    qty_source: "not_found",
    qty_detected: false,
  };
  
  let selectionRule: string | null = null;
  let failureReason: string | null = null;
  
  // ÉTAPE 1: Chercher une ligne explicitement taggée "surface_totale" (m²)
  const surfaceTotaleResult = findSurfaceTotaleLine(lines);
  if (surfaceTotaleResult.qty !== null && surfaceTotaleResult.qty > 1) {
    qtyRefCandidates.push({
      value: surfaceTotaleResult.qty,
      unit: "m²",
      confidence: 1.0,
      evidence_line_id: surfaceTotaleResult.lineIndex,
      source: "surface_totale_line",
    });
    qtyResult = {
      qty_ref: surfaceTotaleResult.qty,
      qty_unit: "m²",
      qty_source: "surface_totale_line",
      qty_detected: true,
    };
    selectionRule = "Picked explicit 'surface totale' tagged line";
  }
  
  // ÉTAPE 2: Sinon, chercher un champ global (ex: "Surface : 192 m²")
  if (qtyResult.qty_ref === null) {
    const globalSurface = findGlobalSurfaceField(text);
    if (globalSurface !== null && globalSurface > 1) {
      qtyRefCandidates.push({
        value: globalSurface,
        unit: "m²",
        confidence: 0.9,
        evidence_line_id: null,
        source: "global_field",
      });
      qtyResult = {
        qty_ref: globalSurface,
        qty_unit: "m²",
        qty_source: "global_field",
        qty_detected: true,
      };
      selectionRule = "Found global surface field in document text";
    }
  }
  
  // ÉTAPE 3a: Chercher le max m² dans les lignes
  if (qtyResult.qty_ref === null) {
    const maxM2 = findMaxQuantity(lines, "m²");
    if (maxM2.qty !== null && maxM2.qty > 1) {
      qtyRefCandidates.push({
        value: maxM2.qty,
        unit: "m²",
        confidence: 0.7,
        evidence_line_id: maxM2.lineIndex,
        source: "max_m2",
      });
      qtyResult = {
        qty_ref: maxM2.qty,
        qty_unit: "m²",
        qty_source: "max_m2",
        qty_detected: true,
      };
      selectionRule = "Picked largest m² quantity from line items";
    }
  }
  
  // ÉTAPE 3b: Sinon chercher le max ml
  if (qtyResult.qty_ref === null) {
    const maxMl = findMaxQuantity(lines, "ml");
    if (maxMl.qty !== null && maxMl.qty > 1) {
      qtyRefCandidates.push({
        value: maxMl.qty,
        unit: "ml",
        confidence: 0.7,
        evidence_line_id: maxMl.lineIndex,
        source: "max_ml",
      });
      qtyResult = {
        qty_ref: maxMl.qty,
        qty_unit: "ml",
        qty_source: "max_ml",
        qty_detected: true,
      };
      selectionRule = "Picked largest ml quantity from line items";
    }
  }
  
  // ÉTAPE 3c: Pour les unités (volets, PAC...), calculer sum(qty) si toutes les lignes ont qty_detected
  if (qtyResult.qty_ref === null) {
    const unitSum = sumUnitQuantities(lines, "unité");
    if (unitSum.sum !== null && unitSum.sum > 0 && unitSum.linesWithQty === unitSum.totalLines) {
      qtyRefCandidates.push({
        value: unitSum.sum,
        unit: "unité",
        confidence: 0.8,
        evidence_line_id: null,
        source: "sum_units",
      });
      qtyResult = {
        qty_ref: unitSum.sum,
        qty_unit: "unité",
        qty_source: "sum_units",
        qty_detected: true,
      };
      selectionRule = `Summed all unit quantities (${unitSum.linesWithQty} lines)`;
    } else if (unitSum.totalLines > 0 && unitSum.linesWithQty < unitSum.totalLines) {
      warnings.push(`Quantités partielles détectées pour les unités (${unitSum.linesWithQty}/${unitSum.totalLines}).`);
      failureReason = `Partial unit quantities: only ${unitSum.linesWithQty}/${unitSum.totalLines} lines have detected qty`;
    }
  }
  
  // RÈGLE ABSOLUE: si qty_ref <= 1 ou non détecté, considérer comme non fiable
  if (qtyResult.qty_ref !== null && qtyResult.qty_ref <= 1) {
    warnings.push("Surface/quantité de référence détectée <= 1. Considérée comme non fiable.");
    failureReason = `Detected qty_ref (${qtyResult.qty_ref}) is <= 1, considered unreliable`;
    qtyResult = {
      qty_ref: null,
      qty_unit: null,
      qty_source: "not_found",
      qty_detected: false,
    };
    selectionRule = null;
  }
  
  // Si pas de qty_ref trouvé, ajouter un warning explicite
  if (qtyResult.qty_ref === null) {
    warnings.push("Aucune quantité de référence fiable détectée. Saisie manuelle requise pour l'analyse de prix.");
    if (!failureReason) {
      failureReason = `No qty candidates found. Lines parsed: ${lines.length}, lines with qty: ${lines.filter(l => l.qty !== null).length}, units detected: [${detectedUnitsSet.join(', ')}]`;
    }
  }
  
  // Build parser debug
  const parserDebug: ParserDebug = {
    parser_version: PARSER_VERSION,
    line_items_count: lines.length,
    line_items_with_qty_count: lines.filter(l => l.qty !== null).length,
    line_items_with_unit_count: lines.filter(l => l.unit !== null).length,
    detected_units_set: detectedUnitsSet,
    qty_parse_errors: qtyParseErrors,
    sample_lines: sampleLines,
  };
  
  // Build qty_ref debug
  const qtyRefDebug: QtyRefDebug = {
    category_code: categoryCode || null,
    expected_unit_type: null, // Will be set by caller based on category
    qty_ref_detected: qtyResult.qty_detected,
    qty_ref_type: qtyResult.qty_unit,
    qty_ref_value: qtyResult.qty_ref,
    qty_ref_source: qtyResult.qty_source,
    qty_ref_candidates: qtyRefCandidates,
    qty_ref_selection_rule: selectionRule,
    qty_ref_failure_reason: failureReason,
  };
  
  const parsed: ParsedQuote = {
    totals,
    payments,
    lines,
    work_categories: [],
    qty_ref: qtyResult.qty_ref,
    qty_unit: qtyResult.qty_unit,
    parsing_warnings: warnings,
  };
  
  return { parsed, parserDebug, qtyRefDebug };
}

// ============ MAIN HANDLER ============

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Get request_id from body or generate new one
  let requestId: string | undefined;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { analysis_id, raw_text, blocks, category_code, request_id: incomingRequestId } = body;
    requestId = incomingRequestId || crypto.randomUUID();

    if (!analysis_id || !raw_text) {
      return new Response(
        JSON.stringify({ error: "Missing analysis_id or raw_text", request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("=== PARSE-QUOTE START ===");
    console.log("Request ID:", requestId);
    console.log("Analysis ID:", analysis_id);
    console.log("Text length:", raw_text.length);
    console.log("Category code:", category_code || "not specified");

    // Parse the quote with full debug info
    const { parsed, parserDebug, qtyRefDebug } = parseQuote(raw_text, blocks, category_code);

    console.log("Parsing complete:");
    console.log("- Parser version:", PARSER_VERSION);
    console.log("- Totals HT:", parsed.totals.ht);
    console.log("- Lines found:", parsed.lines.length);
    console.log("- Lines with qty:", parserDebug.line_items_with_qty_count);
    console.log("- Qty ref:", parsed.qty_ref, parsed.qty_unit);
    console.log("- Qty ref source:", qtyRefDebug.qty_ref_source);
    console.log("- Qty candidates:", qtyRefDebug.qty_ref_candidates.length);
    console.log("- Warnings:", parsed.parsing_warnings);

    if (qtyRefDebug.qty_ref_failure_reason) {
      console.log("⚠️ qty_ref_failure_reason:", qtyRefDebug.qty_ref_failure_reason);
    }

    // Update document_extractions with parsed data and debug
    const { error: updateError } = await supabase
      .from("document_extractions")
      .update({
        parsed_data: parsed,
        qty_ref_detected: parsed.qty_ref,
        qty_unit: parsed.qty_unit,
        parser_debug: parserDebug,
        qty_ref_debug: qtyRefDebug,
      })
      .eq("analysis_id", analysis_id);

    if (updateError) {
      console.error("Failed to update document_extractions:", updateError);
    }

    console.log("=== PARSE-QUOTE COMPLETE ===");

    return new Response(
      JSON.stringify({
        success: true,
        request_id: requestId,
        data: parsed,
        debug: {
          parser: parserDebug,
          qty_ref: qtyRefDebug,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        request_id: requestId 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
